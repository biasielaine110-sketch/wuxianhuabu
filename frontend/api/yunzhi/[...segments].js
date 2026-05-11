/**
 * 与仓库根目录 `api/yunzhi/[...segments].js` 逻辑一致。
 * 当 Vercel 项目 Root Directory 设为 `frontend` 时，仅会打包本目录下的 `api/`，否则 POST /yunzhi-openai 会落到 SPA 的 index.html → 405。
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UPSTREAM_ORIGIN = 'https://yunzhi-ai.top';

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

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const subpath = url.pathname.replace(/^\/api\/yunzhi\/?/, '').replace(/^\//, '');
  const targetUrl = `${UPSTREAM_ORIGIN}/${subpath}${url.search}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v || isHopByHopHeader(k)) continue;
    if (k.toLowerCase() === 'host') continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }

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
    console.error('[api/yunzhi] upstream fetch failed', targetUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'yunzhi_upstream_unreachable',
        message: e instanceof Error ? e.message : String(e),
      })
    );
    return;
  }

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (isHopByHopHeader(key)) return;
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

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};
