/**
 * 本地视频代理：豆包 + 即梦（剪映即梦 jimeng.jianying.com）
 * 支持 RPA 自动化与上游 HTTP 转发两种模式。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import express from 'express';
import { chromium } from 'playwright';

const _envLocal = path.resolve(process.cwd(), '.env.local');
if (existsSync(_envLocal)) dotenv.config({ path: _envLocal });

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.DOUBAO_PROXY_PORT || process.env.VIDEO_PROXY_PORT || 5100);
const HOST = process.env.DOUBAO_PROXY_HOST || process.env.VIDEO_PROXY_HOST || '127.0.0.1';

const DOUBAO_VIDEO_UPSTREAM_URL = process.env.DOUBAO_VIDEO_UPSTREAM_URL || '';
const DOUBAO_ACCOUNT_TOKEN = process.env.DOUBAO_ACCOUNT_TOKEN || '';
const DOUBAO_ACCOUNT_COOKIE = process.env.DOUBAO_ACCOUNT_COOKIE || '';
const DOUBAO_RPA_ENABLED = (process.env.DOUBAO_RPA_ENABLED || 'true').toLowerCase() === 'true';
const DOUBAO_RPA_HEADLESS = (process.env.DOUBAO_RPA_HEADLESS || 'false').toLowerCase() === 'true';
const DOUBAO_RPA_CHAT_URL = process.env.DOUBAO_RPA_CHAT_URL || 'https://www.doubao.com/chat/';
const DOUBAO_RPA_TIMEOUT_MS = Number(process.env.DOUBAO_RPA_TIMEOUT_MS || 180000);
const DOUBAO_RPA_USER_DATA_DIR = process.env.DOUBAO_RPA_USER_DATA_DIR || path.resolve(process.cwd(), '.doubao-rpa-profile');
const DOUBAO_RPA_PROMPT_SELECTOR = process.env.DOUBAO_RPA_PROMPT_SELECTOR || 'textarea';
const DOUBAO_RPA_SUBMIT_SELECTOR = process.env.DOUBAO_RPA_SUBMIT_SELECTOR || 'button[type="submit"]';
const DOUBAO_RPA_VIDEO_URL_SELECTOR = process.env.DOUBAO_RPA_VIDEO_URL_SELECTOR || 'a[href*=".mp4"],video source,video';

const JIMENG_VIDEO_UPSTREAM_URL = process.env.JIMENG_VIDEO_UPSTREAM_URL || '';
const JIMENG_ACCOUNT_TOKEN = process.env.JIMENG_ACCOUNT_TOKEN || '';
const JIMENG_ACCOUNT_COOKIE = process.env.JIMENG_ACCOUNT_COOKIE || '';
const JIMENG_RPA_ENABLED = (process.env.JIMENG_RPA_ENABLED ?? process.env.DOUBAO_RPA_ENABLED ?? 'true').toLowerCase() === 'true';
const JIMENG_RPA_HEADLESS = (process.env.JIMENG_RPA_HEADLESS || process.env.DOUBAO_RPA_HEADLESS || 'false').toLowerCase() === 'true';
const JIMENG_RPA_CHAT_URL = process.env.JIMENG_RPA_CHAT_URL || 'https://jimeng.jianying.com/';
const JIMENG_RPA_TIMEOUT_MS = Number(process.env.JIMENG_RPA_TIMEOUT_MS || process.env.DOUBAO_RPA_TIMEOUT_MS || 240000);
const JIMENG_RPA_USER_DATA_DIR = process.env.JIMENG_RPA_USER_DATA_DIR || path.resolve(process.cwd(), '.jimeng-rpa-profile');
const JIMENG_RPA_PROMPT_SELECTOR = process.env.JIMENG_RPA_PROMPT_SELECTOR || 'textarea';
const JIMENG_RPA_SUBMIT_SELECTOR = process.env.JIMENG_RPA_SUBMIT_SELECTOR || 'button[type="submit"]';
const JIMENG_RPA_VIDEO_URL_SELECTOR = process.env.JIMENG_RPA_VIDEO_URL_SELECTOR || 'a[href*=".mp4"],video source,video';

/** RPA 登录窗口自动关闭前的等待时间（毫秒），便于扫码 / 网页 OAuth 完成 */
const RPA_LOGIN_WINDOW_MS = Number(process.env.RPA_LOGIN_WINDOW_MS || 300000);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'video-local-proxy',
    doubao: {
      mode: DOUBAO_VIDEO_UPSTREAM_URL ? 'upstream-api' : (DOUBAO_RPA_ENABLED ? 'rpa' : 'disabled'),
      rpaUserDataDir: DOUBAO_RPA_USER_DATA_DIR,
    },
    jimeng: {
      mode: JIMENG_VIDEO_UPSTREAM_URL ? 'upstream-api' : (JIMENG_RPA_ENABLED ? 'rpa' : 'disabled'),
      rpaUserDataDir: JIMENG_RPA_USER_DATA_DIR,
    },
  });
});

