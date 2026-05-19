const JIMENG_SERVER = "http://localhost:3107";

export async function checkJimengCli() {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/health`);
  return res.json();
}

export async function checkJimengSession() {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/session`);
  return res.json();
}

export async function startJimengLogin() {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/login/start`, {
    method: "POST"
  });

  return res.json();
}

export function getJimengLoginScreenshotUrl() {
  return `${JIMENG_SERVER}/api/jimeng/login/screenshot?t=${Date.now()}`;
}

export async function checkJimengLoginStatus() {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/login/status`);
  return res.json();
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
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/video/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
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
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/query`, {
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
  width?: number;
  height?: number;
  nodeId?: string;
}) {
  const res = await fetch(`${JIMENG_SERVER}/api/jimeng/image/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.message || data.detail || "即梦图片生成失败");
  }

  return data as {
    ok: true;
    imageUrl: string;
    filename: string;
  };
}
