import { editExistingImage } from '../services/geminiService';
import { normalizeCanvasGenerationImages } from '../services/openaiCompatibleService';
import { generateJimengImage } from '../integrations/jimeng/jimengClient';
import { ensureJimengReady } from '../services/jimengService';
import { isJimengImageModel } from './videoModelUtils';
import { base64ToImageDataUrl } from './auditImageUtils';

export type AuditInpaintGenerateParams = {
  cropBase64: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quality?: string;
  cropWidth?: number;
  cropHeight?: number;
  signal?: AbortSignal;
};

function resolveAspectRatio(
  aspectRatio: string,
  cropWidth?: number,
  cropHeight?: number
): string {
  if (aspectRatio !== 'original') return aspectRatio;
  if (!cropWidth || !cropHeight) return '1:1';
  const r = cropWidth / cropHeight;
  const presets: [string, number][] = [
    ['1:1', 1],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
    ['21:9', 21 / 9],
  ];
  let best = '1:1';
  let bestDiff = Infinity;
  for (const [label, pr] of presets) {
    const diff = Math.abs(r - pr);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

function buildInpaintPrompt(prompt: string): string {
  const text = prompt.trim();
  return `请根据参考图的局部区域，按以下描述重新生成该区域的画面内容，保持风格、光影与构图协调：${text}`;
}

export async function runAuditInpaintGeneration(
  params: AuditInpaintGenerateParams
): Promise<string[]> {
  const { cropBase64, prompt, model, aspectRatio, resolution, quality, cropWidth, cropHeight, signal } =
    params;
  if (!prompt.trim()) throw new Error('请输入重绘描述');

  const enhancedPrompt = buildInpaintPrompt(prompt);
  const rawBase64 = cropBase64.replace(/^data:[^;]+;base64,/, '');
  const resolvedAspect = resolveAspectRatio(aspectRatio, cropWidth, cropHeight);

  if (isJimengImageModel(model)) {
    await ensureJimengReady();
    const result = await generateJimengImage({
      prompt: enhancedPrompt,
      model,
      imageUrl: base64ToImageDataUrl(rawBase64),
      ratio: resolvedAspect,
      resolution,
    });
    const urls = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
    return normalizeCanvasGenerationImages(urls, { signal });
  }

  const images = await editExistingImage(
    [rawBase64],
    enhancedPrompt,
    1,
    model,
    resolvedAspect,
    resolution,
    quality || 'high',
    signal
  );
  return normalizeCanvasGenerationImages(images, { signal });
}
