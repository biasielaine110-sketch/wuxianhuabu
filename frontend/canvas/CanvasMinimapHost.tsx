import React, { memo } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { CanvasMinimap } from './CanvasMinimap';

type CanvasMinimapHostProps = {
  viewportSize: { width: number; height: number };
  onNavigate: (canvasX: number, canvasY: number) => void;
};

/** 小地图：内部订阅 nodes/transform，不触发 App 重渲染 */
export const CanvasMinimapHost = memo(function CanvasMinimapHost(props: CanvasMinimapHostProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const transform = useCanvasStore((s) => s.transform);
  if (nodes.length === 0) return null;
  return <CanvasMinimap nodes={nodes} transform={transform} {...props} />;
});
