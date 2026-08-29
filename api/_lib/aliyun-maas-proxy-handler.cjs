/**
 * 阿里云百炼（业务空间专属域名）同源代理。
 * 对话：/compatible-mode/v1/chat/completions
 * 生图：/api/v1/services/aigc/multimodal-generation/generation
 */
const UPSTREAM_ORIGIN = 'https://ws-qlxmp9rbllkaq6yy.cn-beijing.maas.aliyuncs.com';

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
  const custom = normalizeKey(req.headers['x-aliyun-maas-key']);
  if (custom && !isLikelyJwt(custom)) return custom;
  const fromAuth = normalizeKey(req.headers.authorization);
  if (fromAuth && !isLikelyJwt(fromAuth)) return fromAuth;
  const env = normalizeKey(process.env.ALIYUN_MAAS_API_KEY || process.env.DASHSCOPE_API_KEY || '');
  if (env && !isLikelyJwt(env)) return env;
  return '';
}

function isAllowedOssUrl(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.includes('aliyuncs.com') && (host.includes('dashscope') || host.includes('oss-'));
  } catch {
    return false;
  }
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

async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  const pathFromQuery = url.searchParams.get('path')?.replace(/^\/+/, '') ?? '';
  let sub = pathFromQuery;
  if (!sub) {
    sub = url.pathname.replace(/^\/api\/aliyun-maas-proxy\/?/, '').replace(/^\/+/, '');
  }

  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-aliyun-maas-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.end();
    return;
  }

  if (sub.split('?')[0] === 'oss-fetch' || sub === 'oss-fetch') {
    const target = url.searchParams.get('u') || '';
    if (!isAllowedOssUrl(target)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'invalid_oss_url' }));
      return;
    }
    try {
      const upstream = await fetch(target, { method: 'GET' });
      await writeUpstream(res, upstream);
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'oss_fetch_failed', message: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }

  const apiKey = pickApiKey(req);
  if (!apiKey) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: {
          message: '未提供阿里云百炼 API Key。请在「设置 → API → 阿里云百炼」填写并保存，或配置 ALIYUN_MAAS_API_KEY。',
          type: 'Unauthorized',
        },
      })
    );
    return;
  }

  const rest = String(sub || '').replace(/^\/+/, '');
  const targetUrl = `${UPSTREAM_ORIGIN}/${rest}`;
  const hasBody = !['GET', 'HEAD'].includes(method);
  let rawBody = Buffer.alloc(0);
  if (hasBody) {
    rawBody = await readRawBody(req);
  }

  const headers = new Headers();
  headers.set('Content-Type', headerVal(req.headers['content-type']) || 'application/json');
  headers.set('Authorization', `Bearer ${apiKey}`);
  headers.set('Accept', 'application/json');

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? rawBody : undefined,
    });
  } catch (e) {
    console.error('[api/aliyun-maas-proxy] fetch failed', targetUrl, e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'aliyun_maas_upstream_unreachable',
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
      res.end(
        JSON.stringify({
          error: 'aliyun_maas_upstream_read_failed',
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
