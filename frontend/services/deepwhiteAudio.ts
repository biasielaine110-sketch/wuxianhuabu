/**
 * DeepWhite 音频：
 * - qwen3-tts-instruct-flash → POST /v1/audio/generations + GET /v1/audio/generations/{id}
 * - suno-generation → POST /v1/music/generations + GET /v1/music/tasks/{id}
 * 文档：https://api.deepwhiteai.com/docs
 */
import { getDeepWhiteSavedKey } from './aiSettings';

export const DEEPWHITE_AUDIO_TTS_UI_ID = 'qwen3-tts-instruct-flash-deepwhite';
export const DEEPWHITE_AUDIO_SUNO_UI_ID = 'suno-generation-deepwhite';

export const DEEPWHITE_QWEN_TTS_VOICES = [
  { id: 'Cherry', label: 'Cherry（女声）' },
  { id: 'Serena', label: 'Serena（女声）' },
  { id: 'Ethan', label: 'Ethan（男声）' },
  { id: 'Chelsie', label: 'Chelsie（女声）' },
  { id: 'Dylan', label: 'Dylan（男声）' },
  { id: 'Jada', label: 'Jada（女声）' },
  { id: 'Sunny', label: 'Sunny（女声）' },
] as const;

export type DeepWhiteAudioGenerateParams = {
  model: string;
  prompt: string;
  /** Qwen TTS 音色 */
  voice?: string;
  /** Qwen TTS instruct 风格说明 */
  instructions?: string;
  /** Suno 版本 */
  sunoVersion?: string;
  /** Suno：true=自定义歌词；false=灵感模式 */
  sunoCustom?: boolean;
  /** Suno 纯伴奏 */
  sunoInstrumental?: boolean;
  sunoTitle?: string;
  sunoStyle?: string;
  signal?: AbortSignal;
};

export type DeepWhiteAudioGenerateResult = {
  audioUrl: string;
  /** 额外音轨（Suno 常返回 2 轨） */
  audioUrls?: string[];
  title?: string;
  duration?: number;
};

function deepWhiteApiBase(): string {
  // 生产走 /deepwhite-api → Serverless /api/deepwhite-proxy（缓冲 POST body）
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

const SUNO_VERSIONS = ['v3.5', 'v4', 'v4.5', 'v4.5+', 'v4.5-all', 'v5', 'v5.5'] as const;

function normalizeSunoVersion(raw?: string): (typeof SUNO_VERSIONS)[number] {
  const v = (raw || '').trim();
  if ((SUNO_VERSIONS as readonly string[]).includes(v)) return v as (typeof SUNO_VERSIONS)[number];
  // 兼容常见别名
  if (v === 'v4.5plus' || v === 'v4.5-plus') return 'v4.5+';
  if (v === 'v4.5all' || v === 'v4.5_all') return 'v4.5-all';
  return 'v3.5';
}

export function isDeepWhiteAudioModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === DEEPWHITE_AUDIO_TTS_UI_ID || m === DEEPWHITE_AUDIO_SUNO_UI_ID || m === 'qwen3-tts-instruct-flash' || m === 'suno-generation';
}

export function resolveDeepWhiteAudioUpstreamModelId(modelName: string): 'qwen3-tts-instruct-flash' | 'suno-generation' {
  const m = (modelName || '').trim();
  if (m === DEEPWHITE_AUDIO_SUNO_UI_ID || m === 'suno-generation') return 'suno-generation';
  return 'qwen3-tts-instruct-flash';
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
    let detail = formatUpstreamError(json, text, res.status);
    if (res.status === 400 && path.includes('/music/')) {
      detail +=
        '。Suno 提交体需含 version（如 v3.5）与 prompt；自定义模式还须 title、style。可先用灵感模式 + v3.5 试一次。';
    }
    throw new Error(`DeepWhite 音频提交失败 (${res.status}): ${detail}`);
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
    throw new Error(`DeepWhite 音频查询失败 (${res.status}): ${formatUpstreamError(json, text, res.status)}`);
  }
  return json;
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

