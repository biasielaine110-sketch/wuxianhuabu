import React from 'react';
import type { CanvasNode } from '../types';
import { getNodeInputPortTitle } from './nodeInputPortTitle';
import { NodeResizeHandles } from './NodeResizeHandles';

export type CanvasNodeShellProps = {
  node: CanvasNode;
  isSelected: boolean;
  borderColor: string;
  shadowColor: string;
  headerIcon: React.ReactNode;
  headerTitle: string;
  hasInputPort: boolean;
  hasOutputPort?: boolean;
  eyedropperTargetNodeId: string | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onPortPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onBeginResize: (e: React.PointerEvent, nodeId: string, direction: string) => void;
  children: React.ReactNode;
};

/** 节点外层壳：定位、标题、连线端口、缩放手柄、内容区 */
export function CanvasNodeShell({
  node,
  isSelected,
  borderColor,
  shadowColor,
  headerIcon,
  headerTitle,
  hasInputPort,
  hasOutputPort = true,
  eyedropperTargetNodeId,
  onPointerDown,
  onDoubleClick,
  onPortPointerDown,
  onBeginResize,
  children,
}: CanvasNodeShellProps) {
  const rootClass = [
    'absolute flex flex-col bg-[#1e1e1e] rounded-[20px] border-8 shadow-2xl transition-shadow',
    borderColor,
    shadowColor,
    isSelected ? 'z-20' : 'z-10 hover:border-[#555]',
    node.type === 'chat' ? 'canvas-node-root--chat' : 'canvas-node-font-195',
    node.type === 'annotation' ? 'canvas-node-annotation' : '',
    node.type === 'gridSplit' || node.type === 'gridMerge' ? 'canvas-node-grid-tool-150' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      key={node.id}
      data-node-root="true"
      data-node-id={node.id}
      data-selected={isSelected ? 'true' : 'false'}
      className={rootClass}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="absolute -top-[calc(7rem-30px)] left-3 z-30 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
        {headerIcon}
        <span className="canvas-node-window-title font-medium">{headerTitle}</span>
      </div>

      {hasInputPort && (
        <div
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#333] border-2 border-[#666] rounded-full z-30 group/port hover:border-green-400 hover:bg-green-500 transition-all cursor-crosshair"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPortPointerDown(e, node.id);
          }}
          title={getNodeInputPortTitle(node.type)}
        />
      )}

      {hasOutputPort && (
        <div
          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-[#555] border-2 border-[#888] hover:border-blue-400 hover:bg-blue-500 hover:scale-150 transition-all rounded-full cursor-crosshair z-30 group/port"
          onPointerDown={(e) => onPortPointerDown(e, node.id)}
          title="拖拽连线到其他节点"
        >
          <div className="absolute inset-0 rounded-full bg-blue-400 opacity-0 group-hover/port:opacity-50 animate-ping" />
        </div>
      )}

      {isSelected && <NodeResizeHandles nodeId={node.id} onBeginResize={onBeginResize} />}

      <div
        className={`flex-1 flex flex-col relative rounded-b-xl min-h-0 overflow-hidden ${eyedropperTargetNodeId ? 'cursor-crosshair' : 'bg-[#1a1a1a]'}`}
        style={{ backgroundColor: eyedropperTargetNodeId ? undefined : '#1a1a1a' }}
      >
        {children}
      </div>
    </div>
  );
}
