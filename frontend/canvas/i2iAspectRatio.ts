/** 图生图「原图尺寸」：按第一张参考图宽高比与分辨率档位计算输出像素 */
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

export type I2iResolvedAspect = {
  /** 各 API 可用的预设比例（原图时取最接近项） */
  aspectRatio: string;
  /** OpenAI edits / 满 e 等使用的 WxH，如 2048x1152 */
  pixelSize?: string;
  sourceWidth?: number;
  sourceHeight?: number;
};

export function isOriginalAspectRatio(aspectRatio?: string): boolean {
  const s = (aspectRatio || '').trim();
  return s === I2I_ASPECT_RATIO_ORIGINAL || s === '原图' || s === '原图尺寸';
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

function roundToMultiple(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

/** 按节点分辨率档位缩放，长边对齐 1k/2k/4k */
export function scaleDimensionsForOutput(
  width: number,
  height: number,
  resolution?: string
): { width: number; height: number } {
  const longEdge: Record<string, number> = { '1k': 1024, '2k': 2048, '4k': 4096 };
  const targetLong = longEdge[(resolution || '2k').toLowerCase()] ?? 2048;
  const scale = targetLong / Math.max(width, height);
  let w = roundToMultiple(width * scale, 64);
  let h = roundToMultiple(height * scale, 64);
  const maxSide = 4096;
  if (w > maxSide) {
    const s = maxSide / w;
    w = maxSide;
    h = roundToMultiple(h * s, 64);
  }
  if (h > maxSide) {
    const s = maxSide / h;
    h = maxSide;
    w = roundToMultiple(w * s, 64);
  }
  return { width: w, height: h };
}

/** 将像素尺寸映射为画布支持的预设画幅比（供 Gemini / ToAPIs 等仅接受比例字符串的 API） */
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

export async function resolveI2iGenerationAspect(
  aspectRatio: string | undefined,
  firstRefBase64: string | undefined,
  resolution?: string
): Promise<I2iResolvedAspect> {
  if (!isOriginalAspectRatio(aspectRatio)) {
    return { aspectRatio: aspectRatio || '16:9' };
  }
  if (!firstRefBase64?.trim()) {
    throw new Error('选择「原图尺寸」时需连接参考图');
  }
  const { width, height } = await loadImageDimensionsFromBase64(firstRefBase64);
  const scaled = scaleDimensionsForOutput(width, height, resolution);
  return {
    aspectRatio: closestCanvasAspectRatio(width, height),
    pixelSize: `${scaled.width}x${scaled.height}`,
    sourceWidth: width,
    sourceHeight: height,
  };
}

export async function resolveI2iGenerationAspectRatio(
  aspectRatio: string | undefined,
  firstRefBase64?: string,
  resolution?: string
): Promise<string> {
  const resolved = await resolveI2iGenerationAspect(aspectRatio, firstRefBase64, resolution);
  return resolved.aspectRatio;
}

export function buildOriginalAspectPromptSuffix(resolved: I2iResolvedAspect): string {
  if (!resolved.pixelSize || !resolved.sourceWidth || !resolved.sourceHeight) return '';
  return (
    `\n\n【画幅】严格保持参考图宽高比 ${resolved.sourceWidth}x${resolved.sourceHeight}，` +
    `输出约 ${resolved.pixelSize} 像素，勿裁切为其它比例。`
  );
}
