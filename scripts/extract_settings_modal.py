from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
lines = (root / "CanvasApp.tsx").read_text(encoding="utf-8").splitlines()

# 1-based: 6723-7818 unified settings + pwd modals
block = lines[6722:7818]
body = "\n".join(block)
# unwrap outer conditional — component handles open prop
body = body.replace("{showSettingsModal && (", "", 1)
if body.rstrip().endswith(")}"):
    body = body.rstrip()[:-2].rstrip()

header = '''import React, { memo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AiProvider } from '../services/aiSettings';
import {
  DEFAULT_CODESONLINE_CHAT_BASE_URL,
  DEFAULT_CODESONLINE_IMAGE_BASE_URL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_JUNLAN_BASE_URL,
  DEFAULT_MANXUE_BASE_URL,
  DEFAULT_MINIMAX_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_AIID_BASE_URL,
  persistAiSettings,
  setCodesonlineChatKey,
} from '../services/aiSettings';
import {
  saveDownloadPathSettings,
  type DownloadPathPersisted,
} from '../services/downloadPathSettings';
import type { CreditPricingRow } from '../services/creditPricing';
import { newCreditPricingRow } from '../services/creditPricing';
import {
  pickCombinedDownloadDirectory,
  pickImageDownloadDirectory,
  pickVideoDownloadDirectory,
  clearDownloadHandleCache,
} from '../services/downloadDirectoryHandles';
import type { PresetDomainId, I2iPresetCategoryId } from './canvasNodeRenderState';
import type { T2iPresetCategoryId } from './promptPresetCatalog';
import {
  COMMON_TEMPLATE_KEY,
  PRESET_DOMAIN_TAB_OPTIONS,
  I2I_PRESET_CATEGORY_OPTIONS,
  T2I_PRESET_CATEGORY_OPTIONS,
  settingsPresetDomain,
  settingsPresetCategory,
  defaultPresetDomain,
} from './promptPresetCatalog';
import type { SettingsTab } from '../components/AppSettingsModal';

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

export type SettingsPresetPwdIntent =
  | { type: 'copy'; content: string }
  | { type: 'rename'; name: string }
  | { type: 'delete'; name: string }
  | { type: 'add' };

export type CanvasSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  settingsPresetDomainTab: PresetDomainId;
  setSettingsPresetDomainTab: Dispatch<SetStateAction<PresetDomainId>>;
  settingsPresetCategoryTab: I2iPresetCategoryId;
  setSettingsPresetCategoryTab: Dispatch<SetStateAction<I2iPresetCategoryId>>;
  settingsT2iPresetCategoryTab: T2iPresetCategoryId;
  setSettingsT2iPresetCategoryTab: Dispatch<SetStateAction<T2iPresetCategoryId>>;
  settingsPresetAuthSession: boolean;
  setSettingsPresetAuthSession: Dispatch<SetStateAction<boolean>>;
  settingsPresetPwdModal: { intent: SettingsPresetPwdIntent | null; input: string };
  setSettingsPresetPwdModal: Dispatch<
    SetStateAction<{ intent: SettingsPresetPwdIntent | null; input: string }>
  >;
  settingsCreditsAuthSession: boolean;
  setSettingsCreditsAuthSession: Dispatch<SetStateAction<boolean>>;
  settingsCreditsPwdModal: { open: boolean; input: string };
  setSettingsCreditsPwdModal: Dispatch<SetStateAction<{ open: boolean; input: string }>>;
  downloadPathSettings: DownloadPathPersisted;
  setDownloadPathSettings: Dispatch<SetStateAction<DownloadPathPersisted>>;
  downloadDirLabels: { combined?: string; image?: string; video?: string };
  refreshDownloadDirLabels: () => void;
  creditPricingRows: CreditPricingRow[];
  setCreditPricingRows: Dispatch<SetStateAction<CreditPricingRow[]>>;
  apiKeyInput: string;
  setApiKeyInput: Dispatch<SetStateAction<string>>;
  aiProvider: AiProvider;
  setAiProvider: Dispatch<SetStateAction<AiProvider>>;
  openAiBaseInput: string;
  deepSeekKeyInput: string;
  setDeepSeekKeyInput: Dispatch<SetStateAction<string>>;
  deepSeekBaseInput: string;
  junlanBaseInput: string;
  junlanKeyInput: string;
  setJunlanKeyInput: Dispatch<SetStateAction<string>>;
  codesonlineBaseInput: string;
  codesonlineKeyInput: string;
  setCodesonlineKeyInput: Dispatch<SetStateAction<string>>;
  codesonlineChatKeyInput: string;
  setCodesonlineChatKeyInput: Dispatch<SetStateAction<string>>;
  manxueBaseInput: string;
  manxueKeyInput: string;
  setManxueKeyInput: Dispatch<SetStateAction<string>>;
  minimaxBaseInput: string;
  minimaxKeyInput: string;
  setMiniMaxKeyInput: Dispatch<SetStateAction<string>>;
  aiidBaseInput: string;
  aiidKeyInput: string;
  setAiidKeyInput: Dispatch<SetStateAction<string>>;
  promptPresets: Record<string, string>;
  setPromptPresets: Dispatch<SetStateAction<Record<string, string>>>;
  promptPresetDomainOverrides: Record<string, PresetDomainId>;
  setPromptPresetDomainOverrides: Dispatch<SetStateAction<Record<string, PresetDomainId>>>;
  promptPresetCategoryOverrides: Record<string, I2iPresetCategoryId>;
  setPromptPresetCategoryOverrides: Dispatch<SetStateAction<Record<string, I2iPresetCategoryId>>>;
  canvasBgStyle: 'dots' | 'grid' | 'none';
  setCanvasBgStyle: Dispatch<SetStateAction<'dots' | 'grid' | 'none'>>;
  canvasBgColor: 'dark' | 'black';
  setCanvasBgColor: Dispatch<SetStateAction<'dark' | 'black'>>;
  executePresetCopy: (content: string) => void;
  executePresetAdd: () => void;
  executePresetRename: (name: string) => void;
  executePresetDelete: (name: string) => void;
  confirmSettingsPresetPassword: () => void;
  confirmSettingsCreditsPassword: () => void;
};

function resetAuthOnTabChange(p: CanvasSettingsModalProps) {
  p.setSettingsPresetAuthSession(false);
  p.setSettingsPresetPwdModal({ intent: null, input: '' });
  p.setSettingsCreditsPwdModal({ open: false, input: '' });
  p.setSettingsCreditsAuthSession(false);
}

export const CanvasSettingsModal = memo(function CanvasSettingsModal(p: CanvasSettingsModalProps) {
  if (!p.open) return null;

  const {
    onClose,
    settingsTab,
    setSettingsTab,
    settingsPresetDomainTab,
    setSettingsPresetDomainTab,
    settingsPresetCategoryTab,
    setSettingsPresetCategoryTab,
    settingsT2iPresetCategoryTab,
    setSettingsT2iPresetCategoryTab,
    settingsPresetAuthSession,
    setSettingsPresetAuthSession,
    settingsPresetPwdModal,
    setSettingsPresetPwdModal,
    settingsCreditsAuthSession,
    setSettingsCreditsAuthSession,
    settingsCreditsPwdModal,
    setSettingsCreditsPwdModal,
    downloadPathSettings,
    setDownloadPathSettings,
    downloadDirLabels,
    refreshDownloadDirLabels,
    creditPricingRows,
    setCreditPricingRows,
    apiKeyInput,
    setApiKeyInput,
    aiProvider,
    setAiProvider,
    openAiBaseInput,
    deepSeekKeyInput,
    setDeepSeekKeyInput,
    deepSeekBaseInput,
    junlanBaseInput,
    junlanKeyInput,
    setJunlanKeyInput,
    codesonlineBaseInput,
    codesonlineKeyInput,
    setCodesonlineKeyInput,
    codesonlineChatKeyInput,
    setCodesonlineChatKeyInput,
    manxueBaseInput,
    manxueKeyInput,
    setManxueKeyInput,
    minimaxBaseInput,
    minimaxKeyInput,
    setMiniMaxKeyInput,
    aiidBaseInput,
    aiidKeyInput,
    setAiidKeyInput,
    promptPresets,
    setPromptPresets,
    promptPresetDomainOverrides,
    setPromptPresetDomainOverrides,
    promptPresetCategoryOverrides,
    setPromptPresetCategoryOverrides,
    canvasBgStyle,
    setCanvasBgStyle,
    canvasBgColor,
    setCanvasBgColor,
    executePresetCopy,
    executePresetAdd,
    executePresetRename,
    executePresetDelete,
    confirmSettingsPresetPassword,
    confirmSettingsCreditsPassword,
  } = p;

  return (
'''

footer = '''
  );
});
'''

# Replace setShowSettingsModal(false) with onClose()
body = body.replace("setShowSettingsModal(false)", "onClose()")
body = body.replace("showSettingsModal", "p.open")

out = header + body + footer
(root / "canvas" / "CanvasSettingsModal.tsx").write_text(out, encoding="utf-8")
print("Wrote CanvasSettingsModal.tsx", len(out.splitlines()), "lines")
