import {
  DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
  normalizeDeepSeekChatModelId,
  getAiProvider,
  getCodesonlineBaseUrl,
  getCodesonlineSavedKey,
  getJunlanBaseUrl,
  getJunlanSavedKey,
  getNewApiBaseUrl,
  getNewApiSavedKey,
  getOpenAiBaseUrl,
  getOpenAiSavedKey,
  getGaoruiBaseUrl,
  getGaoruiSavedKey,
} from './aiSettings';

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/\/v1$/i.test(u)) u = `${u}/v1`;
  return u.replace(/\/+$/, '');
}

/**
 * 部分自建 OpenAI 兼容网关（如 yunzhi-ai.top）未返回 Access-Control-Allow-Origin，浏览器会拦截。
 * 开发环境走 Vite `server.proxy`（/yunzhi-openai 或 /api/yunzhi-proxy）。
 * 生产构建（import.meta.env.PROD）直接请求 /api/yunzhi-proxy/...，由 Vercel Serverless 转发，避免部分环境下 /yunzhi-openai rewrite 对 POST 仍 405。
 */
function yunzhiSameOriginProxyPathPrefix(): '/api/yunzhi-proxy' | '/yunzhi-openai' {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/yunzhi-proxy';
  }
  return '/yunzhi-openai';
}

/** image.codesonline.dev 常未对浏览器开放 CORS；生产走 Vercel rewrite、开发走 Vite 同源代理 */
function rewriteCodesonlineImageBaseForBrowserCors(baseNormalized: string): string {
  if (typeof window === 'undefined') return baseNormalized;
  try {
    const u = new URL(baseNormalized);
    if (u.hostname.toLowerCase() !== 'image.codesonline.dev') return baseNormalized;
    const pathname = u.pathname.replace(/\/+$/, '') || '/v1';
    return `${window.location.origin}/codesonline-image-api${pathname}`;
  } catch {
    return baseNormalized;
  }
}

function rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNormalized: string): string {
  if (typeof window === 'undefined') return baseNormalized;
  let next = baseNormalized;
  try {
    const u = new URL(baseNormalized);
    const hostname = u.hostname.toLowerCase();
    if (hostname === 'yunzhi-ai.top') {
      let pathname = u.pathname.replace(/\/+$/, '');
      if (!pathname) pathname = '/v1';
      next = `${window.location.origin}${yunzhiSameOriginProxyPathPrefix()}${pathname}`;
    }
  } catch {
    /* keep next */
  }
  return rewriteCodesonlineImageBaseForBrowserCors(next);
}

/** 502/504 等为网关层错误，多为上游或反向代理；与 Chrome 扩展报的 runtime.lastError 无关 */
function openAiCompatFailureHint(status: number, kind: 'generations-json' | 'image-edit'): string {
  if (status === 404) {
    return kind === 'image-edit'
      ? '（404：请确认请求为 POST multipart；开发环境须在 frontend 目录启动 Vite 以启用 /yunzhi-openai 代理；若直连云智正常而此处 404，多为路径未正确转发或上游未开放该路由。）'
      : '（404：请检查 Base URL 与路径；开发环境需 Vite 代理 /yunzhi-openai。）';
  }
  if (status === 502 || status === 504) {
    return '（502/504：多为上游 API（如云智 yunzhi-ai.top）或本站 /yunzhi-openai 转发暂时失败、超时；请稍后重试、检查密钥与上游状态，图生图可尝试缩小参考图。）';
  }
  if (status === 503) {
    return kind === 'generations-json'
      ? '（503：上游不可用，或该网关不支持当前 OpenAI 同步文生图格式；若使用 ToAPIs，请把 Base URL 设为 https://toapis.com/v1 。云智长耗时流式接口若经 Vercel 部署，请使用含 api/yunzhi-proxy/ 路径代理的仓库版本，以免边缘 rewrite 超时。）'
      : '（503：上游不可用或暂时过载。）';
  }
  if (status === 413) {
    return '（413：请求体过大；经本站代理时单次 JSON 不宜超过约 4MB。已自动尝试上传参考图 URL 与压缩；若仍失败请换更小参考图或检查云智是否开放 /v1/uploads/images。）';
  }
  return '';
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

/** 判断是否为君澜 AI 域名（www.junlanai.com） */
function isJunlanHost(baseNormalized: string): boolean {
  try {
    const host = new URL(baseNormalized).hostname.toLowerCase();
    return host === 'www.junlanai.com' || host.endsWith('.junlanai.com');
  } catch {
    return false;
  }
}

/** 画布节点 id；上游 New API 请求 model 为去掉 `-newapi` 后的 id（与 ToAPIs 的 gemini-3-pro-image-preview 等区分） */
function isNewApiFireflyCanvasModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === 'firefly-nano-banana-pro-newapi' || m === 'firefly-nano-banana2-newapi';
}

function newApiFireflyUpstreamModelId(modelName: string): string {
  return (modelName || '').trim().replace(/-newapi$/i, '');
}

/** 部分 New API 通道登记为去后缀 id（常见），少数与后台「模型名」带 -newapi 一致；优先去后缀以匹配 model_not_found 报错 */
function newApiFireflyRequestModelCandidates(canvasModelId: string): string[] {
  const id = (canvasModelId || '').trim();
  if (!id) return [];
  const stripped = id.replace(/-newapi$/i, '');
  const out: string[] = [];
  for (const m of [stripped, id]) {
    const t = m.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** ToAPIs 异步任务轮询最长等待（文生图 / 图生图等） */
const TOAPIS_TASK_MAX_WAIT_MS = 1_800_000;

/** 高瑞 AI 异步任务轮询最长等待 */
const GAORUI_TASK_MAX_WAIT_MS = 1_800_000;

/** ToAPIs 视频任务轮询最长等待 */
const TOAPIS_VIDEO_TASK_MAX_WAIT_MS = 1_800_000;

/** 高瑞 AI：提交生图任务 */
async function gaoruiSubmitImageGeneration(
  baseNorm: string,
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  signal?: AbortSignal
): Promise<{ id: string }> {
  // 高瑞 API 提交接口是 /v1/nano-banana（不是 /v1/images/generations）
  const fetchBase = rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm);
  
  const body = {
    model,
    prompt,
    imageSize: '4K',  // 高瑞支持 1K, 2K, 4K
    aspectRatio,       // 高瑞支持的宽高比：1:1, 16:9, 9:16, 4:3, 3:4, 21:9
    images: [],        // 空数组表示文生图
    webHook: '-1',
    shutProgress: false,
  };
  console.log('[高瑞] 提交请求:', `${fetchBase}/nano-banana`, body);
  
  const res = await fetch(`${fetchBase}/nano-banana`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  
  const text = await res.text();
  console.log('[高瑞] 提交响应:', res.status, text.slice(0, 1000));
  
  if (!res.ok) {
    throw new Error(`高瑞 AI 提交任务失败 (${res.status}): ${text.slice(0, 800)}`);
  }
  
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`高瑞 AI 响应无效: ${text.slice(0, 400)}`);
  }
  
  if (json.code !== 0 && json.code !== undefined) {
    throw new Error(`高瑞 AI: ${json.msg || JSON.stringify(json)}`);
  }
  
  // 高瑞返回格式: { code: 0, data: { id: "14-xxx", type: "text2image" } }
  const data = json.data as Record<string, unknown> | undefined;
  if (!data?.id) {
    throw new Error(`高瑞 AI 未返回任务 id：${text.slice(0, 400)}`);
  }
  
  return { id: data.id as string };
}

