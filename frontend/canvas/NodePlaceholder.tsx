import React from 'react';
import type { CanvasNode } from '../types';
import { getNodeBorderClass, getNodeDisplayMeta } from './nodeMeta';

export type NodePlaceholderProps = {
  node: CanvasNode;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
};

/** 视口外节点的轻量占位，不挂载 Three.js / 聊天 / textarea 等重型内容 */
export function NodePlaceholder({ node, isSelected, onPointerDown }: NodePlaceholderProps) {
  const meta = getNodeDisplayMeta(node.type, isSelected);
  const borderColor = getNodeBorderClass(node.type, isSelected);

  return (
    <div
      key={node.id}
      data-node-root="true"
      data-selected={isSelected ? 'true' : 'false'}
      data-node-placeholder="true"
      className={`absolute flex flex-col bg-[#1a1a1a] rounded-[20px] border-8 shadow-xl ${borderColor} ${isSelected ? 'z-20' : 'z-10 opacity-70'}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onPointerDown={(e) => onPointerDown(e, node.id)}
    >
      <div className="absolute -top-[7rem] left-3 z-30 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
        <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
        <span className="canvas-node-window-title text-white/60 font-medium">{meta.title}</span>
      </div>
      <div className="flex-1 flex items-center justify-center pointer-events-none">
        {node.isGenerating ? (
          <span className="text-xs text-gray-500 animate-pulse">生成中…</span>
        ) : (
          <span className="text-[10px] text-gray-600">离屏</span>
        )}
      </div>
    </div>
  );
}
