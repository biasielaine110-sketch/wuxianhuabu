import React from 'react';
import type { PresetDomainId, I2iPresetCategoryId } from './canvasNodeRenderState';
import {
  COMMON_TEMPLATE_KEY,
  I2I_PRESET_CATEGORY_OPTIONS,
  I2I_PRESET_FLAT,
  i2iPresetListForCategory,
  settingsPresetCategory,
} from './promptPresetCatalog';

export function I2iPresetCategorySelect({
  nodeId,
  activePresets,
  promptPresets,
  presetDomainOverrides,
  presetCategoryOverrides,
  onTogglePreset,
  onClearPreset,
}: {
  nodeId: string;
  activePresets?: string[];
  promptPresets: Record<string, string>;
  presetDomainOverrides: Record<string, PresetDomainId>;
  presetCategoryOverrides: Record<string, I2iPresetCategoryId>;
  onTogglePreset: (nodeId: string, presetKey: string) => void;
  onClearPreset: (nodeId: string) => void;
}) {
  const [category, setCategory] = React.useState<I2iPresetCategoryId>(() => {
    const first = activePresets?.[0];
    return first ? settingsPresetCategory(first, presetCategoryOverrides) : 'character';
  });

  React.useEffect(() => {
    const first = activePresets?.[0];
    if (first) {
      setCategory(settingsPresetCategory(first, presetCategoryOverrides));
    }
  }, [activePresets, presetCategoryOverrides]);

  const list = React.useMemo(
    () => i2iPresetListForCategory(category, promptPresets, presetDomainOverrides, presetCategoryOverrides),
    [category, promptPresets, presetDomainOverrides, presetCategoryOverrides]
  );

  const activeSet = new Set(activePresets ?? []);
  const commonTemplateActive = activeSet.has(COMMON_TEMPLATE_KEY);
  const hasActivePresets = activePresets && activePresets.length > 0;

  return (
    <div className="flex flex-col gap-1.5 p-2 shrink-0 border-b border-[#333]" style={{ fontSize: 45 }}>
      {hasActivePresets && (
        <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 rounded border border-cyan-600/50">
          <span className="text-gray-400 font-medium" style={{ fontSize: 45 }}>预设:</span>
          <div className="flex flex-wrap gap-1">
            {activePresets!.map(k => (
              <span key={k} className="text-xs text-white font-bold">
                {(I2I_PRESET_FLAT.find(p => p.key === k)?.label ?? k) + (k === COMMON_TEMPLATE_KEY ? '' : '')}
              </span>
            ))}
          </div>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onClearPreset(nodeId);
            }}
            className="ml-auto text-[10px] text-gray-400 hover:text-white px-1 py-0.5 rounded hover:bg-white/10"
          >
            清除
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500 shrink-0" style={{ fontSize: 45 }}>分类</span>
        <select
          className="i2i-preset-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-amber-500 min-w-[72px]"
          style={{ fontSize: 30 }}
          value={category}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setCategory(e.target.value as I2iPresetCategoryId);
          }}
        >
          {I2I_PRESET_CATEGORY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} style={{ fontSize: 30 }}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-gray-500 shrink-0" style={{ fontSize: 45 }}>预设</span>
        <select
          className="i2i-preset-select flex-1 min-w-[140px] bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-amber-500"
          style={{ fontSize: 30 }}
          value={activePresets?.filter(k => k !== COMMON_TEMPLATE_KEY)?.[0] ?? ''}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const key = e.target.value;
            if (key) {
              onTogglePreset(nodeId, key);
            } else if (activePresets?.length) {
              activePresets.forEach(k => onTogglePreset(nodeId, k));
            }
          }}
        >
          <option value="" style={{ fontSize: 30 }}>未使用</option>
          {list.map((p) => (
            <option key={p.key} value={p.key} style={{ fontSize: 30 }}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-gray-500 shrink-0" style={{ fontSize: 45 }}>通用模板</span>
        <select
          className="i2i-preset-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-amber-500 min-w-[72px]"
          style={{ fontSize: 30, color: commonTemplateActive ? '#06b6d4' : undefined }}
          value={commonTemplateActive ? COMMON_TEMPLATE_KEY : ''}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const key = e.target.value;
            if (key) {
              onTogglePreset(nodeId, key);
            } else if (commonTemplateActive) {
              onTogglePreset(nodeId, COMMON_TEMPLATE_KEY);
            }
          }}
        >
          <option value="" style={{ fontSize: 30 }}>未使用</option>
          <option value={COMMON_TEMPLATE_KEY} style={{ fontSize: 30 }}>通用模板</option>
          <option value="真人写实" style={{ fontSize: 30 }}>真人写实</option>
          <option value="真人古风" style={{ fontSize: 30 }}>真人古风</option>
          <option value="古风国漫3D" style={{ fontSize: 30 }}>古风国漫3D</option>
          <option value="游戏cg动画" style={{ fontSize: 30 }}>游戏cg动画</option>
          <option value="二维新海诚" style={{ fontSize: 30 }}>二维新海诚</option>
          <option value="赛博朋克" style={{ fontSize: 30 }}>赛博朋克</option>
        </select>
      </div>
    </div>
  );
}
