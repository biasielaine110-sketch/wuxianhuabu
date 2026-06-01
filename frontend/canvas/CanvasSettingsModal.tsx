import React, { memo } from 'react';
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
  getAiSettingsSnapshot,
} from '../services/aiSettings';
import { initGeminiClientFromStorage } from '../services/geminiService';
import {
  clearStoredDownloadDirectory,
  pickAndStoreDownloadDirectory,
  saveDownloadPathSettings,
  supportsFileSystemAccess,
  type DownloadPathPersisted,
} from '../services/downloadPathSettings';
import type { CreditPricingRow } from '../services/creditPricingSettings';
import { newCreditPricingRow } from '../services/creditPricingSettings';
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
  i2iCategoryForPreset,
  t2iCategoryForPreset,
} from './promptPresetCatalog';
import type { SettingsTab } from '../components/AppSettingsModal';

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

const KeyIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
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
    <>
      <div
          className="fixed inset-0 z-[220] bg-black/80 flex items-center justify-center"
          onClick={() => onClose()}
        >
          <div
            className="bg-[#1e1e1e] rounded-2xl p-0 w-[900px] h-[82vh] max-h-[82vh] overflow-hidden flex shadow-2xl border border-[#333]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-[200px] shrink-0 bg-[#171717] border-r border-[#333] p-3 flex flex-col gap-2">
              <button
                onClick={() => {
                  setSettingsPresetAuthSession(false);
                  setSettingsPresetPwdModal({ intent: null, input: '' });
                  setSettingsCreditsPwdModal({ open: false, input: '' });
                  setSettingsCreditsAuthSession(false);
                  setSettingsTab('api');
                }}
                className={`text-left px-3 py-2 rounded text-sm ${settingsTab === 'api' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
              >
                API
              </button>
              <button
                onClick={() => {
                  setSettingsPresetAuthSession(false);
                  setSettingsPresetPwdModal({ intent: null, input: '' });
                  setSettingsCreditsPwdModal({ open: false, input: '' });
                  setSettingsCreditsAuthSession(false);
                  setSettingsTab('presets');
                }}
                className={`text-left px-3 py-2 rounded text-sm ${settingsTab === 'presets' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
              >
                预设
              </button>
              <button
                onClick={() => {
                  setSettingsPresetAuthSession(false);
                  setSettingsPresetPwdModal({ intent: null, input: '' });
                  setSettingsCreditsPwdModal({ open: false, input: '' });
                  setSettingsCreditsAuthSession(false);
                  setSettingsTab('downloads');
                }}
                className={`text-left px-3 py-2 rounded text-sm ${settingsTab === 'downloads' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
              >
                下载路径
              </button>
              <button
                onClick={() => {
                  setSettingsPresetAuthSession(false);
                  setSettingsPresetPwdModal({ intent: null, input: '' });
                  setSettingsTab('credits');
                }}
                className={`text-left px-3 py-2 rounded text-sm ${settingsTab === 'credits' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
              >
                积分消耗
              </button>
              <button
                onClick={() => {
                  setSettingsPresetAuthSession(false);
                  setSettingsPresetPwdModal({ intent: null, input: '' });
                  setSettingsTab('appearance');
                }}
                className={`text-left px-3 py-2 rounded text-sm ${settingsTab === 'appearance' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
              >
                外观
              </button>
            </div>
            <div className="flex flex-1 flex-col min-h-0 min-w-0 p-6">
              <div className="flex shrink-0 items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">
                  {settingsTab === 'api'
                    ? 'API 设置'
                    : settingsTab === 'presets'
                      ? '提示词预设'
                      : settingsTab === 'downloads'
                        ? '下载路径'
                        : settingsTab === 'credits'
                          ? '积分消耗'
                          : '外观'}
                </h2>
                <button
                  onClick={() => onClose()}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-1">
              {settingsTab === 'api' && (
                <div>
                  {/* ① 君澜 */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">君澜 AI</h3>
                    <span hidden><label className="text-xs text-gray-500 block mb-1">君澜 Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={junlanBaseInput}
                      placeholder={DEFAULT_JUNLAN_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                    <label className="text-xs text-gray-500 block mb-1">君澜 API Key</label>
                    <input
                      type="password"
                      value={junlanKeyInput}
                      onChange={(e) => setJunlanKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-600 transition-colors text-sm"
                    />
                  </div>

                  {/* ② codesonline */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">codesonline（GPT Image 2）</h3>
                    <span hidden><label className="text-xs text-gray-500 block mb-1">codesonline Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={codesonlineBaseInput}
                      placeholder={DEFAULT_CODESONLINE_IMAGE_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                    <label className="text-xs text-gray-500 block mb-1">codesonline API Key</label>
                    <input
                      type="password"
                      value={codesonlineKeyInput}
                      onChange={(e) => setCodesonlineKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-sky-600 transition-colors text-sm"
                    />
                  </div>

                  {/* codesonline GPT-5.5 对话 */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">codesonline (GPT-5.5 对话)</h3>
                    <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={DEFAULT_CODESONLINE_CHAT_BASE_URL}
                      placeholder={DEFAULT_CODESONLINE_CHAT_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    />
                    <label className="text-xs text-gray-500 block mb-1">codesonline API Key (GPT-5.5)</label>
                    <input
                      type="password"
                      value={codesonlineChatKeyInput}
                      onChange={(e) => setCodesonlineChatKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-sky-600 transition-colors text-sm"
                    />
                  </div>

                  {/* ③ DeepSeek */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">DeepSeek</h3>
                    <label className="text-xs text-gray-500 block mb-1">DeepSeek API Key</label>
                    <input
                      type="password"
                      value={deepSeekKeyInput}
                      onChange={(e) => setDeepSeekKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full mb-3 bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-600 transition-colors text-sm"
                    />
                    <span hidden><label className="text-xs text-gray-500 block mb-1">DeepSeek Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={deepSeekBaseInput}
                      placeholder={DEFAULT_DEEPSEEK_BASE_URL}
                      className="w-full bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                  </div>

                  {/* ④ 满 eAPI */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">满 e（manxueapi.com）</h3>
                    <span hidden>
                    <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={manxueBaseInput}
                      placeholder={DEFAULT_MANXUE_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                    <label className="text-xs text-gray-500 block mb-1">满 e API Key</label>
                    <input
                      type="password"
                      value={manxueKeyInput}
                      onChange={(e) => setManxueKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors text-sm"
                    />
                  </div>

                  {/* ④ MiniMax */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">MiniMax</h3>
                    <span hidden>
                    <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={minimaxBaseInput}
                      placeholder={DEFAULT_MINIMAX_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                    <label className="text-xs text-gray-500 block mb-1">MiniMax API Key</label>
                    <input
                      type="password"
                      value={minimaxKeyInput}
                      onChange={(e) => setMiniMaxKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors text-sm"
                    />
                  </div>

                  {/* ⑤ ToAPIs */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">ToAPIs</h3>
                    <span hidden>
                    <label className="text-xs text-gray-500 block mb-1">接口类型</label>
                    <select
                      value={aiProvider}
                      onChange={(e) => {
                        const p = e.target.value as AiProvider;
                        setAiProvider(p);
                        const s = getAiSettingsSnapshot();
                        setApiKeyInput(p === 'gemini' ? s.geminiKey : s.openAiKey);
                      }}
                      className="w-full mb-3 bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="openai-compatible">OpenAI 兼容（Bearer / sk-）</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                    </span>
                    <span hidden><label className="text-xs text-gray-500 block mb-1">ToAPIs Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={openAiBaseInput}
                      placeholder={DEFAULT_OPENAI_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                    {aiProvider === 'openai-compatible' ? (
                      <>
                        <label className="text-xs text-gray-500 block mb-1">ToAPIs API Key</label>
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              persistAiSettings({
                                provider: aiProvider,
                                openAiApiKey: apiKeyInput.trim(),
                                openAiBaseUrl: openAiBaseInput.trim() || DEFAULT_OPENAI_BASE_URL,
                                junlanApiKey: junlanKeyInput.trim(),
                                junlanBaseUrl: junlanBaseInput.trim() || DEFAULT_JUNLAN_BASE_URL,
                                codesonlineApiKey: codesonlineKeyInput.trim(),
                                codesonlineBaseUrl: codesonlineBaseInput.trim() || DEFAULT_CODESONLINE_IMAGE_BASE_URL,
                                deepSeekApiKey: deepSeekKeyInput.trim(),
                                deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                                manxueApiKey: manxueKeyInput.trim(),
                                manxueBaseUrl: manxueBaseInput.trim() || DEFAULT_MANXUE_BASE_URL,
                                minimaxApiKey: minimaxKeyInput.trim(),
                                minimaxBaseUrl: minimaxBaseInput.trim() || DEFAULT_MINIMAX_BASE_URL,
                                aiidApiKey: aiidKeyInput.trim(),
                                aiidBaseUrl: aiidBaseInput.trim() || DEFAULT_AIID_BASE_URL,
                              });
                              setCodesonlineChatKey(codesonlineChatKeyInput.trim());
                              initGeminiClientFromStorage();
                              onClose();
                            }
                          }}
                          placeholder="sk-..."
                          className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </>
                    ) : (
                      <>
                        <label className="text-xs text-gray-500 block mb-1">Gemini API Key</label>
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              persistAiSettings({
                                provider: aiProvider,
                                geminiApiKey: apiKeyInput.trim(),
                                openAiBaseUrl: openAiBaseInput.trim() || DEFAULT_OPENAI_BASE_URL,
                                junlanApiKey: junlanKeyInput.trim(),
                                junlanBaseUrl: junlanBaseInput.trim() || DEFAULT_JUNLAN_BASE_URL,
                                codesonlineApiKey: codesonlineKeyInput.trim(),
                                codesonlineBaseUrl: codesonlineBaseInput.trim() || DEFAULT_CODESONLINE_IMAGE_BASE_URL,
                                deepSeekApiKey: deepSeekKeyInput.trim(),
                                deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                                manxueApiKey: manxueKeyInput.trim(),
                                manxueBaseUrl: manxueBaseInput.trim() || DEFAULT_MANXUE_BASE_URL,
                                minimaxApiKey: minimaxKeyInput.trim(),
                                minimaxBaseUrl: minimaxBaseInput.trim() || DEFAULT_MINIMAX_BASE_URL,
                                aiidApiKey: aiidKeyInput.trim(),
                                aiidBaseUrl: aiidBaseInput.trim() || DEFAULT_AIID_BASE_URL,
                              });
                              setCodesonlineChatKey(codesonlineChatKeyInput.trim());
                              initGeminiClientFromStorage();
                              onClose();
                            }
                          }}
                          placeholder="AIza..."
                          className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </>
                    )}
                  </div>

                  {/* ⑥ AIID (豆包Seedance2.0) */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">AIID (豆包Seedance2.0)</h3>
                    <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={aiidBaseInput}
                      placeholder={DEFAULT_AIID_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    />
                    <label className="text-xs text-gray-500 block mb-1">AIID API Key</label>
                    <input
                      type="password"
                      value={aiidKeyInput}
                      onChange={(e) => setAiidKeyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          persistAiSettings({
                            provider: aiProvider,
                            openAiApiKey: aiProvider === 'openai-compatible' ? apiKeyInput.trim() : undefined,
                            openAiBaseUrl: (openAiBaseInput.trim() || DEFAULT_OPENAI_BASE_URL),
                            junlanApiKey: junlanKeyInput.trim(),
                            junlanBaseUrl: junlanBaseInput.trim() || DEFAULT_JUNLAN_BASE_URL,
                            codesonlineApiKey: codesonlineKeyInput.trim(),
                            codesonlineBaseUrl: codesonlineBaseInput.trim() || DEFAULT_CODESONLINE_IMAGE_BASE_URL,
                            deepSeekApiKey: deepSeekKeyInput.trim(),
                            deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                            manxueApiKey: manxueKeyInput.trim(),
                            manxueBaseUrl: manxueBaseInput.trim() || DEFAULT_MANXUE_BASE_URL,
                            minimaxApiKey: minimaxKeyInput.trim(),
                            minimaxBaseUrl: minimaxBaseInput.trim() || DEFAULT_MINIMAX_BASE_URL,
                            aiidApiKey: aiidKeyInput.trim(),
                            aiidBaseUrl: aiidBaseInput.trim() || DEFAULT_AIID_BASE_URL,
                          });
                          setCodesonlineChatKey(codesonlineChatKeyInput.trim());
                          initGeminiClientFromStorage();
                          onClose();
                        }
                      }}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors text-sm"
                    />
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => onClose()}
                      className="flex-1 py-2.5 rounded-lg bg-[#333] hover:bg-[#444] text-gray-300 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        persistAiSettings({
                          provider: aiProvider,
                          geminiApiKey: aiProvider === 'gemini' ? apiKeyInput.trim() : undefined,
                          openAiApiKey: aiProvider === 'openai-compatible' ? apiKeyInput.trim() : undefined,
                          openAiBaseUrl: (openAiBaseInput.trim() || DEFAULT_OPENAI_BASE_URL),
                          junlanApiKey: junlanKeyInput.trim(),
                          junlanBaseUrl: junlanBaseInput.trim() || DEFAULT_JUNLAN_BASE_URL,
                          codesonlineApiKey: codesonlineKeyInput.trim(),
                          codesonlineBaseUrl: codesonlineBaseInput.trim() || DEFAULT_CODESONLINE_IMAGE_BASE_URL,
                          deepSeekApiKey: deepSeekKeyInput.trim(),
                          deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                          manxueApiKey: manxueKeyInput.trim(),
                          manxueBaseUrl: manxueBaseInput.trim() || DEFAULT_MANXUE_BASE_URL,
                          minimaxApiKey: minimaxKeyInput.trim(),
                          minimaxBaseUrl: minimaxBaseInput.trim() || DEFAULT_MINIMAX_BASE_URL,
                          aiidApiKey: aiidKeyInput.trim(),
                          aiidBaseUrl: aiidBaseInput.trim() || DEFAULT_AIID_BASE_URL,
                        });
                        setCodesonlineChatKey(codesonlineChatKeyInput.trim());
                        initGeminiClientFromStorage();
                          onClose();
                      }}
                      className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <KeyIcon size={16} /> 确认并保存
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === 'presets' && (
                <div className="space-y-4">
                  {settingsPresetAuthSession && (
                    <button
                      type="button"
                      onClick={() => setSettingsPresetAuthSession(false)}
                      className="w-full rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-900/50"
                    >
                      恢复密码保护（重新锁定预设编辑）
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#333] bg-[#141414] p-1.5">
                    {PRESET_DOMAIN_TAB_OPTIONS.map((dom) => {
                      const count = Object.entries(promptPresets).filter(
                        ([name]) => settingsPresetDomain(name, promptPresetDomainOverrides) === dom.id
                      ).length;
                      const active = settingsPresetDomainTab === dom.id;
                      return (
                        <button
                          key={dom.id}
                          type="button"
                          onClick={() => {
                            setSettingsPresetPwdModal({ intent: null, input: '' });
                            setSettingsPresetDomainTab(dom.id);
                          }}
                          className={`flex-1 min-w-[5rem] rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                            active
                              ? 'bg-violet-600 text-white shadow-sm'
                              : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200'
                          }`}
                        >
                          {dom.label}
                          <span className={`ml-1 tabular-nums ${active ? 'text-violet-100' : 'text-gray-600'}`}>
                            ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {settingsPresetDomainTab === 'i2i' && (
                    <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#333] bg-[#141414] p-1.5">
                      {I2I_PRESET_CATEGORY_OPTIONS.map((cat) => {
                        const count = Object.entries(promptPresets).filter(([name]) => {
                          return (
                            settingsPresetDomain(name, promptPresetDomainOverrides) === 'i2i' &&
                            settingsPresetCategory(name, promptPresetCategoryOverrides) === cat.id
                          );
                        }).length;
                        const active = settingsPresetCategoryTab === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSettingsPresetPwdModal({ intent: null, input: '' });
                              setSettingsPresetCategoryTab(cat.id);
                            }}
                            className={`flex-1 min-w-[4.5rem] rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200'
                            }`}
                          >
                            {cat.label}
                            <span className={`ml-1 tabular-nums ${active ? 'text-blue-100' : 'text-gray-600'}`}>
                              ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {settingsPresetDomainTab === 't2i' && (
                    <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#333] bg-[#141414] p-1.5">
                      {T2I_PRESET_CATEGORY_OPTIONS.map((cat) => {
                        const count = Object.entries(promptPresets).filter(([name]) => {
                          return (
                            settingsPresetDomain(name, promptPresetDomainOverrides) === 't2i' &&
                            t2iCategoryForPreset(name) === cat.id
                          );
                        }).length;
                        const active = settingsT2iPresetCategoryTab === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSettingsPresetPwdModal({ intent: null, input: '' });
                              setSettingsT2iPresetCategoryTab(cat.id);
                            }}
                            className={`flex-1 min-w-[4.5rem] rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200'
                            }`}
                          >
                            {cat.label}
                            <span className={`ml-1 tabular-nums ${active ? 'text-purple-100' : 'text-gray-600'}`}>
                              ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(() => {
                    const entries = Object.entries(promptPresets).filter(([name]) => {
                      const dom = settingsPresetDomain(name, promptPresetDomainOverrides);
                      if (dom !== settingsPresetDomainTab) return false;
                      if (dom === 'i2i') {
                        return settingsPresetCategory(name, promptPresetCategoryOverrides) === settingsPresetCategoryTab;
                      }
                      if (dom === 't2i') {
                        return t2iCategoryForPreset(name) === settingsT2iPresetCategoryTab;
                      }
                      return true;
                    });
                    entries.sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'));
                    return (
                      <div className="rounded-lg border border-[#333] bg-[#141414] p-3 space-y-2 min-h-[120px]">
                        {entries.length === 0 ? (
                          <p className="text-[11px] text-gray-600 py-4 text-center">该分类下暂无预设</p>
                        ) : (
                          entries.map(([name, content]) => {
                            const resolvedDom = settingsPresetDomain(name, promptPresetDomainOverrides);
                            const resolvedCat = settingsPresetCategory(name, promptPresetCategoryOverrides);
                            const defaultCat = i2iCategoryForPreset(name);
                            const defaultDom = defaultPresetDomain(name);
                            return (
                              <div
                                key={name}
                                className="flex flex-wrap gap-2 items-start border-b border-[#2a2a2a] last:border-0 pb-3 last:pb-0"
                              >
                                <div className="flex-1 min-w-[200px]">
                                  <label className="text-xs text-gray-400 mb-1 block">{name}</label>
                                  {settingsPresetAuthSession ? (
                                    <textarea
                                      className="w-full h-20 bg-[#222222] text-gray-200 text-sm p-2 rounded border border-[#333] focus:outline-none focus:border-blue-500 resize-none overflow-y-auto"
                                      value={content}
                                      onChange={(e) =>
                                        setPromptPresets((prev) => ({ ...prev, [name]: e.target.value }))
                                      }
                                    />
                                  ) : (
                                    <div
                                      className="w-full h-20 select-none rounded border border-[#2a2a2a] bg-[#2C2C2C] p-2 text-xs leading-snug text-gray-500 pointer-events-none overflow-hidden whitespace-pre-wrap break-words shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]"
                                    >
                                      {content || '（无内容）'}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 w-[80px]">
                                  <span className="text-[10px] text-gray-500">大类</span>
                                  <select
                                    disabled={!settingsPresetAuthSession}
                                    className="w-full bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-[11px] text-gray-300 outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={resolvedDom}
                                    onChange={(e) => {
                                      if (!settingsPresetAuthSession) return;
                                      const val = e.target.value as PresetDomainId;
                                      setPromptPresetDomainOverrides((prev) => {
                                        const o = { ...prev };
                                        if (val === defaultDom) delete o[name];
                                        else o[name] = val;
                                        return o;
                                      });
                                    }}
                                  >
                                    {PRESET_DOMAIN_TAB_OPTIONS.map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 w-[80px]">
                                  <span className="text-[10px] text-gray-500">图生图类</span>
                                  <select
                                    disabled={
                                      !settingsPresetAuthSession || resolvedDom !== 'i2i'
                                    }
                                    className="w-full bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-[11px] text-gray-300 outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={resolvedCat}
                                    onChange={(e) => {
                                      if (!settingsPresetAuthSession) return;
                                      const val = e.target.value as I2iPresetCategoryId;
                                      setPromptPresetCategoryOverrides((prev) => {
                                        const o = { ...prev };
                                        if (val === defaultCat) delete o[name];
                                        else o[name] = val;
                                        return o;
                                      });
                                    }}
                                  >
                                    {I2I_PRESET_CATEGORY_OPTIONS.map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 justify-end min-w-[4.5rem]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (settingsPresetAuthSession) {
                                        executePresetCopy(content);
                                        return;
                                      }
                                      setSettingsPresetPwdModal({
                                        intent: { type: 'copy', content },
                                        input: '',
                                      });
                                    }}
                                    className="px-2 py-1.5 text-[11px] bg-[#2a3f5c] hover:bg-[#334d6e] text-gray-200 rounded transition-colors whitespace-nowrap"
                                  >
                                    复制
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (settingsPresetAuthSession) {
                                        executePresetRename(name);
                                        return;
                                      }
                                      setSettingsPresetPwdModal({
                                        intent: { type: 'rename', name },
                                        input: '',
                                      });
                                    }}
                                    className="px-2 py-1.5 text-[11px] bg-[#333] hover:bg-[#444] text-gray-300 rounded transition-colors whitespace-nowrap"
                                  >
                                    重命名
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (settingsPresetAuthSession) {
                                        executePresetDelete(name);
                                        return;
                                      }
                                      setSettingsPresetPwdModal({
                                        intent: { type: 'delete', name },
                                        input: '',
                                      });
                                    }}
                                    className="px-2 py-1.5 text-[11px] bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded transition-colors whitespace-nowrap"
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      if (settingsPresetAuthSession) {
                        executePresetAdd();
                        return;
                      }
                      setSettingsPresetPwdModal({ intent: { type: 'add' }, input: '' });
                    }}
                    className="w-full py-2 bg-[#333] hover:bg-[#444] text-gray-300 rounded transition-colors text-sm"
                  >
                    + 添加新预设
                  </button>
                </div>
              )}

              {settingsTab === 'downloads' && (
                <div className="space-y-4 text-sm text-gray-300">
                  {!supportsFileSystemAccess() && (
                    <p className="text-xs text-amber-600/95 rounded border border-amber-800/50 bg-amber-950/30 px-3 py-2">
                      当前环境不支持目录选择 API。
                    </p>
                  )}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-gray-600"
                      checked={downloadPathSettings.enabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        const next = { ...downloadPathSettings, enabled };
                        setDownloadPathSettings(next);
                        saveDownloadPathSettings(next);
                      }}
                    />
                    <span className="font-medium text-gray-200">启用固定下载目录</span>
                  </label>
                  <label className={`flex items-start gap-2 ${downloadPathSettings.enabled ? 'cursor-pointer' : 'opacity-40 pointer-events-none'}`}>
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-gray-600"
                      checked={downloadPathSettings.separateImageVideo}
                      disabled={!downloadPathSettings.enabled}
                      onChange={(e) => {
                        const separateImageVideo = e.target.checked;
                        const next = { ...downloadPathSettings, separateImageVideo };
                        setDownloadPathSettings(next);
                        saveDownloadPathSettings(next);
                      }}
                    />
                    <span className="font-medium text-gray-200">图片与视频使用不同文件夹</span>
                  </label>

                  <div className="rounded-lg border border-[#333] bg-[#141414] p-4 space-y-3">
                    {!downloadPathSettings.separateImageVideo ? (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">统一目录</div>
                        <div className="text-[11px] text-gray-500 mb-2 min-h-[1.25rem]">
                          {downloadDirLabels.combined ? (
                            <span className="text-cyan-400/90">已选：{downloadDirLabels.combined}</span>
                          ) : (
                            <span>未选择</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!downloadPathSettings.enabled || !supportsFileSystemAccess()}
                            onClick={async () => {
                              const h = await pickAndStoreDownloadDirectory('combined');
                              if (h) refreshDownloadDirLabels();
                            }}
                            className="rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            选择文件夹…
                          </button>
                          <button
                            type="button"
                            disabled={!downloadDirLabels.combined}
                            onClick={async () => {
                              await clearStoredDownloadDirectory('combined');
                              refreshDownloadDirLabels();
                            }}
                            className="rounded-md border border-[#555] px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a]"
                          >
                            清除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-gray-400 mb-2">图片目录</div>
                          <div className="text-[11px] text-gray-500 mb-2">
                            {downloadDirLabels.image ? (
                              <span className="text-cyan-400/90">已选：{downloadDirLabels.image}</span>
                            ) : (
                              <span>未选择</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!downloadPathSettings.enabled || !supportsFileSystemAccess()}
                              onClick={async () => {
                                const h = await pickAndStoreDownloadDirectory('image');
                                if (h) refreshDownloadDirLabels();
                              }}
                              className="rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              选择图片文件夹…
                            </button>
                            <button
                              type="button"
                              disabled={!downloadDirLabels.image}
                              onClick={async () => {
                                await clearStoredDownloadDirectory('image');
                                refreshDownloadDirLabels();
                              }}
                              className="rounded-md border border-[#555] px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a]"
                            >
                              清除
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-2">视频目录</div>
                          <div className="text-[11px] text-gray-500 mb-2">
                            {downloadDirLabels.video ? (
                              <span className="text-cyan-400/90">已选：{downloadDirLabels.video}</span>
                            ) : (
                              <span>未选择</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!downloadPathSettings.enabled || !supportsFileSystemAccess()}
                              onClick={async () => {
                                const h = await pickAndStoreDownloadDirectory('video');
                                if (h) refreshDownloadDirLabels();
                              }}
                              className="rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              选择视频文件夹…
                            </button>
                            <button
                              type="button"
                              disabled={!downloadDirLabels.video}
                              onClick={async () => {
                                await clearStoredDownloadDirectory('video');
                                refreshDownloadDirLabels();
                              }}
                              className="rounded-md border border-[#555] px-3 py-2 text-xs text-gray-400 hover:bg-[#2a2a2a]"
                            >
                              清除
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {settingsTab === 'credits' && (
                <div className="space-y-4">
                  {settingsCreditsAuthSession ? (
                    <button
                      type="button"
                      onClick={() => setSettingsCreditsAuthSession(false)}
                      className="w-full rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-900/50"
                    >
                      恢复锁定
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSettingsCreditsPwdModal({ open: true, input: '' })}
                      className="w-full rounded-lg bg-amber-700 hover:bg-amber-600 px-3 py-2 text-xs font-medium text-white"
                    >
                      解锁编辑（需密码）
                    </button>
                  )}

                  <div className="rounded-lg border border-[#333] overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#333] bg-[#252525] text-gray-400">
                          <th className="px-2 py-2 font-medium w-[88px]">分类</th>
                          <th className="px-2 py-2 font-medium min-w-[140px]">模型名称</th>
                          <th className="px-2 py-2 font-medium min-w-[100px]">分辨率/规格</th>
                          <th className="px-2 py-2 font-medium w-[72px]">积分</th>
                          <th className="px-2 py-2 font-medium w-[56px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {creditPricingRows.map((row) => (
                          <tr key={row.id} className="border-b border-[#2a2a2a] last:border-0">
                            <td className="p-1 align-middle">
                              <input
                                disabled={!settingsCreditsAuthSession}
                                title={!settingsCreditsAuthSession ? '请先解锁编辑' : undefined}
                                value={row.category}
                                onChange={(e) =>
                                  setCreditPricingRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id ? { ...r, category: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-full rounded border border-[#444] bg-[#222222] px-2 py-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="p-1 align-middle">
                              <input
                                disabled={!settingsCreditsAuthSession}
                                title={!settingsCreditsAuthSession ? '请先解锁编辑' : undefined}
                                value={row.modelName}
                                onChange={(e) =>
                                  setCreditPricingRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id ? { ...r, modelName: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-full rounded border border-[#444] bg-[#222222] px-2 py-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="p-1 align-middle">
                              <input
                                disabled={!settingsCreditsAuthSession}
                                title={!settingsCreditsAuthSession ? '请先解锁编辑' : undefined}
                                value={row.specLabel}
                                onChange={(e) =>
                                  setCreditPricingRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id ? { ...r, specLabel: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-full rounded border border-[#444] bg-[#222222] px-2 py-1.5 text-white placeholder-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="p-1 align-middle">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                disabled={!settingsCreditsAuthSession}
                                title={!settingsCreditsAuthSession ? '请先解锁编辑' : undefined}
                                value={Number.isFinite(row.credits) ? row.credits : 0}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                                  setCreditPricingRows((prev) =>
                                    prev.map((r) => (r.id === row.id ? { ...r, credits: v } : r))
                                  );
                                }}
                                className="w-full rounded border border-[#444] bg-[#222222] px-2 py-1.5 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="p-1 align-middle text-center">
                              <button
                                type="button"
                                disabled={!settingsCreditsAuthSession}
                                title={!settingsCreditsAuthSession ? '请先解锁编辑' : '删除此行'}
                                onClick={() => {
                                  if (!window.confirm('确定删除这一行吗？')) return;
                                  setCreditPricingRows((prev) => prev.filter((r) => r.id !== row.id));
                                }}
                                className="rounded bg-red-900/70 px-2 py-1 text-[10px] text-red-100 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    disabled={!settingsCreditsAuthSession}
                    onClick={() =>
                      setCreditPricingRows((prev) => [...prev, newCreditPricingRow({ category: '图生图' })])
                    }
                    className="rounded-lg border border-cyan-700/50 bg-cyan-950/30 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    添加一行
                  </button>
                </div>
              )}
              {settingsTab === 'appearance' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">画布背景</h3>
                    <div className="flex gap-2 flex-wrap">
                      {(['dots', 'grid', 'none'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setCanvasBgStyle(s)}
                          className={`px-4 py-2 rounded-lg text-xs transition-colors ${
                            canvasBgStyle === s
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#252525] text-gray-300 hover:bg-[#333] border border-[#444]'
                          }`}
                        >
                          {s === 'dots' ? '点阵' : s === 'grid' ? '方格线' : '无边线'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">底色</h3>
                    <div className="flex gap-2">
                      {(['dark', 'black'] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setCanvasBgColor(c)}
                          className={`px-4 py-2 rounded-lg text-xs transition-colors ${
                            canvasBgColor === c
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#252525] text-gray-300 hover:bg-[#333] border border-[#444]'
                          }`}
                        >
                          {c === 'dark' ? '深灰（默认）' : '纯黑'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

      {settingsPresetPwdModal.intent && (
        <div
          className="fixed inset-0 z-[230] flex items-center justify-center bg-black/75 px-4"
          onClick={() => setSettingsPresetPwdModal({ intent: null, input: '' })}
          role="presentation"
        >
          <div
            className="w-full max-w-[400px] rounded-xl border border-amber-700/45 bg-[#1a1a1a] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">请输入预设操作密码</h3>
            <label className="text-[10px] text-gray-500 block mb-1">密码</label>
            <input
              type="password"
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border border-[#444] bg-[#303030] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
              value={settingsPresetPwdModal.input}
              onChange={(e) =>
                setSettingsPresetPwdModal((p) => (p.intent ? { ...p, input: e.target.value } : p))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmSettingsPresetPassword();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#444] px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a2a]"
                onClick={() => setSettingsPresetPwdModal({ intent: null, input: '' })}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500"
                onClick={confirmSettingsPresetPassword}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsCreditsPwdModal.open && (
        <div
          className="fixed inset-0 z-[230] flex items-center justify-center bg-black/75 px-4"
          onClick={() => setSettingsCreditsPwdModal({ open: false, input: '' })}
          role="presentation"
        >
          <div
            className="w-full max-w-[400px] rounded-xl border border-amber-700/45 bg-[#1a1a1a] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">解锁积分消耗编辑</h3>
            <label className="text-[10px] text-gray-500 block mb-1">密码</label>
            <input
              type="password"
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border border-[#444] bg-[#303030] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
              value={settingsCreditsPwdModal.input}
              onChange={(e) =>
                setSettingsCreditsPwdModal((p) => (p.open ? { ...p, input: e.target.value } : p))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmSettingsCreditsPassword();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#444] px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a2a]"
                onClick={() => setSettingsCreditsPwdModal({ open: false, input: '' })}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500"
                onClick={confirmSettingsCreditsPassword}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
