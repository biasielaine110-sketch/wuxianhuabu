/**
 * 画布媒体资产 IndexedDB 存储（与 projectPersistence 分离）。
 * 节点可逐步改为存 assetId 而非内嵌 base64，降低内存与撤销栈压力。
 */

const DB_NAME = 'infinite-ai-canvas-assets';
const DB_VERSION = 1;
const STORE = 'assets';

export type CanvasAssetRecord = {
  id: string;
  blob: Blob;
  mime: string;
  byteSize: number;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export function createCanvasAssetId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `asset-${crypto.randomUUID()}`;
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 写入 Blob，返回 assetId */
export async function putCanvasAsset(blob: Blob, mime?: string): Promise<string> {
  const id = createCanvasAssetId();
  await putCanvasAssetRecord(id, blob, mime);
  return id;
}

/** 以指定 id 写入（ZIP 导入等场景） */
export async function putCanvasAssetRecord(
  id: string,
  blob: Blob,
  mime?: string
): Promise<void> {
  const record: CanvasAssetRecord = {
    id,
    blob,
    mime: mime || blob.type || 'application/octet-stream',
    byteSize: blob.size,
    createdAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(record);
  });
  db.close();
}

/** base64 data URL → 存 IDB，返回 assetId；远程 URL 先下载再存 */
export async function putCanvasAssetFromBase64(base64: string): Promise<string> {
  const trimmed = base64.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const { imageSrcToRawBase64 } = await import('./canvasAssetResolver');
    const raw = await imageSrcToRawBase64(trimmed);
    if (!raw?.base64) throw new Error('无法下载远程图片用于本地存储');
    return putCanvasAssetFromBase64(raw.base64);
  }
  const match = /^data:([^;]+);base64,(.+)$/.exec(trimmed);
  const mime = match?.[1] ?? 'image/png';
  const raw = (match?.[2] ?? base64).replace(/\s/g, '');
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return putCanvasAsset(new Blob([bytes], { type: mime }), mime);
}

export async function getCanvasAssetRecord(id: string): Promise<CanvasAssetRecord | null> {
  const db = await openDb();
  const record = await new Promise<CanvasAssetRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as CanvasAssetRecord | undefined);
  });
  db.close();
  return record ?? null;
}

export async function getCanvasAssetBlobUrl(id: string): Promise<string | null> {
  const record = await getCanvasAssetRecord(id);
  if (!record) return null;
  return URL.createObjectURL(record.blob);
}

export async function deleteCanvasAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}

/** 估算 IDB 中资产总字节（DevTools 外无直接 API，逐条累加） */
export async function estimateCanvasAssetsBytes(): Promise<number> {
  const db = await openDb();
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      const rec = cursor.value as CanvasAssetRecord;
      total += rec.byteSize ?? rec.blob?.size ?? 0;
      cursor.continue();
    };
  });
  db.close();
  return total;
}
