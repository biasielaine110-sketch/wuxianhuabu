import React, { memo } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { EyedropperIcon } from './canvasIcons';

/** 吸管模式提示层：内部订阅 store，避免 App 因吸管状态重渲染 */
export const CanvasEyedropperOverlay = memo(function CanvasEyedropperOverlay() {
  const eyedropperTargetNodeId = useCanvasStore((s) => s.eyedropperTargetNodeId);
  if (!eyedropperTargetNodeId) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }}>
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-cyan-600 text-white text-xs font-medium rounded-lg shadow-lg flex items-center gap-2 pointer-events-auto canvas-chrome-150"
        style={{ zIndex: 100 }}
      >
        <EyedropperIcon size={14} /> 点击节点连线吸取 · 快捷键 X · ESC 取消
      </div>
    </div>
  );
});
