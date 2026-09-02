/**
 * 火山方舟同源代理。
 * - Coding Plan 对话：/api/coding/v3（path 前缀 coding/ 或 ark_route=coding）
 * - Agent Plan 生图：/api/plan/v3（path 前缀 plan/ 或默认）
 * 两套入口使用不同 API Key，不再跨 Plan 回退。
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

const CODING_ORIGIN = 'https://ark.cn-beijing.volces.com/api/coding/v3';
const PLAN_ORIGIN = 'https://ark.cn-beijing.volces.com/api/plan/v3';

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

/** Vercel Deployment Protection 常把 Authorization 换成 JWT，不能当方舟 Key 转发出去 */
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
      process.env.ARK_CODING_PLAN_API_KEY ||
      process.env.VOLCENGINE_ARK_CODING_API_KEY ||
      ''
  );
  if (env && !isLikelyNotArkKey(env)) return env;
  return '';
}

function cleanArkSubPath(sub) {
  return String(sub || '')
    .replace(/^\/+/, '')
    .replace(/^v1\//i, '');
}

/**
 * @returns {{ origin: 'coding' | 'plan', rest: string }}
 */
function resolveArkRoute(sub, url, req) {
  const routeHeader = headerVal(req.headers['x-volcengine-ark-route']).toLowerCase();
  const routeQuery = (url.searchParams.get('ark_route') || '').toLowerCase();
  let rest = cleanArkSubPath(sub);

  if (rest.startsWith('coding/')) {
    return { origin: 'coding', rest: rest.replace(/^coding\//, '') || 'chat/completions' };
  }
  if (rest.startsWith('plan/')) {
    return { origin: 'plan', rest: rest.replace(/^plan\//, '') || 'images/generations' };
  }
  if (routeHeader === 'coding' || routeQuery === 'coding') {
    return { origin: 'coding', rest: rest || 'chat/completions' };
  }
  if (routeHeader === 'plan' || routeQuery === 'plan') {
    return { origin: 'plan', rest: rest || 'images/generations' };
  }
  // 默认 Agent Plan（生图等）；对话请走 coding/ 前缀
  return { origin: 'plan', rest: rest || 'images/generations' };
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
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-volcengine-ark-key, x-volcengine-ark-route'
    );
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
            '未提供可用的方舟 API Key（已忽略 Vercel 部署保护 JWT）。对话请填 Coding Plan Key，Seedream 生图请填 Agent Plan Key；或配置对应环境变量。',
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
  const { origin, rest } = resolveArkRoute(sub, url, req);
  const usedUrl = `${origin === 'coding' ? CODING_ORIGIN : PLAN_ORIGIN}/${rest.replace(/^\/+/, '')}`;

  let upstream;
  try {
    upstream = await fetch(usedUrl, {
      method,
      headers: arkAuthHeaders(contentType, arkKey),
      body: hasBody ? rawBody : undefined,
    });
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
    const planHint =
      origin === 'coding'
        ? '（Coding Plan /api/coding/v3 鉴权失败。请确认使用的是 Coding Plan API Key，而非 Agent Plan Key。）'
        : '（Agent Plan /api/plan/v3 鉴权失败。请确认使用的是 Agent Plan API Key，而非 Coding Plan Key。）';
    err.message = `${err.message || 'AuthenticationError'}${planHint}`;
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

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};

export default handler;
