import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, VideoIcon, XIcon } from './canvasIcons';
import { rewriteImageUrlForBrowserDisplay } from '../services/canvasAssetResolver';
import {
  captureVideoFrameAsPng,
  formatVideoClock,
  prepareVideoSrcForEdit,
  seekVideoElement,
} from '../services/videoEditExport';

const MIN_CLIP_SEC = 0.1;
const LOAD_TIMEOUT_MS = 120_000;

export type VideoClipJob = {
  sourceBlob: Blob;
  startSec: number;
  endSec: number;
  videoWidth: number;
  videoHeight: number;
  duration: number;
};

export type VideoEditModalProps = {
  videoUrl: string;
  busy?: boolean;
  onClose: () => void;
  onCaptureFrame: (pngDataUrl: string, timeSec: number) => void;
  onCaptureClip: (job: VideoClipJob) => void;
};

type DragKind = 'start' | 'end' | 'play' | 'range';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function syncDurationFromVideo(video: HTMLVideoElement): number {
  const d = video.duration;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export const VideoEditModal = memo(function VideoEditModal({
  videoUrl,
  busy = false,
  onClose,
  onCaptureFrame,
  onCaptureClip,
}: VideoEditModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragKindRef = useRef<DragKind | null>(null);
  const rangeOffsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const revokeSrcRef = useRef<(() => void) | null>(null);
  const startRef = useRef(0);
  const endRef = useRef(0);
  const durationRef = useRef(0);

  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(0);
  const [loadingSrc, setLoadingSrc] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSelection, setPlaySelection] = useState(false);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState<'frame' | 'clip' | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const locked = busy || exporting != null || loadingSrc;
  const canCapture = ready && !busy && exporting == null;

  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    endRef.current = end;
  }, [end]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    let cancelled = false;
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    revokeSrcRef.current?.();
    revokeSrcRef.current = null;

    setPlaybackSrc(null);
    setReady(false);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setCurrentTime(0);
    setPlaying(false);
    setPlaySelection(false);
    setError(null);
    setLoadingSrc(true);
    setLoadProgress(0);

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) ac.abort();
    }, LOAD_TIMEOUT_MS);

    void (async () => {
      try {
        const prepared = await prepareVideoSrcForEdit(videoUrl, {
          signal: ac.signal,
          rewriteUrl: rewriteImageUrlForBrowserDisplay,
          onProgress: (ratio) => {
            if (!cancelled) setLoadProgress(ratio);
          },
        });
        if (cancelled || ac.signal.aborted) {
          prepared.revoke();
          return;
        }
        revokeSrcRef.current = prepared.revoke;
        setPlaybackSrc(prepared.src);
        setLoadProgress(1);
        setLoadingSrc(false);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) {
          if (!cancelled) {
            setLoadingSrc(false);
            setError('视频加载超时或已取消。可关闭后重试，或先下载视频再拖入画布编辑。');
          }
          return;
        }
        if (cancelled) return;
        const fallback = rewriteImageUrlForBrowserDisplay(videoUrl);
        setPlaybackSrc(fallback);
        setLoadingSrc(false);
        setLoadProgress(null);
        setError(
          err instanceof Error
            ? `完整下载失败，已改用流式预览：${err.message}`
            : '完整下载失败，已改用流式预览',
        );
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      ac.abort();
      revokeSrcRef.current?.();
      revokeSrcRef.current = null;
    };
  }, [videoUrl]);

  const applyMetadata = useCallback((video: HTMLVideoElement) => {
    const next = syncDurationFromVideo(video);
    if (next > 0) {
      setDuration(next);
      setStart((prev) => (prev > 0 && prev < next ? prev : 0));
      setEnd((prev) => (prev > 0 && prev <= next ? prev : next));
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      setReady(true);
      setError((prev) => (prev && prev.startsWith('完整下载失败') ? prev : null));
      return;
    }
    if (video.readyState >= 1 || video.videoWidth > 0) {
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackSrc) return;
    video.load();
  }, [playbackSrc]);

  const seekTo = useCallback(async (time: number) => {
    const video = videoRef.current;
    const dur = durationRef.current;
    if (!video || dur <= 0) return;
    const next = clamp(time, 0, dur);
    setCurrentTime(next);
    try {
      await seekVideoElement(video, next);
    } catch {
      video.currentTime = next;
    }
  }, []);

  const timeFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    const dur = durationRef.current;
    if (!track || dur <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * dur;
  }, []);

  const applyDrag = useCallback((clientX: number) => {
    const kind = dragKindRef.current;
    const dur = durationRef.current;
    if (!kind || dur <= 0) return;
    const t = timeFromClientX(clientX);
    const curStart = startRef.current;
    const curEnd = endRef.current;
    if (kind === 'start') {
      setStart(clamp(t, 0, Math.max(0, curEnd - MIN_CLIP_SEC)));
    } else if (kind === 'end') {
      setEnd(clamp(t, Math.min(dur, curStart + MIN_CLIP_SEC), dur));
    } else if (kind === 'play') {
      void seekTo(t);
    } else {
      const span = Math.max(MIN_CLIP_SEC, curEnd - curStart);
      const nextStart = clamp(t - rangeOffsetRef.current, 0, dur - span);
      setStart(nextStart);
      setEnd(nextStart + span);
    }
  }, [seekTo, timeFromClientX]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragKindRef.current) return;
      e.preventDefault();
      applyDrag(e.clientX);
    };
    const onUp = () => {
      dragKindRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [applyDrag]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playSelection) return;
    if (video.currentTime >= end - 0.03) {
      video.pause();
      setPlaying(false);
      setPlaySelection(false);
    }
  }, [currentTime, end, playSelection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (exporting) {
          abortRef.current?.abort();
          return;
        }
        if (loadingSrc) {
          loadAbortRef.current?.abort();
          return;
        }
        onClose();
        return;
      }
      if (locked) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
          void video.play().then(() => setPlaying(true)).catch(() => undefined);
        } else {
          video.pause();
          setPlaying(false);
          setPlaySelection(false);
        }
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setStart(clamp(currentTime, 0, Math.max(0, end - MIN_CLIP_SEC)));
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setEnd(clamp(currentTime, Math.min(duration, start + MIN_CLIP_SEC), duration));
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 1;
        void seekTo(currentTime + (e.key === 'ArrowRight' ? step : -step));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [currentTime, duration, end, exporting, loadingSrc, locked, onClose, seekTo, start]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      loadAbortRef.current?.abort();
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || locked || !ready) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch((err) => {
        setError(err instanceof Error ? err.message : '无法播放视频');
      });
    } else {
      video.pause();
      setPlaying(false);
      setPlaySelection(false);
    }
  }, [locked, ready]);

  const playSelectedRange = useCallback(() => {
    if (locked || !ready) return;
    void seekTo(start).then(() => {
      const video = videoRef.current;
      if (!video) return;
      setPlaySelection(true);
      void video.play().then(() => setPlaying(true)).catch((err) => {
        setError(err instanceof Error ? err.message : '无法播放选区');
      });
    });
  }, [locked, ready, seekTo, start]);

  const handleCaptureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !canCapture) return;
    setError(null);
    setExporting('frame');
    try {
      await seekVideoElement(video, currentTime);
      const png = captureVideoFrameAsPng(video);
      onCaptureFrame(png, currentTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : '截取当前帧失败');
    } finally {
      setExporting(null);
    }
  }, [canCapture, currentTime, onCaptureFrame]);

  const handleCaptureClip = useCallback(async () => {
    const video = videoRef.current;
    const src = (playbackSrc || video?.currentSrc || video?.src || '').trim();
    if (!video || !src || !canCapture) return;
    if (end - start < MIN_CLIP_SEC) {
      setError('请选择至少 0.1 秒的片段');
      return;
    }
    setError(null);
    setProgress(0);
    setExporting('clip');
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let handedOff = false;
    try {
      const res = await fetch(src, { signal: ac.signal });
      if (!res.ok) throw new Error(`读取视频失败 (${res.status})`);
      const sourceBlob = await res.blob();
      if (!sourceBlob.size) throw new Error('视频数据为空，无法截取');
      handedOff = true;
      onCaptureClip({
        sourceBlob,
        startSec: start,
        endSec: end,
        videoWidth: video.videoWidth || 1280,
        videoHeight: video.videoHeight || 720,
        duration: durationRef.current || video.duration || 0,
      });
    } catch (err) {
      if (handedOff) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('已取消截取');
      } else {
        setError(err instanceof Error ? err.message : '截取片段失败');
      }
    } finally {
      if (handedOff) return;
      setExporting(null);
      setProgress(0);
      setPlaying(false);
      setPlaySelection(false);
    }
  }, [canCapture, end, onCaptureClip, playbackSrc, start]);

  const beginDrag = (kind: DragKind, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked || durationRef.current <= 0) return;
    dragKindRef.current = kind;
    if (kind === 'range') {
      rangeOffsetRef.current = timeFromClientX(e.clientX) - startRef.current;
    } else if (kind === 'play') {
      void seekTo(timeFromClientX(e.clientX));
    }
  };

  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 0;
  const playPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const clipLen = Math.max(0, end - start);
  const loadPctLabel =
    loadProgress == null ? '下载中…' : `下载中 ${Math.round(loadProgress * 100)}%`;

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/88 backdrop-blur-sm"
      style={{ zIndex: 10000 }}
      data-video-edit-modal="true"
      onPointerDown={(e) => {
        if (loadingSrc) return;
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="relative flex max-h-[94vh] w-[min(1120px,94vw)] flex-col overflow-hidden rounded-2xl border border-[#333] bg-[#161616] shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#2e2e2e] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">视频编辑</h2>
            <p className="mt-0.5 text-xs text-gray-400">点「截取片段」会立刻在画布创建预览窗口，再把选中片段加载进去</p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              loadAbortRef.current?.abort();
              onClose();
            }}
            title="关闭"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black px-4 py-3">
          {playbackSrc ? (
            <video
              ref={videoRef}
              src={playbackSrc}
              controls={false}
              playsInline
              preload="auto"
              className="max-h-[56vh] max-w-full bg-black object-contain"
              onLoadedMetadata={(e) => applyMetadata(e.currentTarget)}
              onLoadedData={(e) => applyMetadata(e.currentTarget)}
              onDurationChange={(e) => applyMetadata(e.currentTarget)}
              onCanPlay={(e) => applyMetadata(e.currentTarget)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => {
                setReady(false);
                setError('视频解码失败，请换一个文件或先下载后再拖入画布编辑');
              }}
            />
          ) : null}
          {loadingSrc ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/55 text-sm text-white">
              <span>{loadPctLabel}</span>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
                  style={{
                    width:
                      loadProgress == null
                        ? '40%'
                        : `${Math.max(4, Math.round(loadProgress * 100))}%`,
                  }}
                />
              </div>
              <p className="max-w-sm px-4 text-center text-xs text-gray-300">
                远程视频会先下载到本地再编辑，便于截帧和截取片段
              </p>
              <button
                type="button"
                className="rounded-md bg-white/15 px-3 py-1.5 text-xs hover:bg-white/25"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  loadAbortRef.current?.abort();
                }}
              >
                取消下载
              </button>
            </div>
          ) : null}
          {!loadingSrc && playbackSrc && !ready && !error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-gray-300">
              解析视频信息…
            </div>
          ) : null}
          {exporting === 'clip' ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm text-white">
              <span>正在截取片段… {Math.round(progress * 100)}%</span>
              <button
                type="button"
                className="rounded-md bg-white/15 px-3 py-1.5 text-xs hover:bg-white/25"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  abortRef.current?.abort();
                }}
              >
                取消
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-[#2e2e2e] px-5 py-4">
          <div
            ref={trackRef}
            className="relative h-8 cursor-pointer select-none touch-none"
            onPointerDown={(e) => {
              if (locked || duration <= 0) return;
              const t = timeFromClientX(e.clientX);
              if (t >= start && t <= end) beginDrag('range', e);
              else beginDrag('play', e);
            }}
          >
            <div className="absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded-full bg-[#333]" />
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-emerald-500/70"
              style={{ left: `${startPct}%`, width: `${Math.max(0.6, endPct - startPct)}%` }}
            />
            <div
              className="pointer-events-none absolute top-0 z-[2] h-full w-0.5 bg-white"
              style={{ left: `${playPct}%` }}
            />
            <div
              role="slider"
              aria-label="入点"
              className="absolute top-1/2 z-[3] h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-emerald-500"
              style={{ left: `${startPct}%` }}
              onPointerDown={(e) => beginDrag('start', e)}
            />
            <div
              role="slider"
              aria-label="出点"
              className="absolute top-1/2 z-[3] h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-emerald-500"
              style={{ left: `${endPct}%` }}
              onPointerDown={(e) => beginDrag('end', e)}
            />
            <div
              role="slider"
              aria-label="播放头"
              className="absolute top-1/2 z-[4] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-black bg-white"
              style={{ left: `${playPct}%` }}
              onPointerDown={(e) => beginDrag('play', e)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-300">
            <label className="flex items-center gap-1.5">
              入点
              <input
                type="number"
                min={0}
                max={duration || 0}
                step={0.01}
                disabled={locked || !ready}
                value={Number(start.toFixed(2))}
                onChange={(e) => setStart(clamp(Number(e.target.value) || 0, 0, Math.max(0, end - MIN_CLIP_SEC)))}
                className="w-24 rounded border border-[#444] bg-[#222] px-2 py-1 text-white"
              />
              <span className="text-gray-500">{formatVideoClock(start)}</span>
            </label>
            <label className="flex items-center gap-1.5">
              出点
              <input
                type="number"
                min={0}
                max={duration || 0}
                step={0.01}
                disabled={locked || !ready}
                value={Number(end.toFixed(2))}
                onChange={(e) => setEnd(clamp(Number(e.target.value) || 0, Math.min(duration, start + MIN_CLIP_SEC), duration))}
                className="w-24 rounded border border-[#444] bg-[#222] px-2 py-1 text-white"
              />
              <span className="text-gray-500">{formatVideoClock(end)}</span>
            </label>
            <span>当前 {formatVideoClock(currentTime)}</span>
            <span>片段 {formatVideoClock(clipLen)}</span>
            <span className="text-gray-500">空格播放 · I 入点 · O 出点</span>
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!ready || locked}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-40"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlay();
              }}
            >
              {playing ? '暂停' : '播放'}
            </button>
            <button
              type="button"
              disabled={!ready || locked}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-40"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                playSelectedRange();
              }}
            >
              播放选区
            </button>
            <button
              type="button"
              disabled={!ready || locked}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-40"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!ready || locked) return;
                setStart(clamp(currentTime, 0, Math.max(0, end - MIN_CLIP_SEC)));
              }}
            >
              设为入点
            </button>
            <button
              type="button"
              disabled={!ready || locked}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-40"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!ready || locked) return;
                setEnd(clamp(currentTime, Math.min(duration, start + MIN_CLIP_SEC), duration));
              }}
            >
              设为出点
            </button>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canCapture}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleCaptureFrame();
                }}
              >
                <ImageIcon size={15} />
                {exporting === 'frame' ? '截取中…' : '截取当前帧'}
              </button>
              <button
                type="button"
                disabled={!canCapture}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleCaptureClip();
                }}
              >
                <VideoIcon size={15} />
                {exporting === 'clip' ? '截取中…' : '截取片段'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
});
