/**
 * 画布「下载路径」：固定目录自动保存 / 每次另存为。
 * 依赖 File System Access API（Chrome、Edge 等，HTTPS 或 localhost）。
 */

const LS_KEY = 'ai-canvas-download-path-v1';
const IDB_NAME = 'ai-canvas-download-handles';
const IDB_STORE = 'directoryHandles';
const IDB_VERSION = 1;

export type DownloadPathPersisted = {
  /** 勾选后：若已选目录且权限可用，则自动写入该目录 */
  enabled: boolean;
  /** 为 true 时分别使用 image / video 两个目录；为 false 时共用 combined */
  separateImageVideo: boolean;
};

const defaultPersisted: DownloadPathPersisted = {
  enabled: false,
  separateImageVideo: false,
};

let cachedCombined: FileSystemDirectoryHandle | null = null;
let cachedImage: FileSystemDirectoryHandle | null = null;
let cachedVideo: FileSystemDirectoryHandle | null = null;

export function supportsFileSystemAccess(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export function supportsSaveFilePicker(): boolean {
  return typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

export function loadDownloadPathSettings(): DownloadPathPersisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaultPersisted };
    const j = JSON.parse(raw) as Partial<DownloadPathPersisted>;
    return {
      enabled: Boolean(j.enabled),
      separateImageVideo: Boolean(j.separateImageVideo),
    };
  } catch {
    return { ...defaultPersisted };
  }
}

export function saveDownloadPathSettings(s: DownloadPathPersisted): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

async function idbPutHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(IDB_STORE).put(handle, key);
  });
  db.close();
}

async function idbGetHandle(key: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openIdb();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

async function idbDeleteHandle(key: string): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(IDB_STORE).delete(key);
  });
  db.close();
}

/** 启动时从 IndexedDB 恢复目录句柄到内存 */
export async function hydrateDownloadDirectoryHandlesFromIDB(): Promise<void> {
  if (!supportsFileSystemAccess()) return;
  try {
    const [c, i, v] = await Promise.all([
      idbGetHandle('combined'),
      idbGetHandle('image'),
      idbGetHandle('video'),
    ]);
    cachedCombined = c ?? null;
    cachedImage = i ?? null;
    cachedVideo = v ?? null;
  } catch {
    cachedCombined = null;
    cachedImage = null;
    cachedVideo = null;
  }
}

export function getDownloadHandleCacheSnapshot(): {
  combined: FileSystemDirectoryHandle | null;
  image: FileSystemDirectoryHandle | null;
  video: FileSystemDirectoryHandle | null;
} {
  return { combined: cachedCombined, image: cachedImage, video: cachedVideo };
}

export async function pickAndStoreDownloadDirectory(
  key: 'combined' | 'image' | 'video'
): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    const dir = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    await idbPutHandle(key, dir);
    if (key === 'combined') {
      cachedCombined = dir;
    } else if (key === 'image') {
      cachedImage = dir;
    } else {
      cachedVideo = dir;
    }
    return dir;
  } catch {
    return null;
  }
}

export async function clearStoredDownloadDirectory(key: 'combined' | 'image' | 'video'): Promise<void> {
  await idbDeleteHandle(key);
  if (key === 'combined') cachedCombined = null;
  else if (key === 'image') cachedImage = null;
  else cachedVideo = null;
}

async function verifyDirWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
    const q = await dir.queryPermission(opts);
    if (q === 'granted') return true;
    const r = await dir.requestPermission(opts);
    return r === 'granted';
  } catch {
    return false;
  }
}

async function writeBlobToDirectory(
  dir: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function pickFilename(prefix: string, ext: string): string {
  return `${prefix}-${Date.now()}.${ext}`;
}

/** 未启用固定目录或不可写时：每次弹出「另存为」 */
async function saveBlobWithPicker(blob: Blob, suggestedName: string): Promise<boolean> {
  if (!supportsSaveFilePicker()) return false;
  try {
    const w = window as unknown as {
      showSaveFilePicker: (opts: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    };
    const handle = await w.showSaveFilePicker({
      suggestedName,
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

function fallbackAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 保存图片（base64 无 data: 前缀，JPEG/PNG 等由 mime 决定扩展名）
 */
export async function saveImageDownload(
  base64Raw: string,
  mimeHint: string = 'image/jpeg'
): Promise<{ ok: boolean; message?: string }> {
  const mime = mimeHint || 'image/jpeg';
  let ext = 'jpg';
  if (mime.includes('png')) ext = 'png';
  else if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('gif')) ext = 'gif';

  let binary: Uint8Array;
  try {
    const bin = atob(base64Raw);
    binary = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) binary[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, message: '图片数据无效' };
  }
  const blob = new Blob([binary], { type: mime });
  const filename = pickFilename('image', ext);

  const settings = loadDownloadPathSettings();
  if (settings.enabled) {
    const dir = settings.separateImageVideo ? cachedImage : cachedCombined;
    if (dir && (await verifyDirWritable(dir))) {
      try {
        await writeBlobToDirectory(dir, filename, blob);
        return { ok: true };
      } catch (e) {
        console.warn('写入固定目录失败，尝试另存为', e);
      }
    }
  }

  if (await saveBlobWithPicker(blob, filename)) {
    return { ok: true };
  }
  fallbackAnchorDownload(blob, filename);
  return { ok: true };
}

/** 从 URL 拉取视频 Blob 并保存 */
export async function saveVideoDownloadFromUrl(url: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`下载失败 (${res.status})`);
  const blob = await res.blob();
  const filename = pickFilename('video', 'mp4');

  const settings = loadDownloadPathSettings();
  if (settings.enabled) {
    const dir = settings.separateImageVideo ? cachedVideo : cachedCombined;
    if (dir && (await verifyDirWritable(dir))) {
      try {
        await writeBlobToDirectory(dir, filename, blob);
        return { ok: true };
      } catch (e) {
        console.warn('写入固定目录失败，尝试另存为', e);
      }
    }
  }

  if (await saveBlobWithPicker(blob, filename)) {
    return { ok: true };
  }
  fallbackAnchorDownload(blob, filename);
  return { ok: true };
}
