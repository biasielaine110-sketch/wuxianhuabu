import type { CanvasNode } from '../types';
import type { ToApisVideoModelId } from '../services/openaiCompatibleService';
import { MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL_ID } from '../services/openaiCompatibleService';

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

/** 满 eAPI（manxueapi.com）C-Dance2 Pro 720 */
export const MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL = MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL_ID;

export function isManxueCDance2Pro720VideoModel(m?: string): boolean {
  const x = (m || '').trim();
  return x === MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL || x === 'c-dance2-pro-720';
}

export function isManxueGrokImagineVideoModel(m?: string): boolean {
  const x = (m || '').trim();
  return x === 'grok-imagine-video-1.5-preview' || x === 'grok-imagine-1.5';
}

/** 视频节点 Grok 秒数档（旧 grok-video-3；现已映射到 grok-video-1.5） */
export function isVideoGrokDurationStyleModel(m?: string): boolean {
  return (m || '').trim() === 'grok-video-3';
}

export function isToApisGrokVideo15Model(m?: string): boolean {
  return (m || '').trim() === 'grok-video-1.5';
}

export function isToApisSeedance2MiniModel(m?: string): boolean {
  return (m || '').trim() === 'seedance-2-mini';
}

export function isToApisSeedance25Model(m?: string): boolean {
  return (m || '').trim() === 'seedance-2-5';
}

