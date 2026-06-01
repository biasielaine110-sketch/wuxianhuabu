import React, { memo } from 'react';
import type { CanvasNode } from '../types';
import { useCanvasStore } from '../stores/canvasStore';
import { MemoNodeCard } from './MemoNodeCard';
import { MemoizedNodePlaceholder } from './MemoizedNodePlaceholder';
import {
  nodePlaceholderHint,
  shouldUseNodePlaceholder,
} from './activeWebGLNode';

export type CanvasNodesLayerProps = {
  mountedNodes: CanvasNode[];
  visibleNodeIds: Set<string>;
  selectedIdSet: Set<string>;
  draggingNodeId: string | null;
  activeWebGLNodeId: string | null;
  edgesKey: string;
  inputNodeTypes: readonly string[];
  renderNode: (node: CanvasNode) => React.ReactNode;
  onNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onPortPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onBeginResize: (e: React.PointerEvent, nodeId: string, direction: string) => void;
};

function CanvasNodesLayerInner({
  mountedNodes,
  visibleNodeIds,
  selectedIdSet,
  draggingNodeId,
  activeWebGLNodeId,
  edgesKey,
  inputNodeTypes,
  renderNode,
  onNodePointerDown,
  onPortPointerDown,
  onBeginResize,
}: CanvasNodesLayerProps) {
  const eyedropperTargetNodeId = useCanvasStore((s) => s.eyedropperTargetNodeId);
  const thumbResolutionKey = useCanvasStore((s) => s.thumbResolutionPct);
  return (
    <>
      {mountedNodes.map((node) => {
        const isInViewport = visibleNodeIds.has(node.id);
        const isDragging = draggingNodeId === node.id;
        const isSelected = selectedIdSet.has(node.id);
        const usePlaceholder = shouldUseNodePlaceholder(node, {
          isInViewport,
          isDragging,
          isSelected,
          activeWebGLNodeId,
        });
        if (usePlaceholder) {
          return (
            <MemoizedNodePlaceholder
              key={node.id}
              node={node}
              isSelected={isSelected}
              hasInputPort={inputNodeTypes.includes(node.type)}
              hasOutputPort
              hint={nodePlaceholderHint(node, { isInViewport, activeWebGLNodeId })}
              onPointerDown={onNodePointerDown}
              onPortPointerDown={onPortPointerDown}
              onBeginResize={onBeginResize}
            />
          );
        }
        return (
          <MemoNodeCard
            key={node.id}
            node={node}
            isSelected={isSelected}
            isInViewport={isInViewport}
            isDragging={isDragging}
            edgesKey={edgesKey}
            eyedropperTargetNodeId={eyedropperTargetNodeId}
            thumbResolutionKey={thumbResolutionKey}
            renderNode={renderNode}
          />
        );
      })}
    </>
  );
}

export const CanvasNodesLayer = memo(CanvasNodesLayerInner);
