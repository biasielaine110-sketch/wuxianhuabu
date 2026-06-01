export function nextChatMessageId(role: 'user' | 'assistant'): string {
  const timestamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${role}-${timestamp}`;
}
