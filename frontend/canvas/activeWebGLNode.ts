import type { CanvasNode } from '../types';

export type CanvasViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export function isHeavyWebGLNodeType(type: string): boolean {
  return type === 'panorama' || type === 'director3d';
}

/** 同时仅允许一个 Panorama / Director3D 挂载 WebGL 引擎 */
export function pickActiveWebGLNodeId(
  nodes: CanvasNode[],
  visibleNodeIds: Set<string>,
  selectedIds: string[],
  draggingNodeId: string | null,
  viewport: CanvasViewport,
): string | null {
  if (draggingNodeId) {
    const dragging = nodes.find((n) => n.id === draggingNodeId);
    if (dragging && isHeavyWebGLNodeType(dragging.type)) return draggingNodeId;
  }

  for (const id of selectedIds) {
    const n = nodes.find((node) => node.id === id);
    if (n && isHeavyWebGLNodeType(n.type) && visibleNodeIds.has(id)) return id;
  }

  const centerX = (-viewport.x + viewport.width / 2) / Math.max(viewport.scale, 0.05);
  const centerY = (-viewport.y + viewport.height / 2) / Math.max(viewport.scale, 0.05);

  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const n of nodes) {
    if (!isHeavyWebGLNodeType(n.type) || !visibleNodeIds.has(n.id)) continue;
    const nx = n.x + n.width / 2;
    const ny = n.y + n.height / 2;
    const d = (nx - centerX) ** 2 + (ny - centerY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }

  return bestId;
}

export function shouldUseNodePlaceholder(
  node: CanvasNode,
  opts: {
    isInViewport: boolean;
    isDragging: boolean;
    isSelected: boolean;
    activeWebGLNodeId: string | null;
  },
): boolean {
  const heavy = isHeavyWebGLNodeType(node.type);
  if (heavy) {
    if (opts.isDragging) return false;
    if (node.id !== opts.activeWebGLNodeId) return true;
    return !opts.isInViewport && !opts.isSelected;
  }
  return !opts.isInViewport && !opts.isDragging && !opts.isSelected;
}

export function nodePlaceholderHint(
  node: CanvasNode,
  opts: { isInViewport: boolean; activeWebGLNodeId: string | null },
): 'offscreen' | 'webgl-inactive' | null {
  if (!isHeavyWebGLNodeType(node.type)) {
    return opts.isInViewport ? null : 'offscreen';
  }
  if (node.id === opts.activeWebGLNodeId) return null;
  return opts.isInViewport ? 'webgl-inactive' : 'offscreen';
}
