import type {
  AnnotationNode,
  CanvasNode,
  Director3DNode,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
} from '../types';
import { getCanvasAssetRecord, putCanvasAssetFromBase64 } from './canvasAssetStore';

export const IMAGE_OFFLOAD_MIN_CHARS = 48_000;
/** 宫格拆分/合并等多图数组：单格体积较小也 offload */
const GRID_ARRAY_OFFLOAD_MIN_CHARS = 1;

function shouldOffload(value: string | undefined, existingAssetId?: string): boolean {
  return !!value && value.length >= IMAGE_OFFLOAD_MIN_CHARS && !existingAssetId;
}

function shouldOffloadGridSlot(value: string | undefined, existingAssetId?: string): boolean {
  return !!value && value.length >= GRID_ARRAY_OFFLOAD_MIN_CHARS && !existingAssetId;
}

function normalizeAssetIds(node: CanvasNode, len: number): string[] {
  const ids = [...(node.imageAssetIds ?? [])];
  while (ids.length < len) ids.push('');
  return ids.slice(0, len);
}

function normalizeStringAssetIds(existing: string[] | undefined, len: number): string[] {
  const ids = [...(existing ?? [])];
  while (ids.length < len) ids.push('');
  return ids.slice(0, len);
}

async function offloadStringArray(
  values: string[],
  assetIds: string[] | undefined,
  label: string,
  nodeId: string,
  minChars: number
): Promise<{ values: string[]; assetIds: string[]; changed: boolean }> {
  const newValues = [...values];
  const newIds = normalizeStringAssetIds(assetIds, values.length);
  let changed = false;
  for (let i = 0; i < newValues.length; i++) {
    const im = newValues[i];
    if (!im || im.length < minChars || newIds[i]) continue;
    try {
      const newId = await putCanvasAssetFromBase64(im);
      const verified = await getCanvasAssetRecord(newId);
      if (!verified?.blob?.size) {
        console.warn(`[canvasAssetSync] ${label} offload 校验失败`, nodeId, i);
        continue;
      }
      newIds[i] = newId;
      newValues[i] = '';
      changed = true;
    } catch (e) {
      console.warn(`[canvasAssetSync] ${label} offload 失败`, nodeId, i, e);
    }
  }
  return { values: newValues, assetIds: newIds, changed };
}

