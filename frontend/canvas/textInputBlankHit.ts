const HIT_PAD = 3;

const MIRROR_STYLE_KEYS = [
  'boxSizing',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'font',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'wordSpacing',
  'lineHeight',
  'textIndent',
  'textTransform',
  'tabSize',
  'wordBreak',
  'overflowWrap',
] as const;

function pointHitsRects(rects: DOMRectList | ArrayLike<DOMRect>, x: number, y: number): boolean {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (
      x >= r.left - HIT_PAD &&
      x <= r.right + HIT_PAD &&
      y >= r.top - HIT_PAD &&
      y <= r.bottom + HIT_PAD
    ) {
      return true;
    }
  }
  return false;
}

function collectTextClientRects(root: HTMLElement): DOMRect[] {
  const out: DOMRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const parent = n.parentElement;
    if (parent?.classList.contains('text-gray-500')) continue;
    if (!n.textContent) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i += 1) out.push(rects[i]);
  }
  return out;
}

function isTextareaBlankHit(ta: HTMLTextAreaElement, clientX: number, clientY: number): boolean {
  if (!ta.value) return true;
  const taRect = ta.getBoundingClientRect();
  const cs = getComputedStyle(ta);
  const sx = ta.offsetWidth ? taRect.width / ta.offsetWidth : 1;
  const sy = ta.offsetHeight ? taRect.height / ta.offsetHeight : 1;
  const hitX = (clientX - taRect.left) / sx + ta.scrollLeft;
  const hitY = (clientY - taRect.top) / sy + ta.scrollTop;
  const mirror = document.createElement('div');
  for (const key of MIRROR_STYLE_KEYS) {
    (mirror.style as unknown as Record<string, string>)[key] = cs[key];
  }
  mirror.style.position = 'absolute';
  mirror.style.left = '-99999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflow = 'hidden';
  mirror.style.boxSizing = 'border-box';
  mirror.style.width = `${ta.offsetWidth}px`;
  mirror.textContent = ta.value;
  document.body.appendChild(mirror);
  try {
    const origin = mirror.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(mirror);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      const x = r.left - origin.left;
      const y = r.top - origin.top;
      if (
        hitX >= x - HIT_PAD &&
        hitX <= x + r.width + HIT_PAD &&
        hitY >= y - HIT_PAD &&
        hitY <= y + r.height + HIT_PAD
      ) {
        return false;
      }
    }
    return true;
  } finally {
    mirror.remove();
  }
}

/**
 * 指针是否落在文本排版之外的空白（含底边、行尾空隙、占位提示），不含滚动条判定。
 */
export function isTextInputBlankHit(el: HTMLElement, clientX: number, clientY: number): boolean {
  if (el instanceof HTMLTextAreaElement) {
    return isTextareaBlankHit(el, clientX, clientY);
  }
  if (el.querySelector(':scope > span.text-gray-500')) return true;
  const rects = collectTextClientRects(el);
  if (!rects.length) return true;
  return !pointHitsRects(rects, clientX, clientY);
}
