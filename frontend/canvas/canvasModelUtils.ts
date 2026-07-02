/** 画布节点默认图像模型 */
export function defaultCanvasImageModel(): string {
  return 'gpt-image-2-codesonline';
}

/** GPT Image 2：君澜 / codesonline / hfsy / ToAPIs / 满 e 节点选择时默认 2K */
export function isGptImage2CanvasModelId(id: string): boolean {
  return (
    id === 'gpt-image-2-junlan' ||
    id === 'gpt-image-2-codesonline' ||
    id === 'gpt-image-2-hfsy' ||
    id === 'gpt-image-2' ||
    id === 'gpt-image-2-vip' ||
    id === 'gpt-image-2-official' ||
    id === 'gpt-image-2-manxue'
  );
}

/** ToAPIs GPT Image 2：支持 low / medium / high quality 选项 */
export function isToApisGptImage2QualityModel(id: string): boolean {
  return id === 'gpt-image-2-vip' || id === 'gpt-image-2-official';
}

/** ToAPIs GPT Image 2 VIP 支持 medium；official 仅保留 low */
export function isToApisGptImage2MediumQualityModel(id: string): boolean {
  return id === 'gpt-image-2-vip';
}

/** 满 eAPI Gemini 图像模型 */
export function isManxueGeminiImageModel(id: string): boolean {
  return (
    id === 'gemini-3-pro-image-preview-2k-manxue' ||
    id === 'gemini-3-pro-image-preview-4k-manxue' ||
    id === 'gemini-3.1-flash-image-preview-2k-manxue' ||
    id === 'gemini-3.1-flash-image-preview-4k-manxue'
  );
}

/** 满 eAPI GPT Image 2 模型 */
export function isManxueGptImage2Model(id: string): boolean {
  return id === 'gpt-image-2-pro-manxue' || id === 'gpt-image-2-manxue';
}
