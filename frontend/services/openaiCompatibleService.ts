import {
  getAiProvider,
  getJunlanBaseUrl,
  getJunlanSavedKey,
  getOpenAiBaseUrl,
  getOpenAiSavedKey,
} from './aiSettings';

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/\/v1$/i.test(u)) u = `${u}/v1`;
  return u.replace(/\/+$/, '');
}

function isToApisHost(baseNormalized: string): boolean {
  try {
    const host = new URL(baseNormalized).hostname.toLowerCase();
    return host === 'toapis.com' || host.endsWith('.toapis.com');
  } catch {
    return false;
  }
}

function isDeepSeekHost(baseNormalized: string): boolean {
  try {
    const host = new URL(baseNormalized).hostname.toLowerCase();
    return host === 'api.deepseek.com' || host.endsWith('.deepseek.com');
  } catch {
    return false;
  }
}

/** ToAPIs 异步任务轮询最长等待（文生图 / 图生图等） */
const TOAPIS_TASK_MAX_WAIT_MS = 1_800_000;

/** ToAPIs 视频任务轮询最长等待 */
const TOAPIS_VIDEO_TASK_MAX_WAIT_MS = 1_800_000;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('已取消生成', 'AbortError');
}

async function sleepInterruptible(ms: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('已取消生成', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** ToAPIs：透传 imagen / gemini / gpt-image-* 等模型 id（含 gemini-3.1-flash-image-preview 文生图/图生图） */
function toApisT2iModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m.startsWith('imagen') || m.startsWith('gemini')) return m;
  if (m === 'gpt-image-2' || m === 'gpt-image-1' || m.startsWith('gpt-image')) return m;
  if (m === 'gpt-4o-image') return m;
  if (m === 'dall-e-3' || m === 'dall-e-2') return 'gemini-3-pro-image-preview';
  return m || 'gemini-3-pro-image-preview';
}

