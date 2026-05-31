import React from 'react';

type NodeResizeHandlesProps = {
  nodeId: string;
  onBeginResize: (e: React.PointerEvent, nodeId: string, direction: string) => void;
};

/** 节点八向缩放手柄（选中时显示） */
export function NodeResizeHandles({ nodeId, onBeginResize }: NodeResizeHandlesProps) {
  const handle = (direction: string) => (e: React.PointerEvent) => onBeginResize(e, nodeId, direction);

  return (
    <>
      <div
        className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 cursor-nw-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('nw')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 cursor-ne-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('ne')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-4 h-4 cursor-sw-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('sw')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-4 h-4 cursor-se-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('se')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-3 cursor-n-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('n')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-6 h-3 cursor-s-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('s')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 cursor-w-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('w')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
      <div
        className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-6 cursor-e-resize z-40 group/resize"
        data-resize-handle
        onPointerDown={handle('e')}
      >
        <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
      </div>
    </>
  );
}
