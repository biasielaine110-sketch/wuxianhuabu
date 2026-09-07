/** 常见视频扩展名（含 QuickTime .mov） */
export const VIDEO_EXT_RE =
  /\.(mp4|webm|mov|mkv|avi|m4v|ogv|ogg|mpeg|mpg|3gp|qt)(\?|#|$)/i;

export function guessVideoMimeFromName(nameOrUrl: string): string {
  const path = (nameOrUrl || '').trim().split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov') || path.endsWith('.qt')) return 'video/quicktime';
  if (path.endsWith('.mkv')) return 'video/x-matroska';
  if (path.endsWith('.avi')) return 'video/x-msvideo';
  if (path.endsWith('.m4v')) return 'video/x-m4v';
  if (path.endsWith('.mp4')) return 'video/mp4';
  if (path.endsWith('.ogv') || path.endsWith('.ogg')) return 'video/ogg';
  if (path.endsWith('.mpeg') || path.endsWith('.mpg')) return 'video/mpeg';
  if (path.endsWith('.3gp')) return 'video/3gpp';
  return 'video/mp4';
}

export function guessVideoExtFromMimeOrUrl(mimeOrUrl: string, fallbackUrl = ''): string {
  const t = (mimeOrUrl || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime') || t.includes('.mov') || t.endsWith('mov')) return 'mov';
  if (t.includes('matroska') || t.includes('.mkv')) return 'mkv';
  if (t.includes('x-msvideo') || t.includes('.avi')) return 'avi';
  if (t.includes('ogg') || t.includes('.ogv')) return 'ogv';
  if (t.includes('mpeg') || t.includes('.mpg')) return 'mpg';
  if (t.includes('3gpp') || t.includes('.3gp')) return '3gp';
  if (t.includes('m4v') || t.includes('.m4v')) return 'm4v';
  if (t.includes('mp4') || t.includes('.mp4')) return 'mp4';
  const fromUrl = guessVideoMimeFromName(fallbackUrl || mimeOrUrl);
  if (fromUrl === 'video/quicktime') return 'mov';
  if (fromUrl === 'video/webm') return 'webm';
  if (fromUrl === 'video/x-matroska') return 'mkv';
  if (fromUrl === 'video/x-msvideo') return 'avi';
  if (fromUrl === 'video/ogg') return 'ogv';
  if (fromUrl === 'video/mpeg') return 'mpg';
  if (fromUrl === 'video/3gpp') return '3gp';
  if (fromUrl === 'video/x-m4v') return 'm4v';
  return 'mp4';
}

/** 是否为可导入的视频文件（MIME 或扩展名；兼容 Windows 下 .mov 空类型） */
export function isVideoFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  if (mime === 'application/octet-stream' || mime === 'application/mp4' || !mime) {
    return VIDEO_EXT_RE.test(file.name);
  }
  return VIDEO_EXT_RE.test(file.name);
}

/** 纠正缺失/错误的 MIME（尤其是 .mov → video/quicktime），便于 <video> 识别 */
export function normalizeVideoFile(file: File): File {
  const mime = (file.type || '').toLowerCase();
  const guessed = guessVideoMimeFromName(file.name);
  if (mime.startsWith('video/') && mime !== 'application/mp4') {
    // 已有明确 video/*，但扩展名是 mov 且被标成 video/mp4 时仍纠正
    if ((file.name.toLowerCase().endsWith('.mov') || file.name.toLowerCase().endsWith('.qt'))
      && mime !== 'video/quicktime') {
      return new File([file], file.name, { type: 'video/quicktime', lastModified: file.lastModified });
    }
    return file;
  }
  if (guessed && guessed !== mime) {
    return new File([file], file.name, { type: guessed, lastModified: file.lastModified });
  }
  return file;
}

export function createVideoObjectUrl(file: File): string {
  return URL.createObjectURL(normalizeVideoFile(file));
}

/** 根据响应 Content-Type 与原始 URL 推断最终 Blob MIME */
export function resolveVideoBlobMime(contentType: string | null | undefined, sourceUrl: string): string {
  const raw = (contentType || '').split(';')[0].trim().toLowerCase();
  if (raw.startsWith('video/')) return raw;
  return guessVideoMimeFromName(sourceUrl);
}
