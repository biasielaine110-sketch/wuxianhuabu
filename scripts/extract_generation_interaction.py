"""Extract useCanvasGeneration and useCanvasInteractionHandlers from CanvasApp."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
app_path = root / "CanvasApp.tsx"
lines = app_path.read_text(encoding="utf-8").splitlines()


def find(sub: str, start=0) -> int:
    for i in range(start, len(lines)):
        if sub in lines[i]:
            return i
    raise SystemExit(f"not found: {sub!r}")


# --- useCanvasGeneration ---
s_gen = find("  const handleGenerate = async (nodeId: string) => {")
e_opt = find("  // 处理连线数据传递 - 当有连线连接到 panorama", s_gen)
gen_body = lines[s_gen:e_opt]

s_poll = find("  /** 轮询即梦任务直到完成 */")
e_vid = find("  useLazyCanvasKeyboardShortcuts({")
poll_and_video = lines[s_poll:e_vid]

gen_header = '''import { useRef, useCallback, type RefObject, type MutableRefObject } from 'react';
import type { CanvasNode, ChatMessage, ChatNode, Edge } from '../types';
import { defaultCanvasImageModel } from './canvasModelUtils';
import { upscaleImage } from './canvasImageUpscale';
import { nextChatMessageId as nextMsgId } from './chatMessageIds';
import {
  isJimengImageModel,
  isJimengVideoModel,
  isVeo31FastVideoModel,
  videoNodeModelToToApis,
} from './videoModelUtils';
import { DEFAULT_DEEPSEEK_CHAT_MODEL_ID, normalizeDeepSeekChatModelId } from '../services/aiSettings';
import {
  callGeminiChatWithHistory,
  editExistingImage,
  generateCanvasVideoViaToApis,
  generateNewImage,
} from '../services/geminiService';
import {
  buildIncomingRefSlots,
  parseRefPickIndices,
  parseMsgPickIndices,
  stripRefMarkers,
  resolveSlotImagesForIndices,
  resolveSlotAudios,
} from '../referenceSlots';
import { useCanvasStore } from '../stores/canvasStore';

export type UseCanvasGenerationOptions = {
  setNodes: (updater: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  promptPresets: Record<string, string>;
  ensureJimengReady: () => Promise<void>;
  openLoginRef: MutableRefObject<(() => void) | undefined>;
  handleUpdateNode: (id: string, updates: Partial<CanvasNode>) => void;
  appendNodesWithUndo: (
    newNodes: CanvasNode[],
    opts?: { edges?: Edge[]; selectIds?: string[] }
  ) => void;
  setEditingTextNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export function useCanvasGeneration({
  setNodes,
  nodesRef,
  edgesRef,
  promptPresets,
  ensureJimengReady,
  openLoginRef,
  handleUpdateNode,
  appendNodesWithUndo,
  setEditingTextNodeIds,
}: UseCanvasGenerationOptions) {
  const generationAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationStartedAtRef = useRef<Map<string, number>>(new Map());

  const handleCancelGeneration = useCallback((nodeId: string) => {
    generationAbortControllersRef.current.get(nodeId)?.abort();
    generationAbortControllersRef.current.delete(nodeId);
    generationStartedAtRef.current.delete(nodeId);
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
    );
  }, [setNodes]);

'''

gen_footer = '''
  return {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
    generationAbortControllersRef,
    generationStartedAtRef,
  };
}
'''

gen_path = root / "canvas" / "useCanvasGeneration.ts"
gen_path.write_text(gen_header + "\n".join(gen_body + poll_and_video) + "\n" + gen_footer + "\n", encoding="utf-8")
print("wrote", gen_path.name, len(gen_body) + len(poll_and_video), "lines")

# --- useCanvasInteractionHandlers ---
s_wheel = find("  // --- Canvas Interaction Handlers ---")
e_drop = find("  // --- Node Actions ---")
interaction_body = lines[s_wheel + 1 : e_drop]

interaction_header = '''import { useCallback, useRef, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { CanvasNode, Edge, NodeType, Transform } from '../types';
import { useCanvasStore } from '../stores/canvasStore';
import { defaultCanvasImageModel } from './canvasModelUtils';
import { CHAT_NODE_DEFAULT_PIXEL_HEIGHT, CHAT_PANEL_FONT_SCALE } from './chatNodeUtils';
import { DEFAULT_DEEPSEEK_CHAT_MODEL_ID } from '../services/aiSettings';
import { sanitizeFilename } from '../services/projectPersistence';
import {
  buildSpacedImageNodesFromLists,
  collectImageFilesFromDataTransfer,
  readFilesAsBase64,
  SPAWNED_IMAGE_NODE_HEIGHT,
  SPAWNED_IMAGE_NODE_WIDTH,
} from './spawnImageNodes';
import { clearNodeGeometryPreview } from './canvasNodeDragDom';
import { clearEdgeGeometryPreviews } from './canvasEdgeDragDom';
import { revokeNodeCanvasAssets } from '../services/canvasAssetCleanup';

export type CanvasContextMenu = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
} | null;

export type UseCanvasInteractionHandlersOptions = {
  containerRef: RefObject<HTMLDivElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  transformRef: RefObject<Transform>;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  selectedIdsRef: RefObject<string[]>;
  fullscreenImage: string | null;
  canvasMode: string;
  activeTool: string;
  contextMenu: CanvasContextMenu;
  pendingEdgeSourceId: string | null;
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenu>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
  setSelectionBox: Dispatch<SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  setDraggingNodeId: Dispatch<SetStateAction<string | null>>;
  setResizingNodeId: Dispatch<SetStateAction<string | null>>;
  setResizeDirection: Dispatch<SetStateAction<string>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setPendingEdgeSourceId: Dispatch<SetStateAction<string | null>>;
  setImportTargetNodeId: (id: string | null) => void;
  applyLiveCanvasTransform: (tf: Transform) => void;
  commitTransformFromRef: () => void;
  handleCanvasEyedropper: (sourceNodeId: string, targetNodeId: string) => boolean;
  appendNodesWithUndo: (
    newNodes: CanvasNode[],
    opts?: { edges?: Edge[]; selectIds?: string[] }
  ) => void;
  pushCanvasCommandRef: RefObject<(cmd: unknown) => void>;
  revokeNodeBlobUrls: (nodeId: string) => void;
  DEFAULT_NODE_SIZES: Record<string, { width: number; height: number }>;
  activePointerTypeRef: RefObject<string | null>;
  lastMousePosRef: RefObject<{ x: number; y: number }>;
  pressStartPosRef: RefObject<{ x: number; y: number } | null>;
  selectionModifiersRef: RefObject<{ ctrl: boolean; alt: boolean }>;
  longPressTimerRef: RefObject<number | null>;
  isSelectingRef: RefObject<boolean>;
  selectionBoxRef: RefObject<{ x: number; y: number; width: number; height: number } | null>;
  selectionBoxDomRef: RefObject<HTMLDivElement | null>;
  boxSelectRafRef: RefObject<number | null>;
  wheelTransformCommitTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  eyedropperTargetNodeIdRef: RefObject<string | null>;
  draggingNodeIdRef: RefObject<string | null>;
  rafIdRef: RefObject<number | null>;
  nodeDragAccumRef: RefObject<{ nodeIds: string[]; deltaX: number; deltaY: number } | null>;
  altDupPendingRef: RefObject<boolean>;
  altDupDoneRef: RefObject<boolean>;
  altDupClickNodeIdRef: RefObject<string | null>;
  altDragScreenAccumRef: RefObject<{ x: number; y: number }>;
  nodeDragHistoryStartRef: RefObject<Map<string, { x: number; y: number }> | null>;
  nodeResizePreviewRef: RefObject<{ nodeId: string; x: number; y: number; width: number; height: number } | null>;
  nodeResizeSessionRef: RefObject<unknown>;
  resizingNodeIdRef: RefObject<string | null>;
  resizeDirectionRef: RefObject<string>;
  canvasTransformLayerRef: RefObject<HTMLDivElement | null>;
  edgesSvgRef: RefObject<SVGSVGElement | null>;
  resizePreviewRef: RefObject<unknown>;
  draftEdgeRef: RefObject<{ sourceId: string; x: number; y: number } | null>;
  refreshDraftEdgePath: () => void;
  importPosRef: RefObject<{ x: number; y: number; pendingSourceId?: string }>;
  pendingEdgeSourceIdRef: RefObject<string | null>;
  lastCreatedNodePosRef: RefObject<{ x: number; y: number; stagger: number }>;
  addNodeAtCanvasPositionRef: RefObject<(type: NodeType, canvasX: number, canvasY: number) => void>;
};

export function useCanvasInteractionHandlers(opts: UseCanvasInteractionHandlersOptions) {
  const {
    containerRef,
    fileInputRef,
    transformRef,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    fullscreenImage,
    canvasMode,
    activeTool,
    contextMenu,
    pendingEdgeSourceId,
    setContextMenu,
    setSelectedIds,
    setIsSelecting,
    setSelectionBox,
    setDraggingNodeId,
    setResizingNodeId,
    setResizeDirection,
    setIsResizing,
    setNodes,
    setEdges,
    setPendingEdgeSourceId,
    setImportTargetNodeId,
    applyLiveCanvasTransform,
    commitTransformFromRef,
    handleCanvasEyedropper,
    appendNodesWithUndo,
    pushCanvasCommandRef,
    revokeNodeBlobUrls,
    DEFAULT_NODE_SIZES,
    activePointerTypeRef,
    lastMousePosRef,
    pressStartPosRef,
    selectionModifiersRef,
    longPressTimerRef,
    isSelectingRef,
    selectionBoxRef,
    selectionBoxDomRef,
    boxSelectRafRef,
    wheelTransformCommitTimerRef,
    eyedropperTargetNodeIdRef,
    draggingNodeIdRef,
    rafIdRef,
    nodeDragAccumRef,
    altDupPendingRef,
    altDupDoneRef,
    altDupClickNodeIdRef,
    altDragScreenAccumRef,
    nodeDragHistoryStartRef,
    nodeResizePreviewRef,
    nodeResizeSessionRef,
    resizingNodeIdRef,
    resizeDirectionRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    resizePreviewRef,
    draftEdgeRef,
    refreshDraftEdgePath,
    importPosRef,
    pendingEdgeSourceIdRef,
    lastCreatedNodePosRef,
    addNodeAtCanvasPositionRef,
  } = opts;

'''

interaction_footer = '''
  return {
    handleWheel,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleContextMenu,
    handleCanvasDoubleClick,
    handleNodePointerDown,
    handlePortPointerDown,
    handleDragOver,
    handleDrop,
    addNodeAtCanvasPosition,
    handleAddNode,
    handleImportImageClick,
    handleFileChange,
    handleDeleteNode,
    handleDeleteEdge,
  };
}
'''

interaction_path = root / "canvas" / "useCanvasInteractionHandlers.ts"
interaction_path.write_text(
    interaction_header + "\n".join(interaction_body) + "\n" + interaction_footer + "\n",
    encoding="utf-8",
)
print("wrote", interaction_path.name, len(interaction_body), "lines")

# --- Patch CanvasApp ---
text = app_path.read_text(encoding="utf-8")

# Remove extracted blocks (from bottom to top to preserve indices)
# poll + video
s_poll2 = text.find("  /** 轮询即梦任务直到完成 */")
e_vid2 = text.find("  useLazyCanvasKeyboardShortcuts({")
text = text[:s_poll2] + text[e_vid2:]

# generation block
s_gen2 = text.find("  const handleGenerate = async (nodeId: string) => {")
e_opt2 = text.find("  // 处理连线数据传递 - 当有连线连接到 panorama")
text = text[:s_gen2] + text[e_opt2:]

# interaction block + node actions through handleDeleteEdge
s_wheel2 = text.find("  // --- Canvas Interaction Handlers ---")
e_del_edge = text.find("  // 处理连线数据传递 - 当有连线连接到 panorama")
text = text[:s_wheel2] + text[e_del_edge:]

# Remove handleCancelGeneration and generation refs (keep handleUpdateNode)
text = text.replace(
    """  const generationAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationStartedAtRef = useRef<Map<string, number>>(new Map());

  const handleCancelGeneration = useCallback((nodeId: string) => {
    generationAbortControllersRef.current.get(nodeId)?.abort();
    generationAbortControllersRef.current.delete(nodeId);
    generationStartedAtRef.current.delete(nodeId);
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
    );
  }, []);

