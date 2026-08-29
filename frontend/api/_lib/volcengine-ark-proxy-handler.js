/**
 * 火山方舟 Agent Plan 同源代理。
 * 官方 OpenAI 兼容：POST https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions
 * Header：Authorization: Bearer <Agent Plan 专属 Key>
 * 文档：https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2373746
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UPSTREAM_CHAT =
  'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions';

function headerVal(v) {
  if (!v) return '';
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function normalizeArkKey(raw) {
  let k = headerVal(raw);
  k = k.replace(/^Bearer\s+/i, '').trim();
  k = k.replace(/^["'`]+|["'`]+$/g, '');
  return k;
}

function pickArkApiKey(req) {
  const custom = normalizeArkKey(req.headers['x-volcengine-ark-key']);
  const fromAuth = normalizeArkKey(req.headers.authorization);
  const env = normalizeArkKey(
    process.env.ARK_AGENT_PLAN_API_KEY ||
      process.env.VOLCENGINE_ARK_PLAN_API_KEY ||
      process.env.VOLCENGINE_ARK_API_KEY ||
      process.env.ARK_API_KEY ||
      ''
  );
  return custom || fromAuth || env;
}

function isChatCompletionsPath(sub) {
  const s = String(sub || '').replace(/^\/+/, '');
  return /(^|\/)(v1\/)?chat\/completions\/?$/i.test(s) || s === '';
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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.end();
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
            '未提供 Agent Plan 密钥。请在设置中填写 Agent Plan 专属 Key，或配置环境变量 ARK_AGENT_PLAN_API_KEY。普通方舟 /api/v3 Key 无效。',
          type: 'Unauthorized',
        },
      })
    );
    return;
  }

  const targetUrl = isChatCompletionsPath(sub)
    ? UPSTREAM_CHAT
    : `https://ark.cn-beijing.volces.com/api/plan/v3/${String(sub || '').replace(/^\/+/, '').replace(/^v1\//i, '')}`;

  const contentType = headerVal(req.headers['content-type']) || 'application/json';
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Authorization', `Bearer ${arkKey}`);
  headers.set('Accept', 'application/json');

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
  if (upstream.status === 401) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { message: text.slice(0, 800), type: 'Unauthorized' } };
    }
    const err = payload.error && typeof payload.error === 'object' ? payload.error : {};
    err.message = `${err.message || 'AuthenticationError'}（请确认使用 Agent Plan 专属 Key，且请求为 POST ${UPSTREAM_CHAT}）`;
    payload.error = err;
    res.end(JSON.stringify(payload));
    return;
  }

  upstream.headers.forEach((value, key) => {
    const n = String(key).toLowerCase();
    if (n === 'connection' || n === 'transfer-encoding' || n === 'content-encoding') return;
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

export default handler;
