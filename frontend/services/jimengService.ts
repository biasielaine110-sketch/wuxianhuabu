/**
 * 即梦 CLI 全局服务
 * -----------------------
 * 提供：
 *   1. ensureJimengReady()       — 全局一次性登录（如未登录则弹窗扫码）
 *   2. jimengVideoGenerate()     — 调用即梦生成视频
 *   3. jimengImageGenerate()     — 调用即梦生成图片
 *   4. JimengLoginModal 组件      — 扫码登录弹窗（给 React 使用）
 */

const JIMENG_SERVER = 'http://localhost:3107';

// 全局缓存：是否已登录（单次会话内只弹一次）
let _jimengLoggedIn = false;
let _jimengLoginCheckPromise: Promise<boolean> | null = null;
let _jimengLoginModalResolve: (() => void) | null = null;

// ============================================================
//  健康检查
// ============================================================
export async function checkJimengHealth(): Promise<{ ok: boolean; version?: string; message?: string }> {
  try {
    const res = await fetch(`${JIMENG_SERVER}/api/jimeng/health`);
    return await res.json();
  } catch {
    return { ok: false, message: '无法连接即梦本地服务（http://localhost:3107），请确认 server/ 已启动。' };
  }
}

// ============================================================
//  检查本地服务是否存活
// ============================================================
async function serverAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${JIMENG_SERVER}/api/jimeng/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// ============================================================
//  全局登录保障：ensureJimengReady()
//  在生成视频/图片之前调用。
//  1. 如果会话内已确认登录 → 直接返回
//  2. 调用后端 /session 检查
//  3. 未登录 → 弹出登录 Modal（用户扫码）
//  4. 登录成功后 → 缓存状态，返回
// ============================================================
export async function ensureJimengReady(): Promise<void> {
  if (_jimengLoggedIn) return;

  // 检查服务存活
  const alive = await serverAlive();
  if (!alive) {
    throw new Error(
      '无法连接到即梦本地服务（http://localhost:3107）。\n\n' +
      '请先启动 server：\n' +
      '  cd server && npm install && npm start\n\n' +
      '确保 opencli（即梦 CLI）已安装。'
    );
  }

  if (_jimengLoginCheckPromise) {
    // 已有并发的检查在进行中
    const ok = await _jimengLoginCheckPromise;
    if (ok) return;
  }

  _jimengLoginCheckPromise = doCheckSession();
  try {
    const ok = await _jimengLoginCheckPromise;
    if (ok) {
      _jimengLoggedIn = true;
      return;
    }
  } finally {
    _jimengLoginCheckPromise = null;
  }

  // 未登录 → 弹出扫码窗口（等待用户扫码完成）
  await showLoginModal();

  _jimengLoggedIn = true;
}

async function doCheckSession(): Promise<boolean> {
  try {
    const res = await fetch(`${JIMENG_SERVER}/api/jimeng/session`);
    const data = await res.json();
    return data.loggedIn === true;
  } catch {
    return false;
  }
}

// ============================================================
//  弹出扫码登录 Modal（返回 Promise，登录成功后 resolve）
// ============================================================
function showLoginModal(): Promise<void> {
  return new Promise((resolve) => {
    _jimengLoginModalResolve = resolve;

    // 通知后端打开登录页
    fetch(`${JIMENG_SERVER}/api/jimeng/login/start`, { method: 'POST' }).catch(() => {});

    // 触发自定义事件，让 React 组件渲染登录弹窗
    window.dispatchEvent(
      new CustomEvent('jimeng:show-login', { detail: { resolve } })
    );
  });
}

/** 登录弹窗关闭/完成时由 React 组件调用 */
export function resolveJimengLogin(): void {
  if (_jimengLoginModalResolve) {
    _jimengLoginModalResolve();
    _jimengLoginModalResolve = null;
  }
}

// ============================================================
//  登录状态轮询（供 React 组件定时调用）
// ============================================================
let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function startLoginPolling(onLoggedIn: () => void): void {
  stopLoginPolling();
  _pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${JIMENG_SERVER}/api/jimeng/login/status`);
      const data = await res.json();
      if (data.loggedIn) {
        stopLoginPolling();
        onLoggedIn();
      }
    } catch {
      // ignore
    }
  }, 2000);
}

export function stopLoginPolling(): void {
  if (_pollTimer !== null) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

/** 登录截图 URL（含缓存破坏参数） */
export function loginScreenshotUrl(): string {
  return `${JIMENG_SERVER}/api/jimeng/login/screenshot?t=${Date.now()}`;
}

// ============================================================
//  视频生成
// ============================================================
export interface JimengVideoParams {
  prompt: string;
  model?: string;
  imageUrl?: string;
  duration?: number;
  ratio?: string;
  wait?: number;
}

export async function jimengVideoGenerate(params: JimengVideoParams): Promise<string> {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/video/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || '即梦视频生成失败');
  }
  return data.videoUrl;
}

// ============================================================
//  图片生成
// ============================================================
export interface JimengImageParams {
  prompt: string;
  model?: string;
  imageUrl?: string;
  ratio?: string;
  width?: number;
  height?: number;
  wait?: number;
}

export async function jimengImageGenerate(params: JimengImageParams): Promise<string> {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/image/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || '即梦图片生成失败');
  }
  return data.imageUrl;
}
