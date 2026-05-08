import React, { useCallback, useState } from 'react';

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

/**
 * 站内访问门：仅在构建时配置了 VITE_SITE_PASSWORD 时显示。
 * 密码写入 Vercel 环境变量或 frontend/.env.local（勿提交），每次刷新页面都需重新输入。
 */
export default function SiteAccessGate({ children }: { children: React.ReactNode }) {
  const raw = import.meta.env.VITE_SITE_PASSWORD;
  const required = raw != null && String(raw).trim() !== '' ? String(raw) : '';

  const [unlocked, setUnlocked] = useState(() => !required.trim());
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      const pass = input.trim();
      if (!required.trim()) {
        setUnlocked(true);
        return;
      }
      if (timingSafeEqualStr(pass, required)) {
        setUnlocked(true);
        setInput('');
      } else {
        setError('密码错误');
      }
    },
    [input, required]
  );

  if (!required.trim() || unlocked) {
    return <>{children}</>;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0f0f0f] text-neutral-100 px-4"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#333] bg-[#1a1a1a] p-8 shadow-2xl">
        <h1 className="text-lg font-semibold text-white mb-1">访问验证</h1>
        <p className="text-xs text-gray-500 mb-6">请输入站点密码。刷新或重新打开页面后需再次输入。</p>
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
  );
}
