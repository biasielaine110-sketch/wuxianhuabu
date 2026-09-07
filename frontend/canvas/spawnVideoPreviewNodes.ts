import type { CanvasNode, Edge } from '../types';
import { DEEPWHITE_UPSCALER_UI_ID } from '../services/deepwhiteVideo';

/** 视频预览节点默认尺寸（对齐图片预览窗） */
export const VIDEO_PREVIEW_NODE_WIDTH = 960;
export const VIDEO_PREVIEW_NODE_HEIGHT = 1056;

export type BuildVideoPreviewNodeInput = {
  id?: string;
  videos: string[];
  x: number;
  y: number;
  width?: number;
  height?: number;
  prompt?: string;
  aspectRatio?: string;
  videoResolution?: CanvasNode['videoResolution'];
  videoDuration?: number;
  currentVideoIndex?: number;
  isGenerating?: boolean;
};

export function isVideoPreviewNode(node: Pick<CanvasNode, 'type' | 'videoPreviewOnly'>): boolean {
  return node.type === 'video' && !!node.videoPreviewOnly;
}

/** 拖入 / 复制 / 截取产出的纯预览视频节点（无生成面板） */
export function buildVideoPreviewNode(input: BuildVideoPreviewNodeInput): CanvasNode {
  const videos = (input.videos || []).filter(Boolean);
  return {
    id: input.id || `video-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: 'video',
    x: input.x,
    y: input.y,
    width: input.width ?? VIDEO_PREVIEW_NODE_WIDTH,
    height: input.height ?? VIDEO_PREVIEW_NODE_HEIGHT,
    prompt: input.prompt || '',
    images: [],
    aspectRatio: input.aspectRatio || '16:9',
    resolution: '2k',
    imageCount: 1,
    model: 'grok-video-1.5',
    viewMode: 'single',
    currentImageIndex: 0,
    videos,
    currentVideoIndex: Math.min(
      Math.max(0, input.currentVideoIndex ?? 0),
      Math.max(0, videos.length - 1),
    ),
    videoDuration: input.videoDuration ?? 8,
    videoResolution: input.videoResolution || '720p',
    isGenerating: input.isGenerating ?? false,
    videoPreviewOnly: true,
  };
}

/** 在预览视频右侧创建超分任务节点并连线 */
export function buildVideoUpscaleJobFromPreview(
  source: CanvasNode,
): { node: CanvasNode; edge: Edge } {
  const newId = `video-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const node: CanvasNode = {
    id: newId,
    type: 'video',
    x: source.x + source.width + 48,
    y: source.y,
    width: 1200,
    height: 1400,
    prompt: '',
    images: [],
    aspectRatio: source.aspectRatio || '16:9',
    resolution: source.resolution || '2k',
    imageCount: 1,
    model: DEEPWHITE_UPSCALER_UI_ID,
    viewMode: 'single',
    currentImageIndex: 0,
    videos: [],
    currentVideoIndex: 0,
    videoDuration: source.videoDuration ?? 8,
    videoResolution: source.videoResolution || '1080p',
    isGenerating: false,
    videoPreviewOnly: false,
  };
  const edge: Edge = {
    id: `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sourceId: source.id,
    targetId: newId,
  };
  return { node, edge };
}