function toApisAspectSize(aspectRatio: string): string {
  const allowed = new Set(['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '21:9', '9:21']);
  if (allowed.has(aspectRatio)) return aspectRatio;
  return '1:1';
}

/** ToAPIs Gemini 3.1 Flash Image：输出档位在 metadata.resolution（文档），非顶层 resolution */
function isToApisGemini31FlashImageModel(modelId: string): boolean {
  return (modelId || '').trim() === 'gemini-3.1-flash-image-preview';
}

function toApisGeminiFlashMetadataResolution(nodeRes?: string): '0.5K' | '1K' | '2K' | '4K' {
  const r = (nodeRes || '4k').toLowerCase().replace(/\s/g, '');
  if (r === '0.5k') return '0.5K';
  if (r === '1k') return '1K';
  if (r === '2k') return '2K';
  if (r === '4k') return '4K';
  return '4K';
}

function buildToApisImageGenerationBody(params: {
  model: string;
  promptLine: string;
  size: string;
  nodeResolution?: string;
  image_urls?: string[];
}): Record<string, unknown> {
  const { model, promptLine, size, nodeResolution, image_urls } = params;
  const body: Record<string, unknown> = {
    model,
    prompt: promptLine,
    n: 1,
    size,
    response_format: 'url',
  };
  if (image_urls?.length) body.image_urls = image_urls;

  if (isToApisGemini31FlashImageModel(model)) {
    body.metadata = { resolution: toApisGeminiFlashMetadataResolution(nodeResolution) };
  } else {
    body.resolution = '2K';
  }
  return body;
}

/** 将 ToAPIs 等 CDN 地址改为当前站点同源路径，由 Vite/nginx 代理拉取，避免 CORS */
function rewriteKnownImageCdnToSameOrigin(imageUrl: string): string {
  if (typeof window === 'undefined') return imageUrl;
  try {
    const u = new URL(imageUrl);
    const { origin } = window.location;
    if (u.hostname === 'files.toapis.com') {
      return `${origin}/cdn-files-toapis${u.pathname}${u.search}`;
    }
    if (u.hostname === 'files.dashlyai.cc') {
      return `${origin}/cdn-files-dashlyai${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return imageUrl;
}

async function fetchUrlAsBase64(imageUrl: string, signal?: AbortSignal): Promise<string> {
  const fetchUrl = rewriteKnownImageCdnToSameOrigin(imageUrl);
  const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit', signal });
  if (!res.ok) {
    throw new Error(
      `无法下载生成图 (${res.status})。` +
        (fetchUrl !== imageUrl
          ? '若已部署生产环境，请为 /cdn-files-toapis 与 /cdn-files-dashlyai 配置反向代理到对应 CDN 域名。原始链接：'
          : '若为跨域限制，请直接打开链接保存：') +
        imageUrl.slice(0, 200)
    );
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error('读取生成图二进制失败'));
    reader.readAsDataURL(blob);
  });
}

function sniffMimeFromBase64(raw: string): string {
  if (!raw || raw.length < 8) return 'image/jpeg';
  try {
    const dec = atob(raw.slice(0, 48));
    const a = dec.charCodeAt(0);
    const b = dec.charCodeAt(1);
    if (a === 0xff && b === 0xd8) return 'image/jpeg';
    if (a === 0x89 && b === 0x50) return 'image/png';
    if (a === 0x47 && b === 0x49) return 'image/gif';
    if (a === 0x52 && b === 0x49) return 'image/webp';
  } catch {
    /* ignore */
  }
  return 'image/jpeg';
}

function parseBase64ImageInput(input: string): { raw: string; mime: string } {
  const t = input.trim();
  const m = t.match(/^data:([^;]+);base64,(.+)$/s);
  if (m) return { mime: m[1].split(';')[0].trim(), raw: m[2].replace(/\s/g, '') };
  const raw = t.replace(/\s/g, '');
  return { raw, mime: sniffMimeFromBase64(raw) };
}

function base64ToBlob(raw: string, mime: string): Blob {
  const binary = atob(raw);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/jpeg' });
}

async function toApisUploadImageBlob(blob: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 API Key。');
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch(`${base}/uploads/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ToAPIs 上传参考图失败 (${res.status}): ${text.slice(0, 600)}`);
  }
  let json: { success?: boolean; message?: string; data?: { url?: string } };
  try {
    json = JSON.parse(text) as { success?: boolean; message?: string; data?: { url?: string } };
  } catch {
    throw new Error(`ToAPIs 上传响应无效: ${text.slice(0, 200)}`);
  }
  if (json.success === false || !json.data?.url) {
    throw new Error(json.message || '上传参考图未返回可用 URL');
  }
  return json.data.url;
}

async function toApisEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  modelName: string,
  aspectRatio: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const model = toApisT2iModel(modelName);
  const size = toApisAspectSize(aspectRatio);
  const maxRefs = 16;
  const imageUrls: string[] = [];
  for (const img of base64Images.slice(0, maxRefs)) {
    assertNotAborted(signal);
    const { raw, mime } = parseBase64ImageInput(img);
    const blob = base64ToBlob(raw, mime);
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'jpg';
    imageUrls.push(await toApisUploadImageBlob(blob, `ref.${ext}`, signal));
  }
  if (!imageUrls.length) throw new Error('参考图上传失败');

  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 8);
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const body = buildToApisImageGenerationBody({
      model,
      promptLine: `${prompt}\n\n（画幅比例 ${aspectRatio}）`,
      size,
      nodeResolution,
      image_urls: imageUrls,
    });
    const { id } = await toApisSubmitGeneration(body, signal);
    out.push(await toApisPollTaskToBase64(id, signal));
  }
  return out;
}

async function toApisSubmitGeneration(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ id: string }> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 API Key。');
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `ToAPIs 提交任务失败 (${res.status}): ${text.slice(0, 800)}` +
        (res.status === 503 ? '（服务端暂时不可用或请求格式不匹配，请确认模型与参数。）' : '')
    );
  }
  const json = JSON.parse(text) as { id?: string; error?: { message?: string } };
  if (json.error?.message) throw new Error(`ToAPIs: ${json.error.message}`);
  if (!json.id) throw new Error(`ToAPIs 未返回任务 id：${text.slice(0, 400)}`);
  return { id: json.id };
}

async function toApisPollTaskToBase64(taskId: string, signal?: AbortSignal): Promise<string> {
  const apiKey = getOpenAiSavedKey();
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const deadline = Date.now() + TOAPIS_TASK_MAX_WAIT_MS;
  await sleepInterruptible(2000, signal);

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    const res = await fetch(`${base}/images/generations/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ToAPIs 查询任务失败 (${res.status}): ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text) as {
      status?: string;
      url?: string;
      result?: { data?: { url?: string }[] };
      error?: { message?: string };
    };

    if (data.status === 'completed') {
      const url = data.url || data.result?.data?.[0]?.url;
      if (!url) throw new Error('ToAPIs 任务完成但未返回图片 URL。');
      return fetchUrlAsBase64(url, signal);
    }
    if (data.status === 'failed') {
      throw new Error(`ToAPIs 生成失败: ${data.error?.message || JSON.stringify(data.error)}`);
    }
    await sleepInterruptible(3000, signal);
  }
  throw new Error(
    `ToAPIs 任务超时（已等待超过 ${TOAPIS_TASK_MAX_WAIT_MS / 60_000} 分钟），请稍后重试。`
  );
}

/** ToAPIs grok-video-3：`seconds` 合法值为 6、10、15、20 等；UI 选 5 秒时映射为 6 */
export function toApisGrokVideoSeconds(uiSeconds: number): number {
  const allowed = new Set([6, 10, 15, 20, 25, 30]);
  if (allowed.has(uiSeconds)) return uiSeconds;
  if (uiSeconds === 5) return 6;
  return Math.min(30, Math.max(6, Math.round(uiSeconds)));
}

/** ToAPIs sora-2-vvip：仅支持 4、8、12 秒（文档） */
function toApisSora2VvipDuration(uiSeconds: number): 4 | 8 | 12 {
  if (uiSeconds === 4 || uiSeconds === 8 || uiSeconds === 12) return uiSeconds;
  if (uiSeconds <= 6) return 4;
  if (uiSeconds <= 10) return 8;
  return 12;
}

function toApisSora2VvipAspectRatio(aspectRatio: string): '16:9' | '9:16' {
  return aspectRatio === '9:16' ? '9:16' : '16:9';
}

/** ToAPIs `veo3.1-fast`：`aspect_ratio` 仅 16:9 / 9:16；其它画幅按横屏提交 */
function toApisVeo31FastAspectRatio(aspectRatio: string): '16:9' | '9:16' {
  if (aspectRatio === '9:16') return '9:16';
  return '16:9';
}

async function toApisUploadVideoReferenceImageUrls(
  refs: string[],
  filePrefix: string,
  signal?: AbortSignal
): Promise<string[]> {
  const imageUrls: string[] = [];
  const list = refs.filter(Boolean).slice(0, 3);
  for (let i = 0; i < list.length; i++) {
    assertNotAborted(signal);
    const { raw, mime } = parseBase64ImageInput(list[i]);
    const blob = base64ToBlob(raw, mime);
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
    imageUrls.push(await toApisUploadImageBlob(blob, `${filePrefix}-${i}.${ext}`, signal));
  }
  return imageUrls;
}

export type ToApisVideoModelId = 'grok-video-3' | 'sora-2-vvip' | 'veo3.1-fast';

function isHttpUrlString(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

/**
 * ToAPIs 各模型完成态略有差异：标准形为 result.data[0].url；
 * 部分任务可能为 result.data.url、result.video.url、顶层 output 等。
 */
function extractVideoUrlFromPollPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;

  if (isHttpUrlString(o.url)) return o.url.trim();
  for (const k of ['video_url', 'download_url', 'file_url'] as const) {
    const v = o[k];
    if (isHttpUrlString(v)) return v.trim();
  }

  let result: unknown = o.result;
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result) as unknown;
    } catch {
      /* ignore */
    }
  }
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (isHttpUrlString(r.url)) return r.url.trim();
    for (const k of ['video_url', 'download_url', 'file_url'] as const) {
      const v = r[k];
      if (isHttpUrlString(v)) return v.trim();
    }

    const d = r.data;
    if (Array.isArray(d)) {
      for (const item of d) {
        if (item && typeof item === 'object') {
          const u = (item as Record<string, unknown>).url;
          if (isHttpUrlString(u)) return u.trim();
        }
      }
    } else if (d && typeof d === 'object') {
      const rd = d as Record<string, unknown>;
      if (isHttpUrlString(rd.url)) return rd.url.trim();
      const vid = rd.video;
      if (vid && typeof vid === 'object' && isHttpUrlString((vid as Record<string, unknown>).url)) {
        return String((vid as Record<string, unknown>).url).trim();
      }
    }

    const video = r.video;
    if (video && typeof video === 'object' && isHttpUrlString((video as Record<string, unknown>).url)) {
      return String((video as Record<string, unknown>).url).trim();
    }

    const outputs = r.outputs;
    if (Array.isArray(outputs)) {
      for (const item of outputs) {
        if (item && typeof item === 'object') {
          const u = (item as Record<string, unknown>).url;
          if (isHttpUrlString(u)) return u.trim();
        }
      }
    }
  }

  const output = o.output;
  if (output && typeof output === 'object' && isHttpUrlString((output as Record<string, unknown>).url)) {
    return String((output as Record<string, unknown>).url).trim();
  }

  return null;
}

