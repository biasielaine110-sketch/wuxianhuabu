import type { CanvasNode, Edge } from './types';

/** 图片压缩：限制最长边为 maxSize，生成 JPEG（压缩率 85%） */
export async function compressImageBase64(base64: string, maxSize = 2048): Promise<string> {
  return new Promise((resolve) => {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const mime = base64.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // 限制最长边
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, ''));
    };
    img.onerror = () => resolve(raw); // 失败时返回原图
    img.src = `data:${mime};base64,${raw}`;
  });
}

/** 批量压缩图片（带并行限制） */
export async function compressImageBase64s(
  base64s: string[],
  maxSize = 2048,
  maxConcurrency = 4
): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < base64s.length; i += maxConcurrency) {
    const batch = base64s.slice(i, i + maxConcurrency);
    const compressed = await Promise.all(batch.map(b => compressImageBase64(b, maxSize)));
    results.push(...compressed);
  }
  return results;
}

/** 汇入某一节点的参考槽（图 / 视频 / 语音 / 文本），编号 @R1、@R2… 与连线顺序一致 */
export type IncomingRefSlot = {
  n: number;
  kind: 'image' | 'video' | 'audio' | 'text';
  label: string;
  imageBase64?: string;
  imageBase64s?: string[]; // 多图模式：返回所有图片
  videoUrl?: string;
  /** 语音参考：音频 base64 */
  audioBase64?: string;
  /** 语音参考：音频时长（秒） */
  audioDuration?: number;
  /** 文本参考：文本节点内容 */
  textContent?: string;
  edgeId: string;
  sourceNodeId: string;
};

function shortSourceLabel(src: CanvasNode): string {
  if (src.type === 'text') return '文本';
  if (src.type === 'video') return '视频';
  if (src.type === 'audio') return '语音';
  if (src.type === 'image') return '图片';
  if (src.type === 't2i' || src.type === 'i2i') return src.type === 't2i' ? '文生图' : '图生图';
  return src.type;
}

export function buildIncomingRefSlots(
  targetNodeId: string,
  edges: Edge[],
  nodes: CanvasNode[]
): IncomingRefSlot[] {
  const incoming = edges.filter((e) => e.targetId === targetNodeId);
  const slots: IncomingRefSlot[] = [];
  let n = 0;
  for (const edge of incoming) {
    const src = nodes.find((x) => x.id === edge.sourceId);
    if (!src) continue;
    const prefix = shortSourceLabel(src);
    /** 多图源节点：返回该连线源节点的所有图片，供图生图多图参考使用 */
    if (src.images?.length) {
      // 收集所有非空图片
      const allImages = src.images.filter(img => img && img !== '');
      if (allImages.length > 0) {
        n += 1;
        slots.push({
          n,
          kind: 'image',
          label: `${prefix}·${allImages.length}张图`,
          imageBase64: allImages[0], // 保留第一张作为兼容性字段
          imageBase64s: allImages,    // 新增：返回所有图片数组
          edgeId: edge.id,
          sourceNodeId: src.id,
        });
      }
    }
    if (src.type === 'video' && src.videos?.length) {
      const vidx = Math.min(Math.max(0, src.currentVideoIndex ?? 0), src.videos.length - 1);
      const u = src.videos[vidx];
      if (u) {
        n += 1;
        slots.push({
          n,
          kind: 'video',
          label: `${prefix}·成片${vidx + 1}`,
          videoUrl: u,
          edgeId: edge.id,
          sourceNodeId: src.id,
        });
      }
    }
    /** 语音参考节点 */
    if (src.type === 'audio' && src.audio) {
      n += 1;
      slots.push({
        n,
        kind: 'audio',
        label: `${prefix}${src.audioDuration ? `·${formatDuration(src.audioDuration)}` : ''}`,
        audioBase64: src.audio,
        audioDuration: src.audioDuration,
        edgeId: edge.id,
        sourceNodeId: src.id,
      });
    }
    /** 文本参考节点 */
    if (src.type === 'text' && src.prompt) {
      n += 1;
      slots.push({
        n,
        kind: 'text',
        label: `${prefix}·${src.prompt.slice(0, 20)}${src.prompt.length > 20 ? '…' : ''}`,
        textContent: src.prompt,
        edgeId: edge.id,
        sourceNodeId: src.id,
      });
    }
  }
  return slots;
}

/** 有 @R 数字则返回所引用序号（去重）；无 @R 则返回 null 表示使用全部槽位 */
export function parseRefPickIndices(prompt: string): number[] | null {
  const re = /@R(\d+)/gi;
  const found: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v) && v > 0) found.push(v);
  }
  if (found.length === 0) return null;
  return [...new Set(found)].sort((a, b) => a - b);
}

