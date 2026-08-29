/** 阿里云百炼业务空间专属域名（用户提供的 compatible-mode 入口） */
export const ALIYUN_MAAS_ORIGIN = 'https://ws-qlxmp9rbllkaq6yy.cn-beijing.maas.aliyuncs.com';
export const DEFAULT_ALIYUN_MAAS_COMPAT_BASE_URL = `${ALIYUN_MAAS_ORIGIN}/compatible-mode/v1`;

export function isAliyunMaasChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'qwen3.7-plus-aliyun' ||
    m === 'qwen3.8-max-aliyun' ||
    m === 'qwen3-vl-plus-aliyun' ||
    m === 'deepseek-v4-pro-0813-aliyun' ||
    m === 'kimi-k3-aliyun'
  );
}

export function resolveAliyunMaasChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'qwen3.7-plus-aliyun') return 'qwen3.7-plus';
  if (m === 'qwen3.8-max-aliyun') return 'qwen3.8-max';
  if (m === 'qwen3-vl-plus-aliyun') return 'qwen3-vl-plus';
  if (m === 'deepseek-v4-pro-0813-aliyun') return 'deepseek-v4-pro-0813';
  if (m === 'kimi-k3-aliyun') return 'kimi-k3';
  return m.replace(/-aliyun$/, '');
}

export function isAliyunMaasZImageModel(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === 'z-image-turbo-aliyun' || m === 'z-image-turbo';
}

export function aliyunMaasChatFetchBase(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/aliyun-maas-proxy/compatible-mode/v1';
  }
  return '/aliyun-maas-api/compatible-mode/v1';
}

export function aliyunMaasMultimodalFetchUrl(): string {
  const path = '/api/v1/services/aigc/multimodal-generation/generation';
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return `/api/aliyun-maas-proxy${path}`;
  }
  return `/aliyun-maas-api${path}`;
}

/** Z-Image-Turbo 推荐分辨率（宽*高） */
export function aliyunZImageSize(aspectRatio: string, nodeResolution?: string): string {
  const band = (nodeResolution || '1k').toLowerCase();
  const use1536 = band === '2k' || band === '4k';
  const table1024: Record<string, string> = {
    '1:1': '1024*1024',
    '16:9': '1280*720',
    '9:16': '720*1280',
    '4:3': '1152*864',
    '3:4': '864*1152',
    '21:9': '1344*576',
    '9:21': '576*1344',
    '2:1': '1280*720',
    '3:2': '1248*832',
    '2:3': '832*1248',
  };
  const table1536: Record<string, string> = {
    '1:1': '1536*1536',
    '16:9': '2048*1152',
    '9:16': '1152*2048',
    '4:3': '1728*1296',
    '3:4': '1296*1728',
    '21:9': '2016*864',
    '9:21': '864*2016',
    '2:1': '2048*1152',
    '3:2': '1872*1248',
    '2:3': '1248*1872',
  };
  const key = (aspectRatio || '1:1').trim();
  const table = use1536 ? table1536 : table1024;
  return table[key] || (use1536 ? '1536*1536' : '1024*1024');
}
