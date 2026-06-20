import {
  DEFAULT_AIID_BASE_URL,
  DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
  DEFAULT_MANXUE_BASE_URL,
  DEFAULT_MINIMAX_BASE_URL,
  normalizeDeepSeekChatModelId,
  getAiProvider,
  getCodesonlineBaseUrl,
  getCodesonlineSavedKey,
  getHfsyBaseUrl,
  getHfsySavedKey,
  getJunlanBaseUrl,
  getJunlanSavedKey,
  getManxueBaseUrl,
  getManxueSavedKey,
  getMiniMaxBaseUrl,
  getMiniMaxSavedKey,
  getOtuapiBaseUrl,
  getOtuapiSavedKey,
  getOpenAiBaseUrl,
  getOpenAiSavedKey,
  getAiidBaseUrl,
  getAiidSavedKey,
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

/** 生产构建直接请求 /api/codesonline-image-proxy，与 yunzhi 同理避免 rewrite 404 */
function codesonlineImageProxyPathPrefix(): '/api/codesonline-image-proxy' | '/codesonline-image-api' {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/codesonline-image-proxy';
  }
  return '/codesonline-image-api';
}

/** 生产构建直接请求 /api/hfsy-image-proxy，与 yunzhi/codesonline 同理避免 rewrite 404 */
function hfsyImageProxyPathPrefix(): '/api/hfsy-image-proxy' | '/hfsy-image-api' {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/hfsy-image-proxy';
  }
  return '/hfsy-image-api';
}

/** 生产构建直接请求 /api/otuapi-image-proxy；otuapi 生成图 CDN（oss-us.file-download.life）未开放 CORS */
function otuapiImageProxyPathPrefix(): '/api/otuapi-image-proxy' | '/otuapi-image-api' {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/otuapi-image-proxy';
  }
  return '/otuapi-image-api';
}

/** manxueapi.com 未开放 CORS；生产走 Vercel rewrite、开发走 Vite 同源代理 /manxue-api */
function rewriteManxueBaseForBrowserCors(baseNormalized: string): string {
  if (typeof window === 'undefined') return baseNormalized;
  try {
    if (!isManxueHost(baseNormalized)) return baseNormalized;
    const pathname = new URL(baseNormalized).pathname.replace(/\/+$/, '') || '/v1';
    return `${window.location.origin}/manxue-api${pathname}`;
  } catch {
    return baseNormalized;
  }
}

function manxueFetchBase(): string {
  return rewriteManxueBaseForBrowserCors(normalizeBaseUrl(getManxueBaseUrl()));
}

function codesonlineFetchBase(): string {
  return rewriteRemoteOpenAiCompatBaseForBrowserCors(normalizeBaseUrl(getCodesonlineBaseUrl()));
}

function manxueGeminiModelsBase(): string {
  if (typeof window === 'undefined') return 'https://manxueapi.com/v1beta/models';
  return `${window.location.origin}/manxue-api/v1beta/models`;
}

/** image.codesonline.dev 常未对浏览器开放 CORS；生产走 Vercel rewrite、开发走 Vite 同源代理 */
function rewriteCodesonlineImageBaseForBrowserCors(baseNormalized: string): string {
  if (typeof window === 'undefined') return baseNormalized;
  try {
    const u = new URL(baseNormalized);
    if (u.hostname.toLowerCase() !== 'image.codesonline.dev') return baseNormalized;
    const pathname = u.pathname.replace(/\/+$/, '') || '/v1';
    return `${window.location.origin}${codesonlineImageProxyPathPrefix()}${pathname}`;
  } catch {
    return baseNormalized;
  }
}

/** www.hfsyapi.cn 图像 API 未对浏览器开放 CORS；走 /hfsy-image-api（同源代理） */
function rewriteHfsyImageBaseForBrowserCors(baseNormalized: string): string {
  if (typeof window === 'undefined') return baseNormalized;
  try {
    const u = new URL(baseNormalized);
    if (u.hostname.toLowerCase() !== 'www.hfsyapi.cn') return baseNormalized;
    const pathname = u.pathname.replace(/\/+$/, '') || '/v1';
    return `${window.location.origin}${hfsyImageProxyPathPrefix()}${pathname}`;
  } catch {
    return baseNormalized;
  }
}

function hfsyFetchBase(): string {
  return rewriteHfsyImageBaseForBrowserCors(normalizeBaseUrl(getHfsyBaseUrl()));
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
    // 代理 codesonline-chat-api 到同源，避免 CORS
    if (hostname === 'ai.codesonline.dev') {
      const pathname = u.pathname.replace(/\/+$/, '') || '/v1';
      next = `${window.location.origin}/codesonline-chat-api${pathname}`;
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
      ? '（404：请确认请求为 POST multipart；开发环境须在 frontend 目录启动 Vite；生产环境需已部署 /api/codesonline-image-proxy 单入口代理。若出现 NOT_FOUND，请重新部署并硬刷新。）'
      : '（404：请检查 Base URL 与路径；开发环境需 Vite 代理 /yunzhi-openai 或 /codesonline-image-api。）';
  }
  if (status === 502 || status === 504) {
    return '（502/504：多为上游 API 暂时失败、超时，或生图成功但图片回传失败；codesonline 已自动改用 URL 回传，若仍失败请稍后重试、检查密钥，图生图可缩小参考图。若出现 ROUTER_EXTERNAL_TARGET_ERROR，请重新部署以启用图像 API 函数代理。）';
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

/** 判断是否为满 eAPI 域名（manxueapi.com） */
function isManxueHost(baseNormalized: string): boolean {
  try {
    const host = new URL(baseNormalized).hostname.toLowerCase();
    return host === 'manxueapi.com' || host.endsWith('.manxueapi.com');
  } catch {
    return false;
  }
}

/** 满 eAPI 视频模型（Grok Imagine Video 系列） */
export const MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID = 'grok-imagine-video-1.5-preview';

export function isManxueVideoModel(m?: string): boolean {
  if (!m) return false;
  return m === MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID || m.endsWith('-manxue-video');
}

/** 判断是否为 MiniMax 域名（api.minimaxi.com） */
function isMiniMaxHost(baseNormalized: string): boolean {
  try {
    const host = new URL(baseNormalized).hostname.toLowerCase();
    return host === 'api.minimaxi.com' || host.endsWith('.minimaxi.com');
  } catch {
    return false;
  }
}

/** ToAPIs 异步任务轮询最长等待（文生图 / 图生图等） */
const TOAPIS_TASK_MAX_WAIT_MS = 1_800_000;

/** ToAPIs 视频任务轮询最长等待 */
const TOAPIS_VIDEO_TASK_MAX_WAIT_MS = 1_800_000;

/** 满 eAPI（manxueapi.com）任务轮询最长等待 */
const MANXUE_TASK_MAX_WAIT_MS = 1_800_000;

/**
 * 满 eAPI 上游瞬时错误（Google 408 timeout / 500 "system under load" / submit failed 包装）：
 * 检测到时自动退避重试，缓解上游短暂过载；非瞬时错误（4xx 鉴权、参数错等）立即抛出。
 */
const MANXUE_TRANSIENT_RETRY_DELAYS_MS = [0, 6_000, 12_000];

function isManxueTransientError(status: number, bodyText: string): boolean {
  if (status >= 500 && status < 600) {
    // 5xx 一律视为瞬时（含网关包装的 500 / 502 / 503 / 504）
    if (/timeout_error|system under load|submit failed|upstream_error|service unavailable|bad gateway|gateway timeout/i.test(bodyText)) {
      return true;
    }
  }
  if (status === 408) return true;
  if (status === 429) return true; // 限流
  if (status === 200) {
    // 上游 200 但 body 含 timeout_error 的极端情况
    if (/timeout_error|system under load|submit failed/i.test(bodyText)) {
      return true;
    }
  }
  return false;
}

async function manxueFetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  signal?: AbortSignal
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MANXUE_TRANSIENT_RETRY_DELAYS_MS.length; attempt++) {
    if (MANXUE_TRANSIENT_RETRY_DELAYS_MS[attempt] > 0) {
      await sleepInterruptible(MANXUE_TRANSIENT_RETRY_DELAYS_MS[attempt], signal);
    }
    assertNotAborted(signal);
    try {
      const res = await fetch(url, { ...init, signal });
      if (res.ok) return res;
      const text = await res.text();
      if (isManxueTransientError(res.status, text) && attempt < MANXUE_TRANSIENT_RETRY_DELAYS_MS.length - 1) {
        lastErr = new Error(`${label} 瞬时错误 (${res.status})，${MANXUE_TRANSIENT_RETRY_DELAYS_MS[attempt + 1] / 1000}s 后重试… (attempt ${attempt + 1}/${MANXUE_TRANSIENT_RETRY_DELAYS_MS.length})`);
        // 把上游 body 透传以便最终失败时给出可读错误
        lastErr = Object.assign(lastErr, { _lastBody: text, _lastStatus: res.status });
        continue;
      }
      // 非瞬时或最后一次尝试：抛错
      const err: Error & { _lastBody?: string; _lastStatus?: number } = new Error(
        `${label}失败 (${res.status}): ${text.slice(0, 800)}`
      );
      err._lastBody = text;
      err._lastStatus = res.status;
      throw err;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      if (e && typeof e === 'object' && '_lastBody' in (e as object)) {
        // 上一步包装过的瞬时错误，要么继续重试，要么最终抛
        if (attempt < MANXUE_TRANSIENT_RETRY_DELAYS_MS.length - 1) {
          lastErr = e;
          continue;
        }
        throw e;
      }
      // fetch 网络错误（非 abort）→ 当作瞬时重试
      if (attempt < MANXUE_TRANSIENT_RETRY_DELAYS_MS.length - 1) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  // 走到这里说明所有重试都用完但都被 catch 后继续：抛出最后错误
  throw lastErr instanceof Error ? lastErr : new Error(`${label} 重试耗尽`);
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
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m.startsWith('imagen') || m.startsWith('gemini')) return m;
  if (m === 'gpt-image-2' || m === 'gpt-image-1' || m.startsWith('gpt-image')) return m;
  if (m === 'gpt-4o-image') return m;
  if (m === 'dall-e-3' || m === 'dall-e-2') return 'gemini-3-pro-image-preview';
  if (m === 'nano-banana-2') return 'gemini-2.5-flash-image-preview';
  return m || 'gemini-3-pro-image-preview';
}

/** 满 eAPI 模型名映射（将 UI id 转为 API model 名） */
function manxueT2iModel(modelName: string): string {
  const m = (modelName || '').trim();
  // GPT Image 2 系列
  if (m === 'gpt-image-2-pro-manxue') return 'gpt-image-2-pro';
  if (m === 'gpt-image-2-manxue') return 'gpt-image-2';
  // Gemini 系列
  if (m === 'gemini-3-pro-image-preview-2k-manxue') return 'gemini-3-pro-image-preview-2k';
  if (m === 'gemini-3-pro-image-preview-4k-manxue') return 'gemini-3-pro-image-preview-4k';
  if (m === 'gemini-3.1-flash-image-preview-2k-manxue') return 'gemini-3.1-flash-image-preview-2k';
  if (m === 'gemini-3.1-flash-image-preview-4k-manxue') return 'gemini-3.1-flash-image-preview-4k';
  return m;
}

/** 满 eAPI 分辨率映射 */
function manxueResolution(nodeResolution?: string): '2K' | '4K' {
  const r = (nodeResolution || '2k').toLowerCase().replace(/\s/g, '');
  return r === '4k' ? '4K' : '2K';
}

/** 判断是否为满 eAPI Gemini 系列模型（需要 Vertex AI 风格接口） */
function isManxueGeminiModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'gemini-3-pro-image-preview-2k-manxue' ||
    m === 'gemini-3-pro-image-preview-4k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-2k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-4k-manxue'
  );
}

/** 满 eAPI Gemini 系列文生图：使用 Vertex AI 风格 /v1beta/models/{model}:generateContent 接口 */
async function manxueGeminiGenerateImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  modelName: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const model = manxueT2iModel(modelName);
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 eAPI Key。');
  const key = apiKey.trim();
  const base = manxueGeminiModelsBase();
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 8);

  // 将画幅比例转为实际像素尺寸（Gemini Vertex API 需要）
  const aspectToSize: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768, height: 1344 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
    '2:1': { width: 1344, height: 768 },
    '1:2': { width: 768, height: 1344 },
    '21:9': { width: 1536, height: 640 },
    '9:21': { width: 640, height: 1536 },
    '3:2': { width: 1216, height: 832 },
    '2:3': { width: 832, height: 1216 },
  };
  const size = aspectToSize[aspectRatio] || aspectToSize['16:9'];

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);

    // 构建 Vertex AI 风格的请求体
    // prompt 中明确包含画幅比例要求，确保模型生成正确比例的图片
    const body: Record<string, unknown> = {
      contents: [
        {
          parts: [
            {
              text: `[图片比例 ${aspectRatio}] ${prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: manxueResolution(nodeResolution) === '4K' ? '4K' : '2K',
        },
      },
    };

    const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${key}`;
    const res = await manxueFetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      '满 eAPI Gemini 生成',
      signal
    );

    const json = await res.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
      error?: { message?: string };
    };

    if (json.error?.message) {
      throw new Error(`满 eAPI Gemini: ${json.error.message}`);
    }

    const parts = json.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('满 eAPI Gemini 响应中未找到图片数据');
    }

    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType) {
        const mime = part.inlineData.mimeType;
        const raw = part.inlineData.data;
        // 直接返回 base64 数据（不需要再转换）
        out.push(raw);
        break;
      }
    }

    if (out.length <= i) {
      throw new Error('满 eAPI Gemini 响应中未找到图片数据');
    }
  }

  return out;
}

