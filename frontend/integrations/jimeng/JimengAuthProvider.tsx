import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import {
  checkJimengCli,
  checkJimengLoginStatus,
  checkJimengSession,
  startJimengLogin,
  logoutJimeng,
  reloginJimeng,
} from "./jimengClient";

type JimengAuthInfo = {
  loggedIn: boolean;
  credit: number | string;
  vipLevel: string;
  userName: string;
};

type JimengAuthContextValue = {
  ensureJimengReady: () => Promise<void>;
  loginOpen: boolean;
  closeLogin: () => void;
  openLogin: () => Promise<void>;
  authInfo: JimengAuthInfo;
  refreshAuthInfo: () => Promise<void>;
  logout: () => Promise<void>;
  relogin: () => Promise<void>;
};

const DEFAULT_AUTH_INFO: JimengAuthInfo = {
  loggedIn: false,
  credit: "?",
  vipLevel: "",
  userName: "",
};

const JimengAuthContext = createContext<JimengAuthContextValue | null>(null);

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
      const r = await fetch("/api/jimeng/session");
      const session = await r.json();
      if (session?.loggedIn) {
        const d = session.data || {};
        setAuthInfo({
          loggedIn: true,
          credit: d.total_credit ?? d.credit ?? d.credits ?? "?",
          vipLevel: d.vip_level || "",
          userName: d.user_name || "",
        });
      } else {
        setAuthInfo(DEFAULT_AUTH_INFO);
      }
    } catch {
      // 后端不可用，保持默认
    }
  }, []);

  // 启动时自动检测一次
  useEffect(() => {
    refreshAuthInfo();
  }, [refreshAuthInfo]);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);

    if (pendingLoginRef.current) {
      pendingLoginRef.current.reject(new Error("已取消即梦登录"));
      pendingLoginRef.current = null;
    }
    // 关闭弹窗后刷新状态
    refreshAuthInfo();
  }, [refreshAuthInfo]);

  const waitForLogin = useCallback(() => {
    setLoginOpen(true);

    return new Promise<void>((resolve, reject) => {
      pendingLoginRef.current = { resolve, reject };
    });
  }, []);

  const openLogin = useCallback(async () => {
    // 已登录时，直接刷新状态并显示当前登录信息，不弹登录框
    if (authInfo.loggedIn) {
      await refreshAuthInfo();
      window.alert(
        `✅ 即梦已登录\n` +
        `积分: ${authInfo.credit}\n` +
        `VIP: ${authInfo.vipLevel || "普通"}\n\n` +
        `如需切换账号，请点击右上角"退出即梦"按钮`
      );
      return;
    }

    // 未登录则弹窗
    setLoginOpen(true);
  }, [authInfo, refreshAuthInfo]);

  const ensureJimengReady = useCallback(async () => {
    console.log('[jimeng-auth] ensureJimengReady called');
    let cli;
    try {
      cli = await checkJimengCli();
      console.log('[jimeng-auth] checkJimengCli result:', cli);
    } catch (e) {
      console.error('[jimeng-auth] checkJimengCli error:', e);
      throw new Error("即梦后端服务未启动，请先运行 npm start (server 目录)");
    }

    if (!cli.ok) {
      console.log('[jimeng-auth] CLI not ok, proceeding anyway');
    }

    let session;
    try {
      session = await checkJimengSession();
      console.log('[jimeng-auth] checkJimengSession result:', session);
    } catch (e) {
      console.error('[jimeng-auth] checkJimengSession error:', e);
    }

    if (session?.ok && session?.loggedIn) {
      console.log('[jimeng-auth] already logged in, returning');
      await refreshAuthInfo();
      return;
    }

    console.log('[jimeng-auth] not logged in, calling waitForLogin');
    await waitForLogin();
    console.log('[jimeng-auth] waitForLogin resolved');
  }, [waitForLogin, refreshAuthInfo]);

  const handleLoggedIn = useCallback(() => {
    setLoginOpen(false);

    if (pendingLoginRef.current) {
      pendingLoginRef.current.resolve();
      pendingLoginRef.current = null;
    }
    refreshAuthInfo();
  }, [refreshAuthInfo]);

  const logout = useCallback(async () => {
    await logoutJimeng();
    setAuthInfo(DEFAULT_AUTH_INFO);
  }, []);

  const relogin = useCallback(async () => {
    await reloginJimeng();
    await waitForLogin();
  }, [waitForLogin]);

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
      }}
    >
      {props.children}

      <JimengLoginDialog
        open={loginOpen}
        onClose={closeLogin}
        onLoggedIn={handleLoggedIn}
      />
    </JimengAuthContext.Provider>
  );
}

