import type {
  AnnotationNode,
  CanvasNode,
  Director3DNode,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
} from '../types';
import { getCanvasAssetRecord, putCanvasAssetRecord } from './canvasAssetStore';
import { imageSrcToRawBase64 } from './canvasAssetResolver';

export type CanvasAssetRepairReport = {
  scannedMissingAssetIds: string[];
  recoveredCount: number;
  failedCount: number;
  recoveredAssetIds: string[];
  failedAssetIds: string[];
};

type RepairSource = {
  nodeId: string;
  assetId: string;
  value: string;
};

function hasRecoverableImageValue(value: string | undefined): value is string {
  const s = (value || '').trim();
  return (
    s.length > 80 ||
    s.startsWith('data:') ||
    s.startsWith('blob:') ||
    /^https?:\/\//i.test(s)
  );
}

function base64ToBlob(base64: string, mime: string): Blob {
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/png' });
}

function collectArraySources(
  out: RepairSource[],
  nodeId: string,
  values: string[] | undefined,
  assetIds: string[] | undefined
): void {
  const len = Math.max(values?.length ?? 0, assetIds?.length ?? 0);
  for (let i = 0; i < len; i++) {
    const assetId = assetIds?.[i];
    const value = values?.[i];
    if (assetId && hasRecoverableImageValue(value)) {
      out.push({ nodeId, assetId, value });
    }
  }
}

function collectSingleSource(
  out: RepairSource[],
  nodeId: string,
  value: string | undefined,
  assetId: string | undefined
): void {
  if (assetId && hasRecoverableImageValue(value)) {
    out.push({ nodeId, assetId, value });
  }
}

function collectRepairSources(nodes: CanvasNode[]): RepairSource[] {
  const out: RepairSource[] = [];
  for (const node of nodes) {
    collectArraySources(out, node.id, node.images, node.imageAssetIds);

    const pn = node as PanoramaNode;
    collectSingleSource(out, node.id, pn.panoramaImage, pn.panoramaImageAssetId);

    const ptn = node as PanoramaT2iNode;
    collectSingleSource(out, node.id, ptn.panoramaImage, ptn.panoramaImageAssetId);

    const an = node as AnnotationNode;
    collectSingleSource(out, node.id, an.sourceImage, an.sourceImageAssetId);

    const dn = node as Director3DNode;
    collectSingleSource(out, node.id, dn.backgroundImage, dn.backgroundImageAssetId);

    const gsn = node as GridSplitNode;
    collectSingleSource(out, node.id, gsn.inputImage, gsn.inputImageAssetId);
    collectArraySources(out, node.id, gsn.outputImages, gsn.outputImageAssetIds);

    const gmn = node as GridMergeNode;
    collectArraySources(out, node.id, gmn.inputImages, gmn.inputImageAssetIds);
    collectSingleSource(out, node.id, gmn.outputImage, gmn.outputImageAssetId);
  }
  return out;
}

export async function repairMissingNodeMediaAssetsFromNodeSources(
  nodes: CanvasNode[]
): Promise<CanvasAssetRepairReport> {
  const sources = collectRepairSources(nodes);
  const usedAssetIds = new Set<string>();
  const scannedMissingAssetIds: string[] = [];
  const recoveredAssetIds: string[] = [];
  const failedAssetIds: string[] = [];

  for (const source of sources) {
    if (usedAssetIds.has(source.assetId)) continue;
    usedAssetIds.add(source.assetId);

    const existing = await getCanvasAssetRecord(source.assetId);
    if (existing?.blob?.size) continue;
    scannedMissingAssetIds.push(source.assetId);

    try {
      const raw = await imageSrcToRawBase64(source.value);
      if (!raw?.base64) throw new Error('empty image source');
      const blob = base64ToBlob(raw.base64, raw.mime || 'image/png');
      if (!blob.size) throw new Error('empty image blob');
      await putCanvasAssetRecord(source.assetId, blob, raw.mime || blob.type || 'image/png');
      const verified = await getCanvasAssetRecord(source.assetId);
      if (!verified?.blob?.size) throw new Error('asset write verification failed');
      recoveredAssetIds.push(source.assetId);
    } catch (e) {
      console.warn('[canvasAssetRepair] failed to repair asset from node source', {
        nodeId: source.nodeId,
        assetId: source.assetId,
        error: e,
      });
      failedAssetIds.push(source.assetId);
    }
  }

  return {
    scannedMissingAssetIds,
    recoveredCount: recoveredAssetIds.length,
    failedCount: failedAssetIds.length,
    recoveredAssetIds,
    failedAssetIds,
  };
}
