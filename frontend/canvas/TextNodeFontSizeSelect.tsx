import React, { memo } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { TEXT_NODE_FONT_SIZE_OPTIONS } from './textNodeFontSize';

/** 自订阅 store，供 renderNode 内使用，避免 App 因字号变更重渲染 */
export const TextNodeFontSizeSelect = memo(function TextNodeFontSizeSelect() {
  const textNodeFontSize = useCanvasStore((s) => s.textNodeFontSize);
  const setTextNodeFontSize = useCanvasStore((s) => s.setTextNodeFontSize);

  return (
    <select
      className="ml-2 bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-[30px] text-gray-200 outline-none focus:border-blue-500"
      value={textNodeFontSize}
      onChange={(e) => setTextNodeFontSize(Number(e.target.value))}
      onPointerDown={(e) => e.stopPropagation()}
      title="文本节点字号"
    >
      {TEXT_NODE_FONT_SIZE_OPTIONS.map((px) => (
        <option key={px} value={px}>
          {px}px
        </option>
      ))}
    </select>
  );
});
