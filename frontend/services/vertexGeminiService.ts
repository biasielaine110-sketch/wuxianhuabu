import type { ChatCompletionOptions, ChatCompletionResult, ChatCompletionTurn } from './chatCompletionTypes';
import { isVertexGeminiImageModel, resolveVertexGeminiApiModelId } from './vertexGeminiModelUtils';

const DEFAULT_VERTEX_PROJECT = 'project-59d87bf6-dd18-4439-ab6';
const DEFAULT_VERTEX_LOCATION = 'us-central1';
const DEFAULT_PROXY_HEADER = 'Ea4-HmKSQpKIWcUwr400DRi9oZ2yr7Cy';

function getBackendOrigin(): string {
  const fromEnv = import.meta.env.VITE_BACKEND_ORIGIN;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, '');
  }
  // 生产/Vercel：同源 /api-proxy（Serverless）；开发：Vite 代理至本地 backend
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  throw new Error(
    'GCP Vertex 代理不可用：请在浏览器中打开应用，或设置 VITE_BACKEND_ORIGIN 指向 Node 后端。'
  );
}

function getProxyHeader(): string {
  const h = import.meta.env.VITE_PROXY_HEADER;
  return (typeof h === 'string' && h.trim()) || DEFAULT_PROXY_HEADER;
}

/** 供错误提示展示 */
export function getVertexProject(): string {
  const fromEnv = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT;
  return (typeof fromEnv === 'string' && fromEnv.trim()) || DEFAULT_VERTEX_PROJECT;
}

export function getVertexLocation(): string {
  const fromEnv = import.meta.env.VITE_GOOGLE_CLOUD_LOCATION;
  return (typeof fromEnv === 'string' && fromEnv.trim()) || DEFAULT_VERTEX_LOCATION;
}

function vertexImageSize(resolution?: string): '0.5K' | '1K' | '2K' | '4K' {
  const r = (resolution || '2k').toLowerCase().trim();
  if (r === '0.5k') return '0.5K';
  if (r === '1k') return '1K';
  if (r === '4k') return '4K';
  return '2K';
}

type VertexGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }>;
    };
  }>;
  error?: { message?: string };
};

/**
 * 浏览器内不经过 @google/genai（Vertex 模式会要求 API Key），
 * 直接调本地 Node /api-proxy，由服务账号 JSON 在后端鉴权。
 */
async function vertexGenerateContent(
  modelName: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<VertexGenerateContentResponse> {
  const apiModel = resolveVertexGeminiApiModelId(modelName);
  const originalUrl = `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${encodeURIComponent(apiModel)}:generateContent`;
  const payload = JSON.stringify(body);

  const res = await fetch(`${getBackendOrigin()}/api-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Proxy': getProxyHeader(),
    },
    body: JSON.stringify({
      originalUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }),
    signal,
  });

  const text = await res.text();
  let json: VertexGenerateContentResponse;
  try {
    json = JSON.parse(text) as VertexGenerateContentResponse;
  } catch {
    throw new Error(`GCP Vertex 代理响应解析失败 (${res.status}): ${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    const errObj = json as {
      error?: string | { message?: string; code?: number; status?: string };
      message?: string;
    };
    const vertexErr =
      typeof errObj.error === 'object' && errObj.error !== null ? errObj.error : undefined;
    const nestedMsg =
      vertexErr?.message ||
      (typeof errObj.error === 'string' ? errObj.error : undefined);
    const msg = nestedMsg || errObj.message || text.slice(0, 400);
    const isPermission =
      res.status === 403 ||
      vertexErr?.status === 'PERMISSION_DENIED' ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('Permission');
    if (res.status === 503 || msg.includes('oauth2.googleapis.com') || msg.includes('ETIMEDOUT')) {
      const hint =
        typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
          ? '请确认 Vercel 已配置 GOOGLE_SERVICE_ACCOUNT_JSON 并完成 Redeploy。'
          : '请确认 backend/.env.local 已设 HTTPS_PROXY 且代理在运行，然后重启 npm run dev-backend。';
      throw new Error(`GCP Vertex 网络不可达：${hint} 详情：${msg.slice(0, 200)}`);
    }
    if (isPermission) {
      throw new Error(
        `GCP Vertex 权限不足：请为服务账号 601216833168-compute@developer.gserviceaccount.com 添加「Vertex AI User」角色，并启用 Vertex AI API。详情：${msg.slice(0, 280)}`
      );
    }
    if (res.status === 429 || vertexErr?.status === 'RESOURCE_EXHAUSTED' || msg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('GCP Vertex 配额已用尽或请求过于频繁，请稍后再试。');
    }
    if (msg.includes('not supported by this model')) {
      throw new Error(`GCP Vertex 模型不支持当前请求格式：${msg.slice(0, 200)}`);
    }
    throw new Error(`GCP Vertex 请求失败 (${res.status}): ${msg}`);
  }

  return json;
}

function extractAllImagesFromResponse(response: VertexGenerateContentResponse): string[] {
  const parts = response.candidates?.[0]?.content?.parts || [];
  const out: string[] = [];
  for (const part of parts) {
    if (part.inlineData?.data) out.push(part.inlineData.data);
  }
  return out;
}

function extractTextFromResponse(response: VertexGenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => p.text).map((p) => p.text!).join('');
}

function buildImageGenerationBody(
  prompt: string,
  aspectRatio: string,
  outputResolution?: string,
  imageParts?: Array<{ inlineData: { data: string; mimeType: string } }>
): Record<string, unknown> {
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (imageParts?.length) parts.push(...imageParts);
  parts.push({ text: `[图片比例 ${aspectRatio}] ${prompt}` });

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize: vertexImageSize(outputResolution),
      },
    },
  };
}

