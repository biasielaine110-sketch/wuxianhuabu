/** 按需加载 AI 对话 prompt 模板（~800 行），避免打进首屏主包 */
let chatPresetsPromise: Promise<Record<string, string>> | null = null;

export function loadChatPromptPresets(): Promise<Record<string, string>> {
  if (!chatPresetsPromise) {
    chatPresetsPromise = import('./chatPromptTemplates').then((m) => m.INITIAL_CHAT_PROMPT_PRESETS);
  }
  return chatPresetsPromise;
}

/**
 * 直接拉取最新的 chatPromptTemplates 模块（绕过模块级 promise 缓存），
 * 用于：state 中尚未合并新键、且 promise 缓存也指向旧模块实例的 HMR 场景。
 * 生产环境（HMR 关闭）下与 loadChatPromptPresets 等价。
 */
export function getLatestChatPromptPresets(): Promise<Record<string, string>> {
  return import('./chatPromptTemplates').then((m) => m.INITIAL_CHAT_PROMPT_PRESETS);
}

// HMR：源文件更新时清掉模块级缓存，确保按钮能拾到新增的预设键
if (import.meta.hot) {
  import.meta.hot.accept('./chatPromptTemplates', () => {
    chatPresetsPromise = null;
  });
  import.meta.hot.dispose(() => {
    chatPresetsPromise = null;
  });
}