function pickAudioResultUrl(json: unknown): { url: string; urls: string[]; title?: string; duration?: number } {
  const root = json as Record<string, unknown>;
  const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const nested = (data?.data && typeof data.data === 'object' ? data.data : null) as Record<string, unknown> | null;
  const content = (nested?.content || data?.content) as Record<string, unknown> | undefined;
  const result = (data?.result && typeof data.result === 'object' ? data.result : null) as Record<
    string,
    unknown
  > | null;

  const urls: string[] = [];
  const push = (u: unknown) => {
    const s = typeof u === 'string' ? u.trim() : '';
    if (!s || urls.includes(s)) return;
    // 允许 https 直链；也允许 data:audio 内嵌
    if (/^https?:\/\//i.test(s) || /^data:audio\//i.test(s)) urls.push(s);
  };

  push(data?.result_url);
  push(nested?.result_url);
  push(content?.audio_url);
  push(content?.url);
  push(data?.audio_url);
  push(data?.url);
  if (Array.isArray(content?.audio_urls)) content.audio_urls.forEach(push);
  if (Array.isArray(data?.audio_urls)) data.audio_urls.forEach(push);

  const music = result?.music;
  let title: string | undefined;
  let duration: number | undefined;
  if (Array.isArray(music)) {
    for (const item of music) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      push(row.audio_url);
      if (!title && typeof row.title === 'string') title = row.title;
      if (duration == null && typeof row.duration === 'number') duration = row.duration;
    }
  }

  if (!urls.length) throw new Error('DeepWhite 任务成功但未返回音频 URL。');
  return { url: urls[0], urls, title, duration };
}

function isAudioTaskSuccess(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'COMPLETED' || s === 'COMPLETE';
}

function isAudioTaskFailure(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'FAILURE' || s === 'FAILED' || s === 'ERROR';
}

async function pollAudioGeneration(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ url: string; urls: string[]; title?: string; duration?: number }> {
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const json = await getJson(`/audio/generations/${encodeURIComponent(taskId)}`, apiKey, signal);
    const root = json as Record<string, unknown>;
    const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
    const status = String(data?.status || root?.status || '').trim();
    if (isAudioTaskSuccess(status)) return pickAudioResultUrl(json);
    if (isAudioTaskFailure(status)) {
      const reason =
        String(data?.fail_reason || (data?.error as { message?: string })?.message || root?.message || '').trim() ||
        status;
      throw new Error(`DeepWhite TTS 生成失败：${reason}`);
    }
    await sleep(3500, signal);
  }
  throw new Error('DeepWhite TTS 生成超时，请稍后在控制台查看任务状态。');
}

async function pollMusicTask(
  taskId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ url: string; urls: string[]; title?: string; duration?: number }> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const json = await getJson(`/music/tasks/${encodeURIComponent(taskId)}`, apiKey, signal);
    const root = json as Record<string, unknown>;
    const data = (root?.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
    const status = String(data?.status || root?.status || '').trim().toLowerCase();
    if (status === 'completed' || status === 'success' || status === 'succeeded') {
      return pickAudioResultUrl(json);
    }
    if (status === 'failed' || status === 'failure' || status === 'error') {
      const errObj = data?.error as { message?: string } | undefined;
      const reason = String(errObj?.message || data?.fail_reason || root?.message || '').trim() || status;
      throw new Error(`DeepWhite Suno 生成失败：${reason}`);
    }
    await sleep(4000, signal);
  }
  throw new Error('DeepWhite Suno 生成超时，请稍后在控制台查看任务状态。');
}

