import type { PresetDomainId, I2iPresetCategoryId } from './canvasNodeRenderState';

export type T2iPresetCategoryId = 'storyboard' | 'other';

/** 图生图预设：按「角色 / 场景 / 道具 / 故事板 / 其他」分类，供下拉选择 */
export const I2I_PRESET_CATEGORY_OPTIONS: { id: I2iPresetCategoryId; label: string }[] = [
  { id: 'character', label: '角色' },
  { id: 'scene', label: '场景' },
  { id: 'props', label: '道具' },
  { id: 'storyboard', label: '故事板' },
  { id: 'other', label: '其他' },
];

/** 通用模板预设键 */
export const COMMON_TEMPLATE_KEY = '通用模板';

/** 文生图预设分类——只保留故事板，通用模板以独立下拉框存在 */
export const T2I_PRESET_CATEGORY_OPTIONS: { id: T2iPresetCategoryId; label: string }[] = [
  { id: 'storyboard', label: '故事板' },
  { id: 'other', label: '其他' },
];

export const I2I_PRESETS_BY_CATEGORY: Record<I2iPresetCategoryId, { key: string; label: string }[]> = {
  character: [
    { key: '角色4视图', label: '角色4视图' },
    { key: '角色6视图', label: '角色6视图' },
    { key: '角色8视图', label: '角色8视图' },
    { key: '角色无头视图', label: '角色无头视图' },
    { key: '角色细节图', label: '角色细节图' },
    { key: '角色身高比例图', label: '角色身高比例图' },
    { key: '角色刷光', label: '角色刷光' },
  ],
  scene: [
    { key: '场景四视图', label: '场景四视图' },
    { key: '场景9视图', label: '场景9视图' },
    { key: '场景9宫格_1人', label: '场景9宫格_1人' },
    { key: '场景九视图', label: '场景九视图' },
    { key: '场景反打及细节', label: '场景反打及细节' },
  ],
  props: [
    { key: '道具拆分', label: '道具拆分' },
    { key: '道具5视图', label: '道具5视图' },
    { key: '道具9宫格_1人', label: '道具9宫格_1人' },
    { key: '道具转线稿色块', label: '道具转线稿色块' },
    { key: '道具转超写实', label: '道具转超写实' },
    { key: '道具转白模', label: '道具转白模' },
  ],
  storyboard: [
    { key: '故事板_A', label: '故事板_A' },
    { key: '故事板_B', label: '故事板_B' },
    { key: '故事板_CCC', label: '故事板_CCC' },
    { key: 'CCCC_故事板简化版', label: 'CCCC_故事板简化版' },
    { key: '线稿故事板', label: '线稿故事板' },
  ],
  other: [
    { key: '故事九宫格', label: '故事九宫格' },
    { key: '主图多机位', label: '主图多机位' },
    { key: '高清放大4K', label: '高清放大' },
  ],
};

export const I2I_PRESET_FLAT = (Object.keys(I2I_PRESETS_BY_CATEGORY) as I2iPresetCategoryId[]).flatMap(
  (id) => I2I_PRESETS_BY_CATEGORY[id]
);

/** 文生图预设分类数据——只包含故事板预设 */
export const T2I_PRESETS_BY_CATEGORY: Record<T2iPresetCategoryId, { key: string; label: string }[]> = {
  storyboard: [
    { key: '故事板_A', label: '故事板_A' },
    { key: '故事板_B', label: '故事板_B' },
    { key: '故事板_CCC', label: '故事板_CCC' },
    { key: 'CCCC_故事板简化版', label: 'CCCC_故事板简化版' },
    { key: '线稿故事板', label: '线稿故事板' },
  ],
  other: [
    { key: '主图多机位', label: '主图多机位' },
  ],
};

export const T2I_PRESET_FLAT = (Object.keys(T2I_PRESETS_BY_CATEGORY) as T2iPresetCategoryId[]).flatMap(
  (id) => T2I_PRESETS_BY_CATEGORY[id]
);

export function t2iCategoryForPreset(preset: string | undefined): T2iPresetCategoryId {
  if (!preset) return 'storyboard';
  for (const id of Object.keys(T2I_PRESETS_BY_CATEGORY) as T2iPresetCategoryId[]) {
    if (T2I_PRESETS_BY_CATEGORY[id].some((p) => p.key === preset)) return id;
  }
  return 'storyboard';
}

