import { getCanvasAssetBlobUrl } from './canvasAssetStore';
import { getCodesonlineSavedKey } from './aiSettings';

const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** 将外部 CDN/API 图片 URL 改写为同源代理，避免浏览器 CORS 导致预览失败 */
export function rewriteImageUrlForBrowserDisplay(imageUrl: string): string {
  if (typeof window === 'undefined') return imageUrl;
  try {
    const u = new URL(imageUrl);
    const { origin } = window.location;
    const host = u.hostname.toLowerCase();
    if (host === 'image.codesonline.dev') {
      return `${origin}/codesonline-image-api${u.pathname}${u.search}`;
    }
    if (host === 'ai.codesonline.dev') {
      return `${origin}/codesonline-chat-api${u.pathname}${u.search}`;
    }
    if (host === 'yunzhi-ai.top') {
      const prefix = import.meta.env.DEV ? '/yunzhi-openai' : '/api/yunzhi-proxy';
      return `${origin}${prefix}${u.pathname}${u.search}`;
    }
    if (host === 'files.toapis.com') {
      return `${origin}/cdn-files-toapis${u.pathname}${u.search}`;
    }
    if (host === 'files.dashlyai.cc') {
      return `${origin}/cdn-files-dashlyai${u.pathname}${u.search}`;
    }
    if (host === 'manxueapi.com' || host.endsWith('.manxueapi.com')) {
      return `${origin}/manxue-api${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return imageUrl;
}

export async function getCanvasAssetUrl(assetId: string): Promise<string | null> {
  const cached = urlCache.get(assetId);
  if (cached) return cached;

  const inflight = pending.get(assetId);
  if (inflight) return inflight;

  const promise = getCanvasAssetBlobUrl(assetId).then((url) => {
    pending.delete(assetId);
    if (url) urlCache.set(assetId, url);
    return url;
  });
  pending.set(assetId, promise);
  return promise;
}

export function revokeCanvasAssetUrl(assetId: string): void {
  const url = urlCache.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(assetId);
  }
}

export function clearCanvasAssetUrlCache(): void {
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  pending.clear();
}

/** 从显示 URL 提取 raw base64（供下载/标注等） */
export async function imageSrcToRawBase64(
  src: string
): Promise<{ base64: string; mime: string } | null> {
  if (!src) return null;
  if (src.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(src);
    if (match) return { mime: match[1], base64: match[2] };
    return null;
  }
  if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const fetchUrl = src.startsWith('http') ? rewriteImageUrlForBrowserDisplay(src) : src;
      const headers: Record<string, string> = {};
      if (src.startsWith('http')) {
        try {
          const host = new URL(src).hostname.toLowerCase();
          if (host === 'image.codesonline.dev') {
            const key = getCodesonlineSavedKey().trim();
            if (key) headers.Authorization = `Bearer ${key}`;
          }
        } catch {
          /* ignore */
        }
      }
      const resp = await fetch(fetchUrl, { headers });
      const blob = await resp.blob();
      const mime = blob.type || 'image/jpeg';
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { base64: btoa(binary), mime };
    } catch {
      return null;
    }
  }
  return { base64: src, mime: 'image/jpeg' };
}

function mimeToProbeFormatLabel(mime: string): string {
  if (mime.includes('png')) return 'PNG';
  if (mime.includes('webp')) return 'WebP';
  if (mime.includes('gif')) return 'GIF';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPEG';
  return mime.replace(/^image\//, '').toUpperCase() || '未知';
}

/** 全屏预览信息栏：拉取图片并解析宽高、体积、格式 */
export async function probeImageDisplayMetadata(
  imageSrc: string
): Promise<{ width: number; height: number; fileSize: number; formatLabel: string } | null> {
  if (!imageSrc) return null;

  const displaySrc =
    imageSrc.startsWith('http://') ||
    imageSrc.startsWith('https://') ||
    imageSrc.startsWith('data:') ||
    imageSrc.startsWith('blob:')
      ? imageSrc
      : `data:image/jpeg;base64,${imageSrc.replace(/\s/g, '')}`;

  const fromBlob = async (blob: Blob, formatHint?: string) => {
    const bitmap = await createImageBitmap(blob);
    const meta = {
      width: bitmap.width,
      height: bitmap.height,
      fileSize: blob.size,
      formatLabel: mimeToProbeFormatLabel(formatHint || blob.type || 'image/jpeg'),
    };
    bitmap.close();
    return meta;
  };

  try {
    if (displaySrc.startsWith('blob:') || displaySrc.startsWith('http')) {
      const fetchUrl = displaySrc.startsWith('http')
        ? rewriteImageUrlForBrowserDisplay(displaySrc)
        : displaySrc;
      const resp = await fetch(fetchUrl);
      if (!resp.ok) throw new Error(`fetch ${resp.status}`);
      return fromBlob(await resp.blob());
    }
    if (displaySrc.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(displaySrc);
      const resp = await fetch(displaySrc);
      const blob = await resp.blob();
      return fromBlob(blob, match?.[1]);
    }
    const raw = await imageSrcToRawBase64(displaySrc);
    if (!raw?.base64) return null;
    const dataUrl = `data:${raw.mime};base64,${raw.base64}`;
    const resp = await fetch(dataUrl);
    return fromBlob(await resp.blob(), raw.mime);
  } catch {
    try {
      const raw = await imageSrcToRawBase64(displaySrc);
      if (!raw?.base64) return null;
      const clean = raw.base64.replace(/\s/g, '');
      return {
        width: 0,
        height: 0,
        fileSize: Math.ceil(clean.length * 3 / 4),
        formatLabel: mimeToProbeFormatLabel(raw.mime),
      };
    } catch {
      return null;
    }
  }
}

/** 节点 images[i] 是否有可显示内容（含 offload 后仅 assetId 的情况） */
export function hasCanvasImagePayload(base64?: string, assetId?: string): boolean {
  return (!!base64 && base64.length > 80) || !!(assetId && assetId.length > 0);
}

export function countNodeImageSlots(images?: string[], assetIds?: string[]): number {
  const len = Math.max(images?.length ?? 0, assetIds?.length ?? 0);
  let count = 0;
  for (let i = 0; i < len; i++) {
    if (hasCanvasImagePayload(images?.[i], assetIds?.[i])) count++;
  }
  return count;
}

/** 复制到新图片节点时保留 base64 或 assetId 引用（offload 后仍可显示） */
export function cloneImageSlotForNewNode(
  base64?: string,
  assetId?: string
): { images: string[]; imageAssetIds?: string[] } | null {
  if (!hasCanvasImagePayload(base64, assetId)) return null;
  if (base64 && base64.length > 80) {
    return { images: [base64] };
  }
  if (assetId) {
    return { images: [''], imageAssetIds: [assetId] };
  }
  return null;
}

/** 优先 base64，否则从 assetId 解析 Blob URL */
export async function resolveCanvasImageSource(
  base64: string | undefined,
  assetId: string | undefined
): Promise<string> {
  if (base64 && base64.length > 80) {
    if (base64.startsWith('data:') || base64.startsWith('blob:')) {
      return base64;
    }
    if (base64.startsWith('http')) {
      return rewriteImageUrlForBrowserDisplay(base64);
    }
    const mime = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${base64}`;
  }
  if (assetId) {
    const url = await getCanvasAssetUrl(assetId);
    if (url) return url;
  }
  return '';
}
