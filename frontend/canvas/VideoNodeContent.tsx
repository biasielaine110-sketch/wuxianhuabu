import React, { useRef } from 'react';
import type { CanvasNode } from '../types';
import {
  AudioIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoaderIcon,
  MaximizeIcon,
  VideoIcon,
} from './canvasIcons';
import { GenerationHoloOverlay } from './GenerationHoloOverlay';
import { GenerationTimer } from './GenerationTimer';

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
}: VideoNodeContentProps) {
  const videoRootRef = useRef<HTMLDivElement>(null);

  const getVideoEl = () =>
    videoRootRef.current?.querySelector('video') as HTMLVideoElement | null;

  const currentUrl = videoUrls[currentVideoIdx];

  return (
    <div
      className={`w-full relative overflow-hidden group ${
        isSelected ? 'h-[680px] shrink-0 border-b border-[#333] bg-[#2a2a2a]' : 'flex-1 min-h-0 border-b-0 bg-black'
      }`}
    >
      {node.isGenerating ? <GenerationHoloOverlay /> : null}
      {videoUrls.length > 0 ? (
        <>
          <div ref={videoRootRef} className="relative w-full h-full">
            <video
              key={currentUrl || 'v'}
              src={currentUrl}
              controls={false}
              autoPlay={false}
              preload="auto"
              playsInline
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
              className={`w-full h-full object-contain bg-black ${isSelected ? '' : 'pointer-events-none'}`}
            />
            {isSelected ? (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100">
                {currentUrl?.includes('localhost:3107') ? '本地' : '远程'}
              </div>
            ) : null}
          </div>
          {isSelected ? (
            <>
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                if (currentUrl) onDownloadVideo(currentUrl);
              }}
              className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
              title="下载当前视频"
            >
              <DownloadIcon size={20} />
            </button>
          </div>
          <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/50 px-2 py-0.5 rounded">
            {currentVideoIdx + 1} / {videoUrls.length}
          </div>
          <div className="absolute bottom-2 right-2 z-10 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const videoEl = getVideoEl();
                if (!videoEl) return;
                if (videoEl.paused) videoEl.play();
                else videoEl.pause();
              }}
              className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
              title="播放/暂停"
            >
              <VideoIcon size={40} />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const videoEl = getVideoEl();
                videoEl?.requestFullscreen?.();
              }}
              className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
              title="最大化"
            >
              <MaximizeIcon size={40} />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const videoEl = getVideoEl();
                if (videoEl) videoEl.muted = !videoEl.muted;
              }}
              className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
              title="静音/取消静音"
            >
              <AudioIcon size={40} />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (currentUrl) onDownloadVideo(currentUrl);
              }}
              className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
              title="下载当前视频"
            >
              <DownloadIcon size={40} />
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
            <span className="relative z-[2]">生成后在此预览（链接约 24 小时内有效）</span>
          )}
        </div>
      )}
    </div>
  );
}
