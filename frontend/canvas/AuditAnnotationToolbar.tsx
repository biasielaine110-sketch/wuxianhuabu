import React from 'react';

export type AuditAnnotationTool =
  | 'select'
  | 'inpaint'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'pen'
  | 'text'
  | 'fillRect'
  | 'fillCircle';

const COLOR_PRESETS = [
  '#ff6b6b',
  '#feca57',
  '#48dbfb',
  '#1dd1a1',
  '#ffffff',
  '#000000',
  '#ff9ff3',
  '#54a0ff',
];

const LINE_WIDTH_PRESETS = [1, 2, 3, 4, 6, 8, 12, 16, 24];

const TOOLS: { id: AuditAnnotationTool; label: string; title: string }[] = [
  { id: 'select', label: '↖', title: '选择标注 / 框选图片（Q）' },
  { id: 'inpaint', label: '✦', title: '局部重绘，框选区域（W）' },
  { id: 'rect', label: '□', title: '矩形框' },
  { id: 'fillRect', label: '▣', title: '填充矩形' },
  { id: 'circle', label: '○', title: '椭圆框' },
  { id: 'fillCircle', label: '◉', title: '填充椭圆' },
  { id: 'arrow', label: '→', title: '箭头' },
  { id: 'pen', label: '✎', title: '自由画笔' },
  { id: 'text', label: 'T', title: '文字标注' },
];

export interface AuditAnnotationToolbarProps {
  currentTool: AuditAnnotationTool;
  currentColor: string;
  currentFontSize: number;
  currentPenWidth: number;
  currentStrokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: AuditAnnotationTool) => void;
  onColorChange: (color: string) => void;
  onFontSizeChange: (size: number) => void;
  onPenWidthChange: (width: number) => void;
  onStrokeWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export function AuditAnnotationToolbar({
  currentTool,
  currentColor,
  currentFontSize,
  currentPenWidth,
  currentStrokeWidth,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onFontSizeChange,
  onPenWidthChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onClear,
}: AuditAnnotationToolbarProps) {
  const showDrawOptions = currentTool !== 'select' && currentTool !== 'inpaint';

  return (
    <div className="absolute top-4 left-4 z-[60] flex flex-col gap-2 max-w-[180px]">
      <div className="bg-[#1e1e1e]/95 backdrop-blur-md rounded-xl border border-[#333] p-2 shadow-2xl flex flex-col gap-2">
        <div className="text-[10px] text-gray-500 px-0.5">标注工具</div>
        <div className="grid grid-cols-4 gap-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onToolChange(tool.id)}
              className={`h-8 rounded text-[13px] font-medium transition-colors ${
                currentTool === tool.id
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#333] hover:bg-[#444] text-gray-300'
              }`}
              title={tool.title}
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onColorChange(c)}
              className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                currentColor === c ? 'border-amber-400 scale-110' : 'border-[#555]'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onColorChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-5 h-5 rounded cursor-pointer border border-[#555] bg-transparent p-0"
            title="自定义颜色"
          />
        </div>

        {showDrawOptions && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 px-0.5">画笔大小</span>
              <select
                className="w-full bg-[#2a2a2a] border border-[#444] rounded px-2 py-1 text-[11px] text-gray-300 outline-none"
                value={currentPenWidth}
                onChange={(e) => onPenWidthChange(Number(e.target.value))}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {LINE_WIDTH_PRESETS.map((px) => (
                  <option key={px} value={px}>
                    {px}px
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-500 px-0.5">形状线宽</span>
              <select
                className="w-full bg-[#2a2a2a] border border-[#444] rounded px-2 py-1 text-[11px] text-gray-300 outline-none"
                value={currentStrokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {LINE_WIDTH_PRESETS.map((px) => (
                  <option key={px} value={px}>
                    {px}px
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {currentTool === 'text' && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500 px-0.5">文字大小</span>
            <select
              className="w-full bg-[#2a2a2a] border border-[#444] rounded px-2 py-1 text-[11px] text-gray-300 outline-none"
              value={currentFontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {[12, 14, 16, 20, 24, 32, 48, 50].map((px) => (
                <option key={px} value={px}>
                  {px}px
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onUndo}
            disabled={!canUndo}
            className="flex-1 py-1 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-40"
            title="撤销 (Ctrl+Z)"
          >
            撤销
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRedo}
            disabled={!canRedo}
            className="flex-1 py-1 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-40"
            title="重做 (Ctrl+Shift+Z)"
          >
            重做
          </button>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClear}
          className="w-full py-1 rounded text-[10px] bg-red-900/60 hover:bg-red-800/80 text-red-200"
        >
          清除全部标注
        </button>

        <div className="text-[9px] text-gray-600 leading-snug px-0.5">
          {currentTool === 'inpaint'
            ? '拖拽框选 · 可拖动/缩放选区 · 确认后可「重新调整」'
            : '选择工具：拖动平移标注 · 角点缩放形状 · 空格/中键拖移画布'}
        </div>
      </div>
    </div>
  );
}
