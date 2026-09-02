/** 火山方舟 Seedream 生图（Agent Plan：/api/plan/v3/images/generations） */

export const VOLCENGINE_ARK_SEEDREAM_LITE_UI_ID = 'doubao-seedream-5.0-lite-ark';
export const VOLCENGINE_ARK_SEEDREAM_LITE_UPSTREAM_ID = 'doubao-seedream-5.0-lite';

export function isVolcengineArkSeedreamImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === VOLCENGINE_ARK_SEEDREAM_LITE_UI_ID ||
    m === VOLCENGINE_ARK_SEEDREAM_LITE_UPSTREAM_ID ||
    m === 'doubao-seedream-5.0-lite-ark'
  );
}

export function resolveVolcengineArkSeedreamUpstreamModelId(modelName: string): string {
  if (isVolcengineArkSeedreamImageModel(modelName)) return VOLCENGINE_ARK_SEEDREAM_LITE_UPSTREAM_ID;
  return (modelName || '').trim() || VOLCENGINE_ARK_SEEDREAM_LITE_UPSTREAM_ID;
}

/** 开发走 Vite 代理；生产走 Vercel Serverless 代理（均映射到 /api/plan/v3） */
export function volcengineArkSeedreamFetchBase(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/volcengine-ark-proxy';
  }
  return '/volcengine-ark-api';
}

/**
 * Seedream 5.0 lite 尺寸：优先像素 WxH（比仅写 2K/3K 更能锁定画幅）。
 * 像素落在官方推荐区间内。
 */
export function volcengineArkSeedreamSize(aspectRatio: string, nodeResolution?: string): string {
  const band = (nodeResolution || '2k').toLowerCase();
  const use3k = band === '4k';
  const table2k: Record<string, string> = {
    '1:1': '2048x2048',
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3024x1296',
    '9:21': '1296x3024',
    '2:1': '2560x1280',
    '1:2': '1280x2560',
  };
  const table3k: Record<string, string> = {
    '1:1': '3072x3072',
    '16:9': '3072x1728',
    '9:16': '1728x3072',
    '4:3': '2880x2160',
    '3:4': '2160x2880',
    '3:2': '2880x1920',
    '2:3': '1920x2880',
    '21:9': '3360x1440',
    '9:21': '1440x3360',
    '2:1': '3072x1536',
    '1:2': '1536x3072',
  };
  const key = (aspectRatio || '1:1').trim();
  const table = use3k ? table3k : table2k;
  return table[key] || (use3k ? '3072x3072' : '2048x2048');
}

/** Seedream 接受公网 URL 或 data URI；裸 base64 补前缀 */
export function toVolcengineArkSeedreamImageInput(raw: string): string {
  const t = (raw || '').trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t) || /^data:image\//i.test(t)) return t;
  const bare = t.replace(/^data:image\/\w+;base64,/i, '');
  return `data:image/jpeg;base64,${bare}`;
}
