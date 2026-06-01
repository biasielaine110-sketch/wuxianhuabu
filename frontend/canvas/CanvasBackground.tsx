import React, { memo, useLayoutEffect } from 'react';
import { useCanvasStore } from '../stores/canvasStore';

type CanvasBackgroundProps = {
  canvasBgRef: React.RefObject<HTMLDivElement | null>;
  canvasBgStyle: 'dots' | 'grid' | 'none';
  canvasBgColor: 'dark' | 'black';
};

/** 仅订阅 transform；平移/缩放位置由 DOM 直写 + store 提交后 useLayoutEffect 同步 */
export const CanvasBackground = memo(function CanvasBackground({
  canvasBgRef,
  canvasBgStyle,
  canvasBgColor,
}: CanvasBackgroundProps) {
  const transform = useCanvasStore((s) => s.transform);

  useLayoutEffect(() => {
    const bg = canvasBgRef.current;
    if (!bg) return;
    if (canvasBgStyle === 'grid') {
      const g = 32 * transform.scale;
      bg.style.backgroundSize = `${g}px ${g}px`;
    } else if (canvasBgStyle === 'dots') {
      const g = 48 * transform.scale;
      bg.style.backgroundSize = `${g}px ${g}px`;
    } else {
      bg.style.backgroundSize = '0';
    }
    bg.style.backgroundPosition = `${transform.x}px ${transform.y}px`;
  }, [transform.x, transform.y, transform.scale, canvasBgStyle, canvasBgRef]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      ref={canvasBgRef}
      style={{
        backgroundImage:
          canvasBgStyle === 'grid'
            ? `linear-gradient(to right, ${canvasBgColor === 'dark' ? '#2a2a2a' : '#1a1a1a'} 1px, transparent 1px), linear-gradient(to bottom, ${canvasBgColor === 'dark' ? '#2a2a2a' : '#1a1a1a'} 1px, transparent 1px)`
            : canvasBgStyle === 'dots'
              ? `radial-gradient(circle, ${canvasBgColor === 'dark' ? '#333' : '#222'} 0.5px, transparent 0.5px)`
              : 'none',
        backgroundColor: canvasBgColor === 'black' ? '#0a0a0a' : '#0f0f0f',
      }}
    />
  );
});
