import type { Annotation } from '../types';

export type AnnotationBox = { left: number; top: number; right: number; bottom: number };

export function getAnnotationBox(ann: Annotation): AnnotationBox {
  switch (ann.type) {
    case 'rect':
    case 'fillRect':
    case 'circle':
    case 'fillCircle':
      return {
        left: ann.x,
        top: ann.y,
        right: ann.x + Math.abs(ann.width || 0),
        bottom: ann.y + Math.abs(ann.height || 0),
      };
    case 'arrow': {
      const ex = ann.endX ?? ann.x;
      const ey = ann.endY ?? ann.y;
      return {
        left: Math.min(ann.x, ex),
        top: Math.min(ann.y, ey),
        right: Math.max(ann.x, ex),
        bottom: Math.max(ann.y, ey),
      };
    }
    case 'text': {
      const fs = ann.fontSize ?? ann.strokeWidth ?? 16;
      const text = ann.text || '';
      const w = Math.max(24, text.length * fs * 0.55);
      return {
        left: ann.x,
        top: ann.y - fs,
        right: ann.x + w,
        bottom: ann.y + fs * 0.35,
      };
    }
    case 'pen': {
      if (!ann.points?.length) {
        return { left: ann.x, top: ann.y, right: ann.x, bottom: ann.y };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of ann.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = (ann.strokeWidth || 3) + 2;
      return {
        left: minX - pad,
        top: minY - pad,
        right: maxX + pad,
        bottom: maxY + pad,
      };
    }
    default:
      return { left: ann.x, top: ann.y, right: ann.x, bottom: ann.y };
  }
}

function pointInBox(px: number, py: number, box: AnnotationBox, margin = 0): boolean {
  return (
    px >= box.left - margin &&
    px <= box.right + margin &&
    py >= box.top - margin &&
    py <= box.bottom + margin
  );
}

function pointNearSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tol: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return Math.hypot(px - x1, py - y1) <= tol;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY) <= tol;
}

/** 判断点击是否命中标注（用于选中/拖动） */
export function hitTestAnnotation(px: number, py: number, ann: Annotation, margin = 8): boolean {
  if (ann.type === 'arrow') {
    return pointNearSegment(px, py, ann.x, ann.y, ann.endX ?? ann.x, ann.endY ?? ann.y, margin + 4);
  }
  if (ann.type === 'circle' || ann.type === 'fillCircle') {
    const cx = ann.x + (ann.width || 0) / 2;
    const cy = ann.y + (ann.height || 0) / 2;
    const rx = Math.abs((ann.width || 0) / 2) + margin;
    const ry = Math.abs((ann.height || 0) / 2) + margin;
    if (rx < 1 || ry < 1) return pointInBox(px, py, getAnnotationBox(ann), margin);
    const nx = (px - cx) / rx;
    const ny = (py - cy) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return pointInBox(px, py, getAnnotationBox(ann), margin);
}

/** 平移标注（矩形/箭头/文字/画笔等全类型） */
export function translateAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
  const out: Annotation = { ...ann, x: ann.x + dx, y: ann.y + dy };
  if (out.endX != null) out.endX += dx;
  if (out.endY != null) out.endY += dy;
  if (out.points?.length) {
    out.points = out.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  return out;
}

/** 从顶层到底层查找命中的标注 */
export function findAnnotationAtPoint(
  px: number,
  py: number,
  annotations: Annotation[],
  margin = 8
): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    if (hitTestAnnotation(px, py, ann, margin)) return ann;
  }
  return null;
}
