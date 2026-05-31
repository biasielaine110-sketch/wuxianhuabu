/** 拖拽/缩放过程中直接写节点 DOM，避免每帧 setNodes 触发整树重渲染 */

export function findNodeRoot(layer: HTMLElement | null, nodeId: string): HTMLElement | null {
  if (!layer) return null;
  return layer.querySelector(`[data-node-root="true"][data-node-id="${nodeId}"]`) as HTMLElement | null;
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
  el.style.left = '';
  el.style.top = '';
  el.style.width = '';
  el.style.height = '';
  delete el.dataset.resizePreview;
}

export function clearAllNodeGeometryPreviews(layer: HTMLElement | null): void {
  if (!layer) return;
  layer.querySelectorAll('[data-resize-preview="1"]').forEach((el) => {
    const node = el as HTMLElement;
    node.style.left = '';
    node.style.top = '';
    node.style.width = '';
    node.style.height = '';
    delete node.dataset.resizePreview;
  });
}
