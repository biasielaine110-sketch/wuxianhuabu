import { next } from '@vercel/edge';

/**
 * 整站 HTTP Basic 认证。在 Vercel 项目环境变量中设置（勿提交到 Git）：
 *   BASIC_AUTH_USER
 *   BASIC_AUTH_PASSWORD
 * 未同时设置时：不拦截（便于本地/未配置时构建）；生产环境请务必设置。
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

function checkBasicAuth(request, user, pass) {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const idx = decoded.indexOf(':');
  const u = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const p = idx >= 0 ? decoded.slice(idx + 1) : '';
  return timingSafeEqualStr(u, user) && timingSafeEqualStr(p, pass);
}

export default function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) {
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
