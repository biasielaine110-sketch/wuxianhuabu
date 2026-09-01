import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CopyIcon, PasteIcon } from './canvasIcons';
import {
  captureTextPasteTarget,
  getDomSelectedText,
  pastePendingTextFromClipboard,
  setPendingTextPasteTarget,
} from './domTextSelection';

export type TextEditContextMenuState = {
  x: number;
  y: number;
  selectedText?: string;
  canPaste: boolean;
};

/** 弹出文本编辑框 / 输入框右键：复制 + 粘贴 */
export function TextEditContextMenu({
  menu,
  onClose,
}: {
  menu: TextEditContextMenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: PointerEvent | MouseEvent) => {
      if ((e as MouseEvent).button === 2) return;
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
      setPendingTextPasteTarget(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('mousedown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('mousedown', close, true);
    };
  }, [onClose]);

  if (!menu.selectedText && !menu.canPaste) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[10050] bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[140px] overflow-hidden"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.selectedText ? (
        <button
          type="button"
          className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-emerald-600 hover:text-white flex items-center gap-2"
          onPointerDown={() => {
            const text = menu.selectedText;
            if (text) void navigator.clipboard.writeText(text);
            onClose();
            setPendingTextPasteTarget(null);
          }}
        >
          <CopyIcon size={14} /> 复制
        </button>
      ) : null}
      {menu.canPaste ? (
        <button
          type="button"
          className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-emerald-600 hover:text-white flex items-center gap-2"
          onPointerDown={() => {
            void pastePendingTextFromClipboard().finally(() => {
              onClose();
              setPendingTextPasteTarget(null);
            });
          }}
        >
          <PasteIcon size={14} /> 粘贴
        </button>
      ) : null}
    </div>,
    document.body
  );
}

/** 在 textarea 上绑定：拦截右键，弹出复制/粘贴，并阻止冒泡到画布菜单 */
export function useOverlayTextEditContextMenu() {
  const [menu, setMenu] = useState<TextEditContextMenuState | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
    setPendingTextPasteTarget(null);
  }, []);

  const onTextAreaContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selectedRaw = getDomSelectedText(e.target);
    const pasteTarget = captureTextPasteTarget(e.target);
    setPendingTextPasteTarget(pasteTarget);
    if (!selectedRaw && !pasteTarget) {
      setMenu(null);
      return;
    }
    setMenu({
      x: e.clientX,
      y: e.clientY,
      selectedText: selectedRaw.length > 0 ? selectedRaw : undefined,
      canPaste: !!pasteTarget,
    });
  }, []);

  const menuNode = menu ? <TextEditContextMenu menu={menu} onClose={closeMenu} /> : null;

  return { onTextAreaContextMenu, menuNode, closeMenu };
}
