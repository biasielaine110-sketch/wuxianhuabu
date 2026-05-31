import React from 'react';
import type { CanvasNode } from '../types';
import { getNodeBorderClass, getNodeDisplayMeta } from './nodeMeta';
import { getNodeInputPortTitle } from './nodeInputPortTitle';
import { NodeResizeHandles } from './NodeResizeHandles';

export type NodePlaceholderProps = {
  node: CanvasNode;
  isSelected: boolean;
  hasInputPort?: boolean;
  hasOutputPort?: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onPortPointerDown?: (e: React.PointerEvent, nodeId: string) => void;
  onBeginResize?: (e: React.PointerEvent, nodeId: string, direction: string) => void;
  /** offscreen=视口外；webgl-inactive=视口内但未获 3D 引擎配额 */
  hint?: 'offscreen' | 'webgl-inactive' | null;
};

/** 视口外节点的轻量占位，不挂载 Three.js / 聊天 / textarea 等重型内容 */
export function NodePlaceholder({
  node,
  isSelected,
  hasInputPort = false,
  hasOutputPort = true,
  onPointerDown,
  onPortPointerDown,
  onBeginResize,
  hint = 'offscreen',
}: NodePlaceholderProps) {
  const meta = getNodeDisplayMeta(node.type, isSelected);
  const borderColor = getNodeBorderClass(node.type, isSelected);

  return (
    <div
      key={node.id}
      data-node-root="true"
      data-node-id={node.id}
      data-selected={isSelected ? 'true' : 'false'}
      data-node-placeholder="true"
      className={`absolute flex flex-col bg-[#1a1a1a] rounded-[20px] border-8 shadow-xl ${borderColor} ${isSelected ? 'z-20 ring-2 ring-blue-400/40' : 'z-10'}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        opacity: isSelected ? 1 : 0.82,
      }}
      onPointerDown={(e) => onPointerDown(e, node.id)}
    >
      <div className="absolute -top-[calc(7rem-30px)] left-3 z-30 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
        <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
        <span className="canvas-node-window-title font-medium">{meta.title}</span>
      </div>

      {hasInputPort && onPortPointerDown && (
        <div
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#333] border-2 border-[#666] rounded-full z-30 hover:border-green-400 hover:bg-green-500 transition-all cursor-crosshair"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPortPointerDown(e, node.id);
          }}
          title={getNodeInputPortTitle(node.type)}
        />
      )}

      {hasOutputPort && onPortPointerDown && (
        <div
          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-[#555] border-2 border-[#888] hover:border-blue-400 hover:bg-blue-500 hover:scale-150 transition-all rounded-full cursor-crosshair z-30"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPortPointerDown(e, node.id);
          }}
          title="拖出连线"
        />
      )}

      <div className="flex-1 flex items-center justify-center pointer-events-none px-3 text-center">
        {node.isGenerating ? (
          <span className="text-xs text-gray-500 animate-pulse">生成中…</span>
        ) : hint === 'webgl-inactive' ? (
          <span className="text-[10px] text-cyan-600/80 leading-snug">3D 引擎占用中<br />点击选中以激活</span>
        ) : (
          <span className="text-[10px] text-gray-600">离屏预览</span>
        )}
      </div>

      {isSelected && onBeginResize && <NodeResizeHandles nodeId={node.id} onBeginResize={onBeginResize} />}
    </div>
  );
}
