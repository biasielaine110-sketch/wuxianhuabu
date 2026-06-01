import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_AUTH_INFO,
  JimengAuthContext,
  type JimengAuthInfo,
} from './jimengAuthContext';

const JimengLoginDialog = lazy(() =>
  import('./JimengLoginDialog').then((m) => ({ default: m.JimengLoginDialog })),
);

type PendingLogin = {
  resolve: () => void;
  reject: (error: Error) => void;
};

export function JimengAuthProvider(props: { children: React.ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<JimengAuthInfo>(DEFAULT_AUTH_INFO);
  const pendingLoginRef = useRef<PendingLogin | null>(null);

  const refreshAuthInfo = useCallback(async () => {
    try {
      const r = await fetch('/api/jimeng/session');
      if (!r.ok) {
        setAuthInfo(DEFAULT_AUTH_INFO);
        return;
      }
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

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    if (pendingLoginRef.current) {
      pendingLoginRef.current.reject(new Error('已取消即梦登录'));
      pendingLoginRef.current = null;
    }
    void refreshAuthInfo();
  }, [refreshAuthInfo]);

  const waitForLogin = useCallback(() => {
    setLoginOpen(true);
    return new Promise<void>((resolve, reject) => {
      pendingLoginRef.current = { resolve, reject };
    });
  }, []);

  const openLogin = useCallback(async () => {
    setLoginOpen(true);
  }, []);

  const ensureJimengReady = useCallback(async () => {
    const { checkJimengCli, checkJimengSession } = await import('./jimengClient');

    try {
      await checkJimengCli();
    } catch {
      throw new Error('即梦后端服务未启动，请先运行 npm start (server 目录)');
    }

    let session;
    try {
      session = await checkJimengSession();
    } catch {
      /* ignore */
    }

    if (session?.ok && session?.loggedIn) {
      await refreshAuthInfo();
      return;
    }

    await waitForLogin();
  }, [waitForLogin, refreshAuthInfo]);

  const handleLoggedIn = useCallback(() => {
    setLoginOpen(false);
    if (pendingLoginRef.current) {
      pendingLoginRef.current.resolve();
      pendingLoginRef.current = null;
    }
    void refreshAuthInfo();
  }, [refreshAuthInfo]);

  const logout = useCallback(async () => {
    const { logoutJimeng } = await import('./jimengClient');
    await logoutJimeng();
    setAuthInfo(DEFAULT_AUTH_INFO);
  }, []);

  const relogin = useCallback(async () => {
    const { reloginJimeng } = await import('./jimengClient');
    await reloginJimeng();
    await waitForLogin();
  }, [waitForLogin]);

  const installOpencliFn = useCallback(async () => {
    const { installOpencli } = await import('./jimengClient');
    return installOpencli();
  }, []);

  const setupWSLFn = useCallback(async () => {
    const { setupWSL } = await import('./jimengClient');
    return setupWSL();
  }, []);

  return (
    <JimengAuthContext.Provider
      value={{
        ensureJimengReady,
        loginOpen,
        closeLogin,
        openLogin,
        authInfo,
        refreshAuthInfo,
        logout,
        relogin,
        installOpencli: installOpencliFn,
        setupWSL: setupWSLFn,
      }}
    >
      {props.children}

      {loginOpen && (
        <Suspense fallback={null}>
          <JimengLoginDialog
            open={loginOpen}
            onClose={closeLogin}
            onLoggedIn={handleLoggedIn}
            authInfo={authInfo}
          />
        </Suspense>
      )}
    </JimengAuthContext.Provider>
  );
}

export { useJimengAuth } from './jimengAuthContext';
