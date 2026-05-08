import { next } from '@vercel/edge';

/**
 * 整站 HTTP Basic 认证。在 Vercel → Environment Variables 配置（勿提交到 Git）：
 *   BASIC_AUTH_PASSWORD — 必填一项即可启用拦截；访客在浏览器弹窗里输入「任意用户名 + 此密码」。
 *   BASIC_AUTH_USER — 可选；若设置则用户名也必须一致，否则只校验密码。
 * 未设置 BASIC_AUTH_PASSWORD 时不拦截（便于本地构建）。
 */
export const config = {
  matcher: '/:path*',
};

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i += 1) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

function parseBasicCredentials(headerValue) {
  if (!headerValue || !headerValue.startsWith('Basic ')) return null;
  let decoded = '';
  try {
    decoded = atob(headerValue.slice(6));
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  const u = idx >= 0 ? decoded.slice(0, idx) : '';
  const p = idx >= 0 ? decoded.slice(idx + 1) : decoded;
  return { u, p };
}

function checkBasicAuth(request, userRequired, passRequired) {
  const creds = parseBasicCredentials(request.headers.get('authorization'));
  if (!creds) return false;
  const passOk = timingSafeEqualStr(creds.p, passRequired);
  if (!passOk) return false;
  if (userRequired && userRequired.length > 0) {
    return timingSafeEqualStr(creds.u, userRequired);
  }
  return true;
}

export default function middleware(request) {
  const user = (process.env.BASIC_AUTH_USER || '').trim();
  const pass = process.env.BASIC_AUTH_PASSWORD || '';
  if (!pass) {
    return next();
  }

  if (checkBasicAuth(request, user, pass)) {
    return next();
  }

  return new Response('需要登录', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="站点访问"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
