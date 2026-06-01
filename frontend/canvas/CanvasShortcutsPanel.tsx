import React, { memo } from 'react';
import { CANVAS_SHORTCUT_HELP_ROWS } from './canvasShortcuts';

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18" />
    <line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

export type CanvasShortcutsPanelProps = {
  open: boolean;
  onClose: () => void;
};

export const CanvasShortcutsPanel = memo(function CanvasShortcutsPanel({
  open,
  onClose,
}: CanvasShortcutsPanelProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[205] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="canvas-chrome-150 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#444] bg-[#1a1a1a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
          <h2 className="text-base font-semibold text-white">快捷键</h2>
          <button
            type="button"
            className="rounded p-1 text-gray-400 transition-colors hover:bg-[#333] hover:text-white"
            title="关闭"
            onClick={onClose}
          >
            <XIcon size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <p className="mb-3 text-xs leading-relaxed text-gray-500">
            以下快捷键在画布区域生效；当焦点在<strong className="text-gray-400">输入框</strong>、
            <strong className="text-gray-400">文本域</strong>或<strong className="text-gray-400">下拉框</strong>
            内时，其中大部分不会拦截（各行括号内另有说明）。
          </p>
          <table className="w-full border-collapse text-left text-sm text-gray-200">
            <thead>
              <tr className="border-b border-[#333] text-gray-500">
                <th className="w-[38%] py-2 pr-3 font-medium">按键</th>
                <th className="py-2 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {CANVAS_SHORTCUT_HELP_ROWS.map((row) => (
                <tr key={row.combo} className="border-b border-[#2a2a2a]">
                  <td className="whitespace-nowrap py-2 pr-3 align-top font-mono text-xs text-cyan-200/95">
                    {row.combo}
                  </td>
                  <td className="py-2 align-top text-xs text-gray-300">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