/** 将节点内大体积 base64 媒体 offload 到 IDB */
export async function buildNodeMediaOffloadPatch(
  node: CanvasNode
): Promise<Partial<CanvasNode> | null> {
  const patch: Partial<CanvasNode> = {};
  let changed = false;

  const images = node.images;
  if (images?.length) {
    const newImages = [...images];
    const assetIds = normalizeAssetIds(node, images.length);
    for (let i = 0; i < images.length; i++) {
      const im = images[i];
      if (!shouldOffload(im, assetIds[i])) continue;
      try {
        const newId = await putCanvasAssetFromBase64(im);
        const verified = await getCanvasAssetRecord(newId);
        if (!verified?.blob?.size) {
          console.warn('[canvasAssetSync] images offload 校验失败', node.id, i);
          continue;
        }
        assetIds[i] = newId;
        newImages[i] = '';
        changed = true;
      } catch (e) {
        console.warn('[canvasAssetSync] images offload 失败', node.id, i, e);
      }
    }
    if (changed) {
      patch.images = newImages;
      patch.imageAssetIds = assetIds;
    }
  }

  const pn = node as PanoramaNode;
  if (shouldOffload(pn.panoramaImage, pn.panoramaImageAssetId)) {
    try {
      (patch as PanoramaNode).panoramaImageAssetId = await putCanvasAssetFromBase64(
        pn.panoramaImage!
      );
      (patch as PanoramaNode).panoramaImage = '';
      changed = true;
    } catch (e) {
      console.warn('[canvasAssetSync] panorama offload 失败', node.id, e);
    }
  }

  const ptn = node as PanoramaT2iNode;
  if (shouldOffload(ptn.panoramaImage, ptn.panoramaImageAssetId)) {
    try {
      (patch as PanoramaT2iNode).panoramaImageAssetId = await putCanvasAssetFromBase64(
        ptn.panoramaImage!
      );
      (patch as PanoramaT2iNode).panoramaImage = '';
      changed = true;
    } catch (e) {
      console.warn('[canvasAssetSync] panoramaT2i offload 失败', node.id, e);
    }
  }

  const an = node as AnnotationNode;
  if (shouldOffload(an.sourceImage, an.sourceImageAssetId)) {
    try {
      (patch as AnnotationNode).sourceImageAssetId = await putCanvasAssetFromBase64(
        an.sourceImage!
      );
      (patch as AnnotationNode).sourceImage = '';
      changed = true;
    } catch (e) {
      console.warn('[canvasAssetSync] annotation offload 失败', node.id, e);
    }
  }

  const dn = node as Director3DNode;
  if (shouldOffload(dn.backgroundImage, dn.backgroundImageAssetId)) {
    try {
      (patch as Director3DNode).backgroundImageAssetId = await putCanvasAssetFromBase64(
        dn.backgroundImage!
      );
      (patch as Director3DNode).backgroundImage = '';
      changed = true;
    } catch (e) {
      console.warn('[canvasAssetSync] director3d bg offload 失败', node.id, e);
    }
  }

  const gsn = node as GridSplitNode;
  if (shouldOffload(gsn.inputImage, gsn.inputImageAssetId)) {
    try {
      (patch as GridSplitNode).inputImageAssetId = await putCanvasAssetFromBase64(
        gsn.inputImage!
      );
      (patch as GridSplitNode).inputImage = '';
      changed = true;
    } catch (e) {
      console.warn('[canvasAssetSync] gridSplit input offload 失败', node.id, e);
    }
  }
  if (gsn.outputImages?.length) {
    const out = await offloadStringArray(
      gsn.outputImages,
      gsn.outputImageAssetIds,
      'gridSplit output',
      node.id,
      GRID_ARRAY_OFFLOAD_MIN_CHARS
    );
    if (out.changed) {
      (patch as GridSplitNode).outputImages = out.values;
      (patch as GridSplitNode).outputImageAssetIds = out.assetIds;
      changed = true;
    }
  }

  const gmn = node as GridMergeNode;
  if (gmn.inputImages?.length) {
    const ins = await offloadStringArray(
      gmn.inputImages,
      gmn.inputImageAssetIds,
      'gridMerge input',
      node.id,
      GRID_ARRAY_OFFLOAD_MIN_CHARS
    );
    if (ins.changed) {
      (patch as GridMergeNode).inputImages = ins.values;
      (patch as GridMergeNode).inputImageAssetIds = ins.assetIds;
      changed = true;
    }
  }
  if (shouldOffload(gmn.outputImage, gmn.outputImageAssetId)) {
    try {
      (patch as GridMergeNode).outputImageAssetId = await putCanvasAssetFromBase64(
        gmn.outputImage!
      );
      (patch as GridMergeNode).outputImage = '';
      changed = true;
    } catch (e) {
      console.warn('[canvasAssetSync] gridMerge output offload 失败', node.id, e);
    }
  }

  return changed ? patch : null;
}

/** @deprecated 使用 buildNodeMediaOffloadPatch */
export async function buildNodeImagesOffloadPatch(
  node: CanvasNode
): Promise<Partial<CanvasNode> | null> {
  return buildNodeMediaOffloadPatch(node);
}

export function nodeNeedsMediaOffload(node: CanvasNode): boolean {
  const pn = node as PanoramaNode;
  const ptn = node as PanoramaT2iNode;
  const an = node as AnnotationNode;
  const dn = node as Director3DNode;
  const gsn = node as GridSplitNode;
  const gmn = node as GridMergeNode;

  return (
    !!node.images?.some(
      (im, i) => shouldOffload(im, node.imageAssetIds?.[i])
    ) ||
    shouldOffload(pn.panoramaImage, pn.panoramaImageAssetId) ||
    shouldOffload(ptn.panoramaImage, ptn.panoramaImageAssetId) ||
    shouldOffload(an.sourceImage, an.sourceImageAssetId) ||
    shouldOffload(dn.backgroundImage, dn.backgroundImageAssetId) ||
    shouldOffload(gsn.inputImage, gsn.inputImageAssetId) ||
    !!gsn.outputImages?.some((im, i) =>
      shouldOffloadGridSlot(im, gsn.outputImageAssetIds?.[i])
    ) ||
    !!gmn.inputImages?.some((im, i) =>
      shouldOffloadGridSlot(im, gmn.inputImageAssetIds?.[i])
    ) ||
    shouldOffload(gmn.outputImage, gmn.outputImageAssetId)
  );
}

/** @deprecated */
export function nodeNeedsImageOffload(node: CanvasNode): boolean {
  return nodeNeedsMediaOffload(node);
}