function isVideoStreamHostnameAllowed(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h)) return false;
  const extra = (process.env.VIDEO_STREAM_HOST_SUFFIX || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const suffixes = [
    'jianying.com',
    'bytedance.com',
    'bytednsdoc.com',
    'ibyteimg.com',
    'byteimg.com',
    'pstatp.com',
    'snssdk.com',
    'doubao.com',
    'volces.com',
    'volcengine.com',
    'alicdn.com',
    'qcloud.com',
    'myqcloud.com',
    'douyin.com',
    ...extra,
  ];
  return suffixes.some((s) => h === s || h.endsWith(`.${s}`));
}

/** 供画布前端同源拉流，减轻 CDN 防盗链导致浏览器无法播放 */
app.get('/api/video/stream', async (req, res) => {
  const q = req.query.url;
  const rawUrl = typeof q === 'string' ? q : Array.isArray(q) ? q[0] : '';
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'missing_url', message: '缺少 url 参数' });
  }
  let target;
  try {
    target = new URL(decodeURIComponent(rawUrl));
  } catch {
    return res.status(400).json({ error: 'invalid_url', message: 'url 无效' });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ error: 'bad_protocol', message: '仅支持 http(s)' });
  }
  if (!isVideoStreamHostnameAllowed(target.hostname)) {
    return res.status(403).json({
      error: 'host_not_allowed',
      message: '该域名不在允许列表，可在环境变量 VIDEO_STREAM_HOST_SUFFIX 追加后缀',
      hostname: target.hostname,
    });
  }
  try {
    const upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'video/mp4,video/webm,video/*,*/*;q=0.9',
      },
    });
    if (!upstream.ok) {
      const t = await upstream.text();
      return res.status(upstream.status).send(t.slice(0, 4000));
    }
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!upstream.body) {
      return res.status(502).json({ error: 'empty_body', message: '上游无响应体' });
    }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    console.error('[video-stream]', error);
    if (!res.headersSent) {
      res.status(502).json({ error: 'stream_failed', message: error?.message || '拉流失败' });
    }
  }
});

async function generateVideoViaRpa({
  userDataDir,
  chatUrl,
  prompt,
  duration,
  headless,
  promptSelector,
  submitSelector,
  videoSelector,
  timeoutMs,
  label,
}) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.waitForTimeout(800);
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector(promptSelector, { timeout: 20000 });
    const input = page.locator(promptSelector).first();
    await input.click();
    await input.fill('');
    await input.fill(`${prompt}\n\n视频时长：${duration}秒`);

    const submitBtn = page.locator(submitSelector).first();
    if (await submitBtn.count()) {
      await submitBtn.click();
    } else {
      await input.press('Enter');
    }

    await page.waitForSelector(videoSelector, { timeout: timeoutMs });

    const result = await page.evaluate((selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (node instanceof HTMLAnchorElement && node.href) return node.href;
        if (node instanceof HTMLSourceElement && node.src) return node.src;
        if (node instanceof HTMLVideoElement) {
          if (node.currentSrc) return node.currentSrc;
          if (node.src) return node.src;
        }
      }
      return '';
    }, videoSelector);

    if (!result) {
      throw new Error(`${label} RPA 未提取到视频地址，请在 .env.local 调整对应 *_RPA_VIDEO_URL_SELECTOR`);
    }
    return result;
  } finally {
    await context.close();
  }
}

async function openRpaLoginWindow({ userDataDir, chatUrl, headless, label }) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
  return { context, label };
}

