import type {
  AnnotationNode,
  CanvasNode,
  ChatNode,
  Director3DNode,
  Edge,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
} from '../types';

export type CanvasHistoryEntry = {
  nodes: CanvasNode[];
  edges: Edge[];
  selectedIds: string[];
};

function hasMediaPayload(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

/** 剥离节点中所有图片/媒体 base64，用于撤销栈存储（防止 OOM）
 * options.keepVideos: true 时保留 videos[]（远程 https URL 非 base64，应原样保存以供刷新后回放） */
export function stripImagesFromNodes(
  nodes: CanvasNode[],
  options?: { keepVideos?: boolean }
): CanvasNode[] {
  const keepVideos = options?.keepVideos === true;
  return nodes.map((n) => {
    const n2 = { ...n } as CanvasNode;
    if (n2.images?.length) {
      n2.images = n2.images.map(() => '');
    }
    if (n2.videos?.length && !keepVideos) {
      n2.videos = n2.videos.map(() => '');
    }
    if (n2.audio) n2.audio = '';
    if (n2.audioUrl) n2.audioUrl = '';

    const pn = n as PanoramaNode;
    if (pn.panoramaImage) (n2 as PanoramaNode).panoramaImage = '';

    const dn = n as Director3DNode;
    if (dn.backgroundImage) (n2 as Director3DNode).backgroundImage = '';

    const an = n as AnnotationNode;
    if (an.sourceImage) (n2 as AnnotationNode).sourceImage = '';

    const gsn = n as GridSplitNode;
    if (gsn.inputImage) (n2 as GridSplitNode).inputImage = '';
    if (gsn.outputImages?.length) {
      (n2 as GridSplitNode).outputImages = gsn.outputImages.map(() => '');
    }

    const gmn = n as GridMergeNode;
    if (gmn.inputImages?.length) {
      (n2 as GridMergeNode).inputImages = gmn.inputImages.map(() => '');
    }
    if (gmn.outputImage) (n2 as GridMergeNode).outputImage = '';

    const ptn = n as PanoramaT2iNode;
    if (ptn.panoramaImage) (n2 as PanoramaT2iNode).panoramaImage = '';

    if (n.type === 'chat') {
      const cn = n as ChatNode;
      if (cn.messages?.length) {
        (n2 as ChatNode).messages = cn.messages.map((m) => ({
          ...m,
          image: m.image ? '' : undefined,
          images: m.images?.length ? m.images.map(() => '') : undefined,
        }));
      }
    }

    if (dn.figures?.length) {
      (n2 as Director3DNode).figures = dn.figures.map((f) => ({ ...f, image: '' }));
    }

    return n2;
  });
}

function mergeNodeMediaFields(historyNode: CanvasNode, currentNode: CanvasNode): CanvasNode {
  const merged = { ...historyNode } as CanvasNode;

  if (currentNode.imageAssetIds?.some((id) => id.length > 0)) {
    merged.imageAssetIds = currentNode.imageAssetIds;
  }
  if (currentNode.images?.some(hasMediaPayload)) {
    merged.images = currentNode.images;
  }
  if (currentNode.videos?.some(hasMediaPayload)) {
    merged.videos = currentNode.videos;
  }
  if (hasMediaPayload(currentNode.audio)) merged.audio = currentNode.audio;
  if (hasMediaPayload(currentNode.audioUrl)) merged.audioUrl = currentNode.audioUrl;

  const curP = currentNode as PanoramaNode;
  const histP = merged as PanoramaNode;
  if (hasMediaPayload(curP.panoramaImage)) histP.panoramaImage = curP.panoramaImage;
  if (curP.panoramaImageAssetId) histP.panoramaImageAssetId = curP.panoramaImageAssetId;

  const curD = currentNode as Director3DNode;
  const histD = merged as Director3DNode;
  if (hasMediaPayload(curD.backgroundImage)) histD.backgroundImage = curD.backgroundImage;
  if (curD.backgroundImageAssetId) histD.backgroundImageAssetId = curD.backgroundImageAssetId;
  if (curD.figures?.some((f) => hasMediaPayload(f.image))) {
    histD.figures = curD.figures;
  }

  const curA = currentNode as AnnotationNode;
  const histA = merged as AnnotationNode;
  if (hasMediaPayload(curA.sourceImage)) histA.sourceImage = curA.sourceImage;
  if (curA.sourceImageAssetId) histA.sourceImageAssetId = curA.sourceImageAssetId;

  const curGs = currentNode as GridSplitNode;
  const histGs = merged as GridSplitNode;
  if (hasMediaPayload(curGs.inputImage)) histGs.inputImage = curGs.inputImage;
  if (curGs.inputImageAssetId) histGs.inputImageAssetId = curGs.inputImageAssetId;
  if (curGs.outputImages?.some(hasMediaPayload)) histGs.outputImages = curGs.outputImages;
  if (curGs.outputImageAssetIds?.some((id) => id.length > 0)) {
    histGs.outputImageAssetIds = curGs.outputImageAssetIds;
  }

  const curGm = currentNode as GridMergeNode;
  const histGm = merged as GridMergeNode;
  if (curGm.inputImages?.some(hasMediaPayload)) histGm.inputImages = curGm.inputImages;
  if (curGm.inputImageAssetIds?.some((id) => id.length > 0)) {
    histGm.inputImageAssetIds = curGm.inputImageAssetIds;
  }
  if (hasMediaPayload(curGm.outputImage)) histGm.outputImage = curGm.outputImage;
  if (curGm.outputImageAssetId) histGm.outputImageAssetId = curGm.outputImageAssetId;

  const curPt = currentNode as PanoramaT2iNode;
  const histPt = merged as PanoramaT2iNode;
  if (hasMediaPayload(curPt.panoramaImage)) histPt.panoramaImage = curPt.panoramaImage;
  if (curPt.panoramaImageAssetId) histPt.panoramaImageAssetId = curPt.panoramaImageAssetId;

  if (historyNode.type === 'chat' && currentNode.type === 'chat') {
    const curC = currentNode as ChatNode;
    const histC = merged as ChatNode;
    if (curC.messages?.length && histC.messages?.length) {
      histC.messages = histC.messages.map((hm, i) => {
        const cm = curC.messages![i];
        if (!cm) return hm;
        const next = { ...hm };
        if (hasMediaPayload(cm.image)) next.image = cm.image;
        if (cm.images?.some(hasMediaPayload)) next.images = cm.images;
        return next;
      });
    }
  }

  return merged;
}

/** 撤销时：恢复历史结构，保留当前节点中的媒体数据 */
export function mergeHistoryNodesWithCurrentImages(
  historyNodes: CanvasNode[],
  currentNodes: CanvasNode[]
): CanvasNode[] {
  const currentById = new Map(currentNodes.map((n) => [n.id, n]));
  return historyNodes.map((hNode) => {
    const cur = currentById.get(hNode.id);
    if (!cur) return hNode;
    return mergeNodeMediaFields(hNode, cur);
  });
}
