import type { AuditImage } from '../types';
import { base64ToImageDataUrl } from './auditImageUtils';

export type AuditAnnotationDraw = {
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  points?: { x: number; y: number }[];
  fontSize?: number;
  fillOpacity?: number;
};

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  lineWidth: number
) {
  const headLen = Math.max(8, lineWidth * 3);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  anns: AuditAnnotationDraw[],
  offsetX: number,
  offsetY: number
) {
  anns.forEach((ann) => {
    const adjustedAnn = { ...ann, x: ann.x - offsetX, y: ann.y - offsetY };
    if (ann.endX !== undefined) adjustedAnn.endX = ann.endX - offsetX;
    if (ann.endY !== undefined) adjustedAnn.endY = ann.endY - offsetY;
    if (ann.points) {
      adjustedAnn.points = ann.points.map((p) => ({ x: p.x - offsetX, y: p.y - offsetY }));
    }

    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.strokeWidth || 2;

    switch (ann.type) {
      case 'rect':
        ctx.strokeRect(adjustedAnn.x, adjustedAnn.y, ann.width || 0, ann.height || 0);
        break;
      case 'fillRect':
        ctx.globalAlpha = ann.fillOpacity ?? 0.45;
        ctx.fillRect(adjustedAnn.x, adjustedAnn.y, ann.width || 0, ann.height || 0);
        ctx.strokeRect(adjustedAnn.x, adjustedAnn.y, ann.width || 0, ann.height || 0);
        ctx.globalAlpha = 1;
        break;
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(
          adjustedAnn.x + (ann.width || 0) / 2,
          adjustedAnn.y + (ann.height || 0) / 2,
          Math.abs(ann.width || 0) / 2,
          Math.abs(ann.height || 0) / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        break;
      case 'fillCircle':
        ctx.beginPath();
        ctx.ellipse(
          adjustedAnn.x + (ann.width || 0) / 2,
          adjustedAnn.y + (ann.height || 0) / 2,
          Math.abs(ann.width || 0) / 2,
          Math.abs(ann.height || 0) / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.globalAlpha = ann.fillOpacity ?? 0.45;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        break;
      case 'arrow':
        drawArrow(
          ctx,
          adjustedAnn.x,
          adjustedAnn.y,
          adjustedAnn.endX || 0,
          adjustedAnn.endY || 0,
          ann.color,
          ann.strokeWidth || 2
        );
        break;
      case 'pen':
        if (adjustedAnn.points && adjustedAnn.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(adjustedAnn.points[0].x, adjustedAnn.points[0].y);
          for (let i = 1; i < adjustedAnn.points.length; i++) {
            ctx.lineTo(adjustedAnn.points[i].x, adjustedAnn.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'text':
        ctx.font = `${ann.fontSize || 16}px sans-serif`;
        ctx.fillText(ann.text || '', adjustedAnn.x, adjustedAnn.y);
        break;
    }
  });
}

export type AuditCompositeResult = {
  base64: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
};

function annotationBounds(ann: AuditAnnotationDraw): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
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
    return { minX, minY, maxX, maxY };
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
  const w = ann.width ?? 0;
  const h = ann.height ?? 0;
  return {
    minX: Math.min(ann.x, ann.x + w),
    minY: Math.min(ann.y, ann.y + h),
    maxX: Math.max(ann.x, ann.x + w),
    maxY: Math.max(ann.y, ann.y + h),
  };
}

function boundsIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/** 计算一组看图图片的外接矩形（含 scale） */
export function getAuditImagesBounds(images: AuditImage[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (images.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const img of images) {
    const w = img.width * img.scale;
    const h = img.height * img.scale;
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + w);
    maxY = Math.max(maxY, img.y + h);
  }
  return { minX, minY, maxX, maxY };
}

/** 筛选与给定矩形相交的标注（用于合并/下载选中区域） */
export function filterAnnotationsInBounds(
  annotations: AuditAnnotationDraw[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): AuditAnnotationDraw[] {
  return annotations.filter((ann) => boundsIntersect(annotationBounds(ann), bounds));
}

/** 将看图图片（及可选标注）合成为一张 PNG base64；images 须为自下而上叠放顺序（先画底层） */
export async function buildAuditImagesComposite(
  images: AuditImage[],
  annotations: AuditAnnotationDraw[] = []
): Promise<AuditCompositeResult | null> {
  if (images.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const img of images) {
    const w = img.width * img.scale;
    const h = img.height * img.scale;
    minX = Math.min(minX, img.x);
    minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + w);
    maxY = Math.max(maxY, img.y + h);
  }

  const exportW = Math.max(1, Math.ceil(maxX - minX));
  const exportH = Math.max(1, Math.ceil(maxY - minY));
  const canvas = document.createElement('canvas');
  canvas.width = exportW;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  for (const img of images) {
    const w = img.width * img.scale;
    const h = img.height * img.scale;
    const imgEl = new Image();
    await new Promise<void>((resolve) => {
      imgEl.onload = () => {
        ctx.drawImage(imgEl, img.x - minX, img.y - minY, w, h);
        resolve();
      };
      imgEl.onerror = () => resolve();
      imgEl.src = base64ToImageDataUrl(img.base64);
    });
  }

  if (annotations.length > 0) {
    drawAnnotations(ctx, annotations, minX, minY);
  }

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  return { base64, width: exportW, height: exportH, minX, minY };
}
