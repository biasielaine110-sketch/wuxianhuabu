import React from 'react';
import type { CanvasNode } from '../types';
import { FullscreenIcon, TrashIcon } from './canvasIcons';

type CanvasNodeFooterActionsProps = {
  node: CanvasNode;
  onResetSize: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
};

/** 节点标题栏右侧：重置大小 + 删除 */
export function CanvasNodeFooterActions({ node, onResetSize, onDelete }: CanvasNodeFooterActionsProps) {
  const iconSize = node.type === 'gridSplit' || node.type === 'gridMerge' ? 15 : 12;
  const trashSize = node.type === 'gridSplit' || node.type === 'gridMerge' ? 21 : 14;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          onResetSize(node.id);
        }}
        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-[#333] hover:text-blue-400"
        title="恢复为默认宽高"
      >
        <FullscreenIcon size={iconSize} />
        <span className="whitespace-nowrap">重置大小</span>
      </button>
      <button
        type="button"
        title="删除节点（Alt+Q）"
        onPointerDown={(e) => {
          e.stopPropagation();
          onDelete(node.id);
        }}
        className="text-gray-500 hover:text-red-400 transition-colors p-1"
      >
        <TrashIcon size={trashSize} />
      </button>
    </div>
  );
}
