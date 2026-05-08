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
    const env = loadEnv(mode, process.cwd(), '');
    return {
      define: {
        // This is just generic value for the GEMINI API key.
        // This is not used at all, and can be ignored!
        'process.env.API_KEY' : JSON.stringify('api-key-this-is-not-used-can-be-ignored!'),
      },
      server: {
        proxy: {
          //Target your Node.js backend
          '/api-proxy': 'http://localhost:5000',
          '/ws-proxy': {target: 'ws://localhost:5000', ws: true},
          ...toapisFileCdnProxy,
        },
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
