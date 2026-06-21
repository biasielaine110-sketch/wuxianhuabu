import { rewriteImageUrlForBrowserDisplay } from '../services/canvasAssetResolver';

function sniffImageMimeFromBase64(raw: string): string {
  const head = raw.slice(0, 16);
  if (head.startsWith('/9j/')) return 'image/jpeg';
  if (head.startsWith('iVBORw')) return 'image/png';
  if (head.startsWith('R0lGOD')) return 'image/gif';
  if (head.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

function base64ToImageDataUrl(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return rewriteImageUrlForBrowserDisplay(raw);
  }
  if (raw.startsWith('data:')) {
    return raw;
  }
  return `data:${sniffImageMimeFromBase64(raw)};base64,${raw}`;
}

const MAX_UPSCALE_CANVAS_EDGE = 8192;

/** 客户端放大生成图（2k/4k 档位） */
export function upscaleImage(base64Str: string, targetRes: string): Promise<string> {
  if (base64Str.startsWith('http://') || base64Str.startsWith('https://')) {
    return Promise.resolve(base64Str);
  }
  if (targetRes === '1k' || !targetRes) return Promise.resolve(base64Str);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = targetRes === '4k' ? 4 : targetRes === '2k' ? 2 : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      if (w > MAX_UPSCALE_CANVAS_EDGE || h > MAX_UPSCALE_CANVAS_EDGE || w < 1 || h < 1) {
        resolve(base64Str);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64ToImageDataUrl(base64Str);
  });
}
