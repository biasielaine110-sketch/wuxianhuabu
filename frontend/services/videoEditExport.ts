import { resolveVideoBlobMime } from './videoFileUtils';

const MIN_CLIP_SEC = 0.1;

export function formatVideoClock(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** 编辑窗用：本地/远程视频统一成可即时 seek 的 blob URL（远程走同源代理整文件拉取） */
export async function prepareVideoSrcForEdit(
  videoUrl: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (ratio: number | null) => void;
    rewriteUrl?: (url: string) => string;
  },
): Promise<{ src: string; revoke: () => void }> {
  const t = (videoUrl || '').trim();
  if (!t) throw new Error('视频地址为空');

  const noopRevoke = () => undefined;
  if (t.startsWith('blob:') || t.startsWith('data:')) {
    options?.onProgress?.(1);
    return { src: t, revoke: noopRevoke };
  }

  const fetchUrl = options?.rewriteUrl ? options.rewriteUrl(t) : t;
  const res = await fetch(fetchUrl, {
    mode: 'cors',
    credentials: 'omit',
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`视频下载失败 (${res.status})`);

  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body) {
    const raw = await res.blob();
    const mime = resolveVideoBlobMime(raw.type || res.headers.get('content-type'), t);
    const blob = raw.type === mime ? raw : new Blob([raw], { type: mime });
    options?.onProgress?.(1);
    const src = URL.createObjectURL(blob);
    return { src, revoke: () => URL.revokeObjectURL(src) };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      if (total > 0) options?.onProgress?.(Math.min(0.99, received / total));
      else options?.onProgress?.(null);
    }
  }

  const mime = resolveVideoBlobMime(res.headers.get('content-type'), t);
  const blob = new Blob(chunks as BlobPart[], { type: mime });
  if (!blob.size) throw new Error('视频下载结果为空');
  options?.onProgress?.(1);
  const src = URL.createObjectURL(blob);
  return { src, revoke: () => URL.revokeObjectURL(src) };
}

export function seekVideoElement(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = Number.isFinite(video.duration) ? video.duration : time;
    const target = Math.min(Math.max(0, time), Math.max(0, duration));
    if (Math.abs(video.currentTime - target) < 0.01) {
      resolve();
      return;
    }
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('视频跳转失败'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = target;
  });
}

export function captureVideoFrameAsPng(video: HTMLVideoElement): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('视频尚未加载完成，无法截取画面');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(video, 0, 0, w, h);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error('无法截取画面：视频来源不允许跨域读取。请先下载视频，再拖入画布后编辑。');
  }
}

function getCaptureStream(video: HTMLVideoElement): MediaStream | null {
  const anyVideo = video as HTMLVideoElement & {
    captureStream?: (frameRate?: number) => MediaStream;
    webkitCaptureStream?: (frameRate?: number) => MediaStream;
  };
  const capture = anyVideo.captureStream || anyVideo.webkitCaptureStream;
  if (!capture) return null;
  return capture.call(video);
}

function pickRecorderMime(hasAudio: boolean): string {
  const candidates = hasAudio
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
    : [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

function waitForVideoMetadata(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('无法加载用于截取的视频'));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const timer = window.setTimeout(() => onError(), 20_000);
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) onAbort();
  });
}

function makeRecorderVideo(src: string, width: number, height: number): HTMLVideoElement {
  const rec = document.createElement('video');
  rec.muted = true;
  rec.defaultMuted = true;
  rec.volume = 0;
  rec.playsInline = true;
  rec.preload = 'auto';
  rec.controls = false;
  rec.crossOrigin = 'anonymous';
  rec.setAttribute('playsinline', 'true');
  rec.setAttribute('muted', 'true');
  rec.width = Math.max(16, width);
  rec.height = Math.max(16, height);
  rec.style.cssText =
    'position:fixed;left:-10000px;top:0;width:' +
    Math.max(16, width) +
    'px;height:' +
    Math.max(16, height) +
    'px;opacity:0;pointer-events:none;z-index:-1;';
  rec.src = src;
  document.body.appendChild(rec);
  rec.load();
  return rec;
}