""",
    "",
)

# Remove upscaleImage block and videoNodeModelToToApis and nextMsgId
for marker_start, marker_end in [
    ("// --- Helper: Upscale Image ---", "/** Blob URL 注册表"),
    ("function nextMsgId(role:", "// --- Icons ---"),
    ("/** 视频节点模型 → ToAPIs 模型 */", "function base64ToImageDataUrl"),
]:
    s = text.find(marker_start)
    e = text.find(marker_end)
    if s != -1 and e != -1 and s < e:
        text = text[:s] + text[e:]

# Remove base64ToImageDataUrl if only used by upscale - check usage
if "base64ToImageDataUrl" not in text.replace("function base64ToImageDataUrl", ""):
    s = text.find("function base64ToImageDataUrl")
    if s != -1:
        e = text.find("\n\n", s)
        text = text[:s] + text[e + 2 :]

# Add lazy fullscreen import
text = text.replace(
    "import { CanvasFullscreenImageModal } from './canvas/CanvasFullscreenImageModal';",
    "const CanvasFullscreenImageModalLazy = lazy(() =>\n"
    "  import('./canvas/CanvasFullscreenImageModal').then((m) => ({ default: m.CanvasFullscreenImageModal }))\n"
    ");\n"
    "import { useCanvasGeneration } from './canvas/useCanvasGeneration';\n"
    "import { useCanvasInteractionHandlers } from './canvas/useCanvasInteractionHandlers';",
)

# Insert hooks after handleCanvasEyedropper block - find handleResetNodeSize
marker = "  const handleResetNodeSize = useCallback((nodeId: string) => {"
if "useCanvasGeneration({" not in text:
    # Find end of handleCanvasEyedropper - before handleResetNodeSize
    s_eye = text.find("  const handleCanvasEyedropper = useCallback")
    s_reset = text.find(marker)
    # Insert generation hook before handleResetNodeSize... actually better after appendNodesWithUndo is defined
    # Generation needs appendNodesWithUndo - find it
    s_append = text.find("  const appendNodesWithUndo = useCallback")
    if s_append == -1:
        raise SystemExit("appendNodesWithUndo not found")
    # Find end of appendNodesWithUndo callback - look for }, [ after it
    idx = text.find("  }, [", s_append)
    end_append = text.find("]);", idx) + 3
    # Actually find closing of appendNodesWithUndo - search for next const after it
    s_after = text.find("\n  const ", s_append + 10)
    
    insert_gen = """
  const {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
    generationAbortControllersRef,
    generationStartedAtRef,
  } = useCanvasGeneration({
    setNodes,
    nodesRef,
    edgesRef,
    promptPresets,
    ensureJimengReady,
    openLoginRef,
    handleUpdateNode,
    appendNodesWithUndo,
    setEditingTextNodeIds,
  });

