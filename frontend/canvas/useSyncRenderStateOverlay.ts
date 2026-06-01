import { useRef } from 'react';
import type { CanvasNodeRenderState } from './canvasNodeRenderState';

/** 每帧写入 renderNode 运行时快照，避免 CanvasApp 因 overlay 字段变更重渲染 */
export function useSyncRenderStateOverlay(
  build: () => Partial<CanvasNodeRenderState>
) {
  const overlayRef = useRef<Partial<CanvasNodeRenderState>>({});
  overlayRef.current = build();
  return overlayRef;
}
