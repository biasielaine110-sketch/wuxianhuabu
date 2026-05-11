export type AiProvider = 'openai-compatible' | 'gemini';

const PROVIDER_KEY = 'ai-provider-v1';
const GEMINI_API_KEY_STORAGE_KEY = 'gemini-api-key-v1';
const OPENAI_API_KEY_STORAGE_KEY = 'openai-compatible-api-key-v1';
const OPENAI_BASE_URL_STORAGE_KEY = 'openai-compatible-base-url-v1';
const DEEPSEEK_API_KEY_STORAGE_KEY = 'deepseek-api-key-v1';
const DEEPSEEK_BASE_URL_STORAGE_KEY = 'deepseek-base-url-v1';
/** 君澜 AI OpenAI 兼容网关（与 ToAPIs / 主 OpenAI 兼容通道分离）：画布「GPT Image 2（君澜 AI）」与对话「GPT-5.5（君澜）」等 */
const JUNLAN_API_KEY_STORAGE_KEY = 'junlan-openai-compatible-api-key-v1';
const JUNLAN_BASE_URL_STORAGE_KEY = 'junlan-openai-compatible-base-url-v1';
/** 自建 [New API](https://docs.newapi.pro/zh/docs/api) OpenAI 兼容网关；与 ToAPIs / 君澜分离，用于 Firefly 画布图模型（*-newapi）及视频模型（*-newapi） */
const NEWAPI_API_KEY_STORAGE_KEY = 'newapi-openai-compatible-api-key-v1';
const NEWAPI_BASE_URL_STORAGE_KEY = 'newapi-openai-compatible-base-url-v1';
/** [codesonline 控制台](https://image.codesonline.dev/personal/docs) OpenAI 兼容图像网关；画布模型 id 为 `gpt-image-2-codesonline`，与 ToAPIs/君澜的 gpt-image-2 分流 */
const CODESONLINE_IMAGE_API_KEY_STORAGE_KEY = 'codesonline-image-openai-api-key-v1';
const CODESONLINE_IMAGE_BASE_URL_STORAGE_KEY = 'codesonline-image-openai-base-url-v1';

export const DEFAULT_OPENAI_BASE_URL = 'https://toapis.com/v1';
/** 文档：https://stsg17lkjz.apifox.cn/8682367m0 — Base URL 须含 /v1 */
export const DEFAULT_JUNLAN_BASE_URL = 'https://www.junlanai.com/v1';
/** DeepSeek 官方 OpenAI 兼容入口 */
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
/** 画布「AI 对话」默认 DeepSeek 模型（与 {@link DEFAULT_DEEPSEEK_BASE_URL} 配合；官方 ID：deepseek-v4-flash / deepseek-v4-pro） */
export const DEFAULT_DEEPSEEK_CHAT_MODEL_ID = 'deepseek-v4-flash';

/** 旧版存盘中的 model id → 当前官方命名（不在界面展示旧名） */
export function normalizeDeepSeekChatModelId(modelId: string): string {
  const m = (modelId || '').trim();
  if (m === 'deepseek-chat' || m === 'deepseek-reasoner') return DEFAULT_DEEPSEEK_CHAT_MODEL_ID;
  return m;
}

/** New API（Firefly *-newapi 画布模型）OpenAI 兼容根路径；含 /v1 */
export const DEFAULT_NEWAPI_BASE_URL = 'https://yunzhi-ai.top/v1';
/** codesonline 图像 API（OpenAI 兼容 /v1）；文档见控制台 */
export const DEFAULT_CODESONLINE_IMAGE_BASE_URL = 'https://image.codesonline.dev/v1';

let aiSettingsLegacyMigrated = false;

/**
 * 首次会话内执行一次：接口类型缺省或异常时固定为 OpenAI 兼容；
 * Base URL 未配置或仍为官方 OpenAI 默认时，写入 ToAPIs 默认网关。
 */
export function migrateAiSettingsIfLegacy(): void {
  if (aiSettingsLegacyMigrated) return;
  aiSettingsLegacyMigrated = true;
  try {
    const p = localStorage.getItem(PROVIDER_KEY);
    if (p !== 'gemini' && p !== 'openai-compatible') {
      localStorage.setItem(PROVIDER_KEY, 'openai-compatible');
    }
    const raw = localStorage.getItem(OPENAI_BASE_URL_STORAGE_KEY)?.trim() ?? '';
    if (!raw) {
      localStorage.setItem(OPENAI_BASE_URL_STORAGE_KEY, DEFAULT_OPENAI_BASE_URL);
    } else {
      const u = raw.replace(/\/+$/, '').toLowerCase();
      if (u === 'https://api.openai.com/v1' || u === 'http://api.openai.com/v1') {
        localStorage.setItem(OPENAI_BASE_URL_STORAGE_KEY, DEFAULT_OPENAI_BASE_URL);
      }
    }
    const naRaw = localStorage.getItem(NEWAPI_BASE_URL_STORAGE_KEY)?.trim() ?? '';
    if (!naRaw) {
      localStorage.setItem(NEWAPI_BASE_URL_STORAGE_KEY, DEFAULT_NEWAPI_BASE_URL);
    }
  } catch {
    /* ignore */
  }
}

