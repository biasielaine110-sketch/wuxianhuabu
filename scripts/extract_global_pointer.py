"""Extract global pointer effect from CanvasApp into useCanvasGlobalPointerEvents."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
app_path = root / "CanvasApp.tsx"
lines = app_path.read_text(encoding="utf-8").splitlines()

s = next(i for i, l in enumerate(lines) if "  // --- Global Pointer Events for Robust Dragging ---" in l)
e = next(i for i, l in enumerate(lines) if i > s and l.strip() == "}, [applyLiveCanvasTransform, commitTransformFromRef]);")

body = lines[s + 2 : e]  # inside useEffect, skip useEffect(() => {

header = '''import { useEffect, type RefObject, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { CanvasNode, Edge, Transform } from '../types';
import type { DragPreview, ResizePreview } from './canvasEdgeGeometry';
import { hideDraftEdgePath } from './canvasDraftEdgeDom';
import {
  applyNodeDragPreview,
  applyNodeGeometryPreview,
  clearNodeDragPreview,
  clearNodeGeometryPreview,
} from './canvasNodeDragDom';
import {
  applyEdgeDragPreview,
  applyEdgeResizePreview,
  clearEdgeGeometryPreviews,
} from './canvasEdgeDragDom';
import { buildMoveNodesCommand, type CanvasCommand } from './canvasCommands';

export type UseCanvasGlobalPointerEventsOptions = {
  containerRef: RefObject<HTMLDivElement>;
  transformRef: RefObject<Transform>;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  selectedIdsRef: RefObject<string[]>;
  canvasTransformLayerRef: RefObject<HTMLDivElement | null>;
  edgesSvgRef: RefObject<SVGSVGElement | null>;
  draftEdgeRef: RefObject<{ sourceId: string; x: number; y: number } | null>;
  draftEdgePathRef: RefObject<SVGPathElement | null>;
  dragPreviewRef: RefObject<DragPreview | null>;
  resizePreviewRef: RefObject<ResizePreview | null>;
  activePointerTypeRef: RefObject<'canvas' | 'node' | 'edge' | 'fullscreen' | 'resize' | 'boxSelect' | 'selection' | 'selectStart' | null>;
  lastMousePosRef: RefObject<{ x: number; y: number }>;
  lastFsMousePosRef: RefObject<{ x: number; y: number }>;
  canvasMouseRef: RefObject<{ x: number; y: number }>;
  draggingNodeIdRef: RefObject<string | null>;
  rafIdRef: RefObject<number | null>;
  nodeDragAccumRef: RefObject<{ nodeIds: string[]; deltaX: number; deltaY: number } | null>;
  altDupPendingRef: RefObject<boolean>;
  altDupDoneRef: RefObject<boolean>;
  altDupClickNodeIdRef: RefObject<string | null>;
  altDragScreenAccumRef: RefObject<{ x: number; y: number }>;
  nodeDragHistoryStartRef: RefObject<Map<string, { x: number; y: number }> | null>;
  isSelectingRef: RefObject<boolean>;
  selectionBoxRef: RefObject<{ x: number; y: number; width: number; height: number } | null>;
  boxSelectRafRef: RefObject<number | null>;
  pressStartPosRef: RefObject<{ x: number; y: number } | null>;
  longPressTimerRef: RefObject<number | null>;
  nodeResizeSessionRef: RefObject<{
    nodeId: string;
    origin: CanvasNode;
    direction: string;
    grabCanvasX: number;
    grabCanvasY: number;
    minWidth: number;
    minHeight: number;
  } | null>;
  nodeResizePreviewRef: RefObject<{ nodeId: string; x: number; y: number; width: number; height: number } | null>;
  resizingNodeIdRef: RefObject<string | null>;
  resizeDirectionRef: RefObject<string>;
  edgeDraggingRef: RefObject<{ edgeId: string; x: number; y: number; nearStart: boolean; nearEnd: boolean } | null>;
  wheelTransformCommitTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  duplicateNodesSubgraphForAltDragRef: RefObject<() => void>;
  pushCanvasCommandRef: RefObject<(cmd: CanvasCommand) => void>;
  refreshDraftEdgePath: () => void;
  findConnectTargetNode: (mouseX: number, mouseY: number, sourceId: string) => CanvasNode | null;
  computeNodeResizeFromPointer: (
    origin: CanvasNode,
    direction: string,
    px: number,
    py: number,
    grabCanvasX: number,
    grabCanvasY: number,
    shiftKey: boolean,
    minWidth: number,
    minHeight: number,
  ) => { x: number; y: number; width: number; height: number };
  applyLiveCanvasTransform: (tf: Transform) => void;
  commitTransformFromRef: () => void;
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setDraggingNodeId: Dispatch<SetStateAction<string | null>>;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
  setSelectionBox: Dispatch<SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; canvasX: number; canvasY: number } | null>>;
  setPendingEdgeSourceId: Dispatch<SetStateAction<string | null>>;
  setDraggingEdgeId: Dispatch<SetStateAction<string | null>>;
  setResizingNodeId: Dispatch<SetStateAction<string | null>>;
  setResizeDirection: Dispatch<SetStateAction<string>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setFsTransform: Dispatch<SetStateAction<{ x: number; y: number; scale: number }>>;
};

export function useCanvasGlobalPointerEvents(opts: UseCanvasGlobalPointerEventsOptions) {
  const {
    containerRef,
    transformRef,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    draftEdgeRef,
    draftEdgePathRef,
    dragPreviewRef,
    resizePreviewRef,
    activePointerTypeRef,
    lastMousePosRef,
    lastFsMousePosRef,
    canvasMouseRef,
    draggingNodeIdRef,
    rafIdRef,
    nodeDragAccumRef,
    altDupPendingRef,
    altDupDoneRef,
    altDupClickNodeIdRef,
    altDragScreenAccumRef,
    nodeDragHistoryStartRef,
    isSelectingRef,
    selectionBoxRef,
    boxSelectRafRef,
    pressStartPosRef,
    longPressTimerRef,
    nodeResizeSessionRef,
    nodeResizePreviewRef,
    resizingNodeIdRef,
    resizeDirectionRef,
    edgeDraggingRef,
    wheelTransformCommitTimerRef,
    duplicateNodesSubgraphForAltDragRef,
    pushCanvasCommandRef,
    refreshDraftEdgePath,
    findConnectTargetNode,
    computeNodeResizeFromPointer,
    applyLiveCanvasTransform,
    commitTransformFromRef,
    setNodes,
    setEdges,
    setSelectedIds,
    setDraggingNodeId,
    setIsSelecting,
    setSelectionBox,
    setContextMenu,
    setPendingEdgeSourceId,
    setDraggingEdgeId,
    setResizingNodeId,
    setResizeDirection,
    setIsResizing,
    setFsTransform,
  } = opts;

  useEffect(() => {
'''

footer = '''
  }, [applyLiveCanvasTransform, commitTransformFromRef, findConnectTargetNode, refreshDraftEdgePath]);
}
'''

out = root / "canvas" / "useCanvasGlobalPointerEvents.ts"
out.write_text(header + "\n".join(body) + footer + "\n", encoding="utf-8")
print("wrote", out.name, len(body), "lines")

text = app_path.read_text(encoding="utf-8")
block_start = text.find("  // --- Global Pointer Events for Robust Dragging ---")
block_end = text.find("  const createImageNodesFromBase64List = useCallback", block_start)
insert = '''  useCanvasGlobalPointerEvents({
    containerRef,
    transformRef,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    draftEdgeRef,
    draftEdgePathRef,
    dragPreviewRef,
    resizePreviewRef,
    activePointerTypeRef,
    lastMousePosRef,
    lastFsMousePosRef,
    canvasMouseRef,
    draggingNodeIdRef,
    rafIdRef,
    nodeDragAccumRef,
    altDupPendingRef,
    altDupDoneRef,
    altDupClickNodeIdRef,
    altDragScreenAccumRef,
    nodeDragHistoryStartRef,
    isSelectingRef,
    selectionBoxRef,
    boxSelectRafRef,
    pressStartPosRef,
    longPressTimerRef,
    nodeResizeSessionRef,
    nodeResizePreviewRef,
    resizingNodeIdRef,
    resizeDirectionRef,
    edgeDraggingRef,
    wheelTransformCommitTimerRef,
    duplicateNodesSubgraphForAltDragRef,
    pushCanvasCommandRef,
    refreshDraftEdgePath,
    findConnectTargetNode,
    computeNodeResizeFromPointer,
    applyLiveCanvasTransform,
    commitTransformFromRef,
    setNodes,
    setEdges,
    setSelectedIds,
    setDraggingNodeId,
    setIsSelecting,
    setSelectionBox,
    setContextMenu,
    setPendingEdgeSourceId,
    setDraggingEdgeId,
    setResizingNodeId,
    setResizeDirection,
    setIsResizing,
    setFsTransform,
  });

'''
text = text[:block_start] + insert + text[block_end:]
if "useCanvasGlobalPointerEvents" not in text.split("import")[0]:
    text = text.replace(
        "import { useCanvasInteractionHandlers } from './canvas/useCanvasInteractionHandlers';",
        "import { useCanvasInteractionHandlers } from './canvas/useCanvasInteractionHandlers';\nimport { useCanvasGlobalPointerEvents } from './canvas/useCanvasGlobalPointerEvents';",
        1,
    )
app_path.write_text(text, encoding="utf-8")
print("patched CanvasApp", len(text.splitlines()), "lines")
