import {
  DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
  DEFAULT_MANXUE_BASE_URL,
  DEFAULT_MINIMAX_BASE_URL,
  normalizeDeepSeekChatModelId,
  getAiProvider,
  getCodesonlineBaseUrl,
  getCodesonlineSavedKey,
  getHfsyBaseUrl,
  getHfsySavedKey,
  getManxueBaseUrl,
  getManxueSavedKey,
  getMiniMaxBaseUrl,
  getMiniMaxSavedKey,
  getOpenAiBaseUrl,
  getOpenAiSavedKey,
  getAliyunMaasSavedKey,
} from './aiSettings';
import { aliyunMaasMultimodalFetchUrl, aliyunZImageSize, isAliyunMaasImageModel, resolveAliyunMaasImageUpstreamModelId } from './aliyunMaas';

function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  // 火山方舟 Agent Plan 文档 Base URL 已含 /api/plan/v3，其后直接拼 /chat/completions，不要再加 /v1
  if (/volcengine-ark/i.test(u) || /aliyun-maas/i.test(u)) return u;
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

/** 使用专用 rewrite 入口，避免与 Vercel Serverless 函数路径冲突。 */
function hfsyImageProxyPathPrefix(): '/hfsy-image-api' {
  return '/hfsy-image-api';
}

/** manxueapi.com 未开放 CORS；生产直连 Serverless /api/manxue-proxy，开发走 Vite /manxue-api */
function manxueSameOriginProxyPrefix(): string {
  if (typeof window === 'undefined') return '/manxue-api';
  // 生产避免依赖可能失效的外链 rewrite，直接打到函数代理
  return import.meta.env.PROD ? '/api/manxue-proxy' : '/manxue-api';
}

function rewriteManxueBaseForBrowserCors(baseNormalized: string): string {
  if (typeof window === 'undefined') return baseNormalized;
  try {
    if (!isManxueHost(baseNormalized)) return baseNormalized;
    const pathname = new URL(baseNormalized).pathname.replace(/\/+$/, '') || '/v1';
    return `${window.location.origin}${manxueSameOriginProxyPrefix()}${pathname}`;
  } catch {
    return baseNormalized;
  }
}

export function manxueFetchBase(): string {
  return rewriteManxueBaseForBrowserCors(normalizeBaseUrl(getManxueBaseUrl()));
}

function codesonlineFetchBase(): string {
  return rewriteRemoteOpenAiCompatBaseForBrowserCors(normalizeBaseUrl(getCodesonlineBaseUrl()));
}

function manxueGeminiModelsBase(): string {
  if (typeof window === 'undefined') return 'https://manxueapi.com/v1beta/models';
  return `${window.location.origin}${manxueSameOriginProxyPrefix()}/v1beta/models`;
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
  return rewriteHfsyImageBaseForBrowserCors(rewriteCodesonlineImageBaseForBrowserCors(next));
}

/** 502/504 等为网关层错误，多为上游或反向代理；与 Chrome 扩展报的 runtime.lastError 无关 */
function isVolcengineArkFetchBase(base: string): boolean {
  return /volcengine-ark/i.test(base);
}

function isAliyunMaasFetchBase(base: string): boolean {
  return /aliyun-maas/i.test(base);
}

function openAiCompatFailureHint(
  status: number,
  kind: 'generations-json' | 'image-edit',
  fetchBase?: string
): string {
  if (status === 401) {
    if (fetchBase && isVolcengineArkFetchBase(fetchBase)) {
      return '（401：火山方舟鉴权失败。请在控制台重新生成 API Key，在本站「设置 → API → 火山方舟」保存后重试；曾提交到 Git 的密钥通常已失效。文档：https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2373746 ）';
    }
    if (fetchBase && isAliyunMaasFetchBase(fetchBase)) {
      return '（401：阿里云百炼鉴权失败。请在「设置 → API → 阿里云百炼」填写 API Key 并在当前域名下保存。）';
    }
    return '（401：鉴权失败。若使用 hfsyapi.cn 模型，请在「设置 → API」填写并保存 hfsyapi.cn API Key；确认不要误填 ToAPIs、满 e 或 OpenAI 兼容通道的 Key。）';
  }
  if (status === 404) {
    if (fetchBase && /manxue-api|manxueapi\.com/i.test(fetchBase)) {
      return '（404：满 e 当前 Key 所在分组未配置该模型，或该模型需走 /v1/responses 而非 /v1/chat/completions。请在 manxueapi.com 控制台核对模型 ID。）';
    }
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
    return '（413：请求体过大；经本站代理时单次 JSON 不宜超过约 4MB。已自动尝试上传参考图 URL 与压缩；若仍失败请减少参考图数量或换更小参考图。）';
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

/** 判断是否为满 eAPI 域名（manxueapi.com） */
function isManxueHost(baseNormalized: string): boolean {
  try {
    const host = new URL(baseNormalized).hostname.toLowerCase();
    return host === 'manxueapi.com' || host.endsWith('.manxueapi.com');
  } catch {
    return false;
  }
}

/** 画布节点 id（兼容旧项目）；上游 media/generate 使用 grok-imagine-1.5 */
export const MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID = 'grok-imagine-video-1.5-preview';
const MANXUE_GROK_IMAGINE_UPSTREAM_MODEL = 'grok-imagine-1.5';
export const MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL_ID = 'c-dance2-pro-720-manxue';
const MANXUE_C_DANCE2_PRO_720_UPSTREAM = 'c-dance2-pro-720';

export function isManxueVideoModel(m?: string): boolean {
  if (!m) return false;
  const x = m.trim();
  return (
    x === MANXUE_C_DANCE2_PRO_720_VIDEO_MODEL_ID ||
    x === MANXUE_C_DANCE2_PRO_720_UPSTREAM ||
    x === MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID ||
    x === MANXUE_GROK_IMAGINE_UPSTREAM_MODEL ||
    x.endsWith('-manxue-video')
  );
}

function manxueVideoUpstreamModel(model?: string): string {
  const x = (model || '').trim();
  if (x === MANXUE_GROK_IMAGINE_VIDEO_MODEL_ID || x === MANXUE_GROK_IMAGINE_UPSTREAM_MODEL) {
    return MANXUE_GROK_IMAGINE_UPSTREAM_MODEL;
  }
  return MANXUE_C_DANCE2_PRO_720_UPSTREAM;
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
const IMAGE_FETCH_TIMEOUT_MS = 45_000;

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

/** ToAPIs：透传 imagen / gemini / gpt-image-* 等模型 id */
function toApisT2iModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
  if (m.startsWith('imagen') || m.startsWith('gemini')) return m;
  if (m === 'gpt-image-2' || m === 'gpt-image-1' || m.startsWith('gpt-image')) return m;
  if (m === 'gpt-4o-image') return m;
  if (m === 'dall-e-3' || m === 'dall-e-2') return 'gemini-3-pro-image-preview';
  if (m === 'nano-banana-2') return 'gemini-2.5-flash-image-preview';
  if (m === 'qwen-image-3.0') return 'qwen-image-3.0';
  return m || 'qwen-image-3.0';
}

/** 满 eAPI 模型名映射（将 UI id 转为 API model 名） */
function manxueT2iModel(modelName: string): string {
  const m = (modelName || '').trim();
  // GPT Image 2 系列
  if (m === 'gpt-image-2-pro-manxue') return 'gpt-image-2-pro';
  if (m === 'gpt-image-2-4k-manxue') return 'gpt-image-2-4k';
  if (m === 'gpt-image-2-manxue') return 'gpt-image-2';
  // Gemini 系列
  if (m === 'gemini-3-pro-image-preview-manxue') return 'gemini-3-pro-image-preview';
  if (m === 'gemini-3-pro-image-preview-2k-manxue') return 'gemini-3-pro-image-preview-2k';
  if (m === 'gemini-3-pro-image-preview-4k-manxue') return 'gemini-3-pro-image-preview-4k';
  if (m === 'gemini-3.1-flash-image-preview-manxue') return 'gemini-3.1-flash-image-preview';
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
    m === 'gemini-3-pro-image-preview-manxue' ||
    m === 'gemini-3-pro-image-preview-2k-manxue' ||
    m === 'gemini-3-pro-image-preview-4k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-manxue' ||
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

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);

    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `[图片比例 ${aspectRatio}] ${prompt}\n请直接输出图片，不要只返回文字说明。`,
            },
          ],
        },
      ],
      generationConfig: {
        // 多数 Gemini 图像模型不支持仅 IMAGE
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: manxueResolution(nodeResolution) === '4K' ? '4K' : '2K',
        },
      },
    };

    const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
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

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`满 eAPI Gemini 响应不是 JSON: ${text.slice(0, 500)}`);
    }

    const errMsg =
      json && typeof json === 'object'
        ? (json as { error?: { message?: string } }).error?.message
        : undefined;
    if (errMsg) throw new Error(`满 eAPI Gemini: ${errMsg}`);

    const b64 = await extractGeminiImageBase64FromResponse(json, signal, apiKey);
    if (!b64) {
      throw new Error(formatGeminiNoImageError(json, '满 eAPI Gemini'));
    }
    out.push(b64);
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

/** ToAPIs Gemini 图像：输出档位在 metadata.resolution（文档），非顶层 resolution */
function isToApisGemini31FlashImageModel(modelId: string): boolean {
  return (modelId || '').trim() === 'gemini-3.1-flash-image-preview';
}

function isToApisQwenImage30Model(modelId: string): boolean {
  return (modelId || '').trim() === 'qwen-image-3.0';
}

