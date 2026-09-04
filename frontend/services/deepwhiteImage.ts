/**
 * DeepWhite 图像：
 * - seedream-v5-pro-t2i / seedream-v5-pro-i2i → POST /v1/image/generations
 * - deepwhiteai-image-nb-2 / deepwhiteai-image-nb-2-lite → 同上
 * - midjourney-imagine → POST /v1/midjourney/generations + GET /v1/midjourney/tasks/{id}
 * 文档：https://api.deepwhiteai.com/docs
 */
import { getDeepWhiteSavedKey } from './aiSettings';

export const DEEPWHITE_SEEDREAM_V5_PRO_UI_ID = 'seedream-v5-pro-t2i-deepwhite';
export const DEEPWHITE_MIDJOURNEY_IMAGINE_UI_ID = 'midjourney-imagine-deepwhite';
export const DEEPWHITE_NB2_LITE_UI_ID = 'deepwhiteai-image-nb-2-lite-deepwhite';
export const DEEPWHITE_NB2_UI_ID = 'deepwhiteai-image-nb-2-deepwhite';

const DEEPWHITE_IMAGE_UI_IDS = new Set([
  DEEPWHITE_SEEDREAM_V5_PRO_UI_ID,
  DEEPWHITE_MIDJOURNEY_IMAGINE_UI_ID,
  DEEPWHITE_NB2_LITE_UI_ID,
  DEEPWHITE_NB2_UI_ID,
  'seedream-v5-pro-t2i',
  'seedream-v5-pro-i2i',
  'midjourney-imagine',
  'deepwhiteai-image-nb-2-lite',
  'deepwhiteai-image-nb-2',
]);

export function isDeepWhiteImageModel(modelName: string): boolean {
  return DEEPWHITE_IMAGE_UI_IDS.has((modelName || '').trim());
}

export function isDeepWhiteSeedreamImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === DEEPWHITE_SEEDREAM_V5_PRO_UI_ID ||
    m === 'seedream-v5-pro-t2i' ||
    m === 'seedream-v5-pro-i2i'
  );
}

export function isDeepWhiteNb2LiteImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_NB2_LITE_UI_ID || m === 'deepwhiteai-image-nb-2-lite';
}

export function isDeepWhiteNb2ImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_NB2_UI_ID || m === 'deepwhiteai-image-nb-2';
}

export function isDeepWhiteMidjourneyImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_MIDJOURNEY_IMAGINE_UI_ID || m === 'midjourney-imagine';
}

/** 画布分辨率约束：Seedream 仅 1k/2k；NB Lite 仅 1k */
export function clampDeepWhiteImageResolution(modelId: string, resolution?: string): string {
  const r = (resolution || '2k').toLowerCase().replace(/\s/g, '');
  if (isDeepWhiteNb2LiteImageModel(modelId)) return '1k';
  if (isDeepWhiteSeedreamImageModel(modelId) && r === '4k') return '2k';
  if (isDeepWhiteNb2ImageModel(modelId) && r === '0.5k') return '0.5k';
  return r || '2k';
}

function deepWhiteApiBase(): string {
  if (import.meta.env.PROD) return '/api/deepwhite-proxy?path=v1';
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
    err?.message || root?.message || root?.description || root?.msg || text.slice(0, 500) || status
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
    const t = setTimeout(resolve, ms);
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

async function postJson(path: string, body: unknown, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${deepWhiteApiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`DeepWhite 生图提交失败 (${res.status}): ${formatUpstreamError(json, text, res.status)}`);
  }
  return json;
}

async function getJson(path: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${deepWhiteApiBase()}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`DeepWhite 生图查询失败 (${res.status}): ${formatUpstreamError(json, text, res.status)}`);
  }
  return json;
}

function pickTaskId(json: unknown): string {
  const root = json as Record<string, unknown>;
  const data = root?.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const row = data[0] as Record<string, unknown>;
    const id = String(row.task_id || row.id || '').trim();
    if (id) return id;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const id = String(d.task_id || d.id || '').trim();
    if (id) return id;
  }
  const id = String(root?.task_id || root?.id || '').trim();
  if (id) return id;
  throw new Error('DeepWhite 未返回 task_id。');
}