/** 高瑞 AI：轮询生图任务状态 */
async function gaoruiPollImageTask(
  baseNorm: string,
  apiKey: string,
  taskId: string,
  signal?: AbortSignal
): Promise<string> {
  // 高瑞 API 的 /fetch 接口不在 /v1 下面，需要去掉 /v1
  const baseWithoutV1 = baseNorm.replace(/\/v1$/, '');
  const deadline = Date.now() + GAORUI_TASK_MAX_WAIT_MS;
  await sleepInterruptible(3000, signal);

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    
    // 高瑞 API 查询接口是 /fetch/{task_id}，不在 /v1 下
    const pollUrl = `${baseWithoutV1}/fetch/${taskId}`;
    const res = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const text = await res.text();
    
    if (!res.ok) {
      await sleepInterruptible(3000, signal);
      continue;
    }
    
    const data = JSON.parse(text) as {
      status?: string;
      url?: string;
      data?: {
        status?: string;
        url?: string;
        progress?: number;
        error?: string;
        originData?: {
          status?: string;
          progress?: number;
          error?: string;
          failure_reason?: string;
          results?: { url?: string; content?: string }[];
        };
      };
    };

    // 高瑞返回格式: { code: 0, data: { status, url, originData: { results: [{ url }] } } }
    const innerData = data.data || data;
    const status = innerData.status || data.status;
    const errorMsg = innerData.error || innerData.originData?.failure_reason || innerData.originData?.error;
    
    // 标准化状态：pending/queued -> pending, processing/running -> processing, succeeded -> succeeded, failed -> failed
    const normalizedStatus = status === 'running' ? 'processing' : status;
    const completed = normalizedStatus === 'succeeded';
    const failed = normalizedStatus === 'failed';

    if (failed) {
      throw new Error(`高瑞 AI 生成失败: ${errorMsg || '未知错误'}`);
    }

    if (completed) {
      const rawUrl =
        innerData.url ||
        innerData.originData?.results?.[0]?.url;

      if (!rawUrl) {
        throw new Error(`高瑞 AI 任务完成但未返回图片 URL。响应: ${text.slice(0, 500)}`);
      }

      let imageUrl = rawUrl;
      if (rawUrl.startsWith('/')) {
        imageUrl = `${baseWithoutV1}${rawUrl}`;
      }

      try {
        const imgRes = await fetch(imageUrl, { signal });
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('读取图片失败'));
            reader.readAsDataURL(blob);
          });
        }
      } catch {
        // 下载失败，尝试标准方式
      }

      return fetchUrlAsBase64(imageUrl, signal, apiKey);
    }
    await sleepInterruptible(3000, signal);
  }
  throw new Error(`高瑞 AI 任务超时（已等待超过 ${GAORUI_TASK_MAX_WAIT_MS / 60_000} 分钟），请稍后重试。`);
}

/** 高瑞 AI：文生图 */
async function gaoruiGenerateNewImage(
  baseNorm: string,
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  model: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 4);

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const { id } = await gaoruiSubmitImageGeneration(baseNorm, apiKey, model, prompt, aspectRatio, signal);
    out.push(await gaoruiPollImageTask(baseNorm, apiKey, id, signal));
  }
  return out;
}