function stopStreamTracks(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

/** 从已下载的视频源截取时间段，画布抓帧录制，不依赖编辑窗里的 <video> */
export async function captureVideoClipFromSrc(
  src: string,
  startSec: number,
  endSec: number,
  options?: {
    signal?: AbortSignal;
    onProgress?: (ratio: number) => void;
    videoWidth?: number;
    videoHeight?: number;
    duration?: number;
  },
): Promise<Blob> {
  const tsrc = (src || '').trim();
  if (!tsrc) throw new Error('视频地址为空，无法截取片段');
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持截取片段，请使用 Chrome 或 Edge');
  }

  const signal = options?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  const rec = makeRecorderVideo(tsrc, options?.videoWidth || 1280, options?.videoHeight || 720);
  let canvasStream: MediaStream | null = null;
  let drawRaf = 0;

  try {
    await waitForVideoMetadata(rec, signal);
    throwIfAborted();
    const durationHint = options?.duration || 0;
    const duration = Number.isFinite(rec.duration) && rec.duration > 0 ? rec.duration : durationHint;
    const start = Math.min(Math.max(0, startSec), Math.max(0, duration || startSec));
    const clipEnd = Math.min(Math.max(start + MIN_CLIP_SEC, endSec), duration || endSec);
    if (clipEnd - start < MIN_CLIP_SEC) {
      throw new Error('请选择至少 0.1 秒的片段');
    }

    rec.playbackRate = 1;
    await seekVideoElement(rec, start);
    throwIfAborted();

    const w = Math.max(16, rec.videoWidth || options?.videoWidth || 1280);
    const h = Math.max(16, rec.videoHeight || options?.videoHeight || 720);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('无法创建画布，截取片段失败');
    ctx.drawImage(rec, 0, 0, w, h);

    const canvasEl = canvas as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    if (typeof canvasEl.captureStream !== 'function') {
      throw new Error('当前浏览器不支持截取片段，请使用 Chrome 或 Edge');
    }
    canvasStream = canvasEl.captureStream(30);
    const vstream = getCaptureStream(rec);
    vstream?.getAudioTracks().forEach((track) => {
      try {
        canvasStream?.addTrack(track);
      } catch {
        /* ignore */
      }
    });

    const hasAudio = canvasStream.getAudioTracks().some((track) => track.readyState === 'live');
    const mime = pickRecorderMime(hasAudio);
    const chunks: BlobPart[] = [];
    const recorder = mime
      ? new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
      : new MediaRecorder(canvasStream);

    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('片段录制失败'));
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      };
    });

    recorder.start(100);

    const drawFrame = () => {
      try {
        ctx.drawImage(rec, 0, 0, w, h);
      } catch {
        /* 解码瞬时失败时跳过该帧 */
      }
    };

    let played = false;
    try {
      await rec.play();
      played = true;
    } catch {
      played = false;
    }
    throwIfAborted();

    if (played) {
      await new Promise<void>((resolve, reject) => {
        const finish = (err?: Error) => {
          cancelAnimationFrame(drawRaf);
          rec.removeEventListener('ended', onEnded);
          signal?.removeEventListener('abort', onAbort);
          if (err) reject(err);
          else resolve();
        };
        const onAbort = () => finish(new DOMException('Aborted', 'AbortError'));
        const onEnded = () => {
          rec.pause();
          finish();
        };
        const tick = () => {
          if (signal?.aborted) {
            finish(new DOMException('Aborted', 'AbortError'));
            return;
          }
          drawFrame();
          const t = rec.currentTime;
          const span = clipEnd - start;
          options?.onProgress?.(span > 0 ? Math.min(1, Math.max(0, (t - start) / span)) : 1);
          if (t >= clipEnd - 0.03 || rec.ended) {
            rec.pause();
            drawFrame();
            finish();
            return;
          }
          drawRaf = requestAnimationFrame(tick);
        };
        rec.addEventListener('ended', onEnded);
        signal?.addEventListener('abort', onAbort);
        drawRaf = requestAnimationFrame(tick);
      }).catch((err) => {
        if (recorder.state === 'recording') recorder.stop();
        throw err;
      });
    } else {
      const fps = 20;
      const step = 1 / fps;
      for (let t = start; t < clipEnd; t += step) {
        throwIfAborted();
        await seekVideoElement(rec, Math.min(t, clipEnd));
        drawFrame();
        const span = clipEnd - start;
        options?.onProgress?.(span > 0 ? Math.min(1, Math.max(0, (t - start) / span)) : 1);
        await new Promise((r) => window.setTimeout(r, Math.round(1000 / fps)));
      }
      await seekVideoElement(rec, clipEnd);
      drawFrame();
      options?.onProgress?.(1);
    }

    if (recorder.state === 'recording') {
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      recorder.stop();
    }
    const blob = await recorded;
    if (!blob.size) throw new Error('截取结果为空，请换一段时间再试');
    const mimeOut = (blob.type || 'video/webm').split(';')[0].trim() || 'video/webm';
    return blob.type === mimeOut ? blob : new Blob([blob], { type: mimeOut });
  } finally {
    cancelAnimationFrame(drawRaf);
    rec.pause();
    rec.removeAttribute('src');
    rec.load();
    rec.remove();
    stopStreamTracks(canvasStream);
  }
}

export async function captureVideoClipAsBlob(
  video: HTMLVideoElement,
  startSec: number,
  endSec: number,
  options?: { signal?: AbortSignal; onProgress?: (ratio: number) => void },
): Promise<Blob> {
  const src = (video.currentSrc || video.src || '').trim();
  return captureVideoClipFromSrc(src, startSec, endSec, {
    ...options,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    duration: Number.isFinite(video.duration) ? video.duration : undefined,
  });
}