export function useJimengAuth() {
  const context = useContext(JimengAuthContext);

  if (!context) {
    throw new Error("useJimengAuth must be used inside JimengAuthProvider");
  }

  return context;
}

function JimengLoginDialog(props: {
  open: boolean;
  onClose: () => void;
  onLoggedIn: () => void;
}) {
  const [status, setStatus] = useState("正在获取授权二维码");
  const [loginUrl, setLoginUrl] = useState("https://jimeng.jianying.com/ai-tool/login");
  const [userCode, setUserCode] = useState("");
  const [qrLoaded, setQrLoaded] = useState(false);

  // 弹窗打开时异步获取 OAuth URL
  useEffect(() => {
    if (!props.open) return;

    setStatus("正在获取授权二维码");
    setQrLoaded(false);

    startJimengLogin().then(started => {
      if (started.ok) {
        const url = started.verificationUrl || started.loginUrl || "https://jimeng.jianying.com/ai-tool/login";
        setLoginUrl(url);
        if (started.userCode) setUserCode(started.userCode);
        setStatus("请使用即梦 App 扫码登录");
        setQrLoaded(true);
      } else {
        setStatus(started.message || "获取登录链接失败");
        setQrLoaded(true);
      }
    }).catch(() => {
      setStatus("即梦后端服务未启动");
      setQrLoaded(true);
    });

    // 轮询检测登录状态
    let stopped = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      if (stopped) return;
      attempts++;
      try {
        const login = await checkJimengLoginStatus();
        if (login.ok && login.loggedIn) {
          setStatus("✅ 已登录");
          window.clearInterval(timer);
          setTimeout(() => props.onLoggedIn(), 600);
          return;
        }
      } catch {}
    }, 2000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [props.open]);

  const handleOpenLoginPage = useCallback(() => {
    window.open(loginUrl, "_blank");
  }, [loginUrl]);

  const handleConfirmLoggedIn = useCallback(async () => {
    setStatus("已登录");
    props.onLoggedIn();
  }, [props.onLoggedIn]);

  if (!props.open) return null;

  // 直接使用抖音扫码的 verification_uri
  const qrUrl = loginUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(loginUrl)}` : '';

  const dialog = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={props.onClose}
    >
      <div
        style={{
          width: "min(420px, calc(100vw - 32px))",
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          color: "#e0e0e0",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #2a2a2a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: "#f0f0f0" }}>
            登录即梦账号
          </span>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "1px solid #444",
              background: "transparent",
              color: "#888",
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "24px 24px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          {/* QR Code */}
          <div
            style={{
              width: 200,
              height: 200,
              background: "#fff",
              borderRadius: 10,
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            {qrLoaded ? (
              <img
                src={qrUrl}
                alt="即梦登录二维码"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ color: "#999", fontSize: 13 }}>加载中...</div>
            )}
          </div>

          <div style={{ fontSize: 14, color: "#c0c0c0", lineHeight: 1.5, maxWidth: 320 }}>
            {status}
          </div>

          {userCode && (
            <div
              style={{
                fontSize: 13,
                color: "#b0b0b0",
                background: "#222",
                border: "1px solid #3a3a5a",
                borderRadius: 8,
                padding: "6px 16px",
              }}
            >
              验证码:{" "}
              <span style={{ fontSize: 16, color: "#7eb8f7", letterSpacing: 2, fontWeight: 600 }}>
                {userCode}
              </span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "100%",
              maxWidth: 280,
              marginTop: 6,
            }}
          >
            <button
              type="button"
              onClick={handleOpenLoginPage}
              style={{
                padding: "11px 0",
                border: "none",
                borderRadius: 8,
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              在浏览器中打开登录
            </button>

            <button
              type="button"
              onClick={handleConfirmLoggedIn}
              style={{
                padding: "11px 0",
                border: "1px solid #22c55e",
                borderRadius: 8,
                background: "transparent",
                color: "#22c55e",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              我已登录，继续
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#555", marginTop: 4, maxWidth: 300, lineHeight: 1.4 }}>
            方法一：打开即梦 App 扫码二维码<br />
            方法二：点击上方按钮在浏览器中登录<br />
            登录后点击「我已登录，继续」
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid #2a2a2a",
            color: "#666",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          检测到登录后将自动关闭
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