/**
 * 满 eAPI Gemini 对话：使用 Vertex AI 风格 /v1beta/models/{model}:generateContent 接口（?key= 鉴权）。
 * 文档：https://manxueapi.com 上游同 Google Gemini generateContent（支持多轮 contents + system_instruction）。
 * - 与满 eAPI 文生图（manxueGeminiGenerateImage）走同一个 base，鉴权方式与响应结构一致。
 */
export async function manxueGeminiChatGenerate(
  turns: ChatCompletionHistoryTurn[],
  modelName: string
): Promise<string> {
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 eAPI Key，请在「设置 → API」中填写「满 e API Key」。');
  const key = apiKey.trim();
  if (!turns.length) throw new Error('对话内容为空。');
  const model = (modelName || '').trim() || 'gemini-3.1-flash';
  const base = manxueGeminiModelsBase();
  const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${key}`;

  // 把多轮对话转 Vertex 风格 contents
  const systemParts: string[] = [];
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }> = [];
  for (const turn of turns) {
    if (turn.role === 'system') {
      if (turn.content) systemParts.push(turn.content);
      continue;
    }
    if (turn.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: turn.content || '' }] });
      continue;
    }
    // user
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    const imgs: string[] = [];
    if (turn.imageBase64s?.length) imgs.push(...turn.imageBase64s);
    if (turn.imageBase64) imgs.push(turn.imageBase64);
    for (const b64 of imgs) {
      const cleaned = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
      const mime = sniffMimeFromBase64(cleaned);
      parts.push({ inlineData: { mimeType: mime || 'image/jpeg', data: cleaned } });
    }
    parts.push({ text: turn.content || '' });
    contents.push({ role: 'user', parts });
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      responseModalities: ['TEXT'],
    },
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { role: 'system', parts: [{ text: systemParts.join('\n\n') }] };
  }

  const res = await manxueFetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    '满 eAPI Gemini 对话'
  );

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> };
      finishReason?: string;
    }>;
    error?: { message?: string };
  };

  if (json.error?.message) {
    throw new Error(`满 eAPI Gemini: ${json.error.message}`);
  }

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('满 eAPI Gemini 对话响应中未找到文本内容。');
  }
  return text;
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
  } else if (nodeResolution) {
    // ToAPIs GPT Image 2 支持 1K, 2K, 4K 分辨率
    const r = (nodeResolution || '2k').toLowerCase().replace(/\s/g, '');
    body.resolution = r === '4k' ? '4K' : r === '1k' ? '1K' : '2K';
  }
  return body;
}

/** 将 ToAPIs 等 CDN 地址改为当前站点同源路径，由 Vite/nginx 代理拉取，避免 CORS */
function rewriteKnownImageCdnToSameOrigin(imageUrl: string): string {
  if (typeof window === 'undefined') return imageUrl;
  try {
    const u = new URL(imageUrl);
    const { origin } = window.location;
    const host = u.hostname.toLowerCase();
    if (host === 'image.codesonline.dev') {
      return `${origin}${codesonlineImageProxyPathPrefix()}${u.pathname}${u.search}`;
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
    if (host === 'www.hfsyapi.cn' || host === 'hfsyapi.cn') {
      return `${origin}${hfsyImageProxyPathPrefix()}${u.pathname}${u.search}`;
    }
    // otuapi 异步任务返回的图片 URL 托管在 oss-us.file-download.life，未开放 CORS
    if (host === 'oss-us.file-download.life' || host.endsWith('.oss-us.file-download.life')) {
      return `${origin}${otuapiImageProxyPathPrefix()}${u.pathname}${u.search}`;
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
  let absoluteUrl = imageUrl.trim();
  if (absoluteUrl.startsWith('/')) {
    try {
      absoluteUrl = new URL(absoluteUrl, 'https://image.codesonline.dev').href;
    } catch {
      /* keep */
    }
  }
  let fetchUrl = rewriteYunzhiAssetUrlToSameOriginProxy(absoluteUrl);
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
        absoluteUrl.slice(0, 200)
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
  // 清理可能的前缀
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  try {
    const dec = atob(cleaned.slice(0, 48));
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

/** 过滤网关返回的占位/错误字符串，避免写入节点后预览空白 */
function isPlausibleImageBase64(raw: string): boolean {
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (cleaned.length < 200) return false;
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return false;
  try {
    const head = atob(cleaned.slice(0, 48));
    const a = head.charCodeAt(0);
    const b = head.charCodeAt(1);
    return (
      (a === 0xff && b === 0xd8) ||
      (a === 0x89 && b === 0x50) ||
      (a === 0x47 && b === 0x49) ||
      (a === 0x52 && b === 0x49)
    );
  } catch {
    return false;
  }
}

function parseBase64ImageInput(input: string): { raw: string; mime: string } {
  const t = input.trim();
  const m = t.match(/^data:([^;]+);base64,(.+)$/s);
  if (m) return { mime: m[1].split(';')[0].trim(), raw: m[2].replace(/\s/g, '') };
  const raw = t.replace(/\s/g, '');
  return { raw, mime: sniffMimeFromBase64(raw) };
}

/** 异步从 base64 读取图片宽高比（不压缩、纯测量，超时 5s）；返回 null 表示失败 */
export function readImageBase64AspectRatio(
  input: string,
  signal?: AbortSignal
): Promise<{ width: number; height: number; ratio: number; canonical: '16:9' | '9:16' | '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '21:9' | 'other' } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: typeof result) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    const onAbort = () => done(null);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const { raw, mime } = parseBase64ImageInput(input);
      const img = new Image();
      img.onload = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          done(null);
          return;
        }
        const ratio = w / h;
        // 标准化为常用画幅（容差 ±8%）
        const match = (rw: number, rh: number) => {
          const target = rw / rh;
          return Math.abs(ratio - target) / target < 0.08;
        };
        let canonical: '16:9' | '9:16' | '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '21:9' | 'other' = 'other';
        if (match(16, 9)) canonical = '16:9';
        else if (match(9, 16)) canonical = '9:16';
        else if (match(1, 1)) canonical = '1:1';
        else if (match(3, 2)) canonical = '3:2';
        else if (match(2, 3)) canonical = '2:3';
        else if (match(4, 3)) canonical = '4:3';
        else if (match(3, 4)) canonical = '3:4';
        else if (match(21, 9)) canonical = '21:9';
        done({ width: w, height: h, ratio, canonical });
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        done(null);
      };
      img.src = `data:${mime || 'image/jpeg'};base64,${raw}`;
    } catch {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      done(null);
    }
  });
}

function base64ToBlob(raw: string, mime: string): Blob {
  // 清理可能的前缀
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const binary = atob(cleaned);
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

/** 满 eAPI 提交图片生成任务 */
async function manxueSubmitGeneration(
  base: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ id?: string; b64_json?: string; data?: unknown[] }> {
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
    throw new Error(`满 eAPI 提交任务失败 (${res.status}): ${text.slice(0, 800)}`);
  }
  const json = JSON.parse(text) as {
    id?: string;
    task_id?: string;
    error?: { message?: string };
    b64_json?: string;
    data?: unknown[];
  };
  if (json.error?.message) throw new Error(`满 eAPI: ${json.error.message}`);
  // 满 e / codesonline 等：同步返回 data[]，或异步返回 id / task_id
  const taskId =
    (typeof json.id === 'string' && json.id.trim()) ||
    (typeof json.task_id === 'string' && json.task_id.trim()) ||
    undefined;
  return { id: taskId, b64_json: json.b64_json, data: json.data };
}

/** 满 eAPI 提交图片编辑任务（multipart /images/edits） */
async function manxueSubmitEdit(
  base: string,
  apiKey: string,
  form: FormData,
  signal?: AbortSignal
): Promise<{ id?: string; b64_json?: string; data?: unknown[] }> {
  const res = await fetch(`${base}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`满 eAPI 图生图失败 (${res.status}): ${text.slice(0, 800)}`);
  }
  const json = JSON.parse(text) as {
    id?: string;
    task_id?: string;
    error?: { message?: string };
    b64_json?: string;
    data?: unknown[];
  };
  if (json.error?.message) throw new Error(`满 eAPI: ${json.error.message}`);
  const taskId =
    (typeof json.id === 'string' && json.id.trim()) ||
    (typeof json.task_id === 'string' && json.task_id.trim()) ||
    undefined;
  return { id: taskId, b64_json: json.b64_json, data: json.data };
}

/** codesonline 文档：data[].url / fallback_url / urls.mx|direct；见 image.codesonline.dev/personal/docs */
function pickImageUrlFromPayload(item: Record<string, unknown>): string {
  const urlVal = typeof item.url === 'string' ? item.url.trim() : '';
  if (urlVal) return urlVal;
  const urls = item.urls;
  if (urls && typeof urls === 'object') {
    const u = urls as Record<string, unknown>;
    const mx = typeof u.mx === 'string' ? u.mx.trim() : '';
    if (mx) return mx;
    const direct = typeof u.direct === 'string' ? u.direct.trim() : '';
    if (direct) return direct;
  }
  const fallback = typeof item.fallback_url === 'string' ? item.fallback_url.trim() : '';
  return fallback;
}

function extractTaskIdFromJson(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const rec = json as Record<string, unknown>;
  for (const key of ['id', 'task_id', 'taskId'] as const) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const item = firstOpenAiImageGenerationItem(json);
  if (!item) return undefined;
  for (const key of ['task_id', 'id', 'taskId'] as const) {
    const v = item[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const st = String(item.status ?? '').toLowerCase();
  if (st === 'submitted' || st === 'processing' || st === 'queued' || st === 'dispatched') {
    const tid = item.task_id ?? item.id;
    if (typeof tid === 'string' && tid.trim()) return tid.trim();
  }
  return undefined;
}

function imageTaskPollUrl(base: string, taskId: string): string {
  /** codesonline 异步任务：GET /v1/images/tasks/{id}（非 /images/generations/{id}） */
  if (isCodesonlineOpenAiCompatBase(base)) {
    return `${base}/images/tasks/${encodeURIComponent(taskId)}`;
  }
  return `${base}/images/generations/${encodeURIComponent(taskId)}`;
}

function isImageTaskDoneStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'completed' || s === 'succeeded' || s === 'success';
}

function isImageTaskFailedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'failed' || s === 'error';
}

function extractImageUrlsFromTaskPayload(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === 'string' && u.trim()) out.push(u.trim());
  };
  push(data.url);
  if (Array.isArray(data.image_urls)) data.image_urls.forEach(push);
  if (Array.isArray(data.result_urls_parsed)) data.result_urls_parsed.forEach(push);
  const output = data.output;
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.image_urls)) o.image_urls.forEach(push);
  }
  const result = data.result;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const imgs = r.images;
    if (Array.isArray(imgs)) {
      for (const im of imgs) {
        if (!im || typeof im !== 'object') continue;
        const rec = im as Record<string, unknown>;
        if (Array.isArray(rec.url)) rec.url.forEach(push);
        else push(rec.url);
      }
    }
    const rdata = r.data;
    if (Array.isArray(rdata)) {
      for (const item of rdata) {
        if (item && typeof item === 'object') push(pickImageUrlFromPayload(item as Record<string, unknown>));
      }
    }
  }
  const dataArr = data.data;
  if (Array.isArray(dataArr)) {
    for (const item of dataArr) {
      if (item && typeof item === 'object') {
        const url = pickImageUrlFromPayload(item as Record<string, unknown>);
        if (url) out.push(url);
      }
    }
  }
  return out;
}

function formatImageTaskPollStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === 'queued' || s === 'dispatched') return '任务已提交，等待 codesonline 分配生图账号…';
  if (s === 'running' || s === 'processing' || s === 'pending') return 'codesonline 正在生成图片…';
  return '正在查询生图任务状态…';
}

