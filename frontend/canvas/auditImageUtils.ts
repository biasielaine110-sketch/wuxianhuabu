/** 根据 base64 魔数字节识别真实的图片 MIME 类型 */
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

/** 将纯 base64 转换为带正确 MIME 类型的 data URL */
export function base64ToImageDataUrl(raw: string): string {
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '');
  return `data:${sniffImageMimeFromBase64(cleaned)};base64,${cleaned}`;
}
