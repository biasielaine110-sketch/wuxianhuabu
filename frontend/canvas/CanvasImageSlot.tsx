import React, { useEffect, useState } from 'react';
import { resolveCanvasImageSource } from '../services/canvasAssetResolver';

type CanvasImageSlotProps = {
  base64?: string;
  assetId?: string;
  className?: string;
  alt?: string;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  /** 占位最小高度 */
  minHeight?: number;
};

/** 支持 base64 或 IndexedDB assetId 的图片槽 */
export function CanvasImageSlot({
  base64,
  assetId,
  className,
  alt,
  onClick,
  onDoubleClick,
  draggable,
  minHeight = 48,
}: CanvasImageSlotProps) {
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hasInline = !!base64 && base64.length > 80;
    if (!hasInline && !assetId) {
      setSrc('');
      setLoading(false);
      return;
    }
    setLoading(true);
    void resolveCanvasImageSource(base64, assetId).then((url) => {
      if (cancelled) return;
      setSrc(url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [base64, assetId]);

  if (!src) {
    return (
      <div
        className={`bg-[#2a2a2a] flex items-center justify-center ${className ?? ''}`}
        style={{ minHeight }}
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={src}
      className={className}
      alt={alt}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      loading="lazy"
    />
  );
}