/** OpenAI 兼容网关（满 e / codesonline 等）轮询异步生图任务直到完成 */
async function pollOpenAiCompatImageTaskToBase64(
  base: string,
  apiKey: string,
  taskId: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string> {
  const deadline = Date.now() + MANXUE_TASK_MAX_WAIT_MS;
  await sleepInterruptible(2000, signal);
  const pollUrl = imageTaskPollUrl(base, taskId);
  const isCodesonline = isCodesonlineOpenAiCompatBase(base);

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    let res: Response;
    let text: string;
    try {
      res = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });
      text = await res.text();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new Error(
        `查询生图任务失败：${err instanceof Error ? err.message : String(err)}` +
          (isCodesonline ? '（codesonline 轮询 GET /v1/images/tasks/{id}）' : '')
      );
    }
    if (!res.ok) {
      throw new Error(
        `查询生图任务失败 (${res.status})${isCodesonline ? '，codesonline 请确认 task_id 有效' : ''}: ${text.slice(0, 500)}`
      );
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`生图任务响应非 JSON：${text.slice(0, 300)}`);
    }

    const status = String(data.status ?? '').toLowerCase();
    if (status && !isImageTaskDoneStatus(status) && !isImageTaskFailedStatus(status)) {
      onStatus?.(formatImageTaskPollStatus(status));
    }

    if (isImageTaskDoneStatus(status)) {
      const topB64 = data.b64_json;
      if (typeof topB64 === 'string' && isPlausibleImageBase64(topB64)) return topB64;
      const urls = extractImageUrlsFromTaskPayload(data);
      if (urls.length) return fetchUrlAsBase64(urls[0], signal, apiKey);
      const first = Array.isArray(data.data) ? data.data[0] : undefined;
      if (first && typeof first === 'object') {
        return openAiStyleImagePayloadToBase64(first as Record<string, unknown>, signal, apiKey);
      }
      throw new Error('生图任务已完成但未返回图片链接，请稍后重试或在 codesonline 控制台查看任务记录。');
    }
    if (isImageTaskFailedStatus(status)) {
      const errObj = data.error;
      const msg =
        (errObj && typeof errObj === 'object' && typeof (errObj as { message?: string }).message === 'string'
          ? (errObj as { message?: string }).message
          : undefined) ||
        (typeof data.error === 'string' ? data.error : undefined) ||
        JSON.stringify(data.error ?? data);
      throw new Error(`生图失败: ${msg}`);
    }
    await sleepInterruptible(3000, signal);
  }
  throw new Error(
    `生图任务超时（已等待超过 ${MANXUE_TASK_MAX_WAIT_MS / 60_000} 分钟）` +
      (isCodesonline ? '；可在 codesonline 控制台「在线体验」查看历史任务。' : '，请稍后重试。')
  );
}

/** @deprecated 别名：请使用 pollOpenAiCompatImageTaskToBase64 */
async function manxuePollTaskToBase64(
  base: string,
  apiKey: string,
  taskId: string,
  signal?: AbortSignal
): Promise<string> {
  return pollOpenAiCompatImageTaskToBase64(base, apiKey, taskId, signal);
}

/** 解析 OpenAI 兼容网关（满 e / codesonline 等）图生/图编响应为 base64 */
async function manxueGenerationResultToBase64(
  base: string,
  apiKey: string,
  result: { id?: string; b64_json?: string; data?: unknown[] },
  signal?: AbortSignal
): Promise<string> {
  if (result.b64_json && isPlausibleImageBase64(result.b64_json)) return result.b64_json;
  if (result.data && Array.isArray(result.data) && result.data.length > 0) {
    const first = result.data[0] as Record<string, unknown>;
    const b64 = typeof first.b64_json === 'string' ? first.b64_json : '';
    if (b64 && isPlausibleImageBase64(b64)) return b64;
    const url = pickImageUrlFromPayload(first);
    if (url) return fetchUrlAsBase64(url, signal, apiKey);
    const nestedTaskId =
      (typeof first.task_id === 'string' && first.task_id.trim()) ||
      (typeof first.id === 'string' && first.id.trim()) ||
      undefined;
    if (nestedTaskId) return pollOpenAiCompatImageTaskToBase64(base, apiKey, nestedTaskId, signal);
    throw new Error('图生图响应中未找到图片数据或 task_id');
  }
  if (result.id) return pollOpenAiCompatImageTaskToBase64(base, apiKey, result.id, signal);
  if (result.b64_json) {
    if (result.b64_json.startsWith('http://') || result.b64_json.startsWith('https://')) {
      return fetchUrlAsBase64(result.b64_json, signal, apiKey);
    }
    throw new Error('图生图返回的 base64 无效，请稍后重试或换用 url 回传格式');
  }
  throw new Error('图生图未返回任务 id 也无图片数据');
}

/** 从满 eAPI SSE 流式响应中提取图片 URL */
function extractImageUrlFromManxueSseAccumulated(acc: string): string | null {
  // 匹配 Markdown 图片格式 ![alt](url)
  const md = acc.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (md) return md[1];
  // 匹配普通 URL
  const ext = acc.match(/(https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?)/i);
  return ext ? ext[1] : null;
}

/** 从满 eAPI Grok 视频 chat/completions 流式累积文本中提取视频 URL（.mp4 / .mov / .webm 后缀优先，否则取最后一个 https URL） */
function extractVideoUrlFromManxueChatAccumulated(acc: string): string | null {
  if (!acc) return null;
  // Markdown 视频链接：[name](url.mp4 ...)
  const mdVideo = acc.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (mdVideo) return mdVideo[1];
  // Markdown 图片形式偶发被复用为视频
  const mdImg = acc.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (mdImg) return mdImg[1];
  // 显式视频后缀
  const ext = acc.match(/(https?:\/\/[^\s"'<>)]+\.(?:mp4|mov|m4v|webm)(?:\?[^\s"'<>)]*)?)/i);
  if (ext) return ext[1];
  // 兜底：取最后一个 https URL（满 e 视频网关常把 URL 放在末尾或单独一行）
  const all = acc.match(/https?:\/\/[^\s"'<>)]+/g);
  if (all && all.length) return all[all.length - 1];
  return null;
}

/**
 * 满 eAPI 文生图：使用 /v1/chat/completions + SSE 流式返回图片 URL
 */
async function manxueGenerateImageViaChat(
  prompt: string,
  model: string,
  aspectRatio: string,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 eAPI Key。');
  const base = manxueFetchBase();
  const key = apiKey.trim();

  const resolution = manxueResolution(nodeResolution);
  const size = toApisAspectSize(aspectRatio);

  // 构建消息内容
  const contentParts: string[] = [];
  contentParts.push(`图片比例${aspectRatio}, ${resolution}分辨率`);
  contentParts.push(prompt);

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'user',
        content: contentParts.join('，') + '。',
      },
    ],
    stream: true,
  };

  // 添加图片生成参数
  if (model.startsWith('gemini-')) {
    body.resolution = resolution;
  }
  if (quality && (model === 'gpt-image-2' || model === 'gpt-image-2-pro')) {
    body.quality = quality;
  }

  const res = await fetch(`${base}/chat/completions`, {
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
    throw new Error(`满 eAPI 文生图 (${res.status}): ${t.slice(0, 800)}`);
  }

  if (!res.body) throw new Error('满 eAPI 响应不支持流式读取。');

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
          const url = extractImageUrlFromManxueSseAccumulated(acc);
          if (url) return fetchUrlAsBase64(url, signal, key);
          continue;
        }
        try {
          const chunk = JSON.parse(data) as {
            error?: { message?: string };
            choices?: Array<{ delta?: { content?: string } }>;
          };
          if (chunk.error?.message) throw new Error(`满 eAPI: ${chunk.error.message}`);
          const content = chunk.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content) {
            acc += content;
            const url = extractImageUrlFromManxueSseAccumulated(acc);
            if (url) return fetchUrlAsBase64(url, signal, key);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('满 eAPI:')) throw e;
        }
      }
    }
    const url = extractImageUrlFromManxueSseAccumulated(acc);
    if (url) return fetchUrlAsBase64(url, signal, key);
    throw new Error(`满 eAPI 流式响应中未解析到图片 URL。文本片段：${acc.slice(0, 500)}`);
  } finally {
    reader.releaseLock();
  }
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

export type ToApisVideoModelId = 'grok-video-3' | 'grok-video-1.5-preview' | 'sora-2-vvip' | 'veo3.1-fast' | 'doubao-seedance-1-5-pro' | 'jimeng-video-v3' | 'jimeng-image-to-video' | 'gemini-omni-flash' | 'seedance-2' | 'seedance-2-fast' | 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128' | 'grok-imagine-video-1.5-preview' | 'grok-imagine-video-1.5-preview-aiid';

function isHttpUrlString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  // 兼容 https:/xxx（单斜杠） 和 https://xxx（双斜杠）
  return /^https?:\/[/]/i.test(t);
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

  // doubao-seedance-1-5-pro 等模型可能直接在顶层 data 数组返回
  const topData = o.data;
  if (Array.isArray(topData)) {
    for (const item of topData) {
      if (item && typeof item === 'object') {
        const u = (item as Record<string, unknown>).url;
        if (isHttpUrlString(u)) return u.trim();
      }
    }
  } else if (topData && typeof topData === 'object') {
    const td = topData as Record<string, unknown>;
    if (isHttpUrlString(td.url)) return td.url.trim();
    for (const k of ['video_url', 'download_url', 'file_url'] as const) {
      if (isHttpUrlString(td[k])) return String(td[k]).trim();
    }
    const vid = td.video;
    if (vid && typeof vid === 'object' && isHttpUrlString((vid as Record<string, unknown>).url)) {
      return String((vid as Record<string, unknown>).url).trim();
    }
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
      for (const k of ['video_url', 'download_url', 'file_url'] as const) {
        if (isHttpUrlString(rd[k])) return String(rd[k]).trim();
      }
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

  // doubao-seedance-1-5-pro 等模型可能将 url 放在顶层 metadata.url 中
  const meta = o.metadata;
  if (meta && typeof meta === 'object' && isHttpUrlString((meta as Record<string, unknown>).url)) {
    return String((meta as Record<string, unknown>).url).trim();
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
          `ToAPIs 视频任务完成但未返回可播放 URL。完整响应：${text.slice(0, 2000)}`
        );
      }
      // 规范化 URL：https:/xxx → https://xxx
      const normalizedUrl = rawUrl.replace(/^(https?:\/)([^/])/i, '$1/$2');
      return rewriteKnownImageCdnToSameOrigin(normalizedUrl);
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

/** 满 eAPI 视频任务超时：30 分钟 */
const MANXUE_VIDEO_TASK_MAX_WAIT_MS = 1_800_000;

/** 满 eAPI 参考图最大张数（首帧） */
const MANXUE_VIDEO_MAX_REFERENCE_IMAGES = 3;

/**
 * 满 eAPI（manxueapi.com）视频生成参考图：`grok-imagine-video-1.5-preview` 在
 * `/v1/chat/completions` 模式下直接接受「公网 HTTPS URL」或「base64 data URI」（同 xAI Grok 视频 API）。
 * 该路由不强制走 `/uploads/images` 上传端点；满 eAPI 视频路由下 `/v1/upload/image` 实测返回 404。
 * 旧实现：先尝试 `/uploads/images` 失败回退为 data URI（保留作为兜底）。
 *
 * CORS 已由 `/manxue-api` 同源代理处理（Vite dev + Vercel rewrite）。
 */
async function manxueUploadReferenceImageUrls(
  refs: string[],
  _signal?: AbortSignal
): Promise<string[]> {
  if (!refs || refs.length === 0) return [];
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 e API Key。请在「设置 → API → 满 e」填写。');
  const list = refs.filter(Boolean).slice(0, MANXUE_VIDEO_MAX_REFERENCE_IMAGES);
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const { raw, mime } = parseBase64ImageInput(list[i]);
    // 满 e Grok Video 走 /v1/chat/completions，不暴露独立的 /upload/image 端点（实测 404）。
    // 直接用 data URI 作为多模态 image_url，manxue 网关在 chat 路由可透传至上游。
    // 若将来网关支持上传，可在此处插入 openAiCompatUploadImageBlob 优先路径。
    const cleanRaw = raw.replace(/\s/g, '');
    const m = mime || sniffMimeFromBase64(cleanRaw) || 'image/jpeg';
    out.push(`data:${m};base64,${cleanRaw}`);
  }
  return out;
}

async function manxueSubmitVideoGeneration(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ id: string }> {
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 e API Key。请在「设置 → API → 满 e」填写。');
  const base = manxueFetchBase();
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
    throw new Error(`满 e 视频提交失败 (${res.status}): ${text.slice(0, 800)}`);
  }
  let json: { id?: string; task_id?: string; taskId?: string; error?: { message?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`满 e 响应非 JSON: ${text.slice(0, 400)}`);
  }
  if (json.error?.message) throw new Error(`满 e: ${json.error.message}`);
  const id = json.id || json.task_id || json.taskId;
  if (!id) throw new Error(`满 e 未返回视频任务 id：${text.slice(0, 400)}`);
  return { id: String(id) };
}