function isToApisGptImage2Model(modelId: string): boolean {
  const m = (modelId || '').trim();
  return m === 'gpt-image-2' || m === 'gpt-image-2-vip' || m === 'gpt-image-2-official';
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
  quality?: string;
  image_urls?: string[];
}): Record<string, unknown> {
  const { model, promptLine, size, nodeResolution, quality, image_urls } = params;
  const body: Record<string, unknown> = {
    model,
    prompt: promptLine,
    n: 1,
    size,
    response_format: 'url',
  };
  if (image_urls?.length) {
    if (isToApisGptImage2Model(model) || isToApisQwenImage30Model(model)) body.reference_images = image_urls;
    body.image_urls = image_urls;
  }
  if (isToApisGptImage2Model(model)) {
    body.quality = model === 'gpt-image-2-vip' && quality === 'medium' ? 'medium' : 'low';
  }

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
    if (host === 'files.toapis.xyz') {
      return `${origin}/cdn-files-toapis-xyz${u.pathname}${u.search}`;
    }
    if (host === 'www.qixinai.net' || host === 'qixinai.net') {
      return `${origin}/cdn-files-qixinai${u.pathname}${u.search}`;
    }
    if (host === 'files.dashlyai.cc') {
      return `${origin}/cdn-files-dashlyai${u.pathname}${u.search}`;
    }
    if (host === 'assets.token6688.com') {
      return `${origin}/cdn-files-token6688${u.pathname}${u.search}`;
    }
    if (host === 'manxueapi.com' || host.endsWith('.manxueapi.com')) {
      const prefix = import.meta.env.PROD ? '/api/manxue-proxy' : '/manxue-api';
      return `${origin}${prefix}${u.pathname}${u.search}`;
    }
    if (host === 'www.hfsyapi.cn' || host === 'hfsyapi.cn') {
      return `${origin}${hfsyImageProxyPathPrefix()}${u.pathname}${u.search}`;
    }
    if (host.includes('aliyuncs.com') && (host.includes('dashscope') || host.includes('oss-'))) {
      const q = `path=oss-fetch&u=${encodeURIComponent(imageUrl)}`;
      if (import.meta.env.PROD) {
        return `${origin}/api/aliyun-maas-proxy?${q}`;
      }
      return `${origin}/aliyun-maas-api/oss-fetch?u=${encodeURIComponent(imageUrl)}`;
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
  if (/^https:\/\/file\.hfsyapi\.cn\//i.test(imageUrl)) {
    // Use the current app origin so the generic external-image rewriter cannot
    // redirect this request to an unrelated provider proxy.
    imageUrl = `${window.location.origin}/api/hfsy-fetch-image?url=${encodeURIComponent(imageUrl)}`;
  }
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

async function uploadHfsyVideoReferenceImage(
  blob: Blob,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch('/api/hfsy-reference-image', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
    signal,
  });
  const text = await res.text();
  let json: { url?: string; message?: string } = {};
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`HFSY 视频参考图上传响应无效 (${res.status})`);
  }
  if (!res.ok || !json.url || !/^https?:\/\//i.test(json.url)) {
    throw new Error(`HFSY 视频参考图上传失败 (${res.status}): ${json.message || text.slice(0, 300)}`);
  }
  return json.url;
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

function clampToApisNanoBanana2Resolution(modelName: string, nodeResolution?: string): string | undefined {
  if ((modelName || '').trim() !== 'nano-banana-2') return nodeResolution;
  const r = (nodeResolution || '2k').toLowerCase().replace(/\s/g, '');
  if (r === '4k') return '2k';
  return nodeResolution || '2k';
}

async function toApisEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  modelName: string,
  aspectRatio: string,
  nodeResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const model = toApisT2iModel(modelName);
  const size = toApisAspectSize(aspectRatio);
  const maxRefs = 16;
  const imageUrls: string[] = [];
  const clampedResolution = clampToApisNanoBanana2Resolution(modelName, nodeResolution);
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
      nodeResolution: clampedResolution,
      quality,
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
  signal?: AbortSignal,
  maxCount = 3
): Promise<string[]> {
  const imageUrls: string[] = [];
  const list = refs.filter(Boolean).slice(0, maxCount);
  for (let i = 0; i < list.length; i++) {
    assertNotAborted(signal);
    const trimmed = list[i].trim();
    if (/^https?:\/\//i.test(trimmed)) {
      imageUrls.push(trimmed);
      continue;
    }
    const { raw, mime } = parseBase64ImageInput(trimmed);
    const blob = base64ToBlob(raw, mime);
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
    imageUrls.push(await toApisUploadImageBlob(blob, `${filePrefix}-${i}.${ext}`, signal));
  }
  return imageUrls;
}

export type ToApisVideoModelId =
  | 'grok-video-3'
  | 'grok-video-1.5'
  | 'grok-video-1.5-preview'
  | 'sora-2-vvip'
  | 'veo3.1-fast'
  | 'doubao-seedance-1-5-pro'
  | 'jimeng-video-v3'
  | 'jimeng-image-to-video'
  | 'gemini-omni-flash'
  | 'seedance-2'
  | 'seedance-2-fast'
  | 'seedance-2-mini'
  | 'seedance-2-5'
  | 'kling-v3-omni'
  | 'hfsy-sd-2'
  | 'hfsy-sd-2-fast'
  | 'hfsy-sd-2-vip'
  | 'hfsy-sd-2-vip-720'
  | 'hfsy-sd-2.5-480'
  | 'hfsy-sd-2.5-720'
  | 'hfsy-minimax-h3'
  | 'hfsy-grok-imagine-video-1.5'
  | 'grok-imagine-video-1.5-preview'
  | 'c-dance2-pro-720-manxue';

type HfsyVideoModelId =
  | 'hfsy-sd-2'
  | 'hfsy-sd-2-fast'
  | 'hfsy-sd-2-vip'
  | 'hfsy-sd-2-vip-720'
  | 'hfsy-sd-2.5-480'
  | 'hfsy-sd-2.5-720'
  | 'hfsy-minimax-h3'
  | 'hfsy-grok-imagine-video-1.5';

type HfsyUpstreamVideoModel =
  | 'sd-2'
  | 'sd-2-fast'
  | 'sd-2-vip'
  | 'sd-2-vip-720'
  | 'sd-2.5-480'
  | 'sd-2.5-720'
  | 'minimax-h3'
  | 'grok-imagine-video-1.5';

function isHfsySd2VideoModel(
  model?: string
): model is 'hfsy-sd-2' | 'hfsy-sd-2-fast' | 'hfsy-sd-2-vip' | 'hfsy-sd-2-vip-720' | 'hfsy-sd-2.5-480' | 'hfsy-sd-2.5-720' {
  return (
    model === 'hfsy-sd-2' ||
    model === 'hfsy-sd-2-fast' ||
    model === 'hfsy-sd-2-vip' ||
    model === 'hfsy-sd-2-vip-720' ||
    model === 'hfsy-sd-2.5-480' ||
    model === 'hfsy-sd-2.5-720'
  );
}

function isHfsyMinimaxH3VideoModel(model?: string): model is 'hfsy-minimax-h3' {
  return model === 'hfsy-minimax-h3';
}

function isHfsyGrokImagineVideoModel(model?: string): model is 'hfsy-grok-imagine-video-1.5' {
  return model === 'hfsy-grok-imagine-video-1.5';
}

function isHfsyVideoModel(model?: string): model is HfsyVideoModelId {
  return isHfsySd2VideoModel(model) || isHfsyMinimaxH3VideoModel(model) || isHfsyGrokImagineVideoModel(model);
}

function toHfsyVideoModel(model: HfsyVideoModelId): HfsyUpstreamVideoModel {
  if (model === 'hfsy-sd-2-fast') return 'sd-2-fast';
  if (model === 'hfsy-sd-2-vip') return 'sd-2-vip';
  if (model === 'hfsy-sd-2-vip-720') return 'sd-2-vip-720';
  if (model === 'hfsy-sd-2.5-480') return 'sd-2.5-480';
  if (model === 'hfsy-sd-2.5-720') return 'sd-2.5-720';
  if (model === 'hfsy-minimax-h3') return 'minimax-h3';
  if (model === 'hfsy-grok-imagine-video-1.5') return 'grok-imagine-video-1.5';
  return 'sd-2';
}

function isHttpUrlString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  // 兼容 https:/xxx（单斜杠） 和 https://xxx（双斜杠）
  return /^https?:\/[/]/i.test(t);
}

/**
 * ToAPIs / hfsy / 满 e 各模型完成态略有差异：
 * - 标准形 result.data[0].url、video_url
 * - New API 统一形 data.output / data.outputs（字符串或数组）
 * - Seedance 等 content.video_url、detail 嵌套
 */
function extractVideoUrlFromPollPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    if (isHttpUrlString(data)) return String(data).trim();
    return null;
  }
  const o = data as Record<string, unknown>;

  const pickFromObject = (obj: Record<string, unknown>): string | null => {
    // hfsy 文档完成态字段为 result_url，优先读取
    for (const k of ['result_url', 'video_url', 'url', 'download_url', 'file_url', 'output', 'video'] as const) {
      const v = obj[k];
      if (isHttpUrlString(v)) return String(v).trim();
    }
    // New API / 部分网关兼容：SUCCESS 时把成片 URL 同步写进 fail_reason
    if (isHttpUrlString(obj.fail_reason)) return String(obj.fail_reason).trim();
    for (const k of ['result_urls', 'resultUrls', 'video_urls', 'outputs', 'output'] as const) {
      const arr = obj[k];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (isHttpUrlString(item)) return item.trim();
          if (item && typeof item === 'object') {
            const u = pickFromObject(item as Record<string, unknown>);
            if (u) return u;
          }
        }
      }
    }
    const vid = obj.video;
    if (vid && typeof vid === 'object') {
      const u = pickFromObject(vid as Record<string, unknown>);
      if (u) return u;
    }
    const outObj = obj.output;
    if (outObj && typeof outObj === 'object' && !Array.isArray(outObj)) {
      const u = pickFromObject(outObj as Record<string, unknown>);
      if (u) return u;
    }
    const content = obj.content;
    if (content && typeof content === 'object') {
      const u = pickFromObject(content as Record<string, unknown>);
      if (u) return u;
    }
    return null;
  };

  const direct = pickFromObject(o);
  if (direct) return direct;

  // doubao-seedance / New API：顶层 data 可能是 URL 字符串、对象或数组
  const topData = o.data;
  if (isHttpUrlString(topData)) return topData.trim();
  if (Array.isArray(topData)) {
    for (const item of topData) {
      if (isHttpUrlString(item)) return item.trim();
      if (item && typeof item === 'object') {
        const u = pickFromObject(item as Record<string, unknown>);
        if (u) return u;
      }
    }
  } else if (topData && typeof topData === 'object') {
    const td = topData as Record<string, unknown>;
    const u = pickFromObject(td);
    if (u) return u;
    // New API 偶发再包一层 data
    const nested = td.data;
    if (isHttpUrlString(nested)) return nested.trim();
    if (nested && typeof nested === 'object') {
      const nu = pickFromObject(nested as Record<string, unknown>);
      if (nu) return nu;
    }
  }

  let result: unknown = o.result;
  if (typeof result === 'string') {
    if (isHttpUrlString(result)) return result.trim();
    try {
      result = JSON.parse(result) as unknown;
    } catch {
      /* ignore */
    }
  }
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const u = pickFromObject(r);
    if (u) return u;
    const d = r.data;
    if (isHttpUrlString(d)) return d.trim();
    if (Array.isArray(d)) {
      for (const item of d) {
        if (isHttpUrlString(item)) return item.trim();
        if (item && typeof item === 'object') {
          const iu = pickFromObject(item as Record<string, unknown>);
          if (iu) return iu;
        }
      }
    } else if (d && typeof d === 'object') {
      const du = pickFromObject(d as Record<string, unknown>);
      if (du) return du;
    }
  }

  const detail = o.detail;
  if (detail && typeof detail === 'object') {
    const u = pickFromObject(detail as Record<string, unknown>);
    if (u) return u;
  }

  const output = o.output;
  if (isHttpUrlString(output)) return output.trim();
  if (output && typeof output === 'object') {
    const u = pickFromObject(output as Record<string, unknown>);
    if (u) return u;
  }

  const meta = o.metadata;
  if (meta && typeof meta === 'object') {
    const u = pickFromObject(meta as Record<string, unknown>);
    if (u) return u;
  }

  return null;
}

