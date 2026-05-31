import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JimengAuthInfo } from './jimengAuthContext';

type JimengLoginDialogProps = {
  open: boolean;
  onClose: () => void;
  onLoggedIn: () => void;
  authInfo: JimengAuthInfo;
};

export function JimengLoginDialog(props: JimengLoginDialogProps) {
  const [status, setStatus] = useState('正在获取授权二维码');
  const [loginUrl, setLoginUrl] = useState('https://jimeng.jianying.com/ai-tool/login');
  const [userCode, setUserCode] = useState('');

  useEffect(() => {
    if (!props.open) return;

    if (props.authInfo.loggedIn) {
      setStatus(`✅ 已登录 | 积分: ${props.authInfo.credit} | VIP: ${props.authInfo.vipLevel || '普通'}`);
      return;
    }

    setStatus('正在获取授权二维码');

    let stopped = false;
    let timer: number | undefined;

    void (async () => {
      try {
        const { startJimengLogin, checkJimengLoginStatus } = await import('./jimengClient');
        const started = await startJimengLogin();
        if (stopped) return;
        if (started.ok) {
          const url = started.verificationUrl || started.loginUrl || 'https://jimeng.jianying.com/ai-tool/login';
          setLoginUrl(url);
          if (started.userCode) setUserCode(started.userCode);
          setStatus('请使用即梦 App 扫码登录');
        } else {
          setStatus(started.message || '获取登录链接失败');
        }
      } catch {
        if (!stopped) setStatus('即梦后端服务未启动');
      }

      timer = window.setInterval(async () => {
        if (stopped) return;
        try {
          const { checkJimengLoginStatus } = await import('./jimengClient');
          const login = await checkJimengLoginStatus();
          if (login.ok && login.loggedIn) {
            setStatus('✅ 已登录');
            window.clearInterval(timer);
            setTimeout(() => props.onLoggedIn(), 600);
          }
        } catch {
          /* ignore poll errors */
        }
      }, 2000);
    })();

    return () => {
      stopped = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [props.open, props.authInfo.loggedIn, props.authInfo.credit, props.authInfo.vipLevel, props.onLoggedIn]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(loginUrl).then(() => {
      setStatus('链接已复制到剪贴板');
      setTimeout(() => setStatus('请使用即梦 App 扫码登录'), 1500);
    });
  }, [loginUrl]);

  const handleCheckLogin = useCallback(async () => {
    setStatus('正在验证登录状态...');
    try {
      const { checkJimengLoginStatus } = await import('./jimengClient');
      const login = await checkJimengLoginStatus();
      if (login.ok && login.loggedIn) {
        setStatus('✅ 已登录');
        setTimeout(() => props.onLoggedIn(), 600);
      } else {
        setStatus('尚未登录，请先授权');
      }
    } catch {
      setStatus('验证失败，请重试');
    }
  }, [props]);

  const handleInstallOpencli = useCallback(async () => {
    setStatus('正在安装 opencli...');
    try {
      const { installOpencli } = await import('./jimengClient');
      const result = await installOpencli();
      if (result.ok) {
        setStatus(result.alreadyInstalled ? '✅ opencli 已安装' : '✅ opencli 安装成功！请刷新页面');
      } else {
        setStatus('安装失败: ' + (result.detail || result.message));
      }
    } catch (err: unknown) {
      setStatus('安装失败: ' + ((err as Error)?.message || '未知错误'));
    }
  }, []);

  const handleSetupWSL = useCallback(async () => {
    setStatus('正在安装 WSL 环境（需要管理员权限）...');
    try {
      const { setupWSL } = await import('./jimengClient');
      const result = await setupWSL();
      if (result.ok) {
        setStatus('✅ WSL 环境安装完成！请刷新页面');
      } else {
        setStatus('安装失败: ' + (result.detail || result.message));
      }
    } catch (err: unknown) {
      setStatus('安装失败: ' + ((err as Error)?.message || '未知错误'));
    }
  }, []);

  if (!props.open) return null;

  const dialog = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={props.onClose}
    >
      <div
        style={{
          width: 'min(420px, calc(100vw - 32px))',
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          color: '#e0e0e0',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #2a2a2a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: '#f0f0f0' }}>登录即梦账号</span>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid #444',
              background: 'transparent',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: '24px 24px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, color: '#c0c0c0', lineHeight: 1.5, maxWidth: 320 }}>{status}</div>

          {userCode && (
            <div
              style={{
                fontSize: 13,
                color: '#b0b0b0',
                background: '#222',
                border: '1px solid #3a3a5a',
                borderRadius: 8,
                padding: '6px 16px',
              }}
            >
              验证码:{' '}
              <span style={{ fontSize: 16, color: '#7eb8f7', letterSpacing: 2, fontWeight: 600 }}>{userCode}</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              width: '100%',
              maxWidth: 280,
              marginTop: 6,
            }}
          >
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: '11px 0',
                border: '1px solid #8b5cf6',
                borderRadius: 8,
                background: 'transparent',
                color: '#a78bfa',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              复制登录链接
            </button>
            <button
              type="button"
              onClick={handleCheckLogin}
              style={{
                padding: '11px 0',
                border: '1px solid #f59e0b',
                borderRadius: 8,
                background: 'transparent',
                color: '#fbbf24',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              验证登录状态
            </button>
            <button
              type="button"
              onClick={handleInstallOpencli}
              style={{
                padding: '11px 0',
                border: '1px solid #10b981',
                borderRadius: 8,
                background: 'transparent',
                color: '#34d399',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              安装 opencli 环境
            </button>
            <button
              type="button"
              onClick={handleSetupWSL}
              style={{
                padding: '11px 0',
                border: '1px solid #f97316',
                borderRadius: 8,
                background: 'transparent',
                color: '#fb923c',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              一键安装 WSL + 即梦环境
            </button>
          </div>

          <div style={{ fontSize: 11, color: '#555', marginTop: 4, maxWidth: 300, lineHeight: 1.4 }}>
            复制登录链接 → 用即梦 App 扫码授权 → 点击「验证登录状态」确认
          </div>
        </div>

        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #2a2a2a',
            color: '#666',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          检测到登录后将自动关闭
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
