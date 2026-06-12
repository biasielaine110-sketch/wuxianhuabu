import type { CanvasNode, Edge } from '../types';

export type ResolvedGridImage = { base64?: string; assetId?: string };

export function getGridLayout(gridCount: number): { cols: number; rows: number } {
  // 3 宫：竖向 3 行 1 列；9 宫：3×3；6 宫：2×3；4 宫：2×2
  if (gridCount === 3) return { cols: 1, rows: 3 };
  if (gridCount <= 4) return { cols: 2, rows: 2 };
  if (gridCount === 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export function getNodeDisplayImage(n: CanvasNode): ResolvedGridImage | undefined {
  const imgs = n.images;
  if (!imgs?.length) return undefined;
  const idx = Math.min(Math.max(0, n.currentImageIndex ?? 0), imgs.length - 1);
  const base64 = imgs[idx];
  if (!base64 && !n.imageAssetIds?.[idx]) return undefined;
  return { base64, assetId: n.imageAssetIds?.[idx] };
}

export function getConnectedImages(
  nodeId: string,
  nodes: CanvasNode[],
  edges: Edge[]
): ResolvedGridImage[] {
  const incomingEdges = edges.filter((e) => e.targetId === nodeId);
  if (!incomingEdges.length) return [];
  const sourceIds = incomingEdges.map((e) => e.sourceId);
  return nodes
    .filter((n) => sourceIds.includes(n.id))
    .map(getNodeDisplayImage)
    .filter((img): img is ResolvedGridImage => !!img);
}

export function getFirstConnectedImage(
  nodeId: string,
  nodes: CanvasNode[],
  edges: Edge[]
): ResolvedGridImage | undefined {
  return getConnectedImages(nodeId, nodes, edges)[0];
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function resolveImageSrc(base64?: string, assetId?: string): Promise<string> {
  const { resolveCanvasImageSource } = await import('../services/canvasAssetResolver');
  return resolveCanvasImageSource(base64, assetId);
}