function pushUrl(urls: string[], u: unknown) {
  const s = typeof u === 'string' ? u.trim() : '';
  if (s && /^https?:\/\//i.test(s) && !urls.includes(s)) urls.push(s);
}

function pickImageUrls(json: unknown): string[] {
  const root = json as Record<string, unknown>;
  const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const nested = (data?.data && typeof data.data === 'object' ? data.data : null) as Record<
    string,
    unknown
  > | null;
  const content = (nested?.content || data?.content) as Record<string, unknown> | undefined;
  const urls: string[] = [];

  pushUrl(urls, data?.result_url);
  pushUrl(urls, content?.image_url);
  pushUrl(urls, data?.image_url);
  pushUrl(urls, data?.grid_image_url);
  pushUrl(urls, root?.grid_image_url);
  if (Array.isArray(content?.image_urls)) content.image_urls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(data?.image_urls)) data.image_urls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(root?.image_urls)) root.image_urls.forEach((u) => pushUrl(urls, u));

  if (Array.isArray(root?.data)) {
    for (const item of root.data) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      pushUrl(urls, row.result_url);
      pushUrl(urls, row.grid_image_url);
      pushUrl(urls, row.image_url);
      if (Array.isArray(row.image_urls)) row.image_urls.forEach((u) => pushUrl(urls, u));
    }
  }

  if (!urls.length) throw new Error('DeepWhite 任务成功但未返回图片 URL。');
  return urls;
}

function isImageTaskSuccess(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'COMPLETED' || s === 'COMPLETE';
}

function isImageTaskFailure(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'FAILURE' || s === 'FAILED' || s === 'ERROR' || s === 'CANCEL' || s === 'CANCELLED';
}

async function pollImageGeneration(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const json = await getJson(`/image/generations/${encodeURIComponent(taskId)}`, apiKey, signal);
    const root = json as Record<string, unknown>;
    const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
    const status = String(data?.status || root?.status || '').trim();
    if (isImageTaskSuccess(status)) return pickImageUrls(json);
    if (isImageTaskFailure(status)) {
      const reason =
        String(data?.fail_reason || (data?.error as { message?: string })?.message || root?.message || '').trim() ||
        status;
      throw new Error(`DeepWhite 生图失败：${reason}`);
    }
    await sleep(3500, signal);
  }
  throw new Error('DeepWhite 生图超时，请稍后在控制台查看任务状态。');
}

async function pollMidjourneyTask(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let json: unknown;
    try {
      json = await getJson(`/midjourney/tasks/${encodeURIComponent(taskId)}`, apiKey, signal);
    } catch {
      json = await getJson(`/midjourney/${encodeURIComponent(taskId)}`, apiKey, signal);
    }
    const root = json as Record<string, unknown>;
    const data = (root?.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? root.data
      : root) as Record<string, unknown>;
    const status = String(data?.status || root?.status || '').trim();
    if (isImageTaskSuccess(status)) return pickImageUrls(json);
    if (status.toUpperCase() === 'MODAL') {
      throw new Error('DeepWhite Midjourney 任务需要补参（MODAL），当前画布仅支持 imagine 直出。');
    }
    if (isImageTaskFailure(status)) {
      const reason =
        String(
          data?.fail_reason ||
            (data?.error as { message?: string })?.message ||
            root?.description ||
            root?.message ||
            ''
        ).trim() || status;
      throw new Error(`DeepWhite Midjourney 失败：${reason}`);
    }
    await sleep(4000, signal);
  }
  throw new Error('DeepWhite Midjourney 生成超时。');
}

