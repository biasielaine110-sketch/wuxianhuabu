import React, { memo, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { probeImageDisplayMetadata } from '../services/canvasAssetResolver';
import {
  AnnotationIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from './canvasIcons';
import { fullscreenImageDisplaySrc } from './fullscreenImageUtils';

type FsImageInfoPanelProps = {
  imageSrc: string;
  onClose: () => void;
  onDownload: () => void;
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-white font-mono">{value}</div>
    </div>
  );
}

function FsImageInfoPanel({ imageSrc, onClose, onDownload }: FsImageInfoPanelProps) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [formatLabel, setFormatLabel] = useState('JPEG');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImgSize(null);
    setFileSize(0);

    void probeImageDisplayMetadata(imageSrc).then((meta) => {
      if (cancelled) return;
      if (meta) {
        if (meta.width > 0 && meta.height > 0) {
          setImgSize({ width: meta.width, height: meta.height });
        }
        setFileSize(meta.fileSize);
        setFormatLabel(meta.formatLabel);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const formatFileSize = (bytes: number) => {
    if (bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const aspectRatio =
    imgSize && imgSize.width > 0 && imgSize.height > 0
      ? (imgSize.width / imgSize.height).toFixed(2)
      : '—';
  const megapixels =
    imgSize && imgSize.width > 0 && imgSize.height > 0
      ? ((imgSize.width * imgSize.height) / 1_000_000).toFixed(2)
      : '—';

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-64 bg-[#1a1a1a]/95 backdrop-blur-md border-l border-[#333] flex flex-col z-20 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] shrink-0">
        <span className="text-white font-bold text-sm">图片信息</span>
        <div className="flex items-center">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="mr-[100px] flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
            title="下载图片"
          >
            <DownloadIcon size={14} />
            下载
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <InfoItem
          label="分辨率"
          value={imgSize ? `${imgSize.width} × ${imgSize.height}` : loading ? '加载中…' : '—'}
        />
        <InfoItem label="宽高比" value={aspectRatio} />
        <InfoItem label="像素" value={megapixels === '—' ? '—' : `${megapixels} MP`} />
        <InfoItem label="文件大小" value={formatFileSize(fileSize)} />
        <InfoItem label="格式" value={formatLabel} />
        <InfoItem label="颜色空间" value="sRGB" />
      </div>
    </div>
  );
}

export type CanvasFullscreenImageModalProps = {
  imageSrc: string;
  fsTransform: { scale: number; x: number; y: number };
  fsContextMenu: { x: number; y: number } | null;
  setFsContextMenu: (v: { x: number; y: number } | null) => void;
  activePointerTypeRef: MutableRefObject<'canvas' | 'node' | 'edge' | 'fullscreen' | null>;
  fullscreenNodeId: string | null;
  fullscreenImageIdx: number;
  imageTotal: number;
  onClose: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onImagePointerDown: (e: React.PointerEvent) => void;
  onNavigate: (dir: 1 | -1) => void;
  onDownload: () => void;
  onEditAsAnnotation: () => void;
};

export const CanvasFullscreenImageModal = memo(function CanvasFullscreenImageModal({
  imageSrc,
  fsTransform,
  fsContextMenu,
  setFsContextMenu,
  activePointerTypeRef,
  fullscreenNodeId,
  fullscreenImageIdx,
  imageTotal,
  onClose,
  onWheel,
  onImagePointerDown,
  onNavigate,
  onDownload,
  onEditAsAnnotation,
}: CanvasFullscreenImageModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center overflow-hidden backdrop-blur-sm"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        setFsContextMenu(null);
      }}
      onWheel={onWheel}
    >
      <div
        className="relative w-full h-full flex items-center justify-center"
        onPointerDown={(e) => {
          e.stopPropagation();
          onImagePointerDown(e);
        }}
      >
        <img
          src={fullscreenImageDisplaySrc(imageSrc)}
          className="max-w-[calc(100vw-18rem)] max-h-[90vh] object-contain shadow-2xl"
          style={{
            transform: `translate(${fsTransform.x}px, ${fsTransform.y}px) scale(${fsTransform.scale})`,
            cursor: activePointerTypeRef.current === 'fullscreen' ? 'grabbing' : 'grab',
            transition:
              activePointerTypeRef.current === 'fullscreen' ? 'none' : 'transform 0.1s ease-out',
          }}
          draggable={false}
          alt="Fullscreen"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFsContextMenu({ x: e.clientX, y: e.clientY });
          }}
        />
      </div>
      <FsImageInfoPanel imageSrc={imageSrc} onClose={onClose} onDownload={onDownload} />
      {fullscreenNodeId && imageTotal > 1 ? (
        <>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              onNavigate(-1);
            }}
            disabled={fullscreenImageIdx <= 0}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-20 rounded-full text-white transition-colors"
            title="上一张"
          >
            <ChevronLeftIcon size={28} />
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              onNavigate(1);
            }}
            disabled={fullscreenImageIdx >= imageTotal - 1}
            className="absolute right-[17rem] top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-20 rounded-full text-white transition-colors"
            title="下一张"
          >
            <ChevronRightIcon size={28} />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 rounded-full text-white text-sm backdrop-blur-sm">
            {fullscreenImageIdx + 1} / {imageTotal}
          </div>
        </>
      ) : null}
      {fsContextMenu ? (
        <div
          className="fixed z-[110] bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[140px] overflow-hidden"
          style={{ left: fsContextMenu.x, top: fsContextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-orange-600 hover:text-white flex items-center gap-2"
            onPointerDown={(e) => {
              e.stopPropagation();
              setFsContextMenu(null);
              onEditAsAnnotation();
            }}
          >
            <AnnotationIcon size={16} /> 编辑图片
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center gap-2"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDownload();
              setFsContextMenu(null);
            }}
          >
            <DownloadIcon size={16} /> 下载图片
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-red-600 hover:text-white flex items-center gap-2"
            onPointerDown={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <XIcon size={16} /> 关闭
          </button>
        </div>
      ) : null}
    </div>
  );
});
