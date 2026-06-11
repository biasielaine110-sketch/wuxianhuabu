import type { CanvasNode } from '../types';
import { cloneImageSlotForNewNode } from '../services/canvasAssetResolver';

export const SPAWNED_IMAGE_NODE_WIDTH = 960;
export const SPAWNED_IMAGE_NODE_HEIGHT = 1056;
/** 水平排开时相邻图片节点之间的间距（拖入/粘贴多图） */
export const SPAWNED_IMAGE_NODE_GAP = 180;
/** 叠压导出时每张图相对上一张的错开偏移（宫格拆分等） */
export const SPAWNED_IMAGE_STACK_STAGGER = 180;

export type ImageSlotInput = { base64?: string; assetId?: string };

/** 在画布上批量生成图片节点，水平排列且相邻节点间隔 SPAWNED_IMAGE_NODE_GAP */
export function buildSpacedImageNodes(
  items: ImageSlotInput[],
  startX: number,
  startY: number
): CanvasNode[] {
  const ts = Date.now();
  const nodes: CanvasNode[] = [];

  items.forEach((item, idx) => {
    const payload = cloneImageSlotForNewNode(item.base64, item.assetId);
    if (!payload) return;
    nodes.push({
      id: `image-${ts}-${idx}`,
      type: 'image',
      x: startX + idx * (SPAWNED_IMAGE_NODE_WIDTH + SPAWNED_IMAGE_NODE_GAP),
      y: startY,
      width: SPAWNED_IMAGE_NODE_WIDTH,
      height: SPAWNED_IMAGE_NODE_HEIGHT,
      prompt: '',
      ...payload,
      viewMode: 'single',
      currentImageIndex: 0,
    });
  });

  return nodes;
}

export function buildSpacedImageNodesFromLists(
  images: string[],
  startX: number,
  startY: number,
  assetIds?: string[]
): CanvasNode[] {
  const len = Math.max(images.length, assetIds?.length ?? 0);
  const items: ImageSlotInput[] = [];
  for (let i = 0; i < len; i++) {
    items.push({ base64: images[i], assetId: assetIds?.[i] });
  }
  return buildSpacedImageNodes(items, startX, startY);
}

/** 叠压式批量生成图片节点：同一起点，每张向右下错开 SPAWNED_IMAGE_STACK_STAGGER */
export function buildStackedImageNodes(
  items: ImageSlotInput[],
  startX: number,
  startY: number
): CanvasNode[] {
  const ts = Date.now();
  const nodes: CanvasNode[] = [];

  items.forEach((item, idx) => {
    const payload = cloneImageSlotForNewNode(item.base64, item.assetId);
    if (!payload) return;
    nodes.push({
      id: `image-${ts}-${idx}`,
      type: 'image',
      x: startX + idx * SPAWNED_IMAGE_STACK_STAGGER,
      y: startY + idx * SPAWNED_IMAGE_STACK_STAGGER,
      width: SPAWNED_IMAGE_NODE_WIDTH,
      height: SPAWNED_IMAGE_NODE_HEIGHT,
      prompt: '',
      ...payload,
      viewMode: 'single',
      currentImageIndex: 0,
    });
  });

  return nodes;
}

export function buildStackedImageNodesFromLists(
  images: string[],
  startX: number,
  startY: number,
  assetIds?: string[]
): CanvasNode[] {
  const len = Math.max(images.length, assetIds?.length ?? 0);
  const items: ImageSlotInput[] = [];
  for (let i = 0; i < len; i++) {
    items.push({ base64: images[i], assetId: assetIds?.[i] });
  }
  return buildStackedImageNodes(items, startX, startY);
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)(\?.*)?$/i;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
}

/** 从拖放数据收集全部图片文件（兼容 files 与 items） */
export function collectImageFilesFromDataTransfer(dt: DataTransfer): File[] {
  const seen = new Set<string>();
  const out: File[] = [];
  const add = (f: File | null) => {
    if (!f || !isImageFile(f)) return;
    const key = `${f.name}-${f.size}-${f.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  Array.from(dt.files || []).forEach(add);
  if (out.length > 0) return out;
  Array.from(dt.items || []).forEach((item) => {
    if (item.kind === 'file') add(item.getAsFile());
  });
  return out;
}

/** 从 paste 事件的 clipboardData 收集全部图片 */
export function collectImageFilesFromClipboardData(items: DataTransferItemList | null): File[] {
  if (!items) return [];
  const files: File[] = [];
  Array.from(items).forEach((item) => {
    if (item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  });
  return files;
}

export function readFilesAsBase64(files: File[]): Promise<string[]> {
  if (files.length === 0) return Promise.resolve([]);
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = ev.target?.result as string | undefined;
            const base64 = result?.split(',')[1];
            if (base64) resolve(base64);
            else reject(new Error('无法读取图片'));
          };
          reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
          reader.readAsDataURL(file);
        })
    )
  );
}

export function readBlobsAsBase64(blobs: Blob[]): Promise<string[]> {
  if (blobs.length === 0) return Promise.resolve([]);
  return Promise.all(
    blobs.map(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = ev.target?.result as string | undefined;
            const base64 = result?.split(',')[1];
            if (base64) resolve(base64);
            else reject(new Error('无法读取图片'));
          };
          reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
          reader.readAsDataURL(blob);
        })
    )
  );
}
