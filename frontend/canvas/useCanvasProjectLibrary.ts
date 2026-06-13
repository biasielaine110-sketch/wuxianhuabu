import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { AuditImage, CanvasNode, Edge, Transform } from '../types';
import {
  loadProjectLibrary,
  saveProjectLibrary,
  exportProjectZipToDisk,
  parseProjectFromZipFile,
  sanitizeFilename,
  CANVAS_LIBRARY_IDB_LABELS,
} from '../services/projectPersistence';
import {
  getProjectBackupFileHandle,
  getProjectDraftDirectoryHandle,
  persistProjectBackupFileHandle,
  persistProjectDraftDirectoryHandle,
  removeProjectBackupFileHandle,
} from '../services/projectBackupHandleStore';
import { setActiveProjectDraftDownloadDirectory, supportsFileSystemAccess } from '../services/downloadPathSettings';
import { DEFAULT_CANVAS_VIEW_SCALE, useCanvasStore } from '../stores/canvasStore';
import {
  mergeCurrentCanvasIntoProjectList,
  normalizeLibraryProjectsStripLegacyAutoT2i,
  normalizeProjectStripLegacyAutoT2i,
  cloneCanvasForProject,
} from './canvasProjectMergeUtils';
import {
  projectDraftDisplayName,
  projectExportBasename,
  sanitizeDraftStoragePathNote,
  type CanvasProject,
} from './projectDraftUtils';
import type { DraftDiskModalState } from './draftDiskModalTypes';

