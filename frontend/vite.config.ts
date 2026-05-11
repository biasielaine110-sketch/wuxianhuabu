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
            /** Vertex 拦截器单独 chunk，避免与 React 同文件压缩产生 TDZ（Cannot access before initialization） */
            manualChunks(id) {
              if (id.replace(/\\/g, '/').includes('vertex-ai-proxy-interceptor')) {
                return 'vertex-shim';
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
        // 纯前端开发：仅 CDN 反代。若需 Vertex，另开终端 `npm run dev-backend` 并设 frontend/.env.development：
        //   VITE_BACKEND_ORIGIN=http://127.0.0.1:5000
        proxy: { ...toapisFileCdnProxy },
      },
      preview: {
        proxy: { ...toapisFileCdnProxy },
      },
      plugins: [react(), injectSitePasswordPlugin(sitePassword)],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
