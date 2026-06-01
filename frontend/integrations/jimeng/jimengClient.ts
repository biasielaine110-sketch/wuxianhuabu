const JIMENG_SERVER = '/api/jimeng';

export class JimengBackendError extends Error {
  readonly backendUnavailable: boolean;

  constructor(message: string, backendUnavailable = false) {
    super(message);
    this.name = 'JimengBackendError';
    this.backendUnavailable = backendUnavailable;
  }
}

async function parseJimengResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (!text.trim()) {
    if (!res.ok) {
      throw new JimengBackendError(`即梦接口 HTTP ${res.status}`, res.status === 502 || res.status === 503);
    }
    return {};
  }

  const looksJson =
    contentType.includes('application/json') ||
    contentType.includes('+json') ||
    text.trimStart().startsWith('{') ||
    text.trimStart().startsWith('[');

  if (!looksJson) {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 80);
    const onVercel =
      typeof window !== 'undefined' &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1');
    const hint = onVercel
      ? '线上部署无法运行即梦后端（需本机 WSL + dreamina CLI）。请在本地启动 server 后使用。'
      : '即梦后端未启动。请在项目 server 目录执行 npm start（端口 3107），并确保前端 dev 代理可用。';
    throw new JimengBackendError(
      `${hint}${snippet ? `（收到非 JSON 响应：${snippet}…）` : ''}`,
      true,
    );
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new JimengBackendError('即梦接口返回了无效的 JSON', true);
  }
}

async function fetchJimengApi(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${JIMENG_SERVER}${path}`, init);
    const data = await parseJimengResponse(res);
    if (!res.ok && data.ok !== false) {
      return { ...data, ok: false, message: (data.message as string) || `HTTP ${res.status}` };
    }
    return data;
  } catch (err) {
    if (err instanceof JimengBackendError) throw err;
    throw new JimengBackendError(
      '无法连接即梦后端。请在 server 目录运行 npm start，并确认 http://localhost:3107/api/jimeng/health 可访问。',
      true,
    );
  }
}

export async function checkJimengCli() {
  return fetchJimengApi('/health');
}

export async function checkJimengSession() {
  return fetchJimengApi('/session');
}

export async function startJimengLogin() {
  const data = await fetchJimengApi('/login/start', { method: 'POST' });
  return { ...data, ok: data.ok !== false };
}

export async function getJimengLoginCode() {
  return fetchJimengApi('/login/code');
}

export function getJimengLoginScreenshotUrl() {
  return `${JIMENG_SERVER}/login/screenshot?t=${Date.now()}`;
}

export async function checkJimengLoginStatus() {
  return fetchJimengApi('/login/status');
}

export async function logoutJimeng() {
  return fetchJimengApi('/logout', { method: 'POST' });
}

export async function reloginJimeng() {
  return fetchJimengApi('/relogin', { method: 'POST' });
}

export async function installOpencli() {
  return fetchJimengApi('/install-opencli', { method: 'POST' });
}

export async function setupWSL() {
  return fetchJimengApi('/setup-wsl', { method: 'POST' });
}

export async function getSetupWSLStatus() {
  return fetchJimengApi('/setup-wsl/status');
}

export async function upscaleJimengImage(imageUrl: string, scale: number = 2) {
  const convertedImageUrl = imageUrl.startsWith('blob:') ? await blobToBase64(imageUrl) : imageUrl;

  const data = await fetchJimengApi('/image/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: convertedImageUrl, scale }),
  });
  if (!data.ok) {
    throw new Error((data.message as string) || '智能超清失败');
  }
  return data as { ok: true; imageUrl: string; filename: string };
}

/** 将 blob URL 转换为 base64 data URL（前端专用，因为 blob 只能在浏览器内访问） */
async function blobToBase64(blobUrl: string): Promise<string> {
  if (!blobUrl.startsWith('blob:')) return blobUrl;
  try {
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return blobUrl;
  }
}

/** 递归转换对象中所有 blob URLs 为 base64 */
async function convertBlobUrls(obj: unknown): Promise<unknown> {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return Promise.all(obj.map((item) => convertBlobUrls(item)));
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'imageUrl' && typeof value === 'string' && value.startsWith('blob:')) {
        result[key] = await blobToBase64(value);
      } else if (key === 'images' && Array.isArray(value)) {
        result[key] = await Promise.all(
          value.map((v: string) => (v.startsWith('blob:') ? blobToBase64(v) : Promise.resolve(v))),
        );
      } else if (typeof value === 'string' && value.startsWith('blob:')) {
        result[key] = await blobToBase64(value);
      } else if (typeof value === 'object') {
        result[key] = await convertBlobUrls(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}

export async function generateJimengVideo(params: {
  prompt: string;
  model: string;
  imageUrl?: string;
  images?: string[];
  videoMode?: 'image2video' | 'frames2video' | 'multiframe2video' | 'multimodal2video';
  duration?: number;
  ratio?: string;
  nodeId?: string;
}) {
  const convertedParams = await convertBlobUrls(params);

  const data = await fetchJimengApi('/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(convertedParams),
  });

  if (!data.ok && data.submitId) {
    return data as {
      ok: false;
      message: string;
      submitId: string;
      genStatus: string;
    };
  }

  if (!data.ok) {
    const message =
      (data.message as string) ||
      (data.detail as string) ||
      (data.stderr as string) ||
      '即梦视频生成失败';
    const err = new Error(message) as Error & {
      loginRequired?: boolean;
      detail?: unknown;
      stderr?: unknown;
    };
    err.loginRequired =
      data.loginRequired === true ||
      String(data.detail || data.stderr || data.message || '').includes('dreamina login');
    err.detail = data.detail;
    err.stderr = data.stderr;
    throw err;
  }

  return data as { ok: true; videoUrl: string; filename: string };
}

/** 查询即梦任务进度 */
export async function queryJimengTask(submitId: string) {
  return fetchJimengApi('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submitId }),
  });
}

export async function generateJimengImage(params: {
  prompt: string;
  model: string;
  imageUrl?: string;
  ratio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  nodeId?: string;
}) {
  const convertedParams = await convertBlobUrls(params);

  const data = await fetchJimengApi('/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(convertedParams),
  });

  if (!data.ok) {
    throw new Error((data.message as string) || (data.detail as string) || '即梦图片生成失败');
  }

  return data as {
    ok: true;
    imageUrl: string;
    imageUrls?: string[];
    count?: number;
    filename: string;
  };
}
