import type { CanvasNode, Edge } from '../types';
import {
  buildEdgeBezierPath,
  resolveNodeGeometry,
  type DragPreview,
  type ResizePreview,
} from './canvasEdgeGeometry';

function edgePathEls(svg: SVGElement | null, edgeId: string): SVGPathElement[] {
  if (!svg) return [];
  return Array.from(svg.querySelectorAll(`path[data-edge-id="${edgeId}"]`));
}

function edgeEndpoints(
  source: CanvasNode,
  target: CanvasNode,
  dragPreview: DragPreview | null,
  resizePreview: ResizePreview | null,
) {
  const srcGeom = resolveNodeGeometry(source, dragPreview, resizePreview);
  const tgtGeom = resolveNodeGeometry(target, dragPreview, resizePreview);
  return {
    startX: srcGeom.x + srcGeom.width,
    startY: srcGeom.y + srcGeom.height / 2,
    endX: tgtGeom.x,
    endY: tgtGeom.y + tgtGeom.height / 2,
  };
}

function paintEdgePaths(svg: SVGElement | null, edgeId: string, d: string): void {
  for (const el of edgePathEls(svg, edgeId)) {
    el.setAttribute('d', d);
    el.dataset.edgePreview = '1';
  }
}

/** 拖拽预览：只更新与移动节点相关的连线 path，避免每帧 setDragPreview 重渲染 */
export function applyEdgeDragPreview(
  svg: SVGElement | null,
  edges: Edge[],
  nodeMap: Map<string, CanvasNode>,
  preview: DragPreview,
): void {
  if (!svg || (preview.deltaX === 0 && preview.deltaY === 0)) return;
  const moving = new Set(preview.nodeIds);
  for (const edge of edges) {
    if (!moving.has(edge.sourceId) && !moving.has(edge.targetId)) continue;
    const source = nodeMap.get(edge.sourceId);
    const target = nodeMap.get(edge.targetId);
    if (!source || !target) continue;
    const { startX, startY, endX, endY } = edgeEndpoints(source, target, preview, null);
    paintEdgePaths(svg, edge.id, buildEdgeBezierPath(startX, startY, endX, endY));
  }
}

/** 缩放预览：只更新与缩放节点相关的连线 path */
export function applyEdgeResizePreview(
  svg: SVGElement | null,
  edges: Edge[],
  nodeMap: Map<string, CanvasNode>,
  preview: ResizePreview,
): void {
  if (!svg) return;
  const nodeId = preview.nodeId;
  for (const edge of edges) {
    if (edge.sourceId !== nodeId && edge.targetId !== nodeId) continue;
    const source = nodeMap.get(edge.sourceId);
    const target = nodeMap.get(edge.targetId);
    if (!source || !target) continue;
    const { startX, startY, endX, endY } = edgeEndpoints(source, target, null, preview);
    paintEdgePaths(svg, edge.id, buildEdgeBezierPath(startX, startY, endX, endY));
  }
}

export function clearEdgeGeometryPreviews(svg: SVGElement | null): void {
  if (!svg) return;
  svg.querySelectorAll('path[data-edge-preview="1"]').forEach((el) => {
    delete (el as SVGPathElement).dataset.edgePreview;
  });
}
