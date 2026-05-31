import React from 'react';
import type { CanvasNode } from '../types';
import { getNodeBorderClass, getNodeDisplayMeta } from './nodeMeta';

export type NodePlaceholderProps = {
  node: CanvasNode;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  /** offscreen=视口外；webgl-inactive=视口内但未获 3D 引擎配额 */
  hint?: 'offscreen' | 'webgl-inactive' | null;
};

/** 视口外节点的轻量占位，不挂载 Three.js / 聊天 / textarea 等重型内容 */
export function NodePlaceholder({ node, isSelected, onPointerDown, hint = 'offscreen' }: NodePlaceholderProps) {
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
      <div className="absolute -top-[calc(7rem-30px)] left-3 z-30 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
        <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
        <span className="canvas-node-window-title font-medium">{meta.title}</span>
      </div>
      <div className="flex-1 flex items-center justify-center pointer-events-none px-3 text-center">
        {node.isGenerating ? (
          <span className="text-xs text-gray-500 animate-pulse">生成中…</span>
        ) : hint === 'webgl-inactive' ? (
          <span className="text-[10px] text-cyan-600/80 leading-snug">3D 引擎占用中<br />选中此节点以激活</span>
        ) : (
          <span className="text-[10px] text-gray-600">离屏</span>
        )}
      </div>
    </div>
  );
}
