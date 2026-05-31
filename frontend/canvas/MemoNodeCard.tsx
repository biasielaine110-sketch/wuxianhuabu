import React, { memo } from 'react';
import type { CanvasNode } from '../types';

export type MemoNodeCardProps = {
  node: CanvasNode;
  isSelected: boolean;
  isInViewport: boolean;
  isDragging: boolean;
  edgesKey: string;
  eyedropperTargetNodeId: string | null;
  thumbResolutionKey: number;
  renderNode: (node: CanvasNode) => React.ReactNode;
};

function MemoNodeCardInner({ node, renderNode }: MemoNodeCardProps) {
  return <>{renderNode(node)}</>;
}

function areNodeCardPropsEqual(prev: MemoNodeCardProps, next: MemoNodeCardProps): boolean {
  if (prev.renderNode !== next.renderNode) return false;
  if (prev.node !== next.node) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isInViewport !== next.isInViewport) return false;
  if (prev.isDragging !== next.isDragging) return false;
  if (prev.node.isGenerating !== next.node.isGenerating) return false;

  const graphSensitive =
    prev.node.type === 'chat' ||
    prev.node.type === 'i2i' ||
    prev.node.type === 't2i' ||
    prev.node.type === 'video' ||
    prev.node.type === 'image' ||
    prev.node.type === 'gridSplit' ||
    prev.node.type === 'gridMerge' ||
    prev.node.type === 'annotation' ||
    prev.node.type === 'panorama' ||
    prev.node.type === 'panoramaT2i' ||
    prev.node.type === 'director3d';

  if (graphSensitive && prev.edgesKey !== next.edgesKey) return false;

  /** 吸管目标变化时需重绘（按钮高亮、预览区拾取连线层等依赖此状态） */
  if (graphSensitive && prev.eyedropperTargetNodeId !== next.eyedropperTargetNodeId) return false;

  if (prev.thumbResolutionKey !== next.thumbResolutionKey) return false;

  return true;
}

export const MemoNodeCard = memo(MemoNodeCardInner, areNodeCardPropsEqual);
