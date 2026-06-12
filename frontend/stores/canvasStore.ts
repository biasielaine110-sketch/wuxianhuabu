import { create } from 'zustand';
import type { ResizePreview } from '../canvas/canvasEdgeGeometry';
import type { CanvasNode, Edge, Transform } from '../types';
import { getThumbResolutionPercent, setThumbResolutionPercent } from '../canvas/thumbResolution';
import { getTextNodeFontSize, setTextNodeFontSizeValue } from '../canvas/textNodeFontSize';
import { clearCanvasThumbnailCache } from '../canvas/thumbnailCache';

export const DEFAULT_CANVAS_VIEW_SCALE = 0.2;

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE };

type CanvasStoreState = {
  nodes: CanvasNode[];
  edges: Edge[];
  transform: Transform;
  selectedIds: string[];
  draggingNodeId: string | null;
  resizingNodeId: string | null;
  /** 节点缩放拖拽中的实时几何（React 渲染用，避免 DOM 预览被 reconcile 覆盖） */
  nodeResizePreview: ResizePreview | null;
  eyedropperTargetNodeId: string | null;
  thumbResolutionPct: number;
  editingTextNodeIds: Set<string>;
  importTargetNodeId: string | null;
  textNodeFontSize: number;
};

type CanvasStoreActions = {
  setNodes: (updater: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setTransform: (updater: Transform | ((prev: Transform) => Transform)) => void;
  setSelectedIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  setDraggingNodeId: (id: string | null) => void;
  setResizingNodeId: (id: string | null) => void;
  setNodeResizePreview: (preview: ResizePreview | null) => void;
  setEyedropperTargetNodeId: (
    updater: string | null | ((prev: string | null) => string | null)
  ) => void;
  setThumbResolutionPct: (percent: number) => void;
  setEditingTextNodeIds: (
    updater: Set<string> | ((prev: Set<string>) => Set<string>)
  ) => void;
  setImportTargetNodeId: (
    updater: string | null | ((prev: string | null) => string | null)
  ) => void;
  setTextNodeFontSize: (size: number) => void;
  resetCanvas: (patch?: Partial<Pick<CanvasStoreState, 'nodes' | 'edges' | 'transform' | 'selectedIds'>>) => void;
};

export type CanvasStore = CanvasStoreState & CanvasStoreActions;

export const useCanvasStore = create<CanvasStore>((set) => ({
  nodes: [],
  edges: [],
  transform: DEFAULT_TRANSFORM,
  selectedIds: [],
  draggingNodeId: null,
  resizingNodeId: null,
  nodeResizePreview: null,
  eyedropperTargetNodeId: null,
  thumbResolutionPct: getThumbResolutionPercent(),
  editingTextNodeIds: new Set<string>(),
  importTargetNodeId: null,
  textNodeFontSize: getTextNodeFontSize(),

  setNodes: (updater) =>
    set((s) => ({ nodes: typeof updater === 'function' ? updater(s.nodes) : updater })),
  setEdges: (updater) =>
    set((s) => ({ edges: typeof updater === 'function' ? updater(s.edges) : updater })),
  setTransform: (updater) =>
    set((s) => ({ transform: typeof updater === 'function' ? updater(s.transform) : updater })),
  setSelectedIds: (updater) =>
    set((s) => ({ selectedIds: typeof updater === 'function' ? updater(s.selectedIds) : updater })),
  setDraggingNodeId: (id) => set({ draggingNodeId: id }),
  setResizingNodeId: (id) => set({ resizingNodeId: id }),
  setNodeResizePreview: (preview) => set({ nodeResizePreview: preview }),
  setEyedropperTargetNodeId: (updater) =>
    set((s) => ({
      eyedropperTargetNodeId:
        typeof updater === 'function' ? updater(s.eyedropperTargetNodeId) : updater,
    })),
  setThumbResolutionPct: (percent) => {
    const next = Math.max(5, Math.min(150, percent));
    setThumbResolutionPercent(next);
    clearCanvasThumbnailCache();
    set({ thumbResolutionPct: next });
  },
  setEditingTextNodeIds: (updater) =>
    set((s) => ({
      editingTextNodeIds:
        typeof updater === 'function' ? updater(s.editingTextNodeIds) : updater,
    })),
  setImportTargetNodeId: (updater) =>
    set((s) => ({
      importTargetNodeId:
        typeof updater === 'function' ? updater(s.importTargetNodeId) : updater,
    })),
  setTextNodeFontSize: (size) => {
    setTextNodeFontSizeValue(size);
    set({ textNodeFontSize: getTextNodeFontSize() });
  },

  resetCanvas: (patch) =>
    set({
      nodes: patch?.nodes ?? [],
      edges: patch?.edges ?? [],
      transform: patch?.transform ?? DEFAULT_TRANSFORM,
      selectedIds: patch?.selectedIds ?? [],
      draggingNodeId: null,
      resizingNodeId: null,
      nodeResizePreview: null,
      eyedropperTargetNodeId: null,
      editingTextNodeIds: new Set<string>(),
      importTargetNodeId: null,
    }),
}));

/** 非 React 上下文（事件/定时器）读取最新画布状态 */
export function getCanvasSnapshot() {
  const s = useCanvasStore.getState();
  return {
    nodes: s.nodes,
    edges: s.edges,
    transform: s.transform,
    selectedIds: s.selectedIds,
  };
}

/** 同步 ref 快照，供 App 事件处理读取最新画布 state 而不订阅重渲染 */
export function syncCanvasStoreToRefs(refs: {
  nodesRef: { current: CanvasNode[] };
  edgesRef: { current: Edge[] };
  transformRef: { current: Transform };
  selectedIdsRef: { current: string[] };
}) {
  const s = useCanvasStore.getState();
  refs.nodesRef.current = s.nodes;
  refs.edgesRef.current = s.edges;
  refs.transformRef.current = s.transform;
  refs.selectedIdsRef.current = s.selectedIds;
}
