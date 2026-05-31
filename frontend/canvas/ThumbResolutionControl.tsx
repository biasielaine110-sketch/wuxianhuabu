import React, { useEffect, useRef, useState } from 'react';

const OPTIONS = [5, 10, 20, 50, 70, 100] as const;

export function ThumbResolutionControl({
  value,
  onChange,
  hidden = false,
}: {
  value: number;
  onChange: (percent: number) => void;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [open]);

  if (hidden) return null;

  return (
    <div
      ref={rootRef}
      className="absolute top-6 right-6 z-40 flex items-center gap-1.5 rounded-xl border border-[#333] bg-[#1e1e1e]/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md pointer-events-auto select-auto"
      style={{ userSelect: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] text-gray-400 whitespace-nowrap select-none">预览</span>
      <div className="relative">
        <button
          type="button"
          className="min-w-[3.25rem] rounded border border-[#444] bg-[#333] px-2 py-0.5 text-[11px] text-gray-200 outline-none hover:border-[#666] hover:bg-[#3a3a3a] cursor-pointer select-none"
          title="预览图分辨率（影响所有缩略图质量）"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {value}%
        </button>
        {open && (
          <div
            role="listbox"
            className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[4.5rem] overflow-hidden rounded-lg border border-[#444] bg-[#252525] py-1 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {OPTIONS.map((pct) => (
              <button
                key={pct}
                type="button"
                role="option"
                aria-selected={value === pct}
                className={`block w-full px-3 py-1.5 text-left text-[11px] transition-colors ${
                  value === pct
                    ? 'bg-blue-600/80 text-white'
                    : 'text-gray-200 hover:bg-[#333]'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (pct !== value) onChange(pct);
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