export function i2iCategoryForPreset(preset: string | undefined): I2iPresetCategoryId {
  if (!preset) return 'character';
  for (const id of Object.keys(I2I_PRESETS_BY_CATEGORY) as I2iPresetCategoryId[]) {
    if (I2I_PRESETS_BY_CATEGORY[id].some((p) => p.key === preset)) return id;
  }
  return 'other';
}

/** 设置页预设分类：内置名走图生图规则，用户可覆盖 */
export function settingsPresetCategory(
  name: string,
  overrides: Record<string, I2iPresetCategoryId>
): I2iPresetCategoryId {
  return overrides[name] ?? i2iCategoryForPreset(name);
}

/** 设置页预设顶层大类：对话 / 文生图 / 图生图 */

/** 设置页预设顶层大类：对话 / 文生图 / 图生图 */
export const PRESET_DOMAIN_TAB_OPTIONS: { id: PresetDomainId; label: string }[] = [
  { id: 'chat', label: 'AI对话' },
  { id: 't2i', label: '文生图' },
  { id: 'i2i', label: '图生图' },
];

/** 内置 AI 对话快捷预设键（与对话节点按钮一致，默认归入 AI对话 类） */
export const DEFAULT_CHAT_PRESET_KEYS = new Set([
  'AAAA_全能资产',
  '反推提示词',
  'BBBB_全能资产',
  'EEEE_备选万能资产',
  'CCC即梦分镜',
  'CCC即梦视频',
]);

/** 内置文生图预设键（默认归入文生图类） */
export const DEFAULT_T2I_PRESET_KEYS = new Set([
  '通用模板',
  '真人写实',
  '真人古风',
  '古风国漫3D',
  '游戏cg动画',
  '二维新海诚',
  '赛博朋克',
]);

/** 内置图生图预设键（默认归入图生图类，包含故事板） */
export const DEFAULT_I2I_PRESET_KEYS = new Set([
  '故事板_A',
  '故事板_B',
  '故事板_CCC',
]);

export function defaultPresetDomain(name: string): PresetDomainId {
  if (DEFAULT_CHAT_PRESET_KEYS.has(name)) return 'chat';
  if (DEFAULT_T2I_PRESET_KEYS.has(name)) return 't2i';
  if (DEFAULT_I2I_PRESET_KEYS.has(name)) return 'i2i';
  return 'i2i';
}

export function settingsPresetDomain(name: string, overrides: Record<string, PresetDomainId>): PresetDomainId {
  return overrides[name] ?? defaultPresetDomain(name);
}

/** 图生图下拉：与设置共用 promptPresets，按分类（含设置里覆盖）列出 */
export function i2iPresetListForCategory(
  cat: I2iPresetCategoryId,
  promptPresets: Record<string, string>,
  domainOverrides: Record<string, PresetDomainId>,
  categoryOverrides: Record<string, I2iPresetCategoryId>
): { key: string; label: string }[] {
  return Object.keys(promptPresets)
    .filter(
      (name) =>
        settingsPresetDomain(name, domainOverrides) === 'i2i' &&
        settingsPresetCategory(name, categoryOverrides) === cat
    )
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((name) => ({
      key: name,
      label: I2I_PRESET_FLAT.find((p) => p.key === name)?.label ?? name,
    }));
}

/** 预设是否属于「故事板」分类（故事板预设可同时出现在文生图和图生图窗口） */
export const STORYBOARD_PRESET_KEYS = new Set(['故事板_A', '故事板_B', '故事板_CCC', 'CCCC_故事板简化版', '线稿故事板']);
export function isStoryboardPreset(name: string): boolean {
  return STORYBOARD_PRESET_KEYS.has(name);
}

/** 文生图下拉：与设置共用 promptPresets，按分类列出（故事板预设也会出现） */
export function t2iPresetListForCategory(
  cat: T2iPresetCategoryId,
  promptPresets: Record<string, string>,
  domainOverrides: Record<string, PresetDomainId>
): { key: string; label: string }[] {
  return Object.keys(promptPresets)
    .filter(
      (name) =>
        name !== COMMON_TEMPLATE_KEY &&
        (settingsPresetDomain(name, domainOverrides) === 't2i' || isStoryboardPreset(name)) &&
        t2iCategoryForPreset(name) === cat &&
        isStoryboardPreset(name) // 文生图分类下拉仅展示故事板预设
    )
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((name) => ({
      key: name,
      label: T2I_PRESET_FLAT.find((p) => p.key === name)?.label ?? name,
    }));
}
