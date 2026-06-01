"""Clean CanvasApp: remove dead code, wire new utils and lazy modules."""
from pathlib import Path

app_path = Path(__file__).resolve().parents[1] / "frontend" / "CanvasApp.tsx"
text = app_path.read_text(encoding="utf-8")

# Remove dead top imports block (lines 4-122 approx) - replace clean import header
old_header_end = "// --- Icons ---"
idx = text.find(old_header_end)
export_idx = text.find("export type CanvasAppProps")
if idx == -1 or export_idx == -1:
    raise SystemExit("markers not found")

new_imports = '''import React, { lazy, Suspense, useState, useRef, useCallback, useEffect, useLayoutEffect, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { CanvasNode, Edge, Tool, NodeType, PanoramaNode, GridSplitNode, GridMergeNode, PanoramaT2iNode, Director3DNode, ChatNode, CanvasMode, AuditImage } from './types';
import { HeavyNodeFallback } from './canvas/HeavyNodeFallback';

const AuditModeCanvasHostLazy = lazy(() =>
  import('./canvas/AuditModeCanvasHost').then((m) => ({ default: m.AuditModeCanvasHost }))
);
const CanvasProjectModalLazy = lazy(() =>
  import('./canvas/CanvasProjectModal').then((m) => ({ default: m.CanvasProjectModal }))
);
const CanvasSettingsModalLazy = lazy(() =>
  import('./canvas/CanvasSettingsModal').then((m) => ({ default: m.CanvasSettingsModal }))
);
import { clearCanvasThumbnailCache } from './canvas/thumbnailCache';
import { ThumbResolutionControl } from './canvas/ThumbResolutionControl';
import {
  AnnotationIcon,
  AudioIcon,
  BoxSelectIcon,
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
} from './canvas/canvasIcons';
import { defaultCanvasImageModel } from './canvas/canvasModelUtils';
import { loadChatPromptPresets } from './canvas/loadChatPromptPresets';
import { CanvasStage } from './canvas/CanvasStage';
import { CanvasShortcutsPanel } from './canvas/CanvasShortcutsPanel';
import { useCanvasSettingsPanelState } from './canvas/useCanvasSettingsPanelState';
import { INITIAL_PROMPT_PRESETS_BASE } from './canvas/initialPromptPresets';
import { fullscreenImageDisplaySrc } from './canvas/fullscreenImageUtils';
import { useCanvasFullscreenImage } from './canvas/useCanvasFullscreenImage';
const CanvasFullscreenImageModalLazy = lazy(() =>
  import('./canvas/CanvasFullscreenImageModal').then((m) => ({ default: m.CanvasFullscreenImageModal }))
);
import { useLazyCanvasGeneration } from './canvas/useLazyCanvasGeneration';
import { useCanvasInteractionHandlers } from './canvas/useCanvasInteractionHandlers';
import { useCanvasGlobalPointerEvents } from './canvas/useCanvasGlobalPointerEvents';
import { useLazyCanvasKeyboardShortcuts } from './canvas/useLazyCanvasKeyboardShortcuts';
import { useCanvasProjectLibrary } from './canvas/useCanvasProjectLibrary';
import { CanvasDraftDiskModal } from './canvas/CanvasDraftDiskModal';
import { INPUT_NODE_TYPES, CANVAS_HISTORY_SKIP_PAYLOAD_CHARS } from './canvas/canvasConstants';
import { computeNodeResizeFromPointer } from './canvas/canvasNodeResizeUtils';
import { estimateCanvasBase64PayloadChars, canvasHistoryMaxSteps } from './canvas/canvasHistoryPayloadUtils';
import { revokeNodeBlobUrls } from './canvas/canvasBlobUrlRegistry';
import { buildCanvasNodeRenderOverlay } from './canvas/buildCanvasNodeRenderOverlay';
import { useLazyRenderCanvasNode } from './canvas/useLazyRenderCanvasNode';
import {
  projectDraftDisplayName,
  projectDraftEditSeed,
} from './canvas/projectDraftUtils';
import { CanvasBackground } from './canvas/CanvasBackground';
import { pendingHomeChatRef } from './canvas/pendingHomeChat';
import { nodeLayoutKey } from './canvas/edgeUtils';
import type { DragPreview, ResizePreview } from './canvas/canvasEdgeGeometry';
import { resolveNodeGeometry } from './canvas/canvasEdgeGeometry';
import { hideDraftEdgePath, showDraftEdgePath } from './canvas/canvasDraftEdgeDom';
import {
  buildStructuralHistoryKey,
  buildPromptHistoryKey,
  HISTORY_DEBOUNCE_STRUCTURAL_MS,
  HISTORY_DEBOUNCE_PROMPT_MS,
} from './canvas/canvasHistoryPolicy';
import { CanvasMinimapHost } from './canvas/CanvasMinimapHost';
import { CanvasZoomControl } from './canvas/CanvasZoomControl';
import { CanvasEyedropperOverlay } from './canvas/CanvasEyedropperOverlay';
import { applyCanvasTransformDom, patchCanvasViewportRef } from './canvas/canvasTransformDom';
import {
  applyNodeDragPreview,
  applyNodeGeometryPreview,
  clearNodeDragPreview,
  clearNodeGeometryPreview,
} from './canvas/canvasNodeDragDom';
import { clearEdgeGeometryPreviews } from './canvas/canvasEdgeDragDom';
import { buildSpacedImageNodes, buildSpacedImageNodesFromLists, buildStackedImageNodes, SPAWNED_IMAGE_NODE_HEIGHT, SPAWNED_IMAGE_NODE_WIDTH } from './canvas/spawnImageNodes';
import { resolveCopyToImageOptions, type CopyToImageLayout, type CopyToImageOptions } from './canvas/copyToImageOptions';
import {
  stripImagesFromNodes,
  mergeHistoryNodesWithCurrentImages,
  type CanvasHistoryEntry,
} from './canvas/canvasHistoryUtils';
import { buildNodeMediaOffloadPatch, buildMediaOffloadScanKey, nodeNeedsMediaOffload } from './services/canvasAssetSync';
import { revokeNodeCanvasAssets } from './services/canvasAssetCleanup';
import { imageSrcToRawBase64 } from './services/canvasAssetResolver';
import {
  buildMoveNodesCommand,
  reverseCanvasCommand,
  CANVAS_COMMAND_STACK_MAX,
  type CanvasCommand,
} from './canvas/canvasCommands';
import { DEFAULT_CANVAS_VIEW_SCALE, useCanvasStore, syncCanvasStoreToRefs } from './stores/canvasStore';
import {
  DEFAULT_CODESONLINE_CHAT_BASE_URL,
  DEFAULT_CODESONLINE_IMAGE_BASE_URL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
  DEFAULT_JUNLAN_BASE_URL,
  DEFAULT_MANXUE_BASE_URL,
  DEFAULT_MINIMAX_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_AIID_BASE_URL,
  getAiSettingsSnapshot,
  getCodesonlineSavedKey,
  getCodesonlineChatSavedKey,
  setCodesonlineChatKey,
  getJunlanSavedKey,
  migrateAiSettingsIfLegacy,
  persistAiSettings,
  getAiidBaseUrl,
  getAiidSavedKey,
} from './services/aiSettings';
import { saveProjectLibrary } from './services/projectPersistence';
import { useJimengAuth } from './integrations/jimeng/jimengAuthContext';
import type { CanvasNodeRenderState } from './canvas/canvasNodeRenderState';
import { useSyncRenderStateOverlay } from './canvas/useSyncRenderStateOverlay';
import {
  isGptImage2CanvasModelId,
  isManxueGeminiImageModel,
  isManxueGptImage2Model,
} from './canvas/canvasModelUtils';
import {
  getNodePrimaryImageRef,
  collectCopyableImageRefsFromNode,
  getNodePrimaryCopyRef,
  imageRefToSingleImageFields,
  resolveImageProviderNodes,
  singleImageFieldsMatch,
} from './referenceSlots';
import {
  saveImageDownload,
  saveVideoDownloadFromUrl,
} from './services/downloadPathSettings';

'''

