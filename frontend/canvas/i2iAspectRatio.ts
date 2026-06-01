/** 图生图「原图」画幅：按第一张参考图宽高比匹配最接近的预设比例 */
export const I2I_ASPECT_RATIO_ORIGINAL = 'original';

const CANVAS_ASPECT_RATIOS: { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '21:9', value: 21 / 9 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
  { label: '2:1', value: 2 },
  { label: '1:2', value: 0.5 },
];

export function isOriginalAspectRatio(aspectRatio?: string): boolean {
  const s = (aspectRatio || '').trim();
  return s === I2I_ASPECT_RATIO_ORIGINAL || s === '原图';
}

export function loadImageDimensionsFromBase64(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const trimmed = base64.trim();
    const raw = trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
    const mime = trimmed.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('参考图尺寸无效'));
        return;
      }
      resolve({ width: w, height: h });
    };
    img.onerror = () => reject(new Error('参考图解码失败'));
    img.src = `data:${mime};base64,${raw}`;
  });
}

/** 将像素尺寸映射为画布支持的预设画幅比（供各 API 使用） */
export function closestCanvasAspectRatio(width: number, height: number): string {
  const r = width / height;
  let best = CANVAS_ASPECT_RATIOS[0]!;
  let minDiff = Infinity;
  for (const item of CANVAS_ASPECT_RATIOS) {
    const diff = Math.abs(Math.log(r) - Math.log(item.value));
    if (diff < minDiff) {
      minDiff = diff;
      best = item;
    }
  }
  return best.label;
}

export async function resolveI2iGenerationAspectRatio(
  aspectRatio: string | undefined,
  firstRefBase64?: string
): Promise<string> {
  if (!isOriginalAspectRatio(aspectRatio)) {
    return aspectRatio || '16:9';
  }
  if (!firstRefBase64?.trim()) {
    throw new Error('选择「原图」画幅时需连接参考图');
  }
  const { width, height } = await loadImageDimensionsFromBase64(firstRefBase64);
  return closestCanvasAspectRatio(width, height);
}