/** 高瑞 AI：提交图生图任务 */
async function gaoruiSubmitImageEdit(
  baseNorm: string,
  apiKey: string,
  model: string,
  base64Images: string[],
  prompt: string,
  signal?: AbortSignal
): Promise<{ id: string }> {
  const fetchBase = rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm);
  // 先上传参考图
  const imageUrls: string[] = [];
  for (const base64 of base64Images) {
    assertNotAborted(signal);
    const { raw, mime } = parseBase64ImageInput(base64);
    const blob = base64ToBlob(raw, mime);
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const url = await openAiCompatUploadImageBlob(baseNorm, apiKey, blob, `ref.${ext}`, signal);
    imageUrls.push(url);
  }

  const res = await fetch(`${fetchBase}/images/edits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      image_urls: imageUrls,
      response_format: 'url',
    }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`高瑞 AI 图生图提交任务失败 (${res.status}): ${text.slice(0, 800)}`);
  }
  const json = JSON.parse(text) as { id?: string; error?: { message?: string } };
  if (json.error?.message) throw new Error(`高瑞 AI: ${json.error.message}`);
  if (!json.id) throw new Error(`高瑞 AI 图生图未返回任务 id：${text.slice(0, 400)}`);
  return { id: json.id };
}

/** 高瑞 AI：图生图 */
async function gaoruiEditImage(
  baseNorm: string,
  apiKey: string,
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  model: string,
  aspectRatio: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 4);

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const { id } = await gaoruiSubmitImageEdit(baseNorm, apiKey, model, base64Images, prompt, signal);
    out.push(await gaoruiPollImageTask(baseNorm, apiKey, id, signal));
  }
  return out;
}

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
  if (/^firefly-nano-banana.*-newapi$/i.test(m)) return newApiFireflyUpstreamModelId(m);
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
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

/** 文生图同步接口若返回临时图片 URL，仍指向 yunzhi 时需经同源代理拉取，否则浏览器二次跨域失败 */
function rewriteYunzhiAssetUrlToSameOriginProxy(imageUrl: string): string {
  if (typeof window === 'undefined') return imageUrl;
  try {
    const u = new URL(imageUrl);
    if (u.hostname.toLowerCase() === 'yunzhi-ai.top') {
      return `${window.location.origin}${yunzhiSameOriginProxyPathPrefix()}${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return imageUrl;
}

async function fetchUrlAsBase64(imageUrl: string, signal?: AbortSignal, bearerToken?: string): Promise<string> {
  let fetchUrl = rewriteYunzhiAssetUrlToSameOriginProxy(imageUrl);
  fetchUrl = rewriteKnownImageCdnToSameOrigin(fetchUrl);
  const headers: Record<string, string> = {};
  if (bearerToken?.trim()) {
    headers.Authorization = `Bearer ${bearerToken.trim()}`;
  }
  const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit', signal, headers });
  if (!res.ok) {
    throw new Error(
      `无法下载生成图 (${res.status})。` +
        (fetchUrl !== imageUrl
          ? '同源代理拉取失败：若为云智等网关，生成图 URL 常需携带与文生图相同的 Bearer Token（已自动附带）；仍 502 时请检查密钥权限或上游服务。原始链接：'
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

/**
 * 云智文档建议压缩参考图；经本站 /api/yunzhi-proxy 转发时 JSON 过大易 413（Vercel FUNCTION_PAYLOAD_TOO_LARGE）。
 * 将任意参考图压为 JPEG data URL，长边不超过 maxSide。
 */
async function shrinkBase64ImageToJpegDataUrl(
  base64Input: string,
  maxSide: number,
  jpegQuality: number
): Promise<string> {
  const { raw, mime } = parseBase64ImageInput(base64Input);
  const src = `data:${mime || 'image/jpeg'};base64,${raw}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        reject(new Error('参考图尺寸无效'));
        return;
      }
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建画布'));
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('JPEG 编码失败'));
            return;
          }
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error('读取编码结果失败'));
          fr.readAsDataURL(blob);
        },
        'image/jpeg',
        jpegQuality
      );
    };
    img.onerror = () => reject(new Error('参考图解码失败'));
    img.src = src;
  });
}

/**
 * 云智 chat/completions 图生图/视频参考图：优先上传得公网 URL（请求体小，避免代理 413），失败则压缩为 JPEG data URI。
 * @see 云智API调用文档.md（参考图 base64；建议压缩）
 */
async function buildYunzhiChatContentImageParts(
  baseNorm: string,
  apiKey: string,
  base64Images: string[],
  uploadNamePrefix: string,
  signal?: AbortSignal
): Promise<Array<{ type: 'image_url'; image_url: { url: string } }>> {
  const key = apiKey.trim();
  const out: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
  const maxSide = 1536;
  const jpegQ = 0.82;
  for (let i = 0; i < base64Images.length; i++) {
    assertNotAborted(signal);
    const img = base64Images[i];
    let uploaded: string | null = null;
    if (key) {
      try {
        const parsed = parseBase64ImageInput(img);
        const blob = base64ToBlob(parsed.raw, parsed.mime || 'image/jpeg');
        const mimeStr = String(parsed.mime || '').toLowerCase();
        const ext = mimeStr.includes('png')
          ? 'png'
          : mimeStr.includes('webp')
            ? 'webp'
            : mimeStr.includes('gif')
              ? 'gif'
              : 'jpg';
        uploaded = await openAiCompatUploadImageBlob(baseNorm, key, blob, `${uploadNamePrefix}-${i}.${ext}`, signal);
      } catch {
        uploaded = null;
      }
    }
    const u = uploaded?.trim() ?? '';
    if (u && /^https?:\/\//i.test(u)) {
      out.push({ type: 'image_url', image_url: { url: u } });
      continue;
    }
    const dataUrl = await shrinkBase64ImageToJpegDataUrl(img, maxSide, jpegQ);
    out.push({ type: 'image_url', image_url: { url: dataUrl } });
  }
  return out;
}

/** JSON generations 请求体是否含公网 URL 参考图（多数网关仅在此情况下真正绑定参考图） */
function isStrongRefBindingJsonBody(body: Record<string, unknown>): boolean {
  const hasHttp = (s: string) => /^https?:\/\//i.test(s.trim());
  const check = (v: unknown): boolean => {
    if (typeof v === 'string') return hasHttp(v);
    if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && hasHttp(x));
    return false;
  };
  return check(body.image_urls) || check(body.image) || check(body.images);
}

/** OpenAI 兼容（New API / 云智 / ToAPIs）上传参考图，返回上游可拉取的 URL，用于 image_urls 图生图（部分网关忽略 data URI / 裸 base64） */
async function openAiCompatUploadImageBlob(
  baseNorm: string,
  apiKey: string,
  blob: Blob,
  filename: string,
  signal?: AbortSignal
): Promise<string> {
  const fetchBase = rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm);
  const relPaths = ['uploads/images', 'upload/image'];
  let lastFail = '';
  for (const rp of relPaths) {
    const form = new FormData();
    form.append('file', blob, filename);
    const res = await fetch(`${fetchBase}/${rp}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      body: form,
      signal,
    });
    const text = await res.text();
    if (!res.ok) {
      lastFail = `(${res.status}) ${text.slice(0, 400)}`;
      if (res.status === 404 || res.status === 405) continue;
      throw new Error(`参考图上传失败 ${lastFail}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`上传响应无效: ${text.slice(0, 200)}`);
    }
    const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
    const data = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : undefined;
    const u1 = typeof data?.url === 'string' ? data.url.trim() : '';
    const u2 = typeof o.url === 'string' ? o.url.trim() : '';
    const url = u1 || u2;
    if (o.success === false || !url) {
      throw new Error(typeof o.message === 'string' ? o.message : '上传未返回图片 URL');
    }
    return url;
  }
  throw new Error(`参考图上传失败 (404) ${lastFail}`);
}

async function toApisUploadImageBlob(blob: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 API Key。');
  return openAiCompatUploadImageBlob(normalizeBaseUrl(getOpenAiBaseUrl()), apiKey, blob, filename, signal);
}

/**
 * ToAPIs：上传音频文件，返回音频 URL。
 * 用于视频生成时的语音参考。
 */
async function toApisUploadAudioBlob(
  blob: Blob,
  filename: string,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 API Key。');

  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('purpose', 'audio'); // 或根据 API 要求调整

  let lastFail = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    assertNotAborted(signal);
    try {
      const res = await fetch(`${base}/uploads/audios`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal,
      });
      if (res.ok) {
        const json = (await res.json()) as { url?: string; id?: string };
        const url = json.url;
        if (url) return url;
        lastFail = await res.text();
      } else {
        lastFail = await res.text();
        if (res.status === 503) {
          await sleepInterruptible(3_000, signal);
          continue;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      lastFail = String(err);
      await sleepInterruptible(2_000, signal);
    }
  }
  throw new Error(`语音参考上传失败 (404) ${lastFail}`);
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
  const base = rewriteRemoteOpenAiCompatBaseForBrowserCors(normalizeBaseUrl(getOpenAiBaseUrl()));
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
  const base = rewriteRemoteOpenAiCompatBaseForBrowserCors(normalizeBaseUrl(getOpenAiBaseUrl()));
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
      return fetchUrlAsBase64(url, signal, apiKey);
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
  const base = rewriteRemoteOpenAiCompatBaseForBrowserCors(normalizeBaseUrl(getOpenAiBaseUrl()));
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
  const base = rewriteRemoteOpenAiCompatBaseForBrowserCors(normalizeBaseUrl(getOpenAiBaseUrl()));
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
  /** 语音参考：音频 base64 */
  referenceAudioBase64?: string;
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

  // 上传语音参考
  let audioUrl: string | undefined;
  if (params.referenceAudioBase64) {
    const { raw, mime } = parseBase64ImageInput(params.referenceAudioBase64);
    const blob = base64ToBlob(raw, mime || 'audio/mp4');
    audioUrl = await toApisUploadAudioBlob(blob, 'reference-audio.mp4', params.signal);
  }

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
  if (audioUrl) body.audio = audioUrl;

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
  /** 语音参考：音频 base64 */
  referenceAudioBase64?: string;
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

  // 上传语音参考
  let audioUrl: string | undefined;
  if (params.referenceAudioBase64) {
    const { raw, mime } = parseBase64ImageInput(params.referenceAudioBase64);
    const blob = base64ToBlob(raw, mime || 'audio/mp4');
    audioUrl = await toApisUploadAudioBlob(blob, 'reference-audio.mp4', params.signal);
  }

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
  if (audioUrl) body.audio = audioUrl;

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
  /** 语音参考：音频 base64 */
  referenceAudioBase64?: string;
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

  // 上传语音参考
  let audioUrl: string | undefined;
  if (params.referenceAudioBase64) {
    const { raw, mime } = parseBase64ImageInput(params.referenceAudioBase64);
    const blob = base64ToBlob(raw, mime || 'audio/mp4');
    audioUrl = await toApisUploadAudioBlob(blob, 'reference-audio.mp4', params.signal);
  }

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
  if (audioUrl) body.audio = audioUrl;

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
  /** 语音参考：音频 base64 */
  referenceAudioBase64?: string;
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
      referenceAudioBase64: params.referenceAudioBase64,
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
      referenceAudioBase64: params.referenceAudioBase64,
      signal: params.signal,
    });
  }
  return toApisGrokVideoGenerate({
    prompt: params.prompt,
    durationSeconds: params.durationSeconds,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution === '480p' ? '480p' : '720p',
    referenceImagesBase64: params.referenceImagesBase64,
    referenceAudioBase64: params.referenceAudioBase64,
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

/** OpenAI 兼容 images/generations 与 images/edits 的 size（WxH）；dall-e-2 仅支持正方形 */
function aspectRatioToOpenAiSize(aspectRatio: string, model: string): string {
  if (model === 'dall-e-2') return '1024x1024';
  const key = (aspectRatio || '1:1').trim();
  const map: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1024x1024',
    '3:4': '1024x1792',
    '21:9': '1792x1024',
    '2:1': '1792x1024',
    '3:2': '1792x1024',
    '2:3': '1024x1792',
  };
  return map[key] || '1024x1024';
}

function resolveT2iModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m === 'dall-e-2' || m === 'dall-e-3' || m === 'gpt-image-2' || m === 'gpt-image-1') return m;
  return 'dall-e-3';
}

function resolveEditModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m === 'gpt-image-2') return 'gpt-image-2';
  if (m === 'dall-e-2' || m === 'gpt-image-1') return m;
  if (m === 'dall-e-3') return 'gpt-image-1';
  return 'gpt-image-1';
}

function resolveChatModelForBase(baseNormalized: string, modelName: string): string {
  const m = (modelName || '').trim();
  /** 画布对话节点 id，上游 OpenAI 兼容 model 字段 */
  if (m === 'gpt-5.5-junlan') return 'gpt-5.5';
  if (m === 'claude-sonnet-4-6') return 'claude-sonnet-4-6';
  if (isToApisHost(baseNormalized)) {
    if (m) return m;
    return 'gemini-3-pro-preview';
  }
  if (isDeepSeekHost(baseNormalized)) {
    const nm = normalizeDeepSeekChatModelId(m).trim();
    if (nm === 'deepseek-v4-flash' || nm === 'deepseek-v4-pro') return nm;
    if (nm.startsWith('deepseek-v4-')) return nm;
    return DEFAULT_DEEPSEEK_CHAT_MODEL_ID;
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

async function jpegBase64ToPngBlob(base64Input: string): Promise<Blob> {
  const { raw, mime } = parseBase64ImageInput(base64Input);
  const src = `data:${mime || 'image/jpeg'};base64,${raw}`;
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
    img.src = src;
  });
}

/** codesonline 等：参考图 multipart 常限 20MB；PNG 大图易超限 */
const CODESONLINE_EDIT_IMAGE_MAX_BYTES = 19 * 1024 * 1024;

function isCodesonlineOpenAiCompatBase(baseNormalized: string): boolean {
  try {
    return new URL(baseNormalized).hostname.toLowerCase() === 'image.codesonline.dev';
  } catch {
    return false;
  }
}

/**
 * 将参考图压为 JPEG，体积不超过 maxBytes（用于图生图 multipart）。
 */
async function jpegBlobUnderBytesForImageEdit(
  base64Input: string,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Blob> {
  const { raw, mime } = parseBase64ImageInput(base64Input);
  const src = `data:${mime || 'image/jpeg'};base64,${raw}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('参考图解码失败'));
    el.src = src;
  });
  assertNotAborted(signal);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error('参考图尺寸无效');

  const maxSides = [4096, 3072, 2560, 2048, 1536, 1280, 1024, 896, 768, 640];
  const qualities = [0.92, 0.85, 0.78, 0.72, 0.65, 0.58, 0.52, 0.46, 0.4];

  for (const maxSide of maxSides) {
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const cw = Math.max(1, Math.round(w0 * scale));
    const ch = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布上下文');
    ctx.drawImage(img, 0, 0, cw, ch);
    for (const q of qualities) {
      assertNotAborted(signal);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', q);
      });
      if (blob && blob.size > 0 && blob.size <= maxBytes) return blob;
    }
  }
  throw new Error(
    `参考图仍超过约 ${Math.round(maxBytes / (1024 * 1024))}MB 上限（网关限制）。请先缩小或压缩原图后再试。`
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('无法读取参考图'));
    fr.readAsDataURL(blob);
  });
}

