/**
 * otuapi.com 生成图 CDN（oss-us.file-download.life）同源代理。
 * otuapi 异步返回的图片 URL 不开放 CORS，浏览器无法直接拉取；
 * 经 /api/otuapi-image-proxy/{path} 转发后再写入画布，与 codesonline/hfsy 模式一致。
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UPSTREAM_ORIGIN = 'https://oss-us.file-download.life';

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
  return (
    isHopByHopHeader(n) ||
    n === 'content-encoding' ||
    n === 'content-length'
  );
}

async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const pathFromQuery = url.searchParams.get('path')?.replace(/^\/+/, '') ?? '';
  let sub = pathFromQuery;
  if (!sub) {
    sub = url.pathname.replace(/^\/api\/otuapi-image-proxy\/?/, '').replace(/^\/+/, '');
  }
  if (!sub) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing path after /api/otuapi-image-proxy' }));
    return;
  }
  const upstreamSearch = new URLSearchParams(url.searchParams);
  upstreamSearch.delete('path');
  const qs = upstreamSearch.toString();
  const targetUrl = `${UPSTREAM_ORIGIN}/${sub}${qs ? `?${qs}` : ''}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v || isHopByHopHeader(k)) continue;
    if (k.toLowerCase() === 'host') continue;
    if (k.toLowerCase() === 'accept-encoding') continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }
  headers.set('accept-encoding', 'identity');

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
    console.error('[api/otuapi-image-proxy] upstream fetch failed', targetUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'otuapi_image_upstream_unreachable',
        message: e instanceof Error ? e.message : String(e),
      })
    );
    return;
  }

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (isUnsafeForwardedResponseHeader(key)) return;
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore */
    }
  });
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

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

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};

export default handler;
