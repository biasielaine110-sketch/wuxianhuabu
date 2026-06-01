import React, { memo, useLayoutEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { CanvasNode } from '../types';
import { CanvasEdgesLayer } from './CanvasEdgesLayer';
import { CanvasNodesLayer } from './CanvasNodesLayer';
import { computeEdgeBridges } from './edgeUtils';
import { useCanvasViewportModel } from './useCanvasViewportModel';
import { useCanvasStore } from '../stores/canvasStore';
import type { CanvasNodeRenderState } from './canvasNodeRenderState';
import type { DragPreview, ResizePreview } from './canvasEdgeGeometry';
import { applyNodeDragPreview } from './canvasNodeDragDom';

type CanvasStageProps = {
  canvasTransformLayerRef: React.RefObject<HTMLDivElement | null>;
  edgesSvgRef: React.RefObject<SVGSVGElement | null>;
  draftEdgePathRef: React.RefObject<SVGPathElement | null>;
  canvasViewportRef: MutableRefObject<{
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  }>;
  viewportSize: { width: number; height: number };
  viewportCullTick: number;
  renderCanvasNodeStateRef: MutableRefObject<CanvasNodeRenderState>;
  /** App 侧每帧写入的非画布 store 状态（handlers、预设等） */
  renderStateOverlayRef: MutableRefObject<Partial<CanvasNodeRenderState>>;
  dragPreviewRef: RefObject<DragPreview | null>;
  nodeResizePreviewRef: RefObject<ResizePreview | null>;
  inputNodeTypes: readonly string[];
  renderNode: (node: CanvasNode) => React.ReactNode;
  onDeleteEdge: (id: string) => void;
  onNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onPortPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onBeginResize: (e: React.PointerEvent, nodeId: string, direction: string) => void;
};

function CanvasStageInner({
  canvasTransformLayerRef,
  edgesSvgRef,
  draftEdgePathRef,
  canvasViewportRef,
  viewportSize,
  viewportCullTick,
  renderCanvasNodeStateRef,
  renderStateOverlayRef,
  dragPreviewRef,
  nodeResizePreviewRef,
  inputNodeTypes,
  renderNode,
  onDeleteEdge,
  onNodePointerDown,
  onPortPointerDown,
  onBeginResize,
}: CanvasStageProps) {
  const model = useCanvasViewportModel({
    canvasViewportRef,
    viewportSize,
    viewportCullTick,
  });
  const eyedropperTargetNodeId = useCanvasStore((s) => s.eyedropperTargetNodeId);
  const thumbResolutionPct = useCanvasStore((s) => s.thumbResolutionPct);
  const editingTextNodeIds = useCanvasStore((s) => s.editingTextNodeIds);
  const importTargetNodeId = useCanvasStore((s) => s.importTargetNodeId);
  const textNodeFontSize = useCanvasStore((s) => s.textNodeFontSize);
  const nodeResizePreview = useCanvasStore((s) => s.nodeResizePreview);

  const edgeBridges = computeEdgeBridges(model.visibleEdges, model.nodeMap);

  // 在子节点 renderNode 调用前同步合并，避免 useLayoutEffect 滞后一帧
  renderCanvasNodeStateRef.current = {
    ...renderStateOverlayRef.current,
    eyedropperTargetNodeId,
    thumbResolutionPct,
    editingTextNodeIds,
    importTargetNodeId,
    textNodeFontSize,
    selectedIdSet: model.selectedIdSet,
    visibleNodeIds: model.visibleNodeIds,
    nodes: model.nodes,
    edges: model.edges,
    nodesRef: renderStateOverlayRef.current.nodesRef!,
    edgesRef: renderStateOverlayRef.current.edgesRef!,
    edgesKey: model.edgesKey,
  } as CanvasNodeRenderState;

  // transform 由 applyCanvasTransformDom 直写；仅在 store 提交后同步，避免与滚轮/拖拽 DOM 直写冲突
  useLayoutEffect(() => {
    const el = canvasTransformLayerRef.current;
    if (!el) return;
    const tf = model.transform;
    el.style.transform = `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`;
  }, [model.transform.x, model.transform.y, model.transform.scale, canvasTransformLayerRef]);

  // 缩放预览由 store 驱动 React 渲染；此处仅恢复拖拽 transform 预览
  useLayoutEffect(() => {
    const layer = canvasTransformLayerRef.current;
    if (!layer) return;
    const dragPreview = dragPreviewRef.current;
    if (dragPreview) {
      applyNodeDragPreview(layer, dragPreview.nodeIds, dragPreview.deltaX, dragPreview.deltaY);
    }
  }, [nodeResizePreview, canvasTransformLayerRef, dragPreviewRef]);

  return (
    <div
      ref={canvasTransformLayerRef}
      className="absolute top-0 left-0 origin-top-left"
    >
      <svg
        ref={edgesSvgRef}
        id="svg-layer"
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: '50000px',
          height: '50000px',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <filter id="glow-active" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="jump-marker" markerWidth="14" markerHeight="10" refX="7" refY="5" orient="auto">
            <path d="M 0,5 Q 7,-1 14,5" fill="none" stroke="#60a5fa" strokeWidth="2" />
            <circle cx="7" cy="5" r="2" fill="#60a5fa" />
          </marker>
          <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <polygon points="0 0, 12 4, 0 8" fill="#4a5568" />
          </marker>
          <marker id="arrowhead-active" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <polygon points="0 0, 12 4, 0 8" fill="#60a5fa" />
          </marker>
        </defs>

        <g style={{ pointerEvents: 'auto' }}>
          <CanvasEdgesLayer
            edges={model.visibleEdges}
            nodeMap={model.nodeMap}
            selectedIdSet={model.selectedIdSet}
            onDeleteEdge={onDeleteEdge}
          />
        </g>

        {edgeBridges.map((b) => (
          <g key={b.id} pointerEvents="none">
            <circle cx={b.x} cy={b.y} r={5} fill="#1e1e1e" stroke="#60a5fa" strokeWidth={1.5} />
            <path
              d={`M ${b.x - 4} ${b.y} Q ${b.x} ${b.y - 5} ${b.x + 4} ${b.y}`}
              fill="none"
              stroke="#60a5fa"
              strokeWidth={1.5}
            />
          </g>
        ))}

        <path
          ref={draftEdgePathRef}
          stroke="#60a5fa"
          strokeWidth="3"
          strokeDasharray="8,4"
          fill="none"
          visibility="hidden"
        />
      </svg>

      <CanvasNodesLayer
        mountedNodes={model.mountedNodes}
        visibleNodeIds={model.visibleNodeIds}
        selectedIdSet={model.selectedIdSet}
        draggingNodeId={model.draggingNodeId}
        activeWebGLNodeId={model.activeWebGLNodeId}
        edgesKey={model.edgesKey}
        inputNodeTypes={inputNodeTypes}
        renderNode={renderNode}
        onNodePointerDown={onNodePointerDown}
        onPortPointerDown={onPortPointerDown}
        onBeginResize={onBeginResize}
      />
    </div>
  );
}

export const CanvasStage = memo(CanvasStageInner);
