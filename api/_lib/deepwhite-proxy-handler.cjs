/**
 * api.deepwhiteai.com 同源代理。
 * 边缘 rewrite 直连外站时，部分 POST（如 Midjourney / music）易丢 body → 上游 400；
 * 改为 Serverless 转发：缓冲 body 再发出，并剥离 Origin/Referer。
 */
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const UPSTREAM_ORIGIN = 'https://api.deepwhiteai.com';

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

function isUnsafeForwardedResponseHeader(name) {
  const n = String(name).toLowerCase();
  return isHopByHopHeader(n) || n === 'content-encoding' || n === 'content-length';
}

function shouldDropRequestHeader(name) {
  const n = String(name).toLowerCase();
  return (
    n === 'host' ||
    n === 'accept-encoding' ||
    n === 'content-length' ||
    n === 'origin' ||
    n === 'referer' ||
    n === 'cookie' ||
    n.startsWith('x-vercel-') ||
    n.startsWith('x-forwarded-')
  );
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
  const sub = url.pathname.replace(/^\/api\/deepwhite-proxy\/?/, '').replace(/^\/+/, '');
  const qs = url.searchParams.toString();
  return { sub, qs };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  if (!chunks.length) return undefined;
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  const { sub, qs } = resolveSubPath(req);
  if (!sub) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing path after /api/deepwhite-proxy' }));
    return;
  }
  const targetUrl = `${UPSTREAM_ORIGIN}/${sub}${qs ? `?${qs}` : ''}`;

  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return;
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v || isHopByHopHeader(k) || shouldDropRequestHeader(k)) continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }
  headers.set('accept-encoding', 'identity');

  const hasBody = !['GET', 'HEAD'].includes(method);
  let body;
  if (hasBody) {
    body = await readRequestBody(req);
    if (body && body.length) {
      headers.set('content-length', String(body.length));
    }
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? body : undefined,
    });
  } catch (e) {
    console.error('[api/deepwhite-proxy] upstream fetch failed', targetUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'deepwhite_upstream_unreachable',
        message: e instanceof Error ? e.message : String(e),
      })
    );
    return;
  }

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

handler.config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};

module.exports = handler;
