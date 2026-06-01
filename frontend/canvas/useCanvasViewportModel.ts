import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { CanvasNode, Edge, Transform } from '../types';
import { useCanvasStore } from '../stores/canvasStore';
import { computeVisibleNodeIds } from './viewportUtils';
import { pickActiveWebGLNodeId } from './activeWebGLNode';

export type CanvasViewportSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

type UseCanvasViewportModelArgs = {
  canvasViewportRef: MutableRefObject<CanvasViewportSnapshot>;
  viewportSize: { width: number; height: number };
  viewportCullTick: number;
};

/** 订阅 Zustand 画布状态并计算视口裁剪模型（仅 CanvasStage 使用，避免 App 因 nodes 变更重渲染） */
export function useCanvasViewportModel({
  canvasViewportRef,
  viewportSize,
  viewportCullTick,
}: UseCanvasViewportModelArgs) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const transform = useCanvasStore((s) => s.transform);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const draggingNodeId = useCanvasStore((s) => s.draggingNodeId);
  const resizingNodeId = useCanvasStore((s) => s.resizingNodeId);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visibleNodeIds = useMemo(() => {
    const vp = canvasViewportRef.current;
    return computeVisibleNodeIds(
      nodes,
      { x: vp.x, y: vp.y, scale: vp.scale },
      vp.width || viewportSize.width,
      vp.height || viewportSize.height,
      300,
    );
  }, [nodes, transform, viewportSize, viewportCullTick, canvasViewportRef]);

  const edgeRenderNodeIds = useMemo(() => {
    const set = new Set(visibleNodeIds);
    if (draggingNodeId) set.add(draggingNodeId);
    for (const id of selectedIds) set.add(id);
    if (resizingNodeId) set.add(resizingNodeId);
    for (const edge of edges) {
      if (set.has(edge.sourceId)) set.add(edge.targetId);
      if (set.has(edge.targetId)) set.add(edge.sourceId);
    }
    return set;
  }, [visibleNodeIds, draggingNodeId, selectedIds, resizingNodeId, edges]);

  const mountedNodeIds = useMemo(() => {
    const set = new Set(visibleNodeIds);
    for (const id of selectedIds) set.add(id);
    if (draggingNodeId) set.add(draggingNodeId);
    if (resizingNodeId) set.add(resizingNodeId);
    for (const edge of edges) {
      if (set.has(edge.sourceId)) set.add(edge.targetId);
      if (set.has(edge.targetId)) set.add(edge.sourceId);
    }
    return set;
  }, [visibleNodeIds, selectedIds, draggingNodeId, resizingNodeId, edges]);

  const mountedNodes = useMemo(() => {
    const result: CanvasNode[] = [];
    for (const node of nodes) {
      if (mountedNodeIds.has(node.id)) result.push(node);
    }
    return result;
  }, [nodes, mountedNodeIds]);

  const visibleEdges = useMemo(() => {
    const result: Edge[] = [];
    for (const edge of edges) {
      if (edgeRenderNodeIds.has(edge.sourceId) && edgeRenderNodeIds.has(edge.targetId)) {
        result.push(edge);
      }
    }
    return result;
  }, [edges, edgeRenderNodeIds]);

  const activeWebGLNodeId = useMemo(() => {
    const vp = canvasViewportRef.current;
    return pickActiveWebGLNodeId(nodes, visibleNodeIds, selectedIds, draggingNodeId, vp);
  }, [nodes, visibleNodeIds, selectedIds, draggingNodeId, transform, viewportSize, canvasViewportRef]);

  const edgesKey = useMemo(
    () => edges.map((e) => `${e.sourceId}->${e.targetId}`).join('|'),
    [edges],
  );

  return {
    nodes,
    edges,
    transform,
    selectedIds,
    draggingNodeId,
    nodeMap,
    selectedIdSet,
    visibleNodeIds,
    mountedNodes,
    visibleEdges,
    activeWebGLNodeId,
    edgesKey,
  };
}