/** 有 @M 数字则返回所引用消息图片序号（去重）；无 @M 则返回 null */
export function parseMsgPickIndices(prompt: string): number[] | null {
  const re = /@M(\d+)/gi;
  const found: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v) && v > 0) found.push(v);
  }
  if (found.length === 0) return null;
  return [...new Set(found)].sort((a, b) => a - b);
}

export function stripRefMarkers(prompt: string): string {
  return prompt.replace(/@[RM]\d+/gi, '').replace(/\s+/g, ' ').trim();
}

/** 从视频 URL（含 blob:）截取一帧为 JPEG base64（无 data: 前缀）；失败返回 null（常见于跨域外链） */
export function videoUrlToJpegBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let settled = false;
    const done = (val: string | null) => {
      if (settled) return;
      settled = true;
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {
        /* ignore */
      }
      resolve(val);
    };
    const t = window.setTimeout(() => done(null), 12000);
    v.onerror = () => {
      window.clearTimeout(t);
      done(null);
    };
    v.onloadeddata = () => {
      try {
        const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
        v.currentTime = Math.min(0.2, dur * 0.05);
      } catch {
        window.clearTimeout(t);
        done(null);
      }
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) {
          window.clearTimeout(t);
          done(null);
          return;
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) {
          window.clearTimeout(t);
          done(null);
          return;
        }
        ctx.drawImage(v, 0, 0);
        const data = c.toDataURL('image/jpeg', 0.82);
        const i = data.indexOf(',');
        window.clearTimeout(t);
        done(i >= 0 ? data.slice(i + 1) : null);
      } catch {
        window.clearTimeout(t);
        done(null);
      }
    };
    v.src = url;
    try {
      v.load();
    } catch {
      window.clearTimeout(t);
      done(null);
    }
  });
}

export async function resolveSlotImagesForIndices(
  slots: IncomingRefSlot[],
  indices: number[] | null
): Promise<{ base64s: string[]; missing: number[] }> {
  const want = indices === null ? slots.map((s) => s.n) : indices;
  const base64s: string[] = [];
  const missing: number[] = [];
  for (const num of want) {
    const s = slots.find((x) => x.n === num);
    if (!s) {
      missing.push(num);
      continue;
    }
    if (s.kind === 'image') {
      // 优先使用多图数组 imageBase64s
      if (s.imageBase64s && s.imageBase64s.length > 0) {
        base64s.push(...s.imageBase64s);
      } else if (s.imageBase64) {
        base64s.push(s.imageBase64);
      } else {
        missing.push(num);
      }
      continue;
    }
    if (s.kind === 'video' && s.videoUrl) {
      const b = await videoUrlToJpegBase64(s.videoUrl);
      if (b) base64s.push(b);
      else missing.push(num);
      continue;
    }
    missing.push(num);
  }
  return { base64s, missing };
}

/** 解析并压缩图片（限制2048px） */
export async function resolveSlotImagesForIndicesWithCompression(
  slots: IncomingRefSlot[],
  indices: number[] | null,
  maxSize = 2048
): Promise<{ base64s: string[]; missing: number[] }> {
  const want = indices === null ? slots.map((s) => s.n) : indices;
  const base64s: string[] = [];
  const missing: number[] = [];
  for (const num of want) {
    const s = slots.find((x) => x.n === num);
    if (!s) {
      missing.push(num);
      continue;
    }
    if (s.kind === 'image') {
      if (s.imageBase64s && s.imageBase64s.length > 0) {
        const compressed = await compressImageBase64s(s.imageBase64s, maxSize);
        base64s.push(...compressed);
      } else if (s.imageBase64) {
        const compressed = await compressImageBase64(s.imageBase64, maxSize);
        base64s.push(compressed);
      } else {
        missing.push(num);
      }
      continue;
    }
    if (s.kind === 'video' && s.videoUrl) {
      const b = await videoUrlToJpegBase64(s.videoUrl);
      if (b) {
        const compressed = await compressImageBase64(b, maxSize);
        base64s.push(compressed);
      } else missing.push(num);
      continue;
    }
    missing.push(num);
  }
  return { base64s, missing };
}

/** 格式化时长（秒）为 MM:SS 格式 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** 从参考槽中解析语音参考（base64 格式） */
export function resolveSlotAudios(slots: IncomingRefSlot[]): { base64: string; duration?: number }[] {
  const audios: { base64: string; duration?: number }[] = [];
  for (const slot of slots) {
    if (slot.kind === 'audio' && slot.audioBase64) {
      audios.push({
        base64: slot.audioBase64,
        duration: slot.audioDuration,
      });
    }
  }
  return audios;
}
