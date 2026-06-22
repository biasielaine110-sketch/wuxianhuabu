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
  /** 来自远程 URL (http/https) 拉取后写入 IDB 的数量 */
  remoteFetchedCount: number;
  /** 远程 URL 拉取失败的数量（CORS、网络错误、404 等） */
  remoteFailedCount: number;
  remoteFailedAssetIds: string[];
};

type RepairSource = {
  nodeId: string;
  assetId: string;
  value: string;
};

function hasRecoverableImageValue(value: string | undefined): value is string {
  const s = (value || '').trim();
  if (!s) return false;
  return (
    // 远程 URL（http/https）也算可恢复源
    /^https?:\/\//i.test(s) ||
    s.startsWith('data:') ||
    s.startsWith('blob:') ||
    // 任意非空 base64 字符串都尝试写回 IDB（即使很短），
    // 之前 length > 80 把短 base64 / 占位串过滤掉了，导致这部分图永久丢。
    s.length > 16
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
  const remoteFailedAssetIds: string[] = [];
  let remoteFetchedCount = 0;
  let remoteFailedCount = 0;

  for (const source of sources) {
    if (usedAssetIds.has(source.assetId)) continue;
    usedAssetIds.add(source.assetId);

    const existing = await getCanvasAssetRecord(source.assetId);
    if (existing?.blob?.size) continue;
    scannedMissingAssetIds.push(source.assetId);

    const isRemoteUrl = /^https?:\/\//i.test((source.value || '').trim());

    try {
      const raw = await imageSrcToRawBase64(source.value);
      if (!raw?.base64) throw new Error('empty image source');
      const blob = base64ToBlob(raw.base64, raw.mime || 'image/png');
      if (!blob.size) throw new Error('empty image blob');
      await putCanvasAssetRecord(source.assetId, blob, raw.mime || blob.type || 'image/png');
      const verified = await getCanvasAssetRecord(source.assetId);
      if (!verified?.blob?.size) throw new Error('asset write verification failed');
      recoveredAssetIds.push(source.assetId);
      if (isRemoteUrl) remoteFetchedCount++;
    } catch (e) {
      console.warn('[canvasAssetRepair] failed to repair asset from node source', {
        nodeId: source.nodeId,
        assetId: source.assetId,
        sourceKind: isRemoteUrl ? 'remote-url' : 'inline-base64',
        error: e,
      });
      failedAssetIds.push(source.assetId);
      if (isRemoteUrl) {
        remoteFailedCount++;
        remoteFailedAssetIds.push(source.assetId);
      }
    }
  }

  return {
    scannedMissingAssetIds,
    recoveredCount: recoveredAssetIds.length,
    failedCount: failedAssetIds.length,
    recoveredAssetIds,
    failedAssetIds,
    remoteFetchedCount,
    remoteFailedCount,
    remoteFailedAssetIds,
  };
}
