import React from 'react';
import type { PresetDomainId } from './canvasNodeRenderState';
import {
  COMMON_TEMPLATE_KEY,
  T2I_PRESET_CATEGORY_OPTIONS,
  T2I_PRESET_FLAT,
  T2iPresetCategoryId,
  t2iCategoryForPreset,
  t2iPresetListForCategory,
} from './promptPresetCatalog';

export function T2iPresetCategorySelect({
  nodeId,
  activePresets,
  promptPresets,
  presetDomainOverrides,
  onTogglePreset,
  onClearPreset,
}: {
  nodeId: string;
  activePresets?: string[];
  promptPresets: Record<string, string>;
  presetDomainOverrides: Record<string, PresetDomainId>;
  onTogglePreset: (nodeId: string, presetKey: string) => void;
  onClearPreset: (nodeId: string) => void;
}) {
  const [category, setCategory] = React.useState<T2iPresetCategoryId>(() => {
    const first = activePresets?.[0];
    return first ? t2iCategoryForPreset(first) : 'storyboard';
  });

  React.useEffect(() => {
    const first = activePresets?.[0];
    if (first) {
      setCategory(t2iCategoryForPreset(first));
    }
  }, [activePresets]);

  const list = React.useMemo(
    () => t2iPresetListForCategory(category, promptPresets, presetDomainOverrides),
    [category, promptPresets, presetDomainOverrides]
  );

  const activeSet = new Set(activePresets ?? []);
  const commonTemplateActive = activeSet.has(COMMON_TEMPLATE_KEY);
  const hasActivePresets = activePresets && activePresets.length > 0;

  return (
    <div className="flex flex-col gap-1.5 p-2 shrink-0 border-b border-[#333]" style={{ fontSize: 45 }}>
      {hasActivePresets && (
        <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-purple-900/40 to-pink-900/40 rounded border border-purple-600/50">
          <span className="text-gray-400 font-medium" style={{ fontSize: 45 }}>预设:</span>
          <div className="flex flex-wrap gap-1">
            {activePresets!.map(k => (
              <span key={k} className="text-xs text-white font-bold">
                {(T2I_PRESET_FLAT.find(p => p.key === k)?.label ?? k)}
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
          className="t2i-preset-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500 min-w-[72px]"
          style={{ fontSize: 30 }}
          value={category}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setCategory(e.target.value as T2iPresetCategoryId);
          }}
        >
          {T2I_PRESET_CATEGORY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} style={{ fontSize: 30 }}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-gray-500 shrink-0" style={{ fontSize: 45 }}>预设</span>
        <select
          className="t2i-preset-select flex-1 min-w-[140px] bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500"
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
          className="t2i-preset-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-purple-500 min-w-[72px]"
          style={{ fontSize: '45px !important', color: commonTemplateActive ? '#a855f7' : undefined }}
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