function isVideoTaskCompletedStatus(status: unknown): boolean {
  const s = String(status || '').toLowerCase().trim();
  return (
    s === 'completed' ||
    s === 'succeeded' ||
    s === 'success' ||
    s === 'done' ||
    s === 'finished' ||
    s === 'complete' ||
    s === 'ok'
  );
}

function normalizeHfsyVideoDuration(uiSeconds: number): number {
  const n = Math.round(Number(uiSeconds) || 8);
  return Math.min(15, Math.max(5, n));
}

/** MiniMax-H3（hfsy 文档）：时长 5–15 秒 */
function normalizeHfsyMinimaxH3Duration(uiSeconds: number): number {
  const n = Math.round(Number(uiSeconds) || 5);
  return Math.min(15, Math.max(5, n));
}

/** hfsy Grok Imagine Video 1.5：时长 1–15 秒 */
function normalizeHfsyGrokImagineDuration(uiSeconds: number): number {
  const n = Math.round(Number(uiSeconds) || 10);
  return Math.min(15, Math.max(1, n));
}

function normalizeHfsyVideoRatio(aspectRatio: string): string {
  const r = (aspectRatio || '').trim();
  return ['auto', '9:16', '3:4', '1:1', '4:3', '16:9', '21:9'].includes(r) ? r : '16:9';
}

function normalizeHfsyMinimaxH3Ratio(aspectRatio: string): '16:9' | '9:16' {
  return (aspectRatio || '').trim() === '9:16' ? '9:16' : '16:9';
}

function normalizeHfsyGrokImagineRatio(aspectRatio: string): string {
  const r = (aspectRatio || '').trim();
  return ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(r) ? r : '16:9';
}

function normalizeHfsyGrokImagineResolution(resolution?: string): '480p' | '720p' | '1080p' {
  const r = (resolution || '').trim().toLowerCase();
  if (r === '480p') return '480p';
  if (r === '1080p' || r === '2k') return '1080p';
  return '720p';
}

function hfsyVideoOrientation(aspectRatio: string): 'landscape' | 'portrait' {
  const r = (aspectRatio || '').trim();
  return r === '9:16' || r === '3:4' || r === '2:3' ? 'portrait' : 'landscape';
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
function extractVideoTaskIdFromPayload(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  // hfsy / New API：查询必须用 task_id；同包里的 id 常为库内数字主键，优先 task_id 避免轮询错任务
  for (const k of ['task_id', 'taskId', 'id', 'request_id'] as const) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  const d = o.data;
  if (typeof d === 'string' && d.trim()) return d.trim();
  if (d && typeof d === 'object' && !Array.isArray(d)) return extractVideoTaskIdFromPayload(d);
  const result = o.result;
  if (typeof result === 'string' && result.trim()) return result.trim();
  if (result && typeof result === 'object') return extractVideoTaskIdFromPayload(result);
  return null;
}

function extractTaskStatusFromPayload(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  const direct = o.status || o.state || o.task_status;
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return String(direct).toLowerCase();
  }
  const d = o.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const nested = extractTaskStatusFromPayload(d);
    if (nested) return nested;
  }
  const result = o.result;
  if (result && typeof result === 'object') {
    const nested = extractTaskStatusFromPayload(result);
    if (nested) return nested;
  }
  const detail = o.detail;
  if (detail && typeof detail === 'object') {
    const nested = extractTaskStatusFromPayload(detail);
    if (nested) return nested;
  }
  return '';
}

function isVideoTaskPendingStatus(status: string): boolean {
  const s = status.toLowerCase().replace(/-/g, '_');
  return (
    !s ||
    s === 'pending' ||
    s === 'queued' ||
    s === 'queueing' ||
    s === 'created' ||
    s === 'submitted' ||
    s === 'not_start' ||
    s === 'processing' ||
    s === 'running' ||
    s === 'in_progress' ||
    s === 'generating'
  );
}

async function hfsySubmitVideoGeneration(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ id: string }> {
  const apiKey = getHfsySavedKey().trim();
  if (!apiKey) {
    throw new Error('未配置 hfsyapi.cn API Key。请在「设置 → API」填写「hfsyapi.cn（GPT Image 2）」API Key。');
  }
  const base = hfsyFetchBase();
  const res = await fetch(`${base}/video/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`hfsyapi.cn 视频任务提交失败 (${res.status}): ${text.slice(0, 800)}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`hfsyapi.cn 提交响应不是 JSON: ${text.slice(0, 400)}`);
  }
  const err = json && typeof json === 'object' ? (json as Record<string, unknown>).error : undefined;
  if (err) {
    const message = typeof err === 'object' && err ? (err as Record<string, unknown>).message : err;
    throw new Error(`hfsyapi.cn: ${String(message || '视频任务提交失败')}`);
  }
  const id = extractVideoTaskIdFromPayload(json);
  if (!id) throw new Error(`hfsyapi.cn 未返回视频任务 ID: ${text.slice(0, 600)}`);
  return { id };
}

async function hfsyPollVideoTaskToPlayableUrl(taskId: string, signal?: AbortSignal): Promise<string> {
  const apiKey = getHfsySavedKey().trim();
  const base = hfsyFetchBase();
  const deadline = Date.now() + TOAPIS_VIDEO_TASK_MAX_WAIT_MS;
  const enc = encodeURIComponent(taskId);
  type PollAttempt = { method: 'GET' | 'POST'; url: string; body?: Record<string, string>; key: string };
  // 文档：GET /v1/video/query?id=task_xxx → status SUCCESS + result_url
  const buildAttempts = (): PollAttempt[] => {
    const bust = `_t=${Date.now()}`;
    return [
      { method: 'GET', key: 'GET:/video/query?id', url: `${base}/video/query?id=${enc}&${bust}` },
      { method: 'GET', key: 'GET:/video/query?task_id', url: `${base}/video/query?task_id=${enc}&${bust}` },
      { method: 'GET', key: 'GET:/video/generations', url: `${base}/video/generations/${enc}?${bust}` },
      { method: 'GET', key: 'GET:/videos', url: `${base}/videos/${enc}?${bust}` },
      { method: 'POST', key: 'POST:/video/query', url: `${base}/video/query`, body: { id: taskId, task_id: taskId } },
    ];
  };
  let preferredKey: string | null = null;
  let emptyUrlRounds = 0;
  await sleepInterruptible(5_000, signal);

  const fetchAttempt = async (attempt: PollAttempt): Promise<{ parsed: unknown; rawText: string } | null> => {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(attempt.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
      signal,
      cache: 'no-store',
    });
    const rawText = await res.text();
    if (!res.ok) return null;
    try {
      return { parsed: JSON.parse(rawText), rawText };
    } catch {
      return null;
    }
  };

  const readProgress = (payload: unknown): string => {
    if (!payload || typeof payload !== 'object') return '';
    const o = payload as Record<string, unknown>;
    if (o.progress !== undefined && o.progress !== null) return String(o.progress).trim();
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      const p = (o.data as Record<string, unknown>).progress;
      if (p !== undefined && p !== null) return String(p).trim();
    }
    return '';
  };

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    let data: unknown = null;
    let text = '';
    const attempts = buildAttempts();
    const ordered: PollAttempt[] =
      preferredKey != null
        ? [...attempts.filter((a) => a.key === preferredKey), ...attempts.filter((a) => a.key !== preferredKey)]
        : attempts;
    for (const attempt of ordered) {
      const hit = await fetchAttempt(attempt);
      if (!hit) continue;
      data = hit.parsed;
      text = hit.rawText;
      preferredKey = attempt.key;
      break;
    }
    if (!data) {
      await sleepInterruptible(10_000, signal);
      continue;
    }

    const status = extractTaskStatusFromPayload(data);
    const progress = readProgress(data);
    const looksDoneByProgress = /^(100%?|100)$/i.test(progress);
    const rawUrlEarly = extractVideoUrlFromPollPayload(data);
    const earlyUrlLooksReady =
      !!rawUrlEarly &&
      (!isVideoTaskPendingStatus(status) ||
        looksDoneByProgress ||
        /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(rawUrlEarly) ||
        /\/(?:videos?|media|cdn|file)\//i.test(rawUrlEarly) ||
        /^https?:\/\/file\.hfsyapi\.cn\//i.test(rawUrlEarly));
    // 文档完成态：status=SUCCESS + result_url；有成片 URL / 进度 100% 时结束轮询
    if (isVideoTaskCompletedStatus(status) || looksDoneByProgress || earlyUrlLooksReady) {
      const rawUrl = rawUrlEarly || extractVideoUrlFromPollPayload(data);
      if (!rawUrl) {
        // SUCCESS 但暂无 URL：换路径再查；连续多次仍无 URL 再报错，避免无限读秒
        preferredKey = null;
        emptyUrlRounds += 1;
        if (emptyUrlRounds >= 6) {
          throw new Error(`hfsyapi.cn 视频任务完成但未返回可播放 URL。完整响应：${text.slice(0, 2000)}`);
        }
        await sleepInterruptible(3_000, signal);
        continue;
      }
      emptyUrlRounds = 0;
      const normalizedUrl = rawUrl.replace(/^(https?:\/)([^/])/i, '$1/$2');
      return rewriteKnownImageCdnToSameOrigin(normalizedUrl);
    }
    if (
      status === 'failed' ||
      status === 'failure' ||
      status === 'error' ||
      status === 'cancelled' ||
      status === 'canceled' ||
      status === 'fail'
    ) {
      const o = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      const nestedData = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null;
      const message =
        (o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>).message : o.error) ||
        o.message ||
        o.fail_reason ||
        nestedData?.fail_reason ||
        nestedData?.message ||
        text.slice(0, 400);
      throw new Error(`hfsyapi.cn 视频生成失败: ${String(message)}`);
    }
    if (!isVideoTaskPendingStatus(status)) {
      const rawUrl = extractVideoUrlFromPollPayload(data);
      if (rawUrl) return rewriteKnownImageCdnToSameOrigin(rawUrl.replace(/^(https?:\/)([^/])/i, '$1/$2'));
    }
    await sleepInterruptible(10_000, signal);
  }
  throw new Error(`hfsyapi.cn 视频任务超时（已等待超过 ${TOAPIS_VIDEO_TASK_MAX_WAIT_MS / 60_000} 分钟），请稍后重试。`);
}