function isVideoTaskCompletedStatus(status: unknown): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'succeeded' || s === 'success' || s === 'done';
}

async function toApisSubmitVideoGeneration(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ id: string }> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 API Key。');
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const res = await fetch(`${base}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ToAPIs 视频任务提交失败 (${res.status}): ${text.slice(0, 800)}`);
  }
  const json = JSON.parse(text) as { id?: string; error?: { message?: string } };
  if (json.error?.message) throw new Error(`ToAPIs: ${json.error.message}`);
  if (!json.id) throw new Error(`ToAPIs 未返回视频任务 id：${text.slice(0, 400)}`);
  return { id: json.id };
}

async function toApisPollVideoTaskToPlayableUrl(taskId: string, signal?: AbortSignal): Promise<string> {
  const apiKey = getOpenAiSavedKey();
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const deadline = Date.now() + TOAPIS_VIDEO_TASK_MAX_WAIT_MS;
  await sleepInterruptible(5000, signal);

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    const res = await fetch(`${base}/videos/generations/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ToAPIs 查询视频任务失败 (${res.status}): ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text) as {
      status?: string;
      url?: string;
      result?: unknown;
      error?: { message?: string; code?: string };
    };

    if (isVideoTaskCompletedStatus(data.status)) {
      const rawUrl = extractVideoUrlFromPollPayload(data);
      if (!rawUrl) {
        throw new Error(
          `ToAPIs 视频任务完成但未返回可播放 URL。响应片段：${text.slice(0, 600)}`
        );
      }
      return rewriteKnownImageCdnToSameOrigin(rawUrl);
    }
    const st = String(data.status || '').toLowerCase();
    if (st === 'failed') {
      throw new Error(`ToAPIs 视频生成失败: ${data.error?.message || JSON.stringify(data.error)}`);
    }
    await sleepInterruptible(10_000, signal);
  }
  throw new Error(
    `ToAPIs 视频任务超时（已等待超过 ${TOAPIS_VIDEO_TASK_MAX_WAIT_MS / 60_000} 分钟），请稍后重试。`
  );
}

/**
 * ToAPIs：`grok-video-3` 文生视频 / 图生视频（参考图需先走 `/uploads/images` 得到 URL）。
 * 文档：https://docs.toapis.com/docs/cn/api-reference/videos/grok-video/generation
 *
 * 分辨率：xAI 官方视频 API 支持 `resolution: "480p" | "720p"`；ToAPIs 当前文档示例未包含该字段，
 * 若服务端请求体未映射此键，JSON 会被忽略，输出可能固定为 480p。请求体同时附带 `resolution` 与
 * `resolution_name`（部分聚合接口使用后者），以便在网关支持时生效。
 */
export async function toApisGrokVideoGenerate(params: {
  prompt: string;
  /** 界面秒数；5 会映射为 API 最小 6 秒 */
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p';
  /** 最多 3 张（ToAPIs 文档）；多张会先上传再传 URL */
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  if (getAiProvider() !== 'openai-compatible') {
    throw new Error(
      '视频生成需在「设置 → API」中选择「OpenAI 兼容」，并将 Base URL 设为 ToAPIs（https://toapis.com/v1）。'
    );
  }
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  if (!isToApisHost(base)) {
    throw new Error('视频生成当前仅支持 ToAPIs：请将 Base URL 设为 https://toapis.com/v1');
  }
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key。');

  const seconds = toApisGrokVideoSeconds(params.durationSeconds);
  const aspect_ratio = toApisAspectSize(params.aspectRatio);

  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'grok-video-ref',
    params.signal
  );

  const resolution = params.resolution === '480p' ? '480p' : '720p';
  const body: Record<string, unknown> = {
    model: 'grok-video-3',
    prompt: params.prompt,
    seconds: String(seconds),
    aspect_ratio,
    resolution,
    /** 与部分 Grok 视频网关字段名对齐；ToAPIs 若未读此键则无影响 */
    resolution_name: resolution,
  };
  if (imageUrls.length) body.images = imageUrls;

  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

/**
 * ToAPIs：`sora-2-vvip` 文生视频 / 图生视频。
 * 文档：https://docs.toapis.com/docs/cn/api-reference/videos/sora2/generation
 * - `duration` 仅 4 / 8 / 12；`aspect_ratio` 仅 16:9、9:16；参考图为 `image_urls`。
 */
export async function toApisSora2VvipVideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  /** 固定按产品需求走 720p；同时写入 resolution 供网关透传 */
  resolution: '480p' | '720p';
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  if (getAiProvider() !== 'openai-compatible') {
    throw new Error(
      '视频生成需在「设置 → API」中选择「OpenAI 兼容」，并将 Base URL 设为 ToAPIs（https://toapis.com/v1）。'
    );
  }
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  if (!isToApisHost(base)) {
    throw new Error('视频生成当前仅支持 ToAPIs：请将 Base URL 设为 https://toapis.com/v1');
  }
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key。');

  const duration = toApisSora2VvipDuration(params.durationSeconds);
  const aspect_ratio = toApisSora2VvipAspectRatio(params.aspectRatio);
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'sora-video-ref',
    params.signal
  );

  const res = params.resolution === '480p' ? '480p' : '720p';
  const body: Record<string, unknown> = {
    model: 'sora-2-vvip',
    prompt: params.prompt,
    duration,
    aspect_ratio,
    resolution: res,
    resolution_name: res,
  };
  if (imageUrls.length) body.image_urls = imageUrls;

  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

/**
 * ToAPIs：`veo3.1-fast`（Veo3 视频生成）。
 * 文档：https://docs.toapis.com/docs/cn/api-reference/videos/veo3/generation
 * - `duration` 文档为固定 8；`aspect_ratio`：16:9 / 9:16；`metadata.resolution`：720p / 1080p / 4k
 * - 参考图需先 `/uploads/images` 得到 URL，写入 `image_urls`
 */
async function toApisVeo31FastVideoGenerate(params: {
  prompt: string;
  aspectRatio: string;
  resolution: '720p' | '1080p' | '4k';
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  if (getAiProvider() !== 'openai-compatible') {
    throw new Error(
      '视频生成需在「设置 → API」中选择「OpenAI 兼容」，并将 Base URL 设为 ToAPIs（https://toapis.com/v1）。'
    );
  }
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  if (!isToApisHost(base)) {
    throw new Error('视频生成当前仅支持 ToAPIs：请将 Base URL 设为 https://toapis.com/v1');
  }
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key。');

  const aspect_ratio = toApisVeo31FastAspectRatio(params.aspectRatio);
  const resolution =
    params.resolution === '1080p' ? '1080p' : params.resolution === '4k' ? '4k' : '720p';

  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'veo-video-ref',
    params.signal
  );

  const body: Record<string, unknown> = {
    model: 'veo3.1-fast',
    prompt: params.prompt,
    duration: 8,
    aspect_ratio,
    metadata: {
      resolution,
      enable_gif: false,
    },
  };
  if (imageUrls.length) body.image_urls = imageUrls;

  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

export async function toApisCanvasVideoGenerate(params: {
  prompt: string;
  videoModel: ToApisVideoModelId;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p' | '4k';
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  if (params.videoModel === 'veo3.1-fast') {
    const res =
      params.resolution === '1080p' || params.resolution === '4k'
        ? params.resolution
        : '720p';
    return toApisVeo31FastVideoGenerate({
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      resolution: res,
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
  if (params.videoModel === 'sora-2-vvip') {
    return toApisSora2VvipVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution === '480p' ? '480p' : '720p',
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
  return toApisGrokVideoGenerate({
    prompt: params.prompt,
    durationSeconds: params.durationSeconds,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution === '480p' ? '480p' : '720p',
    referenceImagesBase64: params.referenceImagesBase64,
    signal: params.signal,
  });
}

async function toApisGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  modelName: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const model = toApisT2iModel(modelName);
  const size = toApisAspectSize(aspectRatio);
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 8);

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const body = buildToApisImageGenerationBody({
      model,
      promptLine: `${prompt}\n\n（画幅比例 ${aspectRatio}）`,
      size,
      nodeResolution,
    });
    const { id } = await toApisSubmitGeneration(body, signal);
    const b64 = await toApisPollTaskToBase64(id, signal);
    out.push(b64);
  }
  return out;
}

function aspectRatioToOpenAiSize(aspectRatio: string, model: string): string {
  if (model === 'dall-e-2') return '1024x1024';
  const map: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1024x1024',
    '3:4': '1024x1792',
    '21:9': '1792x1024',
    '2:1': '1792x1024',
  };
  return map[aspectRatio] || '1024x1024';
}

function resolveT2iModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m === 'dall-e-2' || m === 'dall-e-3' || m === 'gpt-image-2' || m === 'gpt-image-1') return m;
  return 'dall-e-3';
}

function resolveEditModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m === 'gpt-image-2') return 'gpt-image-2';
  if (m === 'dall-e-2' || m === 'gpt-image-1') return m;
  if (m === 'dall-e-3') return 'gpt-image-1';
  return 'gpt-image-1';
}

function resolveChatModelForBase(baseNormalized: string, modelName: string): string {
  const m = (modelName || '').trim();
  if (isToApisHost(baseNormalized)) {
    if (m) return m;
    return 'gemini-3-pro-preview';
  }
  if (isDeepSeekHost(baseNormalized)) {
    if (m === 'deepseek-chat' || m === 'deepseek-reasoner') return m;
    if (m.startsWith('deepseek-')) return m;
    return 'deepseek-chat';
  }
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3')) return m;
  if (m.startsWith('deepseek-')) return m;
  // ToAPIs 等网关使用 Gemini 模型 id 透传；其它 OpenAI 兼容站若也支持该 id，同样原样发送
  if (m === 'gemini-2.0-flash-official' || m === 'gemini-3.1-flash-lite-preview-official') return m;
  const geminiToOpenAi: Record<string, string> = {
    'gemini-2.5-flash': 'gpt-4o-mini',
    'gemini-3.1-flash-preview': 'gpt-4o',
    'gemini-3-pro-preview': 'gpt-4o',
  };
  return geminiToOpenAi[m] || 'gpt-4o-mini';
}

function resolveChatModel(modelName: string): string {
  return resolveChatModelForBase(normalizeBaseUrl(getOpenAiBaseUrl()), modelName);
}

function buildPromptWithDimensions(prompt: string, aspectRatio: string): string {
  const size = aspectRatioToOpenAiSize(aspectRatio, 'dall-e-3');
  return `Aspect ratio target: ${aspectRatio} (prefer composition matching ${size}).\n\n${prompt}`;
}

async function jpegBase64ToPngBlob(base64: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建画布上下文'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('PNG 编码失败'))),
        'image/png'
      );
    };
    img.onerror = () => reject(new Error('参考图解码失败'));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

async function postJsonAtBase<T>(base: string, path: string, body: unknown, apiKey: string): Promise<T> {
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 503
        ? '（503：上游不可用，或该网关不支持当前 OpenAI 同步文生图格式；若使用 ToAPIs，请把 Base URL 设为 https://toapis.com/v1 。）'
        : '';
    throw new Error(`兼容接口错误 (${res.status}): ${text.slice(0, 800)}${hint}`);
  }
  return JSON.parse(text) as T;
}

async function generateImagesAtOpenAiCompatibleBase(
  baseNorm: string,
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  resolvedModel: string,
  signal?: AbortSignal
): Promise<string[]> {
  const size = aspectRatioToOpenAiSize(aspectRatio, resolvedModel);
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const out: string[] = [];
  const onePerRequest =
    resolvedModel === 'dall-e-3' || resolvedModel === 'gpt-image-2' || resolvedModel === 'gpt-image-1';
  if (onePerRequest) {
    for (let i = 0; i < numberOfImages; i++) {
      assertNotAborted(signal);
      const json = await postJsonAtBase<{ data?: { b64_json?: string }[] }>(
        baseNorm,
        '/images/generations',
        {
          model: resolvedModel,
          prompt: enhancedPrompt,
          n: 1,
          size,
          response_format: 'b64_json',
        },
        apiKey
      );
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error('文生图接口未返回图片数据。');
      out.push(b64);
    }
  } else {
    const n = Math.min(Math.max(numberOfImages, 1), 10);
    assertNotAborted(signal);
    const json = await postJsonAtBase<{ data?: { b64_json?: string }[] }>(
      baseNorm,
      '/images/generations',
      {
        model: 'dall-e-2',
        prompt: enhancedPrompt,
        n,
        size,
        response_format: 'b64_json',
      },
      apiKey
    );
    const list = json.data?.map(d => d.b64_json).filter(Boolean) as string[];
    if (!list.length) throw new Error('文生图接口未返回图片数据。');
    out.push(...list);
  }
  return out;
}

async function editImagesAtOpenAiCompatibleBase(
  baseNorm: string,
  apiKey: string,
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  resolvedEditModel: string,
  aspectRatio: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const size = resolvedEditModel === 'dall-e-2' ? '1024x1024' : '1024x1024';
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const pngBlob = await jpegBase64ToPngBlob(base64Images[0]);
  const results: string[] = [];
  const count = Math.min(
    Math.max(numberOfImages, 1),
    resolvedEditModel === 'dall-e-2' ? 10 : resolvedEditModel === 'gpt-image-2' ? 4 : 1
  );

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const form = new FormData();
    form.append('image', pngBlob, 'ref.png');
    form.append('prompt', enhancedPrompt);
    form.append('model', resolvedEditModel);
    form.append('n', '1');
    form.append('size', size);

    const res = await fetch(`${baseNorm}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`图生图接口错误 (${res.status}): ${text.slice(0, 800)}`);
    }
    const json = JSON.parse(text) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error('图生图接口未返回图片数据。');
    results.push(b64);
  }

  return results;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  return postJsonAtBase<T>(base, path, body, apiKey);
}

