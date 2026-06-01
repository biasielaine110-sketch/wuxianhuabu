export type AuditAnnotationLike = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  text?: string;
  strokeWidth?: number;
  points?: { x: number; y: number }[];
  fontSize?: number;
  fillOpacity?: number;
  color?: string;
};

export type AnnBounds = { minX: number; minY: number; maxX: number; maxY: number };

export type ResizeHandleId = 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end';

const BOX_TYPES = new Set(['rect', 'fillRect', 'circle', 'fillCircle']);

export function getAnnotationBounds(ann: AuditAnnotationLike): AnnBounds | null {
  if (ann.type === 'pen' && ann.points && ann.points.length > 0) {
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
    const pad = (ann.strokeWidth ?? 2) / 2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }
  if (ann.type === 'arrow') {
    return {
      minX: Math.min(ann.x, ann.endX ?? ann.x),
      minY: Math.min(ann.y, ann.endY ?? ann.y),
      maxX: Math.max(ann.x, ann.endX ?? ann.x),
      maxY: Math.max(ann.y, ann.endY ?? ann.y),
    };
  }
  if (ann.type === 'text') {
    const fs = ann.fontSize ?? 16;
    const tw = (ann.text?.length ?? 1) * fs * 0.6;
    return { minX: ann.x, minY: ann.y - fs, maxX: ann.x + tw, maxY: ann.y };
  }
  if (BOX_TYPES.has(ann.type)) {
    const w = ann.width ?? 0;
    const h = ann.height ?? 0;
    return {
      minX: Math.min(ann.x, ann.x + w),
      minY: Math.min(ann.y, ann.y + h),
      maxX: Math.max(ann.x, ann.x + w),
      maxY: Math.max(ann.y, ann.y + h),
    };
  }
  return null;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function pointInBounds(
  x: number,
  y: number,
  b: AnnBounds,
  padding: number
): boolean {
  return (
    x >= b.minX - padding &&
    x <= b.maxX + padding &&
    y >= b.minY - padding &&
    y <= b.maxY + padding
  );
}

export function hitTestAnnotation(
  ann: AuditAnnotationLike,
  x: number,
  y: number,
  tolerance: number
): boolean {
  const bounds = getAnnotationBounds(ann);
  if (!bounds) return false;
  const stroke = (ann.strokeWidth ?? 2) / 2;
  const tol = tolerance + stroke;

  if (ann.type === 'pen' && ann.points && ann.points.length > 1) {
    if (!pointInBounds(x, y, bounds, tol)) return false;
    for (let i = 1; i < ann.points.length; i++) {
      const p0 = ann.points[i - 1];
      const p1 = ann.points[i];
      if (distToSegment(x, y, p0.x, p0.y, p1.x, p1.y) <= tol) return true;
    }
    return false;
  }

  if (ann.type === 'arrow') {
    const endX = ann.endX ?? ann.x;
    const endY = ann.endY ?? ann.y;
    if (distToSegment(x, y, ann.x, ann.y, endX, endY) <= tol) return true;
    if (Math.hypot(x - ann.x, y - ann.y) <= tol) return true;
    if (Math.hypot(x - endX, y - endY) <= tol) return true;
    return false;
  }

  if (ann.type === 'text' || ann.type === 'fillRect' || ann.type === 'fillCircle') {
    return pointInBounds(x, y, bounds, tolerance);
  }

  if (BOX_TYPES.has(ann.type)) {
    if (!pointInBounds(x, y, bounds, tol)) return false;
    const onLeft = Math.abs(x - bounds.minX) <= tol || Math.abs(x - bounds.maxX) <= tol;
    const onTop = Math.abs(y - bounds.minY) <= tol || Math.abs(y - bounds.maxY) <= tol;
    const inX = x >= bounds.minX - tol && x <= bounds.maxX + tol;
    const inY = y >= bounds.minY - tol && y <= bounds.maxY + tol;
    return (onLeft && inY) || (onTop && inX) || pointInBounds(x, y, bounds, 0);
  }

  return pointInBounds(x, y, bounds, tolerance);
}

/** 自上而下命中检测，返回最上层标注 id */
export function hitTestTopmostAnnotation(
  annotations: AuditAnnotationLike[],
  x: number,
  y: number,
  tolerance: number
): string | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTestAnnotation(annotations[i], x, y, tolerance)) {
      return annotations[i].id;
    }
  }
  return null;
}

export function annotationSupportsResize(ann: AuditAnnotationLike): boolean {
  return (
    BOX_TYPES.has(ann.type) ||
    ann.type === 'arrow' ||
    ann.type === 'pen'
  );
}

