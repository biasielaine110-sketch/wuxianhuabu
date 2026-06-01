const STORAGE_KEY = 'wxcanvas-text-node-font-size';
const DEFAULT = 40;
const MIN = 11;
const MAX = 50;

function readStored(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v != null) {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.max(MIN, Math.min(MAX, n));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

/** 文本节点默认字号（px） */
let textNodeFontSize = readStored();

export function getTextNodeFontSize(): number {
  return textNodeFontSize;
}

export function setTextNodeFontSizeValue(size: number): void {
  const next = Math.max(MIN, Math.min(MAX, size));
  textNodeFontSize = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
}

export const TEXT_NODE_FONT_SIZE_OPTIONS = [
  11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 50,
] as const;