/** GCP Vertex 文生图 */
export async function vertexGenerateNewImage(
  prompt: string,
  aspectRatio: string = '16:9',
  numberOfImages: number = 1,
  modelName: string,
  outputResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!isVertexGeminiImageModel(modelName)) {
    throw new Error(`非 GCP Vertex 图像模型：${modelName}`);
  }

  const apiModel = resolveVertexGeminiApiModelId(modelName);
  const count = Math.min(Math.max(numberOfImages, 1), 8);
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const response = await vertexGenerateContent(
      modelName,
      buildImageGenerationBody(prompt, aspectRatio, outputResolution),
      signal
    );

    const b64 = extractAllImagesFromResponse(response)[0];
    if (!b64) {
      throw new Error(`GCP Vertex 模型 ${apiModel} 未返回图片，请检查后端凭证与项目权限。`);
    }
    out.push(b64);
  }

  return out;
}

/** GCP Vertex 图生图 */
export async function vertexEditExistingImage(
  base64Images: string[],
  prompt: string,
  numberOfImages: number = 1,
  modelName: string,
  aspectRatio: string = '16:9',
  outputResolution?: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!isVertexGeminiImageModel(modelName)) {
    throw new Error(`非 GCP Vertex 图像模型：${modelName}`);
  }
  if (!base64Images.length) throw new Error('图生图需要至少一张参考图。');

  const apiModel = resolveVertexGeminiApiModelId(modelName);
  const count = Math.min(Math.max(numberOfImages, 1), 8);
  const out: string[] = [];

  const imageParts = base64Images.slice(0, 4).map((base64) => ({
    inlineData: {
      data: base64.replace(/^data:image\/\w+;base64,/, ''),
      mimeType: 'image/jpeg',
    },
  }));

  for (let i = 0; i < count; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const response = await vertexGenerateContent(
      modelName,
      buildImageGenerationBody(prompt, aspectRatio, outputResolution, imageParts),
      signal
    );

    const b64 = extractAllImagesFromResponse(response)[0];
    if (!b64) {
      throw new Error(`GCP Vertex 图生图未返回图片（${apiModel}）。`);
    }
    out.push(b64);
  }

  return out;
}

/** GCP Vertex 多轮对话：完整上下文，可在回复中直接返回图片 */
export async function vertexChatWithHistory(
  turns: ChatCompletionTurn[],
  modelName: string,
  opts?: { aspectRatio?: string; outputResolution?: string }
): Promise<ChatCompletionResult> {
  if (!isVertexGeminiImageModel(modelName)) {
    throw new Error(`非 GCP Vertex 对话模型：${modelName}`);
  }

  const contents = turns.map((t) => {
    if (t.role === 'assistant') {
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (t.content?.trim()) parts.push({ text: t.content });
      return { role: 'model', parts: parts.length ? parts : [{ text: '' }] };
    }
    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
    const imgs: string[] = [];
    if (t.imageBase64s?.length) imgs.push(...t.imageBase64s);
    if (t.imageBase64) imgs.push(t.imageBase64);
    for (const b64 of imgs) {
      parts.push({
        inlineData: {
          data: b64.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: 'image/jpeg',
        },
      });
    }
    parts.push({ text: t.content });
    return { role: 'user', parts };
  });

  const aspectRatio = opts?.aspectRatio || '16:9';
  const response = await vertexGenerateContent(modelName, {
    contents,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize: vertexImageSize(opts?.outputResolution),
      },
    },
  });

  const text = extractTextFromResponse(response);
  const images = extractAllImagesFromResponse(response);
  if (!text && images.length === 0) {
    throw new Error('GCP Vertex 模型未返回有效响应');
  }
  return {
    text: text || '已根据对话上下文生成图片。',
    images: images.length ? images : undefined,
  };
}
