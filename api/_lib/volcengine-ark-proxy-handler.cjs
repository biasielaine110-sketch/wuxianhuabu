/**
 * 火山方舟同源代理。对话优先 Agent Plan，401 再试 Coding Plan / 按量 /api/v3。
 */
function isUnsafeForwardedResponseHeader(name) {
  const n = String(name).toLowerCase();
  return (
    n === 'connection' ||
    n === 'keep-alive' ||
    n === 'transfer-encoding' ||
    n === 'content-encoding' ||
    n === 'content-length'
  );
}

async function writeUpstreamResponse(res, upstream) {
  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (isUnsafeForwardedResponseHeader(key)) return;
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore */
    }
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
}

const PLAN_CHAT = 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions';
const CODING_CHAT = 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions';
const PAYGO_CHAT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

function headerVal(v) {
  if (!v) return '';
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function normalizeArkKey(raw) {
  let k = headerVal(raw);
  k = k.replace(/^\uFEFF/, '').replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  k = k.replace(/^Bearer\s+/i, '').trim();
  k = k.replace(/^["'`]+|["'`]+$/g, '');
  return k;
}

function isLikelyNotArkKey(k) {
  if (!k || k.length < 16) return true;
  if (/^eyJ/i.test(k)) return true;
  const parts = k.split('.');
  if (parts.length === 3 && parts.every((p) => p.length >= 8)) return true;
  return false;
}

function pickArkApiKey(req) {
  const custom = normalizeArkKey(req.headers['x-volcengine-ark-key']);
  if (custom && !isLikelyNotArkKey(custom)) return custom;
  const fromAuth = normalizeArkKey(req.headers.authorization);
  if (fromAuth && !isLikelyNotArkKey(fromAuth)) return fromAuth;
  const env = normalizeArkKey(
    process.env.ARK_AGENT_PLAN_API_KEY ||
      process.env.VOLCENGINE_ARK_PLAN_API_KEY ||
      process.env.VOLCENGINE_ARK_API_KEY ||
      process.env.ARK_API_KEY ||
      ''
  );
  if (env && !isLikelyNotArkKey(env)) return env;
  return '';
}

function isChatCompletionsPath(sub) {
  const s = String(sub || '').replace(/^\/+/, '');
  return /(^|\/)(v1\/)?chat\/completions\/?$/i.test(s) || s === '';
}

function chatUpstreamUrls() {
  return [PLAN_CHAT, CODING_CHAT, PAYGO_CHAT];
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function arkAuthHeaders(contentType, arkKey) {
  const headers = new Headers();
  headers.set('Content-Type', contentType || 'application/json');
  headers.set('Authorization', `Bearer ${arkKey}`);
  headers.set('Accept', 'application/json');
  return headers;
}

/** Seedream 等返回的 TOS 签名图链（无 CORS）；仅允许 volces.com TOS 域名 */
function isAllowedVolcTosUrl(u) {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('.volces.com') && (host.includes('.tos-') || host.startsWith('tos-'));
  } catch {
    return false;
  }
}

async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const pathFromQuery = url.searchParams.get('path')?.replace(/^\/+/, '') ?? '';
  let sub = pathFromQuery;
  if (!sub) {
    sub = url.pathname.replace(/^\/api\/volcengine-ark-proxy\/?/, '').replace(/^\/+/, '');
  }

  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-volcengine-ark-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.end();
    return;
  }

  if (sub.split('?')[0] === 'tos-fetch' || sub === 'tos-fetch') {
    const target = url.searchParams.get('u') || '';
    if (!isAllowedVolcTosUrl(target)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'invalid_tos_url' }));
      return;
    }
    try {
      const upstream = await fetch(target, { method: 'GET' });
      res.setHeader('Access-Control-Allow-Origin', '*');
      await writeUpstreamResponse(res, upstream);
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'tos_fetch_failed', message: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }

  const arkKey = pickArkApiKey(req);
  if (!arkKey) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: {
          code: 'AuthenticationError',
          message:
            '未提供可用的方舟 API Key（已忽略 Vercel 部署保护 JWT）。请在本站「设置 → API → 火山方舟」填写并保存密钥，或配置 ARK_AGENT_PLAN_API_KEY / VOLCENGINE_ARK_API_KEY。',
          type: 'Unauthorized',
        },
      })
    );
    return;
  }

  const hasBody = !['GET', 'HEAD'].includes(method);
  let rawBody = Buffer.alloc(0);
  if (hasBody) {
    try {
      rawBody = await readRawBody(req);
    } catch (e) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'invalid_body', message: e instanceof Error ? e.message : String(e) }));
      return;
    }
  }

  const contentType = headerVal(req.headers['content-type']) || 'application/json';
  const targets = isChatCompletionsPath(sub)
    ? chatUpstreamUrls()
    : [
        `https://ark.cn-beijing.volces.com/api/plan/v3/${String(sub || '')
          .replace(/^\/+/, '')
          .replace(/^v1\//i, '')}`,
      ];

  let upstream;
  let usedUrl = targets[0];
  try {
    for (let i = 0; i < targets.length; i += 1) {
      usedUrl = targets[i];
      upstream = await fetch(usedUrl, {
        method,
        headers: arkAuthHeaders(contentType, arkKey),
        body: hasBody ? rawBody : undefined,
      });
      if (upstream.status !== 401 || i === targets.length - 1) break;
      await upstream.text().catch(() => '');
    }
  } catch (e) {
    console.error('[api/volcengine-ark-proxy] upstream fetch failed', usedUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'volcengine_ark_upstream_unreachable',
        message: e instanceof Error ? e.message : String(e),
      })
    );
    return;
  }

  if (upstream.status === 401) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { message: text.slice(0, 800), type: 'Unauthorized' } };
    }
    const err = payload.error && typeof payload.error === 'object' ? payload.error : {};
    err.message = `${err.message || 'AuthenticationError'}（已依次尝试 Agent Plan / Coding Plan / 按量 /api/v3 仍 401。请在方舟控制台重新生成 API Key 并在本站保存；曾泄露到 Git 的密钥通常会立即作废。）`;
    payload.error = err;
    res.end(JSON.stringify(payload));
    return;
  }

  try {
    await writeUpstreamResponse(res, upstream);
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: 'volcengine_ark_upstream_read_failed',
          message: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};
