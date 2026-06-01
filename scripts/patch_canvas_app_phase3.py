from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
path = root / "CanvasApp.tsx"
lines = path.read_text(encoding="utf-8").splitlines()

def find(sub: str, start=0) -> int:
    for i in range(start, len(lines)):
        if sub in lines[i]:
            return i
    raise SystemExit(f"not found: {sub!r}")

# Remove merge utils 683-751
s = find("function normalizeLegacyAutoEmptyT2iCanvas")
e = find("type DraftDiskModalState")
del lines[s:e]

# Remove FsImageInfoPanel block
s = find("interface FsImageInfoPanelProps")
e = find("/** 打开项目时默认画布缩放比例")
del lines[s:e]

# Remove fullscreen state + handlers (will use hook)
s = find("  // Fullscreen Image Modal")
e = find("  // Image Import Target")
del lines[s:e]

# Remove keyboard shortcuts block
s = find("  // --- Keyboard Shortcuts ---")
e = find("  // --- Fullscreen Modal Handlers ---")
del lines[s:e]

# Remove fullscreen modal handlers block
s = find("  // --- Fullscreen Modal Handlers ---")
e = find("  // --- Canvas Interaction Handlers ---")
del lines[s:e]

text = "\n".join(lines)

# Imports
if "canvasProjectMergeUtils" not in text:
    text = text.replace(
        "import { INITIAL_PROMPT_PRESETS_BASE } from './canvas/initialPromptPresets';",
        "import { INITIAL_PROMPT_PRESETS_BASE } from './canvas/initialPromptPresets';\nimport {\n  mergeCurrentCanvasIntoProjectList,\n  normalizeLibraryProjectsStripLegacyAutoT2i,\n  normalizeProjectStripLegacyAutoT2i,\n  cloneCanvasForProject,\n} from './canvas/canvasProjectMergeUtils';\nimport { fullscreenImageDisplaySrc } from './canvas/fullscreenImageUtils';\nimport { useCanvasFullscreenImage } from './canvas/useCanvasFullscreenImage';\nimport { CanvasFullscreenImageModal } from './canvas/CanvasFullscreenImageModal';\nimport { useCanvasKeyboardShortcuts } from './canvas/useCanvasKeyboardShortcuts';",
        1,
    )

# Lazy fullscreen modal optional - keep static import for now (modal is small with info panel)

# Insert hook after nodesRef is available - find nodesRef = useRef
insert_marker = "  const nodesRef = useRef(useCanvasStore.getState().nodes);"
idx = text.find(insert_marker)
if idx == -1:
    raise SystemExit("nodesRef not found")
# find end of nodesRef line
line_end = text.find("\n", idx) + 1

hook_block = """
  const fullscreen = useCanvasFullscreenImage(nodesRef);
  const {
    fullscreenImage,
    setFullscreenImage,
    fullscreenNodeId,
    fullscreenImageIdx,
    fsTransform,
    fsContextMenu,
    setFsContextMenu,
    openFullscreenImage,
    openFullscreenFromBase64,
    fsNavigate,
    closeFullscreen,
    handleFsWheel,
    handleFsPointerDown,
    imageTotal,
  } = fullscreen;

"""
text = text[:line_end] + hook_block + text[line_end:]

# Insert keyboard hook before render helpers - after fitViewportToSelectedNodes callback
kb_marker = "  // --- Render Helpers ---"
kb_insert = """
  useCanvasKeyboardShortcuts({
    canvasMode,
    fullscreenImage,
    showShortcutsPanel,
    clipboard,
    setActiveTool,
    setFullscreenImage,
    setEyedropperTargetNodeId,
    setShowShortcutsPanel,
    setDraggingNodeId,
    setResizingNodeId,
    setIsResizing,
    setIsSelecting,
    setSelectionBox,
    setSelectedIds,
    setContextMenu,
    setNodes,
    setClipboard,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    canvasMouseRef,
    addNodeAtCanvasPositionRef,
    draggingNodeIdRef,
    resizingNodeIdRef,
    nodeDragAccumRef,
    nodeResizePreviewRef,
    nodeResizeSessionRef,
    isSelectingRef,
    selectionBoxRef,
    boxSelectRafRef,
    pressStartPosRef,
    activePointerTypeRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    draftEdgePathRef,
    draftEdgeRef,
    dragPreviewRef,
    resizePreviewRef,
    rafIdRef,
    lastPasteTimeRef,
    sharedClipboardImageRef,
    DEFAULT_NODE_SIZES,
    handleResetNodeSize,
    handleDeleteNode,
    appendNodesWithUndo,
    createImageNodesFromBase64List,
    undoCanvasState,
    saveCurrentProject,
    handleSaveDraftJsonSaveAs,
    fitViewportToSelectedNodes,
  });

"""
text = text.replace(kb_marker, kb_insert + kb_marker, 1)

# Replace fullscreen JSX
fs_start = text.find("      {/* Fullscreen Image Modal */}")
fs_end = text.find("      {/* 快捷节点面板（左侧） */}", fs_start)
if fs_start == -1 or fs_end == -1:
    raise SystemExit("fullscreen jsx markers not found")

fs_replacement = """      {fullscreenImage && canvasMode !== 'audit' ? (
        <CanvasFullscreenImageModal
          imageSrc={fullscreenImage}
          fsTransform={fsTransform}
          fsContextMenu={fsContextMenu}
          setFsContextMenu={setFsContextMenu}
          activePointerTypeRef={activePointerTypeRef}
          fullscreenNodeId={fullscreenNodeId}
          fullscreenImageIdx={fullscreenImageIdx}
          imageTotal={imageTotal}
          onClose={closeFullscreen}
          onWheel={handleFsWheel}
          onImagePointerDown={(e) => handleFsPointerDown(e, activePointerTypeRef, lastFsMousePosRef)}
          onNavigate={fsNavigate}
          onDownload={() => { void downloadImage(fullscreenImage); }}
          onEditAsAnnotation={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            const cx = rect
              ? (window.innerWidth / 2 - rect.left - transformRef.current.x) / transformRef.current.scale
              : 0;
            const cy = rect
              ? (window.innerHeight / 2 - rect.top - transformRef.current.y) / transformRef.current.scale
              : 0;
            const newId = `annotation-${Date.now()}`;
            const newNode: CanvasNode = {
              id: newId,
              type: 'annotation',
              x: cx - 480,
              y: cy - 500,
              width: 960,
              height: 1000,
              sourceImage: fullscreenImage,
              annotations: [],
              isEditing: false,
              selectedAnnotationId: undefined,
            };
            appendNodesWithUndo([newNode], { selectIds: [newId] });
            closeFullscreen();
          }}
        />
      ) : null}

"""
text = text[:fs_start] + fs_replacement + text[fs_end:]

path.write_text(text + "\n", encoding="utf-8")
print("patched CanvasApp", len(text.splitlines()), "lines")
