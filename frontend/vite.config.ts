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

/** ToAPIs 等返回的图片 CDN 常未对浏览器开放 CORS，经同源路径代理后可正常读图 */
const toapisFileCdnProxy = {
  '/cdn-files-toapis': {
    target: 'https://files.toapis.com',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-toapis/, ''),
  },
  '/cdn-files-dashlyai': {
    target: 'https://files.dashlyai.cc',
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/cdn-files-dashlyai/, ''),
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
  /** 满 e（manxueapi.com）未开放 CORS；图生图 multipart 经同源转发 */
  '/manxue-api': {
    target: 'https://manxueapi.com',
    changeOrigin: true,
    secure: true,
    timeout: 1_800_000,
    proxyTimeout: 1_800_000,
    configure(proxy) {
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
  '/api/jimeng': {
    target: 'http://localhost:3107',
    changeOrigin: true,
    secure: false,
    configure(proxy) {
      proxy.on('error', (err, _req, res) => {
        console.warn('[vite proxy /api/jimeng] 即梦后端未启动 (npm start --prefix server):', err instanceof Error ? err.message : err);
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
  /** AIID (api.aiid.edu.kg) 视频生成 API 代理，解决 CORS 跨域问题 */
  '/api/aiid': {
    target: 'https://api.aiid.edu.kg',
    changeOrigin: true,
    secure: true,
    timeout: 600_000,
    proxyTimeout: 600_000,
    rewrite: (p: string) => {
      const path = p.startsWith('/') ? p : `/${p}`;
      const stripped = path.replace(/^\/api\/aiid(?=\/|$)/, '');
      return stripped.length ? stripped : '/';
    },
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
      build: {
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
      plugins: [react(), injectSitePasswordPlugin(sitePassword), faviconFallbackPlugin()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
