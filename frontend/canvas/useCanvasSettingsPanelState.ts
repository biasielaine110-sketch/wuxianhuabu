import { useState, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AiProvider } from '../services/aiSettings';
import {
  getAiSettingsSnapshot,
  getCodesonlineChatSavedKey,
  migrateAiSettingsIfLegacy,
  getAiidBaseUrl,
  getAiidSavedKey,
  getHfsySavedKey,
} from '../services/aiSettings';
import {
  getDownloadHandleCacheSnapshot,
  hydrateDownloadDirectoryHandlesFromIDB,
  loadDownloadPathSettings,
  type DownloadPathPersisted,
} from '../services/downloadPathSettings';
import type { CreditPricingRow } from '../services/creditPricingSettings';
import { loadCreditPricingRows, saveCreditPricingRows } from '../services/creditPricingSettings';
import type { PresetDomainId, I2iPresetCategoryId } from './canvasNodeRenderState';
import type { T2iPresetCategoryId } from './promptPresetCatalog';
import { defaultPresetDomain, i2iCategoryForPreset } from './promptPresetCatalog';
import type { SettingsPresetPwdIntent } from './CanvasSettingsModal';
import type { SettingsTab } from '../components/AppSettingsModal';

const PRESET_SETTINGS_GUARD_PASSWORD = 'zhangbiwen666';

export type UseCanvasSettingsPanelStateOptions = {
  promptPresets: Record<string, string>;
  setPromptPresets: Dispatch<SetStateAction<Record<string, string>>>;
  canvasBgStyle: 'dots' | 'grid' | 'none';
  setCanvasBgStyle: Dispatch<SetStateAction<'dots' | 'grid' | 'none'>>;
  canvasBgColor: 'dark' | 'black';
  setCanvasBgColor: Dispatch<SetStateAction<'dark' | 'black'>>;
};

