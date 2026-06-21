import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { AuditImage, CanvasNode, Edge, Transform } from '../types';
import { hydrateNodesMediaFromAssets } from './jsonExportMediaHydrate';
import { findMissingNodeMediaAssetIds, findMissingNodeWindowMedia, flushAllNodeMediaOffload } from '../services/canvasAssetSync';
import {
  loadProjectLibrary,
  saveProjectLibrary,
  exportProjectZipToDisk,
  overwriteProjectZipFileHandle,
  buildProjectZipBlob,
  projectZipFilename,
  restoreProjectAssetsFromZipFileHandle,
  parseProjectFromZipFile,
  sanitizeFilename,
  CANVAS_LIBRARY_IDB_LABELS,
} from '../services/projectPersistence';
import {
  getProjectBackupFileHandle,
  getProjectZipBackupFileHandle,
  getProjectDraftDirectoryHandle,
  persistProjectBackupFileHandle,
  persistProjectZipBackupFileHandle,
  persistProjectDraftDirectoryHandle,
  removeProjectBackupFileHandle,
} from '../services/projectBackupHandleStore';
import { setActiveProjectDraftDownloadDirectory, resolveDirectoryHandleFromFileHandle, supportsFileSystemAccess } from '../services/downloadPathSettings';
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
import { requestPersistentCanvasStorage } from '../services/storagePersistence';

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
  const restoreBoundBackupHandle = useCallback(async (project: CanvasProject | undefined | null): Promise<void> => {
    lastJsonFileHandleRef.current = null;
    lastZipFileHandleRef.current = null;
    lastDiskWriteFormatRef.current = null;
    setLastJsonFilename('');
    if (!project?.id || !project.diskSaveEstablished) return;
    if (project.draftDiskWriteFormat === 'zip') {
      const h = await getProjectZipBackupFileHandle(project.id);
      lastZipFileHandleRef.current = h ?? null;
      lastDiskWriteFormatRef.current = h ? 'zip' : null;
      return;
    }
    const h = await getProjectBackupFileHandle(project.id);
    lastJsonFileHandleRef.current = h ?? null;
    lastDiskWriteFormatRef.current = h ? 'json' : null;
    setLastJsonFilename(h?.name ?? '');
  }, []);
  const restoreProjectAssetsFromBoundZip = useCallback(async (project: CanvasProject | undefined | null): Promise<void> => {
    if (!project?.id || project.draftDiskWriteFormat !== 'zip') return;
    try {
      let h = lastZipFileHandleRef.current;
      if (!h) h = (await getProjectZipBackupFileHandle(project.id)) ?? null;
      if (!h) return;
      const restored = await restoreProjectAssetsFromZipFileHandle(h);
      if (restored > 0) {
        lastZipFileHandleRef.current = h;
        lastDiskWriteFormatRef.current = 'zip';
        console.info(`[canvas] 已从绑定 ZIP 恢复 ${restored} 个图片资产`);
      }
    } catch (e) {
      console.warn('[canvas] 从绑定 ZIP 恢复图片资产失败', e);
    }
  }, []);
  const restoreMissingMediaSlotsFromSavedProject = useCallback(
    async (currentNodes: CanvasNode[], savedProject: CanvasProject | undefined | null): Promise<CanvasNode[]> => {
      if (!savedProject?.nodes?.length) return currentNodes;
      const savedNodes = await hydrateNodesMediaFromAssets(savedProject.nodes || []);
      const savedById = new Map(savedNodes.map((node) => [node.id, node]));
      let changed = false;

      const fillArray = (
        curValues: string[] | undefined,
        curIds: string[] | undefined,
        savedValues: string[] | undefined,
        savedIds: string[] | undefined,
      ): { values?: string[]; ids?: string[] } => {
        if (!curIds?.some(Boolean)) return { values: curValues, ids: curIds };
        const values = [...(curValues ?? [])];
        const ids = [...curIds];
        let localChanged = false;
        for (let i = 0; i < ids.length; i++) {
          if (!ids[i]) continue;
          if ((values[i] || '').trim().length > 80 || /^https?:\/\//i.test((values[i] || '').trim())) continue;
          const savedValue = savedValues?.[i];
          const savedId = savedIds?.[i];
          if (savedValue && savedValue.trim().length > 80) {
            values[i] = savedValue;
            if (savedId) ids[i] = savedId;
            localChanged = true;
          }
        }
        if (localChanged) changed = true;
        return { values, ids };
      };

      const fillSingle = (
        curValue: string | undefined,
        curId: string | undefined,
        savedValue: string | undefined,
        savedId: string | undefined,
      ): { value?: string; id?: string } => {
        if (!curId) return { value: curValue, id: curId };
        const s = (curValue || '').trim();
        if (s.length > 80 || /^https?:\/\//i.test(s)) return { value: curValue, id: curId };
        if (savedValue && savedValue.trim().length > 80) {
          changed = true;
          return { value: savedValue, id: savedId || curId };
        }
        return { value: curValue, id: curId };
      };

      const restored = currentNodes.map((node) => {
        const saved = savedById.get(node.id);
        if (!saved) return node;
        let next: CanvasNode = { ...node };

        const images = fillArray(node.images, node.imageAssetIds, saved.images, saved.imageAssetIds);
        next.images = images.values;
        next.imageAssetIds = images.ids;

        const curPanorama = node as CanvasNode & { panoramaImage?: string; panoramaImageAssetId?: string };
        const savedPanorama = saved as CanvasNode & { panoramaImage?: string; panoramaImageAssetId?: string };
        const panorama = fillSingle(
          curPanorama.panoramaImage,
          curPanorama.panoramaImageAssetId,
          savedPanorama.panoramaImage,
          savedPanorama.panoramaImageAssetId,
        );
        (next as typeof curPanorama).panoramaImage = panorama.value;
        (next as typeof curPanorama).panoramaImageAssetId = panorama.id;

        const curSource = node as CanvasNode & { sourceImage?: string; sourceImageAssetId?: string };
        const savedSource = saved as CanvasNode & { sourceImage?: string; sourceImageAssetId?: string };
        const source = fillSingle(
          curSource.sourceImage,
          curSource.sourceImageAssetId,
          savedSource.sourceImage,
          savedSource.sourceImageAssetId,
        );
        (next as typeof curSource).sourceImage = source.value;
        (next as typeof curSource).sourceImageAssetId = source.id;

        const curBg = node as CanvasNode & { backgroundImage?: string; backgroundImageAssetId?: string };
        const savedBg = saved as CanvasNode & { backgroundImage?: string; backgroundImageAssetId?: string };
        const bg = fillSingle(
          curBg.backgroundImage,
          curBg.backgroundImageAssetId,
          savedBg.backgroundImage,
          savedBg.backgroundImageAssetId,
        );
        (next as typeof curBg).backgroundImage = bg.value;
        (next as typeof curBg).backgroundImageAssetId = bg.id;

        const curGrid = node as CanvasNode & {
          inputImage?: string;
          inputImageAssetId?: string;
          outputImages?: string[];
          outputImageAssetIds?: string[];
          inputImages?: string[];
          inputImageAssetIds?: string[];
          outputImage?: string;
          outputImageAssetId?: string;
        };
        const savedGrid = saved as typeof curGrid;
        const input = fillSingle(curGrid.inputImage, curGrid.inputImageAssetId, savedGrid.inputImage, savedGrid.inputImageAssetId);
        (next as typeof curGrid).inputImage = input.value;
        (next as typeof curGrid).inputImageAssetId = input.id;
        const outputImages = fillArray(curGrid.outputImages, curGrid.outputImageAssetIds, savedGrid.outputImages, savedGrid.outputImageAssetIds);
        (next as typeof curGrid).outputImages = outputImages.values;
        (next as typeof curGrid).outputImageAssetIds = outputImages.ids;
        const inputImages = fillArray(curGrid.inputImages, curGrid.inputImageAssetIds, savedGrid.inputImages, savedGrid.inputImageAssetIds);
        (next as typeof curGrid).inputImages = inputImages.values;
        (next as typeof curGrid).inputImageAssetIds = inputImages.ids;
        const output = fillSingle(curGrid.outputImage, curGrid.outputImageAssetId, savedGrid.outputImage, savedGrid.outputImageAssetId);
        (next as typeof curGrid).outputImage = output.value;
        (next as typeof curGrid).outputImageAssetId = output.id;

        return next;
      });

      return changed ? restored : currentNodes;
    },
    []
  );
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
        // 拿到 JSON 文件句柄后, 主动解析出所在目录, 注册为图片/视频下载目录
        // 这样后续点图片下载能自动写入 json 同路径, 不必再弹"另存为"
        void (async () => {
          try {
            const dir = await resolveDirectoryHandleFromFileHandle(handle as FileSystemFileHandle);
            if (!dir) return;
            if (backupPid) {
              await persistProjectDraftDirectoryHandle(backupPid, dir);
            }
            setActiveProjectDraftDownloadDirectory(dir);
          } catch (e) {
            console.warn('解析 json 所在目录失败, 图片下载将回退为弹窗', e);
          }
        })();
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
   * - 「保存当前画布 / Ctrl+S」：写入 IndexedDB；若该项目尚未绑定本地草稿，会先弹出对话框填写文件名并选择保存文件夹（Chrome / Edge）；确认后默认绑定 ZIP，项目名下展示草稿位置；取消则仍只写草稿库；
   * - 已绑定草稿后：**Ctrl+S** 会同步覆盖绑定的 ZIP / JSON；**Ctrl+Alt+S（⌘+⌥+S）** 为「另存 JSON」（选文件夹 + 文件名），不改变当前绑定的主草稿；
   * - 「定时自动保存」：已绑定草稿的项目打开时默认每 **5** 分钟静默保存（IndexedDB + 覆盖绑定 ZIP / JSON）；可在项目管理里改为关闭或其它间隔；
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

  const flushBoundDraftBackupToDisk = useCallback(
    async (
      pid: string,
      list: CanvasProject[],
      opts?: { alertOnFailure?: boolean; onSaved?: (filename: string) => void }
    ): Promise<string | null> => {
      const p = list.find((x) => x.id === pid);
      const format = p?.draftDiskWriteFormat || lastDiskWriteFormatRef.current;
      if (!p?.diskSaveEstablished || (format !== 'json' && format !== 'zip')) return null;
      if (format === 'zip') {
        let h = lastZipFileHandleRef.current as FileSystemFileHandle | null;
        if (!h) {
          const fetched = await getProjectZipBackupFileHandle(pid);
          h = fetched ?? null;
          lastZipFileHandleRef.current = h;
        }
        if (!h) return null;
        const savedFilename = h.name || '';
        try {
          await overwriteProjectZipFileHandle(h, p);
          lastDiskWriteFormatRef.current = 'zip';
          opts?.onSaved?.(savedFilename);
          return savedFilename;
        } catch (e) {
          console.warn('[canvas] 覆盖本地草稿 ZIP 失败', e);
          if (opts?.alertOnFailure) {
            alert('草稿库已更新，但覆盖本地 ZIP 备份失败（文件可能被移动或无写入权限）。');
          }
          return null;
        }
      }
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
        delete (forWrite as { draftDiskWriteFormat?: 'json' | 'zip' }).draftDiskWriteFormat;
        // 把被 offload 到 IDB 资产库的大图反向读回 base64 写进文件，否则换电脑打开 JSON 全是空图。
        const hydratedNodes = await hydrateNodesMediaFromAssets(forWrite.nodes || []);
        const payload = { ...forWrite, nodes: hydratedNodes };
        const json = JSON.stringify(payload, null, 2);
        const writable = await h.createWritable();
        await writable.write(json);
        await writable.close();
        lastDiskWriteFormatRef.current = 'json';
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
    async (options?: { skipDiskPrompt?: boolean }): Promise<boolean> => {
      const pid = activeProjectIdRef.current;
      if (!pid) {
        alert('项目数据仍在加载，请稍后再试保存。');
        return Promise.resolve(false);
      }
      /**
       * 关键第一步：autosave 前强制 flush 媒体 offload 队列。
       *
       * 根因：CanvasApp 的 offload effect 是异步订阅式执行的，可能有部分大图
       * 内存里仍是 base64、imageAssetIds 对应位置为空，且 IDB 里还没记录。
       * 此时若直接走 merge → hydrate，hydrate 会按 imageAssetIds 查 IDB 查不到，
       * 然后把 images[i] 永久置空——这就是用户描述的「突然丢一批最近生成的图」。
       *
       * flushAllNodeMediaOffload 会同步遍历所有节点，把「需要 offload」的大图全部
       * 写入 IDB；返回的 patches 同步应用到 store + nodesRef，再走 merge + hydrate。
       * 若 IDB 写入失败（quota exceeded 等），flush 内部会让对应格保持原 base64，
       * 后续 merge 仍然能拿到完整 base64，丢图风险被切断。
       */
      const offloadPatches = await flushAllNodeMediaOffload(nodesRef.current);
      let currentNodes = nodesRef.current;
      if (offloadPatches.size > 0) {
        // 把 offload 后的 patches 同步推到 zustand store，让 nodesRef 与 store 保持一致；
        // 同时保存一份「patch 后」的最新 nodes 给 merge 用（避免等到 React 重渲染再去读 ref）。
        currentNodes = nodesRef.current.map((n) => {
          const p = offloadPatches.get(n.id);
          return p ? { ...n, ...p } : n;
        });
        setNodes(currentNodes);
        if (typeof console !== 'undefined') {
          console.info(
            `[saveCurrentProject] flush offload: ${offloadPatches.size} nodes patched before merge`
          );
        }
      }
      if (options?.skipDiskPrompt) {
        const savedProject = projectsRef.current.find((p) => p.id === pid);
        let missingWindowMedia = await findMissingNodeWindowMedia(currentNodes);
        if (missingWindowMedia.slotCount > 0) {
          await restoreProjectAssetsFromBoundZip(savedProject);
          missingWindowMedia = await findMissingNodeWindowMedia(currentNodes);
        }
        if (missingWindowMedia.slotCount > 0) {
          const restoredNodes = await restoreMissingMediaSlotsFromSavedProject(currentNodes, savedProject);
          if (restoredNodes !== currentNodes) {
            currentNodes = restoredNodes;
            setNodes(currentNodes);
            missingWindowMedia = await findMissingNodeWindowMedia(currentNodes);
          }
        }
        if (missingWindowMedia.slotCount > 0) {
          console.warn(
            `[saveCurrentProject] 自动保存已暂停：检测到 ${missingWindowMedia.nodeIds.length} 个仍存在的节点窗口内有 ${missingWindowMedia.slotCount} 个图片内容缺失，避免覆盖上一次正常草稿。节点=${missingWindowMedia.nodeIds.join(',')}`
          );
          return false;
        }
      }
      let missingAssets = await findMissingNodeMediaAssetIds(currentNodes);
      if (missingAssets.length > 0) {
        const projectForRestore = projectsRef.current.find((p) => p.id === pid);
        await restoreProjectAssetsFromBoundZip(projectForRestore);
        missingAssets = await findMissingNodeMediaAssetIds(currentNodes);
        if (missingAssets.length > 0) {
          console.warn(
            `[saveCurrentProject] 仍有 ${missingAssets.length} 个图片资产缺失，保存会保留占位引用：${missingAssets.join(',')}`
          );
        }
      }
      const nextProjects = mergeCurrentCanvasIntoProjectList(
        projectsRef.current,
        pid,
        currentNodes,
        edgesRef.current,
        transformRef.current,
        auditImagesRef.current.length > 0 ? { images: auditImagesRef.current } : undefined
      );
      /**
       * 关键：autosave / 任何保存路径写入 IDB 前，强制把每个项目的 nodes 用 hydrateNodesMediaFromAssets
       * 反向从 IDB 资产库补回 base64。即使内存中 nodes 已被 canvasAssetSync offload 清成空串 + assetId，
       * 只要 IDB 资产还在，写入 IDB 的 projects 仍然是「完整 base64 版本」，刷新后 hydrate 必然能救回。
       * 解决「半小时后图裂开/丢图」的根因——之前 autosave 直接写入了带空 base64 + assetId 的版本，
       * 一旦 IDB 资产库被浏览器回收（夸克浏览器的 IDB 清理策略），刷新就彻底没图了。
       */
      const hydratedNextProjects = await Promise.all(
        nextProjects.map(async (p) => ({
          ...p,
          nodes: await hydrateNodesMediaFromAssets(p.nodes || []),
        }))
      );
      const cur = hydratedNextProjects.find((p) => p.id === pid);
      const hasBoundZip = cur?.diskSaveEstablished && cur.draftDiskWriteFormat === 'zip';
      const needsDiskPrompt = !options?.skipDiskPrompt && cur != null && !hasBoundZip;

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
          const ok = await commitToIdb(hydratedNextProjects);
          if (!ok) return false;
          await flushBoundDraftBackupToDisk(pid, hydratedNextProjects, {
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
          mergedProjects: hydratedNextProjects,
          pid,
          basenameDraft: projectExportBasename(cur as CanvasProject),
        });
      });
    },
    [flushBoundDraftBackupToDisk, restoreMissingMediaSlotsFromSavedProject, restoreProjectAssetsFromBoundZip]
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
      if (!p?.diskSaveEstablished || p.draftDiskWriteFormat !== 'zip') return;
      void saveCurrentProjectRef.current({ skipDiskPrompt: true });
    }, ms);
    return () => clearInterval(timer);
  }, [projectStoreReady, autosaveIntervalMin]);

  useEffect(() => {
    if (!projectStoreReady || !activeProjectId) return;
    const pid = activeProjectId;
    void (async () => {
      const existing = await getProjectDraftDirectoryHandle(pid);
      if (existing) {
        // 已存的目录句柄：浏览器重启/权限过期时主动 requestPermission 重新授权，
        // 避免后续下载时静默回退到另存为对话框（用户没注意系统弹窗）
        try {
          const w = existing as unknown as {
            queryPermission?: (opts: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
            requestPermission?: (opts: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
          };
          if (typeof w.queryPermission === 'function') {
            let st = await w.queryPermission({ mode: 'readwrite' });
            if (st !== 'granted' && typeof w.requestPermission === 'function') {
              st = await w.requestPermission({ mode: 'readwrite' });
            }
            if (st !== 'granted') {
              // 权限被撤销/拒绝：清掉，下次保存 json 时重新让用户选择目录
              setActiveProjectDraftDownloadDirectory(null);
              return;
            }
          }
        } catch {
          // ignore - 仍尝试保留句柄，下载时再 verify
        }
        setActiveProjectDraftDownloadDirectory(existing);
        return;
      }
      // 老项目: 只存了 fileHandle 没存 dirHandle, 从 fileHandle 推导
      try {
        const fh = await getProjectBackupFileHandle(pid);
        if (!fh) {
          setActiveProjectDraftDownloadDirectory(null);
          return;
        }
        const dir = await resolveDirectoryHandleFromFileHandle(fh);
        if (dir) {
          await persistProjectDraftDirectoryHandle(pid, dir);
          setActiveProjectDraftDownloadDirectory(dir);
        } else {
          setActiveProjectDraftDownloadDirectory(null);
        }
      } catch {
        setActiveProjectDraftDownloadDirectory(null);
      }
    })();
    const p = projectsRef.current.find((x) => x.id === pid);
    if (p?.diskSaveEstablished && p.draftDiskWriteFormat === 'zip') {
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
    if (cur?.diskSaveEstablished && cur.draftDiskWriteFormat === 'zip') {
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
    const isFirstSave = modal.mode === 'firstSave';
    const draftTitleForDisk = stem !== (snap.name || '').trim() ? stem : undefined;

    const payload = { ...snap };
    delete (payload as { diskSaveEstablished?: boolean }).diskSaveEstablished;
    delete (payload as { draftDiskWriteFormat?: 'json' | 'zip' }).draftDiskWriteFormat;
    // 把被 offload 到 IDB 资产库的大图反向读回 base64，否则 JSON 文件里 images 数组全是空字符串。
    // 覆盖：首次保存弹窗 / Ctrl+Alt+S 另存为 这两条路径之前只接了 projectSnapshotForJsonExport
    // 不够，因为大图 offload 后内存 nodes[i].images[j] 也是空。
    const hydratedNodes = await hydrateNodesMediaFromAssets(payload.nodes || []);
    const payloadForDisk = { ...payload, draftTitle: draftTitleForDisk, nodes: hydratedNodes };
    const filename = isFirstSave ? projectZipFilename(payloadForDisk) : `${stem}.json`;
    const diskBlob = isFirstSave
      ? await buildProjectZipBlob(payloadForDisk)
      : new Blob([JSON.stringify(payloadForDisk, null, 2)], { type: 'application/json' });

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
          types: isFirstSave
            ? [{ description: '画布备份 ZIP', accept: { 'application/zip': ['.wxcanvas.zip', '.zip'] } }]
            : [{ description: 'JSON 文件', accept: { 'application/json': ['.json'] } }],
        });
      } else {
        alert('当前浏览器不支持选择保存文件夹，请使用 Chrome / Edge（HTTPS 或 localhost）。');
        return;
      }

      const writable = await fileHandle.createWritable();
      await writable.write(diskBlob);
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
      if (isFirstSave) await persistProjectZipBackupFileHandle(pid, fileHandle);
      else await persistProjectBackupFileHandle(pid, fileHandle);
      if (dirHandle) await persistProjectDraftDirectoryHandle(pid, dirHandle);
    } catch (e) {
      console.warn(e);
    }

    if (isFirstSave) {
      lastZipFileHandleRef.current = fileHandle;
      lastJsonFileHandleRef.current = null;
      lastDiskWriteFormatRef.current = 'zip';
      setLastJsonFilename('');
    } else {
      lastJsonFileHandleRef.current = fileHandle;
      lastDiskWriteFormatRef.current = 'json';
      setLastJsonFilename(fileHandle.name);
    }

    const folderLabel = dirHandle?.name?.trim() || '';
    const pathNote = folderLabel ? `${folderLabel} · ${fileHandle.name}` : fileHandle.name;

    const resolve = draftDiskFlowResolveRef.current;
    draftDiskFlowResolveRef.current = null;
    setDraftDiskModal(null);

    const updatedList = modal.mergedProjects.map((p) =>
      p.id === pid
        ? {
            ...p,
            diskSaveEstablished: true as const,
            draftDiskWriteFormat: 'zip' as const,
            draftStoragePathNote: pathNote,
            draftTitle: draftTitleForDisk,
            draftAutosaveIntervalMin: 5 as const,
            updatedAt: Date.now(),
          }
        : p
    );

    setProjects(updatedList);
    projectsRef.current = updatedList;
    const ok = await trackProjectSave(saveProjectLibrary(updatedList, pid));
    if (!ok) alert('本地 ZIP 已写入，但同步 IndexedDB 草稿库失败，请重试。');
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
    void (async () => {
      await restoreProjectAssetsFromBoundZip(target);
      const { project: normalizedTarget, stripped } = normalizeProjectStripLegacyAutoT2i(target);
      const hydratedNodes = await hydrateNodesMediaFromAssets(normalizedTarget.nodes || []);
      const readyTarget = { ...normalizedTarget, nodes: hydratedNodes };
      if (stripped) {
        const next = projectsRef.current.map((p) => (p.id === projectId ? readyTarget : p));
        setProjects(next);
        projectsRef.current = next;
        void trackProjectSave(saveProjectLibrary(next, projectId)).then((ok) => {
          if (!ok) console.warn('[canvas] 切换项目时已剥离旧版默认文生图占位，但写回草稿库失败');
        });
      }
      setActiveProjectId(projectId);
      setNodes(readyTarget.nodes || []);
      setEdges(readyTarget.edges || []);
      pendingDefaultViewportRef.current = true;
      if (readyTarget.auditModeData?.images) {
        setAuditImages(readyTarget.auditModeData.images);
        auditImagesRef.current = readyTarget.auditModeData.images;
      } else {
        setAuditImages([]);
        auditImagesRef.current = [];
      }
      void restoreBoundBackupHandle(readyTarget);
    })();
  }, [saveCurrentProject, restoreBoundBackupHandle, restoreProjectAssetsFromBoundZip]);

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
      void restoreBoundBackupHandle(fbNorm);
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
  }, [restoreBoundBackupHandle]);

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

  const handleExportProjectJson = useCallback(
    async (project: CanvasProject) => {
      const filename = `${projectExportBasename(project)}.json`;
      // 关键：state 中的 project 在 mergeCurrentCanvasIntoProjectList 阶段被 strip
      // 掉了图片（IDB 容量控制），直接导出 { ...project } 会丢图。
      // 走 projectSnapshotForJsonExport，它从 nodesRef.current（内存中带 base64）拿数据。
      // - 目标 == 当前活跃项目：取内存最新（带图）
      // - 目标 != 当前活跃项目：直接返回原 project（无法取到内存带图版本）
      // 第二步：hydrate —— 把被 offload 到 IDB 资产库的大图（images[i]='' + imageAssetIds[i] 有值）
      // 反向从 IDB 读回 base64 填到对应字段。这是确保 JSON 文件**真的**包含图片的关键。
      // 之前 fa85a22 / 29d673d 不够，因为大图被自动 offload 后 images 数组里就是空字符串。
      const snapshot = projectSnapshotForJsonExport(project);
      const hydratedNodes = await hydrateNodesMediaFromAssets(snapshot.nodes || []);
      const payload = { ...snapshot, nodes: hydratedNodes };
      delete (payload as { diskSaveEstablished?: boolean }).diskSaveEstablished;
      delete (payload as { draftDiskWriteFormat?: 'json' | 'zip' }).draftDiskWriteFormat;
      const r = await saveJsonToDisk(filename, payload, { backupProjectId: project.id });
      if (r !== 'saved') return;
      const pid = project.id;
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === pid
            ? { ...p, diskSaveEstablished: true as const, draftDiskWriteFormat: 'json' as const }
            : p
        );
        projectsRef.current = next;
        void trackProjectSave(saveProjectLibrary(next, activeProjectIdRef.current));
        return next;
      });
    },
    [saveJsonToDisk]
    // projectSnapshotForJsonExport 故意不放 deps：它本身是无依赖的 useCallback，永远不变；
    // 放进去会在 Vite dev HMR 下触发 TDZ（const 不 hoist，且它在本 useCallback 之后才声明）。
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
        // 与 JSON 导出走同一份 hydrate：把 offload 到 IDB 的大图反向读回 base64。
        // ZIP 内 assets/ 也会再存一份作为冗余，这里 hydrate 是为了 project.json 自包含
        // （用户偶尔只拷贝 project.json 出来时也能恢复）。
        const snapshot = projectSnapshotForJsonExport(project);
        const hydratedNodes = await hydrateNodesMediaFromAssets(snapshot.nodes || []);
        const payload = { ...snapshot, nodes: hydratedNodes };
        const r = await exportProjectZipToDisk(payload);
        if (r.kind === 'aborted') return;
        if (r.kind === 'handle') {
          lastZipFileHandleRef.current = r.handle;
          lastDiskWriteFormatRef.current = 'zip';
          void persistProjectZipBackupFileHandle(project.id, r.handle).catch((e) =>
            console.warn('持久化项目 ZIP 句柄失败', e)
          );
        } else {
          lastZipFileHandleRef.current = null;
        }
        const pid = project.id;
        setProjects((prev) => {
          const next = prev.map((p) =>
            p.id === pid && r.kind === 'handle'
              ? { ...p, diskSaveEstablished: true as const, draftDiskWriteFormat: 'zip' as const }
              : p.id === pid
              ? { ...p, diskSaveEstablished: true as const }
              : p
          );
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
          .then(async (parsed) => {
            // ZIP 路径：hydrateProjectAssetsFromZip 已把 ZIP 内的资产写回 IDB，
            // 这里再 hydrate 一次把 nodes 里被 offload 的图反向读回 base64，
            // 解决「旧 ZIP 导入后画布图丢」的问题（与 8d82dad 导出 hydrate 对称）。
            const hydratedNodes = await hydrateNodesMediaFromAssets(parsed.nodes || []);
            const newProject: CanvasProject = {
              ...parsed,
              nodes: hydratedNodes,
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
    reader.onload = async (event) => {
      try {
        const raw = event.target?.result as string;
        const imported = JSON.parse(raw) as Partial<CanvasProject>;
        if (!imported || !Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) {
          alert('导入失败：JSON 格式不正确。');
          return;
        }
          const impNodes = imported.nodes as CanvasNode[];
          const impEdges = imported.edges as Edge[];
          // JSON 路径：hydrate 尝试从 IDB 反向回填；
          // 8d82dad 之后导出的 JSON 自身已含 base64，hydrate 是 no-op；
          // 8d82dad 之前的旧 JSON（含 imageAssetIds 但 images 为空）+ 本机 IDB 资产仍在 → 救回来
          const hydratedNodes = await hydrateNodesMediaFromAssets(impNodes);
        const newProject: CanvasProject = {
          id: `project-${Date.now()}`,
          name: (imported.name || file.name.replace(/\.json$/i, '') || '导入项目').toString(),
          updatedAt: Date.now(),
            nodes: hydratedNodes,
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
        void requestPersistentCanvasStorage();
        const lib = await loadProjectLibrary();
        if (cancelled) return;
        if (lib && lib.projects.length > 0) {
          const { next: patchedProjects, changed: libStrippedLegacy } =
            normalizeLibraryProjectsStripLegacyAutoT2i(lib.projects);
          const activeId = lib.activeProjectId || patchedProjects[0].id;
          const activeForAssetRestore =
            patchedProjects.find((p) => p.id === activeId) || patchedProjects[0];
          await restoreProjectAssetsFromBoundZip(activeForAssetRestore);
          if (cancelled) return;
          // 草稿库恢复：把被 offload 到 IDB 资产库的图反向读回 base64 写进内存 nodes
          // 解决「8d82dad 之前保存的旧草稿 / 早期 JSON 在 IDB 资产被回收后刷新丢图」的问题
          // （对称于导出路径的 hydrate；hydrate 失败/IDB 找不到的项静默保留空串）
          const hydratedProjects = await Promise.all(
            patchedProjects.map(async (p) => ({
              ...p,
              nodes: await hydrateNodesMediaFromAssets(p.nodes || []),
            }))
          );
          if (cancelled) return;
          const activeIdx = hydratedProjects.findIndex((p) => p.id === activeId);
          const initial =
            (activeIdx >= 0 ? hydratedProjects[activeIdx] : hydratedProjects[0]);
          setProjects(hydratedProjects);
          projectsRef.current = hydratedProjects;
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
            void trackProjectSave(saveProjectLibrary(hydratedProjects, initial.id)).then((ok) => {
              if (!ok) console.warn('[canvas] 已剥离旧版默认文生图占位，但写回草稿库失败');
            });
          }
          setProjectStoreReady(true);
          void restoreBoundBackupHandle(initial);
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
      void restoreBoundBackupHandle(defaultProject);
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