async function hfsyVideoGenerate(params: {
  prompt: string;
  videoModel: HfsyVideoModelId;
  durationSeconds: number;
  aspectRatio: string;
  resolution?: string;
  referenceImagesBase64?: string[];
  referenceVideoUrls?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const imageUrls: string[] = [];
  // 文档：sd-2-vip 最多 9 张图；H3 等其余模型参考素材合计 ≤4
  const maxImages =
    params.videoModel === 'hfsy-sd-2-vip' || params.videoModel === 'hfsy-sd-2-vip-720' ? 9 : 4;
  const refs = (params.referenceImagesBase64 || []).filter(Boolean).slice(0, maxImages);
  for (let i = 0; i < refs.length; i++) {
    assertNotAborted(params.signal);
    const img = refs[i];
    const { raw, mime } = parseBase64ImageInput(img);
    const blob = base64ToBlob(raw, mime || 'image/jpeg');
    imageUrls.push(await uploadHfsyVideoReferenceImage(blob, params.signal));
  }

  const videoUrls = (params.referenceVideoUrls || []).filter((u) => /^https?:\/\//i.test(u.trim())).slice(0, 3);
  const maxTotal =
    params.videoModel === 'hfsy-sd-2-vip' ||
    params.videoModel === 'hfsy-sd-2-vip-720' ||
    isHfsySd2VideoModel(params.videoModel)
      ? 12
      : 4;
  if (imageUrls.length + videoUrls.length > maxTotal) {
    throw new Error(`hfsyapi.cn 参考素材总数不能超过 ${maxTotal} 个。`);
  }

  const upstreamModel = toHfsyVideoModel(params.videoModel);
  let body: Record<string, unknown>;

  if (params.videoModel === 'hfsy-minimax-h3') {
    // 文档 https://www.hfsyapi.cn/docs：orientation 必填；size=large/small；无 ratio/resolution 字段
    const ratio = normalizeHfsyMinimaxH3Ratio(params.aspectRatio);
    body = {
      model: upstreamModel,
      orientation: hfsyVideoOrientation(ratio),
      prompt: params.prompt,
      duration: normalizeHfsyMinimaxH3Duration(params.durationSeconds),
      size: params.resolution === '480p' || params.resolution === 'small' ? 'small' : 'large',
      watermark: false,
    };
  } else if (params.videoModel === 'hfsy-grok-imagine-video-1.5') {
    const ratio = normalizeHfsyGrokImagineRatio(params.aspectRatio);
    body = {
      model: upstreamModel,
      orientation: hfsyVideoOrientation(ratio),
      ratio,
      prompt: params.prompt,
      duration: normalizeHfsyGrokImagineDuration(params.durationSeconds),
      resolution: normalizeHfsyGrokImagineResolution(params.resolution),
      watermark: false,
    };
  } else {
    const ratio = normalizeHfsyVideoRatio(params.aspectRatio);
    body = {
      model: upstreamModel,
      orientation: hfsyVideoOrientation(ratio),
      ratio,
      prompt: params.prompt,
      duration: normalizeHfsyVideoDuration(params.durationSeconds),
      watermark: false,
    };
    // 分辨率写在模型名里的档位：显式传 resolution；其余 Seedance 系沿用 size: large
    if (params.videoModel === 'hfsy-sd-2.5-480') {
      body.resolution = '480p';
    } else if (params.videoModel === 'hfsy-sd-2.5-720' || params.videoModel === 'hfsy-sd-2-vip-720') {
      body.resolution = '720p';
    } else {
      body.size = 'large';
    }
  }

  if (imageUrls.length > 0) body.images = imageUrls;
  if (videoUrls.length > 0) body.videos = videoUrls;

  const { id } = await hfsySubmitVideoGeneration(body, params.signal);
  return hfsyPollVideoTaskToPlayableUrl(id, params.signal);
}

const MANXUE_VIDEO_TASK_MAX_WAIT_MS = 1_800_000;

/** 满 eAPI 参考图最大张数（首帧） */
const MANXUE_VIDEO_MAX_REFERENCE_IMAGES = 3;

/**
 * 满 eAPI 视频参考图：media/generate 接受公网 URL 或 data URI。
 */
async function manxueUploadReferenceImageUrls(
  refs: string[],
  signal?: AbortSignal
): Promise<string[]> {
  if (!refs || refs.length === 0) return [];
  const list = refs.filter(Boolean).slice(0, MANXUE_VIDEO_MAX_REFERENCE_IMAGES);
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    assertNotAborted(signal);
    const input = list[i].trim();
    if (/^https?:\/\//i.test(input)) {
      out.push(input);
      continue;
    }
    const { raw, mime } = parseBase64ImageInput(input);
    const cleanRaw = raw.replace(/\s/g, '');
    const blob = base64ToBlob(cleanRaw, mime || sniffMimeFromBase64(cleanRaw) || 'image/jpeg');
    out.push(await uploadHfsyVideoReferenceImage(blob, signal));
  }
  return out;
}

function pickManxueAsyncTaskId(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const o = json as Record<string, unknown>;
  const asId = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  for (const k of ['task_id', 'taskId', 'id']) {
    const s = asId(o[k]);
    if (s) return s;
  }
  const data = o.data;
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const first = data[0] as Record<string, unknown>;
    for (const k of ['task_id', 'taskId', 'id']) {
      const s = asId(first[k]);
      if (s) return s;
    }
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['task_id', 'taskId', 'id']) {
      const s = asId(d[k]);
      if (s) return s;
    }
  }
  return undefined;
}

function pickManxueTaskStatus(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const o = json as Record<string, unknown>;
  const asSt = (v: unknown) => (typeof v === 'string' ? v : '');
  if (asSt(o.status) || asSt(o.state)) return asSt(o.status) || asSt(o.state);
  const data = o.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    return asSt(d.status) || asSt(d.state);
  }
  return '';
}

async function manxueSubmitVideoGeneration(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ id: string }> {
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 e API Key。请在「设置 → API → 满 e」填写。');
  const base = manxueFetchBase();
  const endpoints = [
    `${base}/video/generations`,
    `${base}/media/generate`,
    `${base}/videos/generations`,
  ];
  let lastErr = '';
  for (const url of endpoints) {
    const res = await fetch(url, {
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
      lastErr = `满 e 视频提交失败 (${res.status} ${url.slice(url.lastIndexOf('/'))}): ${text.slice(0, 800)}`;
      if (res.status === 404 || res.status === 405) continue;
      throw new Error(lastErr);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`满 e 响应非 JSON: ${text.slice(0, 400)}`);
    }
    const rec = json as { error?: { message?: string } };
    if (rec.error?.message) throw new Error(`满 e: ${rec.error.message}`);
    const id = pickManxueAsyncTaskId(json);
    if (!id) throw new Error(`满 e 未返回视频任务 id：${text.slice(0, 400)}`);
    return { id };
  }
  throw new Error(lastErr || '满 e 视频提交失败：media/generate 不可用。');
}

