const STYLE_PROPS = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
] as const;

export type TextareaCaretViewport = {
  top: number;
  left: number;
  height: number;
};

/** 文本域光标在视口中的位置（含画布缩放与滚动） */
export function getTextareaCaretViewport(
  el: HTMLTextAreaElement,
  position: number
): TextareaCaretViewport {
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const key of STYLE_PROPS) {
    (mirror.style as unknown as Record<string, string>)[key] = cs[key as keyof CSSStyleDeclaration] as string;
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-99999px';
  mirror.style.width = cs.width && cs.width !== 'auto' ? cs.width : `${el.clientWidth}px`;

  const before = el.value.slice(0, Math.max(0, position));
  mirror.textContent = before;
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  try {
    const taRect = el.getBoundingClientRect();
    const sx = el.offsetWidth ? taRect.width / el.offsetWidth : 1;
    const sy = el.offsetHeight ? taRect.height / el.offsetHeight : 1;
    const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const localX = marker.offsetLeft - el.scrollLeft;
    const localY = marker.offsetTop - el.scrollTop;
    const lineH = marker.offsetHeight || parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) || 16;
    return {
      left: taRect.left + (localX + borderLeft) * sx,
      top: taRect.top + (localY + borderTop) * sy,
      height: lineH * sy,
    };
  } finally {
    mirror.remove();
  }
}

export function clampFixedMenuPos(
  caret: TextareaCaretViewport,
  menuW: number,
  menuH: number,
  gap = 4
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = caret.top + caret.height + gap;
  if (top + menuH > vh - 8) {
    top = caret.top - menuH - gap;
  }
  top = Math.max(8, Math.min(top, vh - menuH - 8));
  let left = caret.left;
  left = Math.max(8, Math.min(left, vw - menuW - 8));
  return { top, left };
}
