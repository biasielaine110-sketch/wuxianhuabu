import type {
  AnnotationNode,
  Director3DNode,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
  CanvasNode,
} from '../types';
import { getCanvasAssetRecord } from '../services/canvasAssetStore';

/**
 * 把节点里被 offload 到 IndexedDB 资产库的图片（字段为空 + assetId 有值）
 * 异步回填成 base64 字符串。导出 JSON 时调用，确保图片本体进文件。
 *
 * 不会改 in-memory store；只返回新的 nodes 数组。
 * 覆盖字段（与 canvasAssetSync 一致）：
 *   - images[] / imageAssetIds[]
 *   - panoramaImage / panoramaImageAssetId（PanoramaNode + PanoramaT2iNode）
 *   - sourceImage / sourceImageAssetId（AnnotationNode）
 *   - backgroundImage / backgroundImageAssetId（Director3DNode）
 *   - inputImage / inputImageAssetId（GridSplitNode）
 *   - outputImages[] / outputImageAssetIds[]（GridSplitNode）
 *   - inputImages[] / inputImageAssetIds[]（GridMergeNode）
 *   - outputImage / outputImageAssetId（GridMergeNode）
 */
export async function hydrateNodesMediaFromAssets(nodes: CanvasNode[]): Promise<CanvasNode[]> {
  const cache = new Map<string, string | null>();

  const assetIdToBase64 = async (id: string): Promise<string | null> => {
    if (cache.has(id)) return cache.get(id) ?? null;
    if (!id) {
      cache.set(id, null);
      return null;
    }
    const rec = await getCanvasAssetRecord(id);
    if (!rec?.blob) {
      cache.set(id, null);
      return null;
    }
    try {
      const buffer = await rec.blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      cache.set(id, base64);
      return base64;
    } catch {
      cache.set(id, null);
      return null;
    }
  };

  const fillArray = async (
    values: string[] | undefined,
    ids: string[] | undefined,
    minLen = 80
  ): Promise<{ values: string[]; changed: boolean }> => {
    if (!Array.isArray(values)) return { values: values ?? [], changed: false };
    const out: string[] = [];
    let changed = false;
    for (let i = 0; i < values.length; i++) {
      const cur = values[i];
      if (cur && cur.length > minLen) {
        out[i] = cur;
        continue;
      }
      const id = ids?.[i];
      if (id) {
        const base64 = await assetIdToBase64(id);
        if (base64) {
          out[i] = base64;
          changed = true;
          continue;
        }
      }
      out[i] = cur ?? '';
    }
    return { values: out, changed };
  };

  const out: CanvasNode[] = [];
  for (const n of nodes) {
    const next: CanvasNode = { ...n };

    // images[] / imageAssetIds[]
    const imgs = await fillArray(n.images, n.imageAssetIds);
    if (imgs.changed) next.images = imgs.values;

    // panoramaImage（PanoramaNode）
    const pn = n as PanoramaNode;
    if (pn.panoramaImageAssetId && (!pn.panoramaImage || pn.panoramaImage.length < 80)) {
      const base64 = await assetIdToBase64(pn.panoramaImageAssetId);
      if (base64) (next as PanoramaNode).panoramaImage = base64;
    }

    // panoramaImage（PanoramaT2iNode）
    const ptn = n as PanoramaT2iNode;
    if (ptn.panoramaImageAssetId && (!ptn.panoramaImage || ptn.panoramaImage.length < 80)) {
      const base64 = await assetIdToBase64(ptn.panoramaImageAssetId);
      if (base64) (next as PanoramaT2iNode).panoramaImage = base64;
    }

    // sourceImage（AnnotationNode）
    const an = n as AnnotationNode;
    if (an.sourceImageAssetId && (!an.sourceImage || an.sourceImage.length < 80)) {
      const base64 = await assetIdToBase64(an.sourceImageAssetId);
      if (base64) (next as AnnotationNode).sourceImage = base64;
    }

    // backgroundImage（Director3DNode）
    const dn = n as Director3DNode;
    if (dn.backgroundImageAssetId && (!dn.backgroundImage || dn.backgroundImage.length < 80)) {
      const base64 = await assetIdToBase64(dn.backgroundImageAssetId);
      if (base64) (next as Director3DNode).backgroundImage = base64;
    }

    // inputImage + outputImages[]（GridSplitNode）
    const gsn = n as GridSplitNode;
    if (gsn.inputImageAssetId && (!gsn.inputImage || gsn.inputImage.length < 80)) {
      const base64 = await assetIdToBase64(gsn.inputImageAssetId);
      if (base64) (next as GridSplitNode).inputImage = base64;
    }
    const gridSplitOut = await fillArray(gsn.outputImages, gsn.outputImageAssetIds, 1);
    if (gridSplitOut.changed) (next as GridSplitNode).outputImages = gridSplitOut.values;

    // inputImages[] + outputImage（GridMergeNode）
    const gmn = n as GridMergeNode;
    const gridMergeIn = await fillArray(gmn.inputImages, gmn.inputImageAssetIds, 1);
    if (gridMergeIn.changed) (next as GridMergeNode).inputImages = gridMergeIn.values;
    if (gmn.outputImageAssetId && (!gmn.outputImage || gmn.outputImage.length < 80)) {
      const base64 = await assetIdToBase64(gmn.outputImageAssetId);
      if (base64) (next as GridMergeNode).outputImage = base64;
    }

    out.push(next);
  }
  return out;
}