async function manxuePollVideoTaskToPlayableUrl(
  taskId: string,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getManxueSavedKey();
  const base = manxueFetchBase();
  const deadline = Date.now() + MANXUE_VIDEO_TASK_MAX_WAIT_MS;
  const enc = encodeURIComponent(taskId);
  type PollAttempt = { method: 'GET' | 'POST'; url: string; body?: Record<string, string> };
  /** New API 官方为 GET /v1/video/generations/{task_id}（单数 video）；旧路径 videos/generations 会 404 */
  const attempts: PollAttempt[] = [
    { method: 'GET', url: `${base}/video/generations/${enc}` },
    { method: 'GET', url: `${base}/videos/${enc}` },
    { method: 'GET', url: `${base}/video/query?id=${enc}` },
    { method: 'POST', url: `${base}/video/query`, body: { id: taskId, task_id: taskId } },
    { method: 'GET', url: `${base}/videos/generations/${enc}` },
  ];
  let preferred: PollAttempt | null = null;
  await sleepInterruptible(5_000, signal);

  const fetchAttempt = async (attempt: PollAttempt): Promise<{ parsed: unknown; rawText: string } | null> => {
    const res = await fetch(attempt.url, {
      method: attempt.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(attempt.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
      signal,
    });
    const rawText = await res.text();
    if (!res.ok) return null;
    try {
      return { parsed: JSON.parse(rawText), rawText };
    } catch {
      return null;
    }
  };

  while (Date.now() < deadline) {
    assertNotAborted(signal);
    let parsed: unknown = null;
    let rawText = '';
    const order = preferred ? [preferred, ...attempts.filter((a) => a.url !== preferred!.url || a.method !== preferred!.method)] : attempts;
    for (const attempt of order) {
      const hit = await fetchAttempt(attempt);
      if (!hit) continue;
      parsed = hit.parsed;
      rawText = hit.rawText;
      preferred = attempt;
      break;
    }
    if (parsed) {
      const st = pickManxueTaskStatus(parsed);
      if (isVideoTaskCompletedStatus(st) || extractVideoUrlFromPollPayload(parsed)) {
        const rawUrl = extractVideoUrlFromPollPayload(parsed);
        if (!rawUrl) {
          throw new Error(`满 e 视频任务完成但未返回可播放 URL。完整响应：${rawText.slice(0, 2000)}`);
        }
        const normalizedUrl = rawUrl.replace(/^(https?:\/)([^/])/i, '$1/$2');
        return rewriteKnownImageCdnToSameOrigin(normalizedUrl);
      }
      const failed = String(st).toLowerCase();
      if (failed === 'failed' || failed === 'error' || failed === 'cancelled' || failed === 'canceled') {
        const rec = parsed as { error?: { message?: string }; message?: string };
        throw new Error(`满 e 视频生成失败: ${rec.error?.message || rec.message || rawText.slice(0, 300)}`);
      }
    }
    await sleepInterruptible(10_000, signal);
  }
  throw new Error(
    `满 e 视频任务超时（已等待超过 ${MANXUE_VIDEO_TASK_MAX_WAIT_MS / 60_000} 分钟），请稍后重试。`
  );
}

/**
 * 满 eAPI 文生 / 图生视频（异步 POST /v1/media/generate，轮询 task_id）。
 */
export async function manxueVideoGenerate(params: {
  prompt: string;
  videoModel?: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '720p';
  referenceImagesBase64?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const { prompt, videoModel, durationSeconds, aspectRatio, referenceImagesBase64 = [], signal } = params;
  const apiKey = getManxueSavedKey();
  if (!apiKey) throw new Error('未配置满 e API Key。请在「设置 → API → 满 e」填写。');

  const imageUrls = await manxueUploadReferenceImageUrls(referenceImagesBase64, signal);
  const duration = Math.min(15, Math.max(1, Number(durationSeconds) || 8));
  const effectiveAspectRatio = (aspectRatio || '16:9').trim() || '16:9';

  const body: Record<string, unknown> = {
    model: manxueVideoUpstreamModel(videoModel),
    prompt,
    duration,
    seconds: duration,
    aspect_ratio: effectiveAspectRatio,
    resolution: '720p',
  };
  if (imageUrls.length) {
    body.images = imageUrls;
    body.image_urls = imageUrls;
  }

  const { id } = await manxueSubmitVideoGeneration(body, signal);
  return manxuePollVideoTaskToPlayableUrl(id, signal);
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
  /** 模型 id；默认 grok-video-3，可选 grok-video-1.5 / grok-video-1.5-preview */
  videoModel?: 'grok-video-3' | 'grok-video-1.5' | 'grok-video-1.5-preview';
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

function toApisSeedanceImageWithRoles(imageUrls: string[]): { url: string; role: string }[] {
  if (imageUrls.length === 1) return [{ url: imageUrls[0], role: 'first_frame' }];
  if (imageUrls.length === 2) {
    return [
      { url: imageUrls[0], role: 'first_frame' },
      { url: imageUrls[1], role: 'last_frame' },
    ];
  }
  return imageUrls.map((url) => ({ url, role: 'reference_image' }));
}

/**
 * ToAPIs：`grok-video-1.5` 仅图生视频，必须 1 张首图；时长 1–15 秒；480p / 720p。
 * https://docs.toapis.com/docs/cn/api-reference/videos/grok-video-1.5/generation
 */
async function toApisGrokVideo15Generate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
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
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'grok-video-1.5-ref',
    params.signal,
    1
  );
  if (!imageUrls.length) {
    throw new Error('ToAPIs grok-video-1.5 仅支持图生视频，请连接 1 张参考图。');
  }
  const duration = Math.min(15, Math.max(1, Math.round(params.durationSeconds || 8)));
  const ar = (params.aspectRatio || '16:9').trim();
  const aspect_ratio = ['1:1', '16:9', '9:16', '3:2', '2:3'].includes(ar) ? ar : '16:9';
  const resolution = params.resolution === '480p' ? '480p' : '720p';
  const body: Record<string, unknown> = {
    model: 'grok-video-1.5',
    prompt: params.prompt,
    image: imageUrls[0],
    duration,
    aspect_ratio,
    resolution,
  };
  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

/**
 * ToAPIs Seedance 2 族：seedance-2 / seedance-2-fast / seedance-2-mini / seedance-2-5。
 */
async function toApisSeedance2VideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '480p' | '720p' | '1080p';
  referenceImagesBase64?: string[];
  referenceVideoUrls?: string[];
  videoModel: 'seedance-2' | 'seedance-2-fast' | 'seedance-2-mini' | 'seedance-2-5';
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
  const model = params.videoModel;
  const duration = Math.min(15, Math.max(4, Math.round(params.durationSeconds || 8)));
  let resolution: '480p' | '720p' | '1080p' = params.resolution;
  if (model === 'seedance-2-5' || model === 'seedance-2-mini' || model === 'seedance-2-fast') {
    if (resolution === '1080p') resolution = '720p';
  }
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    `${model}-ref`,
    params.signal,
    9
  );
  const imageWithRoles = toApisSeedanceImageWithRoles(imageUrls);
  const ar = (params.aspectRatio || '16:9').trim();
  const aspect_ratio =
    model === 'seedance-2-5'
      ? (['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(ar) ? ar : '16:9')
      : (['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(ar) ? ar : '16:9');
  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    duration,
    aspect_ratio,
    resolution,
  };
  if (imageWithRoles.length) body.image_with_roles = imageWithRoles;
  const vids = (params.referenceVideoUrls || []).filter((u) => /^https?:\/\//i.test(u.trim())).slice(0, 3);
  if (vids.length) {
    body.video_with_roles = vids.map((url) => ({ url, role: 'reference_video' }));
  }
  const { id } = await toApisSubmitVideoGeneration(body, params.signal);
  return toApisPollVideoTaskToPlayableUrl(id, params.signal);
}

/**
 * ToAPIs：`kling-v3-omni`。mode=std→720P，mode=pro→1080P（最高 1080p）。
 */
async function toApisKlingV3OmniVideoGenerate(params: {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: '720p' | '1080p';
  referenceImagesBase64?: string[];
  referenceVideoUrls?: string[];
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
  const imageUrls = await toApisUploadVideoReferenceImageUrls(
    params.referenceImagesBase64 || [],
    'kling-v3-omni-ref',
    params.signal,
    9
  );
  const duration = Math.min(15, Math.max(3, Math.round(params.durationSeconds || 5)));
  const mode = params.resolution === '1080p' ? 'pro' : 'std';
  const ar = (params.aspectRatio || '16:9').trim();
  const aspect_ratio = ar === '9:16' || ar === '1:1' ? ar : '16:9';
  let prompt = params.prompt || '';
  const image_list = imageUrls.map((image_url) => ({ image_url }));
  if (image_list.length && !/<<<image_\d+>>>/.test(prompt)) {
    const tags = image_list.map((_, i) => `<<<image_${i + 1}>>>`).join('');
    prompt = `${tags}${prompt}`;
  }
  const body: Record<string, unknown> = {
    model: 'kling-v3-omni',
    prompt,
    mode,
    duration,
    aspect_ratio,
  };
  if (image_list.length) body.metadata = { image_list };
  const vids = (params.referenceVideoUrls || []).filter((u) => /^https?:\/\//i.test(u.trim()));
  if (vids.length) {
    body.video_list = [{ video_url: vids[0], refer_type: 'base', keep_original_sound: 'no' }];
  }
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
  referenceVideoUrls?: string[];
  /** 语音参考：音频 base64 */
  referenceAudioBase64?: string;
  signal?: AbortSignal;
}): Promise<string> {
  // 满 e 视频优先拦截（避免后续 isToApisHost 校验误伤）
  if (isManxueVideoModel(params.videoModel)) {
    return manxueVideoGenerate({
      prompt: params.prompt,
      videoModel: params.videoModel,
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
  if (
    params.videoModel === 'seedance-2' ||
    params.videoModel === 'seedance-2-fast' ||
    params.videoModel === 'seedance-2-mini' ||
    params.videoModel === 'seedance-2-5'
  ) {
    const res =
      params.videoModel === 'seedance-2'
        ? params.resolution === '1080p' || params.resolution === '480p'
          ? params.resolution
          : '720p'
        : params.resolution === '480p'
          ? '480p'
          : '720p';
    return toApisSeedance2VideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: res,
      referenceImagesBase64: params.referenceImagesBase64,
      referenceVideoUrls: params.referenceVideoUrls,
      videoModel: params.videoModel,
      signal: params.signal,
    });
  }
  if (params.videoModel === 'kling-v3-omni') {
    return toApisKlingV3OmniVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution === '1080p' ? '1080p' : '720p',
      referenceImagesBase64: params.referenceImagesBase64,
      referenceVideoUrls: params.referenceVideoUrls,
      signal: params.signal,
    });
  }
  if (params.videoModel === 'grok-video-1.5') {
    return toApisGrokVideo15Generate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution === '480p' ? '480p' : '720p',
      referenceImagesBase64: params.referenceImagesBase64,
      signal: params.signal,
    });
  }
  if (isHfsyVideoModel(params.videoModel)) {
    return hfsyVideoGenerate({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      referenceImagesBase64: params.referenceImagesBase64,
      referenceVideoUrls: params.referenceVideoUrls,
      videoModel: params.videoModel,
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
  if (params.videoModel.startsWith('jimeng-')) {
    throw new Error('即梦模型请通过前端即梦客户端调用，不支持直接走 ToAPIs');
  }
  return toApisGrokVideo15Generate({
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
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const model = toApisT2iModel(modelName);
  const size = toApisAspectSize(aspectRatio);
  const out: string[] = [];
  const count = Math.min(Math.max(numberOfImages, 1), 8);
  const clampedResolution = clampToApisNanoBanana2Resolution(modelName, nodeResolution);

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    const body = buildToApisImageGenerationBody({
      model,
      promptLine: `${prompt}\n\n（画幅比例 ${aspectRatio}）`,
      size,
      nodeResolution: clampedResolution,
      quality,
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
  if (m === 'gpt-image-2pro-hfsy') return 'gpt-image-2pro';
  if (m === 'gpt-image-2pro-4k-hfsy') return 'gpt-image-2pro-4k';
  if (m === 'dall-e-2' || m === 'dall-e-3' || m === 'gpt-image-2' || m === 'gpt-image-2-vip' || m === 'gpt-image-2-official' || m === 'gpt-image-1') return m;
  return 'dall-e-3';
}

function resolveEditModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-image-2-codesonline') return 'gpt-image-2';
  if (m === 'gpt-image-2-hfsy') return 'gpt-image-2';
  if (m === 'gpt-image-2pro-hfsy') return 'gpt-image-2pro';
  if (m === 'gpt-image-2pro-4k-hfsy') return 'gpt-image-2pro-4k';
  if (m === 'gpt-image-2' || m === 'gpt-image-2-vip' || m === 'gpt-image-2-official') return m;
  if (m === 'dall-e-2' || m === 'gpt-image-1') return m;
  if (m === 'dall-e-3') return 'gpt-image-1';
  return 'gpt-image-1';
}

function isHfsyImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'gpt-image-2-hfsy' ||
    m === 'gpt-image-2pro-hfsy' ||
    m === 'gpt-image-2pro-4k-hfsy' ||
    m === 'nano-banana-2-hfsy' ||
    m === 'nano-banana-pro-hfsy'
  );
}

function toHfsyImageModel(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'nano-banana-2-hfsy') return 'nano-banana-2';
  if (m === 'nano-banana-pro-hfsy') return 'nano-banana-pro';
  if (m === 'gpt-image-2pro-hfsy') return 'gpt-image-2pro';
  if (m === 'gpt-image-2pro-4k-hfsy') return 'gpt-image-2pro-4k';
  return 'gpt-image-2';
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

const MANXUE_GPT_IMAGE_2_4K_ASPECT_SIZES: Record<string, string> = {
  '1:1': '2880x2880',
  '16:9': '3840x2160',
  '9:16': '2160x3840',
  '4:3': '3840x2880',
  '3:4': '2880x3840',
  '2:1': '3840x1920',
  '1:2': '1920x3840',
  '21:9': '3840x1648',
  '9:21': '1648x3840',
  '3:2': '3840x2560',
  '2:3': '2560x3840',
  '5:4': '3200x2560',
  '4:5': '2560x3200',
};

function manxueGptImage2Size(aspectRatio: string, modelName?: string): string {
  if ((modelName || '').trim() === 'gpt-image-2-4k-manxue') {
    const key = (aspectRatio || '1:1').trim();
    return MANXUE_GPT_IMAGE_2_4K_ASPECT_SIZES[key] || MANXUE_GPT_IMAGE_2_4K_ASPECT_SIZES['1:1'];
  }
  return manxueAspectSize(aspectRatio);
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
  const resolution = model === 'gpt-image-2-4k' ? '4K' : manxueResolution(nodeResolution);
  const size = manxueGptImage2Size(aspectRatio, modelName);
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
    body.resolution = resolution;
    // GPT Image 2 支持 quality 参数
    if (quality && (model === 'gpt-image-2' || model === 'gpt-image-2-pro' || model === 'gpt-image-2-4k')) {
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
  const size = pixelSize || manxueGptImage2Size(aspectRatio, modelName);
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
      // OpenAI-compatible image edits expects repeated `image` fields.
      form.append('image', blob, filename);
    }
    form.append('model', model);
    form.append('prompt', `${prompt}\n\n（画幅比例 ${aspectRatio}）`);
    form.append('n', '1');
    form.append('size', size);
    form.append('response_format', 'b64_json');
    if (model === 'gpt-image-2-4k') {
      form.append('resolution', '4K');
    }
    if (quality && (model === 'gpt-image-2' || model === 'gpt-image-2-pro' || model === 'gpt-image-2-4k')) {
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

/**
 * hfsyapi.cn gpt-image-2 画幅 → size（1K，与 https://www.hfsyapi.cn 创作中心 XA 表一致）。
 * gpt-image-2 仅支持 1K 档位；勿使用 DALL·E 的 1792x1024 等尺寸。
 */
const HFSY_GPT_IMAGE_2_ASPECT_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '5:4': '1040x832',
  '9:16': '720x1280',
  '16:9': '1280x720',
  '4:3': '1024x768',
  '3:2': '1008x672',
  '4:5': '832x1040',
  '3:4': '768x1024',
  '2:3': '672x1008',
  '21:9': '1344x576',
};

/** gpt-image-2pro 等 2K 档位（边长为 16 的倍数） */
const HFSY_GPT_IMAGE_2_2K_ASPECT_SIZES: Record<string, string> = {
  '1:1': '2048x2048',
  '5:4': '2080x1664',
  '9:16': '1440x2560',
  '16:9': '2560x1440',
  '4:3': '2048x1536',
  '3:2': '2016x1344',
  '4:5': '1664x2080',
  '3:4': '1536x2048',
  '2:3': '1344x2016',
  '21:9': '2688x1152',
};

/** gpt-image-2pro-4k 等 4K 档位（边长为 16 的倍数） */
const HFSY_GPT_IMAGE_2_4K_ASPECT_SIZES: Record<string, string> = {
  '1:1': '2880x2880',
  '5:4': '3200x2560',
  '9:16': '2160x3840',
  '16:9': '3840x2160',
  '4:3': '3840x2880',
  '3:2': '3840x2560',
  '4:5': '2560x3200',
  '3:4': '2880x3840',
  '2:3': '2560x3840',
  '21:9': '3840x1648',
};

function hfsyGptImage2Size(aspectRatio: string, pixelSize?: string, modelName?: string, nodeResolution?: string): string {
  if (pixelSize?.trim()) return pixelSize.trim();
  const key = (aspectRatio || '1:1').trim();
  const m = (modelName || '').trim();
  const res = (nodeResolution || '').trim().toLowerCase();

  let table = HFSY_GPT_IMAGE_2_ASPECT_SIZES;
  if (m === 'gpt-image-2pro-4k-hfsy') {
    table = HFSY_GPT_IMAGE_2_4K_ASPECT_SIZES;
  } else if (m === 'gpt-image-2pro-hfsy') {
    if (res === '4k') table = HFSY_GPT_IMAGE_2_4K_ASPECT_SIZES;
    else if (res === '1k') table = HFSY_GPT_IMAGE_2_ASPECT_SIZES;
    else table = HFSY_GPT_IMAGE_2_2K_ASPECT_SIZES;
  }

  return table[key] || table['1:1'];
}

function isHfsyNanoBananaModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === 'nano-banana-2-hfsy' || m === 'nano-banana-pro-hfsy';
}

/** hfsy Nano Banana 的 generateContent 路径含冒号；统一走 ?path=，避免路径冒号或重复拼接导致 502 */
function hfsyGeminiGenerateContentUrl(model: string): string {
  const actionPath = `v1beta/models/${model}:generateContent`;
  if (typeof window === 'undefined') {
    return `https://www.hfsyapi.cn/${actionPath}`;
  }
  const prefix = hfsyImageProxyPathPrefix();
  const url = `${window.location.origin}${prefix}?path=${encodeURIComponent(actionPath)}`;
  if ((url.match(/https?:\/\//gi) || []).length > 1) {
    throw new Error('hfsyapi.cn Nano Banana 请求地址构造异常，请硬刷新页面后重试。');
  }
  return url;
}

function hfsyGeminiImageSize(nodeResolution?: string): '1K' | '2K' | '4K' {
  const r = (nodeResolution || '2K').trim().toUpperCase();
  if (r === '1K' || r === '4K') return r;
  return '2K';
}

function hfsyNanoBananaFailureHint(status: number, bodyText: string): string {
  const lower = bodyText.toLowerCase();
  if (lower.includes('account access is restricted') || lower.includes('access is restricted')) {
    return '（账户权限受限：hfsyapi.cn 账号未开通 Nano Banana 生图，或账户欠费/被限制。请登录 https://www.hfsyapi.cn 检查余额、套餐与模型权限，或联系平台客服。若 GPT Image 2（hfsy）可用，说明 Key 有效，只是 Nano Banana 未授权。）';
  }
  if (status === 401 || lower.includes('invalid token')) {
    return '（401：请在「设置 → API」填写并保存正确的 hfsyapi.cn API Key。）';
  }
  return '';
}

/** hfsyapi 图生图 reference_images：URL 原样；base64 去掉 data: 前缀 */
function hfsyNormalizeReferenceImage(input: string): string {
  const trimmed = (input || '').trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return parseBase64ImageInput(trimmed).raw;
}

/**
 * hfsy 图生图参考图：优先上传得公网 URL（经 /api/hfsy-image-proxy 时避免 Vercel 413），
 * 失败则压缩为 JPEG 裸 base64，控制单次 generations JSON 体积。
 */
async function buildHfsyReferenceImages(
  inputs: string[],
  _apiKey: string,
  signal?: AbortSignal
): Promise<string[]> {
  const out: string[] = [];
  const maxSide = 1280;
  const jpegQ = 0.78;
  for (let i = 0; i < Math.min(inputs.length, 6); i++) {
    assertNotAborted(signal);
    const trimmed = (inputs[i] || '').trim();
    if (!trimmed) continue;
    try {
      if (/^https?:\/\//i.test(trimmed)) {
        const raw = await fetchUrlAsBase64(trimmed, signal, _apiKey);
        const dataUrl = await shrinkBase64ImageToJpegDataUrl(`data:image/jpeg;base64,${raw}`, maxSide, jpegQ);
        out.push(parseBase64ImageInput(dataUrl).raw);
      } else {
        const dataUrl = await shrinkBase64ImageToJpegDataUrl(trimmed, maxSide, jpegQ);
        out.push(parseBase64ImageInput(dataUrl).raw);
      }
    } catch {
      out.push(hfsyNormalizeReferenceImage(trimmed));
    }
  }
  return out;
}

async function hfsyRequestOneNanoBananaImage(
  modelName: string,
  prompt: string,
  aspectRatio: string,
  apiKey: string,
  signal?: AbortSignal,
  referenceImages?: string[],
  nodeResolution?: string
): Promise<string> {
  const model = toHfsyImageModel(modelName);
  const parts: Array<
    | { text: string }
    | { fileData: { mimeType: string; fileUri: string } }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];

  for (const ref of (referenceImages || []).slice(0, 6)) {
    const trimmed = (ref || '').trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const lower = trimmed.toLowerCase();
      const mime = lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.gif')
          ? 'image/gif'
          : lower.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg';
      parts.push({ fileData: { mimeType: mime, fileUri: trimmed } });
    } else {
      const { raw, mime } = parseBase64ImageInput(trimmed);
      parts.push({ inlineData: { mimeType: mime || 'image/jpeg', data: raw } });
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      imageConfig: {
        aspectRatio,
        imageSize: hfsyGeminiImageSize(nodeResolution),
      },
    },
  };

  const res = await fetch(hfsyGeminiGenerateContentUrl(model), {
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
    const hint = hfsyNanoBananaFailureHint(res.status, text);
    throw new Error(`hfsyapi.cn Nano Banana generateContent failed (${res.status}): ${text.slice(0, 800)}${hint}`);
  }

  let json: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          fileData?: { fileUri?: string; mimeType?: string };
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
    error?: { message?: string };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`hfsyapi.cn Nano Banana response is not JSON: ${text.slice(0, 500)}`);
  }
  if (json.error?.message) throw new Error(`hfsyapi.cn Nano Banana: ${json.error.message}`);

  const responseParts = json.candidates?.[0]?.content?.parts || [];
  for (const part of responseParts) {
    const inline = part.inlineData?.data;
    if (inline && isPlausibleImageBase64(inline)) return inline;
    const uri = part.fileData?.fileUri;
    if (uri) return fetchUrlAsBase64(uri, signal, apiKey);
  }

  const url = extractFirstStringUrl(json);
  if (url) return fetchUrlAsBase64(url, signal, apiKey);
  throw new Error(`hfsyapi.cn Nano Banana response did not include an image: ${text.slice(0, 800)}`);
}

/** hfsyapi.cn GPT Image 2 单次生图（文生图 / 图生图共用）；文档 https://www.hfsyapi.cn/docs */
async function hfsyRequestOneImage(
  modelName: string,
  prompt: string,
  aspectRatio: string,
  apiKey: string,
  signal?: AbortSignal,
  referenceImages?: string[],
  pixelSize?: string,
  nodeResolution?: string
): Promise<string> {
  if (isHfsyNanoBananaModel(modelName)) {
    return hfsyRequestOneNanoBananaImage(modelName, prompt, aspectRatio, apiKey, signal, referenceImages, nodeResolution);
  }
  const base = hfsyFetchBase();
  const body: Record<string, unknown> = {
    model: toHfsyImageModel(modelName),
    prompt,
    n: 1,
    size: hfsyGptImage2Size(aspectRatio, pixelSize, modelName, nodeResolution),
    response_format: 'b64_json',
  };
  if (referenceImages?.length) {
    body.reference_images = referenceImages.slice(0, 6);
  }
  const json = await postJsonAtBase<Record<string, unknown>>(
    base,
    '/images/generations',
    body,
    apiKey
  );
  return openAiStyleGenerationJsonToBase64(json, signal, apiKey, base);
}

/** hfsyapi.cn GPT Image 2 文生图：POST /v1/images/generations（同步或 task_id 异步轮询） */
async function hfsyGenerateNewImage(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  modelName: string,
  nodeResolution?: string,
  _quality?: string,
  signal?: AbortSignal
): Promise<string[]> {
  const apiKey = getHfsySavedKey().trim();
  if (!apiKey) {
    throw new Error(
      '未配置 hfsyapi.cn 图像通道。请在「设置 → API」填写「hfsyapi.cn（GPT Image 2）」API Key；文档：https://www.hfsyapi.cn/docs'
    );
  }
  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    out.push(await hfsyRequestOneImage(modelName, prompt, aspectRatio, apiKey, signal, undefined, undefined, nodeResolution));
  }
  return out;
}

/** hfsyapi.cn GPT Image 2 图生图：
 * 不支持 `/v1/images/edits`；走 POST /v1/images/generations + `reference_images`（URL 或裸 base64）。
 */
async function hfsyEditImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number,
  modelName: string,
  aspectRatio: string,
  nodeResolution?: string,
  _quality?: string,
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
  const referenceImages = await buildHfsyReferenceImages(base64Images, apiKey, signal);
  if (!referenceImages.length) throw new Error('图生图参考图处理失败，请换更小的图片后重试。');
  const count = Math.min(Math.max(numberOfImages, 1), 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);
    out.push(
      await hfsyRequestOneImage(modelName, prompt, aspectRatio, apiKey, signal, referenceImages, pixelSize, nodeResolution)
    );
  }
  return out;
}

/** 从任意嵌套响应中提取第一个 http(s) URL。 */
function extractFirstStringUrl(value: unknown): string {
  if (typeof value === 'string') {
    const s = value.trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstStringUrl(item);
      if (found) return found;
    }
    return '';
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['url', 'image_url', 'imageUrl', 'output_url', 'outputUrl', 'download_url', 'downloadUrl']) {
      const found = extractFirstStringUrl(obj[key]);
      if (found) return found;
    }
    for (const key of ['urls', 'images', 'image_urls', 'imageUrls', 'results', 'data', 'output', 'outputs']) {
      const found = extractFirstStringUrl(obj[key]);
      if (found) return found;
    }
    for (const item of Object.values(obj)) {
      const found = extractFirstStringUrl(item);
      if (found) return found;
    }
  }
  return '';
}