async function manxuePollVideoTaskToPlayableUrl(
  taskId: string,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getManxueSavedKey();
  const base = manxueFetchBase();
  const deadline = Date.now() + MANXUE_VIDEO_TASK_MAX_WAIT_MS;
  await sleepInterruptible(5_000, signal);

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    const res = await fetch(`${base}/videos/generations/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // 偶发 5xx 继续重试
      await sleepInterruptible(10_000, signal);
      continue;
    }
    let data: { status?: string; error?: { message?: string } };
    try {
      data = JSON.parse(text);
    } catch {
      await sleepInterruptible(5_000, signal);
      continue;
    }
    if (isVideoTaskCompletedStatus(data.status)) {
      const rawUrl = extractVideoUrlFromPollPayload(data);
      if (!rawUrl) {
        throw new Error(
          `满 e 视频任务完成但未返回可播放 URL。完整响应：${text.slice(0, 2000)}`
        );
      }
      const normalizedUrl = rawUrl.replace(/^(https?:\/)([^/])/i, '$1/$2');
      return normalizedUrl;
    }
    const st = String(data.status || '').toLowerCase();
    if (st === 'failed' || st === 'error' || st === 'cancelled') {
      throw new Error(`满 e 视频生成失败: ${data.error?.message || text.slice(0, 300)}`);
    }
    await sleepInterruptible(10_000, signal);
  }
  throw new Error(
    `满 e 视频任务超时（已等待超过 ${MANXUE_VIDEO_TASK_MAX_WAIT_MS / 60_000} 分钟），请稍后重试。`
  );
}

/**
 * 满 eAPI：`grok-imagine-video-1.5-preview` 文生 / 图生视频。
 * - 10 / 15 秒；720p（固定）。
 * - 参考图 0 张 = 文生；1+ 张 = 图生（取首张作为关键帧）。
 * - 字段名沿用 OpenAI 兼容 / Sora 风格（seconds / aspect_ratio / resolution），
 *   同时附 `resolution_name` 双字段以兼容部分聚合网关的命名。
 */
export async function manxueVideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '720p';
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const { prompt, durationSeconds, aspectRatio, referenceImagesBase64 = [], signal } = params;
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 e API Key。请在「设置 → API → 满 e」填写。');
  const key = apiKey.trim();
  const base = manxueFetchBase();

  const imageUrls = await manxueUploadReferenceImageUrls(referenceImagesBase64, signal);

  // 拼装 user 消息：若带参考图，作为多模态 content；纯文生则直接文本。
  const duration = Number(durationSeconds) || 10;
  const resolution = '720p';

  // xAI 官方 Grok 视频 API（grok-imagine-video-1.5-preview）：
  //   - 字段名：duration（数字 1-15），aspect_ratio，resolution
  //   - image-to-video 模式：默认按参考图画幅，但 aspect_ratio 字段**可 override**（拉伸）
  //   - default duration = 6 秒（不传 duration 时回退）
  // 满 eAPI 在 chat/completions 路由上是否解析这些字段取决于网关实现。
  // 为最大化兼容：
  //   - 图生视频：探测参考图实际画幅，aspect_ratio 仍按用户选择（不强制等于参考图），
  //     提示中明示用户"图生时将按 aspect_ratio 拉伸"
  //   - prompt 显式说明 duration（防 fallback 到 6 秒）
  let probedAspect: { width: number; height: number; canonical: string } | null = null;
  if (imageUrls.length > 0 && referenceImagesBase64.length > 0) {
    const probed = await readImageBase64AspectRatio(referenceImagesBase64[0], signal);
    if (probed) {
      probedAspect = { width: probed.width, height: probed.height, canonical: probed.canonical };
    }
  }

  const effectiveAspectRatio = aspectRatio;

  // 双向夹击保证画幅与时长（满 e 网关不解析 aspect_ratio / duration top-level 字段）：
  // 1) top-level body 字段（多字段兜底，万一网关某天支持就有用）
  // 2) system 强 prompt（chat 路由唯一能识别的形式）
  // 3) user 末尾强提示（防止 system 丢失）
  //
  // 关键 prompt 策略：
  //   - 不能说"按 aspect_ratio 拉伸"——上游 Grok video 默认就是拉伸，
  //     但用户反馈 16:9→9:16 说明 chat 路由**根本没让上游拉伸**。
  //   - 改为让 chat 模型**先在脑里把参考图重塑为 16:9 画幅**（左/右留白、画面主体居中），
  //     再交给上游图生视频。这是 chat LLM 能听懂并影响其调用的指令。
  //   - 时长同样：明确说"duration=15 秒"且禁止"自动缩短到 6 秒"。
  const systemText =
    '你是视频生成助手。' +
    `本次任务必须生成：画幅=${effectiveAspectRatio}，时长=${duration} 秒。` +
    `无论参考图是什么画幅，最终视频画幅必须是 ${effectiveAspectRatio}（不是参考图原画幅）。` +
    (probedAspect
      ? `参考图是 ${probedAspect.width}×${probedAspect.height}（约 ${probedAspect.canonical}）。` +
        `请把参考图"扩展/外推"为 ${effectiveAspectRatio} 画幅后再生成视频——` +
        '比如 9:16 变 16:9：把参考图主体居中，左右各加黑边/场景外推，使其变成 16:9；' +
        '16:9 变 9:16：把参考图主体居中，上下各加黑边/场景外推。' +
        '**绝不能**直接生成与参考图同画幅的视频。'
      : '') +
    `时长必须是 ${duration} 秒，**绝不能**自动缩短到 6 秒或默认时长。` +
    '完成后只返回一行可播放的视频 URL（Markdown 链接或裸 URL），不要任何其他文字。';
  const userHint =
    `\n\n[params] aspect_ratio=${effectiveAspectRatio}, duration=${duration}。` +
    `请生成 ${effectiveAspectRatio} 画幅（外推参考图到该画幅）、${duration} 秒的视频，` +
    '完成后只返回一行可播放的视频 URL（Markdown 链接或裸 URL）。';
  const userText = prompt + userHint;
  const userContentParts: Array<{ type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string }> = [];
  if (imageUrls.length) {
    for (const u of imageUrls) {
      userContentParts.push({ type: 'image_url', image_url: { url: u } });
    }
  }
  userContentParts.push({ type: 'text', text: userText });
  const userContent: string | typeof userContentParts = imageUrls.length ? userContentParts : userText;

  // 字段命名兼容（基于 xAI 原生 + 满 e 网关实测反馈）：
  // - duration: 数字 1-15（xAI 原生，default=6）
  // - aspect_ratio: 字符串（xAI 原生）—— 这是上游认的画幅字段
  // - 之前加 size 像素字符串（白名单 1280x720/720x1280/...）实测反而让 400 报错（与
  //   原始 chat 路由不兼容），回退到只发 aspect_ratio。
  // - 不发 size、不发 resolution（满 e 网关 chat 路由上验证过不需要）
  const body: Record<string, unknown> = {
    model: MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID,
    messages: [
      { role: 'system', content: systemText },
      { role: 'user', content: userContent },
    ],
    stream: true,
    duration,
    duration_name: duration,
    seconds: duration,
    aspect_ratio: effectiveAspectRatio,
    aspect_ratio_name: effectiveAspectRatio,
    aspectRatio: effectiveAspectRatio,
  };

  const res = await fetch(`${base}/chat/completions`, {
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
    throw new Error(`满 e 视频提交失败 (${res.status}): ${t.slice(0, 800)}`);
  }
  if (!res.body) throw new Error('满 e 视频响应不支持流式读取。');

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
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as {
            error?: { message?: string };
            choices?: Array<{ delta?: { content?: string } }>;
          };
          if (chunk.error?.message) throw new Error(`满 e 视频: ${chunk.error.message}`);
          const content = chunk.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content) {
            acc += content;
            const url = extractVideoUrlFromManxueChatAccumulated(acc);
            if (url) return url;
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('满 e 视频:')) throw e;
        }
      }
    }
    const tail = extractVideoUrlFromManxueChatAccumulated(acc);
    if (tail) return tail;
    throw new Error(`满 e 视频流式响应中未解析到视频 URL。文本片段：${acc.slice(0, 500)}`);
  } finally {
    reader.releaseLock();
  }
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
  /** 模型 id；默认 grok-video-3，可选 grok-video-1.5-preview（xAI 1.5 Preview） */
  videoModel?: 'grok-video-3' | 'grok-video-1.5-preview';
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
  const modelId = params.videoModel || 'grok-video-3';

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
    model: modelId,
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

/**
 * ToAPIs：`doubao-seedance-1-5-pro`（豆包 SeeDance 1.5 Pro 视频生成）。
 * 文档：https://docs.toapis.com/docs/cn/api-reference/videos/doubao-seedance-1-5/generation
 * - `duration`：4–12 秒
 * - `aspect_ratio`：16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9
 * - `metadata.resolution`：480p / 720p / 1080p
 * - 首帧图/尾帧图：以 `image_with_roles` 传入（最多 2 张，分别指定 first_frame / last_frame）
 * - 1.5 Pro 不支持 reference_image 角色
 */
async function toApisDoubaoSeedance15ProVideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p';
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

  // 首帧/尾帧图上传
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'doubao-video-ref',
    params.signal
  );

  // 构建 image_with_roles：最多 2 张，第一张为首帧，第二张为尾帧
  const imageWithRoles: { url: string; role: string }[] = [];
  if (imageUrls.length >= 1) {
    imageWithRoles.push({ url: imageUrls[0], role: 'first_frame' });
  }
  if (imageUrls.length >= 2) {
    imageWithRoles.push({ url: imageUrls[1], role: 'last_frame' });
  }

  const body: Record<string, unknown> = {
    model: 'doubao-seedance-1-5-pro',
    prompt: params.prompt,
    duration: params.durationSeconds,
    aspect_ratio: params.aspectRatio,
    metadata: {
      resolution: params.resolution,
    },
  };
  if (imageWithRoles.length > 0) body.image_with_roles = imageWithRoles;

  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

async function toApisGeminiOmniVideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p';
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

  // 首帧/尾帧图上传
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'gemini-video-ref',
    params.signal
  );

  // 构建 image_urls：最多 3 张（0张文生视频，1张单图生视频，3张融合）
  const validDuration = [4, 6, 10].includes(params.durationSeconds) ? params.durationSeconds : 6;

  const body: Record<string, unknown> = {
    model: 'gemini_omni_flash',
    prompt: params.prompt,
    duration: validDuration,
    aspect_ratio: params.aspectRatio,
    resolution: params.resolution === '1080p' ? '1080p' : '720P',
  };
  if (imageUrls.length > 0) body.image_urls = imageUrls.slice(0, 3);

  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

/**
 * AIID (api.aiid.edu.kg)：`doubao-seedance-2-0-260128` / `doubao-seedance-2-0-fast-260128`（豆包Seedance2.0 视频生成）。
 * - `duration`：5-10 秒
 * - `aspect_ratio`：16:9 / 9:16 / 1:1 / 4:3 / 3:4
 * - `metadata.resolution`：480p / 720p / 1080p
 * - 参考图：通过 `image_with_roles` 传入（首帧/尾帧）
 */
async function toApisDoubaoSeedance2VideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p';
  referenceImagesBase64?: string[];
  videoModel: 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128';
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = getAiidSavedKey();
  if (!apiKey) {
    throw new Error('AIID 视频生成：未配置 API Key，请在「设置 → API → AIID」中填写。');
  }
  // 使用同源代理路径避免 CORS 问题（开发环境 Vite proxy / 生产环境 vercel.json rewrite）
  const base = (() => {
    const saved = getAiidBaseUrl();
    if (saved && saved !== DEFAULT_AIID_BASE_URL) return saved.replace(/\/v1$/, '').replace(/\/+$/, '');
    // 指向同源代理路径
    return '/api/aiid';
  })();

  // 构建 content 数组（AIID 专用格式）
  // AIID 的 image_url 可以直接接收 data URI（base64），无需预先上传
  const content: Array<{ type: string; text?: string; image_url?: { url: string }; role?: string }> = [
    { type: 'text', text: params.prompt },
  ];
  const refs = (params.referenceImagesBase64 || []).slice(0, 2);
  for (let i = 0; i < refs.length; i++) {
    const { raw, mime } = parseBase64ImageInput(refs[i]);
    const dataUri = `data:${mime};base64,${raw}`;
    content.push({ type: 'image_url', image_url: { url: dataUri }, role: i === 0 ? 'first_frame' : 'last_frame' });
  }

  const validDuration = [4, 6, 8, 10, 12, 15].includes(params.durationSeconds) ? params.durationSeconds : 8;
  const ratioMap: Record<string, string> = {
    '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:3': '4:3', '3:4': '3:4',
  };
  const ratio = ratioMap[params.aspectRatio] || '16:9';

  const body: Record<string, unknown> = {
    model: params.videoModel,
    mode: 'reference_material',
    content,
    duration: validDuration,
    size: params.resolution === '1080p' ? '1920x1080' : params.resolution === '480p' ? '854x480' : '1280x720',
    aspect_ratio: ratio,
  };

  // 提交任务到 AIID /api/v3/contents/generations/tasks
  const taskRes = await fetch(`${base}/api/v3/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!taskRes.ok) {
    const t = await taskRes.text();
    throw new Error(`AIID 视频任务提交失败 (${taskRes.status}): ${t.slice(0, 800)}`);
  }
  let taskJson: unknown;
  try { taskJson = JSON.parse(await taskRes.text()); } catch { throw new Error(`AIID 提交响应无效: ${await taskRes.text().slice(0, 200)}`); }
  const taskData = taskJson as Record<string, unknown>;
  const taskId = taskData.id as string;
  if (!taskId) throw new Error(`AIID 未返回任务 id：${await taskRes.text().slice(0, 400)}`);

  // 轮询结果
  const deadline = Date.now() + TOAPIS_VIDEO_TASK_MAX_WAIT_MS;
  await sleepInterruptible(5000, params.signal);
  while (Date.now() < deadline) {
    assertNotAborted(params.signal);
    const pollRes = await fetch(`${base}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: params.signal,
    });
    const pollText = await pollRes.text();
    if (!pollRes.ok) throw new Error(`AIID 查询任务失败 (${pollRes.status}): ${pollText.slice(0, 500)}`);
    let pollJson: unknown;
    try { pollJson = JSON.parse(pollText); } catch { throw new Error(`AIID 轮询响应无效: ${pollText.slice(0, 200)}`); }
    const pollData = pollJson as Record<string, unknown>;
    const items = Array.isArray(pollData.items) ? pollData.items : [];
    const item = (items[0] as Record<string, unknown>) || {};
    const status = String(item.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'completed' || status === 'done') {
      const videoUrl = (item.content as Record<string, unknown>)?.video_url as string || item.video_url as string;
      if (!videoUrl) throw new Error(`AIID 任务完成但未返回视频 URL`);
      return videoUrl;
    }
    if (status === 'failed' || status === 'error') {
      const errMsg = (item.error as string) || JSON.stringify(item.error) || pollText.slice(0, 400);
      throw new Error(`AIID 视频任务失败: ${errMsg}`);
    }
    await sleepInterruptible(5000, params.signal);
  }
  throw new Error('AIID 视频任务超时');
}

/**
 * AIID (api.aiid.edu.kg)：`grok-imagine-video-1.5-preview`（xAI Grok Imagine Video 1.5 Preview，**只支持图生视频**）。
 * - `duration`：1-15 秒（xAI 文档：https://docs.x.ai/developers/model-capabilities/video/generation）
 * - `aspect_ratio`：1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3
 * - 1.5 preview **必须**有参考图（xAI 文档：text-to-video is not yet available on that model）
 * - 走 xAI 原生异步任务端点 `/v1/videos/generations` + 轮询 `/v1/videos/{request_id}`
 *   （用户反馈：AIID 实际提供的视频端点是 `/v1/videos`，不是 `/api/v3/contents/generations/tasks`）
 *   字段名：image（公网 URL 或 base64 data URI）、duration(数字)、aspect_ratio、resolution
 * - 与满 e grok-imagine-video-1.5-preview（chat 路由）的关键差异：
 *   AIID 走 xAI 原生异步任务，aspect_ratio / duration 字段会被尊重
 */
export const AIID_GROK_IMAGINE_VIDEO_MODEL = 'grok-imagine-video-1.5-preview';

export function isAiidGrokImagineVideoModel(m?: string): boolean {
  return m === 'grok-imagine-video-1.5-preview-aiid';
}

export async function aiidGrokImagineVideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p';
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = getAiidSavedKey();
  if (!apiKey) {
    throw new Error('AIID 视频生成：未配置 API Key，请在「设置 → API → AIID」中填写。');
  }
  // 1.5 preview **必须**有参考图
  const refs = (params.referenceImagesBase64 || []).filter(Boolean);
  if (refs.length === 0) {
    throw new Error('Grok Imagine Video 1.5 Preview 仅支持图生视频（I2V），请连接至少一张参考图。');
  }

  // 使用同源代理路径避免 CORS 问题（开发环境 Vite proxy / 生产环境 vercel.json rewrite）
  // AIID grok-imagine 走的是 xAI 原生 /v1/videos，base URL 必须含 /v1
  // 默认用同源代理（saved base 为默认时），避免浏览器 CORS
  const base = (() => {
    const saved = getAiidBaseUrl();
    if (!saved || saved === DEFAULT_AIID_BASE_URL) {
      // 同源代理路径（Vite proxy / Vercel rewrite 都会剥 /api/aiid 前缀转发到 https://api.aiid.edu.kg）
      return '/api/aiid/v1';
    }
    const norm = saved.replace(/\/+$/, '');
    return norm.endsWith('/v1') ? norm : `${norm}/v1`;
  })();

  // duration 1-15 秒
  const validDuration = (() => {
    const d = Number(params.durationSeconds) || 10;
    if (d < 1) return 1;
    if (d > 15) return 15;
    return Math.round(d);
  })();

  const ratioMap: Record<string, string> = {
    '1:1': '1:1', '16:9': '16:9', '9:16': '9:16',
    '4:3': '4:3', '3:4': '3:4', '3:2': '3:2', '2:3': '2:3',
  };
  const ratio = ratioMap[params.aspectRatio] || '16:9';
  const resolution = params.resolution === '1080p' ? '720p' : params.resolution === '480p' ? '480p' : '720p';

  // 取首张参考图作为 image 字段（xAI image-to-video 模式：image 字段即可）
  const firstRef = refs[0];
  const { raw, mime } = parseBase64ImageInput(firstRef);
  const dataUri = `data:${mime || 'image/jpeg'};base64,${raw}`;

  // xAI 原生视频提交 body
  const body: Record<string, unknown> = {
    model: AIID_GROK_IMAGINE_VIDEO_MODEL,
    prompt: params.prompt,
    image: { url: dataUri },
    duration: validDuration,
    aspect_ratio: ratio,
    resolution,
  };

  // 提交任务到 /v1/videos/generations
  const taskRes = await fetch(`${base}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!taskRes.ok) {
    const t = await taskRes.text();
    throw new Error(`AIID Grok Imagine 视频提交失败 (${taskRes.status}): ${t.slice(0, 800)}`);
  }
  let taskJson: unknown;
  try { taskJson = JSON.parse(await taskRes.text()); } catch { throw new Error(`AIID 提交响应无效: ${await taskRes.text().slice(0, 200)}`); }
  const taskData = taskJson as Record<string, unknown>;
  const requestId = (taskData.request_id || taskData.id) as string;
  if (!requestId) throw new Error(`AIID 未返回 request_id：${await taskRes.text().slice(0, 400)}`);

  // 轮询结果（xAI 标准协议）
  const deadline = Date.now() + TOAPIS_VIDEO_TASK_MAX_WAIT_MS;
  await sleepInterruptible(5000, params.signal);
  while (Date.now() < deadline) {
    assertNotAborted(params.signal);
    const pollRes = await fetch(`${base}/videos/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: params.signal,
    });
    const pollText = await pollRes.text();
    if (!pollRes.ok) throw new Error(`AIID 查询任务失败 (${pollRes.status}): ${pollText.slice(0, 500)}`);
    let pollJson: unknown;
    try { pollJson = JSON.parse(pollText); } catch { throw new Error(`AIID 轮询响应无效: ${pollText.slice(0, 200)}`); }
    const pollData = pollJson as Record<string, unknown>;
    // xAI 标准响应：{ status, video: { url }, ... }
    const status = String(pollData.status || '').toLowerCase();
    if (status === 'done' || status === 'succeeded' || status === 'completed') {
      const video = pollData.video as Record<string, unknown> | undefined;
      const videoUrl = (video?.url || pollData.video_url || pollData.url) as string | undefined;
      if (!videoUrl) throw new Error(`AIID 任务完成但未返回视频 URL: ${pollText.slice(0, 400)}`);
      return videoUrl;
    }
    if (status === 'failed' || status === 'error' || status === 'expired') {
      const errMsg =
        (pollData.error as Record<string, unknown>)?.message ||
        (pollData.error as string) ||
        pollText.slice(0, 400);
      throw new Error(`AIID Grok Imagine 视频任务${status}: ${errMsg}`);
    }
    await sleepInterruptible(5000, params.signal);
  }
  throw new Error('AIID Grok Imagine 视频任务超时');
}

/**
 * ToAPIs：`seedance-2` / `seedance-2-fast`（Seedance 2 视频生成）。
 * 文档：https://docs.toapis.com/docs/cn/api-reference/videos/seedance-2/generation
 * - `duration`：5–10 秒
 * - `aspect_ratio`：16:9 / 9:16 / 1:1
 * - `metadata.resolution`：720p / 1080p
 * - 参考图：通过 `image_with_roles` 传入（首帧/尾帧）
 */
async function toApisSeedance2VideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p';
  referenceImagesBase64?: string[];
  videoModel: 'seedance-2' | 'seedance-2-fast';
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

  // 参考图上传
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'seedance-video-ref',
    params.signal
  );

  // 构建 image_with_roles：最多 2 张，第一张为首帧，第二张为尾帧
  const imageWithRoles: { url: string; role: string }[] = [];
  if (imageUrls.length >= 1) {
    imageWithRoles.push({ url: imageUrls[0], role: 'first_frame' });
  }
  if (imageUrls.length >= 2) {
    imageWithRoles.push({ url: imageUrls[1], role: 'last_frame' });
  }

  const body: Record<string, unknown> = {
    model: params.videoModel,
    prompt: params.prompt,
    duration: params.durationSeconds,
    aspect_ratio: params.aspectRatio,
    metadata: {
      resolution: params.resolution,
    },
  };
  if (imageWithRoles.length > 0) body.image_with_roles = imageWithRoles;

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
  // AIID grok-imagine-video 优先拦截（避免后续 toapis 校验误伤）
  if (isAiidGrokImagineVideoModel(params.videoModel)) {
    return aiidGrokImagineVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution === '1080p' ? '1080p' : params.resolution === '480p' ? '480p' : '720p',
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
  // 满 e 视频优先拦截（避免后续 isToApisHost 校验误伤）
  if (isManxueVideoModel(params.videoModel)) {
    return manxueVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: '720p',
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
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
  if (params.videoModel === 'doubao-seedance-1-5-pro') {
    const res =
      params.resolution === '1080p' || params.resolution === '480p'
        ? params.resolution
        : '720p';
    return toApisDoubaoSeedance15ProVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: res,
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
  if (params.videoModel === 'seedance-2' || params.videoModel === 'seedance-2-fast') {
    const res =
      params.resolution === '1080p' || params.resolution === '480p'
        ? params.resolution
        : '720p';
    return toApisSeedance2VideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: res,
      referenceImagesBase64: params.referenceImagesBase64,
      videoModel: params.videoModel as 'seedance-2' | 'seedance-2-fast',
      signal: params.signal,
    });
  }
  if (params.videoModel === 'gemini-omni-flash') {
    return toApisGeminiOmniVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution === '480p' ? '480p' : '720p',
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
  if (params.videoModel === 'doubao-seedance-2-0-260128' || params.videoModel === 'doubao-seedance-2-0-fast-260128') {
    const res =
      params.resolution === '1080p' || params.resolution === '480p'
        ? params.resolution
        : '720p';
    return toApisDoubaoSeedance2VideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: res,
      referenceImagesBase64: params.referenceImagesBase64,
      videoModel: params.videoModel as 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128',
      signal: params.signal,
    });
  }
  if (params.videoModel.startsWith('jimeng-')) {
    throw new Error('即梦模型请通过前端即梦客户端调用，不支持直接走 ToAPIs');
  }
  // grok-video-1.5-preview 走同一异步视频生成函数，但 body.model 不同
  // 用户反馈样例：curl POST /v1/videos/generations  {model: "grok-video-1.5-preview",
  //   images: [url], seconds: "10", aspect_ratio: "16:9"}
  if (params.videoModel === 'grok-video-1.5-preview') {
    return toApisGrokVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution === '480p' ? '480p' : '720p',
      videoModel: 'grok-video-1.5-preview',
      referenceImagesBase64: params.referenceImagesBase64,
      referenceAudioBase64: params.referenceAudioBase64,
      signal: params.signal,
    });
  }
  // 默认兜底（grok-video-3）
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
  if (m === 'gpt-image-2-hfsy') return 'gpt-image-2';
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m === 'gpt-image-2-otuapi') return 'gpt-image-2';
  if (m === 'dall-e-2' || m === 'dall-e-3' || m === 'gpt-image-2' || m === 'gpt-image-1') return m;
  return 'dall-e-3';
}

function resolveEditModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
  if (m === 'gpt-image-2-hfsy') return 'gpt-image-2';
  if (m === 'gpt-image-2-junlan') return 'gpt-image-2';
  if (m === 'gpt-image-2-otuapi') return 'gpt-image-2';
  if (m === 'gpt-image-2') return 'gpt-image-2';
  if (m === 'dall-e-2' || m === 'gpt-image-1') return m;
  if (m === 'dall-e-3') return 'gpt-image-1';
  return 'gpt-image-1';
}

/** 满 eAPI 尺寸格式：WIDTHxHEIGHT（如 1824x1024），而非宽高比 */
function manxueAspectSize(aspectRatio: string): string {
  const map: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1824x1024',
    '9:16': '1024x1824',
    '4:3': '1024x1024',
    '3:4': '1024x1824',
    '2:1': '1824x1024',
    '1:2': '1024x1824',
    '21:9': '1824x1024',
    '9:21': '1024x1824',
    '3:2': '1824x1024',
    '2:3': '1024x1824',
    '5:4': '1024x1024',
    '4:5': '1024x1824',
  };
  return map[aspectRatio] || '1024x1024';
}

/** 满 eAPI 文生图：GPT Image 2 用 /v1/images/generations，Gemini 用 Vertex AI 风格接口 */
async function manxueGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  modelName: string,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  // Gemini 系列使用 Vertex AI 风格接口
  if (isManxueGeminiModel(modelName)) {
    return manxueGeminiGenerateImage(prompt, aspectRatio, numberOfImages, modelName, nodeResolution, signal);
  }

  const model = manxueT2iModel(modelName);
  const resolution = manxueResolution(nodeResolution);
  const size = manxueAspectSize(aspectRatio);
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 eAPI Key。');
  const base = manxueFetchBase();
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 8);

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const body: Record<string, unknown> = {
      model,
      prompt: `${prompt}\n\n（画幅比例 ${aspectRatio}）`,
      n: 1,
      size,
      response_format: 'b64_json',
    };
    // GPT Image 2 支持 quality 参数
    if (quality && (model === 'gpt-image-2' || model === 'gpt-image-2-pro')) {
      body.quality = quality;
    }
    const result = await manxueSubmitGeneration(base, apiKey, body, signal);
    // 满 eAPI 可能同步返回图片（data[0].b64_json）或返回 id（需轮询）
    let b64: string;
    if (result.b64_json) {
      b64 = result.b64_json;
    } else if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const first = result.data[0] as { b64_json?: string; url?: string };
      if (first.b64_json) {
        b64 = first.b64_json;
      } else if (first.url) {
        b64 = await fetchUrlAsBase64(first.url, signal, apiKey);
      } else {
        throw new Error('满 eAPI 响应中未找到图片数据');
      }
    } else if (result.id) {
      b64 = await manxuePollTaskToBase64(base, apiKey, result.id, signal);
    } else {
      throw new Error('满 eAPI 未返回任务 id 也无图片数据');
    }
    out.push(b64);
  }
  return out;
}

/** 满 eAPI 图生图：使用 /v1/images/edits 接口 */
async function manxueEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  modelName: string,
  aspectRatio: string,
  nodeResolution?: string,
  quality?: string,
  pixelSize?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const model = manxueT2iModel(modelName);
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 eAPI Key。');
  const base = manxueFetchBase();

  // Gemini 模型使用 Vertex AI 风格的 API（包含参考图）
  if (model.startsWith('gemini-')) {
    return manxueGeminiEditImage(base64Images, prompt, numberOfImages, model, aspectRatio, nodeResolution, signal);
  }

  // GPT 模型使用标准 OpenAI /images/edits（multipart 上传参考图）
  const size = pixelSize || manxueAspectSize(aspectRatio);
  const imageBlobs: { blob: Blob; filename: string }[] = [];
  for (const img of base64Images.slice(0, 16)) {
    imageBlobs.push({
      blob: await jpegBlobUnderBytesForImageEdit(img, MANXUE_EDIT_IMAGE_MAX_BYTES, signal),
      filename: 'ref.jpg',
    });
  }
  if (!imageBlobs.length) throw new Error('参考图处理失败');

  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 4);

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    console.log('[DEBUG manxueEditImage] 发送请求:', {
      base,
      endpoint: '/images/edits',
      model,
      prompt: prompt.slice(0, 100),
      imageCount: imageBlobs.length,
      imageBytes: imageBlobs.map(({ blob }) => blob.size),
      size,
    });
    const form = new FormData();
    for (const { blob, filename } of imageBlobs) {
      form.append('image[]', blob, filename);
    }
    form.append('model', model);
    form.append('prompt', `${prompt}\n\n（画幅比例 ${aspectRatio}）`);
    form.append('n', '1');
    form.append('size', size);
    form.append('response_format', 'b64_json');
    if (quality && (model === 'gpt-image-2' || model === 'gpt-image-2-pro')) {
      form.append('quality', quality);
    }
    const result = await manxueSubmitEdit(base, apiKey, form, signal);
    console.log('[DEBUG manxueEditImage] 响应:', JSON.stringify(result).slice(0, 500));
    out.push(await manxueGenerationResultToBase64(base, apiKey, result, signal));
  }
  return out;
}

/** codesonline GPT Image 2 文生图：POST /v1/images/generations，异步轮询 GET /v1/images/tasks/{id} */
async function codesonlineGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const apiKey = getCodesonlineSavedKey().trim();
  if (!apiKey) {
    throw new Error(
      '未配置 codesonline 图像通道。请在「设置 → API」填写「codesonline（GPT Image 2）」API Key。'
    );
  }
  return generateImagesAtOpenAiCompatibleBase(
    codesonlineFetchBase(),
    apiKey,
    prompt,
    aspectRatio,
    numberOfImages,
    'gpt-image-2',
    nodeResolution,
    quality,
    signal
  );
}

/** codesonline GPT Image 2 图生图：POST /v1/images/edits + 任务轮询 */
async function codesonlineEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  aspectRatio: string,
  nodeResolution?: string,
  quality?: string,
  pixelSize?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const apiKey = getCodesonlineSavedKey().trim();
  if (!apiKey) {
    throw new Error(
      '未配置 codesonline 图像通道。请在「设置 → API」填写「codesonline（GPT Image 2）」API Key。'
    );
  }
  return editImagesAtOpenAiCompatibleBase(
    codesonlineFetchBase(),
    apiKey,
    base64Images,
    prompt,
    numberOfImages,
    'gpt-image-2',
    aspectRatio,
    quality,
    pixelSize,
    signal
  );
}

/** hfsyapi.cn GPT Image 2 文生图：OpenAI 兼容 /v1/images/generations（同步或异步依官方） */
async function hfsyGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const apiKey = getHfsySavedKey().trim();
  if (!apiKey) {
    throw new Error(
      '未配置 hfsyapi.cn 图像通道。请在「设置 → API」填写「hfsyapi.cn（GPT Image 2）」API Key；文档：https://www.hfsyapi.cn/docs'
    );
  }
  return generateImagesAtOpenAiCompatibleBase(
    hfsyFetchBase(),
    apiKey,
    prompt,
    aspectRatio,
    numberOfImages,
    'gpt-image-2',
    nodeResolution,
    quality,
    signal
  );
}

/** hfsyapi.cn GPT Image 2 图生图：
 * hfsyapi.cn 不支持 OpenAI 标准的 `/v1/images/edits`（multipart 端点）。
 * 它家图生图是 POST /v1/images/generations，参考图用 `reference_images: [base64, ...]` 字段一并传过去。
 * 与文生图共用 OpenAI 兼容响应（`{ data: [{ b64_json / url }] }`）。参考影刀社区示例。
 */
async function hfsyEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  aspectRatio: string,
  nodeResolution?: string,
  quality?: string,
  pixelSize?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const apiKey = getHfsySavedKey().trim();
  if (!apiKey) {
    throw new Error(
      '未配置 hfsyapi.cn 图像通道。请在「设置 → API」填写「hfsyapi.cn（GPT Image 2）」API Key；文档：https://www.hfsyapi.cn/docs'
    );
  }
  const base = hfsyFetchBase();
  const size = pixelSize || aspectRatioToOpenAiSize(aspectRatio, 'gpt-image-2');
  const enhancedPrompt = pixelSize ? prompt : buildPromptWithDimensions(prompt, aspectRatio);

  // 提取裸 base64（去掉 data:image/...;base64, 前缀），与服务端 reference_images 字段约定一致
  const referenceImages: string[] = base64Images.map((img) => {
    const trimmed = (img || '').trim();
    const parsed = parseBase64ImageInput(trimmed);
    return parsed.raw;
  });

  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const body: Record<string, unknown> = {
      model: 'gpt-image-2',
      prompt: enhancedPrompt,
      n: 1,
      size,
      response_format: 'b64_json',
      reference_images: referenceImages,
    };
    if (quality) body.quality = quality;
    const json = await postJsonAtBase<Record<string, unknown>>(
      base,
      '/images/generations',
      body,
      apiKey
    );
    out.push(await openAiStyleGenerationJsonToBase64(json, signal, apiKey, base));
  }
  return out;
}

/**
 * otuapi.com（画布 id：gpt-image-2-otuapi）gpt-image-2 文生图 / 图生图公共工具。
 * 接口与 codesonline / hfsy / 满 e 不同：
 *   - 提交走 POST /v1/videos（与视频生成共用端点，靠 model 字段分流）
 *   - 异步轮询走 GET /v1/videos/{task_id}
 *   - 不支持 n>1；一次提交只产 1 张图，多张需循环提交
 *   - 支持 aspect_ratio 字符串（10 种）；支持 images[]（Base64 / URL）
 *   - 文档：https://6l0ket291i.apifox.cn/447634846e0
 */

const OTUAPI_SUPPORTED_ASPECT_RATIOS = new Set([
  '1:1', '5:4', '9:16', '21:9', '16:9', '3:2', '4:3', '4:5', '3:4', '2:3',
]);

/** 把内部任意画幅表达映射到 otuapi 支持的 10 种之一；不支持时回退到 1:1 */
function normalizeOtuapiAspectRatio(aspectRatio: string): string {
  const ar = (aspectRatio || '').trim();
  if (OTUAPI_SUPPORTED_ASPECT_RATIOS.has(ar)) return ar;
  // 常见兼容映射
  if (ar === '4:5' || ar === '5:4') return ar;
  if (ar === '9:21' || ar === '21:9') return '21:9';
  if (ar === '2:1' || ar === '1:2') return '1:1';
  return '1:1';
}

function otuapiFetchBase(): string {
  return normalizeBaseUrl(getOtuapiBaseUrl());
}

/**
 * 从 otuapi 任务查询响应中提取生成结果的 URL。
 *
 * 文档（apifox 447634846e0 + 455245131e0 统一）：completed 状态时，
 * 结果 URL 位于响应顶层 `url` 字段。这里只取顶层 `url`。
 */
function extractOtuapiResultUrl(data: Record<string, unknown>): string {
  return typeof data.url === 'string' ? data.url.trim() : '';
}

/** otuapi 提交生图任务（图生图也用 POST /v1/videos），返回 task_id */
async function otuapiSubmitImageTask(
  base: string,
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  images: string[] | undefined,
  signal?: AbortSignal
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    aspect_ratio: normalizeOtuapiAspectRatio(aspectRatio),
    images: images && images.length > 0 ? images : [],
  };
  const json = await postJsonAtBase<Record<string, unknown>>(base, '/videos', body, apiKey);
  assertNotAborted(signal);
  const taskId =
    (typeof json.id === 'string' && json.id.trim()) ||
    (typeof json.task_id === 'string' && json.task_id.trim()) ||
    (typeof (json as { data?: { id?: string } }).data?.id === 'string' &&
      (json as { data?: { id?: string } }).data?.id?.trim()) ||
    '';
  if (!taskId) {
    throw new Error(`otuapi 提交任务后未返回 id/task_id：${JSON.stringify(json).slice(0, 400)}`);
  }
  const status = (typeof json.status === 'string' ? json.status : '').toLowerCase();
  if (status === 'failed' || status === 'error') {
    // 兼容多种错误结构：
    //   {error:{message}}
    //   {message}
    //   {error_code, message}
    //   {error_code, error_message}
    //   {error_message}
    const errObj = json.error;
    const errMsg =
      (errObj && typeof errObj === 'object' && typeof (errObj as { message?: string }).message === 'string'
        ? (errObj as { message?: string }).message
        : typeof json.message === 'string'
        ? json.message
        : typeof (json as { error_message?: string }).error_message === 'string'
        ? (json as { error_message?: string }).error_message
        : typeof (json as { error_code?: string }).error_code === 'string'
        ? `${(json as { error_code?: string }).error_code}: ${typeof (json as { error_message?: string }).error_message === 'string' ? (json as { error_message?: string }).error_message : typeof json.message === 'string' ? json.message : JSON.stringify(json)}`
        : JSON.stringify(json).slice(0, 400));
    throw new Error(`otuapi 任务直接失败: ${errMsg}`);
  }
  return taskId;
}

/** otuapi 轮询生图任务，拿到 URL 后拉取成 base64 返回 */
async function otuapiPollImageTaskToBase64(
  base: string,
  apiKey: string,
  taskId: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string> {
  // 文档建议轮询间隔 2~5 秒；先等 2 秒避免提交与轮询抢资源
  await sleepInterruptible(2000, signal);
  const deadline = Date.now() + MANXUE_TASK_MAX_WAIT_MS;
  const pollUrl = `${base}/videos/${encodeURIComponent(taskId)}`;
  while (Date.now() < deadline) {
    assertNotAborted(signal);
    try {
      const res = await fetch(
        rewriteRemoteOpenAiCompatBaseForBrowserCors(pollUrl),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal,
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`查询 otuapi 任务失败 (${res.status}): ${text.slice(0, 500)}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      const status = (typeof data.status === 'string' ? data.status : '').toLowerCase();
      // 旧文档：progress 字段 0-100，completed 时为 100
      const progress =
        typeof (data as { progress?: number }).progress === 'number'
          ? Math.max(0, Math.min(100, Math.round((data as { progress?: number }).progress!)))
          : null;
      const progressText = progress != null ? `（${progress}%）` : '';
      if (onStatus) {
        if (status === 'queued' || status === 'dispatched' || status === 'pending') {
          onStatus(`任务已提交，等待 otuapi 分配生图账号${progressText}…`);
        } else if (
          status === 'in_progress' ||
          status === 'running' ||
          status === 'processing' ||
          status === 'generating'
        ) {
          onStatus(`otuapi 正在生成图片${progressText}…`);
        } else if (status === 'completed' || status === 'succeeded' || status === 'success') {
          onStatus('otuapi 生成完成，正在拉取图片…');
        } else {
          onStatus(`正在查询 otuapi 生图任务状态${progressText}…`);
        }
      }
      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        // otuapi 文档差异：旧文档顶层 url，新文档 results[0].url
        const url = extractOtuapiResultUrl(data);
        if (!url) {
          throw new Error('otuapi 任务已完成但未返回图片链接，请稍后重试。');
        }
        // 注意：otuapi 图片 URL 5 小时后失效；但我们下载后立即转 base64 写入项目，无需担心时效
        return await fetchUrlAsBase64(url, signal, apiKey);
      }
      if (status === 'failed' || status === 'error') {
        // 兼容多种错误结构：
        //   {error:{message}}
        //   {message}
        //   {error_code, message}
        //   {error_message}
        //   {error_code, error_message}
        const errObj = data.error;
        const errMessageField =
          typeof (data as { error_message?: string }).error_message === 'string'
            ? (data as { error_message?: string }).error_message
            : '';
        const errCodeField =
          typeof (data as { error_code?: string }).error_code === 'string'
            ? (data as { error_code?: string }).error_code
            : '';
        const msg =
          (errObj &&
            typeof errObj === 'object' &&
            typeof (errObj as { message?: string }).message === 'string' &&
            (errObj as { message?: string }).message) ||
          (typeof data.message === 'string' && data.message) ||
          errMessageField ||
          (errCodeField
            ? `${errCodeField}: ${
                typeof data.message === 'string'
                  ? data.message
                  : errMessageField || JSON.stringify(data).slice(0, 200)
              }`
            : '') ||
          JSON.stringify(data).slice(0, 400);
        throw new Error(`otuapi 任务失败: ${msg}`);
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') throw err;
      throw new Error(
        `查询 otuapi 生图任务失败：${err instanceof Error ? err.message : String(err)}（轮询 GET /v1/videos/{id}）`
      );
    }
    await sleepInterruptible(3000, signal);
  }
  throw new Error(`otuapi 生图任务超时（已等待超过 ${MANXUE_TASK_MAX_WAIT_MS / 60_000} 分钟）`);
}

/** otuapi 一次性提交 + 轮询，返回单张 base64 */
async function otuapiGenerateOneImage(
  model: string,
  prompt: string,
  aspectRatio: string,
  images: string[] | undefined,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string> {
  const apiKey = getOtuapiSavedKey().trim();
  if (!apiKey) {
    throw new Error(
      '未配置 otuapi.com 图像通道。请在「设置 → API」填写「otuapi.com（GPT Image 2）」API Key；文档：https://otuapi.com/'
    );
  }
  const base = otuapiFetchBase();
  const taskId = await otuapiSubmitImageTask(base, apiKey, model, prompt, aspectRatio, images, signal);
  return otuapiPollImageTaskToBase64(base, apiKey, taskId, signal, onStatus);
}

/** otuapi gpt-image-2 文生图：单次产 1 张，循环 numberOfImages 次 */
async function otuapiGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string[]> {
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const model = resolveOtuapiModelFromNodeResolution(nodeResolution);
  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    if (onStatus) {
      onStatus(`otuapi 提交第 ${i + 1}/${count} 张图…`);
    }
    out.push(await otuapiGenerateOneImage(model, enhancedPrompt, aspectRatio, undefined, signal, onStatus));
  }
  // 静默吞掉 quality：otuapi 当前不支持 quality 字段（按 aspect_ratio 控档），避免误导用户
  void quality;
  return out;
}

/** otuapi gpt-image-2 图生图：最多 5 张参考图（超出截断），单次产 1 张，循环 numberOfImages 次 */
async function otuapiEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  aspectRatio: string,
  nodeResolution?: string,
  _quality?: string,
  _pixelSize?: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  // 文档：images[] 最多 5 张；保留完整 data URL（与 docs 示例一致），让 otuapi 网关自行解析
  const images = base64Images.slice(0, 5).map((s) => (s || '').trim()).filter(Boolean);
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const model = resolveOtuapiModelFromNodeResolution(nodeResolution);
  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    if (onStatus) {
      onStatus(`otuapi 提交第 ${i + 1}/${count} 张图…`);
    }
    out.push(await otuapiGenerateOneImage(model, enhancedPrompt, aspectRatio, images, signal, onStatus));
  }
  return out;
}

