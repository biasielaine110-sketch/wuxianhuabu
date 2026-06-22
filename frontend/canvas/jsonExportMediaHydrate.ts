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
  return hydrateNodesMediaFromAssetsCached(nodes, null);
}

/**
 * 带显式缓存的版本：调用方可传入一个跨调用复用的 cache Map，
 * 避免每次导出/加载都重新从 IDB 读 Blob。
 * 不传则退化为「单次调用内局部缓存」原行为。
 */
export async function hydrateNodesMediaFromAssetsCached(
  nodes: CanvasNode[],
  sharedCache: Map<string, string | null> | null
): Promise<CanvasNode[]> {
  const cache = sharedCache ?? new Map<string, string | null>();

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
      // 用 FileReader 异步把 Blob 转 data URL：浏览器内部是异步分块处理，
      // 不会在主线程上做 N MB 的 String.fromCharCode + btoa 同步循环。
      // 之前实现每次保存都让主线程卡几百毫秒～数秒，是「保存非常卡」的核心原因之一。
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(rec.blob);
      });
      const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      const base64 = m ? m[2] : dataUrl;
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
  ): Promise<{ values: string[]; changed: boolean; missingIds: string[] }> => {
    if (!Array.isArray(values)) return { values: values ?? [], changed: false, missingIds: [] };
    const out: string[] = [];
    let changed = false;
    const missingIds: string[] = [];
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
        // IDB miss：保留原 assetId（不静默清空 base64/assetId），
        // 让用户在 UI 看到「图片资产缺失」的占位，避免刷新后图永久消失。
        missingIds.push(id);
        out[i] = '';
        continue;
      }
      out[i] = cur ?? '';
    }
    return { values: out, changed, missingIds };
  };

  const out: CanvasNode[] = [];
  for (const n of nodes) {
    const next: CanvasNode = { ...n };

    // images[] / imageAssetIds[]
    const imgs = await fillArray(n.images, n.imageAssetIds);
    if (imgs.changed) next.images = imgs.values;
    if (imgs.missingIds.length) {
      console.warn(
        `[hydrateNodesMediaFromAssets] 节点 ${n.id} 有 ${imgs.missingIds.length} 张图 IDB 资产缺失：` +
          `assetIds=${imgs.missingIds.join(',')}。图片保留为占位，请检查浏览器 IDB 配额或重新生成。`
      );
    }

    // panoramaImage（PanoramaNode）
    const pn = n as PanoramaNode;
    if (pn.panoramaImageAssetId && (!pn.panoramaImage || pn.panoramaImage.length < 80)) {
      const base64 = await assetIdToBase64(pn.panoramaImageAssetId);
      if (base64) (next as PanoramaNode).panoramaImage = base64;
      else console.warn(`[hydrateNodesMediaFromAssets] Panorama 节点 ${n.id} 的 panoramaImage 资产 ${pn.panoramaImageAssetId} 在 IDB 中缺失`);
    }

    // panoramaImage（PanoramaT2iNode）
    const ptn = n as PanoramaT2iNode;
    if (ptn.panoramaImageAssetId && (!ptn.panoramaImage || ptn.panoramaImage.length < 80)) {
      const base64 = await assetIdToBase64(ptn.panoramaImageAssetId);
      if (base64) (next as PanoramaT2iNode).panoramaImage = base64;
      else console.warn(`[hydrateNodesMediaFromAssets] PanoramaT2i 节点 ${n.id} 的 panoramaImage 资产 ${ptn.panoramaImageAssetId} 在 IDB 中缺失`);
    }

    // sourceImage（AnnotationNode）
    const an = n as AnnotationNode;
    if (an.sourceImageAssetId && (!an.sourceImage || an.sourceImage.length < 80)) {
      const base64 = await assetIdToBase64(an.sourceImageAssetId);
      if (base64) (next as AnnotationNode).sourceImage = base64;
      else console.warn(`[hydrateNodesMediaFromAssets] Annotation 节点 ${n.id} 的 sourceImage 资产 ${an.sourceImageAssetId} 在 IDB 中缺失`);
    }

    // backgroundImage（Director3DNode）
    const dn = n as Director3DNode;
    if (dn.backgroundImageAssetId && (!dn.backgroundImage || dn.backgroundImage.length < 80)) {
      const base64 = await assetIdToBase64(dn.backgroundImageAssetId);
      if (base64) (next as Director3DNode).backgroundImage = base64;
      else console.warn(`[hydrateNodesMediaFromAssets] Director3D 节点 ${n.id} 的 backgroundImage 资产 ${dn.backgroundImageAssetId} 在 IDB 中缺失`);
    }

    // inputImage + outputImages[]（GridSplitNode）
    const gsn = n as GridSplitNode;
    if (gsn.inputImageAssetId && (!gsn.inputImage || gsn.inputImage.length < 80)) {
      const base64 = await assetIdToBase64(gsn.inputImageAssetId);
      if (base64) (next as GridSplitNode).inputImage = base64;
      else console.warn(`[hydrateNodesMediaFromAssets] GridSplit 节点 ${n.id} 的 inputImage 资产 ${gsn.inputImageAssetId} 在 IDB 中缺失`);
    }
    const gridSplitOut = await fillArray(gsn.outputImages, gsn.outputImageAssetIds, 1);
    if (gridSplitOut.changed) (next as GridSplitNode).outputImages = gridSplitOut.values;
    if (gridSplitOut.missingIds.length) {
      console.warn(
        `[hydrateNodesMediaFromAssets] GridSplit 节点 ${n.id} 有 ${gridSplitOut.missingIds.length} 张输出图 IDB 资产缺失`
      );
    }

    // inputImages[] + outputImage（GridMergeNode）
    const gmn = n as GridMergeNode;
    const gridMergeIn = await fillArray(gmn.inputImages, gmn.inputImageAssetIds, 1);
    if (gridMergeIn.changed) (next as GridMergeNode).inputImages = gridMergeIn.values;
    if (gridMergeIn.missingIds.length) {
      console.warn(
        `[hydrateNodesMediaFromAssets] GridMerge 节点 ${n.id} 有 ${gridMergeIn.missingIds.length} 张输入图 IDB 资产缺失`
      );
    }
    if (gmn.outputImageAssetId && (!gmn.outputImage || gmn.outputImage.length < 80)) {
      const base64 = await assetIdToBase64(gmn.outputImageAssetId);
      if (base64) (next as GridMergeNode).outputImage = base64;
      else console.warn(`[hydrateNodesMediaFromAssets] GridMerge 节点 ${n.id} 的 outputImage 资产 ${gmn.outputImageAssetId} 在 IDB 中缺失`);
    }

    out.push(next);
  }
  return out;
}