export async function openAiGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  modelName: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const rawModel = (modelName || '').trim();
  if (rawModel === 'gpt-image-2-junlan') {
    const apiKey = getJunlanSavedKey();
    if (!apiKey) {
      throw new Error(
        '未配置君澜 AI API Key。请在「设置 → API」中填写「君澜 AI（GPT Image 2）」密钥（与 ToAPIs / 主 OpenAI 兼容通道分开）。'
      );
    }
    const jlBase = normalizeBaseUrl(getJunlanBaseUrl());
    return generateImagesAtOpenAiCompatibleBase(
      jlBase,
      apiKey,
      prompt,
      aspectRatio,
      numberOfImages,
      'gpt-image-2',
      signal
    );
  }

  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  if (isToApisHost(base)) {
    return toApisGenerateNewImage(prompt, aspectRatio, numberOfImages, modelName, nodeResolution, signal);
  }

  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  const model = resolveT2iModel(modelName);
  return generateImagesAtOpenAiCompatibleBase(base, apiKey, prompt, aspectRatio, numberOfImages, model, signal);
}

export async function openAiEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  modelName: string,
  aspectRatio: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const rawModel = (modelName || '').trim();
  if (rawModel === 'gpt-image-2-junlan') {
    const apiKey = getJunlanSavedKey();
    if (!apiKey) {
      throw new Error(
        '未配置君澜 AI API Key。请在「设置 → API」中填写「君澜 AI（GPT Image 2）」密钥（与 ToAPIs 主通道分开）。'
      );
    }
    const jlBase = normalizeBaseUrl(getJunlanBaseUrl());
    return editImagesAtOpenAiCompatibleBase(
      jlBase,
      apiKey,
      base64Images,
      prompt,
      numberOfImages,
      'gpt-image-2',
      aspectRatio,
      signal
    );
  }

  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  if (isToApisHost(normalizeBaseUrl(getOpenAiBaseUrl()))) {
    return toApisEditImage(base64Images, prompt, numberOfImages, modelName, aspectRatio, nodeResolution, signal);
  }
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key。');
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const model = resolveEditModel(modelName);
  return editImagesAtOpenAiCompatibleBase(base, apiKey, base64Images, prompt, numberOfImages, model, aspectRatio, signal);
}

