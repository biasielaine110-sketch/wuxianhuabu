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
  return '/deepwhite-api/v1';
}

function requireDeepWhiteKey(): string {
  const key = getDeepWhiteSavedKey().trim();
  if (!key) {
    throw new Error(
      '未配置 DeepWhite API Key。请在「设置 → API → DeepWhite」填写并保存（与对话共用）。'
    );
  }
  return key;
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
    const msg =
      (json as { error?: { message?: string }; message?: string })?.error?.message ||
      (json as { message?: string })?.message ||
      text.slice(0, 400) ||
      res.statusText;
    throw new Error(`DeepWhite 音频提交失败 (${res.status}): ${msg}`);
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
    const msg =
      (json as { error?: { message?: string }; message?: string })?.error?.message ||
      (json as { message?: string })?.message ||
      text.slice(0, 400) ||
      res.statusText;
    throw new Error(`DeepWhite 音频查询失败 (${res.status}): ${msg}`);
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
    if (s && /^https?:\/\//i.test(s) && !urls.includes(s)) urls.push(s);
  };

  push(data?.result_url);
  push(content?.audio_url);
  if (Array.isArray(content?.audio_urls)) content.audio_urls.forEach(push);

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

/** 将结果音频拉成本地 data URL（失败则退回原 URL） */
export async function fetchAudioAsDataUrl(audioUrl: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(audioUrl, { mode: 'cors', credentials: 'omit', signal });
    if (!res.ok) return audioUrl;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || audioUrl));
      reader.onerror = () => reject(new Error('读取音频失败'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return audioUrl;
  }
}

export async function deepWhiteGenerateAudio(
  params: DeepWhiteAudioGenerateParams
): Promise<DeepWhiteAudioGenerateResult> {
  const apiKey = requireDeepWhiteKey();
  const upstream = resolveDeepWhiteAudioUpstreamModelId(params.model);
  const prompt = (params.prompt || '').trim();
  if (!prompt) throw new Error('请输入提示词或歌词。');

  if (upstream === 'suno-generation') {
    const body: Record<string, unknown> = {
      model: 'suno',
      custom: Boolean(params.sunoCustom),
      version: (params.sunoVersion || 'v5').trim() || 'v5',
      prompt,
      instrumental: Boolean(params.sunoInstrumental),
    };
    if (params.sunoCustom) {
      if (params.sunoTitle?.trim()) body.title = params.sunoTitle.trim();
      if (params.sunoStyle?.trim()) body.style = params.sunoStyle.trim();
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

  const voice = (params.voice || 'Cherry').trim() || 'Cherry';
  const metadata: Record<string, unknown> = { voice };
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