async function fetchUrlAsBase64WithTimeout(
  imageUrl: string,
  signal?: AbortSignal,
  bearerToken?: string,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const ac = new AbortController();
  let abortListener: (() => void) | undefined;
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    if (signal) {
      abortListener = () => ac.abort();
      signal.addEventListener('abort', abortListener, { once: true });
    }
    return await fetchUrlAsBase64(imageUrl, ac.signal, bearerToken);
  } catch (err) {
    if (ac.signal.aborted && !signal?.aborted) {
      throw new Error(`下载生成图超时（${Math.round(timeoutMs / 1000)} 秒）：${imageUrl.slice(0, 200)}`);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

/** 从 Gemini generateContent 响应中提取成图 base64（兼容 camelCase / snake_case / fileData / 文本里的 URL） */
async function extractGeminiImageBase64FromResponse(
  json: unknown,
  signal?: AbortSignal,
  bearerToken?: string
): Promise<string | null> {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];

  const pickFromPart = async (part: Record<string, unknown>): Promise<string | null> => {
    const inline =
      (part.inlineData && typeof part.inlineData === 'object'
        ? (part.inlineData as Record<string, unknown>)
        : null) ||
      (part.inline_data && typeof part.inline_data === 'object'
        ? (part.inline_data as Record<string, unknown>)
        : null);
    if (inline) {
      const data = typeof inline.data === 'string' ? inline.data.trim() : '';
      if (data && isPlausibleImageBase64(data)) {
        return data.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
      }
    }
    const file =
      (part.fileData && typeof part.fileData === 'object'
        ? (part.fileData as Record<string, unknown>)
        : null) ||
      (part.file_data && typeof part.file_data === 'object'
        ? (part.file_data as Record<string, unknown>)
        : null);
    if (file) {
      const uri =
        (typeof file.fileUri === 'string' && file.fileUri.trim()) ||
        (typeof file.file_uri === 'string' && file.file_uri.trim()) ||
        '';
      if (/^https?:\/\//i.test(uri)) {
        return fetchUrlAsBase64(uri, signal, bearerToken);
      }
    }
    if (typeof part.text === 'string' && part.text.trim()) {
      const text = part.text.trim();
      // 满 e / 部分网关：把成图写成 Markdown data URI，而非 inlineData
      const mdData = text.match(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)\)/i);
      if (mdData?.[1]) {
        const { raw } = parseBase64ImageInput(mdData[1]);
        if (raw && isPlausibleImageBase64(raw)) return raw;
      }
      const bareData = text.match(/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/i);
      if (bareData?.[1]) {
        const { raw } = parseBase64ImageInput(bareData[1]);
        if (raw && isPlausibleImageBase64(raw)) return raw;
      }
      // 纯裸 base64（无 data: 前缀）夹在文本里时少见，但若整段几乎全是 base64 也试一下
      const maybeB64 = text.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '').replace(/\s/g, '');
      if (maybeB64.length > 500 && isPlausibleImageBase64(maybeB64)) return maybeB64;

      const md = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
      if (md?.[1]) return fetchUrlAsBase64(md[1], signal, bearerToken);
      const bare = text.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?)/i);
      if (bare?.[1]) return fetchUrlAsBase64(bare[1], signal, bearerToken);
    }
    return null;
  };

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'object') continue;
    const content = (cand as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const hit = await pickFromPart(part as Record<string, unknown>);
      if (hit) return hit;
    }
  }

  const nestedUrl = extractFirstStringUrl(json);
  if (nestedUrl && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(nestedUrl)) {
    return fetchUrlAsBase64(nestedUrl, signal, bearerToken);
  }
  return null;
}

