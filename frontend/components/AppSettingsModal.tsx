import React, { memo } from 'react';

export type SettingsTab = 'api' | 'presets' | 'downloads' | 'credits' | 'appearance';

export type AppSettingsModalProps = {
  open: boolean;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  /** 画布内完整设置面板；首页传 undefined 时使用占位文案 */
  children?: React.ReactNode;
};

const TAB_LABELS: Record<SettingsTab, string> = {
  api: '⚡ API',
  presets: '📋 预设',
  downloads: '📥 下载路径',
  credits: '💰 积分消耗',
  appearance: '🎨 外观',
};

const TAB_PLACEHOLDER: Record<SettingsTab, string> = {
  api: 'API 设置 — 配置各 AI 服务的 API Key 和 Base URL。配置完成后在画布节点中即可调用对应模型。',
  presets: '预设管理 — 管理文生图、图生图的提示词预设模板。',
  downloads: '下载路径 — 设置图片导出和项目备份的默认存储位置。',
  credits: '积分消耗 — 查看各模型的积分消耗和定价信息。',
  appearance: '外观设置 — 自定义画布背景样式、颜色主题等视觉偏好。',
};

export const AppSettingsModal = memo(function AppSettingsModal({
  open,
  tab,
  onTabChange,
  onClose,
  children,
}: AppSettingsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e1e] rounded-2xl p-0 w-[900px] h-[82vh] overflow-hidden flex shadow-2xl border border-[#333]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-[200px] shrink-0 bg-[#171717] border-r border-[#333] p-3 flex flex-col gap-2">
          {(Object.keys(TAB_LABELS) as SettingsTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTabChange(t)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${tab === t ? 'bg-[#9040F0] text-white' : 'text-[#F5F5F5] hover:bg-[#3A3A3A] hover:text-white'}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {children ?? (
            <p className="text-sm text-[#F5F5F5] leading-relaxed">{TAB_PLACEHOLDER[tab]}</p>
          )}
        </div>
      </div>
    </div>
  );
});
