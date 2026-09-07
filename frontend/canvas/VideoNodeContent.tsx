import React, { useCallback, useRef, useState } from 'react';
import type { CanvasNode } from '../types';
import {
  AudioIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  LoaderIcon,
  MaximizeIcon,
  ScissorsIcon,
  SparklesIcon,
  VideoIcon,
} from './canvasIcons';
import { copyVideoSrcToClipboard, rewriteImageUrlForBrowserDisplay } from '../services/canvasAssetResolver';
import { GenerationHoloOverlay } from './GenerationHoloOverlay';
import { GenerationTimer } from './GenerationTimer';
import { VideoContextMenu } from './VideoContextMenu';
import { isVideoPreviewNode } from './spawnVideoPreviewNodes';

export interface VideoNodeContentProps {
  node: CanvasNode;
  isSelected: boolean;
  videoUrls: string[];
  currentVideoIdx: number;
  generationStartedAt?: number;
  eyedropperTargetNodeId: string | null;
  eyedropperTargetNodeIdRef: React.MutableRefObject<string | null>;
  nodesRef: React.MutableRefObject<CanvasNode[]>;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onCanvasEyedropper: (sourceId: string, targetId: string, opts?: { sourceImageIndex?: number }) => boolean;
  onDownloadVideo: (url: string) => void;
  onOpenFullscreenVideo: (url: string, sourceNodeId?: string) => void;
  onOpenVideoEdit: (url: string, sourceNodeId?: string) => void;
  onUpscaleVideo?: (nodeId: string) => void;
}

