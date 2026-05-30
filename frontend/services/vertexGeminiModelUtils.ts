/** 旧版 GCP Vertex 模型 id（通道已移除；加载旧项目时回落 ToAPIs 等同 API 名） */
const LEGACY_GCP_VERTEX_TO_TOAPIS: Record<string, string> = {
  'gemini-3-pro-image-gcp': 'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-gcp': 'gemini-3.1-flash-image-preview',
};

export function normalizeGcpVertexModelWhenDisabled(modelId: string): string {
  const m = (modelId || '').trim();
  return LEGACY_GCP_VERTEX_TO_TOAPIS[m] ?? m;
}
