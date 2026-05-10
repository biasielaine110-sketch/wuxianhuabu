import React, { useCallback, useMemo, useState } from 'react';

declare global {
  interface Window {
    /** 由 vite transformIndexHtml 在构建/开发时注入（见 vite.config.ts） */
    __INFINITE_AI_CANVAS_PW__?: string;
  }
}

function readConfiguredSitePassword(): string {
  if (typeof window !== 'undefined') {
    const w = window.__INFINITE_AI_CANVAS_PW__;
    if (typeof w === 'string' && w.trim() !== '') return w;
  }
  const raw = import.meta.env.VITE_SITE_PASSWORD;
  if (raw != null && String(raw).trim() !== '') return String(raw);
  return '';
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

/** 与密码文本绑定的轻量指纹（非密码学保密用途）；后台修改密码后指纹变化会要求重新登录 */
function sitePasswordFingerprint(pw: string): string {
  let h = 5381 >>> 0;
  for (let i = 0; i < pw.length; i += 1) {
    h = (((h << 5) + h) ^ pw.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

const LS_UNLOCK_UNTIL = 'wx-site-access-until';
const LS_PW_FP = 'wx-site-access-pw-fp';
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

function readStoredUnlockValid(requiredPassword: string): boolean {
  if (!requiredPassword) return true;
  try {
    const until = parseInt(localStorage.getItem(LS_UNLOCK_UNTIL) || '0', 10);
    const fp = localStorage.getItem(LS_PW_FP);
    if (!until || !fp || Date.now() > until) return false;
    if (fp !== sitePasswordFingerprint(requiredPassword)) return false;
    return true;
  } catch {
    return false;
  }
}

function persistUnlock(requiredPassword: string): void {
  try {
    localStorage.setItem(LS_UNLOCK_UNTIL, String(Date.now() + TWENTY_FOUR_H_MS));
    localStorage.setItem(LS_PW_FP, sitePasswordFingerprint(requiredPassword));
  } catch {
    /* ignore */
  }
}

/**
 * 站内访问门：仅在构建时配置了 VITE_SITE_PASSWORD 时显示。
 * 密码写入 Vercel 环境变量或 frontend/.env.local（勿提交）。
 * 验证通过后 24 小时内同一浏览器免输入；修改后台密码后指纹不匹配需重新验证。
 *
 * 注意：子应用始终在 DOM 中挂载，未通过验证时仅用全屏层盖住。
 */
export default function SiteAccessGate({ children }: { children: React.ReactNode }) {
  const required = useMemo(() => readConfiguredSitePassword().trim(), []);
  const [unlocked, setUnlocked] = useState(() => !required || readStoredUnlockValid(required));
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      const pass = input.trim();
      if (!required) {
        setUnlocked(true);
        return;
      }
      if (timingSafeEqualStr(pass, required)) {
        persistUnlock(required);
        setUnlocked(true);
        setInput('');
      } else {
        setError('密码错误');
      }
    },
    [input, required]
  );

  const locked = Boolean(required && !unlocked);

  return (
    <>
      <div
        style={locked ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
        aria-hidden={locked}
      >
        {children}
      </div>
      {locked ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0f0f0f] text-neutral-100 px-4"
          style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#333] bg-[#1a1a1a] p-8 shadow-2xl">
            <h1 className="text-lg font-semibold text-white mb-1">访问验证</h1>
            <p className="text-xs text-gray-500 mb-6">
              请输入站点密码。验证通过后 24 小时内本设备无需再次输入；若后台修改了密码，需重新验证。
            </p>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <input
                type="password"
                autoComplete="current-password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="密码"
                className="w-full rounded-lg border border-[#444] bg-[#121212] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-600"
              />
              {error ? <p className="text-xs text-red-400">{error}</p> : null}
              <button
                type="submit"
                className="rounded-lg bg-cyan-600 hover:bg-cyan-500 py-2.5 text-sm font-medium text-white transition-colors"
              >
                进入
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
