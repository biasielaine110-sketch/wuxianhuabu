/** 按需加载 AI 对话 prompt 模板（~800 行），避免打进首屏主包 */
let chatPresetsPromise: Promise<Record<string, string>> | null = null;

export function loadChatPromptPresets(): Promise<Record<string, string>> {
  if (!chatPresetsPromise) {
    chatPresetsPromise = import('./chatPromptTemplates').then((m) => m.INITIAL_CHAT_PROMPT_PRESETS);
  }
  return chatPresetsPromise;
}