// ---------- 豆包 ----------
app.post('/api/doubao/rpa/open-login', async (_req, res) => {
  if (!DOUBAO_RPA_ENABLED) {
    return res.status(400).json({ error: 'rpa_disabled', message: 'RPA 模式未启用（DOUBAO_RPA_ENABLED）' });
  }
  try {
    const { context } = await openRpaLoginWindow({
      userDataDir: DOUBAO_RPA_USER_DATA_DIR,
      chatUrl: DOUBAO_RPA_CHAT_URL,
      headless: DOUBAO_RPA_HEADLESS,
      label: 'doubao',
    });
    setTimeout(async () => {
      try { await context.close(); } catch {}
    }, RPA_LOGIN_WINDOW_MS);
    return res.json({ ok: true, message: `已打开豆包登录窗口，请在约 ${Math.round(RPA_LOGIN_WINDOW_MS / 60000)} 分钟内完成登录。` });
  } catch (error) {
    return res.status(500).json({ error: 'open_login_failed', message: error?.message || '打开登录窗口失败' });
  }
});

app.post('/api/doubao/video/generate', async (req, res) => {
  try {
    const { prompt, duration = 5, imageBase64, accountToken } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'invalid_prompt', message: '参数无效: prompt 不能为空' });
    }

    if (!DOUBAO_VIDEO_UPSTREAM_URL && DOUBAO_RPA_ENABLED) {
      const videoUrl = await generateVideoViaRpa({
        userDataDir: DOUBAO_RPA_USER_DATA_DIR,
        chatUrl: DOUBAO_RPA_CHAT_URL,
        prompt,
        duration,
        headless: DOUBAO_RPA_HEADLESS,
        promptSelector: DOUBAO_RPA_PROMPT_SELECTOR,
        submitSelector: DOUBAO_RPA_SUBMIT_SELECTOR,
        videoSelector: DOUBAO_RPA_VIDEO_URL_SELECTOR,
        timeoutMs: DOUBAO_RPA_TIMEOUT_MS,
        label: '豆包',
      });
      return res.json({ ok: true, mode: 'rpa', videoUrl });
    }

    if (!DOUBAO_VIDEO_UPSTREAM_URL) {
      return res.status(500).json({
        error: 'missing_upstream_url',
        message: '未配置 DOUBAO_VIDEO_UPSTREAM_URL，且 RPA 未启用。',
      });
    }

    const tokenOrCookie = accountToken || DOUBAO_ACCOUNT_TOKEN || DOUBAO_ACCOUNT_COOKIE;
    if (!tokenOrCookie) {
      return res.status(401).json({
        error: 'missing_auth',
        message: '请填写账号令牌/Cookie，或配置 DOUBAO_ACCOUNT_TOKEN / DOUBAO_ACCOUNT_COOKIE',
      });
    }

    const looksLikeCookie = tokenOrCookie.includes('=') && tokenOrCookie.includes(';');
    const normalizedCookie = tokenOrCookie.startsWith('cookie:')
      ? tokenOrCookie.slice('cookie:'.length).trim()
      : tokenOrCookie;
    const authHeaders = looksLikeCookie || tokenOrCookie.startsWith('cookie:')
      ? { Cookie: normalizedCookie }
      : { Authorization: `Bearer ${tokenOrCookie}` };

    const upstreamResp = await fetch(DOUBAO_VIDEO_UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ prompt, duration, imageBase64, accountToken: tokenOrCookie }),
    });
    const text = await upstreamResp.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    if (!upstreamResp.ok) {
      return res.status(upstreamResp.status).json({
        error: 'upstream_error',
        message: payload?.message || payload?.error || '豆包上游接口失败',
        detail: payload,
      });
    }
    const videoUrl = payload?.videoUrl || payload?.url || payload?.data?.videoUrl;
    if (!videoUrl) {
      return res.status(502).json({ error: 'invalid_upstream_response', message: '上游未返回 videoUrl', detail: payload });
    }
    return res.json({ ok: true, videoUrl, raw: payload });
  } catch (error) {
    console.error('[doubao-proxy] failed:', error);
    return res.status(500).json({ error: 'proxy_internal_error', message: error?.message || '内部错误' });
  }
});