export function getResizeHandles(
  ann: AuditAnnotationLike
): { id: ResizeHandleId; x: number; y: number }[] {
  if (ann.type === 'arrow') {
    return [
      { id: 'start', x: ann.x, y: ann.y },
      { id: 'end', x: ann.endX ?? ann.x, y: ann.endY ?? ann.y },
    ];
  }
  const bounds = getAnnotationBounds(ann);
  if (!bounds || !annotationSupportsResize(ann)) return [];
  return [
    { id: 'nw', x: bounds.minX, y: bounds.minY },
    { id: 'ne', x: bounds.maxX, y: bounds.minY },
    { id: 'sw', x: bounds.minX, y: bounds.maxY },
    { id: 'se', x: bounds.maxX, y: bounds.maxY },
  ];
}

export function hitTestResizeHandle(
  ann: AuditAnnotationLike,
  x: number,
  y: number,
  handleRadius: number
): ResizeHandleId | null {
  if (!annotationSupportsResize(ann)) return null;
  for (const handle of getResizeHandles(ann)) {
    if (Math.hypot(x - handle.x, y - handle.y) <= handleRadius) {
      return handle.id;
    }
  }
  return null;
}

export function translateAnnotation<T extends AuditAnnotationLike>(
  ann: T,
  dx: number,
  dy: number
): T {
  if (ann.type === 'pen' && ann.points) {
    return {
      ...ann,
      points: ann.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  if (ann.type === 'arrow') {
    return {
      ...ann,
      x: ann.x + dx,
      y: ann.y + dy,
      endX: (ann.endX ?? ann.x) + dx,
      endY: (ann.endY ?? ann.y) + dy,
    };
  }
  return { ...ann, x: ann.x + dx, y: ann.y + dy };
}

function normalizeBox(
  ann: AuditAnnotationLike
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const bounds = getAnnotationBounds(ann);
  if (!bounds) return null;
  return { ...bounds };
}

function applyBoxToAnnotation<T extends AuditAnnotationLike>(
  ann: T,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): T {
  const width = Math.max(4, maxX - minX);
  const height = Math.max(4, maxY - minY);
  if (ann.type === 'pen' && ann.points) {
    const startBounds = normalizeBox(ann);
    if (!startBounds) return ann;
    const startW = Math.max(1, startBounds.maxX - startBounds.minX);
    const startH = Math.max(1, startBounds.maxY - startBounds.minY);
    const sx = width / startW;
    const sy = height / startH;
    return {
      ...ann,
      points: ann.points.map((p) => ({
        x: minX + (p.x - startBounds.minX) * sx,
        y: minY + (p.y - startBounds.minY) * sy,
      })),
    } as T;
  }
  if (ann.type === 'arrow') {
    const startBounds = normalizeBox(ann);
    if (!startBounds) return ann;
    const startW = Math.max(1, startBounds.maxX - startBounds.minX);
    const startH = Math.max(1, startBounds.maxY - startBounds.minY);
    const sx = width / startW;
    const sy = height / startH;
    const mapPoint = (px: number, py: number) => ({
      x: minX + (px - startBounds.minX) * sx,
      y: minY + (py - startBounds.minY) * sy,
    });
    const start = mapPoint(ann.x, ann.y);
    const end = mapPoint(ann.endX ?? ann.x, ann.endY ?? ann.y);
    return { ...ann, x: start.x, y: start.y, endX: end.x, endY: end.y } as T;
  }
  return { ...ann, x: minX, y: minY, width, height } as T;
}

export function resizeAnnotationFromSnapshot<T extends AuditAnnotationLike>(
  snapshot: T,
  handle: ResizeHandleId,
  pointer: { x: number; y: number },
  startBounds: AnnBounds
): T {
  if (handle === 'start' && snapshot.type === 'arrow') {
    return { ...snapshot, x: pointer.x, y: pointer.y };
  }
  if (handle === 'end' && snapshot.type === 'arrow') {
    return { ...snapshot, endX: pointer.x, endY: pointer.y };
  }

  let { minX, minY, maxX, maxY } = startBounds;

  if (handle === 'nw') {
    minX = Math.min(pointer.x, maxX - 4);
    minY = Math.min(pointer.y, maxY - 4);
  } else if (handle === 'ne') {
    maxX = Math.max(pointer.x, minX + 4);
    minY = Math.min(pointer.y, maxY - 4);
  } else if (handle === 'sw') {
    minX = Math.min(pointer.x, maxX - 4);
    maxY = Math.max(pointer.y, minY + 4);
  } else if (handle === 'se') {
    maxX = Math.max(pointer.x, minX + 4);
    maxY = Math.max(pointer.y, minY + 4);
  }

  if (snapshot.type === 'pen') {
    return applyBoxToAnnotation(snapshot, minX, minY, maxX, maxY);
  }
  if (snapshot.type === 'arrow') {
    return applyBoxToAnnotation(snapshot, minX, minY, maxX, maxY);
  }
  if (BOX_TYPES.has(snapshot.type)) {
    return applyBoxToAnnotation(snapshot, minX, minY, maxX, maxY);
  }
  return snapshot;
}

export function cloneAnnotation<T extends AuditAnnotationLike>(ann: T): T {
  return JSON.parse(JSON.stringify(ann)) as T;
}
