import React, { memo } from 'react';
import { CopyIcon, DownloadIcon, ScissorsIcon, XIcon } from './canvasIcons';
import { rewriteImageUrlForBrowserDisplay } from '../services/canvasAssetResolver';
import { VideoContextMenu } from './VideoContextMenu';

export type CanvasFullscreenVideoModalProps = {
  videoUrl: string;
  fsContextMenu: { x: number; y: number } | null;
  setFsContextMenu: (v: { x: number; y: number } | null) => void;
  onClose: () => void;
  onDownload: () => void;
  onCopyVideo: () => void;
  onEdit?: () => void;
};

export const CanvasFullscreenVideoModal = memo(function CanvasFullscreenVideoModal({
  videoUrl,
  fsContextMenu,
  setFsContextMenu,
  onClose,
  onDownload,
  onCopyVideo,
  onEdit,
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
        className="absolute top-4 right-28 z-[101] flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        onPointerDown={(e) => {
          e.stopPropagation();
          onCopyVideo();
        }}
        title="复制视频到剪贴板"
      >
        <CopyIcon size={16} />
        复制
      </button>
      {onEdit ? (
        <button
          type="button"
          className="absolute top-4 right-[13.5rem] z-[101] flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          onPointerDown={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="编辑视频：截取片段或单帧"
        >
          <ScissorsIcon size={16} />
          编辑
        </button>
      ) : null}
      <button
        type="button"
        className={`absolute top-4 z-[101] rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 ${onEdit ? 'right-[20.5rem]' : 'right-52'}`}
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
          onEdit={onEdit ? () => {
            setFsContextMenu(null);
            onEdit();
          } : undefined}
          onClose={onClose}
          onDismiss={() => setFsContextMenu(null)}
        />
      ) : null}
    </div>
  );
});
