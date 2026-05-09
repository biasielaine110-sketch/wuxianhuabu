import JSZip from 'jszip';
import type { CanvasNode, Edge, Transform } from '../types';

/** 与 App 内 CanvasProject 结构一致，单独放在此模块避免循环依赖 */
export type CanvasProjectSnapshot = {
  id: string;
  name: string;
  updatedAt: number;
  nodes: CanvasNode[];
  edges: Edge[];
  transform: Transform;
  /** 草稿展示/导出默认文件名用；留空或未设置时沿用 `name` */
  draftTitle?: string;
  /** 是否已为本项目完成过本地备份（另存为 JSON / 导出 ZIP 等）；仅存在草稿库，不写入导出的 project.json */
  diskSaveEstablished?: boolean;
  /** 用户自填的本机草稿/备份参考路径（仅展示与「打开位置」校验；应用无法写入该路径） */
  draftStoragePathNote?: string;
};

const DB_NAME = 'infinite-ai-canvas-db';
const DB_VERSION = 1;
const STORE = 'library';
const DOC_KEY = 'default';

/** 供「存储位置」说明：草稿库在 IndexedDB 中的名称（无磁盘路径，仅能在开发者工具中查看） */
export const CANVAS_LIBRARY_IDB_LABELS = {
  database: DB_NAME,
  objectStore: STORE,
  documentKey: DOC_KEY,
} as const;

/** 旧版 localStorage 键（迁移后删除） */
const LEGACY_PROJECTS_KEY = 'ai-canvas-projects-v1';
const LEGACY_ACTIVE_KEY = 'ai-canvas-active-project-id-v1';

/** 清理由旧版 localStorage 写入的项目键（迁移后一般不再需要） */
export function clearLegacyLocalStorageKeys(): void {
  try {
    localStorage.removeItem(LEGACY_PROJECTS_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/** ZIP 包内文件名 */
const ZIP_MANIFEST = 'manifest.json';
const ZIP_PROJECT = 'project.json';

export const WXCANVAS_ZIP_EXTENSION = '.wxcanvas.zip';

export type ZipManifest = {
  format: 'wxcanvas-v1';
  exportedAt: number;
  app: string;
};

type LibraryRow = {
  v: 1;
  projects: CanvasProjectSnapshot[];
  activeProjectId: string;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbGet(db: IDBDatabase): Promise<LibraryRow | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(DOC_KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as LibraryRow | undefined);
  });
}

function idbPut(db: IDBDatabase, row: LibraryRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(row, DOC_KEY);
  });
}

/**
 * 从 localStorage 迁移到 IndexedDB（仅执行一次；成功后删除旧键）
 */
export async function migrateFromLocalStorageIfNeeded(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_PROJECTS_KEY);
  if (!raw) return;
  try {
    if (raw.length > 50_000_000) {
      console.warn('[projectPersistence] 跳过迁移：legacy 数据过大');
      return;
    }
    const parsed = JSON.parse(raw) as CanvasProjectSnapshot[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(LEGACY_PROJECTS_KEY);
      localStorage.removeItem(LEGACY_ACTIVE_KEY);
      return;
    }
    const active = localStorage.getItem(LEGACY_ACTIVE_KEY) || parsed[0].id;
    const ok = await saveProjectLibrary(parsed, active);
    if (ok) {
      localStorage.removeItem(LEGACY_PROJECTS_KEY);
      localStorage.removeItem(LEGACY_ACTIVE_KEY);
    }
  } catch (e) {
    console.error('[projectPersistence] 迁移 legacy localStorage 失败:', e);
  }
}

export async function loadProjectLibrary(): Promise<{
  projects: CanvasProjectSnapshot[];
  activeProjectId: string;
} | null> {
  await migrateFromLocalStorageIfNeeded();
  try {
    const db = await openDb();
    const row = await idbGet(db);
    db.close();
    if (!row?.projects?.length) return null;
    const sanitized = row.projects.map((p) => ({
      ...p,
      nodes: p.nodes || [],
      edges: p.edges || [],
      transform: p.transform || { x: 0, y: 0, scale: 1 },
    }));
    return {
      projects: sanitized,
      activeProjectId: row.activeProjectId || sanitized[0].id,
    };
  } catch (e) {
    console.error('[projectPersistence] 读取 IndexedDB 失败:', e);
    return null;
  }
}