/** 云智 yunzhi-ai.top：文生图/图生图走官方文档的 `/v1/chat/completions` + SSE，而非 OpenAI 式 `/images/*` */
function isYunzhiOpenAiCompatBase(baseNormalized: string): boolean {
  try {
    return new URL(baseNormalized).hostname.toLowerCase() === 'yunzhi-ai.top';
  } catch {
    return false;
  }
}

/** 云智文档允许的 aspect_ratio */
function yunzhiChatDocAspectRatio(aspectRatio: string): '1:1' | '16:9' | '9:16' | '4:3' | '3:4' {
  const s = (aspectRatio || '1:1').trim();
  const allowed = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);
  if (allowed.has(s)) return s as '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  if (s === '3:2' || s === '5:4' || s === '2:1' || s === '21:9') return '4:3';
  if (s === '2:3' || s === '4:5' || s === '1:2' || s === '9:21') return '3:4';
  return '1:1';
}

function yunzhiChatDocQuality(nodeResolution?: string): '1k' | '2k' | '4k' {
  const r = (nodeResolution || '2k').toLowerCase().replace(/\s/g, '');
  if (r === '4k') return '4k';
  if (r === '0.5k' || r === '1k') return '1k';
  return '2k';
}

function yunzhiQualityPixelsLabel(q: '1k' | '2k' | '4k'): string {
  if (q === '4k') return '4096';
  if (q === '1k') return '1024';
  return '2048';
}

function yunzhiQualityDisplayUpper(q: '1k' | '2k' | '4k'): string {
  return q === '1k' ? '1K' : q === '4k' ? '4K' : '2K';
}

