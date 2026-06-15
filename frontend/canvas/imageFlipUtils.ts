import { getCanvasAssetRecord, putCanvasAssetFromBase64 } from '../services/canvasAssetStore';

/**
 * 把一张图片水平翻转（左右镜像）。
 * 支持 base64（纯 base64 或 data URI） / blob / assetId。
 * 返回新的 base64 + mime（无 data URI 前缀）。
 */
export class FlipError extends Error {
  /** 'no-source'：没有可用原图（既无 base64 也无 assetId） */
  /** 'asset-missing'：有 assetId 但 IDB 中找不到对应记录 */
  /** 'decode-failed'：createImageBitmap 解码失败 */
  /** 'canvas-failed'：canvas toDataURL 失败 */
  constructor(public reason: 'no-source' | 'asset-missing' | 'decode-failed' | 'canvas-failed', message?: string) {
    super(message ?? reason);
  }
}

export async function flipImageHorizontal(input: {
  base64?: string;
  assetId?: string;
}): Promise<{ base64: string; mime: string } | null> {
  // 1) 解析出 Blob
  let blob: Blob | null = null;
  let rawBase64: string | null = null;
  let mime = 'image/jpeg';
  let assetIdMissing = false;

  if (input.base64 && input.base64.length > 80) {
    rawBase64 = input.base64;
    // 节点 images[] / sourceImage / panoramaImage 存的是 raw base64（去 data URI 前缀）
    // 推断 mime（粗略）：从 base64 头字节读
    mime = sniffImageMimeFromBase64(rawBase64) ?? 'image/jpeg';
  } else if (input.assetId) {
    const rec = await getCanvasAssetRecord(input.assetId);
    if (rec?.blob) {
      blob = rec.blob;
      mime = rec.mime || blob.type || 'image/jpeg';
    } else {
      assetIdMissing = true;
    }
  }

  if (!blob && rawBase64) {
    blob = base64ToBlob(rawBase64, mime);
  }
  if (!blob) {
    if (assetIdMissing) {
      throw new FlipError('asset-missing', '原图资产在 IndexedDB 中已失效');
    }
    if (rawBase64) {
      // 有 base64 但 base64ToBlob / 解码失败
      throw new FlipError('decode-failed', '原图 base64 解码失败');
    }
    throw new FlipError('no-source', '未提供原图 base64 或 assetId');
  }

  // 2) 画到 canvas，水平翻转，再 toDataURL
  let bitmap: ImageBitmap;
  try {
    bitmap = await blobToBitmap(blob);
  } catch (e) {
    throw new FlipError('decode-failed', `ImageBitmap 解码失败：${e instanceof Error ? e.message : String(e)}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new FlipError('canvas-failed', 'Canvas 2D 上下文不可用');
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
  bitmap.close?.();

  const dataUrl = canvas.toDataURL(mime);
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new FlipError('canvas-failed', 'canvas.toDataURL 未返回有效 data URL');
  return { base64: m[2], mime: m[1] };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  // createImageBitmap 在现代浏览器都支持；若失败回退 HTMLImageElement
  try {
    return await createImageBitmap(blob);
  } catch {
    return await new Promise<ImageBitmap>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        // 用 canvas 中转
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cctx = c.getContext('2d');
        if (!cctx) {
          reject(new Error('canvas 2d 不可用'));
          return;
        }
        cctx.drawImage(img, 0, 0);
        createImageBitmap(c).then(resolve).catch(reject);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error('图片加载失败'));
      };
      img.src = url;
    });
  }
}

/** 从 base64 头字节粗略推断 mime */
function sniffImageMimeFromBase64(b64: string): string | null {
  // base64 头几个字符 → 文件签名
  // PNG: iVBORw0KGgo
  // JPEG: /9j/
  // GIF: R0lGOD
  // WebP: UklGR
  const head = b64.slice(0, 16);
  if (head.startsWith('iVBORw0KGgo')) return 'image/png';
  if (head.startsWith('/9j/')) return 'image/jpeg';
  if (head.startsWith('R0lGOD')) return 'image/gif';
  if (head.startsWith('UklGR')) return 'image/webp';
  return null;
}

/** 翻转后写回 IDB 资产库（如果原图有 assetId）。失败时抛出 FlipError。 */
export async function flipAndStoreAsset(input: {
  base64?: string;
  assetId?: string;
}): Promise<{ base64: string; assetId?: string }> {
  const flipped = await flipImageHorizontal(input);
  if (!flipped) {
    // 理论上 flipImageHorizontal 失败时会抛 FlipError；这里兜底
    throw new FlipError('decode-failed', '翻转失败：flipImageHorizontal 返回 null');
  }
  const out: { base64: string; assetId?: string } = { base64: flipped.base64 };
  if (input.assetId) {
    try {
      const dataUrl = `data:${flipped.mime};base64,${flipped.base64}`;
      const newAssetId = await putCanvasAssetFromBase64(dataUrl);
      out.assetId = newAssetId;
    } catch (e) {
      // IDB 写回失败：原 assetId 已不可用，但仍返回 base64 供调用方使用
      console.warn('[imageFlipUtils] 反向写回资产库失败，仅返回 base64', e);
    }
  }
  return out;
}