export type UseCanvasProjectLibraryOptions = {
  setNodes: (updater: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setTransform: (t: Transform | ((prev: Transform) => Transform)) => void;
  setAuditImages: (images: AuditImage[] | ((prev: AuditImage[]) => AuditImage[])) => void;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  transformRef: RefObject<Transform>;
  auditImagesRef: RefObject<AuditImage[]>;
};

export function useCanvasProjectLibrary({
  setNodes,
  setEdges,
  setTransform,
  setAuditImages,
  nodesRef,
  edgesRef,
  transformRef,
  auditImagesRef,
}: UseCanvasProjectLibraryOptions) {
  const [projects, setProjects] = useState<CanvasProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const saveSuccessTimerRef = useRef<number | null>(null);
  const [projectExportMenuOpen, setProjectExportMenuOpen] = useState(false);
  const [projectStoreReady, setProjectStoreReady] = useState(false);
  const pendingDefaultViewportRef = useRef(true);
  const [autosaveIntervalMin, setAutosaveIntervalMin] = useState<0 | 5 | 10 | 20 | 30>(() => {
    try {
      const v = localStorage.getItem('wxcanvas-autosave-interval-min');
      if (v === '0') return 0;
      if (v === '5' || v === '10' || v === '20' || v === '30') return Number(v) as 5 | 10 | 20 | 30;
    } catch {
      /* ignore */
    }
    return 20;
  });
  const [draftNameInput, setDraftNameInput] = useState('');
  const [draftStoragePathInput, setDraftStoragePathInput] = useState('');
  const [centerTitleEditValue, setCenterTitleEditValue] = useState<string | null>(null);
  const skipCenterRenameBlurRef = useRef(false);
  const persistWarningShownRef = useRef(false);
  const lastJsonFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const lastZipFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const lastDiskWriteFormatRef = useRef<'json' | 'zip' | null>(null);
  const [lastJsonFilename, setLastJsonFilename] = useState<string>('');
  const draftDiskFlowResolveRef = useRef<((v: boolean) => void) | null>(null);
  const draftDiskModalRef = useRef<DraftDiskModalState>(null);
  const [draftDiskModal, setDraftDiskModal] = useState<DraftDiskModalState>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const activeProjectIdRef = useRef(activeProjectId);
  const projectsRef = useRef(projects);

  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  // 追踪所有进行中的 saveProjectLibrary Promise：返回首页前必须先 await 全部完成，
  // 否则 HomeScreen mount 后立即 loadProjectLibrary 可能读到 IDB 旧值（race condition）。
  const pendingProjectSavesRef = useRef<Set<Promise<unknown>>>(new Set());
  const trackProjectSave = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    pendingProjectSavesRef.current.add(p);
    void p.finally(() => {
      pendingProjectSavesRef.current.delete(p);
    });
    return p;
  }, []);
  const flushPendingProjectWrites = useCallback(async (): Promise<void> => {
    const list = Array.from(pendingProjectSavesRef.current);
    if (list.length === 0) return;
    await Promise.allSettled(list);
  }, []);
  useEffect(() => { draftDiskModalRef.current = draftDiskModal; }, [draftDiskModal]);
  useEffect(() => { setCenterTitleEditValue(null); }, [activeProjectId]);

  useEffect(() => {
    if (!showProjectModal) return;
    const p = projectsRef.current.find((x) => x.id === activeProjectId);
    if (!p) return;
    setDraftNameInput((p.draftTitle?.trim() || p.name || '').trim() || '');
    const raw = (p.draftStoragePathNote || '').trim();
    const cleaned = sanitizeDraftStoragePathNote(raw);
    setDraftStoragePathInput(cleaned);
    if (cleaned !== raw) {
      const pid = p.id;
      setProjects((prev) => {
        const next = prev.map((x) =>
          x.id === pid ? { ...x, draftStoragePathNote: cleaned || undefined, updatedAt: Date.now() } : x
        );
        projectsRef.current = next;
        void trackProjectSave(saveProjectLibrary(next, pid));
        return next;
      });
    }
  }, [showProjectModal, activeProjectId]);

  /** 保存 JSON 到本机；支持 File System Access API 时弹出「另存为」选择路径。saved=已写入或已触发下载；aborted=用户取消另存为 */
  const saveJsonToDisk = useCallback(
    async (
      filename: string,
      data: unknown,
      opts?: { backupProjectId?: string }
    ): Promise<'saved' | 'aborted'> => {
    const json = JSON.stringify(data, null, 2);
    const hasPicker = typeof (window as any).showSaveFilePicker === 'function';
    if (hasPicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'JSON 文件',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        lastJsonFileHandleRef.current = handle;
        lastDiskWriteFormatRef.current = 'json';
        const backupPid = opts?.backupProjectId ?? activeProjectIdRef.current;
        if (backupPid) {
          void persistProjectBackupFileHandle(backupPid, handle as FileSystemFileHandle).catch((e) =>
            console.warn('持久化项目 JSON 句柄失败', e)
          );
        }
        setLastJsonFilename(handle?.name || filename);
        return 'saved';
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'aborted';
        console.warn('文件保存器失败，回退为浏览器下载：', err);
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setLastJsonFilename(filename);
    URL.revokeObjectURL(url);
    return 'saved';
  },
  []
);

  // --- Project Management ---
  /**
   * 本地存档策略（简要）：
   * - 画布上的 nodes / edges / transform 只在内存中实时变化；
   * - 「保存当前画布 / Ctrl+S」：写入 IndexedDB；若该项目尚未绑定本地草稿 JSON，会先弹出对话框填写文件名并选择保存文件夹（Chrome / Edge）；确认后绑定句柄，项目名下展示草稿位置；取消则仍只写草稿库；
   * - 已绑定草稿后：**Ctrl+S** 会同步覆盖绑定的 JSON；**Ctrl+Alt+S（⌘+⌥+S）** 为「另存 JSON」（选文件夹 + 文件名），不改变当前绑定的主草稿；
   * - 「定时自动保存」：已绑定草稿的项目打开时默认每 **5** 分钟静默保存（IndexedDB + 覆盖绑定 JSON）；可在项目管理里改为关闭或其它间隔；
   * - 图片 / 视频下载在已选择草稿文件夹时，默认写入该文件夹（无需在设置里启用固定目录）；
   * - 「导出 JSON / ZIP」仍可通过菜单另存；导出 JSON 也会标记已做过磁盘备份；
   * - 首次打开会从旧版 localStorage 迁移到 IndexedDB；
   * - 「切换项目」：先保存当前画布到原项目，再载入目标项目。
   */
  const createNewProject = useCallback((name?: string) => {
    const projectId = `project-${Date.now()}`;
    const prevList = projectsRef.current;
    const projectName = (name || '').trim() || `项目 ${prevList.length + 1}`;
    const newProject: CanvasProject = {
      id: projectId,
      name: projectName,
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      transform: { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE }
    };
    const merged = mergeCurrentCanvasIntoProjectList(
      prevList,
      activeProjectIdRef.current,
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    const nextList = [newProject, ...merged];
    setProjects(nextList);
    projectsRef.current = nextList;
    setActiveProjectId(projectId);
    setNodes(newProject.nodes);
    setEdges(newProject.edges);
    pendingDefaultViewportRef.current = true;
    void trackProjectSave(saveProjectLibrary(nextList, projectId)).then((ok) => {
      if (!ok) {
        alert('新建项目已生效，但写入本地草稿库（IndexedDB）失败。请检查浏览器存储权限或磁盘空间。');
      } else {
        persistWarningShownRef.current = false;
      }
    });
  }, []);

  const flushBoundDraftJsonToDisk = useCallback(
    async (
      pid: string,
      list: CanvasProject[],
      opts?: { alertOnFailure?: boolean; onSaved?: (filename: string) => void }
    ): Promise<string | null> => {
      const p = list.find((x) => x.id === pid);
      if (!p?.diskSaveEstablished || lastDiskWriteFormatRef.current !== 'json') return null;
      let h = lastJsonFileHandleRef.current as FileSystemFileHandle | null;
      if (!h) {
        const fetched = await getProjectBackupFileHandle(pid);
        h = fetched ?? null;
        lastJsonFileHandleRef.current = h;
      }
      if (!h) return null;
      const savedFilename = h.name || '';
      try {
        const forWrite = { ...p };
        delete (forWrite as { diskSaveEstablished?: boolean }).diskSaveEstablished;
        const json = JSON.stringify(forWrite, null, 2);
        const writable = await h.createWritable();
        await writable.write(json);
        await writable.close();
        setLastJsonFilename(savedFilename);
        opts?.onSaved?.(savedFilename);
        return savedFilename;
      } catch (e) {
        console.warn('[canvas] 覆盖本地草稿 JSON 失败', e);
        if (opts?.alertOnFailure) {
          alert('草稿库已更新，但覆盖本地 JSON 草稿失败（文件可能被移动或无写入权限）。');
        }
        return null;
      }
    },
    []
  );

  const saveCurrentProject = useCallback(
    (options?: { skipDiskPrompt?: boolean }): Promise<boolean> => {
      const pid = activeProjectIdRef.current;
      if (!pid) {
        alert('项目数据仍在加载，请稍后再试保存。');
        return Promise.resolve(false);
      }
      const nextProjects = mergeCurrentCanvasIntoProjectList(
        projectsRef.current,
        pid,
        nodesRef.current,
        edgesRef.current,
        transformRef.current,
        auditImagesRef.current.length > 0 ? { images: auditImagesRef.current } : undefined
      );
      const cur = nextProjects.find((p) => p.id === pid);
      const needsDiskPrompt = !options?.skipDiskPrompt && cur != null && !cur.diskSaveEstablished;

      const commitToIdb = (list: CanvasProject[]): Promise<boolean> => {
        setProjects(list);
        projectsRef.current = list;
        return trackProjectSave(saveProjectLibrary(list, pid)).then((ok) => {
          if (!ok) {
            alert('保存失败：无法写入 IndexedDB 草稿库。请检查存储权限或尝试导出 ZIP/JSON 备份。');
          } else {
            persistWarningShownRef.current = false;
          }
          return ok;
        });
      };

      if (!needsDiskPrompt) {
        return (async () => {
          const ok = await commitToIdb(nextProjects);
          if (!ok) return false;
          await flushBoundDraftJsonToDisk(pid, nextProjects, {
            alertOnFailure: !options?.skipDiskPrompt,
            onSaved: (filename) => {
              setSaveSuccessMsg(`已保存至: ${filename}`);
              if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
              saveSuccessTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(null), 3000);
            },
          });
          return true;
        })();
      }

      return new Promise<boolean>((resolve) => {
        draftDiskFlowResolveRef.current = resolve;
        setDraftDiskModal({
          mode: 'firstSave',
          mergedProjects: nextProjects,
          pid,
          basenameDraft: projectExportBasename(cur as CanvasProject),
        });
      });
    },
    [flushBoundDraftJsonToDisk]
  );

  const saveCurrentProjectRef = useRef(saveCurrentProject);
  useEffect(() => {
    saveCurrentProjectRef.current = saveCurrentProject;
  }, [saveCurrentProject]);

  useEffect(() => {
    if (!projectStoreReady || autosaveIntervalMin <= 0) return;
    const ms = autosaveIntervalMin * 60 * 1000;
    const timer = window.setInterval(() => {
      const pid = activeProjectIdRef.current;
      if (!pid) return;
      const p = projectsRef.current.find((x) => x.id === pid);
      if (!p?.diskSaveEstablished) return;
      void saveCurrentProjectRef.current({ skipDiskPrompt: true });
    }, ms);
    return () => clearInterval(timer);
  }, [projectStoreReady, autosaveIntervalMin]);

  useEffect(() => {
    if (!projectStoreReady || !activeProjectId) return;
    const pid = activeProjectId;
    void getProjectDraftDirectoryHandle(pid).then((dir) => {
      setActiveProjectDraftDownloadDirectory(dir ?? null);
    });
    const p = projectsRef.current.find((x) => x.id === pid);
    if (p?.diskSaveEstablished) {
      setAutosaveIntervalMin((p.draftAutosaveIntervalMin ?? 5) as 0 | 5 | 10 | 20 | 30);
    } else {
      try {
        const v = localStorage.getItem('wxcanvas-autosave-interval-min');
        if (v === '0') setAutosaveIntervalMin(0);
        else if (v === '5' || v === '10' || v === '20' || v === '30')
          setAutosaveIntervalMin(Number(v) as 5 | 10 | 20 | 30);
        else setAutosaveIntervalMin(20);
      } catch {
        setAutosaveIntervalMin(20);
      }
    }
  }, [projectStoreReady, activeProjectId]);

  const handleAutosaveIntervalChange = useCallback((v: 0 | 5 | 10 | 20 | 30) => {
    setAutosaveIntervalMin(v);
    try {
      if (v === 0) localStorage.removeItem('wxcanvas-autosave-interval-min');
      else localStorage.setItem('wxcanvas-autosave-interval-min', String(v));
    } catch {
      /* ignore */
    }
    const pid = activeProjectIdRef.current;
    const cur = projectsRef.current.find((x) => x.id === pid);
    if (cur?.diskSaveEstablished) {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === pid ? { ...p, draftAutosaveIntervalMin: v, updatedAt: Date.now() } : p
        );
        projectsRef.current = next;
        void trackProjectSave(saveProjectLibrary(next, pid));
        return next;
      });
    }
  }, []);

  const cancelDraftDiskModal = useCallback(() => {
    const modal = draftDiskModalRef.current;
    if (modal?.mode === 'firstSave') {
      const resolve = draftDiskFlowResolveRef.current;
      draftDiskFlowResolveRef.current = null;
      setDraftDiskModal(null);
      const { mergedProjects, pid } = modal;
      void (async () => {
        setProjects(mergedProjects);
        projectsRef.current = mergedProjects;
        const ok = await trackProjectSave(saveProjectLibrary(mergedProjects, pid));
        if (!ok) alert('保存失败：无法写入 IndexedDB 草稿库。');
        else persistWarningShownRef.current = false;
        resolve?.(false);
      })();
      return;
    }
    draftDiskFlowResolveRef.current = null;
    setDraftDiskModal(null);
  }, []);

  const confirmDraftDiskModal = useCallback(async () => {
    const modal = draftDiskModalRef.current;
    if (!modal) return;

    const snap =
      modal.mode === 'firstSave'
        ? modal.mergedProjects.find((p) => p.id === modal.pid)
        : modal.snapshot;
    if (!snap) {
      alert('无法保存：项目数据无效。');
      return;
    }

    const defaultStem = projectExportBasename(snap);
    const raw = modal.basenameDraft.trim();
    const stem = sanitizeFilename((raw || defaultStem).replace(/\.json$/i, ''));
    const filename = `${stem}.json`;

    const payload = { ...snap };
    delete (payload as { diskSaveEstablished?: boolean }).diskSaveEstablished;
    const json = JSON.stringify(payload, null, 2);

    const w = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      showSaveFilePicker?: (opts: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    };

    let fileHandle: FileSystemFileHandle;
    let dirHandle: FileSystemDirectoryHandle | null = null;

    try {
      if (typeof w.showDirectoryPicker === 'function') {
        dirHandle = await w.showDirectoryPicker({ mode: 'readwrite' });
        fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      } else if (typeof w.showSaveFilePicker === 'function') {
        fileHandle = await w.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON 文件', accept: { 'application/json': ['.json'] } }],
        });
      } else {
        alert('当前浏览器不支持选择保存文件夹，请使用 Chrome / Edge（HTTPS 或 localhost）。');
        return;
      }

      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      console.error(e);
      alert('写入失败：可能无权限或磁盘已满。');
      return;
    }

    if (modal.mode === 'saveAs') {
      setDraftDiskModal(null);
      setSaveSuccessMsg(`已另存为: ${fileHandle.name}`);
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(null), 3000);
      return;
    }

    const pid = modal.pid;
    try {
      await persistProjectBackupFileHandle(pid, fileHandle);
      if (dirHandle) await persistProjectDraftDirectoryHandle(pid, dirHandle);
    } catch (e) {
      console.warn(e);
    }

    lastJsonFileHandleRef.current = fileHandle;
    lastDiskWriteFormatRef.current = 'json';
    setLastJsonFilename(fileHandle.name);

    const folderLabel = dirHandle?.name?.trim() || '';
    const pathNote = folderLabel ? `${folderLabel} · ${fileHandle.name}` : fileHandle.name;
    const projectName = (snap.name || '').trim();
    const draftTitle = stem !== projectName ? stem : undefined;

    const resolve = draftDiskFlowResolveRef.current;
    draftDiskFlowResolveRef.current = null;
    setDraftDiskModal(null);

    const updatedList = modal.mergedProjects.map((p) =>
      p.id === pid
        ? {
            ...p,
            diskSaveEstablished: true as const,
            draftStoragePathNote: pathNote,
            draftTitle,
            draftAutosaveIntervalMin: 5 as const,
            updatedAt: Date.now(),
          }
        : p
    );

    setProjects(updatedList);
    projectsRef.current = updatedList;
    const ok = await trackProjectSave(saveProjectLibrary(updatedList, pid));
    if (!ok) alert('本地 JSON 已写入，但同步 IndexedDB 草稿库失败，请重试。');
    else persistWarningShownRef.current = false;

    setAutosaveIntervalMin(5);
    try {
      localStorage.setItem('wxcanvas-autosave-interval-min', '5');
    } catch {
      /* ignore */
    }

    if (dirHandle) setActiveProjectDraftDownloadDirectory(dirHandle);
    else setActiveProjectDraftDownloadDirectory(null);

    resolve?.(ok);
    if (ok) {
      const savedPath = pathNote || fileHandle.name;
      setSaveSuccessMsg(`草稿已绑定至: ${savedPath}`);
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  }, []);

  const handleApplyDraftTitle = useCallback(() => {
    const pid = activeProjectIdRef.current;
    if (!pid) return;
    const trimmed = draftNameInput.trim();
    const nameRef = projectsRef.current.find((x) => x.id === pid)?.name?.trim() || '';
    const useCustom = trimmed.length > 0 && trimmed !== nameRef;
    setProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== pid) return p;
        return {
          ...p,
          draftTitle: useCustom ? trimmed : undefined,
        updatedAt: Date.now(),
      };
      });
      projectsRef.current = next;
      void trackProjectSave(saveProjectLibrary(next, pid)).then((ok) => {
        if (!ok) alert('草稿名称已更新，但写入草稿库失败，请重试。');
      });
      return next;
    });
  }, [draftNameInput]);

  const handleApplyDraftStoragePath = useCallback(async () => {
    const pid = activeProjectIdRef.current;
    if (!pid) return;

    const persistPath = (raw: string) => {
      const cleaned = sanitizeDraftStoragePathNote(raw) || raw.trim();
      setDraftStoragePathInput(cleaned);
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === pid
            ? { ...p, draftStoragePathNote: cleaned || undefined, updatedAt: Date.now() }
            : p
        );
        projectsRef.current = next;
        void trackProjectSave(saveProjectLibrary(next, pid)).then((ok) => {
          if (!ok) alert('草稿存储位置已更新，但写入草稿库失败，请重试。');
        });
        return next;
      });
    };

    if (supportsFileSystemAccess()) {
      try {
        const w = window as unknown as {
          showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
        };
        const dirHandle = await w.showDirectoryPicker?.({ mode: 'read' });
        if (!dirHandle) {
          throw new Error('no handle');
        }
        const folderName = (dirHandle.name || '').trim();
        persistPath(folderName);
        return;
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        console.warn('showDirectoryPicker 失败', e);
      }
    }

    const suggestion = draftStoragePathInput.trim();
    const entered = window.prompt(
      '当前环境不支持文件夹选择器（请使用 Chrome / Edge 且为 HTTPS 或 localhost），或您已取消选择。请手动输入本机草稿所在完整路径：',
      suggestion
    );
    if (entered === null) return;
    persistPath(entered.trim());
  }, [draftStoragePathInput]);

  const commitCenterProjectRename = useCallback((raw: string) => {
    setCenterTitleEditValue(null);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const pid = activeProjectIdRef.current;
    if (!pid) return;
    const merged = mergeCurrentCanvasIntoProjectList(
      projectsRef.current,
      pid,
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    const next = merged.map((p) =>
      p.id === pid
        ? { ...p, name: trimmed, draftTitle: undefined, updatedAt: Date.now() }
        : p
    );
    setProjects(next);
    projectsRef.current = next;
    setDraftNameInput(trimmed);
    void trackProjectSave(saveProjectLibrary(next, pid)).then((ok) => {
      if (!ok) alert('名称已更新，但写入草稿库失败，请重试。');
    });
  }, []);

  const switchProject = useCallback((projectId: string) => {
    const target = projectsRef.current.find((p) => p.id === projectId);
    if (!target) return;
    saveCurrentProject();
    const { project: normalizedTarget, stripped } = normalizeProjectStripLegacyAutoT2i(target);
    if (stripped) {
      const next = projectsRef.current.map((p) => (p.id === projectId ? normalizedTarget : p));
      setProjects(next);
      projectsRef.current = next;
      void trackProjectSave(saveProjectLibrary(next, projectId)).then((ok) => {
        if (!ok) console.warn('[canvas] 切换项目时已剥离旧版默认文生图占位，但写回草稿库失败');
      });
    }
    setActiveProjectId(projectId);
    setNodes(normalizedTarget.nodes || []);
    setEdges(normalizedTarget.edges || []);
    pendingDefaultViewportRef.current = true;
    if (normalizedTarget.auditModeData?.images) {
      setAuditImages(normalizedTarget.auditModeData.images);
      auditImagesRef.current = normalizedTarget.auditModeData.images;
    } else {
      setAuditImages([]);
      auditImagesRef.current = [];
    }
    void getProjectBackupFileHandle(projectId).then((h) => {
      lastJsonFileHandleRef.current = h ?? null;
      lastZipFileHandleRef.current = null;
      lastDiskWriteFormatRef.current = h ? 'json' : null;
      setLastJsonFilename(h?.name ?? '');
    });
  }, [saveCurrentProject]);

  const deleteProject = useCallback((projectId: string) => {
    void removeProjectBackupFileHandle(projectId);
    const prev = projectsRef.current;
    if (prev.length <= 1) return;
    const remained = prev.filter((p) => p.id !== projectId);
    const curActive = activeProjectIdRef.current;

    if (curActive === projectId) {
      const fallback = remained[0];
      if (!fallback) return;
      const { project: fbNorm, stripped } = normalizeProjectStripLegacyAutoT2i(fallback);
      const nextRemained = stripped
        ? remained.map((p) => (p.id === fbNorm.id ? fbNorm : p))
        : remained;
      setProjects(nextRemained);
      projectsRef.current = nextRemained;
      setActiveProjectId(fbNorm.id);
      setNodes(fbNorm.nodes || []);
      setEdges(fbNorm.edges || []);
      pendingDefaultViewportRef.current = true;
      void getProjectBackupFileHandle(fbNorm.id).then((h) => {
        lastJsonFileHandleRef.current = h ?? null;
        lastZipFileHandleRef.current = null;
        lastDiskWriteFormatRef.current = h ? 'json' : null;
        setLastJsonFilename(h?.name ?? '');
      });
      void trackProjectSave(saveProjectLibrary(nextRemained, fbNorm.id)).then((ok) => {
        if (!ok) alert('项目已删除，但更新草稿库失败，请尝试导出 ZIP/JSON 备份。');
      });
      return;
    }

    setProjects(remained);
    projectsRef.current = remained;
    void trackProjectSave(saveProjectLibrary(remained, curActive)).then((ok) => {
      if (!ok) alert('项目已删除，但更新草稿库失败，请尝试导出 ZIP/JSON 备份。');
    });
  }, []);

  const handleExportProjectJson = useCallback(
    async (project: CanvasProject) => {
      const filename = `${projectExportBasename(project)}.json`;
      // 与「另存为 JSON」一致：若目标即当前打开的项目，附带内存中最新的画布（含 base64 图片）；
      // 其他项目直接用项目快照（含 base64，因为 mergeCurrentCanvasIntoProjectList 不再 strip）
      const snapshot = projectSnapshotForJsonExport(project);
      const payload = { ...snapshot };
      delete (payload as { diskSaveEstablished?: boolean }).diskSaveEstablished;
      const r = await saveJsonToDisk(filename, payload, { backupProjectId: project.id });
      if (r !== 'saved') return;
      const pid = project.id;
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === pid ? { ...p, diskSaveEstablished: true as const } : p));
        projectsRef.current = next;
        void trackProjectSave(saveProjectLibrary(next, activeProjectIdRef.current));
        return next;
      });
    },
    [saveJsonToDisk, projectSnapshotForJsonExport]
  );

  /** 项目管理「打开位置」：需已填「草稿存储位置」或已绑定另存为 JSON；再提示 IndexedDB 与参考路径 */
  const openProjectLocationInfo = useCallback((project: CanvasProject) => {
    void (async () => {
      const manualRaw = project.draftStoragePathNote?.trim() || '';
      const manual = manualRaw ? sanitizeDraftStoragePathNote(manualRaw) || manualRaw : '';
      const jsonHandle = await getProjectBackupFileHandle(project.id);
      if (!manual && !jsonHandle) {
        window.alert(
          [
            '尚未设置可展示的本地参考路径。',
            '',
            '请先在本窗口上方填写「草稿存储位置」（您本机用于存放草稿/备份的文件夹路径，仅作记录），',
            '或先通过「保存当前画布 / 导出 JSON」使用系统「另存为」绑定 JSON 文件后再点「打开位置」。',
            '若与草稿说明为同一路径，只需在「草稿存储位置」中填写即可。',
          ].join('\n')
        );
        return;
      }
      const { database, objectStore, documentKey } = CANVAS_LIBRARY_IDB_LABELS;
      const lines: string[] = [
        '【浏览器内实际草稿】保存在 IndexedDB（无 D:\\… 普通文件夹路径）：',
        `数据库：${database}`,
        `对象库：${objectStore}`,
        `键：${documentKey}`,
        '',
      ];
      if (manual) {
        lines.push('【您填写的本机草稿/备份参考路径】');
        lines.push(manual);
        lines.push('');
      }
      if (jsonHandle) {
        lines.push('【已绑定的另存为 JSON 文件名】');
        lines.push(jsonHandle.name);
        lines.push('');
      }
      lines.push('Chrome / Edge：按 F12 →「应用程序」(Application) →「IndexedDB」可查看库内数据。');
      window.alert(lines.join('\n'));
    })();
  }, []);

  /** 导出 JSON 时：若目标即当前打开的项目，附带内存中最新的画布（无需先点保存） */
  const projectSnapshotForJsonExport = useCallback((project: CanvasProject): CanvasProject => {
    if (project.id !== activeProjectIdRef.current) return project;
    const { nodes: nc, edges: ec, transform: tc } = cloneCanvasForProject(
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    return { ...project, nodes: nc, edges: ec, transform: tc, updatedAt: Date.now() };
  }, []);

  /** Ctrl+Alt+S：另存 JSON（选文件夹 + 文件名），不替换当前绑定的主草稿 */
  const handleSaveDraftJsonSaveAs = useCallback(() => {
    const active = projectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    if (!active) {
      alert('未找到当前项目');
      return;
    }
    const snapshot = projectSnapshotForJsonExport(active);
    setDraftDiskModal({
      mode: 'saveAs',
      snapshot,
      basenameDraft: projectExportBasename(snapshot),
    });
  }, [projectSnapshotForJsonExport]);

  const handleExportProjectZip = useCallback(
    async (project: CanvasProject) => {
      try {
        const r = await exportProjectZipToDisk(projectSnapshotForJsonExport(project));
        if (r.kind === 'aborted') return;
        if (r.kind === 'handle') {
          lastZipFileHandleRef.current = r.handle;
          lastDiskWriteFormatRef.current = 'zip';
        }
        const pid = project.id;
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === pid ? { ...p, diskSaveEstablished: true as const } : p));
          projectsRef.current = next;
          void trackProjectSave(saveProjectLibrary(next, activeProjectIdRef.current));
          return next;
        });
      } catch (e) {
        console.error(e);
        alert('导出 ZIP 失败，请重试。');
      }
    },
    [projectSnapshotForJsonExport]
  );

  const finishImportNewProject = useCallback((newProject: CanvasProject) => {
    const merged = mergeCurrentCanvasIntoProjectList(
      projectsRef.current,
      activeProjectIdRef.current,
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    const nextList = [newProject, ...merged];
    setProjects(nextList);
    projectsRef.current = nextList;
    setActiveProjectId(newProject.id);
    setNodes(newProject.nodes);
    setEdges(newProject.edges);
    pendingDefaultViewportRef.current = true;
    if (newProject.auditModeData?.images) {
      setAuditImages(newProject.auditModeData.images);
      auditImagesRef.current = newProject.auditModeData.images;
    } else {
      setAuditImages([]);
      auditImagesRef.current = [];
    }
    void trackProjectSave(saveProjectLibrary(nextList, newProject.id)).then((ok) => {
      if (!ok) {
        alert('导入已生效，但写入草稿库失败。请导出 ZIP/JSON 备份后重试。');
      } else {
        persistWarningShownRef.current = false;
      }
    });
  }, []);

  const handleImportProjectFile = useCallback(
    (file: File) => {
      const lower = file.name.toLowerCase();
      const isZip =
        lower.endsWith('.zip') ||
        lower.endsWith('.wxcanvas.zip') ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed';

      if (isZip) {
        void parseProjectFromZipFile(file)
          .then((parsed) => {
            const newProject: CanvasProject = {
              ...parsed,
              id: `project-${Date.now()}`,
              name: parsed.name || file.name.replace(/\.(wxcanvas\.)?zip$/i, '') || '导入项目',
      updatedAt: Date.now(),
              diskSaveEstablished: false,
            };
            finishImportNewProject(newProject);
          })
          .catch((err) => {
            console.error(err);
            alert(err instanceof Error ? err.message : '导入 ZIP 失败');
          });
        return;
      }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const imported = JSON.parse(raw) as Partial<CanvasProject>;
        if (!imported || !Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) {
          alert('导入失败：JSON 格式不正确。');
          return;
        }
          const impNodes = imported.nodes as CanvasNode[];
          const impEdges = imported.edges as Edge[];
        const newProject: CanvasProject = {
          id: `project-${Date.now()}`,
          name: (imported.name || file.name.replace(/\.json$/i, '') || '导入项目').toString(),
          updatedAt: Date.now(),
            nodes: impNodes,
            edges: impEdges,
          transform: (imported.transform || { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE }) as Transform,
            diskSaveEstablished: false,
            draftStoragePathNote:
              typeof imported.draftStoragePathNote === 'string' && imported.draftStoragePathNote.trim()
                ? imported.draftStoragePathNote.trim()
                : undefined,
          };
          finishImportNewProject(newProject);
      } catch (err) {
        console.error('导入项目失败:', err);
        alert('导入失败：无法解析 JSON。');
      }
    };
    reader.readAsText(file);
    },
    [finishImportNewProject]
  );

  // 初始化项目数据：IndexedDB 草稿库；首次启动时从旧 localStorage 迁移
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await loadProjectLibrary();
        if (cancelled) return;
        if (lib && lib.projects.length > 0) {
          const { next: patchedProjects, changed: libStrippedLegacy } =
            normalizeLibraryProjectsStripLegacyAutoT2i(lib.projects);
          const activeId = lib.activeProjectId || patchedProjects[0].id;
          const initial =
            patchedProjects.find((p) => p.id === activeId) || patchedProjects[0];
          setProjects(patchedProjects);
          projectsRef.current = patchedProjects;
          setActiveProjectId(initial.id);
          setNodes(initial.nodes || []);
          setEdges(initial.edges || []);
          pendingDefaultViewportRef.current = true;
          if (initial.auditModeData?.images) {
            setAuditImages(initial.auditModeData.images);
            auditImagesRef.current = initial.auditModeData.images;
          } else {
            setAuditImages([]);
            auditImagesRef.current = [];
          }
          if (libStrippedLegacy) {
            void trackProjectSave(saveProjectLibrary(patchedProjects, initial.id)).then((ok) => {
              if (!ok) console.warn('[canvas] 已剥离旧版默认文生图占位，但写回草稿库失败');
            });
          }
          setProjectStoreReady(true);
          void getProjectBackupFileHandle(initial.id).then((h) => {
            if (cancelled) return;
            lastJsonFileHandleRef.current = h ?? null;
            lastZipFileHandleRef.current = null;
            lastDiskWriteFormatRef.current = h ? 'json' : null;
            setLastJsonFilename(h?.name ?? '');
          });
          return;
      }
    } catch (err) {
      console.error('读取项目存档失败:', err);
    }
      if (cancelled) return;
    const defaultProject: CanvasProject = {
      id: `project-${Date.now()}`,
      name: '默认项目',
      updatedAt: Date.now(),
      nodes: useCanvasStore.getState().nodes,
      edges: useCanvasStore.getState().edges,
      transform: useCanvasStore.getState().transform,
    };
    setProjects([defaultProject]);
      projectsRef.current = [defaultProject];
    setActiveProjectId(defaultProject.id);
      await trackProjectSave(saveProjectLibrary([defaultProject], defaultProject.id));
    setProjectStoreReady(true);
      void getProjectBackupFileHandle(defaultProject.id).then((h) => {
        if (cancelled) return;
        lastJsonFileHandleRef.current = h ?? null;
        lastZipFileHandleRef.current = null;
        lastDiskWriteFormatRef.current = h ? 'json' : null;
        setLastJsonFilename(h?.name ?? '');
      });
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    showProjectModal,
    setShowProjectModal,
    saveSuccessMsg,
    setSaveSuccessMsg,
    projectExportMenuOpen,
    setProjectExportMenuOpen,
    projectStoreReady,
    pendingDefaultViewportRef,
    autosaveIntervalMin,
    draftNameInput,
    setDraftNameInput,
    draftStoragePathInput,
    setDraftStoragePathInput,
    centerTitleEditValue,
    setCenterTitleEditValue,
    skipCenterRenameBlurRef,
    persistWarningShownRef,
    lastJsonFilename,
    draftDiskModal,
    setDraftDiskModal,
    projectImportInputRef,
    projectsRef,
    activeProjectIdRef,
    createNewProject,
    saveCurrentProject,
    switchProject,
    deleteProject,
    handleExportProjectJson,
    handleExportProjectZip,
    handleImportProjectFile,
    handleApplyDraftTitle,
    handleApplyDraftStoragePath,
    handleAutosaveIntervalChange,
    cancelDraftDiskModal,
    confirmDraftDiskModal,
    openProjectLocationInfo,
    projectSnapshotForJsonExport,
    handleSaveDraftJsonSaveAs,
    commitCenterProjectRename,
    flushPendingProjectWrites,
  };
}

