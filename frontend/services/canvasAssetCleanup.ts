import type {
  AnnotationNode,
  CanvasNode,
  Director3DNode,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
} from '../types';
import { revokeCanvasAssetUrl } from './canvasAssetResolver';

/** 收集节点引用的所有 canvas assetId（用于删除时回收） */
export function collectNodeAssetIds(node: CanvasNode): string[] {
  const ids: string[] = [];
  const add = (id?: string) => {
    if (id) ids.push(id);
  };
  node.imageAssetIds?.forEach(add);
  add((node as PanoramaNode).panoramaImageAssetId);
  add((node as PanoramaT2iNode).panoramaImageAssetId);
  add((node as AnnotationNode).sourceImageAssetId);
  add((node as Director3DNode).backgroundImageAssetId);
  const gsn = node as GridSplitNode;
  add(gsn.inputImageAssetId);
  gsn.outputImageAssetIds?.forEach(add);
  const gmn = node as GridMergeNode;
  gmn.inputImageAssetIds?.forEach(add);
  add(gmn.outputImageAssetId);
  return [...new Set(ids)];
}

/** 删除节点时只释放 blob URL；IDB 资产保留，避免撤销/多项目/草稿引用变成缺失 assetId。 */
export function revokeNodeCanvasAssets(
  deletedNode: CanvasNode,
  remainingNodes: CanvasNode[]
): void {
  const deletedIds = collectNodeAssetIds(deletedNode);
  if (deletedIds.length === 0) return;

  for (const id of deletedIds) {
    revokeCanvasAssetUrl(id);
  }
}