"""
    # Insert after refreshDraftEdgePath definition
    s_refresh = text.find("  const refreshDraftEdgePath = useCallback")
    if s_refresh == -1:
        raise SystemExit("refreshDraftEdgePath not found")
    end_refresh = text.find("\n  }, [", s_refresh)
    end_refresh = text.find("]);", end_refresh) + 3
    if end_refresh == 2:
        end_refresh = text.find("\n  }, [", s_refresh)
        end_refresh = text.find(");", end_refresh) + 2
    
    # find closing brace of refreshDraftEdgePath
    pos = s_refresh
    depth = 0
    started = False
    for i in range(s_refresh, len(text)):
        if text[i:i+2] == "=>":
            started = True
        if started:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    end_refresh = i + 1
                    # include trailing );
                    while end_refresh < len(text) and text[end_refresh] in " \n":
                        end_refresh += 1
                    if text[end_refresh:end_refresh+2] == "};":
                        end_refresh += 2
                    elif text[end_refresh:end_refresh+3] == "});":
                        end_refresh += 3
                    break
    
    text = text[:end_refresh] + insert_gen + text[end_refresh:]

# Insert interaction hook - need to find where DEFAULT_NODE_SIZES and refs exist, after findConnectTargetNode
insert_interaction = """
  const interaction = useCanvasInteractionHandlers({
    containerRef,
    fileInputRef,
    transformRef,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    fullscreenImage,
    canvasMode,
    activeTool,
    contextMenu,
    pendingEdgeSourceId,
    setContextMenu,
    setSelectedIds,
    setIsSelecting,
    setSelectionBox,
    setDraggingNodeId,
    setResizingNodeId,
    setResizeDirection,
    setIsResizing,
    setNodes,
    setEdges,
    setPendingEdgeSourceId,
    setImportTargetNodeId,
    applyLiveCanvasTransform,
    commitTransformFromRef,
    handleCanvasEyedropper,
    appendNodesWithUndo,
    pushCanvasCommandRef,
    revokeNodeBlobUrls,
    DEFAULT_NODE_SIZES,
    activePointerTypeRef,
    lastMousePosRef,
    pressStartPosRef,
    selectionModifiersRef,
    longPressTimerRef,
    isSelectingRef,
    selectionBoxRef,
    selectionBoxDomRef,
    boxSelectRafRef,
    wheelTransformCommitTimerRef,
    eyedropperTargetNodeIdRef,
    draggingNodeIdRef,
    rafIdRef,
    nodeDragAccumRef,
    altDupPendingRef,
    altDupDoneRef,
    altDupClickNodeIdRef,
    altDragScreenAccumRef,
    nodeDragHistoryStartRef,
    nodeResizePreviewRef,
    nodeResizeSessionRef,
    resizingNodeIdRef,
    resizeDirectionRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    resizePreviewRef,
    draftEdgeRef,
    refreshDraftEdgePath,
    importPosRef,
    pendingEdgeSourceIdRef,
    lastCreatedNodePosRef,
    addNodeAtCanvasPositionRef,
  });
  const {
    handleWheel,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleContextMenu,
    handleCanvasDoubleClick,
    handleNodePointerDown,
    handlePortPointerDown,
    handleDragOver,
    handleDrop,
    addNodeAtCanvasPosition,
    handleAddNode,
    handleImportImageClick,
    handleFileChange,
    handleDeleteNode,
    handleDeleteEdge,
  } = interaction;