/** 节点 2K/4K 档位映射到 otuapi 模型变体；不识别时回落到 gpt-image-2 标准档 */
function resolveOtuapiModelFromNodeResolution(nodeResolution?: string): string {
  const r = (nodeResolution || '').trim().toLowerCase();
  if (r === '4k') return 'gpt-image-2-4K';
  if (r === '2k') return 'gpt-image-2-2K';
  return 'gpt-image-2';
}

/** 满 eAPI Gemini 图生图：使用 Vertex AI 风格的 generateContent 接口 */
async function manxueGeminiEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  modelName: string,
  aspectRatio: string,
  nodeResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const model = manxueT2iModel(modelName);
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 eAPI Key。');
  const key = apiKey.trim();
  const base = manxueGeminiModelsBase();
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 8);

  // 将参考图转为 inlineData 格式
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
  for (const img of base64Images.slice(0, 4)) {
    const trimmed = img.trim();
    let raw: string;
    let mime = 'image/jpeg';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // 远程 URL：先下载
      raw = await fetchUrlAsBase64(trimmed, signal, apiKey);
    } else {
      const parsed = parseBase64ImageInput(img);
      raw = parsed.raw;
      mime = parsed.mime || 'image/jpeg';
    }
    imageParts.push({ inlineData: { data: raw, mimeType: mime } });
  }

  // 将画幅比例转为实际像素尺寸
  const aspectToSize: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768, height: 1344 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
    '2:1': { width: 1344, height: 768 },
    '1:2': { width: 768, height: 1344 },
    '21:9': { width: 1536, height: 640 },
    '9:21': { width: 640, height: 1536 },
    '3:2': { width: 1216, height: 832 },
    '2:3': { width: 832, height: 1216 },
  };
  const size = aspectToSize[aspectRatio] || aspectToSize['16:9'];

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);

    // 构建 Vertex AI 风格的请求体，包含参考图
    const body: Record<string, unknown> = {
      contents: [
        {
          parts: [
            ...imageParts,
            {
              text: `[图片比例 ${aspectRatio}] ${prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: manxueResolution(nodeResolution) === '4K' ? '4K' : '2K',
        },
      },
    };

    const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`满 eAPI Gemini 图生图失败 (${res.status}): ${text.slice(0, 800)}`);
    }

    const json = await res.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
      error?: { message?: string };
    };

    if (json.error?.message) {
      throw new Error(`满 eAPI Gemini: ${json.error.message}`);
    }

    const parts = json.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('满 eAPI Gemini 图生图响应中未找到图片数据');
    }

    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType) {
        out.push(part.inlineData.data);
        break;
      }
    }

    if (out.length <= i) {
      throw new Error('满 eAPI Gemini 图生图响应中未找到图片数据');
    }
  }

  return out;
}

/** 判断是否为满 eAPI 图像模型 */
function isManxueImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'gpt-image-2-pro-manxue' ||
    m === 'gpt-image-2-manxue' ||
    m === 'gemini-3-pro-image-preview-2k-manxue' ||
    m === 'gemini-3-pro-image-preview-4k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-2k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-4k-manxue'
  );
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
  if (isMiniMaxHost(baseNormalized)) {
    // MiniMax 原样透传 model id
    return m || 'minimax-m2.7';
  }
  if (isManxueHost(baseNormalized)) {
    // 满 eAPI 原样透传上游 model id（含 gemini-3.1-flash / gemini-3.1-flash-preview 等）
    return m || 'gemini-3.1-flash';
  }
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3')) return m;
  if (m.startsWith('deepseek-')) return m;
  if (m.startsWith('minimax-')) return m;
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
  // 检测是否为 URL（而非真正的 base64）
  const trimmed = base64Input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    // 是 URL，直接用作 img src
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
      img.src = trimmed;
    });
  }
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
/** 满 e 图生图：单张参考图 JPEG 上限（多张合计仍须低于网关限制） */
const MANXUE_EDIT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function isCodesonlineOpenAiCompatBase(baseNormalized: string): boolean {
  try {
    const u = new URL(baseNormalized);
    if (u.hostname.toLowerCase() === 'image.codesonline.dev') return true;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return (
      path.startsWith('/codesonline-image-api') ||
      path.startsWith('/api/codesonline-image-proxy')
    );
  } catch {
    return false;
  }
}

/** hfsyapi.cn 图像 API：域名 www.hfsyapi.cn 或前端同源代理 /hfsy-image-api / /api/hfsy-image-proxy */
function isHfsyOpenAiCompatBase(baseNormalized: string): boolean {
  try {
    const u = new URL(baseNormalized);
    if (u.hostname.toLowerCase() === 'www.hfsyapi.cn' || u.hostname.toLowerCase() === 'hfsyapi.cn') return true;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return (
      path.startsWith('/hfsy-image-api') ||
      path.startsWith('/api/hfsy-image-proxy')
    );
  } catch {
    return false;
  }
}

/** codesonline 用 b64_json 时上游常报 image_delivery_failed / image index not found，改走 url 由客户端拉取 */
function preferredImageResponseFormat(baseNormalized: string): 'b64_json' | 'url' {
  if (isCodesonlineOpenAiCompatBase(baseNormalized)) return 'url';
  return 'b64_json';
}

function isImageDeliveryFailedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('image_delivery_failed') ||
    m.includes('image index not found') ||
    m.includes('返回图片数据失败')
  );
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
  return `${enforce}${head}, ${params.prompt}`;
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
  const urlVal = pickImageUrlFromPayload(item);
  const b64Raw = [item.b64_json, item.b64, item.image].find(
    (v) => typeof v === 'string' && (v as string).trim()
  ) as string | undefined;
  const b64 = b64Raw?.trim() ?? '';

  /** codesonline 等网关常同时返回无效 b64_json 与有效 url；URL 字段也可能误写入 b64_json */
  if (b64.startsWith('http://') || b64.startsWith('https://')) {
    return fetchUrlAsBase64(b64, signal, bearerToken);
  }
  const minValidB64Len = 200;
  if (urlVal && (!b64 || b64.length < minValidB64Len)) {
    return fetchUrlAsBase64(urlVal, signal, bearerToken);
  }
  if (b64.length >= minValidB64Len && isPlausibleImageBase64(b64)) return b64;
  if (urlVal) return fetchUrlAsBase64(urlVal, signal, bearerToken);
  throw new Error('接口未返回可用图片（缺少 b64_json / url / fallback_url）。');
}

async function openAiStyleGenerationJsonToBase64(
  json: unknown,
  signal?: AbortSignal,
  bearerToken?: string,
  baseNorm?: string
): Promise<string> {
  const item = firstOpenAiImageGenerationItem(json);
  if (item) {
    const itemTaskId =
      (typeof item.task_id === 'string' && item.task_id.trim()) ||
      (typeof item.id === 'string' && item.id.trim()) ||
      undefined;
    const hasImagePayload =
      pickImageUrlFromPayload(item).length > 0 ||
      (typeof item.b64_json === 'string' && isPlausibleImageBase64(item.b64_json));
    if (!hasImagePayload && itemTaskId && baseNorm && bearerToken) {
      return pollOpenAiCompatImageTaskToBase64(baseNorm, bearerToken, itemTaskId, signal);
    }
    return openAiStyleImagePayloadToBase64(item, signal, bearerToken);
  }
  if (json && typeof json === 'object') {
    const rec = json as Record<string, unknown>;
    const urlTop = rec.url;
    if (typeof urlTop === 'string' && urlTop.trim()) {
      return fetchUrlAsBase64(urlTop.trim(), signal, bearerToken);
    }
    const taskId = extractTaskIdFromJson(json);
    if (taskId && baseNorm && bearerToken) {
      return pollOpenAiCompatImageTaskToBase64(baseNorm, bearerToken, taskId, signal);
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

/** 生图结果写入节点前：远程 URL / data URL 统一转为 raw base64，避免预览区无法显示 */
export async function normalizeCanvasGenerationImage(
  raw: string,
  opts?: { signal?: AbortSignal; bearerToken?: string }
): Promise<string> {
  const s = raw.trim();
  if (!s) return s;
  if (s.startsWith('data:')) {
    const i = s.indexOf(',');
    return i >= 0 ? s.slice(i + 1).trim() : s;
  }
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return fetchUrlAsBase64(s, opts?.signal, opts?.bearerToken);
  }
  return s;
}

export async function normalizeCanvasGenerationImages(
  images: string[],
  opts?: { signal?: AbortSignal; bearerToken?: string }
): Promise<string[]> {
  return Promise.all(images.map((im) => normalizeCanvasGenerationImage(im, opts)));
}

async function generateImagesAtOpenAiCompatibleBase(
  baseNorm: string,
  apiKey: string,
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  resolvedModel: string,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const size = aspectRatioToOpenAiSize(aspectRatio, resolvedModel);
  const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);
  const out: string[] = [];
  const onePerRequest =
    resolvedModel === 'dall-e-3' ||
    resolvedModel === 'gpt-image-2' ||
    resolvedModel === 'gpt-image-1';

  const requestOneImage = async (responseFormat: 'b64_json' | 'url'): Promise<string> => {
    const body: Record<string, unknown> = {
      model: resolvedModel,
      prompt: enhancedPrompt,
      n: 1,
      size,
      response_format: responseFormat,
    };
    if (quality && resolvedModel === 'gpt-image-2') {
      body.quality = quality;
    }
    const json = await postJsonAtBase<Record<string, unknown>>(
      baseNorm,
      '/images/generations',
      body,
      apiKey
    );
    return openAiStyleGenerationJsonToBase64(json, signal, apiKey, baseNorm);
  };

  const requestOneImageWithFallback = async (): Promise<string> => {
    let format = preferredImageResponseFormat(baseNorm);
    try {
      return await requestOneImage(format);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (format === 'b64_json' && isImageDeliveryFailedError(msg)) {
        return requestOneImage('url');
      }
      throw err;
    }
  };

  if (onePerRequest) {
    for (let i = 0; i < numberOfImages; i++) {
      assertNotAborted(signal);
      out.push(await requestOneImageWithFallback());
    }
  } else {
    const n = Math.min(Math.max(numberOfImages, 1), 10);
    assertNotAborted(signal);
    let format = preferredImageResponseFormat(baseNorm);
    const runBatch = async (responseFormat: 'b64_json' | 'url') => {
      const json = await postJsonAtBase<Record<string, unknown>>(
        baseNorm,
        '/images/generations',
        {
          model: 'dall-e-2',
          prompt: enhancedPrompt,
          n,
          size,
          response_format: responseFormat,
        },
        apiKey
      );
      const data = json.data;
      if (!Array.isArray(data) || !data.length) {
        throw new Error(`文生图接口未返回图片列表。${JSON.stringify(json).slice(0, 400)}`);
      }
      return Promise.all(
        data.map((d) =>
          d && typeof d === 'object'
            ? openAiStyleImagePayloadToBase64(d as Record<string, unknown>, signal, apiKey)
            : Promise.reject(new Error('文生图接口返回的图片条目格式无效'))
        )
      );
    };
    try {
      out.push(...(await runBatch(format)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (format === 'b64_json' && isImageDeliveryFailedError(msg)) {
        out.push(...(await runBatch('url')));
      } else {
        throw err;
      }
    }
  }
  return out;
}

/**
 * 云智 / 部分 New API 对 `/v1/images/edits` 可能返回 404 或 503（如 model_not_found）。
 * 非 401 时不中断；尝试 `uploads/images` 与 `upload/image` 得公网 URL 后以 `image_urls` 调 generations。
 * 若上传为 404 且 edits 失败：拒绝仅含 data URI/裸 base64 的 JSON 成功（避免误接受纯文生图），multipart 二进制仍尝试。
 */
async function editImagesAtOpenAiCompatibleBase(
  baseNorm: string,
  apiKey: string,
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  resolvedEditModel: string,
  aspectRatio: string,
  quality?: string,
  pixelSize?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  const size = pixelSize || aspectRatioToOpenAiSize(aspectRatio, resolvedEditModel);
  const enhancedPrompt = pixelSize
    ? prompt
    : buildPromptWithDimensions(prompt, aspectRatio);
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
      : resolvedEditModel === 'gpt-image-2'
        ? 4
        : 1
  );

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);

    const submitEditOnce = async (responseFormat: 'b64_json' | 'url' | null): Promise<string> => {
      const form = new FormData();
      if (resolvedEditModel === 'dall-e-2') {
        form.append('image', imageBlobs[0].blob, imageBlobs[0].filename);
      } else {
        for (const { blob, filename } of imageBlobs) {
          form.append('image[]', blob, filename);
        }
      }
      form.append('prompt', enhancedPrompt);
      form.append('model', resolvedEditModel);
      form.append('n', '1');
      form.append('size', size);
      if (resolvedEditModel !== 'dall-e-2' && responseFormat) {
        form.append('response_format', responseFormat);
      }
      if (quality && resolvedEditModel === 'gpt-image-2') {
        form.append('quality', quality);
      }

      const requestUrl = `${rewriteRemoteOpenAiCompatBaseForBrowserCors(baseNorm)}/images/edits`;
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `图生图接口错误 (${res.status})${openAiCompatFailureHint(res.status, 'image-edit')}: ${text.slice(0, 800)}`
        );
      }
      return openAiStyleGenerationJsonToBase64(JSON.parse(text) as unknown, signal, apiKey, baseNorm);
    };

    if (resolvedEditModel === 'dall-e-2') {
      results.push(await submitEditOnce(null));
      continue;
    }

    let format = preferredImageResponseFormat(baseNorm);
    const isRetryableGateway = (msg: string) =>
      /\((502|504)\)/.test(msg) ||
      /ROUTER_EXTERNAL_TARGET_ERROR/i.test(msg) ||
      /codesonline_image_upstream_unreachable/i.test(msg);

    const runEditWithFallback = async (): Promise<string> => {
      try {
        return await submitEditOnce(format);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (format === 'b64_json' && isImageDeliveryFailedError(msg)) {
          return submitEditOnce('url');
        }
        throw err;
      }
    };

    try {
      results.push(await runEditWithFallback());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRetryableGateway(msg)) {
        await new Promise((r) => setTimeout(r, 1800));
        assertNotAborted(signal);
        results.push(await runEditWithFallback());
      } else {
        throw err;
      }
    }
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
  quality?: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string[]> {
  const rawModel = (modelName || '').trim();
  if (rawModel === 'gpt-image-2-junlan') {
    const jlKey = getJunlanSavedKey().trim();
    if (!jlKey) {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, 'gpt-image-2-codesonline', nodeResolution, quality, signal);
    }
    const jlBase = normalizeBaseUrl(getJunlanBaseUrl());
    try {
      return await generateImagesAtOpenAiCompatibleBase(
        jlBase,
        jlKey,
        prompt,
        aspectRatio,
        numberOfImages,
        'gpt-image-2',
        nodeResolution,
        quality,
        signal
      );
    } catch (err) {
      // 君澜服务不可用（503 等）时回退 codesonline
      console.warn('[openAiGenerateNewImage] 君澜不可用，尝试回退:', err);
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, 'gpt-image-2-codesonline', nodeResolution, quality, signal);
    }
  }

  if (rawModel === 'gpt-image-2-codesonline') {
    const coKey = getCodesonlineSavedKey().trim();
    if (!coKey) {
      throw new Error(
        '未配置 codesonline 图像通道。请在「设置 → API」填写「codesonline（GPT Image 2）」API Key；文档：https://image.codesonline.dev/personal/docs'
      );
    }
    return codesonlineGenerateNewImage(
      prompt,
      aspectRatio,
      numberOfImages,
      nodeResolution,
      quality,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-hfsy') {
    return hfsyGenerateNewImage(
      prompt,
      aspectRatio,
      numberOfImages,
      nodeResolution,
      quality,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-otuapi') {
    return otuapiGenerateNewImage(
      prompt,
      aspectRatio,
      numberOfImages,
      nodeResolution,
      quality,
      signal,
      onStatus
    );
  }

  // 满 eAPI 图像模型
  if (isManxueImageModel(rawModel)) {
    const mxKey = getManxueSavedKey().trim();
    if (!mxKey) {
      throw new Error(
        '未配置满 eAPI（manxueapi.com）Key。请在「设置 → API」填写「满 e」API Key。'
      );
    }
    return manxueGenerateNewImage(prompt, aspectRatio, numberOfImages, rawModel, nodeResolution, quality, signal);
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
    quality,
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
  quality?: string,
  pixelSize?: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void
): Promise<string[]> {
  const rawModel = (modelName || '').trim();
  if (rawModel === 'gpt-image-2-junlan') {
    const jlKey = getJunlanSavedKey().trim();
    if (!jlKey) {
      return openAiEditImage(base64Images, prompt, numberOfImages, 'gpt-image-2-codesonline', aspectRatio, nodeResolution, quality, pixelSize, signal);
    }
    const jlBase = normalizeBaseUrl(getJunlanBaseUrl());
    try {
      return await editImagesAtOpenAiCompatibleBase(
        jlBase,
        jlKey,
        base64Images,
        prompt,
        numberOfImages,
        'gpt-image-2',
        aspectRatio,
        quality,
        pixelSize,
        signal
      );
    } catch (err) {
      // 君澜服务不可用（503 等）时回退 codesonline
      console.warn('[openAiEditImage] 君澜不可用，尝试回退:', err);
      return openAiEditImage(base64Images, prompt, numberOfImages, 'gpt-image-2-codesonline', aspectRatio, nodeResolution, quality, pixelSize, signal);
    }
  }

  if (rawModel === 'gpt-image-2-codesonline') {
    const coKey = getCodesonlineSavedKey().trim();
    if (!coKey) {
      throw new Error(
        '未配置 codesonline 图像通道。请在「设置 → API」填写「codesonline（GPT Image 2）」API Key；文档：https://image.codesonline.dev/personal/docs'
      );
    }
    return codesonlineEditImage(
      base64Images,
      prompt,
      numberOfImages,
      aspectRatio,
      nodeResolution,
      quality,
      pixelSize,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-hfsy') {
    return hfsyEditImage(
      base64Images,
      prompt,
      numberOfImages,
      aspectRatio,
      nodeResolution,
      quality,
      pixelSize,
      signal
    );
  }

  if (rawModel === 'gpt-image-2-otuapi') {
    return otuapiEditImage(
      base64Images,
      prompt,
      numberOfImages,
      aspectRatio,
      nodeResolution,
      quality,
      pixelSize,
      signal,
      onStatus
    );
  }

  // 满 eAPI 图像模型图生图
  if (isManxueImageModel(rawModel)) {
    const mxKey = getManxueSavedKey().trim();
    if (!mxKey) {
      throw new Error(
        '未配置满 eAPI（manxueapi.com）Key。请在「设置 → API」填写「满 e」API Key。'
      );
    }
    return manxueEditImage(base64Images, prompt, numberOfImages, rawModel, aspectRatio, nodeResolution, quality, pixelSize, signal);
  }

  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');
  if (isToApisHost(normalizeBaseUrl(getOpenAiBaseUrl()))) {
    const toApisPrompt = pixelSize ? `${prompt}\n\n（输出约 ${pixelSize} 像素，保持参考图宽高比）` : prompt;
    return toApisEditImage(base64Images, toApisPrompt, numberOfImages, modelName, aspectRatio, nodeResolution, signal);
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
    quality,
    pixelSize,
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

/** MiniMax 对话：使用 MiniMax 专用的 Base URL 与 API Key */
export async function minimaxChatCompletion(
  prompt: string,
  base64Image?: string,
  modelName: string = 'minimax-m2.7'
): Promise<string> {
  const apiKey = getMiniMaxSavedKey();
  if (!apiKey) throw new Error('未配置 MiniMax API Key，请在设置中填写 MiniMax API Key。');
  return chatCompletionAtBase(getMiniMaxBaseUrl(), apiKey, modelName, prompt, base64Image);
}
