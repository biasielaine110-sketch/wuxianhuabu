import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
      plugins: react(),
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
