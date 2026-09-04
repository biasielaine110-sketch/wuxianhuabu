/**
 * DeepWhite 视频：
 * - hailuo-h3-max-turbo-t2v → POST /v1/videos + GET /v1/videos/{id}
 * - hailuo-h3-max-turbo-i2v → 同上（需 images 首帧，可选尾帧）
 * 文档：https://api.deepwhiteai.com/docs
 */
import { deepWhiteAuthHeaders, getDeepWhiteSavedKey } from './aiSettings';

export const DEEPWHITE_HAILUO_H3_MAX_TURBO_T2V_UI_ID = 'hailuo-h3-max-turbo-t2v-deepwhite';
export const DEEPWHITE_HAILUO_H3_MAX_TURBO_I2V_UI_ID = 'hailuo-h3-max-turbo-i2v-deepwhite';

const DEEPWHITE_VIDEO_UI_IDS = new Set([
  DEEPWHITE_HAILUO_H3_MAX_TURBO_T2V_UI_ID,
  DEEPWHITE_HAILUO_H3_MAX_TURBO_I2V_UI_ID,
  'hailuo-h3-max-turbo-t2v',
  'hailuo-h3-max-turbo-i2v',
]);

export function isDeepWhiteVideoModel(modelName: string): boolean {
  return DEEPWHITE_VIDEO_UI_IDS.has((modelName || '').trim());
}

export function isDeepWhiteHailuoH3MaxTurboT2v(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_HAILUO_H3_MAX_TURBO_T2V_UI_ID || m === 'hailuo-h3-max-turbo-t2v';
}

export function isDeepWhiteHailuoH3MaxTurboI2v(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_HAILUO_H3_MAX_TURBO_I2V_UI_ID || m === 'hailuo-h3-max-turbo-i2v';
}

export type DeepWhiteVideoGenerateParams = {
  model: string;
  prompt: string;
  /** 参考图 base64 / dataURL / https（i2v 必填；第 1 张首帧，第 2 张尾帧） */
  referenceImages?: string[];
  durationSeconds?: number;
  aspectRatio?: string;
  /** UI：720p→768P；1080p/2k→2K */
  resolution?: string;
  signal?: AbortSignal;
};

function deepWhiteApiBase(): string {
  // 生产：/deepwhite-api → /api/deepwhite-proxy（Serverless 缓冲转发）
  return '/deepwhite-api/v1';
}

