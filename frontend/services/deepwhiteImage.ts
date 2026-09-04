/**
 * DeepWhite 图像：
 * - seedream-v5-pro-t2i / seedream-v5-pro-i2i → POST /v1/image/generations
 * - deepwhiteai-image-nb-2 / deepwhiteai-image-nb-2-lite → 同上
 * - deepwhiteai-image-g-v2-lowprice / deepwhiteai-image-g2-t2i|i2i → 同上
 * - midjourney-imagine → POST /v1/mj/submit/imagine（New API MJ 代理；官方 /v1/midjourney/generations 在 DeepWhite 会 400 request not found in context）
 * 文档：https://api.deepwhiteai.com/docs
 */
import { deepWhiteAuthHeaders, getDeepWhiteSavedKey } from './aiSettings';
import { rewriteImageUrlForBrowserDisplay } from './canvasAssetResolver';

export const DEEPWHITE_SEEDREAM_V5_PRO_UI_ID = 'seedream-v5-pro-t2i-deepwhite';
export const DEEPWHITE_MIDJOURNEY_IMAGINE_UI_ID = 'midjourney-imagine-deepwhite';
export const DEEPWHITE_NB2_LITE_UI_ID = 'deepwhiteai-image-nb-2-lite-deepwhite';
export const DEEPWHITE_NB2_UI_ID = 'deepwhiteai-image-nb-2-deepwhite';
export const DEEPWHITE_G_V2_LOWPRICE_UI_ID = 'deepwhiteai-image-g-v2-lowprice-deepwhite';
export const DEEPWHITE_G2_I2I_UI_ID = 'deepwhiteai-image-g2-i2i-deepwhite';

const DEEPWHITE_IMAGE_UI_IDS = new Set([
  DEEPWHITE_SEEDREAM_V5_PRO_UI_ID,
  DEEPWHITE_MIDJOURNEY_IMAGINE_UI_ID,
  DEEPWHITE_NB2_LITE_UI_ID,
  DEEPWHITE_NB2_UI_ID,
  DEEPWHITE_G_V2_LOWPRICE_UI_ID,
  DEEPWHITE_G2_I2I_UI_ID,
  'seedream-v5-pro-t2i',
  'seedream-v5-pro-i2i',
  'midjourney-imagine',
  'deepwhiteai-image-nb-2-lite',
  'deepwhiteai-image-nb-2',
  'deepwhiteai-image-g-v2-lowprice',
  'deepwhiteai-image-g2-i2i',
  'deepwhiteai-image-g2-t2i',
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

export function isDeepWhiteGv2LowpriceImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_G_V2_LOWPRICE_UI_ID || m === 'deepwhiteai-image-g-v2-lowprice';
}

export function isDeepWhiteG2ImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === DEEPWHITE_G2_I2I_UI_ID ||
    m === 'deepwhiteai-image-g2-i2i' ||
    m === 'deepwhiteai-image-g2-t2i'
  );
}

/** 画布分辨率约束：Seedream 仅 1k/2k；NB Lite / G-2 仅 1k */
export function clampDeepWhiteImageResolution(modelId: string, resolution?: string): string {
  const r = (resolution || '2k').toLowerCase().replace(/\s/g, '');
  if (isDeepWhiteNb2LiteImageModel(modelId) || isDeepWhiteG2ImageModel(modelId)) return '1k';
  if (isDeepWhiteSeedreamImageModel(modelId) && r === '4k') return '2k';
  if (isDeepWhiteNb2ImageModel(modelId) && r === '0.5k') return '0.5k';
  return r || '2k';
}

