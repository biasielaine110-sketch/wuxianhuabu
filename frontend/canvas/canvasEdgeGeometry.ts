import type { CanvasNode } from '../types';

export type DragPreview = { nodeIds: string[]; deltaX: number; deltaY: number };
export type ResizePreview = { nodeId: string; x: number; y: number; width: number; height: number };

export function resolveNodeGeometry(
  node: CanvasNode,
  dragPreview: DragPreview | null,
  resizePreview: ResizePreview | null,
): { x: number; y: number; width: number; height: number } {
  if (resizePreview?.nodeId === node.id) {
    return {
      x: resizePreview.x,
      y: resizePreview.y,
      width: resizePreview.width,
      height: resizePreview.height,
    };
  }
  const dx = dragPreview?.nodeIds.includes(node.id) ? dragPreview.deltaX : 0;
  const dy = dragPreview?.nodeIds.includes(node.id) ? dragPreview.deltaY : 0;
  return { x: node.x + dx, y: node.y + dy, width: node.width, height: node.height };
}

export function buildEdgeBezierPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string {
  const dist = Math.abs(endX - startX);
  const controlOffset = Math.max(dist / 2, 60);
  const cp1X = startX + controlOffset;
  const cp1Y = startY;
  const cp2X = endX - controlOffset;
  const cp2Y = endY;
  return `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
}
