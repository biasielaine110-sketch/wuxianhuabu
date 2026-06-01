import React, { memo } from 'react';
import { useCanvasStore } from '../stores/canvasStore';

type CanvasZoomControlProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hidden?: boolean;
};

/** 缩放控件：内部订阅 transform/nodes */
export const CanvasZoomControl = memo(function CanvasZoomControl({
  containerRef,
  hidden,
}: CanvasZoomControlProps) {
  const transform = useCanvasStore((s) => s.transform);
  const nodes = useCanvasStore((s) => s.nodes);
  const setTransform = useCanvasStore((s) => s.setTransform);

  if (hidden) return null;

  const fitAllNodes = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || nodes.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    });
    const pad = 80;
    const nw = maxX - minX + pad * 2;
    const nh = maxY - minY + pad * 2;
    const s = Math.min(rect.width / nw, rect.height / nh, 2);
    setTransform({
      x: rect.width / 2 - ((minX + (maxX - minX) / 2) * s),
      y: rect.height / 2 - ((minY + (maxY - minY) / 2) * s),
      scale: Math.max(0.05, s),
    });
  };

  return (
    <div
      className="absolute bottom-6 left-6 z-30 flex items-center gap-1 bg-[#1e1e1e]/90 backdrop-blur-md rounded-xl border border-[#333] px-2 py-1.5 shadow-lg canvas-chrome-150"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          const ns = Math.max(0.05, transform.scale - 0.1);
          setTransform((p) => ({ ...p, scale: ns }));
        }}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-[#333] hover:text-white text-sm font-bold transition-colors"
        title="缩小"
      >
        −
      </button>
      <span
        className="text-xs text-gray-300 font-mono w-12 text-center select-none cursor-pointer hover:text-white transition-colors"
        title="点击重置为 100%"
        onClick={() => setTransform((p) => ({ ...p, scale: 1 }))}
      >
        {Math.round(transform.scale * 100)}%
      </span>
      <button
        onClick={() => {
          const ns = Math.min(5, transform.scale + 0.1);
          setTransform((p) => ({ ...p, scale: ns }));
        }}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-[#333] hover:text-white text-sm font-bold transition-colors"
        title="放大"
      >
        +
      </button>
      <div className="w-px h-4 bg-[#444] mx-0.5" />
      <button
        onClick={fitAllNodes}
        className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:bg-[#333] hover:text-white transition-colors"
        title="适合窗口 — 缩放并平移以显示所有节点"
      >
        ⊞
      </button>
      <button
        onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
        className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:bg-[#333] hover:text-white transition-colors"
        title="重置为 100%"
      >
        1:1
      </button>
    </div>
  );
});