function formatGeminiNoImageError(json: unknown, label: string): string {
  const root = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const cand0 =
    Array.isArray(root.candidates) && root.candidates[0] && typeof root.candidates[0] === 'object'
      ? (root.candidates[0] as Record<string, unknown>)
      : null;
  const finish = cand0
    ? String(cand0.finishReason || cand0.finish_reason || '').trim()
    : '';
  const block =
    root.promptFeedback && typeof root.promptFeedback === 'object'
      ? String((root.promptFeedback as Record<string, unknown>).blockReason || '')
      : root.prompt_feedback && typeof root.prompt_feedback === 'object'
        ? String((root.prompt_feedback as Record<string, unknown>).block_reason || '')
        : '';
  const textBits: string[] = [];
  const parts =
    cand0 && cand0.content && typeof cand0.content === 'object'
      ? ((cand0.content as Record<string, unknown>).parts as unknown[])
      : [];
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p && typeof p === 'object' && typeof (p as Record<string, unknown>).text === 'string') {
        textBits.push(String((p as Record<string, unknown>).text).slice(0, 200));
      }
    }
  }
  const extras = [
    finish ? `finishReason=${finish}` : '',
    block ? `blockReason=${block}` : '',
    textBits.length ? `text=${textBits.join(' ').slice(0, 240)}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return extras
    ? `${label}响应中未找到图片数据（${extras}）`
    : `${label}响应中未找到图片数据`;
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
      raw = await fetchUrlAsBase64(trimmed, signal, apiKey);
      mime = sniffMimeFromBase64(raw);
    } else {
      const parsed = parseBase64ImageInput(img);
      raw = parsed.raw.replace(/\s/g, '');
      mime = parsed.mime || sniffMimeFromBase64(raw) || 'image/jpeg';
    }
    if (!raw) continue;
    imageParts.push({ inlineData: { data: raw, mimeType: mime } });
  }
  if (!imageParts.length) throw new Error('图生图需要至少一张有效参考图。');

  for (let i = 0; i < count; i++) {
    assertNotAborted(signal);

    // 多数 Gemini 图像模型不支持仅 IMAGE；需 TEXT+IMAGE
    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [
            ...imageParts,
            {
              text: `[图片比例 ${aspectRatio}] ${prompt}\n请直接输出编辑后的图片，不要只返回文字说明。`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: manxueResolution(nodeResolution) === '4K' ? '4K' : '2K',
        },
      },
    };

    const url = `${base}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await manxueFetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      '满 eAPI Gemini 图生图',
      signal
    );

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`满 eAPI Gemini 图生图响应不是 JSON: ${text.slice(0, 500)}`);
    }

    const errMsg =
      json && typeof json === 'object'
        ? (json as { error?: { message?: string } }).error?.message
        : undefined;
    if (errMsg) throw new Error(`满 eAPI Gemini: ${errMsg}`);

    const b64 = await extractGeminiImageBase64FromResponse(json, signal, apiKey);
    if (!b64) {
      throw new Error(formatGeminiNoImageError(json, '满 eAPI Gemini 图生图'));
    }
    out.push(b64);
  }

  return out;
}

/** 判断是否为满 eAPI 图像模型 */
function isManxueImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'gpt-image-2-pro-manxue' ||
    m === 'gpt-image-2-4k-manxue' ||
    m === 'gpt-image-2-manxue' ||
    m === 'gemini-3-pro-image-preview-manxue' ||
    m === 'gemini-3-pro-image-preview-2k-manxue' ||
    m === 'gemini-3-pro-image-preview-4k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-manxue' ||
    m === 'gemini-3.1-flash-image-preview-2k-manxue' ||
    m === 'gemini-3.1-flash-image-preview-4k-manxue'
  );
}