"""
if "useCanvasInteractionHandlers({" not in text:
    s_fc = text.find("  }, [canConnectNodes]);\n\n  // --- Global Pointer Events")
    if s_fc == -1:
        s_fc = text.find("  }, [canConnectNodes]);")
        e_fc = text.find("\n  // --- Global Pointer Events", s_fc)
        text = text[:e_fc] + "\n" + insert_interaction + text[e_fc:]
    else:
        text = text.replace(
            "  }, [canConnectNodes]);\n\n  // --- Global Pointer Events",
            "  }, [canConnectNodes]);\n" + insert_interaction + "\n  // --- Global Pointer Events",
            1,
        )

# Replace fullscreen modal JSX
text = text.replace(
    "<CanvasFullscreenImageModal",
    "<Suspense fallback={null}>\n          <CanvasFullscreenImageModalLazy",
    1,
)
text = text.replace(
    "        />\n      ) : null}\n\n      {showSettingsModal",
    "        />\n        </Suspense>\n      ) : null}\n\n      {showSettingsModal",
    1,
)

# Remove duplicate refs if interaction hook moved addNodeAtCanvasPosition - remove addNodeAtCanvasPositionRef assignment line if duplicate
# Remove containerRef/fileInputRef/importPosRef block duplicates - check if still in CanvasApp

app_path.write_text(text, encoding="utf-8")
print("patched CanvasApp", len(text.splitlines()), "lines")
