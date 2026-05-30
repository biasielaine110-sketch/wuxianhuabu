/** AI 对话节点界面文字缩放与字号存盘 */
export const CHAT_PANEL_FONT_SCALE = 2.925;
export const CHAT_NODE_DEFAULT_PIXEL_HEIGHT = 1840;
export const CHAT_FONT_LS_KEY = 'wxcanvas-chat-font-px';

export function clampChatFontPx(n: number): number {
  if (!Number.isFinite(n)) return 14;
  return Math.min(22, Math.max(11, Math.round(n)));
}

export function readStoredChatFontPx(): number {
  if (typeof window === 'undefined') return 14;
  try {
    const raw = localStorage.getItem(CHAT_FONT_LS_KEY);
    if (raw == null || raw === '') return 14;
    return clampChatFontPx(parseInt(raw, 10));
  } catch {
    return 14;
  }
}

/** 识别 base64 魔数，生成 data URL 时使用 */
export function sniffImageMimeFromBase64(raw: string): string {
  if (!raw || raw.length < 8) return 'image/png';
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '');
  try {
    const dec = atob(cleaned.slice(0, 48));
    const a = dec.charCodeAt(0);
    const b = dec.charCodeAt(1);
    if (a === 0xff && b === 0xd8) return 'image/jpeg';
    if (a === 0x89 && b === 0x50) return 'image/png';
    if (a === 0x47 && b === 0x49) return 'image/gif';
    if (a === 0x52 && b === 0x49 && dec.startsWith('RIFF')) return 'image/webp';
  } catch {
    /* ignore */
  }
  return 'image/png';
}

export function messageDisplayImages(msg: { image?: string; images?: string[] }): string[] {
  const raw = msg.images?.length ? msg.images : msg.image ? [msg.image] : [];
  return raw.filter((im) => !!im && im.length > 80);
}
