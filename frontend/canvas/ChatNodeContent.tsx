import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CanvasNode, ChatMessage, ChatNode, Edge } from '../types';
import { DEFAULT_DEEPSEEK_CHAT_MODEL_ID, normalizeDeepSeekChatModelId } from '../services/aiSettings';
import { buildIncomingRefSlots } from '../referenceSlots';
import { OptimizedImage } from './OptimizedImage';
import { RefPickBar } from './RefPickBar';
import { GenerationTimer } from './GenerationTimer';
import { CopyIcon, EyedropperIcon, ImageIcon, TrashIcon } from './canvasIcons';
import {
  CHAT_PANEL_FONT_SCALE,
  CHAT_FONT_LS_KEY,
  clampChatFontPx,
  messageDisplayImages,
  readStoredChatFontPx,
} from './chatNodeUtils';
import { resolveCanvasImageSource } from '../services/canvasAssetResolver';
import { loadChatPromptPresets, getLatestChatPromptPresets } from './loadChatPromptPresets';
const LoaderIcon = ({ size = 16 }: { size?: number }) => (
  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);
const WandIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
);
const MessageIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);
const SendIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
);
const StopIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
);
const VideoIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
);
const MaximizeIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
);
type ChatFeatureButtonSpec = {
  id: string;
  presetKey: string;
  label: string;
  title: string;
  icon?: 'video' | 'wand' | 'message';
  tone?: 'green' | 'blue' | 'purple' | 'rose';
};

const CHAT_FEATURE_BUTTON_TONE_CLASSES: Record<'green' | 'blue' | 'purple' | 'rose', string> = {
  green: 'border-emerald-700/60 bg-emerald-950/45 text-emerald-100 hover:bg-emerald-900/55',
  blue: 'border-sky-700/60 bg-sky-950/45 text-sky-100 hover:bg-sky-900/55',
  purple: 'border-violet-700/60 bg-violet-950/45 text-violet-100 hover:bg-violet-900/55',
  rose: 'border-rose-800/55 bg-rose-950/45 text-rose-100 hover:bg-rose-900/55',
};

const CHAT_FEATURE_BUTTON_SPECS: ChatFeatureButtonSpec[] = [
  // —— 玫红组（默认色）——
  {
    id: 'reverse-prompt',
    presetKey: '反推提示词',
    label: '反推提示词',
    icon: 'video',
    title:
      '',
  },
  {
    id: 'eeee-alt-universal-asset',
    presetKey: 'EEEE_备选万能资产',
    label: 'EEEE_备选万能资产',
    icon: 'wand',
    title:
      'EEEE_备选万能资产：与 BBBB 相同规范的全中文 AI 绘画提示词模板（人物 2x2·9:16；场景与关键帧 3x3·16:9）。发送前请填入剧本、风格与可选面部参考说明，并可连接参考图。',
  },
  {
    id: 'ddd-15s-timeline',
    presetKey: 'DDD_15秒剧本时间轴',
    label: 'DDD_15秒剧本时间轴',
    icon: 'message',
    title:
      'DDD_15秒剧本时间轴：即梦 Seedance 2.0 · 导演讲戏分镜时间轴模板。发送前请填入剧本正文。',
  },
  {
    id: 'ddd-15s-9grid-beatboard',
    presetKey: 'DDD_15秒九宫格定调板',
    label: 'DDD_15秒九宫格定调板',
    icon: 'wand',
    title:
      'DDD_15秒九宫格定调板：专业影视视觉开发设计师，将15s剧情转化为九宫格场景情绪定调板（Beat Board）。发送前请填入剧本正文。',
  },
  {
    id: 'ffff-universal-prompt',
    presetKey: 'FFFF_全能提示词',
    label: 'FFFF_全能提示词',
    icon: 'wand',
    title:
      'FFFF_全能提示词：即梦AI视频生成工具的竖屏短剧专属分镜提示词工程文件。发送前请填入剧本正文。',
  },
  // —— 绿色组 ——
  {
    id: 'aaaa-all-asset',
    presetKey: 'AAAA_全能资产',
    label: 'AAAA_全能资产',
    icon: 'wand',
    tone: 'green',
    title:
      'AAAA_全能资产：AI短视频故事生成提示词模板（剧本直出角色设定+场景设定+15秒图像/视频提示词）。发送前请填入剧本正文。',
  },
  {
    id: 'bbbb-all-asset',
    presetKey: 'BBBB_全能资产',
    label: 'BBBB_全能资产',
    icon: 'wand',
    tone: 'green',
    title:
      'BBBB_全能资产：根据剧本与视觉风格生成全中文 AI 绘画提示词（人物 2x2·9:16；场景与关键帧 3x3·16:9）。发送前请填入剧本、风格与可选面部参考说明，并可连接参考图。',
  },
  {
    id: 'jimeng-ccc-assets-storyboard',
    presetKey: 'CCC即梦分镜',
    label: 'CCC即梦分镜',
    icon: 'wand',
    tone: 'green',
    title:
      'CCC_资产分镜提示词_即梦：一键填入即梦 agent 分镜工程规范（Shot/计时表/Clip/角色与场景资产/音频）。发送前请在占位处粘贴完整剧本或连接文本节点。',
  },
  // —— 蓝色组 ——
  {
    id: 'jimeng-ccc-seedance-video',
    presetKey: 'CCC即梦视频',
    label: 'CCC即梦视频',
    icon: 'message',
    tone: 'blue',
    title:
      'CCC_视频提示词_即梦（Seedance 2.0）：单镜标准化提示词工程模板。发送前请连接或粘贴分镜工程文件要点，并在参考区绑定角色/场景参考图。',
  },
  {
    id: 'gggg-six-grid-storyboard-video',
    presetKey: 'GGGG_6宫格分镜视频',
    label: '6宫格分镜视频',
    icon: 'video',
    tone: 'blue',
    title:
      'GGGG_6宫格分镜视频：工业级AI漫剧视效总监模板，六宫格 2×3 横屏关键帧 + 15秒视频提示词（零帧硬切、零黑屏废帧、角色外貌锁 P0 级、台词逐字零遗漏）。发送前请填入输入文案/故事情节/前后分镜/角色库/场景与物品库。',
  },
  {
    id: 'iiii-storyboard-block-video',
    presetKey: 'IIII_故事板分镜视频',
    label: '故事板分镜视频',
    icon: 'video',
    tone: 'blue',
    title:
      'IIII_故事板分镜视频：工业级漫剧 Block 分镜师模板，10秒 3 Shot Block 时序 + 双份逐字复制输出（跨 Block 衔接物理起点、@ 引用约束、角色外貌锁、视听设定 4 项强制齐全、双份逐字一致 P0 级）。发送前请填入输入文案/前后 Block 参考/角色/场景/物品/故事情节。',
  },
  {
    id: 'jjjj-batch-storyboard-block-video',
    presetKey: 'JJJJ_批量_故事板分镜视频',
    label: '批量_故事板分镜视频',
    icon: 'video',
    tone: 'blue',
    title:
      'JJJJ_批量_故事板分镜视频：工业级漫剧 Block 分镜师批量版，一次性处理 N 镜（按 panel_index 1..N 顺序），批内跨镜首尾相连 + 批首对接上一批 + 批末对接下一批 + 跨镜实体唯一性（服饰/道具/光影）+ 双层分隔符协议（panel_index_FIELD_first_FIELD_second_RECORD_...）+ 13 项强制自检。发送前请填入章节文案/前后批次参考/角色/场景/物品/小说原文/故事情节。',
  },
  {
    id: 'kkkk-batch-shot-video-reasoning',
    presetKey: 'KKKK_批量_分镜视频推理',
    label: '批量_分镜视频推理',
    icon: 'video',
    tone: 'blue',
    title:
      'KKKK_批量_分镜视频推理：工业级 AI 漫剧分镜师 + 视频提示词工程师批量版，一次性处理一批分镜（10 条左右），为每条分镜生成「首帧提示词 / 尾帧提示词 / 视频提示词」三段产物；视频提示词 4 段时间轴（0-3/4-8/9-12/13-15秒）+ 衔接前置指令 + 单一空间 + 纯视觉 + 禁止外貌描写 + 台词来源唯一 + 中文引号 + 内容安全违禁词替换 + 10 项自检。发送前请填入故事情节/角色/场景/物品/小说原文/推文文案/前后批次参考/章节文案。',
  },
  {
    id: 'hhhh-grok-four-grid-storyboard-video',
    presetKey: 'HHHH_grok_4宫格分镜视频',
    label: 'grok_4宫格分镜视频',
    icon: 'video',
    tone: 'blue',
    title:
      'HHHH_grok_4宫格分镜视频：工业级AI漫剧视效总监模板，10秒四宫格·零帧硬切·无黑图（台词来源唯一性 P0 级、角色外貌锁 P0 级、反串镜硬校验、反凑数条款）。发送前请填入输入文案/前置分镜/角色库/场景与物品库。',
  },
  // —— 紫色组 ——
  {
    id: 'cccc-storyboard-simplified',
    presetKey: 'CCCC_故事板简化版',
    label: 'CCCC_故事板简化版',
    icon: 'wand',
    tone: 'purple',
    title:
      'CCCC_故事板简化版：根据剧本生成3:4画幅的分镜图，包含4个分镜、运镜说明、主体/动作/描述/台词/音效标注。发送前请填入剧本正文。',
  },
];

