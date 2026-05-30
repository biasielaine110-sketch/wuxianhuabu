import type {
  AnnotationNode,
  CanvasNode,
  Director3DNode,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
} from '../types';
import { deleteCanvasAsset } from './canvasAssetStore';
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

/** 删除节点时释放 blob URL；若无其他节点引用则删除 IDB 记录 */
export function revokeNodeCanvasAssets(
  deletedNode: CanvasNode,
  remainingNodes: CanvasNode[]
): void {
  const deletedIds = collectNodeAssetIds(deletedNode);
  if (deletedIds.length === 0) return;

  const stillUsed = new Set<string>();
  for (const n of remainingNodes) {
    collectNodeAssetIds(n).forEach((id) => stillUsed.add(id));
  }

  for (const id of deletedIds) {
    revokeCanvasAssetUrl(id);
    if (!stillUsed.has(id)) {
      void deleteCanvasAsset(id).catch((e) =>
        console.warn('[canvasAssetCleanup] deleteCanvasAsset 失败', id, e)
      );
    }
  }
}