async function fetchImageUrlAsBase64(imageUrl: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(imageUrl, { mode: 'cors', credentials: 'omit', signal });
  if (!res.ok) throw new Error(`无法下载 DeepWhite 生成图 (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error('读取生成图失败'));
    reader.readAsDataURL(blob);
  });
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
    headers: { Authorization: `Bearer ${apiKey}` },
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
  const url = String((json as { url?: string })?.url || '').trim();
  if (!url) throw new Error('DeepWhite 参考图上传未返回 url');
  return url;
}

function resolveSeedreamUpstream(hasRefs: boolean): 'seedream-v5-pro-t2i' | 'seedream-v5-pro-i2i' {
  return hasRefs ? 'seedream-v5-pro-i2i' : 'seedream-v5-pro-t2i';
}

function resolveNbUpstream(modelName: string): 'deepwhiteai-image-nb-2' | 'deepwhiteai-image-nb-2-lite' {
  if (isDeepWhiteNb2LiteImageModel(modelName)) return 'deepwhiteai-image-nb-2-lite';
  return 'deepwhiteai-image-nb-2';
}

function mapResolutionBand(modelName: string, nodeResolution?: string): string {
  const r = clampDeepWhiteImageResolution(modelName, nodeResolution);
  if (isDeepWhiteNb2LiteImageModel(modelName)) return '1k';
  if (isDeepWhiteSeedreamImageModel(modelName)) return r === '1k' ? '1k' : '2k';
  if (isDeepWhiteNb2ImageModel(modelName)) {
    if (r === '4k') return '4k';
    if (r === '1k' || r === '0.5k') return r === '0.5k' ? '0.5k' : '1k';
    return '2k';
  }
  return r;
}

function normalizeAspect(aspectRatio?: string): string {
  const a = (aspectRatio || '1:1').trim();
  return a || '1:1';
}

export type DeepWhiteImageGenerateParams = {
  model: string;
  prompt: string;
  aspectRatio?: string;
  numberOfImages?: number;
  nodeResolution?: string;
  /** 图生图参考（base64 / data URI / https） */
  refImages?: string[];
  signal?: AbortSignal;
};

/**
 * DeepWhite 文生图 / 图生图，返回裸 base64 列表（与画布 generateNewImage 约定一致）。
 */
export async function deepWhiteGenerateImage(params: DeepWhiteImageGenerateParams): Promise<string[]> {
  const apiKey = requireDeepWhiteKey();
  const prompt = (params.prompt || '').trim();
  if (!prompt) throw new Error('请输入提示词。');
  const aspect = normalizeAspect(params.aspectRatio);
  const refsRaw = (params.refImages || []).filter(Boolean);
  const signal = params.signal;

  if (isDeepWhiteMidjourneyImageModel(params.model)) {
    const imageUrls: string[] = [];
    for (const ref of refsRaw.slice(0, 4)) {
      imageUrls.push(await toDeepWhitePublicImageUrl(ref, apiKey, signal));
    }
    const body: Record<string, unknown> = {
      prompt,
      size: aspect,
      version: '6.1',
      speed: 'relax',
    };
    if (imageUrls.length) body.image_urls = imageUrls;
    const submitted = await postJson('/midjourney/generations', body, apiKey, signal);
    const taskId = pickTaskId(submitted);
    const urls = await pollMidjourneyTask(taskId, apiKey, signal);
    const want = Math.max(1, Math.min(4, params.numberOfImages || urls.length || 1));
    const picked = urls.slice(0, want);
    const out: string[] = [];
    for (const u of picked) out.push(await fetchImageUrlAsBase64(u, signal));
    return out;
  }

  const refUrls: string[] = [];
  for (const ref of refsRaw.slice(0, 14)) {
    refUrls.push(await toDeepWhitePublicImageUrl(ref, apiKey, signal));
  }

  if (isDeepWhiteSeedreamImageModel(params.model)) {
    const upstream = resolveSeedreamUpstream(refUrls.length > 0);
    if (upstream === 'seedream-v5-pro-i2i' && !refUrls.length) {
      throw new Error('Seedream 图生图（i2i）需要至少一张参考图。');
    }
    const resolution = mapResolutionBand(params.model, params.nodeResolution);
    const n = Math.max(1, Math.min(4, params.numberOfImages || 1));
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const body: Record<string, unknown> = {
        model: upstream,
        prompt,
        metadata: { resolution, output_format: 'jpeg' },
      };
      if (refUrls.length) body.images = refUrls.slice(0, 10);
      const submitted = await postJson('/image/generations', body, apiKey, signal);
      const taskId = pickTaskId(submitted);
      const urls = await pollImageGeneration(taskId, apiKey, signal);
      out.push(await fetchImageUrlAsBase64(urls[0], signal));
    }
    return out;
  }

  const upstream = resolveNbUpstream(params.model);
  const isLite = upstream === 'deepwhiteai-image-nb-2-lite';
  const resolution = mapResolutionBand(params.model, params.nodeResolution);
  const n = isLite ? Math.max(1, Math.min(4, params.numberOfImages || 1)) : 1;
  const body: Record<string, unknown> = {
    model: upstream,
    prompt,
    n,
    size: aspect,
    metadata: { resolution, ratio: aspect, size: aspect },
  };
  if (refUrls.length) body.images = refUrls.slice(0, 14);

  const submitted = await postJson('/image/generations', body, apiKey, signal);
  const taskId = pickTaskId(submitted);
  const urls = await pollImageGeneration(taskId, apiKey, signal);
  const want = Math.max(1, Math.min(n, urls.length));
  const out: string[] = [];
  for (const u of urls.slice(0, want)) {
    out.push(await fetchImageUrlAsBase64(u, signal));
  }
  return out;
}
