import React, { useEffect, useRef, useState } from 'react';
import { OptimizedImage } from './OptimizedImage';

/** 响应式图片预览：根据容器尺寸自动缩放，支持视口外占位 */
export function ResponsiveImagePreview({
  base64,
  assetId,
  className,
  alt,
  quality = 0.62,
  onClick,
  onDoubleClick,
  draggable = false,
  fill = 'contain',
  isInViewport = true,
}: {
  base64?: string;
  assetId?: string;
  className?: string;
  alt?: string;
  quality?: number;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  fill?: 'contain' | 'cover';
  isInViewport?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const maxSide = Math.max(dimensions.width, dimensions.height, 100);
  const hasSource = (!!base64 && base64.length > 80) || !!assetId;

  if (!isInViewport || !hasSource) {
    return (
      <div
        ref={containerRef}
        className={`w-full h-full bg-[#2a2a2a] ${className || ''}`}
      />
    );
  }

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`}>
      <OptimizedImage
        base64={base64}
        assetId={assetId}
        maxSide={maxSide}
        quality={quality}
        className={`w-full h-full object-${fill}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        draggable={draggable}
        alt={alt}
      />
    </div>
  );
}
