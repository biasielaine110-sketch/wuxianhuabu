from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
path = root / "CanvasApp.tsx"
lines = path.read_text(encoding="utf-8").splitlines()

def find_line(sub: str, start=0) -> int:
    for i in range(start, len(lines)):
        if sub in lines[i]:
            return i
    raise SystemExit(f"not found: {sub!r}")

# Remove icon block: MousePointerIcon through StopIcon (before nextMsgId)
s = find_line("const MousePointerIcon")
e = find_line("function nextMsgId")
del lines[s:e]

# Remove project draft utils
s = find_line("function projectDraftDisplayName")
e = find_line("type DraftDiskModalState")
del lines[s:e]

# Remove initial presets block
s = find_line("/** 首次加载时的图生图侧预设")
e = find_line("/** 用指针画布坐标算节点矩形")
del lines[s:e]

text = "\n".join(lines)

# Add imports after canvasIcons import
replacements = [
    (
        "import { EyedropperIcon, FullscreenIcon } from './canvas/canvasIcons';",
        """import {
  AnnotationIcon,
  AudioIcon,
  BoxSelectIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Director3DIcon,
  DownloadIcon,
  EyedropperIcon,
  FullscreenIcon,
  GridIcon,
  GridMergeIcon,
  HandIcon,
  ImageIcon,
  KeyIcon,
  MessageIcon,
  MousePointerIcon,
  PanoramaIcon,
  SettingsIcon,
  TextIcon,
  VideoIcon,
  WandIcon,
  WidePanoramaIcon,
  XIcon,
} from './canvas/canvasIcons';""",
    ),
    (
        "const CanvasSettingsModalLazy = lazy(() =>",
        """const CanvasProjectModalLazy = lazy(() =>
  import('./canvas/CanvasProjectModal').then((m) => ({ default: m.CanvasProjectModal }))
);
const CanvasSettingsModalLazy = lazy(() =>""",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"missing: {old[:40]}")
    text = text.replace(old, new, 1)

# Add other imports
if "INITIAL_PROMPT_PRESETS_BASE" not in text.split("import")[1:]:
    text = text.replace(
        "import { useCanvasSettingsPanelState } from './canvas/useCanvasSettingsPanelState';",
        "import { useCanvasSettingsPanelState } from './canvas/useCanvasSettingsPanelState';\nimport { INITIAL_PROMPT_PRESETS_BASE } from './canvas/initialPromptPresets';\nimport {\n  projectDraftDisplayName,\n  projectDraftEditSeed,\n  projectExportBasename,\n  sanitizeDraftStoragePathNote,\n  type CanvasProject,\n} from './canvas/projectDraftUtils';",
        1,
    )

# Remove duplicate type CanvasProject = ...
text = text.replace("type CanvasProject = CanvasProjectSnapshot;\n\n", "")

# Replace project modal JSX
start = text.find("      {/* Projects Modal */}")
end = text.find("      {draftDiskModal ? (", start)
if start == -1 or end == -1:
    raise SystemExit("project modal markers not found")

project_modal_usage = """      {showProjectModal ? (
        <Suspense fallback={null}>
          <CanvasProjectModalLazy
            open
            onClose={() => setShowProjectModal(false)}
            projects={projects}
            activeProjectId={activeProjectId}
            draftNameInput={draftNameInput}
            setDraftNameInput={setDraftNameInput}
            draftStoragePathInput={draftStoragePathInput}
            setDraftStoragePathInput={setDraftStoragePathInput}
            autosaveIntervalMin={autosaveIntervalMin}
            projectExportMenuOpen={projectExportMenuOpen}
            setProjectExportMenuOpen={setProjectExportMenuOpen}
            projectImportInputRef={projectImportInputRef}
            onApplyDraftTitle={handleApplyDraftTitle}
            onApplyDraftStoragePath={handleApplyDraftStoragePath}
            onAutosaveIntervalChange={handleAutosaveIntervalChange}
            onCreateNewProject={createNewProject}
            onSaveCurrentProject={saveCurrentProject}
            onImportProjectFile={handleImportProjectFile}
            onExportProjectJson={handleExportProjectJson}
            onExportProjectZip={handleExportProjectZip}
            projectSnapshotForJsonExport={projectSnapshotForJsonExport}
            onSwitchProject={switchProject}
            onOpenProjectLocationInfo={openProjectLocationInfo}
            onRenameProject={(projectId, trimmedName) => {
              setProjects((prev) => {
                const next = prev.map((p) =>
                  p.id === projectId ? { ...p, name: trimmedName, updatedAt: Date.now() } : p
                );
                projectsRef.current = next;
                void saveProjectLibrary(next, activeProjectIdRef.current).then((ok) => {
                  if (!ok) alert('名称已更新，但写入草稿库失败，请重试。');
                });
                return next;
              });
            }}
            onDeleteProject={(projectId) => deleteProject(projectId)}
          />
        </Suspense>
      ) : null}

"""

text = text[:start] + project_modal_usage + text[end:]

# Fix duplicate comment in initialPromptPresets if needed - not in CanvasApp

path.write_text(text + "\n", encoding="utf-8")
print("patched", len(text.splitlines()), "lines")

# Fix initialPromptPresets duplicate header
preset_path = root / "canvas" / "initialPromptPresets.ts"
preset_text = preset_path.read_text(encoding="utf-8")
preset_text = preset_text.replace(
    "/** 画布内置预设（图生图 / 文生图）；AI 对话模板通过 loadChatPromptPresets 异步合并 */\n/** 首次加载时的图生图侧预设（AI 对话模板通过 loadChatPromptPresets 异步合并） */",
    "/** 画布内置预设（图生图 / 文生图）；AI 对话模板通过 loadChatPromptPresets 异步合并 */",
)
preset_path.write_text(preset_text, encoding="utf-8")
