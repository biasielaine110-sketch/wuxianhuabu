/** 拖拽/缩放过程中直接写节点 DOM，避免每帧 setNodes 触发整树重渲染 */

export function findNodeRoot(layer: HTMLElement | null, nodeId: string): HTMLElement | null {
  if (!layer) return null;
  return layer.querySelector(`[data-node-root="true"][data-node-id="${nodeId}"]`) as HTMLElement | null;
}

/** 从屏幕坐标反算节点在画布中的几何（含拖拽 transform，不依赖 state / inline 是否同步） */
export function readNodeGeometryFromScreen(
  layer: HTMLElement | null,
  nodeId: string,
  containerRect: DOMRect,
  transform: { x: number; y: number; scale: number },
  fallback: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const el = findNodeRoot(layer, nodeId);
  if (!el) return fallback;

  const scale = Math.max(transform.scale, 0.1);
  const rect = el.getBoundingClientRect();
  const x = (rect.left - containerRect.left - transform.x) / scale;
  const y = (rect.top - containerRect.top - transform.y) / scale;
  const width = rect.width / scale;
  const height = rect.height / scale;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    return fallback;
  }

  return { x, y, width, height };
}

/** 读取节点当前几何：优先屏幕实测，再回退 inline / state */
export function readNodeGeometryFromDom(
  layer: HTMLElement | null,
  nodeId: string,
  fallback: { x: number; y: number; width: number; height: number },
  containerRect?: DOMRect | null,
  transform?: { x: number; y: number; scale: number } | null,
): { x: number; y: number; width: number; height: number } {
  if (containerRect && transform) {
    return readNodeGeometryFromScreen(layer, nodeId, containerRect, transform, fallback);
  }

  const el = findNodeRoot(layer, nodeId);
  if (!el) return fallback;

  let x = fallback.x;
  let y = fallback.y;
  let width = fallback.width;
  let height = fallback.height;

  const lx = parseFloat(el.style.left);
  const ly = parseFloat(el.style.top);
  const lw = parseFloat(el.style.width);
  const lh = parseFloat(el.style.height);
  if (Number.isFinite(lx)) x = lx;
  if (Number.isFinite(ly)) y = ly;
  if (Number.isFinite(lw)) width = lw;
  if (Number.isFinite(lh)) height = lh;

  if (el.dataset.dragPreview === '1' && el.style.transform) {
    const m = el.style.transform.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\s*\)/);
    if (m) {
      x += parseFloat(m[1]) || 0;
      y += parseFloat(m[2]) || 0;
    }
  }

  return { x, y, width, height };
}

export function applyNodeDragPreview(
  layer: HTMLElement | null,
  nodeIds: string[],
  deltaX: number,
  deltaY: number,
): void {
  for (const id of nodeIds) {
    const el = findNodeRoot(layer, id);
    if (!el) continue;
    el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    el.dataset.dragPreview = '1';
  }
}

export function clearNodeDragPreview(layer: HTMLElement | null, nodeIds: string[]): void {
  for (const id of nodeIds) {
    const el = findNodeRoot(layer, id);
    if (!el) continue;
    el.style.transform = '';
    delete el.dataset.dragPreview;
  }
}

export function clearAllNodeDragPreviews(layer: HTMLElement | null): void {
  if (!layer) return;
  layer.querySelectorAll('[data-drag-preview="1"]').forEach((el) => {
    const node = el as HTMLElement;
    node.style.transform = '';
    delete node.dataset.dragPreview;
  });
}

export function applyNodeGeometryPreview(
  layer: HTMLElement | null,
  nodeId: string,
  geom: { x: number; y: number; width: number; height: number },
): void {
  const el = findNodeRoot(layer, nodeId);
  if (!el) return;
  el.style.left = `${geom.x}px`;
  el.style.top = `${geom.y}px`;
  el.style.width = `${geom.width}px`;
  el.style.height = `${geom.height}px`;
  el.dataset.resizePreview = '1';
}

export function clearNodeGeometryPreview(layer: HTMLElement | null, nodeId: string): void {
  const el = findNodeRoot(layer, nodeId);
  if (!el) return;
  // 只清标记，勿清空 inline 几何——否则 React 提交前会瞬移到 (0,0)（视口中心）
  delete el.dataset.resizePreview;
}

export function clearAllNodeGeometryPreviews(layer: HTMLElement | null): void {
  if (!layer) return;
  layer.querySelectorAll('[data-resize-preview="1"]').forEach((el) => {
    delete (el as HTMLElement).dataset.resizePreview;
  });
}
