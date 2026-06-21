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

function isRemoteImageUrl(value: string | undefined): boolean {
  return /^https?:\/\//i.test((value || '').trim());
}

function shouldOffload(value: string | undefined, existingAssetId?: string): boolean {
  return !!value && (isRemoteImageUrl(value) || value.length >= IMAGE_OFFLOAD_MIN_CHARS) && !existingAssetId;
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
    if (!im || (!isRemoteImageUrl(im) && im.length < minChars) || newIds[i]) continue;
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

/** 仅含媒体字段的签名，position 变化时不触发 offload 扫描 */
export function nodeMediaOffloadSignature(node: CanvasNode): string {
  const pn = node as PanoramaNode;
  const ptn = node as PanoramaT2iNode;
  const an = node as AnnotationNode;
  const dn = node as Director3DNode;
  const gsn = node as GridSplitNode;
  const gmn = node as GridMergeNode;
  const imgPart = (node.images ?? [])
    .map((im, i) => `${im?.length ?? 0}|${node.imageAssetIds?.[i] ?? ''}`)
    .join(',');
  const gridOut = (gsn.outputImages ?? [])
    .map((im, i) => `${im?.length ?? 0}|${gsn.outputImageAssetIds?.[i] ?? ''}`)
    .join(',');
  const gridIn = (gmn.inputImages ?? [])
    .map((im, i) => `${im?.length ?? 0}|${gmn.inputImageAssetIds?.[i] ?? ''}`)
    .join(',');
  return [
    node.id,
    imgPart,
    `${pn.panoramaImage?.length ?? 0}|${pn.panoramaImageAssetId ?? ''}`,
    `${ptn.panoramaImage?.length ?? 0}|${ptn.panoramaImageAssetId ?? ''}`,
    `${an.sourceImage?.length ?? 0}|${an.sourceImageAssetId ?? ''}`,
    `${dn.backgroundImage?.length ?? 0}|${dn.backgroundImageAssetId ?? ''}`,
    `${gsn.inputImage?.length ?? 0}|${gsn.inputImageAssetId ?? ''}`,
    gridOut,
    gridIn,
    `${gmn.outputImage?.length ?? 0}|${gmn.outputImageAssetId ?? ''}`,
  ].join(':');
}

export function buildMediaOffloadScanKey(nodes: CanvasNode[]): string {
  return nodes.map(nodeMediaOffloadSignature).join('\x1e');
}

function collectNodeMediaAssetIds(node: CanvasNode): string[] {
  const pn = node as PanoramaNode;
  const ptn = node as PanoramaT2iNode;
  const an = node as AnnotationNode;
  const dn = node as Director3DNode;
  const gsn = node as GridSplitNode;
  const gmn = node as GridMergeNode;
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) ids.add(id);
  };
  node.imageAssetIds?.forEach(add);
  add(pn.panoramaImageAssetId);
  add(ptn.panoramaImageAssetId);
  add(an.sourceImageAssetId);
  add(dn.backgroundImageAssetId);
  add(gsn.inputImageAssetId);
  gsn.outputImageAssetIds?.forEach(add);
  gmn.inputImageAssetIds?.forEach(add);
  add(gmn.outputImageAssetId);
  return [...ids];
}

export async function findMissingNodeMediaAssetIds(nodes: CanvasNode[]): Promise<string[]> {
  const ids = new Set<string>();
  for (const node of nodes) {
    collectNodeMediaAssetIds(node).forEach((id) => ids.add(id));
  }
  const missing: string[] = [];
  for (const id of ids) {
    const rec = await getCanvasAssetRecord(id);
    if (!rec?.blob?.size) missing.push(id);
  }
  return missing;
}

export type MissingNodeMediaReport = {
  nodeIds: string[];
  slotCount: number;
  assetIds: string[];
};

function hasInlineMediaValue(value: string | undefined, minLen = 80): boolean {
  const s = (value || '').trim();
  return /^https?:\/\//i.test(s) || s.length > minLen;
}

async function assetExists(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const rec = await getCanvasAssetRecord(id);
  return !!rec?.blob?.size;
}

