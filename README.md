# 无限 AI 画布

纯前端 React 应用（Vite），支持节点连线画布与多 AI 提供商（Gemini、ToAPIs、满 e、君澜等）。

## 本地运行

```bash
npm install && npm run dev
```

浏览器访问 [http://localhost:5173/](http://localhost:5173/)

## 项目结构

- `frontend/` — 前端应用
- `frontend/api/` — Vercel Serverless（云智等代理）
- `server/` — 即梦本地服务（可选）

## 环境变量

见 `frontend/.env.example`。API 密钥在应用内「设置 → API」配置，或通过 `frontend/.env.local` 注入。