text = new_imports + text[export_idx:]

# Remove duplicate INPUT_NODE_TYPES and computeNodeResizeFromPointer if still in file
for marker in [
    "const INPUT_NODE_TYPES: NodeType[]",
    "function computeNodeResizeFromPointer(",
    "const CANVAS_HISTORY_SKIP_PAYLOAD_CHARS = 22_000_000",
    "function estimateCanvasBase64PayloadChars(",
    "function canvasHistoryMaxSteps(",
    "const blobUrlRegistry = new Map",
    "function revokeNodeBlobUrls(",
]:
    start = text.find(marker)
    if start == -1:
        continue
    # find end of function/const block
    if marker.startswith("function"):
        depth = 0
        i = text.find("{", start)
        end = i
        for j in range(i, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        text = text[:start] + text[end + 1 :]
    elif marker.startswith("const INPUT") or marker.startswith("const CANVAS") or marker.startswith("const blob"):
        end = text.find("\n\n", start)
        if end == -1:
            end = text.find("\n/**", start)
        text = text[:start] + text[end + 1 :]

# Replace render overlay
text = text.replace(
    "  const renderStateOverlayRef = useSyncRenderStateOverlay(() => ({",
    "  const renderStateOverlayRef = useSyncRenderStateOverlay(() => buildCanvasNodeRenderOverlay({",
    1,
)
text = text.replace(
    "    appendNodesWithUndo,\n  }));",
    "    appendNodesWithUndo,\n  }));".replace("  }));", "  }));"),
    1,
)
# Fix closing paren for buildCanvasNodeRenderOverlay
text = text.replace(
    """    downloadVideoFromUrl,
    appendNodesWithUndo,
  }));""",
    """    downloadVideoFromUrl,
    appendNodesWithUndo,
  }));""".replace("  }));", "  }));"),
)
# Actually need to change `}));` to `}));` - the build function wraps object - closing should be `}));` still correct

# Replace renderNode block
old_render = """  const renderNode = (node: CanvasNode) =>
    renderCanvasNode(node, renderCanvasNodeStateRef.current);
  renderNodeRef.current = renderNode;
  const stableRenderNode = useCallback((node: CanvasNode) => renderNodeRef.current(node), []);"""

new_render = """  const stableRenderNode = useLazyRenderCanvasNode(renderCanvasNodeStateRef);"""

if old_render in text:
    text = text.replace(old_render, new_render, 1)

# Remove renderNodeRef if unused
text = text.replace("  const renderNodeRef = useRef<(node: CanvasNode) => React.ReactNode>(() => null);\n\n", "")

# AuditModeCanvasHost -> lazy
text = text.replace("<AuditModeCanvasHost", "<Suspense fallback={<HeavyNodeFallback label=\"加载看图模式…\" />}><AuditModeCanvasHostLazy", 1)
text = text.replace(
    "          saveCurrentProject={saveCurrentProject}\n        />",
    "          saveCurrentProject={saveCurrentProject}\n        /></Suspense>",
    1,
)

app_path.write_text(text, encoding="utf-8")
print("patched", len(text.splitlines()), "lines")
