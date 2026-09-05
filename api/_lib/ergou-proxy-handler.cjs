/**
 * ergouapi.com 同源代理。
 * 边缘 rewrite 直连外站时 POST body 易丢失 → 上游 400；
 * Serverless 缓冲转发，并从 x-ergou-key 取 Key（避免部署保护把 Authorization 换成 JWT）。
 */
const UPSTREAM_ORIGIN = 'https://ergouapi.com';

function headerVal(v) {
  if (!v) return '';
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function normalizeKey(raw) {
  let k = headerVal(raw);
  k = k.replace(/^\uFEFF/, '').replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  k = k.replace(/^Bearer\s+/i, '').trim();
  k = k.replace(/^["'`]+|["'`]+$/g, '');
  return k;
}

function isLikelyJwt(k) {
  if (!k || k.length < 16) return true;
  if (/^eyJ/i.test(k)) return true;
  const parts = k.split('.');
  if (parts.length === 3 && parts.every((p) => p.length >= 8)) return true;
  return false;
}

function pickApiKey(req) {
  const custom = normalizeKey(req.headers['x-ergou-key']);
  if (custom && !isLikelyJwt(custom)) return custom;
  const fromAuth = normalizeKey(req.headers.authorization);
  if (fromAuth && !isLikelyJwt(fromAuth)) return fromAuth;
  const env = normalizeKey(process.env.ERGOU_API_KEY || '');
  if (env && !isLikelyJwt(env)) return env;
  return '';
}

function resolveSubPath(req) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const fromQuery = url.searchParams.get('path')?.replace(/^\/+/, '') ?? '';
  if (fromQuery) {
    const upstreamSearch = new URLSearchParams(url.searchParams);
    upstreamSearch.delete('path');
    const qs = upstreamSearch.toString();
    return { sub: fromQuery, qs };
  }
  const sub = url.pathname.replace(/^\/api\/ergou-proxy\/?/, '').replace(/^\/+/, '');
  const qs = url.searchParams.toString();
  return { sub, qs };
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (req.body && typeof req.body === 'object' && !ct.includes('multipart')) {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

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

async function writeUpstream(res, upstream) {
  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (isUnsafeForwardedResponseHeader(key)) return;
    if (String(key).toLowerCase() === 'cache-control') return;
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore */
    }
  });
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
}

async function handler(req, res) {
  const { sub, qs } = resolveSubPath(req);
  if (!sub) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'missing path after /api/ergou-proxy' }));
    return;
  }
  const targetUrl = `${UPSTREAM_ORIGIN}/${sub}${qs ? `?${qs}` : ''}`;

  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-ergou-key');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return;
  }

  const apiKey = pickApiKey(req);
  if (!apiKey) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(
      JSON.stringify({
        error: {
          message:
            '未提供可用的二狗 API Key（已忽略 Vercel 部署保护 JWT）。请在「设置 → API → 二狗 / ergouapi」填写并保存。',
          type: 'Unauthorized',
        },
      })
    );
    return;
  }

  const hasBody = !['GET', 'HEAD'].includes(method);
  let rawBody = Buffer.alloc(0);
  if (hasBody) {
    rawBody = await readRawBody(req);
  }

  const headers = new Headers();
  const contentType = headerVal(req.headers['content-type']);
  if (contentType) headers.set('Content-Type', contentType);
  else if (hasBody) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${apiKey}`);
  headers.set('Accept', 'application/json');
  headers.set('accept-encoding', 'identity');
  if (hasBody && rawBody.length) {
    headers.set('content-length', String(rawBody.length));
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? rawBody : undefined,
    });
  } catch (e) {
    console.error('[api/ergou-proxy] upstream fetch failed', targetUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(
      JSON.stringify({
        error: 'ergou_upstream_unreachable',
        message: e instanceof Error ? e.message : String(e),
      })
    );
    return;
  }

  try {
    await writeUpstream(res, upstream);
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(
        JSON.stringify({
          error: 'ergou_upstream_read_failed',
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
