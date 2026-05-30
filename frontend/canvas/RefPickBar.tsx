import React from 'react';
import type { IncomingRefSlot } from '../referenceSlots';
export function RefPickBar({
  slots,
  disabled,
  onInsert,
  uiScale = 1,
}: {
  slots: IncomingRefSlot[];
  disabled?: boolean;
  onInsert: (token: string) => void;
  /** 仅 AI 对话节点传 CHAT_PANEL_FONT_SCALE；其它节点默认 1 */
  uiScale?: number;
}) {
  if (!slots.length) return null;
  const sp = (px: number) => Math.round(px * uiScale);
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pt-1.5 pb-1" style={{ fontSize: sp(11) }}>
      <span className="text-gray-500 shrink-0 font-medium">引用参考:</span>
      {slots.map((s) => (
        <button
          key={`${s.edgeId}-r${s.n}-${s.kind}`}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onInsert(`@R${s.n}`);
          }}
          className="rounded-lg border border-cyan-800/60 bg-cyan-950/40 px-2 py-1 font-semibold text-cyan-200 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-35 text-xs"
          title={s.label}
        >
          @R{s.n}
        </button>
      ))}
      <span className="text-gray-600 leading-snug">点击插入 / 键盘输入 @R</span>
    </div>
  );
}