export async function saveProjectLibrary(
  projects: CanvasProjectSnapshot[],
  activeProjectId: string
): Promise<boolean> {
  try {
    const db = await openDb();
    const row: LibraryRow = {
      v: 1,
      projects,
      activeProjectId,
      savedAt: Date.now(),
    };
    await idbPut(db, row);
    db.close();
    return true;
  } catch (e) {
    console.error('[projectPersistence] 写入 IndexedDB 失败:', e);
    return false;
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80) || 'project';
}

export async function buildProjectZipBlob(project: CanvasProjectSnapshot): Promise<Blob> {
  const zip = new JSZip();
  const manifest: ZipManifest = {
    format: 'wxcanvas-v1',
    exportedAt: Date.now(),
    app: '无限AI画布',
  };
  zip.file(ZIP_MANIFEST, JSON.stringify(manifest, null, 2));
  const { diskSaveEstablished: _disk, ...projectForZip } = project;
  zip.file(ZIP_PROJECT, JSON.stringify(projectForZip, null, 2));
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportProjectToZipDownload(project: CanvasProjectSnapshot): Promise<void> {
  const blob = await buildProjectZipBlob(project);
  const base = sanitizeFilename((project.draftTitle || project.name || 'project').trim() || 'project');
  downloadBlob(blob, `${base}${WXCANVAS_ZIP_EXTENSION}`);
}

export type ExportZipDiskResult =
  | { kind: 'handle'; handle: FileSystemFileHandle }
  | { kind: 'download' }
  | { kind: 'aborted' };

/**
 * 导出 ZIP：优先用系统「另存为」拿到可反复覆盖写入的文件句柄；不支持或失败时回退为浏览器下载。
 */
export async function exportProjectZipToDisk(project: CanvasProjectSnapshot): Promise<ExportZipDiskResult> {
  const blob = await buildProjectZipBlob(project);
  const base = sanitizeFilename((project.draftTitle || project.name || 'project').trim() || 'project');
  const filename = `${base}${WXCANVAS_ZIP_EXTENSION}`;
  const w = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  };
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: '画布备份 ZIP',
            accept: { 'application/zip': ['.wxcanvas.zip', '.zip'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { kind: 'handle', handle };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return { kind: 'aborted' };
      console.warn('ZIP 另存为失败，回退为浏览器下载：', err);
    }
  }
  downloadBlob(blob, filename);
  return { kind: 'download' };
}

/** 将项目快照覆盖写入已持有的 ZIP 文件句柄 */
export async function overwriteProjectZipFileHandle(
  fileHandle: FileSystemFileHandle,
  project: CanvasProjectSnapshot
): Promise<void> {
  const blob = await buildProjectZipBlob(project);
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** 从 .wxcanvas.zip 或普通 .zip（内含 project.json）解析项目 */
export async function parseProjectFromZipFile(file: File): Promise<CanvasProjectSnapshot> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  let projectFile = zip.file(ZIP_PROJECT);
  if (!projectFile) {
    const key = Object.keys(zip.files).find((k) => !zip.files[k].dir && /(^|\/)project\.json$/i.test(k));
    if (key) projectFile = zip.file(key) ?? null;
  }
  if (!projectFile) {
    throw new Error('ZIP 内未找到 project.json');
  }
  const text = await projectFile.async('string');
  const imported = JSON.parse(text) as Partial<CanvasProjectSnapshot>;
  if (!imported || !Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) {
    throw new Error('project.json 格式不正确');
  }
  return {
    id: (imported.id as string) || `project-${Date.now()}`,
    name: (imported.name as string) || file.name.replace(/\.(wxcanvas\.)?zip$/i, '') || '导入项目',
    updatedAt: typeof imported.updatedAt === 'number' ? imported.updatedAt : Date.now(),
    nodes: imported.nodes as CanvasNode[],
    edges: imported.edges as Edge[],
    transform: (imported.transform || { x: 0, y: 0, scale: 1 }) as Transform,
    draftStoragePathNote:
      typeof imported.draftStoragePathNote === 'string' ? imported.draftStoragePathNote : undefined,
  };
}
