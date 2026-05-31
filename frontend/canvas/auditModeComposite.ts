import type { AuditImage } from '../types';

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

function base64ToImageDataUrl(raw: string): string {
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '');
  let mime = 'image/png';
  try {
    const dec = atob(cleaned.slice(0, 48));
    const a = dec.charCodeAt(0);
    const b = dec.charCodeAt(1);
    if (a === 0xff && b === 0xd8) mime = 'image/jpeg';
    else if (a === 0x89 && b === 0x50) mime = 'image/png';
    else if (a === 0x47 && b === 0x49) mime = 'image/gif';
  } catch {
    /* ignore */
  }
  return `data:${mime};base64,${cleaned}`;
}

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

/** 将看图图片（及可选标注）合成为一张 PNG base64 */
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
