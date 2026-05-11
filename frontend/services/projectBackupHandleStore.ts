/**
 * 按项目持久化「另存为 JSON」得到的 FileSystemFileHandle（IndexedDB），
 * 用于「打开位置」时在支持的环境下用 showOpenFilePicker({ startIn }) 定位到所在文件夹。
 */

const DB_NAME = 'wxcanvas-project-backup-handles-v1';
const DB_VERSION = 2;
const STORE = 'jsonFile';
const DRAFT_DIR_STORE = 'draftDir';

/** 供「存储位置」说明：记录各项目 JSON 文件句柄的 IndexedDB 库名 */
export const PROJECT_JSON_HANDLE_IDB_NAME = DB_NAME;

type Row = {
  projectId: string;
  fileHandle: FileSystemFileHandle;
};

type DraftDirRow = {
  projectId: string;
  directoryHandle: FileSystemDirectoryHandle;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(DRAFT_DIR_STORE)) {
        db.createObjectStore(DRAFT_DIR_STORE, { keyPath: 'projectId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function persistProjectBackupFileHandle(
  projectId: string,
  fileHandle: FileSystemFileHandle
): Promise<void> {
  if (!projectId) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({ projectId, fileHandle } as Row);
  });
}

export async function getProjectBackupFileHandle(
  projectId: string
): Promise<FileSystemFileHandle | undefined> {
  if (!projectId) return undefined;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(projectId);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const row = r.result as Row | undefined;
        resolve(row?.fileHandle);
      };
    });
  } catch {
    return undefined;
  }
}

export async function removeProjectBackupFileHandle(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, DRAFT_DIR_STORE], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(projectId);
      tx.objectStore(DRAFT_DIR_STORE).delete(projectId);
    });
  } catch {
    /* ignore */
  }
}

export async function persistProjectDraftDirectoryHandle(
  projectId: string,
  directoryHandle: FileSystemDirectoryHandle
): Promise<void> {
  if (!projectId) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_DIR_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(DRAFT_DIR_STORE).put({ projectId, directoryHandle } as DraftDirRow);
  });
}

export async function getProjectDraftDirectoryHandle(
  projectId: string
): Promise<FileSystemDirectoryHandle | undefined> {
  if (!projectId) return undefined;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_DIR_STORE, 'readonly');
      const r = tx.objectStore(DRAFT_DIR_STORE).get(projectId);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const row = r.result as DraftDirRow | undefined;
        resolve(row?.directoryHandle);
      };
    });
  } catch {
    return undefined;
  }
}

export function supportsOpenFilePickerWithStartIn(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

/**
 * 弹出系统文件选择器并尽量从已保存的 JSON 文件所在目录开始浏览（依赖 Chromium 对 startIn 的支持）。
 */
export async function revealBackupFolderViaFilePicker(
  fileHandle: FileSystemFileHandle
): Promise<'opened' | 'cancelled' | 'nopermission' | 'unsupported'> {
  const w = window as unknown as {
    showOpenFilePicker?: (opts: {
      startIn?: FileSystemHandle;
      types?: { description: string; accept: Record<string, string[]> }[];
      multiple?: boolean;
    }) => Promise<FileSystemFileHandle[]>;
  };
  if (typeof w.showOpenFilePicker !== 'function') return 'unsupported';

  try {
    let st = await fileHandle.queryPermission?.({ mode: 'readwrite' });
    if (st !== 'granted') {
      st = await fileHandle.requestPermission?.({ mode: 'readwrite' });
    }
    if (st !== 'granted') {
      let stRead = await fileHandle.queryPermission?.({ mode: 'read' });
      if (stRead !== 'granted') {
        stRead = await fileHandle.requestPermission?.({ mode: 'read' });
      }
      if (stRead !== 'granted') return 'nopermission';
    }
  } catch {
    return 'nopermission';
  }

  try {
    // 不限制扩展名，避免部分环境下过滤过严导致选择器异常；startIn 仍指向原 JSON 所在目录
    await w.showOpenFilePicker({
      startIn: fileHandle,
      multiple: false,
    });
    return 'opened';
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    try {
      await w.showOpenFilePicker({
        startIn: fileHandle,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      return 'opened';
    } catch (e2: unknown) {
      if ((e2 as { name?: string })?.name === 'AbortError') return 'cancelled';
      return 'unsupported';
    }
  }
}
