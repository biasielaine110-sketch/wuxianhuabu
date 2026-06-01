import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JimengAuthInfo } from './jimengAuthContext';
import { JimengBackendError } from './jimengClient';

type JimengLoginDialogProps = {
  open: boolean;
  onClose: () => void;
  onLoggedIn: () => void;
  authInfo: JimengAuthInfo;
};

function resolveLoginUrls(started: {
  loginUrl?: string;
  browserLoginUrl?: string;
  appLoginUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}) {
  const code = started.userCode || '';
  const scanFallback = code
    ? `https://jimeng.jianying.com/passport/open/scan_user_code/?user_code=${code}`
    : '';
  const browserLoginUrl =
    started.browserLoginUrl ||
    started.loginUrl ||
    started.verificationUrl ||
    scanFallback;
  const appLoginUrl = started.appLoginUrl || scanFallback;
  return { browserLoginUrl, appLoginUrl, code };
}

function isCopyLinkReady(url: string, code: string, mode: 'oauth' | 'browser') {
  if (mode === 'browser') return !!url;
  return !!(code || /user_code=/.test(url));
}

function formatJimengError(err: unknown, fallback: string): string {
  if (err instanceof JimengBackendError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function JimengLoginDialog(props: JimengLoginDialogProps) {
  const [status, setStatus] = useState('正在获取授权二维码');
  const [loginUrl, setLoginUrl] = useState('');
  const [browserLoginUrl, setBrowserLoginUrl] = useState('');
  const [appLoginUrl, setAppLoginUrl] = useState('');
  const [loginMode, setLoginMode] = useState<'oauth' | 'browser'>('oauth');
  const [userCode, setUserCode] = useState('');
  const [loginReady, setLoginReady] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);

  const applyLoginStart = useCallback((started: Record<string, unknown>) => {
    const mode = started.mode === 'browser' ? 'browser' : 'oauth';
    setLoginMode(mode);
    const { browserLoginUrl: browserUrl, appLoginUrl: appUrl, code } = resolveLoginUrls({
      loginUrl: typeof started.loginUrl === 'string' ? started.loginUrl : undefined,
      browserLoginUrl: typeof started.browserLoginUrl === 'string' ? started.browserLoginUrl : undefined,
      appLoginUrl: typeof started.appLoginUrl === 'string' ? started.appLoginUrl : undefined,
      verificationUrl: typeof started.verificationUrl === 'string' ? started.verificationUrl : undefined,
      userCode: typeof started.userCode === 'string' ? started.userCode : undefined,
    });
    setBrowserLoginUrl(browserUrl);
    setAppLoginUrl(appUrl);
    setLoginUrl(browserUrl);
    if (code) setUserCode(code);
    setLoginReady(isCopyLinkReady(browserUrl || appUrl, code, mode));
    return { mode, browserUrl, appUrl, code };
  }, []);

  const fetchLoginLink = useCallback(async () => {
    setLoadingLink(true);
    try {
      const { startJimengLogin, getJimengLoginCode } = await import('./jimengClient');
      const started = await startJimengLogin();
      if (started.ok) {
        const { mode, browserUrl, appUrl, code } = applyLoginStart(started);
        if (!isCopyLinkReady(browserUrl || appUrl, code, mode)) {
          for (let i = 0; i < 15; i += 1) {
            await new Promise((r) => setTimeout(r, 1000));
            const pending = await getJimengLoginCode();
            if (pending.ok && pending.userCode) {
              applyLoginStart(pending);
              break;
            }
          }
        }
        setStatus(
          typeof started.message === 'string'
            ? started.message
            : mode === 'browser'
              ? '请在弹出的浏览器窗口中登录即梦'
              : '请复制链接，用即梦 App 打开并完成授权',
        );
        return true;
      }
      setStatus(
        (typeof started.message === 'string' && started.message) ||
          (typeof started.detail === 'string' && started.detail) ||
          '获取登录链接失败，请确认即梦后端已启动',
      );
      return false;
    } catch (err) {
      setStatus(formatJimengError(err, '即梦后端服务未启动，请运行 server 后点击「重新获取登录链接」'));
      return false;
    } finally {
      setLoadingLink(false);
    }
  }, [applyLoginStart]);

  useEffect(() => {
    if (!props.open) return;

    if (props.authInfo.loggedIn) {
      setStatus(`✅ 已登录 | 积分: ${props.authInfo.credit} | VIP: ${props.authInfo.vipLevel || '普通'}`);
      return;
    }

    setStatus('正在获取授权二维码');
    setLoginReady(false);
    setLoginUrl('');
    setBrowserLoginUrl('');
    setAppLoginUrl('');
    setUserCode('');

    let stopped = false;
    let timer: number | undefined;

    void (async () => {
      if (stopped) return;
      await fetchLoginLink();
      if (stopped) return;

      timer = window.setInterval(async () => {
        if (stopped) return;
        try {
          const { checkJimengLoginStatus, checkJimengSession } = await import('./jimengClient');
          const login = await checkJimengLoginStatus();
          const session = login.loggedIn ? null : await checkJimengSession().catch(() => null);
          if ((login.ok && login.loggedIn) || session?.loggedIn) {
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
  }, [props.open, props.authInfo.loggedIn, props.authInfo.credit, props.authInfo.vipLevel, props.onLoggedIn, fetchLoginLink]);

  const copyToClipboard = useCallback((text: string, okMessage: string) => {
    navigator.clipboard.writeText(text).then(() => setStatus(okMessage));
  }, []);

  const handleCopyBrowserLink = useCallback(() => {
    if (!browserLoginUrl || !userCode) {
      setStatus('浏览器登录链接尚未就绪，请稍候或重新获取');
      return;
    }
    copyToClipboard(browserLoginUrl, '已复制浏览器登录链接，请用 Chrome 打开并完成授权');
  }, [browserLoginUrl, userCode, copyToClipboard]);

  const handleCopyAppLink = useCallback(() => {
    if (!appLoginUrl || !userCode) {
      setStatus('App 登录链接尚未就绪，请稍候或重新获取');
      return;
    }
    copyToClipboard(appLoginUrl, '已复制 App 链接，请在即梦 App 内打开（勿用外部浏览器）');
  }, [appLoginUrl, userCode, copyToClipboard]);

  const handleCopyLink = handleCopyBrowserLink;

  const handleCheckLogin = useCallback(async () => {
    setStatus('正在验证登录状态...');
    try {
      const { checkJimengLoginStatus, checkJimengSession } = await import('./jimengClient');
      const login = await checkJimengLoginStatus();
      const session = login.loggedIn ? null : await checkJimengSession().catch(() => null);
      const loggedIn = !!(login.ok && login.loggedIn) || !!(session?.loggedIn);

      if (loggedIn) {
        setStatus('✅ 已登录');
        setTimeout(() => props.onLoggedIn(), 600);
        return;
      }

      if (login.pending) {
        setStatus('仍在等待 App 授权，请完成扫码/确认后再试');
        return;
      }

      setStatus(login.detail || login.message || '尚未登录，请重新复制链接并完成授权');
    } catch (err) {
      setStatus(formatJimengError(err, '验证失败：即梦后端未启动或网络异常，请确认已运行 server'));
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
      setStatus('安装失败: ' + formatJimengError(err, '未知错误'));
    }
  }, []);

  const handleSetupWSL = useCallback(async () => {
    setStatus('正在启动 WSL + 即梦环境安装（可能需要 UAC 管理员确认）...');
    try {
      const { setupWSL, getSetupWSLStatus } = await import('./jimengClient');
      const result = await setupWSL();

      if (result.alreadyInstalled || result.wslReady) {
        setStatus('✅ WSL + dreamina 已就绪，请刷新页面后登录');
        return;
      }

      const poll = async (attempt = 0): Promise<void> => {
        if (attempt > 240) {
          setStatus('安装超时（约 10 分钟）。请确认 UAC 已允许，或手动运行 scripts\\setup-jimeng-dreamina-wsl.ps1');
          return;
        }
        const st = await getSetupWSLStatus();
        const steps = Array.isArray(st.steps) ? st.steps.slice(-6).join('\n') : '';
        const phaseMsg = st.message || st.phase || '安装中...';

        if (st.wslReady) {
          setStatus(`✅ 安装完成！${phaseMsg}\n请刷新页面后使用 App 扫码登录`);
          return;
        }

        if (st.status === 'completed' && st.ok) {
          setStatus(`✅ ${phaseMsg}${st.needReboot ? '（建议重启电脑）' : ''}`);
          return;
        }

        if (st.status === 'failed' || st.ok === false) {
          const guide = Array.isArray(st.manualGuide) ? st.manualGuide.join('\n') : '';
          setStatus(`安装未完成：${phaseMsg}\n${steps}${guide ? `\n\n手动步骤：\n${guide}` : ''}`);
          return;
        }

        if (st.phase === 'reboot_required' || st.needReboot) {
          setStatus(`⚠️ ${phaseMsg}\n重启后请再次点击「一键安装」完成 dreamina 安装`);
          return;
        }

        setStatus(`${phaseMsg}${steps ? `\n${steps}` : ''}`);

        if (st.running || st.status === 'running' || result.polling) {
          await new Promise((r) => setTimeout(r, 2500));
          return poll(attempt + 1);
        }

        if (result.launched) {
          await new Promise((r) => setTimeout(r, 2500));
          return poll(attempt + 1);
        }

        setStatus(result.message || '安装已启动，若长时间无进展请查看是否已确认 UAC 弹窗');
      };

      await poll();
    } catch (err: unknown) {
      setStatus(
        formatJimengError(err, '未知错误') +
          '\n\n请以管理员打开 PowerShell，在项目 scripts 目录执行：.\\setup-jimeng-dreamina-wsl.ps1',
      );
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
          <div style={{ fontSize: 14, color: '#c0c0c0', lineHeight: 1.5, maxWidth: 320, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{status}</div>

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
            {loginMode === 'oauth' ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyBrowserLink}
                  disabled={!loginReady || loadingLink}
                  style={{
                    padding: '11px 0',
                    border: '1px solid #8b5cf6',
                    borderRadius: 8,
                    background: 'transparent',
                    color: loginReady && !loadingLink ? '#a78bfa' : '#555',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loginReady && !loadingLink ? 'pointer' : 'not-allowed',
                    opacity: loginReady && !loadingLink ? 1 : 0.6,
                  }}
                >
                  复制浏览器登录链接（Chrome）
                </button>
                <button
                  type="button"
                  onClick={handleCopyAppLink}
                  disabled={!loginReady || loadingLink}
                  style={{
                    padding: '11px 0',
                    border: '1px solid #06b6d4',
                    borderRadius: 8,
                    background: 'transparent',
                    color: loginReady && !loadingLink ? '#22d3ee' : '#555',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loginReady && !loadingLink ? 'pointer' : 'not-allowed',
                    opacity: loginReady && !loadingLink ? 1 : 0.6,
                  }}
                >
                  复制 App 登录链接（即梦内打开）
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!loginReady || loadingLink}
                style={{
                  padding: '11px 0',
                  border: '1px solid #8b5cf6',
                  borderRadius: 8,
                  background: 'transparent',
                  color: loginReady && !loadingLink ? '#a78bfa' : '#555',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loginReady && !loadingLink ? 'pointer' : 'not-allowed',
                  opacity: loginReady && !loadingLink ? 1 : 0.6,
                }}
              >
                复制即梦登录页链接
              </button>
            )}
            {loginMode === 'oauth' && (
              <button
                type="button"
                onClick={() => void fetchLoginLink()}
                disabled={loadingLink}
                style={{
                  padding: '11px 0',
                  border: '1px solid #6366f1',
                  borderRadius: 8,
                  background: 'transparent',
                  color: loadingLink ? '#555' : '#818cf8',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loadingLink ? 'wait' : 'pointer',
                }}
              >
                {loadingLink ? '正在获取登录链接...' : '重新获取登录链接'}
              </button>
            )}
            {loginMode === 'browser' && (
              <button
                type="button"
                onClick={async () => {
                  setStatus('正在打开浏览器登录...');
                  try {
                    const { startJimengLogin } = await import('./jimengClient');
                    const started = await startJimengLogin();
                    setStatus(started.message || '请在浏览器中完成登录');
                  } catch {
                    setStatus('打开浏览器失败，请检查 opencli 或改用 WSL 安装');
                  }
                }}
                style={{
                  padding: '11px 0',
                  border: '1px solid #6366f1',
                  borderRadius: 8,
                  background: 'transparent',
                  color: '#818cf8',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                重新打开浏览器登录
              </button>
            )}
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
            {loginMode === 'browser'
              ? 'opencli 模式：在浏览器登录 → 点击「验证登录状态」。推荐「一键安装 WSL + 即梦环境」后可 App 扫码登录。'
              : '电脑：复制浏览器链接用 Chrome 打开；手机：复制 App 链接在即梦 App 内打开。若出现「非法应用」，说明 scan 链接被外部浏览器打开。'}
            <br />
            一键安装会弹出 UAC 管理员窗口，安装 Ubuntu + dreamina CLI，约需 3–10 分钟。
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
