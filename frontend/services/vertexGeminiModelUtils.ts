/** GCP Vertex 图像模型（与 ToAPIs / 满 e / AI Studio 密钥通道分离，UI id 带 -gcp 后缀） */
export const VERTEX_GEMINI_PRO_IMAGE_MODEL_ID = 'gemini-3-pro-image-gcp';
export const VERTEX_GEMINI_FLASH_IMAGE_MODEL_ID = 'gemini-3.1-flash-image-gcp';

const VERTEX_GEMINI_IMAGE_MODEL_IDS = new Set([
  VERTEX_GEMINI_PRO_IMAGE_MODEL_ID,
  VERTEX_GEMINI_FLASH_IMAGE_MODEL_ID,
]);

/** 画布 / 对话生图：是否为 GCP Vertex 赠金通道 */
export function isVertexGeminiImageModel(modelId: string): boolean {
  return VERTEX_GEMINI_IMAGE_MODEL_IDS.has((modelId || '').trim());
}

/** UI model id → Vertex API 真实模型名 */
export function resolveVertexGeminiApiModelId(modelId: string): string {
  const m = (modelId || '').trim();
  if (m === VERTEX_GEMINI_PRO_IMAGE_MODEL_ID) return 'gemini-3-pro-image-preview';
  if (m === VERTEX_GEMINI_FLASH_IMAGE_MODEL_ID) return 'gemini-3.1-flash-image-preview';
  return m.replace(/-gcp$/, '');
}
