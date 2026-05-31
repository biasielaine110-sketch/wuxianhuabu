import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AUTH_INFO,
  JimengAuthContext,
  type JimengAuthContextValue,
  type JimengAuthInfo,
} from './jimengAuthContext';

const JimengAuthProviderLazy = lazy(() =>
  import('./JimengAuthProvider').then((m) => ({ default: m.JimengAuthProvider })),
);

let providerModulePromise: Promise<typeof import('./JimengAuthProvider')> | null = null;

function preloadJimengAuthProvider() {
  if (!providerModulePromise) {
    providerModulePromise = import('./JimengAuthProvider');
  }
  return providerModulePromise;
}

/** 首屏轻量 stub：仅 session 检测；完整 Provider 空闲时或首次调用时加载 */
function JimengAuthStubProvider(props: { children: React.ReactNode; onUpgrade: () => void }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<JimengAuthInfo>(DEFAULT_AUTH_INFO);
  const upgradingRef = useRef(false);

  const refreshAuthInfo = useCallback(async () => {
    try {
      const r = await fetch('/api/jimeng/session');
      const session = await r.json();
      if (session?.loggedIn) {
        const d = session.data || {};
        setAuthInfo({
          loggedIn: true,
          credit: d.total_credit ?? d.credit ?? d.credits ?? '?',
          vipLevel: d.vip_level || '',
          userName: d.user_name || '',
        });
      } else {
        setAuthInfo(DEFAULT_AUTH_INFO);
      }
    } catch {
      /* backend unavailable */
    }
  }, []);

  useEffect(() => {
    void refreshAuthInfo();
  }, [refreshAuthInfo]);

  const triggerUpgrade = useCallback(async () => {
    if (upgradingRef.current) return;
    upgradingRef.current = true;
    props.onUpgrade();
    await preloadJimengAuthProvider();
  }, [props]);

  const value = useMemo<JimengAuthContextValue>(
    () => ({
      loginOpen,
      authInfo,
      closeLogin: () => setLoginOpen(false),
      refreshAuthInfo,
      openLogin: async () => {
        await triggerUpgrade();
        setLoginOpen(true);
      },
      ensureJimengReady: async () => {
        await triggerUpgrade();
        throw new Error('即梦模块加载中，请稍后再试');
      },
      logout: async () => {
        await triggerUpgrade();
      },
      relogin: async () => {
        await triggerUpgrade();
      },
      installOpencli: async () => {
        await triggerUpgrade();
        return { ok: false, message: '即梦模块加载中' };
      },
      setupWSL: async () => {
        await triggerUpgrade();
        return { ok: false, message: '即梦模块加载中' };
      },
    }),
    [authInfo, loginOpen, refreshAuthInfo, triggerUpgrade],
  );

  return <JimengAuthContext.Provider value={value}>{props.children}</JimengAuthContext.Provider>;
}

export function JimengAuthRoot(props: { children: React.ReactNode }) {
  const [useFullProvider, setUseFullProvider] = useState(false);

  useEffect(() => {
    void import('../../styles/jimeng.css');
  }, []);

  useEffect(() => {
    const schedule = () => void preloadJimengAuthProvider().then(() => setUseFullProvider(true));
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(schedule, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(schedule, 2500);
    return () => window.clearTimeout(t);
  }, []);

  if (useFullProvider) {
    return (
      <Suspense
        fallback={
          <JimengAuthStubProvider onUpgrade={() => setUseFullProvider(true)}>
            {props.children}
          </JimengAuthStubProvider>
        }
      >
        <JimengAuthProviderLazy>{props.children}</JimengAuthProviderLazy>
      </Suspense>
    );
  }

  return (
    <JimengAuthStubProvider onUpgrade={() => setUseFullProvider(true)}>{props.children}</JimengAuthStubProvider>
  );
}

export { useJimengAuth } from './jimengAuthContext';
