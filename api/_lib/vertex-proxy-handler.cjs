/**
 * GCP Vertex AI 代理（Vercel Serverless / 本地 backend 共用逻辑）
 */
const { GoogleAuth } = require('google-auth-library');
const { HttpsProxyAgent } = require('https-proxy-agent');

const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'project-59d87bf6-dd18-4439-ab6';
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const PROXY_HEADER = process.env.PROXY_HEADER || 'Ea4-HmKSQpKIWcUwr400DRi9oZ2yr7Cy';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePattern(pattern) {
  const paramRegex = /\{\{(.*?)\}\}/g;
  const params = [];
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = paramRegex.exec(pattern)) !== null) {
    params.push(match[1]);
    parts.push(escapeRegex(pattern.substring(lastIndex, match.index)));
    parts.push(`([^/]+)`);
    lastIndex = paramRegex.lastIndex;
  }
  parts.push(escapeRegex(pattern.substring(lastIndex)));
  return { regex: new RegExp(`^${parts.join('')}$`), params };
}

const API_CLIENT_MAP = [
  {
    name: 'VertexGenAi:generateContent',
    patternForProxy: 'https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:generateContent',
    getApiEndpoint: (context, params) =>
      `https://aiplatform.clients6.google.com/${params.version}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params.model}:generateContent`,
    isStreaming: false,
  },
  {
    name: 'VertexGenAi:predict',
    patternForProxy: 'https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:predict',
    getApiEndpoint: (context, params) =>
      `https://aiplatform.clients6.google.com/${params.version}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params.model}:predict`,
    isStreaming: false,
  },
].map((client) => ({ ...client, patternInfo: parsePattern(client.patternForProxy) }));

let authClient = null;

function getAuth() {
  if (authClient) return authClient;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw && String(raw).trim()) {
    authClient = new GoogleAuth({
      credentials: JSON.parse(String(raw)),
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  } else {
    authClient = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return authClient;
}

function extractParams(patternInfo, url) {
  const match = url.match(patternInfo.regex);
  if (!match) return null;
  const params = {};
  patternInfo.params.forEach((name, index) => {
    params[name] = match[index + 1];
  });
  return params;
}

function withOptionalProxy(fetchOptions = {}) {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return fetchOptions;
  return { ...fetchOptions, agent: new HttpsProxyAgent(proxyUrl) };
}

async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    if (typeof req.body === 'string' && req.body.trim()) {
      return JSON.parse(req.body);
    }
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function getAccessToken() {
  const auth = getAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  const proxyHeader = req.headers['x-app-proxy'] || req.headers['X-App-Proxy'];
  if (proxyHeader !== PROXY_HEADER) {
    res.statusCode = 403;
    res.end('Forbidden: Request must originate from the Vertex App shim.');
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    sendJson(res, 400, { error: { message: 'Invalid JSON body' } });
    return;
  }

  const { originalUrl, method, headers, body: upstreamBody } = body;
  if (!originalUrl) {
    sendJson(res, 400, { error: { message: 'originalUrl is required' } });
    return;
  }

  let extractedParams = null;
  const apiClient = API_CLIENT_MAP.find((p) => {
    extractedParams = extractParams(p.patternInfo, originalUrl);
    return extractedParams !== null;
  });

  if (!apiClient) {
    sendJson(res, 404, { error: { message: `No proxy handler found for URL: ${originalUrl}` } });
    return;
  }

  if (apiClient.isStreaming) {
    sendJson(res, 501, { error: { message: 'Streaming not supported on serverless proxy yet' } });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      sendJson(res, 401, { error: { message: 'Authentication failed: no access token' } });
      return;
    }

    const context = { projectId: GOOGLE_CLOUD_PROJECT, region: GOOGLE_CLOUD_LOCATION };
    const apiUrl = apiClient.getApiEndpoint(context, extractedParams);
    const apiResponse = await fetch(
      apiUrl,
      withOptionalProxy({
        method: method || 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Goog-User-Project': GOOGLE_CLOUD_PROJECT,
          'Content-Type': 'application/json',
          ...(headers || {}),
        },
        body: upstreamBody ? upstreamBody : undefined,
      })
    );

    const rawText = await apiResponse.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { error: { message: rawText.slice(0, 800) } };
    }
    sendJson(res, apiResponse.status, data);
  } catch (error) {
    const msg = error?.message || String(error);
    const isTimeout = error?.code === 'ETIMEDOUT' || msg.includes('ETIMEDOUT');
    if (isTimeout) {
      sendJson(res, 503, {
        error: {
          message:
            '连接 Google / Vertex API 超时。若在 Vercel 部署，请确认 GOOGLE_SERVICE_ACCOUNT_JSON 已配置；本地开发请启动 npm run dev-backend。',
          details: msg,
        },
      });
      return;
    }
    if (msg.includes('Could not load the default credentials') || msg.includes('ENOENT')) {
      sendJson(res, 401, {
        error: {
          message:
            '未找到 GCP 凭证。请在 Vercel 环境变量设置 GOOGLE_SERVICE_ACCOUNT_JSON，或本地配置 GOOGLE_APPLICATION_CREDENTIALS。',
        },
      });
      return;
    }
    sendJson(res, 500, { error: { message: msg || 'Proxy internal error' } });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 300 };