// ---------- 即梦 ----------
app.post('/api/jimeng/rpa/open-login', async (_req, res) => {
  if (!JIMENG_RPA_ENABLED) {
    return res.status(400).json({ error: 'rpa_disabled', message: '即梦 RPA 未启用（JIMENG_RPA_ENABLED）' });
  }
  try {
    const { context } = await openRpaLoginWindow({
      userDataDir: JIMENG_RPA_USER_DATA_DIR,
      chatUrl: JIMENG_RPA_CHAT_URL,
      headless: JIMENG_RPA_HEADLESS,
      label: 'jimeng',
    });
    setTimeout(async () => {
      try { await context.close(); } catch {}
    }, RPA_LOGIN_WINDOW_MS);
    return res.json({
      ok: true,
      message: `已打开即梦登录窗口，请在约 ${Math.round(RPA_LOGIN_WINDOW_MS / 60000)} 分钟内在页面完成抖音扫码或网页登录（jimeng.jianying.com）。`,
    });
  } catch (error) {
    return res.status(500).json({ error: 'open_login_failed', message: error?.message || '打开即梦窗口失败' });
  }
});

app.post('/api/jimeng/video/generate', async (req, res) => {
  try {
    const { prompt, duration = 5, imageBase64, accountToken } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'invalid_prompt', message: '参数无效: prompt 不能为空' });
    }

    if (!JIMENG_VIDEO_UPSTREAM_URL && JIMENG_RPA_ENABLED) {
      const videoUrl = await generateVideoViaRpa({
        userDataDir: JIMENG_RPA_USER_DATA_DIR,
        chatUrl: JIMENG_RPA_CHAT_URL,
        prompt,
        duration,
        headless: JIMENG_RPA_HEADLESS,
        promptSelector: JIMENG_RPA_PROMPT_SELECTOR,
        submitSelector: JIMENG_RPA_SUBMIT_SELECTOR,
        videoSelector: JIMENG_RPA_VIDEO_URL_SELECTOR,
        timeoutMs: JIMENG_RPA_TIMEOUT_MS,
        label: '即梦',
      });
      return res.json({ ok: true, mode: 'rpa', videoUrl });
    }

    if (!JIMENG_VIDEO_UPSTREAM_URL) {
      return res.status(500).json({
        error: 'missing_upstream_url',
        message: '未配置 JIMENG_VIDEO_UPSTREAM_URL，且即梦 RPA 未启用。',
      });
    }

    const tokenOrCookie = accountToken || JIMENG_ACCOUNT_TOKEN || JIMENG_ACCOUNT_COOKIE;
    if (!tokenOrCookie) {
      return res.status(401).json({
        error: 'missing_auth',
        message: '请填写令牌/Cookie，或配置 JIMENG_ACCOUNT_TOKEN / JIMENG_ACCOUNT_COOKIE',
      });
    }

    const looksLikeCookie = tokenOrCookie.includes('=') && tokenOrCookie.includes(';');
    const normalizedCookie = tokenOrCookie.startsWith('cookie:')
      ? tokenOrCookie.slice('cookie:'.length).trim()
      : tokenOrCookie;
    const authHeaders = looksLikeCookie || tokenOrCookie.startsWith('cookie:')
      ? { Cookie: normalizedCookie }
      : { Authorization: `Bearer ${tokenOrCookie}` };

    const upstreamResp = await fetch(JIMENG_VIDEO_UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ prompt, duration, imageBase64, accountToken: tokenOrCookie }),
    });
    const text = await upstreamResp.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    if (!upstreamResp.ok) {
      return res.status(upstreamResp.status).json({
        error: 'upstream_error',
        message: payload?.message || payload?.error || '即梦上游接口失败',
        detail: payload,
      });
    }
    const videoUrl = payload?.videoUrl || payload?.url || payload?.data?.videoUrl;
    if (!videoUrl) {
      return res.status(502).json({ error: 'invalid_upstream_response', message: '上游未返回 videoUrl', detail: payload });
    }
    return res.json({ ok: true, videoUrl, raw: payload });
  } catch (error) {
    console.error('[jimeng-proxy] failed:', error);
    return res.status(500).json({ error: 'proxy_internal_error', message: error?.message || '内部错误' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[video-proxy] http://${HOST}:${PORT}`);
  console.log('  POST /api/doubao/video/generate | /api/doubao/rpa/open-login');
  console.log('  POST /api/jimeng/video/generate  | /api/jimeng/rpa/open-login');
  console.log('  GET  /api/video/stream?url=        （画布视频拉流，域名白名单）');
});
