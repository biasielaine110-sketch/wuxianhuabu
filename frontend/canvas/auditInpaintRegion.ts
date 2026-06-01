import type { AuditImage } from '../types';

export type CanvasRect = { x: number; y: number; width: number; height: number };

export type InpaintHandleId = 'nw' | 'ne' | 'sw' | 'se';

export function normalizeCanvasRect(rect: CanvasRect) {
  const left = Math.min(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const right = Math.max(rect.x, rect.x + rect.width);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function toCanvasRect(left: number, top: number, width: number, height: number): CanvasRect {
  return { x: left, y: top, width, height };
}

export function getImageCanvasBounds(image: AuditImage) {
  return {
    left: image.x,
    top: image.y,
    right: image.x + image.width * image.scale,
    bottom: image.y + image.height * image.scale,
  };
}

/** 将选区限制在图片范围内，返回左上 + 正宽高 */
export function clampRegionToImage(region: CanvasRect, image: AuditImage): CanvasRect {
  const sel = normalizeCanvasRect(region);
  const img = getImageCanvasBounds(image);
  const left = Math.max(sel.left, img.left);
  const top = Math.max(sel.top, img.top);
  const right = Math.min(sel.right, img.right);
  const bottom = Math.min(sel.bottom, img.bottom);
  const width = Math.max(4, right - left);
  const height = Math.max(4, bottom - top);
  return toCanvasRect(left, top, width, height);
}

export function getInpaintRegionHandles(region: CanvasRect) {
  const { left, top, right, bottom } = normalizeCanvasRect(region);
  return [
    { id: 'nw' as const, x: left, y: top },
    { id: 'ne' as const, x: right, y: top },
    { id: 'sw' as const, x: left, y: bottom },
    { id: 'se' as const, x: right, y: bottom },
  ];
}

export function hitTestInpaintHandle(
  region: CanvasRect,
  x: number,
  y: number,
  radius: number
): InpaintHandleId | null {
  for (const handle of getInpaintRegionHandles(region)) {
    if (Math.hypot(x - handle.x, y - handle.y) <= radius) return handle.id;
  }
  return null;
}

export function pointInInpaintRegion(region: CanvasRect, x: number, y: number): boolean {
  const { left, top, right, bottom } = normalizeCanvasRect(region);
  return x >= left && x <= right && y >= top && y <= bottom;
}

export function moveInpaintRegion(
  start: CanvasRect,
  dx: number,
  dy: number,
  image: AuditImage
): CanvasRect {
  const n = normalizeCanvasRect(start);
  return clampRegionToImage(toCanvasRect(n.left + dx, n.top + dy, n.width, n.height), image);
}

export function resizeInpaintRegion(
  start: CanvasRect,
  handle: InpaintHandleId,
  pointer: { x: number; y: number },
  image: AuditImage
): CanvasRect {
  const n = normalizeCanvasRect(start);
  let { left, top, right, bottom } = n;
  if (handle === 'nw') {
    left = Math.min(pointer.x, right - 4);
    top = Math.min(pointer.y, bottom - 4);
  } else if (handle === 'ne') {
    right = Math.max(pointer.x, left + 4);
    top = Math.min(pointer.y, bottom - 4);
  } else if (handle === 'sw') {
    left = Math.min(pointer.x, right - 4);
    bottom = Math.max(pointer.y, top + 4);
  } else if (handle === 'se') {
    right = Math.max(pointer.x, left + 4);
    bottom = Math.max(pointer.y, top + 4);
  }
  return clampRegionToImage(
    toCanvasRect(left, top, right - left, bottom - top),
    image
  );
}
