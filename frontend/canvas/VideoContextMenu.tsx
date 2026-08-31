import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CopyIcon, DownloadIcon, XIcon } from './canvasIcons';

export function VideoContextMenu({
  x,
  y,
  onCopy,
  onDownload,
  onClose,
  onDismiss,
}: {
  x: number;
  y: number;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
  /** 点击菜单外：默认与 onClose 相同；全屏时只关菜单不关全屏 */
  onDismiss?: () => void;
}) {
  const dismiss = onDismiss ?? onClose;
  useEffect(() => {
    const onWinPointerDown = () => dismiss();
    window.addEventListener('pointerdown', onWinPointerDown);
    return () => window.removeEventListener('pointerdown', onWinPointerDown);
  }, [dismiss]);

  return createPortal(
    <div
      className="fixed z-[110] bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[140px] overflow-hidden"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-emerald-600 hover:text-white flex items-center gap-2"
        onPointerDown={(e) => {
          e.stopPropagation();
          onCopy();
        }}
      >
        <CopyIcon size={16} /> 复制视频
      </button>
      <button
        type="button"
        className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center gap-2"
        onPointerDown={(e) => {
          e.stopPropagation();
          onDownload();
        }}
      >
        <DownloadIcon size={16} /> 下载视频
      </button>
      <button
        type="button"
        className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-red-600 hover:text-white flex items-center gap-2"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <XIcon size={16} /> 关闭
      </button>
    </div>,
    document.body
  );
}