function deepWhiteApiBase(): string {
  // 生产：vercel.json 把 /deepwhite-api/* rewrite 到 /api/deepwhite-proxy?path=…
  // （Serverless 缓冲转发，避免边缘直连外站时 POST body 丢失 → 上游 400）
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

const midjourneyTaskIdBySignal = new WeakMap<AbortSignal, string>();

function rememberMidjourneyTaskId(signal: AbortSignal | undefined, taskId: string) {
  if (signal && taskId) midjourneyTaskIdBySignal.set(signal, taskId);
}

export function takeMidjourneyTaskId(signal?: AbortSignal): string | undefined {
  if (!signal) return undefined;
  const id = midjourneyTaskIdBySignal.get(signal);
  if (id) midjourneyTaskIdBySignal.delete(signal);
  return id;
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
      ...deepWhiteAuthHeaders(apiKey),
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

type PostJsonRaw = { ok: boolean; status: number; json: unknown; text: string };

async function postJsonRaw(
  path: string,
  body: unknown,
  apiKey: string,
  signal?: AbortSignal
): Promise<PostJsonRaw> {
  const res = await fetch(`${deepWhiteApiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...deepWhiteAuthHeaders(apiKey),
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
  return { ok: res.ok, status: res.status, json, text };
}

function isRetryableMjSubmitFailure(status: number, json: unknown, text: string): boolean {
  if (status === 401 || status === 403) return false;
  if (status === 404 || status === 405) return true;
  const msg = formatUpstreamError(json, text, status).toLowerCase();
  return (
    msg.includes('request not found in context') ||
    msg.includes('invalid_request') ||
    msg.includes('not found') ||
    msg.includes('unknown model') ||
    msg.includes('no available channel') ||
    msg.includes('no route')
  );
}

async function postJsonFirstOk(
  attempts: { path: string; body: unknown }[],
  apiKey: string,
  signal?: AbortSignal
): Promise<unknown> {
  let last: PostJsonRaw | null = null;
  for (const { path, body } of attempts) {
    const raw = await postJsonRaw(path, body, apiKey, signal);
    last = raw;
    if (raw.ok) return raw.json;
    if (!isRetryableMjSubmitFailure(raw.status, raw.json, raw.text)) {
      throw new Error(
        `DeepWhite 生图提交失败 (${raw.status}): ${formatUpstreamError(raw.json, raw.text, raw.status)}`
      );
    }
  }
  const status = last?.status ?? 400;
  throw new Error(
    `DeepWhite 生图提交失败 (${status}): ${formatUpstreamError(last?.json, last?.text || '', status)}`
  );
}

async function getJson(path: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${deepWhiteApiBase()}${path}`, {
    method: 'GET',
    headers: { ...deepWhiteAuthHeaders(apiKey) },
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
  const code = root?.code;
  if (typeof code === 'number' && code !== 1 && code !== 200) {
    throw new Error(String(root.description || root.message || `code=${code}`));
  }
  const data = root?.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const row = data[0] as Record<string, unknown>;
    const id = String(row.task_id || row.id || row.result || '').trim();
    if (id) return id;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const id = String(d.task_id || d.id || d.result || '').trim();
    if (id) return id;
  }
  const id = String(root?.result || root?.task_id || root?.id || '').trim();
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
  pushUrl(urls, data?.imageUrl);
  pushUrl(urls, root?.imageUrl);
  const props = (data?.properties && typeof data.properties === 'object'
    ? data.properties
    : root?.properties && typeof root.properties === 'object'
      ? root.properties
      : null) as Record<string, unknown> | null;
  pushUrl(urls, props?.imageUrl);
  pushUrl(urls, props?.image_url);
  pushUrl(urls, data?.grid_image_url);
  pushUrl(urls, root?.grid_image_url);
  if (Array.isArray(content?.image_urls)) content.image_urls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(data?.image_urls)) data.image_urls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(root?.image_urls)) root.image_urls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(data?.imageUrls)) data.imageUrls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(root?.imageUrls)) root.imageUrls.forEach((u) => pushUrl(urls, u));

  const output = (data?.output && typeof data.output === 'object' ? data.output : null) as Record<
    string,
    unknown
  > | null;
  const result = (data?.result && typeof data.result === 'object' ? data.result : null) as Record<
    string,
    unknown
  > | null;
  if (Array.isArray(output?.image_urls)) output.image_urls.forEach((u) => pushUrl(urls, u));
  if (Array.isArray(result?.image_urls)) result.image_urls.forEach((u) => pushUrl(urls, u));
  pushUrl(urls, output?.grid_image_url);
  pushUrl(urls, result?.grid_image_url);
  pushUrl(urls, output?.image_url);
  pushUrl(urls, result?.image_url);

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