export function useCanvasSettingsPanelState({
  promptPresets,
  setPromptPresets,
  canvasBgStyle,
  setCanvasBgStyle,
  canvasBgColor,
  setCanvasBgColor,
}: UseCanvasSettingsPanelStateOptions) {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('api');
  const [settingsPresetDomainTab, setSettingsPresetDomainTab] = useState<PresetDomainId>('i2i');
  const [promptPresetDomainOverrides, setPromptPresetDomainOverrides] = useState<
    Record<string, PresetDomainId>
  >({});
  const [settingsPresetCategoryTab, setSettingsPresetCategoryTab] =
    useState<I2iPresetCategoryId>('character');
  const [settingsT2iPresetCategoryTab, setSettingsT2iPresetCategoryTab] =
    useState<T2iPresetCategoryId>('storyboard');
  const [settingsPresetAuthSession, setSettingsPresetAuthSession] = useState(false);
  const [settingsPresetPwdModal, setSettingsPresetPwdModal] = useState<{
    intent: SettingsPresetPwdIntent | null;
    input: string;
  }>({ intent: null, input: '' });
  const [promptPresetCategoryOverrides, setPromptPresetCategoryOverrides] = useState<
    Record<string, I2iPresetCategoryId>
  >({});
  const [downloadPathSettings, setDownloadPathSettings] = useState<DownloadPathPersisted>(() =>
    loadDownloadPathSettings()
  );
  const [downloadDirLabels, setDownloadDirLabels] = useState<{
    combined?: string;
    image?: string;
    video?: string;
  }>({});
  const [settingsCreditsAuthSession, setSettingsCreditsAuthSession] = useState(false);
  const [settingsCreditsPwdModal, setSettingsCreditsPwdModal] = useState<{ open: boolean; input: string }>({
    open: false,
    input: '',
  });
  const [creditPricingRows, setCreditPricingRows] = useState<CreditPricingRow[]>(() =>
    loadCreditPricingRows()
  );

  const refreshDownloadDirLabels = useCallback(() => {
    const c = getDownloadHandleCacheSnapshot();
    setDownloadDirLabels({
      combined: c.combined?.name,
      image: c.image?.name,
      video: c.video?.name,
    });
  }, []);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => {
    migrateAiSettingsIfLegacy();
    return getAiSettingsSnapshot().provider;
  });
  const [openAiBaseInput, setOpenAiBaseInput] = useState(() => {
    migrateAiSettingsIfLegacy();
    return getAiSettingsSnapshot().openAiBaseUrl;
  });
  const [deepSeekKeyInput, setDeepSeekKeyInput] = useState(() => getAiSettingsSnapshot().deepSeekKey);
  const [deepSeekBaseInput, setDeepSeekBaseInput] = useState(() => getAiSettingsSnapshot().deepSeekBaseUrl);
  const [junlanBaseInput, setJunlanBaseInput] = useState(() => getAiSettingsSnapshot().junlanBaseUrl);
  const [junlanKeyInput, setJunlanKeyInput] = useState(() => getAiSettingsSnapshot().junlanKey);
  const [codesonlineBaseInput, setCodesonlineBaseInput] = useState(
    () => getAiSettingsSnapshot().codesonlineBaseUrl
  );
  const [codesonlineKeyInput, setCodesonlineKeyInput] = useState(() => getAiSettingsSnapshot().codesonlineKey);
  const [codesonlineChatKeyInput, setCodesonlineChatKeyInput] = useState(() => getCodesonlineChatSavedKey());
  const [hfsyKeyInput, setHfsyKeyInput] = useState(() => getHfsySavedKey());
  const [manxueBaseInput, setManxueBaseInput] = useState(() => getAiSettingsSnapshot().manxueBaseUrl);
  const [manxueKeyInput, setManxueKeyInput] = useState(() => getAiSettingsSnapshot().manxueKey);
  const [minimaxBaseInput, setMiniMaxBaseInput] = useState(() => getAiSettingsSnapshot().minimaxBaseUrl);
  const [minimaxKeyInput, setMiniMaxKeyInput] = useState(() => getAiSettingsSnapshot().minimaxKey);
  const [aiidBaseInput, setAiidBaseInput] = useState(() => getAiidBaseUrl());
  const [aiidKeyInput, setAiidKeyInput] = useState(() => getAiidSavedKey());

  useEffect(() => {
    const s = getAiSettingsSnapshot();
    setAiProvider(s.provider);
    setOpenAiBaseInput(s.openAiBaseUrl);
    setApiKeyInput(s.provider === 'gemini' ? s.geminiKey : s.openAiKey);
    setDeepSeekKeyInput(s.deepSeekKey);
    setDeepSeekBaseInput(s.deepSeekBaseUrl);
    setJunlanBaseInput(s.junlanBaseUrl);
    setJunlanKeyInput(s.junlanKey);
    setCodesonlineBaseInput(s.codesonlineBaseUrl);
    setCodesonlineKeyInput(s.codesonlineKey);
    setCodesonlineChatKeyInput(getCodesonlineChatSavedKey());
    setHfsyKeyInput(getHfsySavedKey());
    setManxueBaseInput(s.manxueBaseUrl);
    setManxueKeyInput(s.manxueKey);
    setMiniMaxBaseInput(s.minimaxBaseUrl);
    setMiniMaxKeyInput(s.minimaxKey);
  }, []);

  useEffect(() => {
    void (async () => {
      await hydrateDownloadDirectoryHandlesFromIDB();
      refreshDownloadDirLabels();
    })();
  }, [refreshDownloadDirLabels]);

  useEffect(() => {
    if (!showSettingsModal) {
      setSettingsPresetAuthSession(false);
      setSettingsPresetPwdModal({ intent: null, input: '' });
      setSettingsCreditsAuthSession(false);
      setSettingsCreditsPwdModal({ open: false, input: '' });
      return;
    }
    migrateAiSettingsIfLegacy();
    const s = getAiSettingsSnapshot();
    setAiProvider(s.provider);
    setOpenAiBaseInput(s.openAiBaseUrl);
    setApiKeyInput(s.provider === 'gemini' ? s.geminiKey : s.openAiKey);
    setDeepSeekKeyInput(s.deepSeekKey);
    setDeepSeekBaseInput(s.deepSeekBaseUrl);
    setJunlanBaseInput(s.junlanBaseUrl);
    setJunlanKeyInput(s.junlanKey);
    setCodesonlineBaseInput(s.codesonlineBaseUrl);
    setCodesonlineKeyInput(s.codesonlineKey);
    setHfsyKeyInput(getHfsySavedKey());
    setDownloadPathSettings(loadDownloadPathSettings());
    setCreditPricingRows(loadCreditPricingRows());
    void hydrateDownloadDirectoryHandlesFromIDB().then(() => refreshDownloadDirLabels());
  }, [showSettingsModal, refreshDownloadDirLabels]);

  useEffect(() => {
    if (settingsTab !== 'presets') {
      setSettingsPresetPwdModal({ intent: null, input: '' });
      setSettingsPresetAuthSession(false);
    }
  }, [settingsTab]);

  useEffect(() => {
    if (settingsTab !== 'credits') {
      setSettingsCreditsPwdModal({ open: false, input: '' });
      setSettingsCreditsAuthSession(false);
    }
  }, [settingsTab]);

  useEffect(() => {
    saveCreditPricingRows(creditPricingRows);
  }, [creditPricingRows]);

  const executePresetCopy = useCallback((content: string) => {
    void navigator.clipboard
      .writeText(content)
      .then(() => window.alert('已复制到剪贴板'))
      .catch(() => window.alert('复制失败，请检查浏览器权限'));
  }, []);

  const executePresetAdd = useCallback(() => {
    const name = window.prompt('新预设名称:');
    if (name && !promptPresets[name]) {
      setPromptPresets((prev) => ({ ...prev, [name]: '' }));
      setPromptPresetDomainOverrides((prev) => ({ ...prev, [name]: settingsPresetDomainTab }));
      if (settingsPresetDomainTab === 'i2i') {
        setSettingsPresetCategoryTab('other');
      } else if (settingsPresetDomainTab === 't2i') {
        setSettingsT2iPresetCategoryTab('storyboard');
      }
    } else if (name && promptPresets[name]) {
      window.alert('已存在同名预设');
    }
  }, [promptPresets, setPromptPresets, settingsPresetDomainTab]);

  const executePresetRename = useCallback(
    (name: string) => {
      const newName = window.prompt(`重命名预设 "${name}" 为:`);
      if (newName && newName !== name) {
        if (promptPresets[newName]) {
          window.alert('已存在同名预设');
          return;
        }
        setPromptPresets((prev) => {
          const next = { ...prev };
          next[newName] = next[name];
          delete next[name];
          return next;
        });
        setPromptPresetCategoryOverrides((prev) => {
          const o = { ...prev };
          const cat = o[name];
          delete o[name];
          if (cat !== undefined) {
            const defNew = i2iCategoryForPreset(newName);
            if (cat !== defNew) o[newName] = cat;
          }
          return o;
        });
        setPromptPresetDomainOverrides((prev) => {
          const o = { ...prev };
          const d = o[name];
          delete o[name];
          if (d !== undefined) {
            const defDom = defaultPresetDomain(newName);
            if (d !== defDom) o[newName] = d;
          }
          return o;
        });
      }
    },
    [promptPresets, setPromptPresets]
  );

  const executePresetDelete = useCallback(
    (name: string) => {
      if (!window.confirm(`确定删除预设 "${name}" 吗?`)) return;
      setPromptPresets((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setPromptPresetCategoryOverrides((prev) => {
        const o = { ...prev };
        delete o[name];
        return o;
      });
      setPromptPresetDomainOverrides((prev) => {
        const o = { ...prev };
        delete o[name];
        return o;
      });
    },
    [setPromptPresets]
  );

  const confirmSettingsPresetPassword = useCallback(() => {
    const { intent, input } = settingsPresetPwdModal;
    if (!intent) return;
    if (input.trim() !== PRESET_SETTINGS_GUARD_PASSWORD) {
      window.alert('密码错误');
      setSettingsPresetPwdModal((p) => ({ ...p, input: '' }));
      return;
    }
    setSettingsPresetPwdModal({ intent: null, input: '' });
    setSettingsPresetAuthSession(true);

    if (intent.type === 'copy') {
      executePresetCopy(intent.content);
      return;
    }
    if (intent.type === 'add') {
      executePresetAdd();
      return;
    }
    if (intent.type === 'rename') {
      executePresetRename(intent.name);
      return;
    }
    if (intent.type === 'delete') {
      executePresetDelete(intent.name);
    }
  }, [
    settingsPresetPwdModal,
    executePresetCopy,
    executePresetAdd,
    executePresetRename,
    executePresetDelete,
  ]);

  const confirmSettingsCreditsPassword = useCallback(() => {
    if (!settingsCreditsPwdModal.open) return;
    if (settingsCreditsPwdModal.input.trim() !== PRESET_SETTINGS_GUARD_PASSWORD) {
      window.alert('密码错误');
      setSettingsCreditsPwdModal((p) => ({ ...p, input: '' }));
      return;
    }
    setSettingsCreditsPwdModal({ open: false, input: '' });
    setSettingsCreditsAuthSession(true);
  }, [settingsCreditsPwdModal]);

  useEffect(() => {
    if (!settingsPresetPwdModal.intent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsPresetPwdModal({ intent: null, input: '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsPresetPwdModal.intent]);

  useEffect(() => {
    if (!settingsCreditsPwdModal.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsCreditsPwdModal({ open: false, input: '' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsCreditsPwdModal.open]);

  return {
    showSettingsModal,
    setShowSettingsModal,
    settingsTab,
    setSettingsTab,
    promptPresetDomainOverrides,
    promptPresetCategoryOverrides,
    settingsModalProps: {
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
      setOpenAiBaseInput,
      deepSeekKeyInput,
      setDeepSeekKeyInput,
      deepSeekBaseInput,
      setDeepSeekBaseInput,
      junlanBaseInput,
      setJunlanBaseInput,
      junlanKeyInput,
      setJunlanKeyInput,
      codesonlineBaseInput,
      setCodesonlineBaseInput,
      codesonlineKeyInput,
      setCodesonlineKeyInput,
      codesonlineChatKeyInput,
      setCodesonlineChatKeyInput,
      hfsyKeyInput,
      setHfsyKeyInput,
      manxueBaseInput,
      setManxueBaseInput,
      manxueKeyInput,
      setManxueKeyInput,
      minimaxBaseInput,
      setMiniMaxBaseInput,
      minimaxKeyInput,
      setMiniMaxKeyInput,
      aiidBaseInput,
      setAiidBaseInput,
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
    },
  };
}