export function isToApisKlingV3OmniModel(m?: string): boolean {
  return (m || '').trim() === 'kling-v3-omni';
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

export function isVideoDoubaoFamilyModel(vm: string): boolean {
  return vm === 'doubao-seedance-1-5-pro';
}

/** 已下线 AIID 视频模型 → 当前替代 */
export function normalizeLegacyVideoModelId(modelId: string): string {
  const m = (modelId || '').trim();
  if (m === 'doubao-seedance-2-0-260128' || m === 'doubao-seedance-2-0-fast-260128') return 'seedance-2';
  if (m === 'grok-imagine-video-1.5-preview-aiid') return 'hfsy-grok-imagine-video-1.5';
  if (m === 'grok-imagine-video-1.5-preview' || m === 'grok-imagine-1.5') return MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL;
  if (
    m === 'veo3.1-fast' ||
    m === 'veo3.1-fast-official' ||
    m === 'grok-video-3' ||
    m === 'grok-video-1.5-preview' ||
    m === 'sora-2-vvip'
  ) {
    return 'grok-video-1.5';
  }
  if (m === 'hfsy-sd-2' || m === 'hfsy-sd-2-fast') return 'hfsy-sd-2.5-720';
  return m;
}

export function isHfsySd2VideoModel(vm?: string): boolean {
  return (
    vm === 'hfsy-sd-2' ||
    vm === 'hfsy-sd-2-fast' ||
    vm === 'hfsy-sd-2-vip' ||
    vm === 'hfsy-sd-2-vip-720' ||
    vm === 'hfsy-sd-2.5-480' ||
    vm === 'hfsy-sd-2.5-720' ||
    vm === 'hfsy-sd-2-mini-480' ||
    vm === 'hfsy-sd-2-mini-720' ||
    vm === 'hfsy-sd-2-1080-cheap'
  );
}

export function isHfsyMinimaxH3VideoModel(vm?: string): boolean {
  return vm === 'hfsy-minimax-h3';
}

export function isHfsyGrokImagineVideoModel(vm?: string): boolean {
  return vm === 'hfsy-grok-imagine-video-1.5';
}

export function isHfsyVideoModel(vm?: string): boolean {
  return isHfsySd2VideoModel(vm) || isHfsyMinimaxH3VideoModel(vm) || isHfsyGrokImagineVideoModel(vm);
}

/** 切换视频模型时同步时长、分辨率、画幅等默认值 */
export function getVideoModelSwitchUpdates(mRaw: string, node: CanvasNode): Partial<CanvasNode> {
  const m = normalizeLegacyVideoModelId(mRaw);
  const updates: Partial<CanvasNode> = { model: m };
  if (m === 'sora-2-vvip') {
    updates.videoResolution = '720p';
    const d = node.videoDuration ?? 10;
    updates.videoDuration = d === 4 || d === 8 || d === 12 ? d : 8;
    const ar = node.aspectRatio || '16:9';
    if (ar !== '16:9' && ar !== '9:16') updates.aspectRatio = '16:9';
  } else if (m === 'veo3.1-fast') {
    updates.videoDuration = 8;
    updates.videoResolution =
      node.videoResolution === '1080p' || node.videoResolution === '4k'
        ? node.videoResolution
        : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'doubao-seedance-1-5-pro') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [4, 5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution =
      node.videoResolution === '480p' || node.videoResolution === '1080p'
        ? node.videoResolution
        : '720p';
  } else if (m === 'seedance-2') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [4, 5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = node.videoResolution === '1080p' ? '1080p' : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'seedance-2-fast') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [4, 5, 8, 10, 12].includes(d) ? d : 8;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (isHfsyMinimaxH3VideoModel(m)) {
    const d = node.videoDuration ?? 5;
    updates.videoDuration = [5, 8, 10, 12, 15].includes(d) ? d : 5;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (ar !== '16:9' && ar !== '9:16') updates.aspectRatio = '16:9';
  } else if (isHfsyGrokImagineVideoModel(m)) {
    const d = node.videoDuration ?? 10;
    updates.videoDuration = d >= 1 && d <= 15 ? d : 10;
    updates.videoResolution =
      node.videoResolution === '480p' || node.videoResolution === '1080p' ? node.videoResolution : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'hfsy-sd-2.5-480' || m === 'hfsy-sd-2-mini-480') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = '480p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'hfsy-sd-2.5-720' || m === 'hfsy-sd-2-vip-720' || m === 'hfsy-sd-2-mini-720') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'hfsy-sd-2-1080-cheap') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = '1080p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (isHfsySd2VideoModel(m)) {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = node.videoResolution === '480p' || node.videoResolution === '1080p' ? node.videoResolution : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'gemini-omni-flash') {
    const d = node.videoDuration ?? 6;
    updates.videoDuration = [6, 10].includes(d) ? d : 6;
    updates.videoResolution = '720p';
  } else if (isToApisGrokVideo15Model(m)) {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = d >= 1 && d <= 15 ? d : 8;
    updates.videoResolution = node.videoResolution === '480p' ? '480p' : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (isToApisSeedance2MiniModel(m)) {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [4, 5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (isToApisSeedance25Model(m)) {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [4, 5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (isToApisKlingV3OmniModel(m)) {
    const d = node.videoDuration ?? 5;
    updates.videoDuration = d >= 3 && d <= 15 ? d : 5;
    updates.videoResolution = node.videoResolution === '1080p' ? '1080p' : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (isManxueCDance2Pro720VideoModel(m)) {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [5, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
  } else {
    const d = node.videoDuration ?? 8;
    if (d === 4 || d === 8 || d === 12) updates.videoDuration = 10;
    if (node.videoResolution === '1080p' || node.videoResolution === '4k') {
      updates.videoResolution = '720p';
    }
  }
  return updates;
}

/** 视频节点模型 → ToAPIs 模型 */
export function videoNodeModelToToApis(m?: string): ToApisVideoModelId {
  const vm = normalizeLegacyVideoModelId(m || '').trim();
  if (vm === 'sora-2-vvip') return 'sora-2-vvip';
  if (isVeo31FastVideoModel(vm)) return 'veo3.1-fast';
  if (vm === 'doubao-seedance-1-5-pro') return 'doubao-seedance-1-5-pro';
  if (vm === 'seedance-2' || vm === 'seedance-2-fast' || vm === 'seedance-2-mini' || vm === 'seedance-2-5') {
    return vm as ToApisVideoModelId;
  }
  if (vm === 'kling-v3-omni') return 'kling-v3-omni';
  if (isHfsyVideoModel(vm)) return vm as ToApisVideoModelId;
  if (vm === 'gemini-omni-flash') return 'gemini-omni-flash';
  if (vm === 'grok-video-1.5' || vm === 'grok-video-1.5-preview') return 'grok-video-1.5';
  if (isManxueCDance2Pro720VideoModel(vm) || isManxueGrokImagineVideoModel(vm)) {
    return MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL as ToApisVideoModelId;
  }
  if (vm === 'jimeng-video-v3' || vm === 'jimeng-image-to-video') return vm as ToApisVideoModelId;
  return 'grok-video-1.5';
}