function resolveChatModelForBase(baseNormalized: string, modelName: string): string {
  const m = (modelName || '').trim();
  /** 画布对话节点 id，上游 OpenAI 兼容 model 字段 */
  if (m === 'gpt-5.5-codesonline') return 'gpt-5.5';
  if (m === 'gpt-5.6-sol-codesonline') return 'gpt-5.6-sol';
  if (m === 'gpt-5.6-terra-codesonline') return 'gpt-5.6-terra';
  if (m === 'claude-haiku-4-5-codesonline') return 'claude-haiku-4-5';
  if (m === 'gpt-5.6-terra-hfsy') return 'gpt-5.6-terra';
  if (m === 'grok-4.6-hfsy') return 'grok-4.6';
  if (m === 'gpt-5.5-manxue') return 'gpt-5.5';
  if (m === 'deepseek-v4-flash-manxue') return 'deepseek-v4-flash';
  if (m === 'deepseek-v4-pro-manxue') return 'deepseek-v4-pro';
  if (m === 'glm-5.3-flash-toapis') return 'glm-5.3-flash';
  if (m === 'grok-4.6-toapis') return 'grok-4.6';
  if (m === 'gpt-5.4-mini-toapis') return 'gpt-5.4-mini';
  if (m === 'qwen3.5-flash-toapis') return 'qwen3.5-flash';
  if (m === 'gpt-5.6-terra-toapis') return 'gpt-5.6-terra';
  if (m === 'claude-haiku-4-5-toapis') return 'claude-haiku-4-5';
  if (m === 'gemini-3.6-flash-toapis') return 'gemini-3.6-flash';
  if (m === 'qwen3.5-plus-toapis') return 'qwen3.5-plus';
  if (m === 'deepseek-v4-flash-toapis') return 'deepseek-v4-flash';
  if (m === 'glm-5.3-flash' || m === 'glm-5.3' || m.startsWith('glm-')) return m;
  if (m === 'kimi-k2.7-code' || m.startsWith('kimi-')) return m;
  if (m.startsWith('doubao-')) return m;
  if (m === 'claude-sonnet-4-6' || m.startsWith('claude-')) return m;
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
  if (m.startsWith('grok-')) return m;
  if (m.startsWith('qwen')) return m;
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
  const fetchBase = rewriteRemoteOpenAiCompatBaseForBrowserCors(base);
  const ark = isVolcengineArkFetchBase(fetchBase) || isVolcengineArkFetchBase(base);
  const aliyun = isAliyunMaasFetchBase(fetchBase) || isAliyunMaasFetchBase(base);
  const key = ark || aliyun
    ? apiKey.trim().replace(/^Bearer\s+/i, '').trim().replace(/^["'`]+|["'`]+$/g, '')
    : apiKey.trim();
  if (!key && !ark && !aliyun) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ark) {
    if (key) {
      headers['x-volcengine-ark-key'] = key;
      headers.Authorization = `Bearer ${key}`;
    }
  } else if (aliyun) {
    if (key) {
      headers['x-aliyun-maas-key'] = key;
      headers.Authorization = `Bearer ${key}`;
    }
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(`${fetchBase}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `兼容接口错误 (${res.status}): ${text.slice(0, 800)}${openAiCompatFailureHint(res.status, 'generations-json', fetchBase)}`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`兼容接口返回的 JSON 不完整 (${res.status}): ${text.slice(0, 240)}`);
  }
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
    try {
      const host = new URL(s).hostname.toLowerCase();
      if (host === 'oss-us.file-download.life' || host.endsWith('.oss-us.file-download.life')) {
        return s;
      }
    } catch {
      /* fall through */
    }
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

async function extractAliyunImageUrls(json: unknown): Promise<string[]> {
  if (!json || typeof json !== 'object') throw new Error('阿里云生图未返回 JSON');
  const o = json as Record<string, unknown>;
  if (typeof o.code === 'string' && o.code) {
    throw new Error(`阿里云生图失败: ${o.code} ${String(o.message || '')}`.trim());
  }
  const urls: string[] = [];
  const output = o.output;
  if (output && typeof output === 'object') {
    const choices = (output as Record<string, unknown>).choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        if (!choice || typeof choice !== 'object') continue;
        const msg = (choice as Record<string, unknown>).message;
        if (!msg || typeof msg !== 'object') continue;
        const content = (msg as Record<string, unknown>).content;
        if (!Array.isArray(content)) continue;
        for (const part of content) {
          if (part && typeof part === 'object' && typeof (part as { image?: unknown }).image === 'string') {
            const img = String((part as { image: string }).image).trim();
            if (img) urls.push(img);
          }
        }
      }
    }
  }
  if (!urls.length) {
    throw new Error(`阿里云生图未返回图像 URL: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return urls;
}

async function aliyunMaasImageGenerate(
  prompt: string,
  aspectRatio: string,
  numberOfImages: number,
  nodeResolution: string | undefined,
  refBase64s: string[] | undefined,
  canvasModelId: string,
  signal?: AbortSignal
): Promise<string[]> {
  const apiKey = getAliyunMaasSavedKey().trim();
  if (!apiKey) {
    throw new Error('未配置阿里云百炼 API Key。请在「设置 → API → 阿里云百炼」填写并保存。');
  }
  const url = aliyunMaasMultimodalFetchUrl();
  const size = aliyunZImageSize(aspectRatio, nodeResolution);
  const upstream = resolveAliyunMaasImageUpstreamModelId(canvasModelId);
  const isQwen = upstream === 'qwen-image-3.0-pro';
  const text = (prompt || '').slice(0, isQwen ? 4000 : 800);
  const refs = (refBase64s || []).filter(Boolean).slice(0, isQwen ? 3 : 1);
  const content: Array<Record<string, string>> = [];
  for (const b64 of refs) {
    const raw = b64.replace(/^data:image\/\w+;base64,/i, '');
    content.push({ image: `data:image/jpeg;base64,${raw}` });
  }
  content.push({ text });
  const label = isQwen ? 'Qwen-Image-3.0-Pro' : 'Z-Image-Turbo';

  const postOnce = async (n: number): Promise<string[]> => {
    const parameters: Record<string, unknown> = { prompt_extend: false, size };
    if (isQwen) parameters.n = n;
    const body = {
      model: upstream,
      input: { messages: [{ role: 'user', content }] },
      parameters,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'x-aliyun-maas-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
    const rawText = await res.text();
    if (!res.ok) {
      const hint =
        !isQwen && refs.length && /InvalidParameter|仅.*text|only one text/i.test(rawText)
          ? ' Z-Image-Turbo 官方接口文生图仅允许一条 text；图生图请改用 Qwen-Image-3.0-Pro 或其他模型。'
          : '';
      throw new Error(`阿里云 ${label} 错误 (${res.status}): ${rawText.slice(0, 800)}${hint}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(`阿里云生图响应不是 JSON: ${rawText.slice(0, 300)}`);
    }
    const imageUrls = await extractAliyunImageUrls(json);
    const out: string[] = [];
    for (const imageUrl of imageUrls) {
      out.push(await fetchUrlAsBase64(imageUrl, signal));
    }
    return out;
  };

  if (isQwen) {
    return postOnce(Math.max(1, Math.min(6, numberOfImages || 1)));
  }
  const n = Math.max(1, Math.min(4, numberOfImages || 1));
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(...(await postOnce(1)));
  }
  return out;
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
    return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, 'gpt-image-2-codesonline', nodeResolution, quality, signal, onStatus);
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

  if (isHfsyImageModel(rawModel)) {
    return hfsyGenerateNewImage(
      prompt,
      aspectRatio,
      numberOfImages,
      rawModel,
      nodeResolution,
      quality,
      signal
    );
  }

  if (isAliyunMaasImageModel(rawModel)) {
    return aliyunMaasImageGenerate(prompt, aspectRatio, numberOfImages, nodeResolution, undefined, rawModel, signal);
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
    return toApisGenerateNewImage(prompt, aspectRatio, numberOfImages, modelName, nodeResolution, quality, signal);
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
    return openAiEditImage(base64Images, prompt, numberOfImages, 'gpt-image-2-codesonline', aspectRatio, nodeResolution, quality, pixelSize, signal, onStatus);
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

  if (isHfsyImageModel(rawModel)) {
    return hfsyEditImage(
      base64Images,
      prompt,
      numberOfImages,
      rawModel,
      aspectRatio,
      nodeResolution,
      quality,
      pixelSize,
      signal
    );
  }

  if (isAliyunMaasImageModel(rawModel)) {
    return aliyunMaasImageGenerate(prompt, aspectRatio, numberOfImages, nodeResolution, base64Images, rawModel, signal);
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
    return toApisEditImage(base64Images, toApisPrompt, numberOfImages, modelName, aspectRatio, nodeResolution, quality, signal);
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

type OpenAiChatMessage = {
  role: 'assistant' | 'system' | 'user';
  content:
    | string
    | Array<{ type: 'image_url'; image_url: { url: string } } | { type: 'text'; text: string }>;
};

function turnsToOpenAiChatMessages(turns: ChatCompletionHistoryTurn[]): OpenAiChatMessage[] {
  return turns.map((turn) => {
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
      return { role: 'user' as const, content: parts };
    }
    return { role: 'user' as const, content: turn.content };
  });
}

function stringifyChatMessageContent(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text || '');
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

function extractTextFromOpenAiChatJson(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const message = (json as { choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[] }).choices?.[0]
    ?.message;
  return stringifyChatMessageContent(message?.content) || stringifyChatMessageContent(message?.reasoning_content);
}

function extractTextFromResponsesJson(json: unknown): string {
  const fromChat = extractTextFromOpenAiChatJson(json);
  if (fromChat) return fromChat;
  if (!json || typeof json !== 'object') return '';
  const rec = json as Record<string, unknown>;
  if (typeof rec.output_text === 'string' && rec.output_text.trim()) return rec.output_text.trim();
  const chunks: string[] = [];
  const output = rec.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      if (typeof it.text === 'string') chunks.push(it.text);
      if (Array.isArray(it.content)) {
        for (const c of it.content) {
          if (!c || typeof c !== 'object') continue;
          const cr = c as Record<string, unknown>;
          if (typeof cr.text === 'string') chunks.push(cr.text);
        }
      }
    }
  }
  return chunks.join('').trim();
}

function chatMessagesToResponsesInput(messages: OpenAiChatMessage[]): unknown {
  const nonSystem = messages.filter((m) => m.role !== 'system');
  if (nonSystem.length === 1 && nonSystem[0].role === 'user' && typeof nonSystem[0].content === 'string') {
    return nonSystem[0].content;
  }
  return nonSystem.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    const content = m.content.map((p) => {
      if (p.type === 'text') return { type: 'input_text', text: p.text };
      return { type: 'input_image', image_url: p.image_url.url };
    });
    return { role: m.role, content };
  });
}

/**
 * 满 e GPT / Claude 对话：优先 /v1/responses（GPT-5.4 等常只挂在 Responses 渠道），
 * 失败再回退 /v1/chat/completions。
 */
export async function manxueOpenAiCompatibleChatHistory(
  turns: ChatCompletionHistoryTurn[],
  upstreamModel: string
): Promise<string> {
  const apiKey = getManxueSavedKey().trim();
  if (!apiKey) throw new Error('未配置满 eAPI Key，请在「设置 → API」中填写「满 e API Key」。');
  if (!turns.length) throw new Error('对话内容为空。');
  const base = manxueFetchBase();
  const model = (upstreamModel || '').trim();
  const messages = turnsToOpenAiChatMessages(turns);
  const instructions = turns
    .filter((t) => t.role === 'system' && t.content.trim())
    .map((t) => t.content.trim())
    .join('\n\n');
  const errors: string[] = [];

  const tryPost = async (
    path: string,
    body: Record<string, unknown>,
    parse: (json: unknown) => string
  ): Promise<string | null> => {
    try {
      const json = await postJsonAtBase(base, path, body, apiKey);
      const text = parse(json);
      if (text) return text;
      errors.push(`${path} model=${String(body.model)}：未返回文本`);
    } catch (e) {
      errors.push(`${path} model=${String(body.model)}：${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  };

  const responsesBodies: Record<string, unknown>[] = [
    {
      model,
      ...(instructions ? { instructions } : {}),
      input: chatMessagesToResponsesInput(messages),
    },
    { model, messages },
  ];
  if (model === 'gpt-5.6-luna') {
    responsesBodies.push({
      model: 'gpt-5.6-luna-max',
      ...(instructions ? { instructions } : {}),
      input: chatMessagesToResponsesInput(messages),
    });
  }

  for (const body of responsesBodies) {
    const text = await tryPost('/responses', body, extractTextFromResponsesJson);
    if (text) return text;
  }

  const chatAttempts: Record<string, unknown>[] = [{ model, messages }];
  if (model === 'claude-sonnet-4-6-thinking') {
    chatAttempts.push({
      model: 'claude-sonnet-4-6',
      messages,
      thinking: { type: 'adaptive' },
    });
  }
  if (model === 'gpt-5.6-luna') {
    chatAttempts.push({ model: 'gpt-5.6-luna-max', messages });
  }
  for (const body of chatAttempts) {
    const text = await tryPost('/chat/completions', body, extractTextFromOpenAiChatJson);
    if (text) return text;
  }

  throw new Error(`满 e 对话失败（${model}）。${errors.join(' | ')}`);
}

export async function chatCompletionHistoryAtBase(
  baseUrlRaw: string,
  apiKey: string,
  modelName: string,
  turns: ChatCompletionHistoryTurn[]
): Promise<string> {
  const key = apiKey.trim();
  const isArk = /volcengine-ark/i.test(baseUrlRaw);
  const isAliyun = /aliyun-maas/i.test(baseUrlRaw);
  if (!key && !isArk && !isAliyun) throw new Error('未配置对话 API Key。');
  if (!turns.length) throw new Error('对话内容为空。');
  const base = normalizeBaseUrl(baseUrlRaw);
  const model = resolveChatModelForBase(base, modelName);
  const messages = turnsToOpenAiChatMessages(turns);

  const json = await postJsonAtBase<{
    choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[];
  }>(
    base,
    '/chat/completions',
    {
      model,
      messages,
    },
    key
  );
  const out = extractTextFromOpenAiChatJson(json);
  if (!out) throw new Error('对话接口未返回文本内容。');
  return out;
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
