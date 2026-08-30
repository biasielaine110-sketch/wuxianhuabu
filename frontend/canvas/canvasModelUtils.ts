/** 画布节点默认图像模型 */
export function defaultCanvasImageModel(): string {
  return 'gpt-image-2-codesonline';
}

/** GPT Image 2：codesonline / hfsy / ToAPIs / 满 e 节点选择时默认 2K */
export function isGptImage2CanvasModelId(id: string): boolean {
  return (
    id === 'gpt-image-2-codesonline' ||
    id === 'gpt-image-2-hfsy' ||
    id === 'gpt-image-2pro-hfsy' ||
    id === 'gpt-image-2' ||
    id === 'gpt-image-2-vip' ||
    id === 'gpt-image-2-official' ||
    id === 'gpt-image-2-manxue'
  );
}

/** hfsyapi.cn GPT Image 2 Pro 4K：选择时默认切到 4K */
export function isHfsyGptImage2Pro4kModel(id: string): boolean {
  return id === 'gpt-image-2pro-4k-hfsy';
}

/** ToAPIs GPT Image 2：支持 low / medium / high quality 选项 */
export function isToApisGptImage2QualityModel(id: string): boolean {
  return id === 'gpt-image-2-vip' || id === 'gpt-image-2-official';
}

/** ToAPIs GPT Image 2 VIP 支持 medium；official 仅保留 low */
export function isToApisGptImage2MediumQualityModel(id: string): boolean {
  return id === 'gpt-image-2-vip';
}

/** 阿里云百炼 Z-Image-Turbo */
export function isAliyunMaasZImageModel(id: string): boolean {
  const m = (id || '').trim();
  return m === 'z-image-turbo-aliyun' || m === 'z-image-turbo';
}

export function isAliyunMaasQwenImageModel(id: string): boolean {
  const m = (id || '').trim();
  return m === 'qwen-image-3.0-pro-aliyun' || m === 'qwen-image-3.0-pro';
}

export function isAliyunMaasImageModel(id: string): boolean {
  return isAliyunMaasZImageModel(id) || isAliyunMaasQwenImageModel(id);
}

/** 满 eAPI Gemini 图像模型 */
export function isManxueGeminiImageModel(id: string): boolean {
  return (
    id === 'gemini-3-pro-image-preview-manxue' ||
    id === 'gemini-3-pro-image-preview-2k-manxue' ||
    id === 'gemini-3-pro-image-preview-4k-manxue' ||
    id === 'gemini-3.1-flash-image-preview-2k-manxue' ||
    id === 'gemini-3.1-flash-image-preview-4k-manxue'
  );
}

/** 满 eAPI GPT Image 2 模型 */
export function isManxueGptImage2Model(id: string): boolean {
  return id === 'gpt-image-2-pro-manxue' || id === 'gpt-image-2-manxue' || id === 'gpt-image-2-4k-manxue';
}

/** 满 e GPT Image 2 4K：选择时默认切到 4K */
export function isManxueGptImage24kModel(id: string): boolean {
  return (id || '').trim() === 'gpt-image-2-4k-manxue';
}

/** ToAPIs Nano-Banana 2（画布 id，上游 gemini-2.5-flash-image-preview） */
export function isToApisNanoBanana2Model(id: string): boolean {
  return (id || '').trim() === 'nano-banana-2';
}

/** ToAPIs Nano-Banana 2 最高 2K；其它模型原样返回 */
export function clampCanvasImageResolution(modelId: string, resolution?: string): string {
  const r = (resolution || '2k').toLowerCase().replace(/\s/g, '');
  if (isToApisNanoBanana2Model(modelId) && r === '4k') return '2k';
  return r || '2k';
}