export function VideoNodeContent({
  node,
  isSelected,
  videoUrls,
  currentVideoIdx,
  generationStartedAt,
  eyedropperTargetNodeId,
  eyedropperTargetNodeIdRef,
  nodesRef,
  onUpdateNode,
  onCanvasEyedropper,
  onDownloadVideo,
  onOpenFullscreenVideo,
  onOpenVideoEdit,
  onUpscaleVideo,
}: VideoNodeContentProps) {
  const videoRootRef = useRef<HTMLDivElement>(null);
  const [previewMenu, setPreviewMenu] = useState<{ x: number; y: number } | null>(null);
  const isPreview = isVideoPreviewNode(node);
  const showChrome = isPreview || isSelected;

  const getVideoEl = () =>
    videoRootRef.current?.querySelector('video') as HTMLVideoElement | null;

  const currentUrl = videoUrls[currentVideoIdx];
  const displayUrl = currentUrl ? rewriteImageUrlForBrowserDisplay(currentUrl) : currentUrl;

  const openPreviewMenu = useCallback((e: React.MouseEvent) => {
    if (!currentUrl) return;
    e.preventDefault();
    e.stopPropagation();
    setPreviewMenu({ x: e.clientX, y: e.clientY });
  }, [currentUrl]);

  const copyCurrentVideo = useCallback(() => {
    if (!currentUrl) return;
    void copyVideoSrcToClipboard(currentUrl).then((mode) => {
      if (mode === 'link') {
        window.alert('当前浏览器不支持复制视频文件，已复制视频链接。');
      }
    }).catch((err) => {
      window.alert(err instanceof Error ? err.message : '复制视频失败');
    });
  }, [currentUrl]);

  const toolBtnClass = isPreview
    ? 'p-3 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg'
    : 'p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg';
  const toolIconSize = isPreview ? 28 : 40;

  return (
    <div
      className={`w-full relative overflow-hidden group ${
        isPreview
          ? 'flex-1 min-h-[320px] border-b border-[#333] bg-[#2a2a2a]'
          : isSelected
            ? 'h-[680px] shrink-0 border-b border-[#333] bg-[#2a2a2a]'
            : 'flex-1 min-h-0 border-b-0 bg-black'
      }`}
    >
      {node.isGenerating ? <GenerationHoloOverlay /> : null}
      {videoUrls.length > 0 ? (
        <>
          <div
            ref={videoRootRef}
            className="relative w-full h-full"
            onContextMenu={openPreviewMenu}
          >
            <video
              key={displayUrl || 'v'}
              src={displayUrl}
              controls={false}
              autoPlay={false}
              preload="auto"
              playsInline
              referrerPolicy="no-referrer"
              onContextMenu={openPreviewMenu}
              onLoadedMetadata={(e) => {
                const videoEl = e.currentTarget;
                if (videoEl.currentTime === 0 && Number.isFinite(videoEl.duration) && videoEl.duration > 0.05) {
                  videoEl.currentTime = 0.04;
                }
              }}
              onError={(e) => {
                const videoEl = e.target as HTMLVideoElement;
                const originalUrl = videoUrls[currentVideoIdx];
                if (originalUrl.includes('localhost')) {
                  videoEl.src = `${originalUrl}?t=${Date.now()}`;
                } else if (originalUrl.includes('localhost:3107')) {
                  const srcNode = nodesRef.current.find((n) => n.id === node.id);
                  if (srcNode?.originalVideoUrl) {
                    videoEl.src = srcNode.originalVideoUrl;
                  }
                }
              }}
              className={`w-full h-full object-contain bg-black ${showChrome ? '' : 'pointer-events-none'}`}
            />
            {showChrome ? (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100">
                {currentUrl?.includes('localhost:3107') || currentUrl?.startsWith('blob:') ? '本地' : '远程'}
              </div>
            ) : null}
          </div>
          {showChrome ? (
            <>
              <div
                className={`absolute top-2 right-2 z-10 flex gap-1 ${
                  isPreview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                } transition-opacity`}
              >
                {videoUrls.length > 1 && (
                  <>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = (currentVideoIdx - 1 + videoUrls.length) % videoUrls.length;
                        onUpdateNode(node.id, { currentVideoIndex: next });
                      }}
                      className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="上一条"
                    >
                      <ChevronLeftIcon size={20} />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = (currentVideoIdx + 1) % videoUrls.length;
                        onUpdateNode(node.id, { currentVideoIndex: next });
                      }}
                      className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="下一条"
                    >
                      <ChevronRightIcon size={20} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyCurrentVideo();
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                  title="复制视频"
                >
                  <CopyIcon size={20} />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (currentUrl) onDownloadVideo(currentUrl);
                  }}
                  className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                  title="下载视频"
                >
                  <DownloadIcon size={20} />
                </button>
              </div>
              <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/50 px-2 py-0.5 rounded">
                {currentVideoIdx + 1} / {videoUrls.length}
              </div>
              <div
                className={`absolute bottom-2 right-2 z-10 flex gap-2 ${
                  isPreview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                } transition-opacity`}
              >
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    const videoEl = getVideoEl();
                    if (!videoEl) return;
                    if (videoEl.paused) void videoEl.play();
                    else videoEl.pause();
                  }}
                  className={toolBtnClass}
                  title="播放/暂停"
                >
                  <VideoIcon size={toolIconSize} />
                </button>
                {isPreview && onUpscaleVideo ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpscaleVideo(node.id);
                    }}
                    className={toolBtnClass}
                    title="视频超分"
                  >
                    <SparklesIcon size={toolIconSize} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (currentUrl) onOpenVideoEdit(currentUrl, node.id);
                  }}
                  className={toolBtnClass}
                  title="视频剪辑"
                >
                  <ScissorsIcon size={toolIconSize} />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (currentUrl) onOpenFullscreenVideo(currentUrl, node.id);
                  }}
                  className={toolBtnClass}
                  title="最大化显示"
                >
                  <MaximizeIcon size={toolIconSize} />
                </button>
                {!isPreview ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const videoEl = getVideoEl();
                      if (videoEl) videoEl.muted = !videoEl.muted;
                    }}
                    className={toolBtnClass}
                    title="静音/取消静音"
                  >
                    <AudioIcon size={toolIconSize} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyCurrentVideo();
                  }}
                  className={toolBtnClass}
                  title="复制视频"
                >
                  <CopyIcon size={toolIconSize} />
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
          {eyedropperTargetNodeId && eyedropperTargetNodeId !== node.id ? (
            <div
              className="absolute inset-0 z-[1] cursor-crosshair bg-transparent"
              title="点击连接上游节点"
              onPointerDown={(e) => {
                e.stopPropagation();
                const t = eyedropperTargetNodeIdRef.current;
                if (t) onCanvasEyedropper(node.id, t);
              }}
            />
          ) : null}
          {node.isGenerating ? (
            <div className="relative z-[4] flex flex-col items-center gap-1.5 text-gray-400">
              <LoaderIcon size={24} />
              {generationStartedAt != null ? (
                <GenerationTimer
                  startedAt={generationStartedAt}
                  prefix="已用时"
                  className="text-xs tabular-nums tracking-tight"
                  showSeconds
                  secondsClassName="text-[10px] text-gray-500"
                />
              ) : null}
            </div>
          ) : (
            <span className="relative z-[2]">
              {isPreview ? '暂无视频' : '生成后在此预览（链接约 24 小时内有效）'}
            </span>
          )}
        </div>
      )}
      {previewMenu && currentUrl ? (
        <VideoContextMenu
          x={previewMenu.x}
          y={previewMenu.y}
          onCopy={() => {
            setPreviewMenu(null);
            copyCurrentVideo();
          }}
          onDownload={() => {
            setPreviewMenu(null);
            onDownloadVideo(currentUrl);
          }}
          onEdit={() => {
            setPreviewMenu(null);
            onOpenVideoEdit(currentUrl, node.id);
          }}
          onUpscale={
            isPreview && onUpscaleVideo
              ? () => {
                  setPreviewMenu(null);
                  onUpscaleVideo(node.id);
                }
              : undefined
          }
          onClose={() => setPreviewMenu(null)}
        />
      ) : null}
    </div>
  );
}