function extractImageUrlFromYunzhiChatSseAccumulated(acc: string): string | null {
  const md = acc.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (md) return md[1];
  const storage = acc.match(/(https?:\/\/yunzhi-ai\.top\/storage\/images\/[^\s"'<>)\]]+)/i);
  if (storage) return storage[1];
  const ext = acc.match(/(https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?)/i);
  return ext ? ext[1] : null;
}

/** 云智视频 SSE：Markdown /storage/videos/ 或 .mp4 直链 @see 云智API视频调用文档.md */
function extractVideoUrlFromYunzhiChatSseAccumulated(acc: string): string | null {
  const mdBang = acc.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (mdBang) return mdBang[1];
  const mdBracket = acc.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (mdBracket) return mdBracket[1];
  const storage = acc.match(/(https?:\/\/yunzhi-ai\.top\/storage\/videos\/[^\s"'<>)\]]+)/i);
  if (storage) return storage[1];
  const mp4 = acc.match(/(https?:\/\/[^\s"'<>)]+\.mp4(?:\?[^\s"'<>)]*)?)/i);
  return mp4 ? mp4[1] : null;
}

async function yunzhiOpenAiCompatStreamChatCompletionsToUrl(
  baseNorm: string,
  apiKey: string,
  body: Record<string, unknown>,
  kind: 'image' | 'video',
  signal?: AbortSignal
): Promise<string> {
  const label = kind === 'video' ? '云智视频生成' : '云智图片生成';
  const extract =
    kind === 'video' ? extractVideoUrlFromYunzhiChatSseAccumulated : extractImageUrlFromYunzhiChatSseAccumulated;
  const fetchBase = rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm);
  const key = apiKey.trim();
  const res = await fetch(`${fetchBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text();
    const hint =
      res.status === 413 ? openAiCompatFailureHint(413, 'generations-json') : '';
    throw new Error(`${label} (${res.status}): ${t.slice(0, 800)}${hint}`);
  }
  if (!res.body) throw new Error(`${label}：响应不支持流式读取。`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = '';
  let acc = '';
  try {
    while (true) {
      assertNotAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      lineBuf += decoder.decode(value, { stream: true });
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const rawLine of lines) {
        const s = rawLine.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (data === '[DONE]') {
          const u = extract(acc);
          if (u) return u;
          continue;
        }
        try {
          const chunk = JSON.parse(data) as {
            error?: { message?: string };
            choices?: Array<{ delta?: { content?: string } }>;
          };
          if (chunk.error?.message) throw new Error(`云智：${chunk.error.message}`);
          const content = chunk.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content) {
            acc += content;
            const u = extract(acc);
            if (u) return u;
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('云智：')) throw e;
        }
      }
    }
    const u = extract(acc);
    if (u) return u;
    throw new Error(`${label}：流式响应中未解析到媒体 URL。文本片段：${acc.slice(0, 500)}`);
  } finally {
    reader.releaseLock();
  }
}

/**
 * 云智图片（文生图/图生图）：POST /v1/chat/completions，stream:true，从 SSE 增量里解析 Markdown 图片或直链。
 * @see 云智API调用文档.md
 */
async function yunzhiOpenAiCompatStreamChatToFirstImageUrl(
  baseNorm: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  return yunzhiOpenAiCompatStreamChatCompletionsToUrl(baseNorm, apiKey, body, 'image', signal);
}

function buildYunzhiI2iUserText(params: {
  prompt: string;
  aspect: string;
  quality: '1k' | '2k' | '4k';
  upstreamModel: string;
}): string {
  const head = `图片比例${params.aspect}, ${yunzhiQualityDisplayUpper(params.quality)}分辨率(${yunzhiQualityPixelsLabel(params.quality)}像素)`;
  const enforce =
    '【必须以上传参考图中的人物、场景、构图与色调为基准进行编辑或重绘；禁止替换成无关主体或全新场景；仅可按文字指令微调姿态、细节与风格。】\n\n';
  if (params.upstreamModel === 'firefly-gpt-image2' || params.upstreamModel === 'firefly-gpt-image15') {
    return `${head}, ${params.prompt}`;
  }
  return `${enforce}${head}, ${params.prompt}`;
}

async function editImagesYunzhiNewApiFireflyViaChatCompletions(params: {
  baseNorm: string;
  apiKey: string;
  base64Images: string[];
  prompt: string;
  numberOfImages: number;
  canvasFireflyModelId: string;
  aspectRatio: string;
  nodeResolution?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const {
    baseNorm,
    apiKey,
    base64Images,
    prompt,
    numberOfImages,
    canvasFireflyModelId,
    aspectRatio,
    nodeResolution,
    signal,
  } = params;
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const modelCandidates = newApiFireflyRequestModelCandidates(canvasFireflyModelId);
  if (!modelCandidates.length) throw new Error('无效的 Firefly（New API）模型。');
  const yAr = yunzhiChatDocAspectRatio(aspectRatio);
  const yQ = yunzhiChatDocQuality(nodeResolution);
  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const imageParts = await buildYunzhiChatContentImageParts(
    baseNorm,
    apiKey,
    base64Images.slice(0, 6),
    'yunzhi-i2i',
    signal
  );
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    let lastErr: Error | null = null;
    let ok = false;
    for (const tryModel of modelCandidates) {
      const textBlock = buildYunzhiI2iUserText({
        prompt,
        aspect: yAr,
        quality: yQ,
        upstreamModel: tryModel,
      });
      const content: Array<
        { type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string }
      > = [...imageParts, { type: 'text', text: textBlock }];
      try {
        const imageUrl = await yunzhiOpenAiCompatStreamChatToFirstImageUrl(
          baseNorm,
          apiKey,
          {
            model: tryModel,
            messages: [{ role: 'user', content }],
            stream: true,
            aspect_ratio: yAr,
            quality: yQ,
          },
          signal
        );
        results.push(await fetchUrlAsBase64(imageUrl, signal, apiKey.trim()));
        ok = true;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
    if (!ok) throw lastErr ?? new Error('云智图生图失败');
  }
  return results;
}

/** 云智文生图：POST /v1/chat/completions + SSE，与官方文档一致（单条 user text）。 */
async function generateImagesYunzhiFireflyViaChatCompletions(params: {
  baseNorm: string;
  apiKey: string;
  prompt: string;
  aspectRatio: string;
  numberOfImages: number;
  resolvedModel: string;
  nodeResolution?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const {
    baseNorm,
    apiKey,
    prompt,
    aspectRatio,
    numberOfImages,
    resolvedModel,
    nodeResolution,
    signal,
  } = params;
  const yAr = yunzhiChatDocAspectRatio(aspectRatio);
  const yQ = yunzhiChatDocQuality(nodeResolution);
  const head = `图片比例${yAr}, ${yunzhiQualityDisplayUpper(yQ)}分辨率(${yunzhiQualityPixelsLabel(yQ)}像素)`;
  const textLine =
    resolvedModel === 'firefly-gpt-image2' || resolvedModel === 'firefly-gpt-image15'
      ? `${head}, ${prompt.trim()}`
      : prompt.trim();
  const count = Math.max(numberOfImages, 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const imageUrl = await yunzhiOpenAiCompatStreamChatToFirstImageUrl(
      baseNorm,
      apiKey,
      {
        model: resolvedModel,
        messages: [{ role: 'user', content: [{ type: 'text', text: textLine }] }],
        stream: true,
        aspect_ratio: yAr,
        quality: yQ,
      },
      signal
    );
    out.push(await fetchUrlAsBase64(imageUrl, signal, apiKey.trim()));
  }
  return out;
}

async function postJsonAtBase<T>(base: string, path: string, body: unknown, apiKey: string): Promise<T> {
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  const fetchBase = rewriteRemoteOpenAiCompatBaseForBrowserCors(base);
  const res = await fetch(`${fetchBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `兼容接口错误 (${res.status}): ${text.slice(0, 800)}${openAiCompatFailureHint(res.status, 'generations-json')}`
    );
  }
  return JSON.parse(text) as T;
}

/** OpenAI 兼容 images/generations | edits：常见 data[]；条目多为 b64_json，New API 等常仅返回 url */
function firstOpenAiImageGenerationItem(json: unknown): Record<string, unknown> | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const data = (json as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return undefined;
  const first = data[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined;
}

async function openAiStyleImagePayloadToBase64(
  item: Record<string, unknown> | undefined,
  signal?: AbortSignal,
  bearerToken?: string
): Promise<string> {
  if (!item) throw new Error('接口未返回图片条目。');
  const b64Candidate = item.b64_json ?? item.b64 ?? item.image;
  if (typeof b64Candidate === 'string' && b64Candidate.trim()) return b64Candidate.trim();
  const urlVal = item.url;
  if (typeof urlVal === 'string' && urlVal.trim()) {
    return fetchUrlAsBase64(urlVal.trim(), signal, bearerToken);
  }
  throw new Error('接口未返回可用图片（缺少 b64_json / url）。');
}

async function openAiStyleGenerationJsonToBase64(
  json: unknown,
  signal?: AbortSignal,
  bearerToken?: string
): Promise<string> {
  const item = firstOpenAiImageGenerationItem(json);
  if (item) return openAiStyleImagePayloadToBase64(item, signal, bearerToken);
  if (json && typeof json === 'object') {
    const urlTop = (json as Record<string, unknown>).url;
    if (typeof urlTop === 'string' && urlTop.trim()) {
      return fetchUrlAsBase64(urlTop.trim(), signal, bearerToken);
    }
  }
  let snippet = '';
  try {
    snippet = JSON.stringify(json).slice(0, 400);
  } catch {
    snippet = String(json).slice(0, 400);
  }
  throw new Error(`接口未返回图片数据。响应片段：${snippet}`);
}

async function generateImagesAtOpenAiCompatibleBase(
  baseNorm: string,
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  resolvedModel: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (isYunzhiOpenAiCompatBase(baseNorm) && resolvedModel.startsWith('firefly-')) {
    return generateImagesYunzhiFireflyViaChatCompletions({
      baseNorm,
      apiKey,
      prompt,
      aspectRatio,
      numberOfImages,
      resolvedModel,
      nodeResolution,
      signal,
    });
  }
  const size = aspectRatioToOpenAiSize(aspectRatio, resolvedModel);
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const out: string[] = [];
  const onePerRequest =
    resolvedModel === 'dall-e-3' ||
    resolvedModel === 'gpt-image-2' ||
    resolvedModel === 'gpt-image-1' ||
    resolvedModel.startsWith('firefly-');
  if (onePerRequest) {
    for (let i = 0; i < numberOfImages; i++) {
      assertNotAborted(signal);
      const json = await postJsonAtBase<Record<string, unknown>>(
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
      out.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey));
    }
  } else {
    const n = Math.min(Math.max(numberOfImages, 1), 10);
    assertNotAborted(signal);
    const json = await postJsonAtBase<Record<string, unknown>>(
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
    const data = json.data;
    if (!Array.isArray(data) || !data.length) {
      throw new Error(`文生图接口未返回图片列表。${JSON.stringify(json).slice(0, 400)}`);
    }
    const list = await Promise.all(
      data.map((d) =>
        d && typeof d === 'object'
          ? openAiStyleImagePayloadToBase64(d as Record<string, unknown>, signal, apiKey)
          : Promise.reject(new Error('文生图接口返回的图片条目格式无效'))
      )
    );
    out.push(...list);
  }
  return out;
}

/**
 * 云智 / 部分 New API 对 `/v1/images/edits` 可能返回 404 或 503（如 model_not_found）。
 * 非 401 时不中断；尝试 `uploads/images` 与 `upload/image` 得公网 URL 后以 `image_urls` 调 generations。
 * 若上传为 404 且 edits 失败：拒绝仅含 data URI/裸 base64 的 JSON 成功（避免误接受纯文生图），multipart 二进制仍尝试。
 */
async function editImagesNewApiFireflyWithRouteFallback(
  baseNorm: string,
  apiKey: string,
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  canvasFireflyModelId: string,
  aspectRatio: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  if (isYunzhiOpenAiCompatBase(baseNorm)) {
    return editImagesYunzhiNewApiFireflyViaChatCompletions({
      baseNorm,
      apiKey,
      base64Images,
      prompt,
      numberOfImages,
      canvasFireflyModelId,
      aspectRatio,
      nodeResolution,
      signal,
    });
  }
  const modelCandidates = newApiFireflyRequestModelCandidates(canvasFireflyModelId);
  if (!modelCandidates.length) throw new Error('无效的 Firefly（New API）模型。');
  const sizeModel = modelCandidates[0];
  const size = aspectRatioToOpenAiSize(aspectRatio, sizeModel);
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  // 支持多图：转换所有 base64 为 PNG blob
  const pngBlobs: Blob[] = [];
  for (const base64 of base64Images) {
    pngBlobs.push(await jpegBase64ToPngBlob(base64));
  }
  const parsedRef = parseBase64ImageInput(base64Images[0]);
  const refDataUrl = `data:${parsedRef.mime || 'image/jpeg'};base64,${parsedRef.raw}`;
  const results: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const url = `${rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm)}/images/edits`;

  for (let i = 0; i < count; i++) {
    const startLen = results.length;
    assertNotAborted(signal);
    let done = false;
    for (const tryModel of modelCandidates) {
      for (const useBracket of [true, false] as const) {
        const form = new FormData();
        // 多图参考：发送所有图片
        if (useBracket) {
          for (let imgIdx = 0; imgIdx < pngBlobs.length; imgIdx++) {
            form.append('image[]', pngBlobs[imgIdx], `ref${imgIdx}.png`);
          }
        } else {
          form.append('image', pngBlobs[0], 'ref.png');
        }
        form.append('prompt', enhancedPrompt);
        form.append('model', tryModel);
        form.append('n', '1');
        form.append('size', size);
        form.append('response_format', 'b64_json');
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal,
        });
        const text = await res.text();
        if (res.ok) {
          const json = JSON.parse(text) as unknown;
          results.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey));
          done = true;
          break;
        }
        if (res.status === 401) {
          throw new Error(
            `图生图接口错误 (${res.status})${openAiCompatFailureHint(res.status, 'image-edit')}: ${text.slice(0, 800)}`
          );
        }
        // 404/503/502 等：云智等对 edits 常不可用或 model_not_found，须回退 generations（勿把栈顶 vertex shim 当根因）
      }
      if (done) break;
    }
    if (!done) {
      const refAnchoredPrompt = `【必须以上传参考图中的人物/场景/构图/色调为基准进行编辑或重绘，禁止换成无关角色或全新场景；仅可按文字指令微调姿态、细节与风格。】\n\n${enhancedPrompt}`;
      const refPngDataUrl = await blobToDataUrl(pngBlobs[0]);
      let refUploadUrl: string | null = null;
      let refUpload404 = false;
      try {
        refUploadUrl = await openAiCompatUploadImageBlob(baseNorm, apiKey, pngBlobs[0], 'ref.png', signal);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        refUpload404 = msg.includes('(404)') || msg.includes(' 404');
      }
      /** 上传 404 且 edits 未成功时：云智等常忽略 JSON 里的 data URI/裸 base64，接受则多为纯文生图 */
      const strictRejectInlineRefJson = refUpload404;
      const genUrl = `${rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm)}/images/generations`;
      const makeUrlRefBodies = (tryModel: string): Record<string, unknown>[] =>
        refUploadUrl
          ? [
              {
                model: tryModel,
                prompt: refAnchoredPrompt,
                n: 1,
                size,
                response_format: 'b64_json',
                image_urls: [refUploadUrl],
                resolution: '2K',
              },
              {
                model: tryModel,
                prompt: refAnchoredPrompt,
                n: 1,
                size,
                response_format: 'b64_json',
                image_urls: [refUploadUrl],
              },
              { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image: [refUploadUrl] },
              { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', images: [refUploadUrl] },
            ]
          : [];

      if (refUploadUrl) {
        let urlJsonOk = false;
        for (const tryModel of modelCandidates) {
          for (const body of makeUrlRefBodies(tryModel)) {
            try {
              const json = await postJsonAtBase<Record<string, unknown>>(
                baseNorm,
                '/images/generations',
                body,
                apiKey
              );
              results.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey));
              urlJsonOk = true;
              break;
            } catch {
              /* 下一组 body */
            }
          }
          if (urlJsonOk) break;
        }
        if (urlJsonOk) continue;
      }

      let multipartOk = false;
      for (const tryModel of modelCandidates) {
        for (const useBracket of [true, false] as const) {
          const form = new FormData();
          form.append('model', tryModel);
          form.append('prompt', refAnchoredPrompt);
          form.append('n', '1');
          form.append('size', size);
          form.append('response_format', 'b64_json');
          if (useBracket) form.append('image[]', pngBlob, 'ref.png');
          else form.append('image', pngBlob, 'ref.png');
          const res = await fetch(genUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
            signal,
          });
          const text = await res.text();
          if (res.ok) {
            const json = JSON.parse(text) as unknown;
            results.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey));
            multipartOk = true;
            break;
          }
          if (res.status === 401) {
            throw new Error(
              `图生图接口错误 (${res.status})${openAiCompatFailureHint(res.status, 'image-edit')}: ${text.slice(0, 800)}`
            );
          }
          // 503/400 等：部分网关 multipart 不认参考图或模型路由错误，继续走 JSON 多字段尝试（避免误报为 dall-e 通道）
        }
        if (multipartOk) break;
      }
      if (multipartOk) continue;

      const makeTryBodies = (tryModel: string): Record<string, unknown>[] => {
        const urlFirst = makeUrlRefBodies(tryModel);
        return [
          ...urlFirst,
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image: [refPngDataUrl] },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image_urls: [refPngDataUrl] },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image: refPngDataUrl },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image: [refDataUrl] },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image: refDataUrl },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', images: [refDataUrl] },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image_urls: [refDataUrl] },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', image: rawB64 },
          { model: tryModel, prompt: refAnchoredPrompt, n: 1, size, response_format: 'b64_json', images: [rawB64] },
        ];
      };
      let lastErr: Error | null = null;
      for (const tryModel of modelCandidates) {
        for (const body of makeTryBodies(tryModel)) {
          try {
            const json = await postJsonAtBase<Record<string, unknown>>(
              baseNorm,
              '/images/generations',
              body,
              apiKey
            );
            if (strictRejectInlineRefJson && !isStrongRefBindingJsonBody(body)) {
              lastErr = new Error(
                '上游在无公网 image_urls 时常忽略内联参考图（易退化为纯文生图），已跳过该次响应。'
              );
              continue;
            }
            results.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey));
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
          }
        }
        if (!lastErr) break;
      }
      if (results.length === startLen) {
        throw new Error(
          refUpload404
            ? '图生图：上游未开放参考图暂存（POST …/uploads/images 与 …/upload/image 均不可用），且 /images/edits 失败。此类网关对 JSON 里的 data URI/裸 base64 常会忽略参考图，结果易与参考无关。请改用支持「参考图上传」或稳定图生图的通道（例如 ToAPIs 主通道），或在 New API 管理端开启上传类路由。'
            : lastErr?.message || '图生图：所有尝试均未返回有效图片。'
        );
      }
    }
  }
  return results;
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
  const size = aspectRatioToOpenAiSize(aspectRatio, resolvedEditModel);
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const useCodesonlineCap = isCodesonlineOpenAiCompatBase(baseNorm);
  // 支持多图：将所有 base64 图片转换为 blob
  const imageBlobs: { blob: Blob; filename: string }[] = [];
  for (const base64 of base64Images) {
    const blob = useCodesonlineCap
      ? await jpegBlobUnderBytesForImageEdit(base64, CODESONLINE_EDIT_IMAGE_MAX_BYTES, signal)
      : await jpegBase64ToPngBlob(base64);
    imageBlobs.push({
      blob,
      filename: useCodesonlineCap ? 'ref.jpg' : 'ref.png'
    });
  }
  const results: string[] = [];
  const count = Math.min(
    Math.max(numberOfImages, 1),
    resolvedEditModel === 'dall-e-2'
      ? 10
      : resolvedEditModel === 'gpt-image-2' || resolvedEditModel.startsWith('firefly-')
        ? 4
        : 1
  );

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const form = new FormData();
    // dall-e-2 沿用单字段 image；gpt-image-* / firefly 等支持多图（多张时使用 image[]）
    if (resolvedEditModel === 'dall-e-2') {
      form.append('image', imageBlobs[0].blob, imageBlobs[0].filename);
    } else {
      // 多图参考：发送所有图片
      for (const { blob, filename } of imageBlobs) {
        form.append('image[]', blob, filename);
      }
    }
    form.append('prompt', enhancedPrompt);
    form.append('model', resolvedEditModel);
    form.append('n', '1');
    form.append('size', size);
    if (resolvedEditModel !== 'dall-e-2') {
      form.append('response_format', 'b64_json');
    }

    const res = await fetch(`${rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm)}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `图生图接口错误 (${res.status})${openAiCompatFailureHint(res.status, 'image-edit')}: ${text.slice(0, 800)}`
      );
    }
    const json = JSON.parse(text) as unknown;
    results.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey));
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
  if (isNewApiFireflyCanvasModel(rawModel)) {
    const naKey = getNewApiSavedKey().trim();
    if (!naKey) {
      throw new Error(
        '未配置 New API 密钥。请在「设置 → API」中填写「New API（Firefly）」密钥（与 ToAPIs 主通道分开）。文档：https://docs.newapi.pro/zh/docs/api'
      );
    }
    const rawBase = getNewApiBaseUrl().trim();
    if (!rawBase) {
      throw new Error('未配置 New API Base URL（须含 /v1）。请在「设置 → API」中填写自建 New API 地址。');
    }
    const naBase = normalizeBaseUrl(rawBase);
    const upstream = newApiFireflyUpstreamModelId(rawModel);
    return generateImagesAtOpenAiCompatibleBase(
      naBase,
      naKey,
      prompt,
      aspectRatio,
      numberOfImages,
      upstream,
      nodeResolution,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-junlan') {
    const jlKey = getJunlanSavedKey().trim();
    if (!jlKey) {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, 'gpt-image-2', nodeResolution, signal);
    }
    const jlBase = normalizeBaseUrl(getJunlanBaseUrl());
    return generateImagesAtOpenAiCompatibleBase(
      jlBase,
      jlKey,
      prompt,
      aspectRatio,
      numberOfImages,
      'gpt-image-2',
      nodeResolution,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-codesonline') {
    const coKey = getCodesonlineSavedKey().trim();
    if (!coKey) {
      throw new Error(
        '未配置 codesonline 图像通道。请在「设置 → API」填写「codesonline（GPT Image 2）」API Key；文档：https://image.codesonline.dev/personal/docs'
      );
    }
    const coBase = normalizeBaseUrl(getCodesonlineBaseUrl());
    return generateImagesAtOpenAiCompatibleBase(
      coBase,
      coKey,
      prompt,
      aspectRatio,
      numberOfImages,
      'gpt-image-2',
      nodeResolution,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-gaorui') {
    const grKey = getGaoruiSavedKey().trim();
    if (!grKey) {
      throw new Error('未配置高瑞 AI 图像通道。请在「设置 → API」填写「高瑞 API Key」。');
    }
    const grBase = normalizeBaseUrl(getGaoruiBaseUrl());
    return gaoruiGenerateNewImage(grBase, grKey, prompt, aspectRatio, numberOfImages, 'gpt-image-2', nodeResolution, signal);
  }

  if (rawModel === 'nano-banana-pro-gaorui') {
    const grKey = getGaoruiSavedKey().trim();
    if (!grKey) {
      throw new Error('未配置高瑞 AI 图像通道。请在「设置 → API」填写「高瑞 API Key」。');
    }
    const grBase = normalizeBaseUrl(getGaoruiBaseUrl());
    return gaoruiGenerateNewImage(grBase, grKey, prompt, aspectRatio, numberOfImages, 'nano-banana-pro', nodeResolution, signal);
  }

  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  if (isToApisHost(base)) {
    return toApisGenerateNewImage(prompt, aspectRatio, numberOfImages, modelName, nodeResolution, signal);
  }

  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  const model = resolveT2iModel(modelName);
  return generateImagesAtOpenAiCompatibleBase(
    rewriteRemoteOpenAiCompatBaseForBrowserCors(base),
    apiKey,
    prompt,
    aspectRatio,
    numberOfImages,
    model,
    nodeResolution,
    signal
  );
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
  if (isNewApiFireflyCanvasModel(rawModel)) {
    const naKey = getNewApiSavedKey().trim();
    if (!naKey) {
      throw new Error(
        '未配置 New API 密钥。请在「设置 → API」中填写「New API（Firefly）」密钥。文档：https://docs.newapi.pro/zh/docs/api'
      );
    }
    const rawBase = getNewApiBaseUrl().trim();
    if (!rawBase) {
      throw new Error('未配置 New API Base URL（须含 /v1）。请在设置中填写。');
    }
    const naBase = normalizeBaseUrl(rawBase);
    return editImagesNewApiFireflyWithRouteFallback(
      naBase,
      naKey,
      base64Images,
      prompt,
      numberOfImages,
      rawModel,
      aspectRatio,
      nodeResolution,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-junlan') {
    const jlKey = getJunlanSavedKey().trim();
    if (!jlKey) {
      return openAiEditImage(base64Images, prompt, numberOfImages, 'gpt-image-2', aspectRatio, nodeResolution, signal);
    }
    const jlBase = normalizeBaseUrl(getJunlanBaseUrl());
    return editImagesAtOpenAiCompatibleBase(
      jlBase,
      jlKey,
      base64Images,
      prompt,
      numberOfImages,
      'gpt-image-2',
      aspectRatio,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-codesonline') {
    const coKey = getCodesonlineSavedKey().trim();
    if (!coKey) {
      throw new Error(
        '未配置 codesonline 图像通道。请在「设置 → API」填写「codesonline（GPT Image 2）」API Key；文档：https://image.codesonline.dev/personal/docs'
      );
    }
    const coBase = normalizeBaseUrl(getCodesonlineBaseUrl());
    return editImagesAtOpenAiCompatibleBase(
      coBase,
      coKey,
      base64Images,
      prompt,
      numberOfImages,
      'gpt-image-2',
      aspectRatio,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-gaorui') {
    const grKey = getGaoruiSavedKey().trim();
    if (!grKey) {
      throw new Error('未配置高瑞 AI 图像通道。请在「设置 → API」填写「高瑞 API Key」。');
    }
    const grBase = normalizeBaseUrl(getGaoruiBaseUrl());
    return gaoruiEditImage(grBase, grKey, base64Images, prompt, numberOfImages, 'gpt-image-2', aspectRatio, signal);
  }

  if (rawModel === 'nano-banana-pro-gaorui') {
    const grKey = getGaoruiSavedKey().trim();
    if (!grKey) {
      throw new Error('未配置高瑞 AI 图像通道。请在「设置 → API」填写「高瑞 API Key」。');
    }
    const grBase = normalizeBaseUrl(getGaoruiBaseUrl());
    return gaoruiEditImage(grBase, grKey, base64Images, prompt, numberOfImages, 'nano-banana-pro', aspectRatio, signal);
  }

  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  if (isToApisHost(normalizeBaseUrl(getOpenAiBaseUrl()))) {
    return toApisEditImage(base64Images, prompt, numberOfImages, modelName, aspectRatio, nodeResolution, signal);
  }
  const apiKey = getOpenAiSavedKey();
  if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key。');
  const base = normalizeBaseUrl(getOpenAiBaseUrl());
  const model = resolveEditModel(modelName);
  return editImagesAtOpenAiCompatibleBase(
    rewriteRemoteOpenAiCompatBaseForBrowserCors(base),
    apiKey,
    base64Images,
    prompt,
    numberOfImages,
    model,
    aspectRatio,
    signal
  );
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