export function getAiProvider(): AiProvider {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    if (v === 'gemini') return 'gemini';
    if (v === 'openai-compatible') return 'openai-compatible';
  } catch {
    /* ignore */
  }
  // 未选择过时默认 OpenAI 兼容（下拉列表亦置顶）
  return 'openai-compatible';
}

export function setAiProvider(provider: AiProvider): void {
  try {
    localStorage.setItem(PROVIDER_KEY, provider);
  } catch {
    /* ignore */
  }
}

export function getGeminiSavedKey(): string {
  try {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setGeminiKey(apiKey: string): void {
  const normalized = apiKey.trim();
  try {
    if (normalized) localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, normalized);
    else localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getOpenAiSavedKey(): string {
  try {
    return localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setOpenAiKey(apiKey: string): void {
  const normalized = apiKey.trim();
  try {
    if (normalized) localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, normalized);
    else localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getOpenAiBaseUrl(): string {
  try {
    const raw = localStorage.getItem(OPENAI_BASE_URL_STORAGE_KEY)?.trim();
    return raw || DEFAULT_OPENAI_BASE_URL;
  } catch {
    return DEFAULT_OPENAI_BASE_URL;
  }
}

/** 与 `getOpenAiBaseUrl` 相同，兼容部分 UI 的历史命名导入 */
export const getOpenAICompatBaseUrlForSettings = getOpenAiBaseUrl;

export function setOpenAiBaseUrl(url: string): void {
  const normalized = url.trim();
  try {
    if (normalized) localStorage.setItem(OPENAI_BASE_URL_STORAGE_KEY, normalized);
    else localStorage.removeItem(OPENAI_BASE_URL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getJunlanSavedKey(): string {
  try {
    return localStorage.getItem(JUNLAN_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setJunlanKey(apiKey: string): void {
  const normalized = apiKey.trim();
  try {
    if (normalized) localStorage.setItem(JUNLAN_API_KEY_STORAGE_KEY, normalized);
    else localStorage.removeItem(JUNLAN_API_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getJunlanBaseUrl(): string {
  try {
    const raw = localStorage.getItem(JUNLAN_BASE_URL_STORAGE_KEY)?.trim();
    return raw || DEFAULT_JUNLAN_BASE_URL;
  } catch {
    return DEFAULT_JUNLAN_BASE_URL;
  }
}

export function setJunlanBaseUrl(url: string): void {
  const normalized = url.trim();
  try {
    if (normalized) localStorage.setItem(JUNLAN_BASE_URL_STORAGE_KEY, normalized);
    else localStorage.removeItem(JUNLAN_BASE_URL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getNewApiSavedKey(): string {
  try {
    return localStorage.getItem(NEWAPI_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setNewApiKey(apiKey: string): void {
  const normalized = apiKey.trim();
  try {
    if (normalized) localStorage.setItem(NEWAPI_API_KEY_STORAGE_KEY, normalized);
    else localStorage.removeItem(NEWAPI_API_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 须为自建 New API 的 OpenAI 兼容根路径（含 /v1）；未配置时默认云智网关 */
export function getNewApiBaseUrl(): string {
  try {
    const raw = localStorage.getItem(NEWAPI_BASE_URL_STORAGE_KEY)?.trim();
    return raw || DEFAULT_NEWAPI_BASE_URL;
  } catch {
    return DEFAULT_NEWAPI_BASE_URL;
  }
}

export function setNewApiBaseUrl(url: string): void {
  const normalized = url.trim();
  try {
    if (normalized) localStorage.setItem(NEWAPI_BASE_URL_STORAGE_KEY, normalized);
    else localStorage.removeItem(NEWAPI_BASE_URL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getCodesonlineSavedKey(): string {
  try {
    return localStorage.getItem(CODESONLINE_IMAGE_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setCodesonlineKey(apiKey: string): void {
  const normalized = apiKey.trim();
  try {
    if (normalized) localStorage.setItem(CODESONLINE_IMAGE_API_KEY_STORAGE_KEY, normalized);
    else localStorage.removeItem(CODESONLINE_IMAGE_API_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getCodesonlineBaseUrl(): string {
  try {
    const raw = localStorage.getItem(CODESONLINE_IMAGE_BASE_URL_STORAGE_KEY)?.trim();
    return raw || DEFAULT_CODESONLINE_IMAGE_BASE_URL;
  } catch {
    return DEFAULT_CODESONLINE_IMAGE_BASE_URL;
  }
}

export function setCodesonlineBaseUrl(url: string): void {
  const normalized = url.trim();
  try {
    if (normalized) localStorage.setItem(CODESONLINE_IMAGE_BASE_URL_STORAGE_KEY, normalized);
    else localStorage.removeItem(CODESONLINE_IMAGE_BASE_URL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getDeepSeekSavedKey(): string {
  try {
    return localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setDeepSeekKey(apiKey: string): void {
  const normalized = apiKey.trim();
  try {
    if (normalized) localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, normalized);
    else localStorage.removeItem(DEEPSEEK_API_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getDeepSeekBaseUrl(): string {
  try {
    const raw = localStorage.getItem(DEEPSEEK_BASE_URL_STORAGE_KEY)?.trim();
    return raw || DEFAULT_DEEPSEEK_BASE_URL;
  } catch {
    return DEFAULT_DEEPSEEK_BASE_URL;
  }
}

export function setDeepSeekBaseUrl(url: string): void {
  const normalized = url.trim();
  try {
    if (normalized) localStorage.setItem(DEEPSEEK_BASE_URL_STORAGE_KEY, normalized);
    else localStorage.removeItem(DEEPSEEK_BASE_URL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type AiSettingsSnapshot = {
  provider: AiProvider;
  geminiKey: string;
  openAiKey: string;
  openAiBaseUrl: string;
  junlanKey: string;
  junlanBaseUrl: string;
  newApiKey: string;
  newApiBaseUrl: string;
  codesonlineKey: string;
  codesonlineBaseUrl: string;
  deepSeekKey: string;
  deepSeekBaseUrl: string;
};

export function getAiSettingsSnapshot(): AiSettingsSnapshot {
  return {
    provider: getAiProvider(),
    geminiKey: getGeminiSavedKey(),
    openAiKey: getOpenAiSavedKey(),
    openAiBaseUrl: getOpenAiBaseUrl(),
    junlanKey: getJunlanSavedKey(),
    junlanBaseUrl: getJunlanBaseUrl(),
    newApiKey: getNewApiSavedKey(),
    newApiBaseUrl: getNewApiBaseUrl(),
    codesonlineKey: getCodesonlineSavedKey(),
    codesonlineBaseUrl: getCodesonlineBaseUrl(),
    deepSeekKey: getDeepSeekSavedKey(),
    deepSeekBaseUrl: getDeepSeekBaseUrl(),
  };
}

export type PersistAiSettingsInput = {
  provider: AiProvider;
  /** 仅在选择 Gemini 时写入；不传则保留原值 */
  geminiApiKey?: string;
  /** 仅在选择 OpenAI 兼容时写入；不传则保留原值 */
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  /** 君澜 GPT Image 2 专用；不传则保留原值 */
  junlanApiKey?: string;
  junlanBaseUrl?: string;
  /** New API（Firefly 等）；不传则保留原值 */
  newApiApiKey?: string;
  newApiBaseUrl?: string;
  /** codesonline GPT Image 2 专用（画布 id：gpt-image-2-codesonline）；不传则保留原值 */
  codesonlineApiKey?: string;
  codesonlineBaseUrl?: string;
  /** DeepSeek 对话专用；不传则保留原值 */
  deepSeekApiKey?: string;
  deepSeekBaseUrl?: string;
};

export function persistAiSettings(opts: PersistAiSettingsInput): void {
  setAiProvider(opts.provider);
  if (opts.geminiApiKey !== undefined) setGeminiKey(opts.geminiApiKey);
  if (opts.openAiApiKey !== undefined) setOpenAiKey(opts.openAiApiKey);
  if (opts.openAiBaseUrl !== undefined) setOpenAiBaseUrl(opts.openAiBaseUrl);
  if (opts.junlanApiKey !== undefined) setJunlanKey(opts.junlanApiKey);
  if (opts.junlanBaseUrl !== undefined) setJunlanBaseUrl(opts.junlanBaseUrl);
  if (opts.newApiApiKey !== undefined) setNewApiKey(opts.newApiApiKey);
  if (opts.newApiBaseUrl !== undefined) setNewApiBaseUrl(opts.newApiBaseUrl);
  if (opts.codesonlineApiKey !== undefined) setCodesonlineKey(opts.codesonlineApiKey);
  if (opts.codesonlineBaseUrl !== undefined) setCodesonlineBaseUrl(opts.codesonlineBaseUrl);
  if (opts.deepSeekApiKey !== undefined) setDeepSeekKey(opts.deepSeekApiKey);
  if (opts.deepSeekBaseUrl !== undefined) setDeepSeekBaseUrl(opts.deepSeekBaseUrl);
}
