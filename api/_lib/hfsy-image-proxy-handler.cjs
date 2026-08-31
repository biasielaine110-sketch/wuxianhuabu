/**
 * hfsyapi.cn 图像 API 同源代理（https://www.hfsyapi.cn）。
 * 避免 Vercel 边缘 rewrite 直连外站时的 ROUTER_EXTERNAL_TARGET_ERROR / 502。
 */
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const UPSTREAM_ORIGIN = 'https://www.hfsyapi.cn';

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

async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);

  // 原 /api/hfsy-fetch-image：合并进本函数，避免 Hobby 超过 12 个 Serverless
  const fetchImageUrl = url.searchParams.get('url');
  if (req.method === 'GET' && fetchImageUrl && !url.searchParams.get('path')) {
    const ALLOWED_HOSTS = new Set(['file.hfsyapi.cn', 'hfsyapi.cn', 'www.hfsyapi.cn']);
    let target;
    try {
      target = new URL(fetchImageUrl);
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_image_url' }));
      return;
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'unsupported_image_url' }));
      return;
    }
    try {
      const upstream = await fetch(target, { signal: AbortSignal.timeout(30_000) });
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (!upstream.body) return res.end();
      for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
      res.end();
    } catch (error) {
      res.statusCode = 502;
      res.end(
        JSON.stringify({
          error: 'image_fetch_failed',
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
    return;
  }

  const pathFromQuery = url.searchParams.get('path')?.replace(/^\/+/, '') ?? '';
  let sub = pathFromQuery;
  if (!sub) {
    sub = url.pathname.replace(/^\/api\/hfsy-image-proxy\/?/, '').replace(/^\/+/, '');
  }
  if (!sub) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing path after /api/hfsy-image-proxy' }));
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
    console.error('[api/hfsy-image-proxy] upstream fetch failed', targetUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'hfsy_image_upstream_unreachable',
        message: e instanceof Error ? e.message : String(e),
      })
    );
    return;
  }

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (isUnsafeForwardedResponseHeader(key)) return;
    // 自行决定缓存策略，避免上游或本层把任务查询结果缓存成「永远进行中」
    if (String(key).toLowerCase() === 'cache-control') return;
    try {
      res.setHeader(key, value);
    } catch {
      /* ignore */
    }
  });
  // 仅长期缓存真实图片字节；JSON / 视频任务查询等 API 必须 no-store，否则轮询会被 CDN/浏览器钉死在首包状态
  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  const subLower = String(sub || '').toLowerCase();
  const isMutableApi =
    method !== 'GET' ||
    contentType.includes('json') ||
    contentType.startsWith('text/') ||
    /(?:^|\/)(?:video|videos)(?:\/|$)/.test(subLower) ||
    /(?:^|\/)images\/(?:generations|edits)/.test(subLower);
  if (isMutableApi) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  } else if (contentType.startsWith('image/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'private, no-cache');
  }

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
