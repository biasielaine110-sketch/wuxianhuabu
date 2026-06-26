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

/** 当前打开项目通过 Ctrl+S 绑定的草稿文件夹（图片/视频下载优先写入此处） */
let activeProjectDraftDownloadDir: FileSystemDirectoryHandle | null = null;

type DraftDownloadDirectoryResolver = () => Promise<FileSystemDirectoryHandle | null>;
let draftDownloadDirectoryResolver: DraftDownloadDirectoryResolver | null = null;

export function setDraftDownloadDirectoryResolver(
  resolver: DraftDownloadDirectoryResolver | null
): void {
  draftDownloadDirectoryResolver = resolver;
}

export function getActiveProjectDraftDownloadDirectory(): FileSystemDirectoryHandle | null {
  return activeProjectDraftDownloadDir;
}

export function setActiveProjectDraftDownloadDirectory(dir: FileSystemDirectoryHandle | null): void {
  activeProjectDraftDownloadDir = dir;
}

/** 从目录句柄或已保存的文件句柄解析图片/视频下载目标目录 */
export async function resolveDraftDownloadDirectory(
  dirHandle: FileSystemDirectoryHandle | null | undefined,
  fileHandle?: FileSystemFileHandle | null
): Promise<FileSystemDirectoryHandle | null> {
  if (dirHandle) return dirHandle;
  if (fileHandle) return await resolveDirectoryHandleFromFileHandle(fileHandle);
  return null;
}

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

/**
 * 从已保存的 FileSystemFileHandle 解析其所在目录句柄。
 * 用于：
 *  1. 「另存为」拿到 json 文件句柄后，把同一目录注册为图片/视频下载目录
 *  2. 老项目只存了文件句柄没存目录句柄时，回填目录句柄
 * 失败（无权限 / 不支持 / 用户拒绝）时返回 null。
 */
export async function resolveDirectoryHandleFromFileHandle(
  fileHandle: FileSystemFileHandle
): Promise<FileSystemDirectoryHandle | null> {
  if (!fileHandle) return null;
  // 1) 先确保文件句柄本身有 readwrite 权限（getParent 通常需要）
  try {
    const w = fileHandle as unknown as {
      queryPermission?: (opts: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
      requestPermission?: (opts: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
    };
    if (typeof w.queryPermission === 'function') {
      let st = await w.queryPermission({ mode: 'readwrite' });
      if (st !== 'granted' && typeof w.requestPermission === 'function') {
        st = await w.requestPermission({ mode: 'readwrite' });
      }
      if (st !== 'granted') {
        // 退而求其次尝试 read（部分浏览器允许 read getParent）
        let stRead = await w.queryPermission({ mode: 'read' });
        if (stRead !== 'granted' && typeof w.requestPermission === 'function') {
          stRead = await w.requestPermission({ mode: 'read' });
        }
        if (stRead !== 'granted') return null;
      }
    }
  } catch {
    return null;
  }
  // 2) 调 getParent
  let dir: FileSystemDirectoryHandle | null = null;
  try {
    const getParent = (fileHandle as unknown as {
      getParent?: () => Promise<FileSystemDirectoryHandle>;
    }).getParent;
    if (typeof getParent !== 'function') return null;
    dir = (await getParent.call(fileHandle)) ?? null;
  } catch {
    return null;
  }
  if (!dir) return null;
  // 尽力请求目录 write 权限；未 granted 也返回 dir，下载点击时再 request（user gesture）
  try {
    const dw = dir as unknown as {
      queryPermission?: (opts: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
      requestPermission?: (opts: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
    };
    if (typeof dw.queryPermission === 'function') {
      let stDir = await dw.queryPermission({ mode: 'readwrite' });
      if (stDir !== 'granted' && typeof dw.requestPermission === 'function') {
        await dw.requestPermission({ mode: 'readwrite' });
      }
    }
  } catch {
    /* ignore */
  }
  return dir;
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

/** 下载前确保草稿目录可用（内存缓存 → 项目 resolver → 失败返回 null） */
async function ensureDraftDownloadDirectoryWritable(): Promise<FileSystemDirectoryHandle | null> {
  if (activeProjectDraftDownloadDir && (await verifyDirWritable(activeProjectDraftDownloadDir))) {
    return activeProjectDraftDownloadDir;
  }
  if (!draftDownloadDirectoryResolver) return null;
  try {
    const dir = await draftDownloadDirectoryResolver();
    if (dir && (await verifyDirWritable(dir))) {
      activeProjectDraftDownloadDir = dir;
      return dir;
    }
  } catch (e) {
    console.warn('解析草稿下载目录失败', e);
  }
  return null;
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

function fallbackAnchorDownload(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 立即 revoke 会导致部分浏览器下载尚未开始就失效
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
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

  const draftDir = await ensureDraftDownloadDirectoryWritable();
  if (draftDir) {
    try {
      await writeBlobToDirectory(draftDir, filename, blob);
      const label = draftDir.name?.trim() || '草稿文件夹';
      return { ok: true, message: `已保存至草稿目录：${label}` };
    } catch (e) {
      console.warn('写入草稿文件夹失败，尝试其它路径', e);
    }
  }

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
  if (fallbackAnchorDownload(blob, filename)) {
    return {
      ok: true,
      message: '已触发浏览器下载，如未看到文件请检查浏览器默认下载目录',
    };
  }
  return {
    ok: false,
    message:
      '保存失败：无法写入项目文件夹。请重新保存项目（Ctrl+S）以授权文件夹，或在设置中配置下载路径。',
  };
}

/** 从 URL 拉取视频 Blob 并保存 */
export async function saveVideoDownloadFromUrl(url: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`下载失败 (${res.status})`);
  const blob = await res.blob();
  const filename = pickFilename('video', 'mp4');

  const draftDir = await ensureDraftDownloadDirectoryWritable();
  if (draftDir) {
    try {
      await writeBlobToDirectory(draftDir, filename, blob);
      const label = draftDir.name?.trim() || '草稿文件夹';
      return { ok: true, message: `已保存至草稿目录：${label}` };
    } catch (e) {
      console.warn('写入草稿文件夹失败，尝试其它路径', e);
    }
  }

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
  if (fallbackAnchorDownload(blob, filename)) {
    return {
      ok: true,
      message: '已触发浏览器下载，如未看到文件请检查浏览器默认下载目录',
    };
  }
  return {
    ok: false,
    message:
      '保存失败：无法写入项目文件夹。请重新保存项目（Ctrl+S）以授权文件夹，或在设置中配置下载路径。',
  };
}
