/**
 * 设置 → 积分消耗：各模型档位展示积分（本地持久化，供界面展示与后续计费逻辑读取）。
 */

const LS_KEY = 'ai-canvas-credit-pricing-v1';

export type CreditPricingRow = {
  id: string;
  /** 业务分类，如「图生图」 */
  category: string;
  modelName: string;
  /** 分辨率或档位说明，如 2k/4k、2k */
  specLabel: string;
  credits: number;
};

export const DEFAULT_CREDIT_PRICING_ROWS: CreditPricingRow[] = [
  {
    id: 'default-row-gpt-image-2',
    category: '图生图',
    modelName: 'gpt-image-2',
    specLabel: '2k/4k',
    credits: 4,
  },
  {
    id: 'default-row-gpt-image-2-junlan',
    category: '图生图',
    modelName: 'gpt-image-2-junlan',
    specLabel: '君澜',
    credits: 4,
  },
  {
    id: 'default-row-nano-banana-pro',
    category: '图生图',
    modelName: 'nano_banana_pro',
    specLabel: '2k/4k',
    credits: 10,
  },
  {
    id: 'default-row-firefly-nano-banana-pro-newapi',
    category: '图生图',
    modelName: 'firefly-nano-banana-pro-newapi',
    specLabel: 'New API',
    credits: 10,
  },
  {
    id: 'default-row-firefly-nano-banana2-newapi',
    category: '图生图',
    modelName: 'firefly-nano-banana2-newapi',
    specLabel: 'New API',
    credits: 10,
  },
  {
    id: 'default-row-gemini-31-flash-2k',
    category: '图生图',
    modelName: 'gemini-3.1-flash-image-preview',
    specLabel: '2k',
    credits: 6,
  },
  {
    id: 'default-row-gemini-31-flash-4k',
    category: '图生图',
    modelName: 'gemini-3.1-flash-image-preview',
    specLabel: '4k',
    credits: 8,
  },
  {
    id: 'default-row-na-grok-imagine-video',
    category: '视频生成',
    modelName: 'grok-imagine-video-newapi',
    specLabel: 'New API',
    credits: 20,
  },
  {
    id: 'default-row-na-firefly-veo31-ref',
    category: '视频生成',
    modelName: 'firefly-veo31-ref-newapi',
    specLabel: 'New API',
    credits: 20,
  },
  {
    id: 'default-row-na-firefly-sora2',
    category: '视频生成',
    modelName: 'firefly-sora2-newapi',
    specLabel: 'New API',
    credits: 20,
  },
  {
    id: 'default-row-na-firefly-sora2-pro',
    category: '视频生成',
    modelName: 'firefly-sora2-pro-newapi',
    specLabel: 'New API',
    credits: 24,
  },
  {
    id: 'default-row-na-firefly-kling30omni',
    category: '视频生成',
    modelName: 'firefly-kling30omni-newapi',
    specLabel: 'New API',
    credits: 20,
  },
  {
    id: 'default-row-na-firefly-kling30',
    category: '视频生成',
    modelName: 'firefly-kling30-newapi',
    specLabel: 'New API',
    credits: 18,
  },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRow(v: unknown): CreditPricingRow | null {
  if (!isRecord(v)) return null;
  const id = typeof v.id === 'string' && v.id.trim() ? v.id.trim() : '';
  const category = typeof v.category === 'string' ? v.category : '';
  const modelName = typeof v.modelName === 'string' ? v.modelName : '';
  const specLabel = typeof v.specLabel === 'string' ? v.specLabel : '';
  const creditsRaw = v.credits;
  const credits =
    typeof creditsRaw === 'number' && Number.isFinite(creditsRaw)
      ? Math.max(0, Math.round(creditsRaw))
      : typeof creditsRaw === 'string' && creditsRaw.trim() !== ''
        ? Math.max(0, Math.round(Number(creditsRaw)))
        : 0;
  if (!id) return null;
  return { id, category, modelName, specLabel, credits };
}

export function loadCreditPricingRows(): CreditPricingRow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_CREDIT_PRICING_ROWS.map((r) => ({ ...r }));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_CREDIT_PRICING_ROWS.map((r) => ({ ...r }));
    }
    const rows: CreditPricingRow[] = [];
    for (const item of parsed) {
      const row = parseRow(item);
      if (row) rows.push(row);
    }
    return rows.length > 0 ? rows : DEFAULT_CREDIT_PRICING_ROWS.map((r) => ({ ...r }));
  } catch {
    return DEFAULT_CREDIT_PRICING_ROWS.map((r) => ({ ...r }));
  }
}

export function saveCreditPricingRows(rows: CreditPricingRow[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch (e) {
    console.warn('保存积分消耗表失败', e);
  }
}

export function newCreditPricingRow(partial?: Partial<CreditPricingRow>): CreditPricingRow {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    category: partial?.category ?? '图生图',
    modelName: partial?.modelName ?? '',
    specLabel: partial?.specLabel ?? '',
    credits: typeof partial?.credits === 'number' && Number.isFinite(partial.credits)
      ? Math.max(0, Math.round(partial.credits))
      : 0,
  };
}