/**
 * 统计 hydrate 后真正"有 base64 内容"的图片数（>= 80 字符视为有图）。
 * 用于导出/保存路径的调试与告警：换电脑 / 跨设备时如果这里=0，
 * 说明 IDB 资产库已被清空，导出的 JSON/ZIP 一定丢图。
 */
export function countHydratedMediaValues(nodes: CanvasNode[]): {
  total: number;
  filled: number;
  empty: number;
} {
  let total = 0;
  let filled = 0;
  for (const n of nodes) {
    const pn = n as PanoramaNode;
    const ptn = n as PanoramaT2iNode;
    const an = n as AnnotationNode;
    const dn = n as Director3DNode;
    const gsn = n as GridSplitNode;
    const gmn = n as GridMergeNode;
    if (Array.isArray(n.images)) {
      for (const im of n.images) {
        total++;
        if (im && im.length >= 80) filled++;
      }
    }
    if ('panoramaImage' in pn || pn.panoramaImageAssetId) {
      total++;
      if (pn.panoramaImage && pn.panoramaImage.length >= 80) filled++;
    }
    if ('panoramaImage' in ptn || ptn.panoramaImageAssetId) {
      total++;
      if (ptn.panoramaImage && ptn.panoramaImage.length >= 80) filled++;
    }
    if (an.sourceImageAssetId) {
      total++;
      if (an.sourceImage && an.sourceImage.length >= 80) filled++;
    }
    if (dn.backgroundImageAssetId) {
      total++;
      if (dn.backgroundImage && dn.backgroundImage.length >= 80) filled++;
    }
    if (gsn.inputImageAssetId) {
      total++;
      if (gsn.inputImage && gsn.inputImage.length >= 80) filled++;
    }
    if (Array.isArray(gsn.outputImages)) {
      for (const im of gsn.outputImages) {
        total++;
        if (im && im.length >= 80) filled++;
      }
    }
    if (Array.isArray(gmn.inputImages)) {
      for (const im of gmn.inputImages) {
        total++;
        if (im && im.length >= 80) filled++;
      }
    }
    if (gmn.outputImageAssetId) {
      total++;
      if (gmn.outputImage && gmn.outputImage.length >= 80) filled++;
    }
  }
  return { total, filled, empty: total - filled };
}
