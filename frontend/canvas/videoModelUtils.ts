/** 视频节点 Veo：当前存 `veo3.1-fast`；旧工程可能仍为 `veo3.1-fast-official` */
export function isVeo31FastVideoModel(m?: string): boolean {
  return m === 'veo3.1-fast' || m === 'veo3.1-fast-official';
}

/** 视频节点 Veo */
export function isVideoVeoStyleModel(m?: string): boolean {
  return isVeo31FastVideoModel(m);
}

/** 视频节点 Sora */
export function isVideoSoraStyleModel(m?: string): boolean {
  return m === 'sora-2-vvip';
}

/** 视频节点 Grok 秒数档 */
export function isVideoGrokDurationStyleModel(m?: string): boolean {
  const x = (m || '').trim();
  return !x || x === 'grok-video-3';
}

/** 判断当前选择的模型是否为即梦视频模型 */
export function isJimengVideoModel(modelOrConfig: unknown): boolean {
  if (!modelOrConfig) return false;

  if (typeof modelOrConfig === 'string') {
    return modelOrConfig.startsWith('jimeng-') || modelOrConfig.includes('jimeng');
  }

  if (typeof modelOrConfig === 'object' && modelOrConfig !== null) {
    const obj = modelOrConfig as Record<string, unknown>;
    return (
      obj.provider === 'jimeng' ||
      obj.providerId === 'jimeng' ||
      (typeof obj.id === 'string' && (obj.id as string).startsWith('jimeng-')) ||
      (typeof obj.model === 'string' && (obj.model as string).startsWith('jimeng-')) ||
      (typeof obj.value === 'string' && (obj.value as string).startsWith('jimeng-'))
    );
  }

  return false;
}

/** 判断是否为即梦生图模型 */
export function isJimengImageModel(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return m.startsWith('jimeng-image-') || m.startsWith('jimeng-') || m.includes('jimeng');
}