export interface ChatNodeContentProps {
  node: ChatNode;
  nodes: CanvasNode[];
  edges: Edge[];
  isSelected: boolean;
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onUpdate: (updates: Partial<ChatNode>) => void;
  onSendMessage: () => void;
  /** 截断历史后携带新提问重新请求（用于编辑过往提问） */
  onResendWithHistory: (baseMessages: ChatMessage[], promptText: string) => void;
  onOpenApiSettings: () => void;
  /** 与设置 → 预设 → AI对话 同步的功能模板全文 */
  promptPresets: Record<string, string>;
  generationStartedAt?: number;
  onOpenBigEditor?: (current: string, onSave: (v: string) => void) => void;
  /** 双击窗口内部任意区域时激活选中 */
  onActivate: () => void;
  /** 创建图片节点回调 */
  onCreateImageNode?: (images: string[], nodeX: number, nodeY: number) => void;
  /** 全屏查看图片回调（用于对话消息中的图片） */
  onOpenFullscreen?: (base64: string) => void;
  /** 取消生成回调 */
  onCancelGeneration?: (nodeId: string) => void;
}

export function ChatNodeContent({
  node,
  nodes,
  edges,
  isSelected,
  eyedropperTargetNodeId,
  onEyedropperSelect,
  onDeleteEdge,
  onUpdate,
  onSendMessage,
  onResendWithHistory,
  onOpenApiSettings,
  promptPresets,
  generationStartedAt,
  onOpenBigEditor,
  onActivate,
  onCreateImageNode,
  onOpenFullscreen,
  onCancelGeneration,
}: ChatNodeContentProps) {
  const [showAllRefs, setShowAllRefs] = useState(false);
  const chatPromptRef = useRef<HTMLTextAreaElement>(null);
  const bigInputLastClickTimeRef = useRef(0);
  const refSlots = useMemo(() => buildIncomingRefSlots(node.id, edges, nodes), [node.id, edges, nodes]);
  /** 消息列表容器（用于恢复/保存滚动位置） */
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  /** 标记本次挂载是否已应用过 chatScrollTop，避免用户已手动滚动时再被覆盖 */
  const chatScrollRestoredRef = useRef(false);
  /** 节流：scroll 事件触发时不立刻写 store，攒一帧 */
  const chatScrollWriteTimerRef = useRef<number | null>(null);

  // 组件挂载后立即把上次保存的 scrollTop 应用到容器（一次性，避免覆盖用户后续手动滚动）
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const saved = node.chatScrollTop;
    if (typeof saved === 'number' && saved > 0) {
      // requestAnimationFrame 防止 ref 还没 layout 完成
      requestAnimationFrame(() => {
        el.scrollTop = saved;
        chatScrollRestoredRef.current = true;
      });
    } else {
      chatScrollRestoredRef.current = true;
    }
  }, [node.id]);

  // 用户滚动消息列表时，节流地把 scrollTop 写回 node.chatScrollTop
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!chatScrollRestoredRef.current) return;
      if (chatScrollWriteTimerRef.current != null) return;
      chatScrollWriteTimerRef.current = window.setTimeout(() => {
        chatScrollWriteTimerRef.current = null;
        onUpdate({ chatScrollTop: el.scrollTop });
      }, 200);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (chatScrollWriteTimerRef.current != null) {
        window.clearTimeout(chatScrollWriteTimerRef.current);
        chatScrollWriteTimerRef.current = null;
      }
    };
  }, [onUpdate]);

  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const [editUserDraft, setEditUserDraft] = useState('');
  const [showBigInput, setShowBigInput] = useState(false);
  const [bigInputDraft, setBigInputDraft] = useState('');
  const [chatFontPx, setChatFontPx] = useState(readStoredChatFontPx);
  // @ 引用自动完成
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [atPickerPos, setAtPickerPos] = useState({ top: 0, left: 0 });
  // 保存显示 picker 时的光标位置
  const [savedCursorPos, setSavedCursorPos] = useState({ start: 0, end: 0 });
  const savedCursorPosRef = useRef({ start: 0, end: 0 });
  const atPickerRef = useRef<HTMLDivElement>(null);
  // 限制渲染的消息数量，防止图片太多导致崩溃
  const MAX_VISIBLE_MESSAGES = 30;
  const persistChatFontPx = useCallback((px: number) => {
    const v = clampChatFontPx(px);
    setChatFontPx(v);
    try {
      localStorage.setItem(CHAT_FONT_LS_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const fs = (px: number) => Math.round(px * CHAT_PANEL_FONT_SCALE);
  const chatFontScaled = fs(chatFontPx);

  useEffect(() => {
    if (node.isGenerating) setEditingUserMessageId(null);
  }, [node.isGenerating]);

  /** 旧 DeepSeek 模型 id 写入画布数据后，打开节点时升级为官方 V4 命名 */
  useEffect(() => {
    const m = (node.model || '').trim();
    if (m === 'deepseek-chat' || m === 'deepseek-reasoner') {
      onUpdate({ model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID });
    }
  }, [node.id, node.model, onUpdate]);

  const messages = node.messages || [];

  const syncPromptCursor = useCallback(() => {
    const el = chatPromptRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    savedCursorPosRef.current = { start, end };
    setSavedCursorPos({ start, end });
  }, []);

  /** 在光标处插入引用 token；若光标前有未完成的 @/@R/@M 则替换之 */
  const insertPromptToken = useCallback(
    (tok: string) => {
      const el = chatPromptRef.current;
      const cur = node.prompt || '';
      let from = savedCursorPosRef.current.start;
      let to = savedCursorPosRef.current.end;
      if (el && document.activeElement === el) {
        from = el.selectionStart ?? from;
        to = el.selectionEnd ?? from;
      }
      const textBefore = cur.slice(0, from);
      const partialAt = textBefore.match(/@[RM]?$/);
      if (partialAt) {
        from -= partialAt[0].length;
      }
      const next = cur.slice(0, from) + tok + cur.slice(to);
      const newPos = from + tok.length;
      onUpdate({ prompt: next });
      setShowAtPicker(false);
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = newPos;
          savedCursorPosRef.current = { start: newPos, end: newPos };
          setSavedCursorPos({ start: newPos, end: newPos });
        }
      });
    },
    [node.prompt, onUpdate]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  /** 功能按钮：把对应预设全文填入输入框（懒加载最新预设，避开 HMR 缓存） */
  const handleFeatureButtonClick = useCallback(
    (presetKey: string) => {
      // 优先用 state 中已有的合并结果（用户在「设置 → 预设 → AI对话」改过的话）
      const fromState = promptPresets[presetKey];
      if (fromState) {
        onUpdate({ prompt: fromState, error: undefined });
        return;
      }
      // 兜底：直接 import 最新模块，跳过模块级 promise 缓存，
      // 避免 HMR 链中 promise 仍指向旧模块实例导致新键缺失
      void getLatestChatPromptPresets().then((presets) => {
        const body = presets[presetKey] ?? '';
        onUpdate({ prompt: body, error: undefined });
        if (import.meta.env?.DEV) {
          // 调试辅助：dev 模式下若仍空，说明键名拼错或模板未注册
          // eslint-disable-next-line no-console
          console.debug('[chat-feature-button]', presetKey, 'len=', body.length);
        }
      });
    },
    [promptPresets, onUpdate]
  );

  const chatErrorDiagnosis = (() => {
    if (!node.error) return null;
    const msg = node.error.toLowerCase();
    if (
      msg.includes('401') ||
      msg.includes('unauthorized') ||
      msg.includes('invalid api key') ||
      (msg.includes('deepseek') && msg.includes('密钥')) ||
      (msg.includes('使用 deepseek') && msg.includes('填写')) ||
      (msg.includes('君澜') && msg.includes('密钥')) ||
      (msg.includes('gpt-5.5') && msg.includes('君澜'))
    ) {
      return {
        title: '鉴权 / DeepSeek 配置',
        reason: '未填写 DeepSeek 密钥、密钥无效，或 OpenAI 兼容未指向 DeepSeek。',
        fixes: [
          { label: '打开 API 设置', action: () => onOpenApiSettings() },
          { label: '切换到 DeepSeek-V4-Flash', action: () => onUpdate({ model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID, error: undefined }) },
          { label: '切换到 GPT-5.5（君澜）', action: () => onUpdate({ model: 'gpt-5.5-junlan', error: undefined }) },
          { label: '切换到 Claude Sonnet 4-6（君澜）', action: () => onUpdate({ model: 'claude-sonnet-4-6', error: undefined }) },
          { label: '清除报错', action: () => onUpdate({ error: undefined }) },
        ],
      };
    }
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('too many requests') || msg.includes('resource exhausted') || msg.includes('insufficient_user_quota')) {
      return {
        title: '⚠️ 额度不足',
        reason: 'AI 服务额度已用完，请前往充值后重试。',
        fixes: [
          { label: '💰 充值额度', action: () => { window.open('https://manxueapi.com/recharge', '_blank'); onUpdate({ error: undefined }); } },
          { label: '🔄 切换免费模型', action: () => onUpdate({ model: 'gemini-2.5-flash', error: undefined }) },
        ]
      };
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline') || msg.includes('network') || msg.includes('fetch failed')) {
      return {
        title: '⏱️ 请求超时',
        reason: '网络或模型响应超时，请检查网络后重试。',
        fixes: [
          { label: '🔄 重试一次', action: () => onUpdate({ error: undefined }) },
        ]
      };
    }
    if (msg.includes('invalid') || msg.includes('unsupported') || msg.includes('400') || msg.includes('参数')) {
      return {
        title: '⚙️ 参数无效',
        reason: '输入内容或参数配置不符合接口要求。',
        fixes: [
          { label: '🔄 重置输入', action: () => onUpdate({ prompt: '', error: undefined }) },
          { label: '🤖 切换模型', action: () => onUpdate({ model: 'gemini-2.5-flash', error: undefined }) },
        ]
      };
    }
    return {
      title: '❌ API 错误',
      reason: '接口鉴权失败或服务暂时不可用。',
      fixes: [
        { label: '🤖 切换 Gemini', action: () => onUpdate({ model: 'gemini-2.5-flash', error: undefined }) },
        { label: '🔄 重试一次', action: () => onUpdate({ error: undefined }) },
        { label: '⚙️ API 设置', action: () => onOpenApiSettings() },
      ],
    };
  })();

  const totalRefImages = refSlots.reduce((sum, slot) => sum + (slot.imageBase64s?.length || (slot.imageBase64 ? 1 : 0)), 0);

  // 大输入框浮动弹框
  const bigInputOverlay = showBigInput && createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          setShowBigInput(false);
        }
      }}
    >
      <div
        className="flex flex-col bg-[#1e1e1e] border border-[#444] rounded-xl shadow-2xl w-[80vw] max-w-[800px] h-[75vh] max-h-[700px] p-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <span className="text-gray-300 font-medium" style={{ fontSize: fs(13) }}>编辑提问</span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowBigInput(false)}
            className="rounded p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <textarea
          className="flex-1 w-full resize-none rounded-lg border border-[#444] bg-[#252525] p-4 text-gray-200 outline-none focus:border-rose-500"
          style={{ fontSize: fs(14), overflowY: 'auto' }}
          value={bigInputDraft}
          onChange={(e) => setBigInputDraft(e.target.value)}
          autoFocus
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div className="flex justify-end gap-3 mt-3 shrink-0">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowBigInput(false)}
            className="rounded-lg border border-[#555] px-5 py-2 text-gray-300 hover:bg-white/10 transition-colors"
            style={{ fontSize: fs(12) }}
          >
            取消
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onUpdate({ prompt: bigInputDraft });
              setShowBigInput(false);
            }}
            className="rounded-lg bg-rose-600 px-5 py-2 text-white hover:bg-rose-500 transition-colors"
            style={{ fontSize: fs(12) }}
          >
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] rounded-b-xl overflow-hidden"
      onDoubleClick={(e) => {
        if (!isSelected) {
          e.stopPropagation();
          onActivate();
        }
      }}
    >
      {/* 参考区：图片 + 视频 + 文本 */}
      <div className={`flex items-center gap-2 px-2 py-1.5 bg-[#252525] border-b border-[#333] shrink-0 ${isSelected ? '' : 'hidden'}`} style={{ fontSize: fs(10), order: 2 }}>
        <span className="text-gray-400 shrink-0">参考:</span>
        <span className="text-green-400 font-medium shrink-0">
          {totalRefImages}图
          {refSlots.some((s) => s.kind === 'video') ? (
            <span className="text-amber-400"> · {refSlots.filter((s) => s.kind === 'video').length}视频</span>
          ) : null}
          {refSlots.some((s) => s.kind === 'text') ? (
            <span className="text-cyan-400"> · {refSlots.filter((s) => s.kind === 'text').length}文本</span>
          ) : null}
        </span>
        <div className="flex gap-1 ml-1 flex-wrap max-w-[330px]">
          {(showAllRefs ? refSlots : refSlots.slice(0, 6)).map((slot) => (
            <div key={`${slot.edgeId}-slot-${slot.n}`} className="relative group">
              <div className="absolute -top-0.5 left-0 z-[1] rounded bg-black/70 px-0.5 font-bold leading-none text-cyan-300" style={{ fontSize: fs(7) }}>
                R{slot.n}{slot.imageBase64s && slot.imageBase64s.length > 1 ? `(${slot.imageBase64s.length})` : ''}
              </div>
              {slot.imageBase64s && slot.imageBase64s.length > 0 ? (
                <div className="flex gap-0.5">
                  {slot.imageBase64s.slice(0, 4).map((img, imgIdx) => (
                    <OptimizedImage
                      key={`${slot.edgeId}-img-${imgIdx}`}
                      base64={img}
                      maxSide={80}
                      quality={0.72}
                      alt={`${slot.label}图${imgIdx + 1}`}
                      className="w-9 h-9 object-cover rounded border border-[#444]"
                    />
                  ))}
                  {slot.imageBase64s.length > 4 && (
                    <div className="w-9 h-9 rounded border border-[#444] bg-[#333] flex items-center justify-center text-gray-400 text-[8px]">
                      +{slot.imageBase64s.length - 4}
                    </div>
                  )}
                </div>
              ) : slot.kind === 'image' && slot.imageBase64 ? (
                <OptimizedImage
                  base64={slot.imageBase64}
                  maxSide={80}
                  quality={0.72}
                  alt={slot.label}
                  className="w-9 h-9 object-cover rounded border border-[#444]"
                />
              ) : slot.kind === 'video' && slot.videoUrl ? (
                <video
                  src={slot.videoUrl}
                  className="w-9 h-9 rounded border border-[#444] object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : slot.kind === 'text' && slot.textContent ? (
                <div className="w-9 h-9 rounded border border-cyan-700/50 bg-[#1a1a2e] flex items-center justify-center text-cyan-300 text-[7px] leading-tight px-0.5 overflow-hidden text-center"
                  title={slot.textContent}>
                  文本
                </div>
              ) : (
                <div className="w-9 h-9 rounded border border-[#444] bg-[#333]" title={slot.label} />
              )}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(slot.edgeId);
                }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="取消引用"
              >
                <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
          {refSlots.length > 6 && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                setShowAllRefs((prev) => !prev);
              }}
              className="flex items-center rounded px-1 text-gray-400 hover:bg-white/10 hover:text-white"
              title={showAllRefs ? '收起参考' : '展开全部参考'}
            >
              {showAllRefs ? '收起' : `+${refSlots.length - 6}`}
            </button>
          )}
        </div>
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            onEyedropperSelect();
          }}
          className={`ml-auto shrink-0 rounded px-2 py-0.5 text-white ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
          title={eyedropperTargetNodeId === node.id ? '取消吸取' : '吸取参考（图片 / 视频节点）'}
        >
          <EyedropperIcon size={fs(12)} />
        </button>
      </div>

      {/* 模型选择 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 bg-[#252525] border-b border-[#333] ${isSelected ? '' : 'hidden'}`}
        style={{ fontSize: 45, order: 3 }}
      >
        <span className="text-gray-400">模型:</span>
        <select
          className="nodemodel-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-rose-500 max-w-[330px]"
          value={normalizeDeepSeekChatModelId(node.model || DEFAULT_DEEPSEEK_CHAT_MODEL_ID).trim()}
          onChange={(e) => onUpdate({ model: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <optgroup label="DeepSeek">
            <option value="deepseek-v4-flash">DeepSeek-V4-Flash</option>
            <option value="deepseek-v4-pro">DeepSeek-V4-Pro</option>
          </optgroup>
          <optgroup label="codesonline">
            <option value="gpt-5.5-codesonline">GPT-5.5（codesonline）</option>
          </optgroup>
          <optgroup label="MiniMax">
            <option value="minimax-m2.7">MiniMax M2.7</option>
          </optgroup>
          <optgroup label="君澜 AI">
            <option value="gpt-5.5-junlan">GPT-5.5（君澜）</option>
            <option value="claude-sonnet-4-6">Claude Sonnet 4-6（君澜）</option>
          </optgroup>
          <optgroup label="Google Gemini / ToAPIs">
            <option value="gemini-2.0-flash-official">Gemini 2.0 Flash（ToAPIs）</option>
            <option value="gemini-3.1-flash-lite-preview-official">Gemini 3.1 Flash Lite（ToAPIs）</option>
          </optgroup>
        </select>
        <label className="flex items-center gap-1 shrink-0 text-gray-500" style={{ fontSize: 45 }}>
          <span className="whitespace-nowrap">字号</span>
          <select
            className="chat-fontsize-select max-w-[120px] rounded border border-[#444] bg-[#222222] px-1.5 py-0.5 text-gray-200 outline-none focus:border-rose-500"
            style={{ fontSize: 45 }}
            value={chatFontPx}
            onChange={(e) => persistChatFontPx(Number(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            title="对话区与输入框字体大小（本机记忆）"
          >
            {[11, 12, 13, 14, 15, 16, 18, 20, 22].map((px) => (
              <option key={px} value={px}>
                {px}px
              </option>
            ))}
          </select>
        </label>
        <button
          onPointerDown={(e) => { e.stopPropagation(); onUpdate({ messages: [] }); }}
          disabled={messages.length === 0}
          className="ml-auto p-1.5 rounded text-white transition-colors bg-[#333] hover:bg-red-600 disabled:opacity-30 disabled:hover:bg-[#333] disabled:cursor-not-allowed"
          title="清除对话"
        >
          <TrashIcon size={fs(14)} />
        </button>
      </div>

      {/* 消息列表 : 底部输入区（功能+引用+文本框）垂直空间 = 2 : 1 */}
      <div
        className={`flex-1 ${isSelected ? 'grid grid-rows-[2fr_1fr]' : 'flex flex-col'} overflow-hidden`}
        style={{ order: 1 }}
      >
      <div
        ref={messagesScrollRef}
        className={`chat-messages overflow-y-scroll p-3 space-y-3 overscroll-contain ${isSelected ? 'min-h-0' : 'flex-1 min-h-0'}`}
        style={{ userSelect: 'text' }}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          // 吸管模式：允许点击消息区域空白触发吸管连线
          if (eyedropperTargetNodeId) return;
          // 判断是否点击在滚动条区域（容器右侧 40px 范围，与滚动条宽度匹配）
          const rect = e.currentTarget.getBoundingClientRect();
          const isScrollbarClick = e.clientX > rect.right - 40 && e.currentTarget.scrollHeight > e.currentTarget.clientHeight;
          if (isScrollbarClick) {
            // 滚动条上的交互不触发节点选中
            e.stopPropagation();
            return;
          }
          // 点击消息气泡区域阻止冒泡，避免触发节点拖拽
          if (target.closest('.chat-bubble-wrap')) {
            e.stopPropagation();
          }
        }}
        onWheel={(e) => {
          // 滚轮滚动阻止冒泡，避免触发画布缩放
          e.stopPropagation();
        }}
      >
        <style>{`
          .chat-messages::-webkit-scrollbar {
            width: 40px;
          }
          .chat-messages::-webkit-scrollbar-track {
            background: #1a1a1a;
            border-radius: 3px;
          }
          .chat-messages::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 3px;
          }
          .chat-messages::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
          /* 滚动条始终可见 */
          .chat-messages {
            overflow-y: scroll !important;
          }
          .chat-messages::-webkit-scrollbar-thumb {
            visibility: visible !important;
          }
        `}</style>
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8" style={{ fontSize: chatFontScaled }}>
            {refSlots.length > 0 && (
              <div className="mt-2 text-cyan-400" style={{ fontSize: fs(Math.max(11, chatFontPx - 1)) }}>
                已连接 {refSlots.length} 条参考（含图/视频），可用下方按钮插入 @R 引用
              </div>
            )}
          </div>
        )}
        {/* 限制显示最近的消息数量，防止图片过多导致崩溃 */}
        {messages.length > MAX_VISIBLE_MESSAGES && (
          <div className="text-center text-gray-500 py-2 text-xs">
            共 {messages.length} 条消息，显示最近 {MAX_VISIBLE_MESSAGES} 条
          </div>
        )}
        {messages.slice(-MAX_VISIBLE_MESSAGES).map((msg, msgIdx) => {
          const editingThis = msg.role === 'user' && editingUserMessageId === msg.id;
          const isUser = msg.role === 'user';
          // 计算这是第几个AI回复（用于@M引用标记）
          const visibleMsgs = messages.slice(-MAX_VISIBLE_MESSAGES);
          const absoluteStartIdx = messages.length - MAX_VISIBLE_MESSAGES;
          let aiReplyCount = 0;
          for (let i = 0; i < msgIdx; i++) {
            if (visibleMsgs[i].role === 'assistant') aiReplyCount++;
          }
          const isAssistantMsgWithImg = !isUser && messageDisplayImages(msg).length > 0;
          const msgRefLabel = isAssistantMsgWithImg ? `@M${aiReplyCount + 1}` : '';
          const displayImages = messageDisplayImages(msg);
          return (
          <div
            key={`${msg.id}-${msgIdx}`}
            className={`chat-bubble-wrap flex ${isUser ? 'justify-end' : 'justify-start'}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
                className={`max-w-[92%] rounded-lg p-2.5 ${isUser ? 'bg-[#1e3a5f] text-gray-100' : 'bg-[#2a2a2a] text-gray-300'}`}
                style={{ fontSize: isUser ? fs(Math.max(13, chatFontPx + 1)) : chatFontScaled }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {isAssistantMsgWithImg && msgRefLabel && (
                <div className="mb-1 text-xs text-cyan-400 bg-[#1a1a2a] rounded px-1.5 py-0.5 inline-block">
                  {msgRefLabel}
                </div>
              )}
              {displayImages.map((im, ii) => (
                <div key={`${msg.id}-img-${ii}`} className={`relative group/image ${ii ? 'mt-1 ' : ''}mb-2`}>
                  <OptimizedImage
                    base64={im}
                    maxSide={840}
                    quality={0.85}
                    alt="AI生成的图片"
                    className="rounded object-contain max-w-full cursor-pointer hover:opacity-90 transition-opacity"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      void resolveCanvasImageSource(im).then((dataUrl) => {
                        if (!dataUrl) return;
                        const win = window.open('', '_blank');
                        if (win) {
                          win.document.write(`<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${dataUrl}" style="max-width:95vw;max-height:95vh;object-fit:contain"/></body></html>`);
                          win.document.close();
                        }
                      });
                    }}
                  />
                  {/* 复制图片按钮 */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void resolveCanvasImageSource(im).then((dataUrl) => {
                        if (!dataUrl) return;
                        fetch(dataUrl)
                        .then(r => r.blob())
                        .then(blob => {
                          navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                          ]);
                        })
                        .catch(() => {
                          navigator.clipboard.writeText(im);
                        });
                      });
                    }}
                    className="absolute top-1 left-1 opacity-0 group-hover/image:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 rounded p-1"
                    title="复制图片"
                  >
                    <CopyIcon size={12} />
                  </button>
                  {/* 最大化按钮 */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenFullscreen) {
                        onOpenFullscreen(im);
                      }
                    }}
                    className="absolute top-1 right-7 opacity-0 group-hover/image:opacity-100 transition-opacity bg-black/70 hover:bg-black/90 rounded p-1"
                    title="最大化"
                  >
                    <MaximizeIcon size={12} />
                  </button>
                  {/* 存储为节点按钮 */}
                  {onCreateImageNode && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateImageNode([im], node.x + node.width + 50, node.y);
                      }}
                      className="absolute top-1 left-1 opacity-0 group-hover/image:opacity-100 transition-opacity bg-purple-600/80 hover:bg-purple-600 rounded p-1"
                      title="存储为图片节点"
                    >
                      <ImageIcon size={12} />
                    </button>
                  )}
                </div>
              ))}
                {editingThis ? (
                  <>
                    <textarea
                      key={editingUserMessageId ?? 'no-edit'}
                      value={editUserDraft}
                      onChange={(e) => setEditUserDraft(e.target.value)}
                      rows={5}
                      className="w-full min-h-[180px] rounded-md bg-black/25 border border-white/35 px-2 py-1.5 text-white outline-none focus:border-white/60"
                      style={{ fontSize: fs(Math.max(13, chatFontPx + 1)) }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingUserMessageId(null);
                        }}
                        className="rounded bg-white/15 px-2 py-1 hover:bg-white/25"
                        style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const idx = messages.findIndex((m) => m.id === msg.id);
                          const t = editUserDraft.trim();
                          if (idx < 0 || !t) return;
                          onResendWithHistory(messages.slice(0, idx), t);
                          setEditingUserMessageId(null);
                        }}
                        className="rounded bg-white/90 px-2 py-1 font-medium text-blue-800 hover:bg-white"
                        style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                      >
                        保存并重新生成
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className={`whitespace-pre-wrap break-words rounded-sm px-0.5 -mx-0.5 ${
                        msg.role === 'user' && !node.isGenerating ? 'cursor-text hover:bg-white/10' : ''
                      }`}
                      style={{ userSelect: 'text' }}
                      title={msg.role === 'user' && !node.isGenerating ? '双击可修改本条提问' : undefined}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!isSelected) {
                          onActivate();
                          return;
                        }
                        if (msg.role !== 'user' || node.isGenerating) return;
                        setEditingUserMessageId(msg.id);
                        setEditUserDraft(msg.content);
                      }}
                    >
                      {msg.content}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(msg.content);
                        }}
                        className={
                          msg.role === 'user'
                            ? 'rounded border border-white/25 bg-white/10 px-2 py-0.5 opacity-90 hover:bg-white/20'
                            : 'rounded px-2 py-0.5 opacity-50 hover:opacity-100'
                        }
                        style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                        title="复制"
                      >
                        复制
                      </button>
                      {msg.role === 'user' && !node.isGenerating ? (
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (onOpenBigEditor) {
                              onOpenBigEditor(msg.content, (newVal) => {
                                setEditUserDraft(newVal);
                                setEditingUserMessageId(msg.id);
                              });
                            } else {
                              setEditingUserMessageId(msg.id);
                              setEditUserDraft(msg.content);
                            }
                          }}
                          className="rounded border border-white/40 bg-white/15 px-2 py-0.5 font-medium hover:bg-white/25"
                          style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                          title="修改本条消息并重新生成"
                        >
                          再次编辑
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const el = chatPromptRef.current;
                          const cur = node.prompt || '';
                          const content = msg.content;
                          // 点击时先获取光标位置
                          let insertPos = 0;
                          if (el) {
                            const sel = el.selectionStart;
                            insertPos = sel ?? cur.length;
                          }
                          const next = cur.slice(0, insertPos) + content + cur.slice(insertPos);
                          onUpdate({ prompt: next });
                          requestAnimationFrame(() => {
                            if (el) {
                              el.focus();
                              el.selectionStart = el.selectionEnd = insertPos + content.length;
                            }
                          });
                        }}
                        className="rounded border border-white/25 px-2 py-0.5 opacity-70 hover:opacity-100 hover:bg-white/10"
                        style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                        title="将此条消息内容作为参考添加到输入框"
                      >
                        作为参考
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newMessages = (node.messages || []).filter((m: ChatMessage) => m.id !== msg.id);
                          onUpdate({ messages: newMessages });
                        }}
                        className="rounded border border-white/25 px-2 py-0.5 opacity-70 hover:opacity-100 hover:bg-red-500/50"
                        style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                        title="删除本条消息"
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
          </div>
            </div>
          );
        })}
        {node.isGenerating && (
          <div className="flex justify-start">
            <div
              className="bg-[#2a2a2a] rounded-lg p-3 text-gray-400 flex flex-col gap-1"
              style={{ fontSize: chatFontScaled }}
            >
              <span className="flex items-center gap-2">
                <LoaderIcon size={fs(14)} /> 思考中…
              </span>
              {generationStartedAt != null && (
                <GenerationTimer
                  startedAt={generationStartedAt}
                  prefix="已用时"
                  className="tabular-nums text-gray-500"
                  showSeconds
                  secondsClassName="tabular-nums text-gray-500"
                />
              )}
            </div>
          </div>
        )}
        {node.error && chatErrorDiagnosis && (
          <div className="flex justify-start">
            <div
              className="bg-red-950/90 rounded-lg p-2.5 text-red-200 border border-red-900/60 max-w-[92%] cursor-pointer"
              style={{ fontSize: chatFontScaled }}
              onClick={() => onUpdate({ error: undefined })}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="font-bold">{chatErrorDiagnosis.title}</div>
                <button onPointerDown={(e) => { e.stopPropagation(); navigator.clipboard.writeText(node.error || ''); }} className="text-red-300 hover:text-red-100"><CopyIcon size={12} /></button>
              </div>
              <div className="text-red-100/90 mb-1">{chatErrorDiagnosis.reason}</div>
              <div className="text-red-300 mb-2">{node.error}</div>
              <div className="flex flex-wrap gap-1">
                {chatErrorDiagnosis.fixes.map((fix, idx) => (
                  <button
                    key={`chat-fix-${idx}`}
                    onPointerDown={(e) => { e.stopPropagation(); fix.action(); }}
                    className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-red-50 border border-red-600/50"
                  >
                    {fix.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输入区域（与上方消息区 grid 2:1） */}
      <div className={`flex min-h-0 flex-col overflow-y-auto border-t border-[#333] bg-[#252525] p-2 ${isSelected ? '' : 'hidden'}`}>
        {/* 快捷功能：置于文字输入框上方 */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-[#333] bg-[#3A3A3A] px-2 py-1.5" style={{ fontSize: 50 }}>
          <span className="shrink-0 text-gray-500">功能</span>
          {CHAT_FEATURE_BUTTON_SPECS.map((btn) => {
            const toneClass = CHAT_FEATURE_BUTTON_TONE_CLASSES[btn.tone ?? 'rose'];
            return (
            <button
              key={btn.id}
              type="button"
              disabled={node.isGenerating}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleFeatureButtonClick(btn.presetKey);
              }}
              className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
              title={btn.title}
            >
              {btn.icon === 'wand' ? (
                <WandIcon size={fs(11)} />
              ) : btn.icon === 'message' ? (
                <MessageIcon size={fs(11)} />
              ) : (
                <VideoIcon size={fs(11)} />
              )}
              {btn.label}
            </button>
            );
          })}
        </div>
        {/* 生图比例和分辨率选择器 */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-gray-400 shrink-0" style={{ fontSize: fs(10) }}>比例:</span>
          <select
            className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-purple-500"
            style={{ fontSize: fs(10) }}
            value={node.imageAspectRatio || '16:9'}
            onChange={(e) => onUpdate({ imageAspectRatio: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="21:9">21:9</option>
          </select>
          <span className="text-gray-400 shrink-0" style={{ fontSize: fs(10) }}>分辨率:</span>
          <select
            className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-purple-500"
            style={{ fontSize: fs(10) }}
            value={node.imageResolution || '2k'}
            onChange={(e) => onUpdate({ imageResolution: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="0.5k">0.5K</option>
            <option value="1k">1K</option>
            <option value="2k">2K</option>
            <option value="4k">4K</option>
          </select>
          <span className="text-gray-400 shrink-0" style={{ fontSize: fs(10) }}>模型:</span>
          <select
            className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-purple-500"
            style={{ fontSize: fs(10) }}
            value={node.imageModel || 'gpt-image-2-codesonline'}
            onChange={(e) => onUpdate({ imageModel: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option>
            <option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option>
            <option value="gpt-image-2">GPT Image 2（ToAPIs）</option>
            <option value="gpt-image-2-manxue">GPT Image 2（满 e）</option>
            <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option>
            <option value="gemini-3.1-flash-image-preview-2k-manxue">Gemini 3.1 Flash Image 2K（满 e）</option>
            <option value="gemini-3-pro-image-preview-2k-manxue">Gemini 3 Pro Image 2K（满 e）</option>
          </select>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              // 触发图片生成模式：在 prompt 前面加上生图指令前缀
              const currentPrompt = node.prompt || '';
              // 检查是否已经有生图前缀
              if (!currentPrompt.startsWith('[生图]')) {
                onUpdate({ prompt: '[生图] ' + currentPrompt });
              }
            }}
            disabled={node.isGenerating}
            className="rounded bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white flex items-center justify-center px-3 py-0.5"
            style={{ width: 300, fontSize: fs(10) }}
            title="AI生图"
          >
            <ImageIcon size={fs(12)} />
            <span className="ml-1">AI生图</span>
          </button>
        </div>
        <RefPickBar
          slots={refSlots}
          disabled={node.isGenerating}
          uiScale={CHAT_PANEL_FONT_SCALE}
          onInsert={(tok) => insertPromptToken(tok.endsWith(' ') ? tok : `${tok} `)}
        />
        <div className="flex gap-2">
          <textarea
            ref={chatPromptRef}
            className="flex-1 bg-[#222222] text-gray-200 p-2.5 rounded border border-[#444] focus:outline-none focus:border-rose-500 resize-y"
            style={{
              fontSize: chatFontScaled,
              minHeight: fs(108),
              height: node.chatInputHeight ?? fs(152),
              overflowY: 'auto',
            }}
            value={node.prompt || ''}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate({ prompt: val });
              // 检测 @ 触发自动完成
              const sel = chatPromptRef.current?.selectionStart ?? val.length;
              const textBefore = val.slice(0, sel);
              // @R 或 @M 开头时显示选择器
              if (textBefore.endsWith('@') || textBefore.endsWith('@R') || textBefore.endsWith('@M')) {
                const el = chatPromptRef.current;
                if (el) {
                  // 使用 mirror div 精确测量光标位置
                  const mirror = document.createElement('div');
                  const style = window.getComputedStyle(el);
                  mirror.style.cssText = `
                    position: absolute;
                    top: -9999px;
                    left: -9999px;
                    visibility: hidden;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    width: ${el.offsetWidth}px;
                    font-size: ${style.fontSize};
                    font-family: ${style.fontFamily};
                    line-height: ${style.lineHeight};
                    padding: ${style.padding};
                    border: ${style.border};
                    box-sizing: border-box;
                    overflow: hidden;
                  `;
                  const textUpToCursor = val.slice(0, el.selectionStart || 0);
                  mirror.textContent = textUpToCursor;
                  document.body.appendChild(mirror);
                  const cursorHeight = mirror.offsetHeight;
                  document.body.removeChild(mirror);
                  const rect = el.getBoundingClientRect();
                  const top = rect.top + cursorHeight;
                  setAtPickerPos({ top: top + 4, left: rect.left });
                  savedCursorPosRef.current = { start: sel, end: sel };
                  setSavedCursorPos({ start: sel, end: sel });
                }
                setShowAtPicker(true);
              } else if (textBefore.match(/@[RM]\d+$/)) {
                // 输入了完整编号时不显示
                setShowAtPicker(false);
              } else {
                setShowAtPicker(false);
              }
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={syncPromptCursor}
            onSelect={syncPromptCursor}
            placeholder=""
            onPointerDown={(e) => {
              e.stopPropagation();
              // 双击检测：基于时间戳（320ms 间隔内第二次点击即为双击）
              const now = Date.now();
              if (now - bigInputLastClickTimeRef.current < 320) {
                bigInputLastClickTimeRef.current = 0;
                if (onOpenBigEditor) {
                  onOpenBigEditor(node.prompt || '', (v) => onUpdate({ prompt: v }));
                } else {
                  setBigInputDraft(node.prompt || '');
                  setShowBigInput(true);
                }
              } else {
                bigInputLastClickTimeRef.current = now;
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!isSelected) {
                onActivate();
                return;
              }
              if (onOpenBigEditor) {
                onOpenBigEditor(node.prompt || '', (v) => onUpdate({ prompt: v }));
              } else {
                setBigInputDraft(node.prompt || '');
                setShowBigInput(true);
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              syncPromptCursor();
              const nextHeight = Math.max(fs(108), Math.round((e.currentTarget as HTMLTextAreaElement).offsetHeight));
              if (nextHeight !== (node.chatInputHeight ?? fs(152))) {
                onUpdate({ chatInputHeight: nextHeight });
              }
            }}
          />
          {showAtPicker && (
            <div
              ref={atPickerRef}
              className="absolute z-50 bg-[#1e1e1e] border border-[#444] rounded-lg shadow-xl overflow-hidden"
              style={{ top: atPickerPos.top, left: atPickerPos.left, minWidth: 180 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 text-xs text-gray-400 border-b border-[#333]">选择引用</div>
              {/* 参考区图片 */}
              {refSlots.length > 0 && (
                <>
                  <div className="px-3 py-1 text-xs text-cyan-400">连线参考</div>
{refSlots.map((s) => (
                    <button
                      key={`at-r${s.n}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertPromptToken(`@R${s.n} `)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-[#333]"
                    >
                      <span className="text-cyan-400">@R{s.n}</span> {s.label}
                    </button>
                  ))}
                </>
              )}
              {/* 历史消息图片 */}
              {(() => {
                const aiReplies: { num: number; images: string[] }[] = [];
                for (let i = 0; i < (node.messages || []).length; i++) {
                  const msg = (node.messages || [])[i];
                  if (msg.role === 'assistant' && (msg.images?.length || msg.image)) {
                    aiReplies.push({ num: aiReplies.length + 1, images: msg.images || (msg.image ? [msg.image] : []) });
                  }
                }
                if (aiReplies.length === 0) return null;
                return (
                  <>
                    <div className="px-3 py-1 text-xs text-purple-400">消息图片</div>
{aiReplies.map((r) => (
                      <button
                        key={`at-m${r.num}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertPromptToken(`@M${r.num} `)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-[#333]"
                      >
                        <span className="text-purple-400">@M{r.num}</span> AI回复({r.images.length}张图)
                      </button>
                    ))}
                  </>
                );
              })()}
              <button
                onClick={() => setShowAtPicker(false)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-[#333] border-t border-[#333]"
              >
                取消
              </button>
            </div>
          )}
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              onSendMessage();
            }}
            disabled={node.isGenerating || !node.prompt?.trim()}
            className="rounded bg-rose-600 hover:bg-rose-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white flex items-center justify-center px-3"
            style={{ width: 200, height: 600 }}
          >
            <SendIcon size={fs(14)} />
            <span className="ml-2">发送</span>
          </button>
          {node.isGenerating && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                if (onCancelGeneration) {
                  onCancelGeneration(node.id);
                }
              }}
              className="rounded bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center px-3 ml-2"
              style={{ width: 100, height: 600 }}
              title="取消生成"
            >
              <StopIcon size={fs(14)} />
              <span className="ml-1">取消</span>
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
