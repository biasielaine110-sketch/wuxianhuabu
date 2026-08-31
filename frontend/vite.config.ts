import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** 把密码写进 index.html，避免生产包内 import.meta.env 替换异常导致 SiteAccessGate 读不到 */
function injectSitePasswordPlugin(password: string): Plugin {
  return {
    name: 'inject-site-password-runtime',
    transformIndexHtml(html) {
      if (!password.trim()) return html;
      const payload = JSON.stringify(password);
      return html.replace(/<head>/i, `<head><script>window.__INFINITE_AI_CANVAS_PW__=${payload}</script>`);
    },
  };
}

/** 浏览器常会请求 /favicon.ico，避免控制台 404 */
function faviconFallbackPlugin(): Plugin {
  return {
    name: 'favicon-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/favicon.ico') {
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/favicon.ico') {
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

/** 开发环境：本地模拟 /api/hfsy-reference-image（Telegraph 公网 URL，供 hfsy 视频参考图） */
function hfsyReferenceImageDevPlugin(): Plugin {
  const mem = new Map<string, { buf: Buffer; mime: string; expires: number }>();
  const readBody = async (req: AsyncIterable<Uint8Array | Buffer | string>): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };
  const middleware = async (
    req: { method?: string; url?: string; headers: Record<string, unknown> },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void },
    next: () => void
  ) => {
    const raw = req.url || '';
    if (raw.startsWith('/api/hfsy-ref-asset')) {
      try {
        const id = new URL(raw, 'http://localhost').searchParams.get('id') || '';
        const hit = mem.get(id);
        if (!hit || hit.expires < Date.now()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'not_found' }));
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', hit.mime);
        res.end(hit.buf);
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
      return;
    }
    if (!(req.method === 'POST' && raw.startsWith('/api/hfsy-reference-image'))) {
      next();
      return;
    }
    try {
      const body = await readBody(req as unknown as AsyncIterable<Uint8Array | Buffer | string>);
      const mime = String(req.headers['content-type'] || 'image/jpeg').split(';')[0] || 'image/jpeg';
      const filename = mime.includes('png') ? 'hfsy-reference.png' : 'hfsy-reference.jpg';
      let url = '';
      try {
        const form = new FormData();
        form.append('file', new Blob([body], { type: mime }), filename);
        const up = await fetch('https://telegra.ph/upload', { method: 'POST', body: form });
        const json = (await up.json().catch(() => null)) as Array<{ src?: string }> | { src?: string } | null;
        const src = Array.isArray(json) ? json[0]?.src : json?.src;
        if (typeof src === 'string' && src.startsWith('/')) url = `https://telegra.ph${src}`;
        else if (typeof src === 'string' && /^https?:\/\//i.test(src)) url = src;
      } catch {
        /* fallthrough */
      }
      if (!url) {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        mem.set(id, { buf: body, mime, expires: Date.now() + 30 * 60_000 });
        const host = String(req.headers.host || 'localhost:5173');
        url = `http://${host}/api/hfsy-ref-asset?id=${id}`;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ url }));
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: e instanceof Error ? e.message : String(e) }));
    }
  };
  return {
    name: 'hfsy-reference-image-dev',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/** 开发环境：把阿里云 OSS 临时图转到同源拉取，避免 CORS */
function aliyunMaasOssFetchPlugin(): Plugin {
  const middleware = async (
    req: { url?: string },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void },
    next: () => void
  ) => {
    const raw = req.url || '';
    if (!raw.startsWith('/aliyun-maas-api/oss-fetch')) {
      next();
      return;
    }
    try {
      const target = new URL(raw, 'http://localhost').searchParams.get('u') || '';
      const host = new URL(target).hostname.toLowerCase();
      if (!(host.includes('aliyuncs.com') && (host.includes('dashscope') || host.includes('oss-')))) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'invalid_oss_url' }));
        return;
      }
      const upstream = await fetch(target);
      res.statusCode = upstream.status;
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'oss_fetch_failed', message: e instanceof Error ? e.message : String(e) }));
    }
  };
  return {
    name: 'aliyun-maas-oss-fetch',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/** 图像/视频代理：支持 ?path=v1beta/models/...:generateContent，避免路径冒号被错误解析 */
function configurePathQueryProxy(proxy: { on: (event: string, handler: (...args: unknown[]) => void) => void }) {
  proxy.on('proxyReq', (proxyReq, req) => {
    try {
      const raw = (req as { url?: string }).url || '/';
      const url = new URL(raw, 'http://localhost');
      const sub = url.searchParams.get('path')?.replace(/^\/+/, '');
      if (!sub) return;
      url.searchParams.delete('path');
      const rest = url.searchParams.toString();
      (proxyReq as { path?: string }).path = `/${sub}${rest ? `?${rest}` : ''}`;
    } catch {
      /* ignore */
    }
  });
}

/** hfsy 图像代理：支持 ?path=v1beta/models/...:generateContent，避免路径冒号被错误解析 */
function configureHfsyImageProxyPathQuery(proxy: { on: (event: string, handler: (...args: unknown[]) => void) => void }) {
  configurePathQueryProxy(proxy);
}

/** ToAPIs 等返回的图片 CDN 常未对浏览器开放 CORS，经同源路径代理后可正常读图 */
const toapisFileCdnProxy = {
  '/cdn-files-toapis': {
    target: 'https://files.toapis.com',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-toapis/, ''),
  },
  '/cdn-files-toapis-xyz': {
    target: 'https://files.toapis.xyz',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-toapis-xyz/, ''),
  },
  '/cdn-files-qixinai': {
    target: 'https://www.qixinai.net',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-qixinai/, ''),
  },
  '/cdn-files-dashlyai': {
    target: 'https://files.dashlyai.cc',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-dashlyai/, ''),
  },
  '/cdn-files-token6688': {
    target: 'https://assets.token6688.com',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-token6688/, ''),
  },
  /** 云智等自建 OpenAI 兼容站未配 CORS 时，前端经同源路径转发（与 openaiCompatibleService.rewriteRemoteOpenAiCompatBaseForBrowserCors 对齐） */
  '/yunzhi-openai': {
    target: 'https://yunzhi-ai.top',
    changeOrigin: true,
    secure: true,
    /** 云智文/图生图 SSE 可能数分钟；默认代理超时过短会表现为 503 */
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /yunzhi-openai]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`云智代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    /** http-proxy 传入的 path 在少数环境下可能无前导 /，需归一化后再剥前缀，避免误转发到 /yunzhi-openai/... 导致上游 404 */
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/yunzhi-openai(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  /** 与 /yunzhi-openai 相同上游；生产包请求 /api/yunzhi-proxy 时本地 preview 需此代理 */
  '/api/yunzhi-proxy': {
    target: 'https://yunzhi-ai.top',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /api/yunzhi-proxy]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`云智代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/yunzhi-proxy(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  '/api/codesonline-image-proxy': {
    target: 'https://image.codesonline.dev',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/codesonline-image-proxy(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  '/codesonline-image-api': {
    target: 'https://image.codesonline.dev',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /codesonline-image-api]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`codesonline 图像代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    rewrite: (p: string) => p.replace(/^\/codesonline-image-api/, ''),
  },
  '/codesonline-chat-api': {
    target: 'https://ai.codesonline.dev',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/codesonline-chat-api/, ''),
  },
  /** 火山方舟 Agent Plan：文档 Base URL 为 /api/plan/v3，其后直接 /chat/completions */
  '/volcengine-ark-api': {
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        const raw = (req as { headers?: Record<string, unknown> }).headers?.['x-volcengine-ark-key'];
        const custom = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
        if (custom && !proxyReq.getHeader('Authorization')) {
          proxyReq.setHeader('Authorization', `Bearer ${custom}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/volcengine-ark-api(?=\/|$)/, '');
      const rest = stripped.replace(/^\/v1(?=\/|$)/, '') || '/';
      const suffix = rest === '/' ? '/chat/completions' : rest;
      return `/api/plan/v3${suffix}`;
    },
  },
  '/api/volcengine-ark-proxy': {
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        const raw = (req as { headers?: Record<string, unknown> }).headers?.['x-volcengine-ark-key'];
        const custom = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
        if (custom && !proxyReq.getHeader('Authorization')) {
          proxyReq.setHeader('Authorization', `Bearer ${custom}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/volcengine-ark-proxy(?=\/|$)/, '');
      const rest = stripped.replace(/^\/v1(?=\/|$)/, '') || '/';
      const suffix = rest === '/' ? '/chat/completions' : rest;
      return `/api/plan/v3${suffix}`;
    },
  },
  '/aliyun-maas-api': {
    target: 'https://ws-qlxmp9rbllkaq6yy.cn-beijing.maas.aliyuncs.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    bypass(req) {
      const u = req.url || '';
      if (u.includes('/oss-fetch')) return u;
    },
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        const raw = (req as { headers?: Record<string, unknown> }).headers?.['x-aliyun-maas-key'];
        const custom = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
        if (custom && !proxyReq.getHeader('Authorization')) {
          proxyReq.setHeader('Authorization', `Bearer ${custom}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/aliyun-maas-api(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  '/api/aliyun-maas-proxy': {
    target: 'https://ws-qlxmp9rbllkaq6yy.cn-beijing.maas.aliyuncs.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        const raw = (req as { headers?: Record<string, unknown> }).headers?.['x-aliyun-maas-key'];
        const custom = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
        if (custom && !proxyReq.getHeader('Authorization')) {
          proxyReq.setHeader('Authorization', `Bearer ${custom}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/aliyun-maas-proxy(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  /** hfsyapi.cn 图像 API 未开放 CORS；经同源转发到 www.hfsyapi.cn（OpenAI 兼容 /v1/images/*） */
  '/api/hfsy-image-proxy': {
    target: 'https://www.hfsyapi.cn',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      configureHfsyImageProxyPathQuery(proxy);
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /api/hfsy-image-proxy]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`hfsyapi.cn 图像代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/hfsy-image-proxy(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  '/hfsy-image-api': {
    target: 'https://www.hfsyapi.cn',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      configureHfsyImageProxyPathQuery(proxy);
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /hfsy-image-api]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`hfsyapi.cn 图像代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    rewrite: (p: string) => p.replace(/^\/hfsy-image-api/, ''),
  },
  /** 满 e（manxueapi.com）未开放 CORS；图生图 multipart 经同源转发 */
  '/manxue-api': {
    target: 'https://manxueapi.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      configurePathQueryProxy(proxy);
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /manxue-api]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`满 e 代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/manxue-api(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  /** 与生产同路径：/api/manxue-proxy/* → manxueapi.com/* */
  '/api/manxue-proxy': {
    target: 'https://manxueapi.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
      configurePathQueryProxy(proxy);
      proxy.on('error', (err, _req, res) => {
        console.error('[vite proxy /api/manxue-proxy]', err);
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          r.end?.(`满 e 代理错误: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/manxue-proxy(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
  },
  '/api/jimeng': {
    target: 'http://localhost:3107',
    changeOrigin: true,
    secure: false,
    configure(proxy) {
      let jimengWarned = false;
      proxy.on('error', (err, _req, res) => {
        // 同一次 dev server 启动内只提示一次，避免 ECONNREFUSED 反复触发把日志刷屏
        // 让人误以为前端崩了。前端 JimengAuthProvider 已有 try/catch 兜底，不影响页面功能。
        if (!jimengWarned) {
          jimengWarned = true;
          console.warn('[vite proxy /api/jimeng] 即梦后端未启动 (npm start --prefix server)，本次 dev 会话内不再重复提示。');
          console.warn('原始错误：', err instanceof Error ? err.message : err);
        }
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h?: unknown) => void; end?: (s?: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === 'function') {
          r.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          r.end?.(
            JSON.stringify({
              ok: false,
              loggedIn: false,
              backendUnavailable: true,
              message:
                '即梦后端未启动。请在项目 server 目录执行 npm start（默认端口 3107），然后刷新页面重试。',
            }),
          );
        }
      });
    },
    rewrite: (p: string) => p.replace(/^\/api\/jimeng/, '/api/jimeng'),
  },
} as const;

export default defineConfig(({ mode }) => {
    // 必须从 frontend 目录读 .env*；从仓库根执行 workspace build 时 process.cwd() 常在根目录，会漏掉 frontend/.env.local
    const envDir = path.resolve(__dirname);
    const env = loadEnv(mode, envDir, '');
    const sitePassword =
      (process.env.VITE_SITE_PASSWORD && String(process.env.VITE_SITE_PASSWORD)) ||
      (env.VITE_SITE_PASSWORD && String(env.VITE_SITE_PASSWORD)) ||
      '';
    return {
      root: envDir,
      envDir,
      cacheDir: path.resolve(envDir, 'node_modules/.vite'),
      build: {
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            /** three / genai / jszip 分 chunk，减小主包体积 */
            manualChunks(id) {
              const norm = id.replace(/\\/g, '/');
              if (norm.includes('chatPromptTemplates')) {
                return 'chat-prompts';
              }
              if (norm.includes('node_modules/three')) {
                return 'three';
              }
              if (norm.includes('node_modules/jszip')) {
                return 'jszip';
              }
              if (norm.includes('node_modules/@google/genai')) {
                return 'genai';
              }
              if (norm.includes('/integrations/jimeng/')) {
                return 'jimeng';
              }
              if (norm.includes('AnnotationNodeContent')) {
                return 'annotation';
              }
              if (norm.includes('openaiCompatibleService')) {
                return 'ai-service';
              }
              if (norm.includes('CanvasApp')) {
                return 'canvas-app';
              }
              if (norm.includes('AuditModeCanvas')) {
                return 'audit';
              }
              return undefined;
            },
          },
        },
      },
      define: {
        // This is just generic value for the GEMINI API key.
        // This is not used at all, and can be ignored!
        'process.env.API_KEY' : JSON.stringify('api-key-this-is-not-used-can-be-ignored!'),
        // 显式注入：保证 Vercel / monorepo 构建时 process.env 能进包（仅靠默认 loadEnv 在 cwd 不对时会丢）
        'import.meta.env.VITE_SITE_PASSWORD': JSON.stringify(sitePassword),
      },
      server: {
        // 纯前端开发：CDN 反代。
        proxy: { ...toapisFileCdnProxy },
      },
      preview: {
        proxy: { ...toapisFileCdnProxy },
      },
      plugins: [
        react(),
        injectSitePasswordPlugin(sitePassword),
        faviconFallbackPlugin(),
        aliyunMaasOssFetchPlugin(),
        hfsyReferenceImageDevPlugin(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