async function fetchMidjourneyTaskJson(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<unknown> {
  const enc = encodeURIComponent(taskId);
  const paths = [
    `/mj/task/${enc}/fetch`,
    `/midjourney/tasks/${enc}`,
    `/midjourney/${enc}`,
    `/tasks/${enc}`,
  ];
  let lastErr: unknown;
  for (const path of paths) {
    try {
      return await getJson(path, apiKey, signal);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('DeepWhite Midjourney 任务查询失败');
}

async function pollMidjourneyTask(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const json = await fetchMidjourneyTaskJson(taskId, apiKey, signal);
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
            data?.failReason ||
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
  const fetchUrl = rewriteImageUrlForBrowserDisplay(imageUrl);
  const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit', signal });
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
  if (isDeepWhiteNb2LiteImageModel(modelName) || isDeepWhiteG2ImageModel(modelName)) return '1k';
  if (isDeepWhiteSeedreamImageModel(modelName)) return r === '1k' ? '1k' : '2k';
  if (isDeepWhiteNb2ImageModel(modelName)) {
    if (r === '4k') return '4k';
    if (r === '1k' || r === '0.5k') return r === '0.5k' ? '0.5k' : '1k';
    return '2k';
  }
  if (isDeepWhiteGv2LowpriceImageModel(modelName)) {
    if (r === '4k') return '4k';
    if (r === '1k') return '1k';
    return '2k';
  }
  return r;
}

function normalizeAspect(aspectRatio?: string): string {
  const a = (aspectRatio || '1:1').trim();
  return a || '1:1';
}

/** Midjourney size / --ar 常用比例 */
function clampMidjourneySize(aspectRatio?: string): string {
  const a = normalizeAspect(aspectRatio);
  const allowed = new Set([
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '5:4',
    '4:5',
    '21:9',
    '9:21',
  ]);
  return allowed.has(a) ? a : '1:1';
}

async function submitImageJobAndFetchBase64(
  body: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
  take = 1
): Promise<string[]> {
  const submitted = await postJson('/image/generations', body, apiKey, signal);
  const taskId = pickTaskId(submitted);
  const urls = await pollImageGeneration(taskId, apiKey, signal);
  const out: string[] = [];
  for (const u of urls.slice(0, Math.max(1, take))) {
    out.push(await fetchImageUrlAsBase64(u, signal));
  }
  return out;
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
function clampDeepWhiteImagePrompt(prompt: string): string {
  const p = (prompt || '').trim();
  if (p.length < 5) {
    throw new Error('DeepWhite 提示词至少 5 个字符。');
  }
  if (p.length > 2000) return p.slice(0, 2000);
  return p;
}

export async function deepWhiteGenerateImage(params: DeepWhiteImageGenerateParams): Promise<string[]> {
  const apiKey = requireDeepWhiteKey();
  const prompt = clampDeepWhiteImagePrompt(params.prompt || '');
  const aspect = normalizeAspect(params.aspectRatio);
  const refsRaw = (params.refImages || []).filter(Boolean);
  const signal = params.signal;

  if (isDeepWhiteMidjourneyImageModel(params.model)) {
    const imageUrls: string[] = [];
    for (const ref of refsRaw.slice(0, 4)) {
      imageUrls.push(await toDeepWhitePublicImageUrl(ref, apiKey, signal));
    }
    const mjSize = clampMidjourneySize(aspect);
    let mjPrompt = prompt;
    if (!/--ar\s/i.test(mjPrompt)) mjPrompt += ` --ar ${mjSize}`;
    if (!/--v\s/i.test(mjPrompt)) mjPrompt += ' --v 6.1';
    mjPrompt = clampDeepWhiteImagePrompt(mjPrompt);
    const speed = /--turbo\b/i.test(prompt) ? 'turbo' : /--fast\b/i.test(prompt) ? 'fast' : 'relax';
    const proxyPrompt = imageUrls.length ? `${imageUrls.join(' ')} ${mjPrompt}`.trim() : mjPrompt;
    const officialBody: Record<string, unknown> = {
      prompt: mjPrompt,
      speed,
      size: mjSize,
    };
    if (imageUrls.length) officialBody.image_urls = imageUrls;
    // DeepWhite 网关是 New API：/v1/midjourney/generations 未注入 task_request → 400 request not found in context。
    // 先走 MJ 代理 imagine；官方路径带 model 仅作回退。
    const submitted = await postJsonFirstOk(
      [
        {
          path: '/mj/submit/imagine',
          body: { prompt: proxyPrompt, botType: 'MID_JOURNEY' },
        },
        { path: '/midjourney/generations', body: { ...officialBody, model: 'midjourney' } },
        { path: '/midjourney/generations/imagine', body: { ...officialBody, model: 'midjourney' } },
        { path: '/midjourney/generations', body: { ...officialBody, model: 'midjourney-imagine' } },
      ],
      apiKey,
      signal
    );
    const taskId = pickTaskId(submitted);
    rememberMidjourneyTaskId(signal, taskId);
    const urls = await pollMidjourneyTask(taskId, apiKey, signal);
    const want = Math.max(1, Math.min(4, params.numberOfImages || urls.length || 1));
    const out: string[] = [];
    for (const u of urls.slice(0, want)) out.push(await fetchImageUrlAsBase64(u, signal));
    return out;
  }

  const maxRefs = isDeepWhiteGv2LowpriceImageModel(params.model) ? 16 : 14;
  const refUrls: string[] = [];
  for (const ref of refsRaw.slice(0, maxRefs)) {
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
      out.push(...(await submitImageJobAndFetchBase64(body, apiKey, signal, 1)));
    }
    return out;
  }

  // Image G-2：有参考图 → g2-i2i；无参考图 → g2-t2i（resolution 仅 1k）
  if (isDeepWhiteG2ImageModel(params.model)) {
    const forceI2i =
      params.model === DEEPWHITE_G2_I2I_UI_ID || params.model === 'deepwhiteai-image-g2-i2i';
    if (forceI2i && !refUrls.length) {
      throw new Error('Image G-2 图生图需要至少一张参考图，请连接图片节点。');
    }
    const upstream = refUrls.length > 0 ? 'deepwhiteai-image-g2-i2i' : 'deepwhiteai-image-g2-t2i';
    const body: Record<string, unknown> = {
      model: upstream,
      prompt,
      metadata: { resolution: '1k', ratio: aspect },
    };
    if (refUrls.length) body.images = refUrls.slice(0, 10);
    return submitImageJobAndFetchBase64(body, apiKey, signal, 1);
  }

  // g-v2-lowprice：文生图/图生图；resolution 1k|2k|4k；n 1–10；images≤16
  if (isDeepWhiteGv2LowpriceImageModel(params.model)) {
    const resolution = mapResolutionBand(params.model, params.nodeResolution);
    const n = Math.max(1, Math.min(10, params.numberOfImages || 1));
    const body: Record<string, unknown> = {
      model: 'deepwhiteai-image-g-v2-lowprice',
      prompt,
      n,
      size: aspect,
      metadata: { resolution, size: aspect, ratio: aspect },
    };
    if (refUrls.length) body.images = refUrls.slice(0, 16);
    return submitImageJobAndFetchBase64(body, apiKey, signal, n);
  }

  if (!isDeepWhiteNb2LiteImageModel(params.model) && !isDeepWhiteNb2ImageModel(params.model)) {
    throw new Error(`未支持的 DeepWhite 图像模型：${params.model}`);
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
  return submitImageJobAndFetchBase64(body, apiKey, signal, n);
}

/** Midjourney 二次操作：放大 Imagine 宫格中的第 index 张（1–4） */
export async function deepWhiteMidjourneyUpscale(params: {
  taskId: string;
  index: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const apiKey = requireDeepWhiteKey();
  const taskId = (params.taskId || '').trim();
  if (!taskId) throw new Error('缺少 Midjourney 任务 id，请先完成一次 Imagine。');
  const index = Math.max(1, Math.min(4, Math.round(Number(params.index)) || 1));
  const submitted = await postJsonFirstOk(
    [
      { path: '/mj/submit/change', body: { taskId, action: 'UPSCALE', index } },
      { path: '/mj/submit/simple-change', body: { content: `${taskId} U${index}` } },
      { path: '/midjourney/generations/upscale', body: { task_id: taskId, index, model: 'midjourney' } },
    ],
    apiKey,
    params.signal
  );
  const upscaleTaskId = pickTaskId(submitted);
  const urls = await pollMidjourneyTask(upscaleTaskId, apiKey, params.signal);
  const out: string[] = [];
  for (const u of urls.slice(0, 4)) {
    out.push(await fetchImageUrlAsBase64(u, params.signal));
  }
  if (!out.length) throw new Error('Midjourney 放大成功但未返回图片。');
  return out;
}
