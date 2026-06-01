"""Extract project library hook from CanvasApp and patch CanvasApp."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
app_path = root / "CanvasApp.tsx"
lines = app_path.read_text(encoding="utf-8").splitlines()


def find(sub: str, start=0) -> int:
    for i in range(start, len(lines)):
        if sub in lines[i]:
            return i
    raise SystemExit(f"not found: {sub!r}")


# Extract saveJsonToDisk + project management block
s_save = find("  /** 保存 JSON 到本机")
e_init = find("  // eslint-disable-next-line react-hooks/exhaustive-deps", find("  // 初始化项目数据"))
e_init_end = e_init + 3  # include }, []); and blank

body_lines = lines[s_save:e_init_end]

hook_header = '''import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
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
        void saveProjectLibrary(next, pid);
        return next;
      });
    }
  }, [showProjectModal, activeProjectId]);

'''

hook_footer = '''
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
  };
}
'''

hook_path = root / "canvas" / "useCanvasProjectLibrary.ts"
hook_path.write_text(hook_header + "\n".join(body_lines) + "\n" + hook_footer + "\n", encoding="utf-8")
print("wrote", hook_path.name, len(body_lines), "body lines")

# Patch CanvasApp: remove project state block
s_state = find("  const [projects, setProjects] = useState<CanvasProject[]>([]);")
e_state = find("  const [draftDiskModal, setDraftDiskModal] = useState<DraftDiskModalState>(null);") + 1
del lines[s_state:e_state]

# Remove draftDiskModal sync and showProjectModal effect and centerTitleEdit effect on activeProjectId
for marker in [
    "  useEffect(() => { draftDiskModalRef.current = draftDiskModal; }, [draftDiskModal]);",
]:
    try:
        i = find(marker)
        del lines[i : i + 1]
    except SystemExit:
        pass

# Remove centerTitleEdit effect - find again
try:
    i = find("  useEffect(() => { setCenterTitleEditValue(null); }, [activeProjectId]);")
    del lines[i : i + 1]
except SystemExit:
    pass

try:
    i = find("  useEffect(() => {")
    # showProjectModal effect - more specific
    for j, line in enumerate(lines):
        if "if (!showProjectModal) return;" in line:
            # delete from useEffect before to closing }, [showProjectModal
            k = j - 1
            while k > 0 and "useEffect" not in lines[k]:
                k -= 1
            m = j
            while m < len(lines) and "}, [showProjectModal, activeProjectId]);" not in lines[m]:
                m += 1
            del lines[k : m + 1]
            break
except Exception:
    pass

# Remove activeProjectIdRef/projectsRef sync if duplicated - keep the ones before hook
# Remove saveJsonToDisk through init effect
s_save2 = find("  /** 保存 JSON 到本机")
e_init2 = find("  // 画布编辑不自动写盘")
del lines[s_save2:e_init2]

# Remove DraftDiskModalState type
s_type = find("type DraftDiskModalState =")
e_type = find("/** 用指针画布坐标算节点矩形", s_type)
del lines[s_type:e_type]

text = "\n".join(lines)

# Add imports
replacements = [
    (
        "import { useCanvasKeyboardShortcuts } from './canvas/useCanvasKeyboardShortcuts';",
        "import { useLazyCanvasKeyboardShortcuts } from './canvas/useLazyCanvasKeyboardShortcuts';\nimport { useCanvasProjectLibrary } from './canvas/useCanvasProjectLibrary';\nimport { CanvasDraftDiskModal } from './canvas/CanvasDraftDiskModal';",
    ),
    (
        "  useCanvasKeyboardShortcuts({",
        "  useLazyCanvasKeyboardShortcuts({",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing patch target: {old[:50]}")
    text = text.replace(old, new, 1)

# Insert hook after fullscreen block (after edgesRef line)
marker = "  const edgesRef = useRef(useCanvasStore.getState().edges);"
if "useCanvasProjectLibrary({" not in text:
    insert = """
  const projectLibrary = useCanvasProjectLibrary({
    setNodes,
    setEdges,
    setTransform,
    setAuditImages,
    nodesRef,
    edgesRef,
    transformRef,
    auditImagesRef,
  });
  const {
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
  } = projectLibrary;

"""
    text = text.replace(marker, marker + insert, 1)

# Remove duplicate activeProjectIdRef/projectsRef if still there
text = text.replace(
    """  /** 与画布/项目 state 同步，供保存与列表操作读取「最新」快照，避免闭包滞后 */
  const activeProjectIdRef = useRef(activeProjectId);
  const projectsRef = useRef(projects);
  const transformRef = useRef(useCanvasStore.getState().transform);
  const nodesRef = useRef(useCanvasStore.getState().nodes);

""",
    """  const transformRef = useRef(useCanvasStore.getState().transform);
  const nodesRef = useRef(useCanvasStore.getState().nodes);

""",
)

text = text.replace(
    """  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
""",
    "",
)

# Replace draft disk modal JSX
fs_start = text.find("      {draftDiskModal ? (")
if fs_start != -1:
    fs_end = text.find("      ) : null}\n\n      {showSettingsModal", fs_start)
    if fs_end == -1:
        fs_end = text.find("      ) : null}\n\n      {showSettingsModal ?", fs_start)
    replacement = """      {draftDiskModal ? (
        <CanvasDraftDiskModal
          modal={draftDiskModal}
          setDraftDiskModal={setDraftDiskModal}
          onCancel={cancelDraftDiskModal}
          onConfirm={confirmDraftDiskModal}
        />
      ) : null}

"""
    if fs_end != -1:
        fs_end = text.find("      ) : null}", fs_start) + len("      ) : null}\n\n")
        text = text[:fs_start] + replacement + text[fs_end:]

app_path.write_text(text + "\n", encoding="utf-8")
print("patched CanvasApp", len(text.splitlines()), "lines")