/** 多轮对话：OpenAI / DeepSeek 兼容 /chat/completions */
export type ChatCompletionHistoryTurn = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 仅 user：可选单张参考图（与 imageBase64s 并存时合并） */
  imageBase64?: string;
  /** 仅 user：多张参考图（Vision） */
  imageBase64s?: string[];
};

export async function chatCompletionHistoryAtBase(
  baseUrlRaw: string,
  apiKey: string,
  modelName: string,
  turns: ChatCompletionHistoryTurn[]
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error('未配置对话 API Key。');
  if (!turns.length) throw new Error('对话内容为空。');
  const base = normalizeBaseUrl(baseUrlRaw);
  const model = resolveChatModelForBase(base, modelName);

  const messages = turns.map((turn) => {
    if (turn.role === 'assistant') {
      return { role: 'assistant' as const, content: turn.content };
    }
    if (turn.role === 'system') {
      return { role: 'system' as const, content: turn.content };
    }
    const imgs: string[] = [];
    if (turn.imageBase64s?.length) imgs.push(...turn.imageBase64s);
    if (turn.imageBase64) imgs.push(turn.imageBase64);
    if (imgs.length > 0) {
      const parts: Array<{ type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string }> = [];
      for (const b64 of imgs) {
        parts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } });
      }
      parts.push({ type: 'text', text: turn.content });
      return {
        role: 'user' as const,
        content: parts,
      };
    }
    return { role: 'user' as const, content: turn.content };
  });

  const json = await postJsonAtBase<{ choices?: { message?: { content?: string } }[] }>(
    base,
    '/chat/completions',
    {
      model,
      messages,
    },
    key
  );
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('对话接口未返回文本内容。');
  return text;
}

/** 指定 Base URL 与密钥的对话（用于 DeepSeek 等与全局 OpenAI 兼容配置分离的场景） */
export async function chatCompletionAtBase(
  baseUrlRaw: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  base64Image?: string
): Promise<string> {
  return chatCompletionHistoryAtBase(baseUrlRaw, apiKey, modelName, [
    { role: 'user', content: prompt, imageBase64: base64Image },
  ]);
}

export async function openAiChatCompletion(
  prompt: string,
  base64Image?: string,
  modelName: string = 'gpt-4o-mini'
): Promise<string> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  return chatCompletionAtBase(getOpenAiBaseUrl(), apiKey, modelName, prompt, base64Image);
}
