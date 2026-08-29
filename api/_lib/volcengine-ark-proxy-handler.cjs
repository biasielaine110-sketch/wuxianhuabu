/**
 * 火山方舟 Agent Plan 同源代理（https://ark.cn-beijing.volces.com/api/plan/v3）。
 */
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const UPSTREAM_ORIGIN = 'https://ark.cn-beijing.volces.com';

function isHopByHopHeader(name) {
  const n = String(name).toLowerCase();
  return new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
  ]).has(n);
}

function toUpstreamPath(sub) {
  const s = String(sub || '').replace(/^\/+/, '');
  const rest = s.replace(/^v1\/?/, '');
  return rest ? `/api/plan/v3/${rest}` : '/api/plan/v3';
}

function headerVal(v) {
  if (!v) return '';
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function pickArkApiKey(req) {
  const custom = headerVal(req.headers['x-volcengine-ark-key']);
  const auth = headerVal(req.headers.authorization);
  const fromAuth = auth.replace(/^Bearer\s+/i, '').trim();
  const env = String(process.env.VOLCENGINE_ARK_API_KEY || process.env.ARK_API_KEY || '').trim();
  return custom || fromAuth || env;
}

async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const pathFromQuery = url.searchParams.get('path')?.replace(/^\/+/, '') ?? '';
  let sub = pathFromQuery;
  if (!sub) {
    sub = url.pathname.replace(/^\/api\/volcengine-ark-proxy\/?/, '').replace(/^\/+/, '');
  }
  if (!sub) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing path after /api/volcengine-ark-proxy' }));
    return;
  }
  const upstreamSearch = new URLSearchParams(url.searchParams);
  upstreamSearch.delete('path');
  const qs = upstreamSearch.toString();
  const targetUrl = `${UPSTREAM_ORIGIN}${toUpstreamPath(sub)}${qs ? `?${qs}` : ''}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v || isHopByHopHeader(k)) continue;
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'accept-encoding' || lk === 'authorization' || lk === 'x-volcengine-ark-key') continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }
  headers.set('accept-encoding', 'identity');
  const arkKey = pickArkApiKey(req);
  if (!arkKey) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: {
          code: 'AuthenticationError',
          message:
            '未提供火山方舟密钥。请在本站「设置 → API → 火山方舟 Agent Plan」填写 ark- 开头的 Key 并保存；或在 Vercel 环境变量设置 VOLCENGINE_ARK_API_KEY。',
          type: 'Unauthorized',
        },
      })
    );
    return;
  }
  headers.set('Authorization', `Bearer ${arkKey}`);

  const method = req.method || 'GET';
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? Readable.toWeb(Readable.from(req)) : undefined;

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      ...(hasBody ? { duplex: 'half' } : {}),
    });
  } catch (e) {
    console.error('[api/volcengine-ark-proxy] upstream fetch failed', targetUrl, e);
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

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (isHopByHopHeader(key) || String(key).toLowerCase() === 'content-encoding') return;
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore */
    }
  });

  if (!upstream.body) {
    res.end();
    return;
  }

  try {
    const out = Readable.fromWeb(upstream.body);
    await pipeline(out, res);
  } catch (e) {
    if (!res.writableEnded) {
      try {
        res.destroy(e);
      } catch {
        /* ignore */
      }
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