/** 从 Content-Type / URL / 魔数推断浏览器可播的 audio MIME */
function sniffAudioMime(blob: Blob, audioUrl: string): string {
  const ct = (blob.type || '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('audio/') && ct !== 'audio/octet-stream') return ct;
  const u = audioUrl.toLowerCase();
  if (u.includes('.mp3') || u.includes('mpeg')) return 'audio/mpeg';
  if (u.includes('.wav')) return 'audio/wav';
  if (u.includes('.ogg') || u.includes('opus')) return 'audio/ogg';
  if (u.includes('.m4a') || u.includes('.mp4') || u.includes('aac')) return 'audio/mp4';
  if (u.includes('.webm')) return 'audio/webm';
  // 默认按 mp3（Qwen TTS 我们显式请求 mp3）
  return 'audio/mpeg';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取音频失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 将结果音频拉成本地 data URL。
 * - 带 Bearer 拉取（部分 CDN 需鉴权）
 * - 纠正 MIME（octet-stream 会导致 audio 标签无法播放）
 * - 失败时退回原 URL（https 直链通常可直接播）
 */
export async function fetchAudioAsDataUrl(
  audioUrl: string,
  signal?: AbortSignal,
  apiKey?: string
): Promise<string> {
  const src = (audioUrl || '').trim();
  if (!src) return src;
  if (/^data:audio\//i.test(src)) return src;

  try {
    const headers: Record<string, string> = {};
    const key = (apiKey || getDeepWhiteSavedKey() || '').trim();
    if (key && /^https?:\/\//i.test(src)) {
      headers.Authorization = `Bearer ${key}`;
    }
    const res = await fetch(src, { mode: 'cors', credentials: 'omit', signal, headers });
    if (!res.ok) return src;
    const raw = await res.blob();
    if (!raw.size) return src;
    const mime = sniffAudioMime(raw, src);
    const typed = raw.type === mime ? raw : new Blob([raw], { type: mime });
    const dataUrl = await blobToDataUrl(typed);
    // 若 FileReader 仍写成非 audio MIME，强制改写 data: 头
    if (/^data:audio\//i.test(dataUrl)) return dataUrl;
    const comma = dataUrl.indexOf(',');
    if (comma > 0) return `data:${mime};base64,${dataUrl.slice(comma + 1)}`;
    return src;
  } catch {
    return src;
  }
}

export async function deepWhiteGenerateAudio(
  params: DeepWhiteAudioGenerateParams
): Promise<DeepWhiteAudioGenerateResult> {
  const apiKey = requireDeepWhiteKey();
  const upstream = resolveDeepWhiteAudioUpstreamModelId(params.model);
  const prompt = (params.prompt || '').trim();

  if (upstream === 'suno-generation') {
    const custom = params.sunoCustom === true;
    const instrumental = params.sunoInstrumental === true;
    const version = normalizeSunoVersion(params.sunoVersion);
    const title = (params.sunoTitle || '').trim();
    const style = (params.sunoStyle || '').trim();

    // 文档：custom=false 时 prompt 必填；custom=true 且非纯伴奏时 prompt 必填；缺字段直接 400
    if (!custom && !prompt) throw new Error('Suno 灵感模式请填写提示词（prompt）。');
    if (custom && !instrumental && !prompt) throw new Error('Suno 自定义模式请填写歌词（prompt）。');
    // 上游 Suno 自定义模式通常要求 title + style，缺了易 400
    if (custom && !title) throw new Error('Suno 自定义模式请填写曲名（title）。');
    if (custom && !style) throw new Error('Suno 自定义模式请填写风格（style）。');

    // 灵感模式只传必要字段（多余字段有的上游会 400）；与官方示例对齐
    const body: Record<string, unknown> = {
      model: 'suno',
      custom,
      version,
    };
    if (prompt) body.prompt = prompt;
    if (instrumental) body.instrumental = true;
    if (custom) {
      body.title = title;
      body.style = style;
    }

    const submitted = await postJson('/music/generations', body, apiKey, params.signal);
    const taskId = pickTaskId(submitted);
    const result = await pollMusicTask(taskId, apiKey, params.signal);
    return {
      audioUrl: result.url,
      audioUrls: result.urls,
      title: result.title,
      duration: result.duration,
    };
  }

  if (!prompt) throw new Error('请输入要朗读的文本。');

  const voice = (params.voice || 'Cherry').trim() || 'Cherry';
  const metadata: Record<string, unknown> = {
    voice,
    // 浏览器 <audio> 对 mp3 兼容最好；默认 wav 易因 MIME 问题无法播放
    format: 'mp3',
  };
  if (params.instructions?.trim()) metadata.instructions = params.instructions.trim();

  const submitted = await postJson(
    '/audio/generations',
    {
      model: 'qwen3-tts-instruct-flash',
      prompt,
      metadata,
    },
    apiKey,
    params.signal
  );
  const taskId = pickTaskId(submitted);
  const result = await pollAudioGeneration(taskId, apiKey, params.signal);
  return {
    audioUrl: result.url,
    audioUrls: result.urls,
    title: result.title,
    duration: result.duration,
  };
}
