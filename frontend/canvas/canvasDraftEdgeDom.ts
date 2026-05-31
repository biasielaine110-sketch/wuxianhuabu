import { buildEdgeBezierPath } from './canvasEdgeGeometry';

export function showDraftEdgePath(
  pathEl: SVGPathElement | null,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  if (!pathEl) return;
  pathEl.setAttribute('d', buildEdgeBezierPath(startX, startY, endX, endY));
  pathEl.style.visibility = 'visible';
}

export function hideDraftEdgePath(pathEl: SVGPathElement | null): void {
  if (!pathEl) return;
  pathEl.setAttribute('d', '');
  pathEl.style.visibility = 'hidden';
}
