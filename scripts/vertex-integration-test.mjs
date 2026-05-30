/**
 * GCP Vertex 赠金通道联调脚本
 * 用法（项目根目录）：node scripts/vertex-integration-test.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadFrontendEnvLocal() {
  const p = resolve(ROOT, 'frontend/.env.local');
  const env = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function loadBackendEnvLocal() {
  const p = resolve(ROOT, 'backend/.env.local');
  const env = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function step(name, fn) {
  process.stdout.write(`\n[${name}] `);
  try {
    const result = await fn();
    console.log('✓', typeof result === 'string' ? result : 'OK');
    return { ok: true, result };
  } catch (e) {
    console.log('✗', e instanceof Error ? e.message : String(e));
    return { ok: false, error: e };
  }
}

const fe = loadFrontendEnvLocal();
const be = loadBackendEnvLocal();
const backendOrigin = fe.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:5000';
const proxyHeader = fe.VITE_PROXY_HEADER || be.PROXY_HEADER || 'Ea4-HmKSQpKIWcUwr400DRi9oZ2yr7Cy';
const credPath = be.GOOGLE_APPLICATION_CREDENTIALS;

console.log('=== GCP Vertex 联调 ===');
console.log('frontend/.env.local:', fe);
console.log('backend 凭证路径:', credPath);

const results = [];

results.push(await step('1. 后端 /health', async () => {
  const res = await fetch(`${backendOrigin}/health`);
  const text = await res.text();
  if (!res.ok || text.trim() !== 'ok') throw new Error(`status=${res.status} body=${text}`);
  return text.trim();
}));

results.push(await step('2. 前端 dev 服务', async () => {
  const res = await fetch('http://localhost:5173/');
  if (!res.ok) throw new Error(`status=${res.status}`);
  return `HTTP ${res.status}`;
}));

results.push(await step('3. 服务账号 JSON 文件存在', async () => {
  if (!credPath) throw new Error('backend/.env.local 未配置 GOOGLE_APPLICATION_CREDENTIALS');
  readFileSync(credPath, 'utf8');
  return credPath;
}));

results.push(await step('4. Vertex 代理鉴权头', async () => {
  const res = await fetch(`${backendOrigin}/api-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalUrl: 'https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.1-flash-image-preview:generateContent' }),
  });
  if (res.status !== 403) throw new Error(`期望 403 Forbidden，实际 ${res.status}`);
  return '无 X-App-Proxy 时正确拒绝';
}));

const vertexBody = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text: '一只简笔画风格的小猫，白色背景' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
  },
});

results.push(await step('5. Vertex 文生图（gemini-3.1-flash-image-preview）', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${backendOrigin}/api-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Proxy': proxyHeader,
      },
      body: JSON.stringify({
        originalUrl: 'https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.1-flash-image-preview:generateContent',
        method: 'POST',
        headers: {},
        body: vertexBody,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 500);
      try { msg = JSON.stringify(JSON.parse(text)).slice(0, 500); } catch { /* keep */ }
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }
    const json = JSON.parse(text);
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const hasImage = parts.some((p) => p?.inlineData?.data);
    if (!hasImage) throw new Error('响应无 inlineData 图片');
    const b64len = parts.find((p) => p?.inlineData?.data)?.inlineData?.data?.length || 0;
    return `返回图片 base64 长度 ${b64len}`;
  } finally {
    clearTimeout(timer);
  }
}));

const chatBody = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text: '你好，请用一句话回复' }] }],
  generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
});

results.push(await step('6. Vertex AI 对话（gemini-3.1-flash-image-preview）', async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch(`${backendOrigin}/api-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Proxy': proxyHeader },
    body: JSON.stringify({
      originalUrl: 'https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.1-flash-image-preview:generateContent',
      method: 'POST',
      headers: {},
      body: chatBody,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  const reply = json?.candidates?.[0]?.content?.parts?.find((p) => p?.text)?.text;
  if (!reply) throw new Error('响应无文本');
  return `回复: ${reply.slice(0, 60)}`;
}));

const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n=== 结果: ${passed}/${total} 通过 ===`);
if (passed < total) process.exit(1);
