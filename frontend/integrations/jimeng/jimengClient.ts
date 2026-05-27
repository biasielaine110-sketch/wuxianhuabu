const JIMENG_SERVER = "/api/jimeng";

export async function checkJimengCli() {
  const res = await fetch(`${JIMENG_SERVER}/health`);
  return res.json();
}

export async function checkJimengSession() {
  const res = await fetch(`${JIMENG_SERVER}/session`);
  return res.json();
}

export async function startJimengLogin() {
  const res = await fetch(`${JIMENG_SERVER}/login/start`, {
    method: "POST"
  });

  return res.json();
}

export function getJimengLoginScreenshotUrl() {
  return `${JIMENG_SERVER}/login/screenshot?t=${Date.now()}`;
}

export async function checkJimengLoginStatus() {
  const res = await fetch(`${JIMENG_SERVER}/login/status`);
  return res.json();
}

export async function logoutJimeng() {
  const res = await fetch(`${JIMENG_SERVER}/logout`, { method: "POST" });
  return res.json();
}

export async function reloginJimeng() {
  const res = await fetch(`${JIMENG_SERVER}/relogin`, { method: "POST" });
  return res.json();
}

export async function installOpencli() {
  const res = await fetch(`${JIMENG_SERVER}/install-opencli`, { method: "POST" });
  return res.json();
}

export async function setupWSL() {
  const res = await fetch(`${JIMENG_SERVER}/setup-wsl`, { method: "POST" });
  return res.json();
}

export async function upscaleJimengImage(imageUrl: string, scale: number = 2) {
  // 将 blob URL 转换为 base64 data URL
  const convertedImageUrl = imageUrl.startsWith('blob:') ? await blobToBase64(imageUrl) : imageUrl;

  const res = await fetch(`${JIMENG_SERVER}/image/upscale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: convertedImageUrl, scale })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || "智能超清失败");
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
    return blobUrl; // 转换失败时返回原始 URL
  }
}

/** 递归转换对象中所有 blob URLs 为 base64 */
async function convertBlobUrls(obj: any): Promise<any> {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => convertBlobUrls(item)));
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'imageUrl' && typeof value === 'string' && value.startsWith('blob:')) {
        result[key] = await blobToBase64(value);
      } else if (key === 'images' && Array.isArray(value)) {
        result[key] = await Promise.all(value.map((v: string) =>
          v.startsWith('blob:') ? blobToBase64(v) : Promise.resolve(v)
        ));
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
  // 将所有 blob URLs 转换为 base64 data URLs（blob 只能在浏览器内访问，服务器无法 fetch）
  const convertedParams = await convertBlobUrls(params);

  const res = await fetch(`${JIMENG_SERVER}/video/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(convertedParams)
  });

  const data = await res.json();

  // 任务仍在生成中（队列中），返回 submitId 让调用方自行轮询
  if (!data.ok && data.submitId) {
    return data as {
      ok: false;
      message: string;
      submitId: string;
      genStatus: string;
    };
  }

  if (!data.ok) {
    const message = data.message || data.detail || data.stderr || "即梦视频生成失败";
    const err: any = new Error(message);
    (err as any).loginRequired =
      data.loginRequired === true ||
      String(data.detail || data.stderr || data.message || "").includes("dreamina login");
    (err as any).detail = data.detail;
    (err as any).stderr = data.stderr;
    throw err;
  }

  return data as {
    ok: true;
    videoUrl: string;
    filename: string;
  };
}

/** 查询即梦任务进度 */
export async function queryJimengTask(submitId: string) {
  const res = await fetch(`${JIMENG_SERVER}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submitId }),
  });
  return res.json();
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
  // 将所有 blob URLs 转换为 base64 data URLs
  const convertedParams = await convertBlobUrls(params);

  const res = await fetch(`${JIMENG_SERVER}/image/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(convertedParams)
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.message || data.detail || "即梦图片生成失败");
  }

  return data as {
    ok: true;
    imageUrl: string;
    imageUrls?: string[];
    count?: number;
    filename: string;
  };
}
