import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CanvasNode, Transform } from '../types';

const MINIMAP_W = 168;
const MINIMAP_H = 126;
const PADDING = 12;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function computeBounds(nodes: CanvasNode[]): Bounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const padX = Math.max(80, (maxX - minX) * 0.08);
  const padY = Math.max(80, (maxY - minY) * 0.08);
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

const TYPE_FILL: Record<string, string> = {
  text: '#9ca3af',
  image: '#4ade80',
  t2i: '#c084fc',
  i2i: '#60a5fa',
  panorama: '#22d3ee',
  annotation: '#fb923c',
  gridSplit: '#2dd4bf',
  gridMerge: '#2dd4bf',
  panoramaT2i: '#818cf8',
  director3d: '#f472b6',
  video: '#fbbf24',
  audio: '#60a5fa',
  chat: '#fb7185',
};

type CanvasMinimapProps = {
  nodes: CanvasNode[];
  transform: Transform;
  viewportSize: { width: number; height: number };
  onNavigate: (canvasX: number, canvasY: number) => void;
};

export function CanvasMinimap({ nodes, transform, viewportSize, onNavigate }: CanvasMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);

  const project = useCallback(
    (x: number, y: number) => {
      const spanW = Math.max(1, bounds.maxX - bounds.minX);
      const spanH = Math.max(1, bounds.maxY - bounds.minY);
      const innerW = MINIMAP_W - PADDING * 2;
      const innerH = MINIMAP_H - PADDING * 2;
      const scale = Math.min(innerW / spanW, innerH / spanH);
      const offsetX = PADDING + (innerW - spanW * scale) / 2;
      const offsetY = PADDING + (innerH - spanH * scale) / 2;
      return {
        px: offsetX + (x - bounds.minX) * scale,
        py: offsetY + (y - bounds.minY) * scale,
        scale,
        offsetX,
        offsetY,
      };
    },
    [bounds]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

    for (const n of nodes) {
      const p0 = project(n.x, n.y);
      const p1 = project(n.x + n.width, n.y + n.height);
      const w = Math.max(2, p1.px - p0.px);
      const h = Math.max(2, p1.py - p0.py);
      ctx.fillStyle = TYPE_FILL[n.type] ?? '#666';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(p0.px, p0.py, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(p0.px, p0.py, w, h);
    }

    const vx0 = (-transform.x) / transform.scale;
    const vy0 = (-transform.y) / transform.scale;
    const vx1 = (viewportSize.width - transform.x) / transform.scale;
    const vy1 = (viewportSize.height - transform.y) / transform.scale;
    const vp0 = project(vx0, vy0);
    const vp1 = project(vx1, vy1);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vp0.px, vp0.py, vp1.px - vp0.px, vp1.py - vp0.py);
    ctx.fillStyle = 'rgba(96, 165, 250, 0.12)';
    ctx.fillRect(vp0.px, vp0.py, vp1.px - vp0.px, vp1.py - vp0.py);
  }, [nodes, transform, viewportSize, project, bounds]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const spanW = Math.max(1, bounds.maxX - bounds.minX);
    const spanH = Math.max(1, bounds.maxY - bounds.minY);
    const innerW = MINIMAP_W - PADDING * 2;
    const innerH = MINIMAP_H - PADDING * 2;
    const scale = Math.min(innerW / spanW, innerH / spanH);
    const offsetX = PADDING + (innerW - spanW * scale) / 2;
    const offsetY = PADDING + (innerH - spanH * scale) / 2;
    const canvasX = bounds.minX + (px - offsetX) / scale;
    const canvasY = bounds.minY + (py - offsetY) / scale;
    onNavigate(canvasX, canvasY);
  };

  if (nodes.length === 0) return null;

  return (
    <div
      className="absolute bottom-4 right-4 z-40 rounded-lg border border-[#333] bg-[#1a1a1a]/95 shadow-xl overflow-hidden pointer-events-auto"
      title="小地图：点击定位视口"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-[#333]">小地图</div>
      <canvas
        ref={canvasRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        className="block cursor-crosshair"
        onPointerDown={handlePointerDown}
      />
    </div>
  );
}
