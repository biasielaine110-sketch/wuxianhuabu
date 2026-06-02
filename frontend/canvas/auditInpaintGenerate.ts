import { editExistingImage } from '../services/geminiService';
import { normalizeCanvasGenerationImages } from '../services/openaiCompatibleService';
import { generateJimengImage } from '../integrations/jimeng/jimengClient';
import { ensureJimengReady } from '../services/jimengService';
import { isJimengImageModel } from './videoModelUtils';
import { base64ToImageDataUrl } from './auditImageUtils';
import { stripAuditImageBase64 } from './auditInpaintRefs';

export type AuditInpaintGenerateParams = {
  cropBase64: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quality?: string;
  cropWidth?: number;
  cropHeight?: number;
  /** 除选区 crop 外的整图参考（base64，不含 data: 前缀） */
  extraReferenceBase64?: string[];
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

function buildInpaintPrompt(prompt: string, extraRefCount: number): string {
  const text = prompt.trim();
  const refNote =
    extraRefCount > 0
      ? `除第一张为待重绘局部选区外，另有 ${extraRefCount} 张参考图供人物、场景与风格对照。`
      : '';
  return `请根据参考图的局部区域，按以下描述重新生成该区域的画面内容，保持风格、光影与构图协调。${refNote ? `${refNote} ` : ''}${text}`;
}

export async function runAuditInpaintGeneration(
  params: AuditInpaintGenerateParams
): Promise<string[]> {
  const {
    cropBase64,
    prompt,
    model,
    aspectRatio,
    resolution,
    quality,
    cropWidth,
    cropHeight,
    extraReferenceBase64 = [],
    signal,
  } = params;
  if (!prompt.trim()) throw new Error('请输入重绘描述');

  const rawBase64 = stripAuditImageBase64(cropBase64);
  const extraRefs = extraReferenceBase64.map(stripAuditImageBase64).filter(Boolean);
  const enhancedPrompt = buildInpaintPrompt(prompt, extraRefs.length);
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

  // 多图参考时限制张数，降低 multipart 体积与网关超时风险
  const editImages = [rawBase64, ...extraRefs].slice(0, 5);

  const images = await editExistingImage(
    editImages,
    enhancedPrompt,
    1,
    model,
    resolvedAspect,
    resolution,
    quality || 'high',
    undefined,
    signal
  );
  return normalizeCanvasGenerationImages(images, { signal });
}