async function countMissingArraySlots(
  values: string[] | undefined,
  assetIds: string[] | undefined,
  minLen = 80
): Promise<{ count: number; assetIds: string[] }> {
  const len = Math.max(values?.length ?? 0, assetIds?.length ?? 0);
  let count = 0;
  const missingAssetIds: string[] = [];
  for (let i = 0; i < len; i++) {
    if (hasInlineMediaValue(values?.[i], minLen)) continue;
    const assetId = assetIds?.[i];
    if (assetId) {
      if (await assetExists(assetId)) continue;
      missingAssetIds.push(assetId);
      count++;
    }
  }
  return { count, assetIds: missingAssetIds };
}

async function countMissingSingleSlot(
  value: string | undefined,
  assetId: string | undefined,
  minLen = 80
): Promise<{ count: number; assetIds: string[] }> {
  if (hasInlineMediaValue(value, minLen)) return { count: 0, assetIds: [] };
  if (!assetId) return { count: 0, assetIds: [] };
  if (await assetExists(assetId)) return { count: 0, assetIds: [] };
  return { count: 1, assetIds: [assetId] };
}

export async function findMissingNodeWindowMedia(
  nodes: CanvasNode[]
): Promise<MissingNodeMediaReport> {
  const nodeIds = new Set<string>();
  const assetIds = new Set<string>();
  let slotCount = 0;

  const add = (nodeId: string, result: { count: number; assetIds: string[] }) => {
    if (result.count <= 0) return;
    nodeIds.add(nodeId);
    slotCount += result.count;
    result.assetIds.forEach((id) => assetIds.add(id));
  };

  for (const node of nodes) {
    if (node.isGenerating) continue;
    add(node.id, await countMissingArraySlots(node.images, node.imageAssetIds));

    const pn = node as PanoramaNode;
    add(node.id, await countMissingSingleSlot(pn.panoramaImage, pn.panoramaImageAssetId));

    const ptn = node as PanoramaT2iNode;
    add(node.id, await countMissingSingleSlot(ptn.panoramaImage, ptn.panoramaImageAssetId));

    const an = node as AnnotationNode;
    add(node.id, await countMissingSingleSlot(an.sourceImage, an.sourceImageAssetId));

    const dn = node as Director3DNode;
    add(node.id, await countMissingSingleSlot(dn.backgroundImage, dn.backgroundImageAssetId));

    const gsn = node as GridSplitNode;
    add(node.id, await countMissingSingleSlot(gsn.inputImage, gsn.inputImageAssetId));
    add(node.id, await countMissingArraySlots(gsn.outputImages, gsn.outputImageAssetIds, 1));

    const gmn = node as GridMergeNode;
    add(node.id, await countMissingArraySlots(gmn.inputImages, gmn.inputImageAssetIds, 1));
    add(node.id, await countMissingSingleSlot(gmn.outputImage, gmn.outputImageAssetId, 1));
  }

  return { nodeIds: [...nodeIds], slotCount, assetIds: [...assetIds] };
}

/**
 * 同步强制把所有「需要 offload 但还未 offload」的大体积 base64 媒体写进 IDB，
 * 并在节点上写入 assetId + 清空 base64。
 *
 * **autosave / saveCurrentProject 必须在保存前调用**，否则会出现：
 *   - 内存里 `images[i]` 是新 base64 但 IDB 里没有对应记录
 *   - hydrate 时按 imageAssetIds 找不到 → 把 `images[i]` 置空 → 图永久丢失
 *
 * 异常路径：若 IDB 写入失败（quota exceeded 等），对应格 images[i] 保持原 base64，
 * 由调用方决定是否继续保存。
 */
export async function flushAllNodeMediaOffload(
  nodes: CanvasNode[]
): Promise<Map<string, Partial<CanvasNode>>> {
  const patches = new Map<string, Partial<CanvasNode>>();
  for (const node of nodes) {
    if (!nodeNeedsMediaOffload(node)) continue;
    const patch = await buildNodeMediaOffloadPatch(node);
    if (patch) patches.set(node.id, patch);
  }
  return patches;
}