function requireDeepWhiteKey(): string {
  let key = getDeepWhiteSavedKey().trim().replace(/^\uFEFF/, '');
  key = key.replace(/^Bearer\s+/i, '').trim();
  key = key.replace(/^["'`]+|["'`]+$/g, '');
  if (!key) {
    throw new Error(
      '未配置 DeepWhite API Key。请在「设置 → API → DeepWhite」填写并保存（与对话共用）。'
    );
  }
  return key;
}

function formatUpstreamError(json: unknown, text: string, status: number): string {
  const root = (json && typeof json === 'object' ? json : null) as Record<string, unknown> | null;
  const err = (root?.error && typeof root.error === 'object' ? root.error : null) as Record<
    string,
    unknown
  > | null;
  const msg = String(
    err?.message || root?.message || root?.msg || text.slice(0, 500) || status
  ).trim();
  const code = String(err?.code ?? root?.code ?? '').trim();
  return code && !msg.includes(String(code)) ? `${msg}（code=${code}）` : msg;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

function resolveUpstreamModelId(modelName: string): 'hailuo-h3-max-turbo-t2v' | 'hailuo-h3-max-turbo-i2v' {
  if (isDeepWhiteHailuoH3MaxTurboI2v(modelName)) return 'hailuo-h3-max-turbo-i2v';
  return 'hailuo-h3-max-turbo-t2v';
}

/** 海螺 H3：768P / 2K */
export function clampDeepWhiteHailuoResolution(resolution?: string): '768P' | '2K' {
  const r = (resolution || '').trim().toLowerCase().replace(/\s/g, '');
  if (r === '2k' || r === '1080p' || r === '2K'.toLowerCase()) return '2K';
  return '768P';
}

export function clampDeepWhiteHailuoDuration(seconds?: number): number {
  const n = Math.round(Number(seconds) || 5);
  if ([5, 6, 8, 10, 12, 15].includes(n)) return n;
  if (n < 5) return 5;
  if (n > 15) return 15;
  return 5;
}

function normalizeRatio(aspectRatio?: string): string {
  const a = (aspectRatio || '16:9').trim();
  const allowed = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
  return allowed.includes(a) ? a : '16:9';
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal
): Promise<unknown> {
  const res = await fetch(`${deepWhiteApiBase()}${path}`, {
    method: 'POST',
    headers: {
      ...deepWhiteAuthHeaders(apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`DeepWhite 视频提交失败 (${res.status}): ${formatUpstreamError(json, text, res.status)}`);
  }
  return json;
}

async function getJson(path: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${deepWhiteApiBase()}${path}`, {
    method: 'GET',
    headers: { ...deepWhiteAuthHeaders(apiKey) },
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`DeepWhite 视频查询失败 (${res.status}): ${formatUpstreamError(json, text, res.status)}`);
  }
  return json;
}

/** 将本地 base64 / data URI / 公网 URL 转为 DeepWhite 可引用的公网 URL */
async function toDeepWhitePublicImageUrl(
  raw: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  const t = (raw || '').trim();
  if (!t) throw new Error('参考图为空');
  if (/^https?:\/\//i.test(t)) return t;

  const dataUrl = /^data:image\//i.test(t)
    ? t
    : `data:image/jpeg;base64,${t.replace(/^data:image\/\w+;base64,/i, '')}`;
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : 'data:image/jpeg;base64';
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /data:(image\/[\w+.-]+)/i.exec(meta)?.[1] || 'image/jpeg';
  const bin = Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('file', new Blob([bin], { type: mime }), `ref.${ext}`);

  const res = await fetch(`${deepWhiteApiBase()}/files/upload`, {
    method: 'POST',
    headers: { ...deepWhiteAuthHeaders(apiKey) },
    body: form,
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`DeepWhite 参考图上传失败 (${res.status}): ${formatUpstreamError(json, text, res.status)}`);
  }
  const root = json as Record<string, unknown> | null;
  const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<
    string,
    unknown
  > | null;
  const url = String(root?.url || data?.url || '').trim();
  if (!url) throw new Error('DeepWhite 参考图上传未返回 url');
  return url;
}

function pickTaskId(json: unknown): string {
  const root = json as Record<string, unknown>;
  const data = (root?.data && typeof root.data === 'object' ? root.data : null) as Record<
    string,
    unknown
  > | null;
  const id = String(root?.id || root?.task_id || data?.id || data?.task_id || '').trim();
  if (!id) throw new Error('DeepWhite 视频任务未返回 id');
  return id;
}

function pickVideoResultUrl(json: unknown): string {
  const root = json as Record<string, unknown>;
  const metadata = (root?.metadata && typeof root.metadata === 'object' ? root.metadata : null) as Record<
    string,
    unknown
  > | null;
  const data = (root?.data && typeof root.data === 'object' ? root.data : null) as Record<
    string,
    unknown
  > | null;
  const nestedMeta = (data?.metadata && typeof data.metadata === 'object' ? data.metadata : null) as Record<
    string,
    unknown
  > | null;

  const candidates = [
    metadata?.url,
    nestedMeta?.url,
    root?.url,
    data?.url,
    data?.result_url,
    metadata?.video_url,
  ];
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : '';
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  throw new Error('DeepWhite 视频任务成功但未返回视频 URL');
}

async function pollVideoTask(taskId: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  const maxAttempts = 180;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const json = await getJson(`/videos/${encodeURIComponent(taskId)}`, apiKey, signal);
    const root = json as Record<string, unknown>;
    const status = String(root?.status || '').trim().toLowerCase();

    if (status === 'completed' || status === 'success' || status === 'succeeded') {
      return pickVideoResultUrl(json);
    }
    if (status === 'failed' || status === 'failure' || status === 'error') {
      const err = (root?.error && typeof root.error === 'object' ? root.error : null) as Record<
        string,
        unknown
      > | null;
      const reason = String(err?.message || root?.fail_reason || root?.message || status).trim();
      throw new Error(`DeepWhite 视频生成失败：${reason}`);
    }
    await sleep(4000, signal);
  }
  throw new Error('DeepWhite 视频生成超时，请稍后在控制台查看任务状态。');
}

/**
 * DeepWhite Hailuo H3 Max Turbo 文生/图生视频。
 * 成功返回可播放的 https 直链（约 24h 有效，建议尽快使用）。
 */
export async function deepWhiteGenerateVideo(params: DeepWhiteVideoGenerateParams): Promise<string> {
  const apiKey = requireDeepWhiteKey();
  const upstream = resolveUpstreamModelId(params.model);
  const prompt = (params.prompt || '').trim();
  const isI2v = upstream.endsWith('-i2v');

  if (!isI2v && !prompt) {
    throw new Error('文生视频请输入提示词');
  }

  const refs = (params.referenceImages || []).map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (isI2v && refs.length < 1) {
    throw new Error('图生视频请连接至少 1 张参考图（首帧；可选第 2 张为尾帧）');
  }

  const imageUrls: string[] = [];
  for (const raw of refs) {
    imageUrls.push(await toDeepWhitePublicImageUrl(raw, apiKey, params.signal));
  }

  const seconds = String(clampDeepWhiteHailuoDuration(params.durationSeconds));
  const resolution = clampDeepWhiteHailuoResolution(params.resolution);
  const metadata: Record<string, unknown> = { resolution };
  if (!isI2v) {
    metadata.ratio = normalizeRatio(params.aspectRatio);
  }

  const body: Record<string, unknown> = {
    model: upstream,
    seconds,
    metadata,
  };
  if (prompt) body.prompt = prompt;
  if (isI2v) body.images = imageUrls;

  const submitted = await postJson('/videos', body, apiKey, params.signal);
  const taskId = pickTaskId(submitted);
  return await pollVideoTask(taskId, apiKey, params.signal);
}
