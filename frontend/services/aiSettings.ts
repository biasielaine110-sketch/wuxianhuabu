export type AiProvider = 'gemini' | 'openai-compatible';

const PROVIDER_KEY = 'ai-provider-v1';
const GEMINI_API_KEY_STORAGE_KEY = 'gemini-api-key-v1';
const OPENAI_API_KEY_STORAGE_KEY = 'openai-compatible-api-key-v1';
const OPENAI_BASE_URL_STORAGE_KEY = 'openai-compatible-base-url-v1';
const DEEPSEEK_API_KEY_STORAGE_KEY = 'deepseek-api-key-v1';
const DEEPSEEK_BASE_URL_STORAGE_KEY = 'deepseek-base-url-v1';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
/** DeepSeek 官方 OpenAI 兼容入口 */
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

export function getAiProvider(): AiProvider {
  try {
    if (localStorage.getItem(PROVIDER_KEY) === 'openai-compatible') return 'openai-compatible';
  } catch {
    /* ignore */
  }
  return 'gemini';
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
  deepSeekKey: string;
  deepSeekBaseUrl: string;
};

export function getAiSettingsSnapshot(): AiSettingsSnapshot {
  return {
    provider: getAiProvider(),
    geminiKey: getGeminiSavedKey(),
    openAiKey: getOpenAiSavedKey(),
    openAiBaseUrl: getOpenAiBaseUrl(),
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
  /** DeepSeek 对话专用；不传则保留原值 */
  deepSeekApiKey?: string;
  deepSeekBaseUrl?: string;
};

export function persistAiSettings(opts: PersistAiSettingsInput): void {
  setAiProvider(opts.provider);
  if (opts.geminiApiKey !== undefined) setGeminiKey(opts.geminiApiKey);
  if (opts.openAiApiKey !== undefined) setOpenAiKey(opts.openAiApiKey);
  if (opts.openAiBaseUrl !== undefined) setOpenAiBaseUrl(opts.openAiBaseUrl);
  if (opts.deepSeekApiKey !== undefined) setDeepSeekKey(opts.deepSeekApiKey);
  if (opts.deepSeekBaseUrl !== undefined) setDeepSeekBaseUrl(opts.deepSeekBaseUrl);
}
