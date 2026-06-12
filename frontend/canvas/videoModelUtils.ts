import type { CanvasNode } from '../types';
import type { ToApisVideoModelId } from '../services/openaiCompatibleService';
import { MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID } from '../services/openaiCompatibleService';

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

/** 满 eAPI（manxueapi.com）Grok Imagine Video 1.5 Preview */
export const MANXUE_GROK_IMAGINE_VIDEO_MODEL = MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID;

export function isManxueGrokImagineVideoModel(m?: string): boolean {
  return m === MANXUE_GROK_IMAGINE_VIDEO_MODEL;
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

export function isVideoDoubaoFamilyModel(vm: string): boolean {
  return vm === 'doubao-seedance-1-5-pro' || vm === 'doubao-seedance-2-0-260128' || vm === 'doubao-seedance-2-0-fast-260128';
}

export function isVideoDoubaoSeedance2Model(vm: string): boolean {
  return vm === 'doubao-seedance-2-0-260128' || vm === 'doubao-seedance-2-0-fast-260128';
}

/** 切换视频模型时同步时长、分辨率、画幅等默认值 */
export function getVideoModelSwitchUpdates(m: string, node: CanvasNode): Partial<CanvasNode> {
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
  } else if (m === 'gemini-omni-flash') {
    const d = node.videoDuration ?? 6;
    updates.videoDuration = [6, 10].includes(d) ? d : 6;
    updates.videoResolution = '720p';
  } else if (m === 'grok-video-1.5-preview') {
    // ToAPIs grok-video-1.5-preview：xAI Grok Video 1.5（grok-video-3 同款接口）
    // 时长档 6/10/15/20/25/30，分辨率 720p
    const d = node.videoDuration ?? 10;
    const allowed = [6, 10, 15, 20, 25, 30];
    updates.videoDuration = allowed.includes(d) ? d : 10;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === MANXUE_GROK_IMAGINE_VIDEO_MODEL) {
    const d = node.videoDuration ?? 10;
    updates.videoDuration = [10, 15].includes(d) ? d : 10;
    updates.videoResolution = '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
  } else if (m === 'doubao-seedance-2-0-260128' || m === 'doubao-seedance-2-0-fast-260128') {
    const d = node.videoDuration ?? 8;
    updates.videoDuration = [4, 6, 8, 10, 12, 15].includes(d) ? d : 8;
    updates.videoResolution =
      node.videoResolution === '480p' || node.videoResolution === '1080p'
        ? node.videoResolution
        : '720p';
    const ar = node.aspectRatio || '16:9';
    if (!['16:9', '9:16', '1:1', '4:3', '3:4'].includes(ar)) updates.aspectRatio = '16:9';
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
  const vm = (m || '').trim();
  if (vm === 'sora-2-vvip') return 'sora-2-vvip';
  if (isVeo31FastVideoModel(vm)) return 'veo3.1-fast';
  if (vm === 'doubao-seedance-1-5-pro') return 'doubao-seedance-1-5-pro';
  if (vm === 'doubao-seedance-2-0-260128' || vm === 'doubao-seedance-2-0-fast-260128') return vm as ToApisVideoModelId;
  if (vm === 'seedance-2' || vm === 'seedance-2-fast') return vm as ToApisVideoModelId;
  if (vm === 'gemini-omni-flash') return 'gemini-omni-flash';
  if (vm === 'grok-video-1.5-preview') return 'grok-video-1.5-preview';
  if (isManxueGrokImagineVideoModel(vm)) return MANXUE_GROK_IMAGINE_VIDEO_MODEL as ToApisVideoModelId;
  if (vm === 'jimeng-video-v3' || vm === 'jimeng-image-to-video') return vm as ToApisVideoModelId;
  return 'grok-video-3';
}
