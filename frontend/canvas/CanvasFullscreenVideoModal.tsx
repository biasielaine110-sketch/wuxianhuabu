import React, { memo } from 'react';
import { DownloadIcon, XIcon } from './canvasIcons';
import { rewriteImageUrlForBrowserDisplay } from '../services/canvasAssetResolver';
import { VideoContextMenu } from './VideoContextMenu';

export type CanvasFullscreenVideoModalProps = {
  videoUrl: string;
  fsContextMenu: { x: number; y: number } | null;
  setFsContextMenu: (v: { x: number; y: number } | null) => void;
  onClose: () => void;
  onDownload: () => void;
  onCopyVideo: () => void;
};

export const CanvasFullscreenVideoModal = memo(function CanvasFullscreenVideoModal({
  videoUrl,
  fsContextMenu,
  setFsContextMenu,
  onClose,
  onDownload,
  onCopyVideo,
}: CanvasFullscreenVideoModalProps) {
  const displayUrl = rewriteImageUrlForBrowserDisplay(videoUrl);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center overflow-hidden backdrop-blur-sm"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        setFsContextMenu(null);
      }}
    >
      <div
        className="relative max-w-[92vw] max-h-[90vh] flex items-center justify-center"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <video
          src={displayUrl}
          controls
          autoPlay
          playsInline
          referrerPolicy="no-referrer"
          className="max-w-[92vw] max-h-[90vh] object-contain shadow-2xl bg-black"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFsContextMenu({ x: e.clientX, y: e.clientY });
          }}
        />
      </div>
      <button
        type="button"
        className="absolute top-4 right-4 z-[101] flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        onPointerDown={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        title="下载视频"
      >
        <DownloadIcon size={16} />
        下载
      </button>
      <button
        type="button"
        className="absolute top-4 right-28 z-[101] rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="关闭"
      >
        <XIcon size={20} />
      </button>
      {fsContextMenu ? (
        <VideoContextMenu
          x={fsContextMenu.x}
          y={fsContextMenu.y}
          onCopy={() => {
            setFsContextMenu(null);
            onCopyVideo();
          }}
          onDownload={() => {
            setFsContextMenu(null);
            onDownload();
          }}
          onClose={onClose}
          onDismiss={() => setFsContextMenu(null)}
        />
      ) : null}
    </div>
  );
});
