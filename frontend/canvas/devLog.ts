/** 仅开发环境输出，避免生产包刷屏 */
export function devLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.log(...args);
}

export function devWarn(...args: unknown[]) {
  if (import.meta.env.DEV) console.warn(...args);
}
