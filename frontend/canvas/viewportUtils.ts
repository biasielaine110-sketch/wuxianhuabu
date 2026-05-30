import type { Transform } from '../types';

export function isNodeInViewport(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  transform: Transform,
  viewportWidth: number,
  viewportHeight: number,
  margin = 200
): boolean {
  const screenLeft = nodeX * transform.scale + transform.x;
  const screenTop = nodeY * transform.scale + transform.y;
  const screenRight = screenLeft + nodeWidth * transform.scale;
  const screenBottom = screenTop + nodeHeight * transform.scale;

  return !(
    screenRight < -margin ||
    screenLeft > viewportWidth + margin ||
    screenBottom < -margin ||
    screenTop > viewportHeight + margin
  );
}

export function computeVisibleNodeIds(
  nodes: { id: string; x: number; y: number; width: number; height: number }[],
  transform: Transform,
  viewportWidth: number,
  viewportHeight: number,
  margin = 300
): Set<string> {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (isNodeInViewport(n.x, n.y, n.width, n.height, transform, viewportWidth, viewportHeight, margin)) {
      ids.add(n.id);
    }
  }
  return ids;
}
