import type { AuditImage } from '../types';
import { base64ToImageDataUrl } from './auditImageUtils';

export type CanvasRect = { x: number; y: number; width: number; height: number };

export type CroppedAuditRegion = {
  base64: string;
  width: number;
  height: number;
  canvasX: number;
  canvasY: number;
  canvasW: number;
  canvasH: number;
};

function normalizeRect(rect: CanvasRect) {
  const left = Math.min(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const right = Math.max(rect.x, rect.x + rect.width);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function getImageCanvasBounds(image: AuditImage) {
  return {
    left: image.x,
    top: image.y,
    right: image.x + image.width * image.scale,
    bottom: image.y + image.height * image.scale,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法加载图片'));
    img.src = src;
  });
}

/** 从看图图片中裁剪画布坐标选区（像素取自原图，不含 scale 拉伸插值以外的变形） */
export async function cropAuditImageRegion(
  image: AuditImage,
  region: CanvasRect
): Promise<CroppedAuditRegion | null> {
  const sel = normalizeRect(region);
  if (sel.width < 4 || sel.height < 4) return null;

  const imgBounds = getImageCanvasBounds(image);
  const clipLeft = Math.max(sel.left, imgBounds.left);
  const clipTop = Math.max(sel.top, imgBounds.top);
  const clipRight = Math.min(sel.right, imgBounds.right);
  const clipBottom = Math.min(sel.bottom, imgBounds.bottom);
  const clipW = clipRight - clipLeft;
  const clipH = clipBottom - clipTop;
  if (clipW < 4 || clipH < 4) return null;

  const srcX = (clipLeft - image.x) / image.scale;
  const srcY = (clipTop - image.y) / image.scale;
  const srcW = clipW / image.scale;
  const srcH = clipH / image.scale;

  const imgEl = await loadImage(base64ToImageDataUrl(image.base64));
  const outW = Math.max(1, Math.round(srcW));
  const outH = Math.max(1, Math.round(srcH));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(imgEl, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;

  return {
    base64,
    width: outW,
    height: outH,
    canvasX: clipLeft,
    canvasY: clipTop,
    canvasW: clipW,
    canvasH: clipH,
  };
}

/** 将局部重绘结果贴回原图对应像素区域，返回新 base64 */
export async function compositePatchOntoAuditImage(
  image: AuditImage,
  crop: CroppedAuditRegion,
  patchBase64: string
): Promise<string | null> {
  const rawPatch = patchBase64.replace(/^data:[^;]+;base64,/, '');
  const srcX = (crop.canvasX - image.x) / image.scale;
  const srcY = (crop.canvasY - image.y) / image.scale;
  const srcW = crop.canvasW / image.scale;
  const srcH = crop.canvasH / image.scale;
  if (srcW < 1 || srcH < 1) return null;

  const [sourceImg, patchImg] = await Promise.all([
    loadImage(base64ToImageDataUrl(image.base64)),
    loadImage(base64ToImageDataUrl(rawPatch)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = sourceImg.naturalWidth;
  canvas.height = sourceImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(sourceImg, 0, 0);
  ctx.drawImage(patchImg, 0, 0, patchImg.naturalWidth, patchImg.naturalHeight, srcX, srcY, srcW, srcH);

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1] ?? null;
}

/** 选区与哪张图片相交面积最大 */
export function findBestAuditImageForRegion(
  images: AuditImage[],
  region: CanvasRect,
  restrictToId?: string | null
): AuditImage | null {
  const sel = normalizeRect(region);
  if (sel.width < 1 || sel.height < 1) return null;

  let best: AuditImage | null = null;
  let bestArea = 0;
  for (const image of images) {
    if (restrictToId && image.id !== restrictToId) continue;
    const b = getImageCanvasBounds(image);
    const clipLeft = Math.max(sel.left, b.left);
    const clipTop = Math.max(sel.top, b.top);
    const clipRight = Math.min(sel.right, b.right);
    const clipBottom = Math.min(sel.bottom, b.bottom);
    const area = Math.max(0, clipRight - clipLeft) * Math.max(0, clipBottom - clipTop);
    if (area > bestArea) {
      bestArea = area;
      best = image;
    }
  }
  return bestArea >= 16 ? best : null;
}
