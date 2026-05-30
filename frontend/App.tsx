import React, { lazy, Suspense, useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CanvasNode, Edge, Transform, Tool, NodeType, Annotation, AnnotationNode, PanoramaNode, GridSplitNode, GridMergeNode, PanoramaT2iNode, Director3DNode, Figure3D, ChatNode, ChatMessage, CanvasMode, AuditImage, AuditModeData } from './types';
import { GridSplitNodeContent } from './canvas/GridSplitNodeContent';
import { GridMergeNodeContent } from './canvas/GridMergeNodeContent';
import { HeavyNodeFallback } from './canvas/HeavyNodeFallback';

const AuditModeCanvas = lazy(() => import('./AuditModeCanvas'));
const PanoramaNodeContent = lazy(() =>
  import('./canvas/PanoramaNodeContent').then((m) => ({ default: m.PanoramaNodeContent }))
);
const Director3DNodeContent = lazy(() =>
  import('./canvas/Director3DNodeContent').then((m) => ({ default: m.Director3DNodeContent }))
);
const AnnotationNodeContent = lazy(() =>
  import('./canvas/AnnotationNodeContent').then((m) => ({ default: m.AnnotationNodeContent }))
);
import { OptimizedImage } from './canvas/OptimizedImage';
import { clearCanvasThumbnailCache, thumbnailCache, THUMB_MAX_CACHE } from './canvas/thumbnailCache';
import { EyedropperIcon, FullscreenIcon } from './canvas/canvasIcons';
import { defaultCanvasImageModel } from './canvas/canvasModelUtils';
import { ChatNodeContent } from './canvas/ChatNodeContent';
import { RefPickBar } from './canvas/RefPickBar';
import { EdgePath } from './canvas/EdgePath';
import { CHAT_NODE_DEFAULT_PIXEL_HEIGHT, CHAT_PANEL_FONT_SCALE } from './canvas/chatNodeUtils';
import { INITIAL_CHAT_PROMPT_PRESETS } from './canvas/chatPromptTemplates';
import { computeEdgeBridges, nodeLayoutKey } from './canvas/edgeUtils';
import {
  buildStructuralHistoryKey,
  buildPromptHistoryKey,
  HISTORY_DEBOUNCE_STRUCTURAL_MS,
  HISTORY_DEBOUNCE_PROMPT_MS,
} from './canvas/canvasHistoryPolicy';
import { CanvasMinimap } from './canvas/CanvasMinimap';
import { ThreeEngineGate } from './canvas/ThreeEngineGate';
import { computeVisibleNodeIds } from './canvas/viewportUtils';
import { MemoizedNodePlaceholder } from './canvas/MemoizedNodePlaceholder';
import { MemoNodeCard } from './canvas/MemoNodeCard';
import { GenerationTimer } from './canvas/GenerationTimer';
import { buildSpacedImageNodes, buildSpacedImageNodesFromLists, buildStackedImageNodesFromLists, collectImageFilesFromClipboardData, collectImageFilesFromDataTransfer, readBlobsAsBase64, readFilesAsBase64, SPAWNED_IMAGE_NODE_HEIGHT, SPAWNED_IMAGE_NODE_WIDTH } from './canvas/spawnImageNodes';
import {
  stripImagesFromNodes,
  mergeHistoryNodesWithCurrentImages,
  type CanvasHistoryEntry,
} from './canvas/canvasHistoryUtils';
import { buildNodeMediaOffloadPatch, nodeNeedsMediaOffload } from './services/canvasAssetSync';
import { revokeNodeCanvasAssets } from './services/canvasAssetCleanup';
import {
  cloneImageSlotForNewNode,
  countNodeImageSlots,
  hasCanvasImagePayload,
  imageSrcToRawBase64,
  probeImageDisplayMetadata,
  resolveCanvasImageSource,
} from './services/canvasAssetResolver';
import {
  buildMoveNodesCommand,
  reverseCanvasCommand,
  CANVAS_COMMAND_STACK_MAX,
  type CanvasCommand,
} from './canvas/canvasCommands';
import type { AiProvider } from './services/aiSettings';
import {
  DEFAULT_CODESONLINE_CHAT_BASE_URL,
  DEFAULT_CODESONLINE_IMAGE_BASE_URL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
  DEFAULT_JUNLAN_BASE_URL,
  DEFAULT_MANXUE_BASE_URL,
  DEFAULT_MINIMAX_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_AIID_BASE_URL,
  getAiSettingsSnapshot,
  normalizeDeepSeekChatModelId,
  getCodesonlineSavedKey,
  getCodesonlineChatSavedKey,
  setCodesonlineChatKey,
  getJunlanSavedKey,
  migrateAiSettingsIfLegacy,
  persistAiSettings,
  getAiidBaseUrl,
  getAiidSavedKey,
} from './services/aiSettings';
import {
  loadProjectLibrary,
  saveProjectLibrary,
  exportProjectZipToDisk,
  parseProjectFromZipFile,
  sanitizeFilename,
  CANVAS_LIBRARY_IDB_LABELS,
} from './services/projectPersistence';
import {
  getProjectBackupFileHandle,
  getProjectDraftDirectoryHandle,
  persistProjectBackupFileHandle,
  persistProjectDraftDirectoryHandle,
  removeProjectBackupFileHandle,
} from './services/projectBackupHandleStore';
import type { CanvasProjectSnapshot } from './services/projectPersistence';
import { useJimengAuth } from './integrations/jimeng/JimengAuthProvider';
import { generateJimengVideo, queryJimengTask, upscaleJimengImage } from './integrations/jimeng/jimengClient';
import {
  callGeminiChatWithHistory,
  editExistingImage,
  generateCanvasVideoViaToApis,
  generateNewImage,
  initGeminiClientFromStorage,
} from './services/geminiService';
import {
  buildIncomingRefSlots,
  parseRefPickIndices,
  parseMsgPickIndices,
  stripRefMarkers,
  resolveSlotImagesForIndices,
  resolveSlotAudios,
  getNodePrimaryImageRef,
  imageRefToSingleImageFields,
  resolveImageProviderNodes,
  singleImageFieldsMatch,
  type IncomingRefSlot,
} from './referenceSlots';
import type { DownloadPathPersisted } from './services/downloadPathSettings';
import {
  clearStoredDownloadDirectory,
  getDownloadHandleCacheSnapshot,
  hydrateDownloadDirectoryHandlesFromIDB,
  loadDownloadPathSettings,
  pickAndStoreDownloadDirectory,
  saveDownloadPathSettings,
  saveImageDownload,
  saveVideoDownloadFromUrl,
  setActiveProjectDraftDownloadDirectory,
  supportsFileSystemAccess,
} from './services/downloadPathSettings';
import type { CreditPricingRow } from './services/creditPricingSettings';
import {
  loadCreditPricingRows,
  newCreditPricingRow,
  saveCreditPricingRows,
} from './services/creditPricingSettings';

// --- Icons ---
const MousePointerIcon = ({ size = 20 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>;
const HandIcon = ({ size = 20 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>;
const TrashIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
const LoaderIcon = ({ size = 16 }) => <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
const WandIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>;
const ImageIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>;
const VideoIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>;
const TextIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>;
const GridIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const GridMergeIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="10" y1="3" x2="10" y2="21"/><line x1="14" y1="3" x2="14" y2="21"/></svg>;
const SingleIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>;
const ChevronLeftIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const ChevronRightIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
const DownloadIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
const XIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>;
const MaximizeIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>;
const PlusIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const KeyIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
const SettingsIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
// 全景图图标
const PanoramaIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const WidePanoramaIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="12" x2="22" y2="12"/></svg>;
// 标注图标
const AnnotationIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><circle cx="13" cy="13" r="3"/></svg>;
// 框选图标
const BoxSelectIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>;
// 3D导演台图标 - 包含一个人形和镜头
const Director3DIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M12 12v4"/><path d="M8 22l4-6 4 6"/><path d="M7 8l5-4 5 4"/><path d="M17 2l3 3-3 3"/><path d="M20 14h-3"/></svg>;
// 复制图标
const CopyIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>;
// 消息/对话图标
const MessageIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
// 发送图标
const SendIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
// 语音/音频图标
const AudioIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>;
const SparklesIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>;
// 停止图标
const StopIcon = ({ size = 16 }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>;

// --- Unique message ID counter ---
let _msgCounter = 0;
function nextMsgId(role: 'user' | 'assistant') {
  // 直接使用 crypto.randomUUID() 保证全局唯一性，每次调用都生成新 UUID
  const timestamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const uuidPart = typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `fallback-${timestamp}-${_msgCounter++}`;
  return `msg-${uuidPart}`;
}

/** ToAPIs 等返回的 base64 可能是 PNG/WebP，一律按魔数识别后再喂给 Image/canvas */
function sniffImageMimeFromBase64(raw: string): string {
  if (!raw || raw.length < 8) return 'image/png';
  // 清理可能的前缀
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '');
  try {
    const dec = atob(cleaned.slice(0, 48));
    const a = dec.charCodeAt(0);
    const b = dec.charCodeAt(1);
    if (a === 0xff && b === 0xd8) return 'image/jpeg';
    if (a === 0x89 && b === 0x50) return 'image/png';
    if (a === 0x47 && b === 0x49) return 'image/gif';
    if (a === 0x52 && b === 0x49 && dec.startsWith('RIFF')) return 'image/webp';
  } catch {
    /* ignore */
  }
  return 'image/png';
}

/** 视频节点模型 → ToAPIs 模型 */
function videoNodeModelToToApis(m?: string): ToApisVideoModelId {
  const vm = (m || '').trim();
  if (vm === 'sora-2-vvip') return 'sora-2-vvip';
  if (isVeo31FastVideoModel(vm)) return 'veo3.1-fast';
  if (vm === 'doubao-seedance-1-5-pro') return 'doubao-seedance-1-5-pro';
  if (vm === 'doubao-seedance-2-0-260128' || vm === 'doubao-seedance-2-0-fast-260128') return vm as ToApisVideoModelId;
  if (vm === 'seedance-2' || vm === 'seedance-2-fast') return vm as ToApisVideoModelId;
  if (vm === 'gemini-omni-flash') return 'gemini-omni-flash';
  if (vm === 'jimeng-video-v3' || vm === 'jimeng-image-to-video') return vm as ToApisVideoModelId;
  return 'grok-video-3';
}

/**
 * 判断当前选择的模型是否为即梦模型。
 * 兼容多种字段命名（model / selectedModel / provider / id / value）。
 */
function isJimengVideoModel(modelOrConfig: unknown): boolean {
  if (!modelOrConfig) return false;

  if (typeof modelOrConfig === 'string') {
    return modelOrConfig.startsWith('jimeng-') || modelOrConfig.includes('jimeng');
  }

  if (typeof modelOrConfig === 'object' && modelOrConfig !== null) {
    const obj = modelOrConfig as Record<string, unknown>;
    return (
      obj.provider === 'jimeng' ||
      obj.providerId === 'jimeng' ||
      typeof obj.id === 'string' && (obj.id as string).startsWith('jimeng-') ||
      typeof obj.model === 'string' && (obj.model as string).startsWith('jimeng-') ||
      typeof obj.value === 'string' && (obj.value as string).startsWith('jimeng-')
    );
  }

  return false;
}

/** 判断是否为即梦生图模型 */
function isJimengImageModel(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return m.startsWith('jimeng-image-') ||
         m.startsWith('jimeng-') ||
         m.includes('jimeng');
}

/** 视频节点 Veo：当前存 `veo3.1-fast`；旧工程可能仍为 `veo3.1-fast-official` */
function isVeo31FastVideoModel(m?: string): boolean {
  return m === 'veo3.1-fast' || m === 'veo3.1-fast-official';
}

/** 视频节点 Veo */
function isVideoVeoStyleModel(m?: string): boolean {
  return isVeo31FastVideoModel(m);
}

/** 视频节点 Sora */
function isVideoSoraStyleModel(m?: string): boolean {
  return m === 'sora-2-vvip';
}

/** 视频节点 Grok 秒数档 */
function isVideoGrokDurationStyleModel(m?: string): boolean {
  const x = (m || '').trim();
  return !x || x === 'grok-video-3';
}

function base64ToImageDataUrl(raw: string): string {
  // 如果已经是完整的 URL（http/https/data URL），直接返回
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  return `data:${sniffImageMimeFromBase64(raw)};base64,${raw}`;
}

// --- Helper: Upscale Image ---
const MAX_UPSCALE_CANVAS_EDGE = 8192;

const upscaleImage = (base64Str: string, targetRes: string): Promise<string> => {
  if (targetRes === '1k' || !targetRes) return Promise.resolve(base64Str);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = targetRes === '4k' ? 4 : targetRes === '2k' ? 2 : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      if (w > MAX_UPSCALE_CANVAS_EDGE || h > MAX_UPSCALE_CANVAS_EDGE || w < 1 || h < 1) {
        resolve(base64Str);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64ToImageDataUrl(base64Str);
  });
};

/** Blob URL 注册表：管理 node.images 中 blob URL 的生命周期
 * key = nodeId, value = Set<blobUrl>
 * 节点删除时统一 revoke，防止内存泄漏
 */
const blobUrlRegistry = new Map<string, Set<string>>();
const blobUrlIdCounter = { v: 0 };

/** 将 base64 转为 Blob URL 并注册到 registry */
function base64ToBlobUrl(base64: string, nodeId: string, fieldIndex: number): string {
  // http(s) URL 或已是以 blob: 开头的不处理
  if (base64.startsWith('http://') || base64.startsWith('https://') || base64.startsWith('blob:')) {
    return base64;
  }
  // 提取 mime type（默认 png）
  const mime = base64.startsWith('data:') ? base64.split(';')[0].split('/')[1] || 'png' : 'png';
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  let blob: Blob;
  try {
    const binaryStr = atob(clean);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    blob = new Blob([bytes], { type: `image/${mime}` });
  } catch {
    return base64; // 解析失败回退
  }
  const url = URL.createObjectURL(blob);
  // 注册到表
  if (!blobUrlRegistry.has(nodeId)) blobUrlRegistry.set(nodeId, new Set());
  blobUrlRegistry.get(nodeId)!.add(url);
  return url;
}

/** 节点删除时调用，回收该节点所有 blob URL */
function revokeNodeBlobUrls(nodeId: string): void {
  const urls = blobUrlRegistry.get(nodeId);
  if (!urls) return;
  urls.forEach(url => URL.revokeObjectURL(url));
  blobUrlRegistry.delete(nodeId);
}

/** 全局清理：关闭页面时释放所有 blob URL */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    blobUrlRegistry.forEach(urls => urls.forEach(url => URL.revokeObjectURL(url)));
    blobUrlRegistry.clear();
  });
}

/** 单份画布 base64 总字符量超过此值时不再压入撤销栈（避免 structuredClone 直接 OOM） */
const CANVAS_HISTORY_SKIP_PAYLOAD_CHARS = 22_000_000;

/**
 * 估算节点内大块 base64 字符串体量（字符数），用于动态限制撤销深度。
 * 多步撤销 = 多份完整克隆，体量会近似「单步 × 步数」。
 */
function estimateCanvasBase64PayloadChars(nodes: CanvasNode[]): number {
  let w = 0;
  const add = (s: string | undefined) => {
    if (typeof s === 'string') w += s.length;
  };
  for (const n of nodes) {
    if (n.images?.length) for (const im of n.images) add(im);
    add((n as PanoramaNode).panoramaImage);
    add((n as Director3DNode).backgroundImage);
    add((n as AnnotationNode).sourceImage);
    add((n as GridSplitNode).inputImage);
    const splitOuts = (n as GridSplitNode).outputImages;
    if (splitOuts) for (const im of splitOuts) add(im);
    const mergeIns = (n as GridMergeNode).inputImages;
    if (mergeIns) for (const im of mergeIns) add(im);
    add((n as GridMergeNode).outputImage);
    add((n as PanoramaT2iNode).panoramaImage);
    if (n.type === 'chat') {
      const msgs = (n as ChatNode).messages;
      if (msgs) {
        for (const m of msgs) {
          if (m.images?.length) for (const im of m.images) add(im);
          add(m.image);
        }
      }
    }
    if (n.type === 'director3d' && (n as Director3DNode).figures?.length) {
      for (const f of (n as Director3DNode).figures!) add(f.image);
    }
  }
  return w;
}

/** 根据当前画布体量返回撤销栈最大步数（每步一份完整克隆） */
function canvasHistoryMaxSteps(payloadChars: number): number {
  if (payloadChars > 16_000_000) return 2;
  if (payloadChars > 7_000_000) return 3;
  if (payloadChars > 3_000_000) return 5;
  if (payloadChars > 1_200_000) return 7;
  return 10;
}

/** 预览区缩略图分辨率比例（5/10/20/50/70/100%）默认5%最低档大幅减少内存占用 */
const thumbResolutionRef = { v: 5 };

function useLazyImageLoad(base64: string, maxSide: number, quality: number) {
  const [src, setSrc] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver：只当图片进入视口时才加载
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad || !base64) {
      setSrc('');
      return;
    }

    const cachedKey = `${base64.slice(0, 48)}|${base64.slice(-48)}|${base64.length}|${maxSide}|${quality}`;
    const cached = thumbnailCache.get(cachedKey);
    if (cached) {
      setSrc(cached);
      setLoaded(true);
      return;
    }

    setSrc('');
    const originalSrc = base64ToImageDataUrl(base64);
    const img = new Image();
    img.onload = () => {
      const maxEdge = Math.max(img.width, img.height);
      if (maxEdge <= maxSide) {
        thumbnailCache.set(cachedKey, originalSrc);
        setSrc(originalSrc);
        setLoaded(true);
        return;
      }
      const scale = maxSide / maxEdge;
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const thumbSrc = canvas.toDataURL('image/jpeg', quality);
      thumbnailCache.set(cachedKey, thumbSrc);
      if (thumbnailCache.size > THUMB_MAX_CACHE) {
        const firstKey = thumbnailCache.keys().next().value;
        if (firstKey) thumbnailCache.delete(firstKey);
      }
      setSrc(thumbSrc);
      setLoaded(true);
    };
    img.onerror = () => {
      setSrc(originalSrc);
      setLoaded(true);
    };
    img.src = originalSrc;
  }, [base64, maxSide, quality, shouldLoad]);

  return { src, loaded, imgRef };
}

// 懒加载图片组件（用于消息列表中的图片）
function LazyMessageImage({
  base64,
  maxSide = 840,
  quality = 0.85,
}: {
  base64: string;
  maxSide?: number;
  quality?: number;
}) {
  const { src, loaded, imgRef } = useLazyImageLoad(base64, maxSide, quality);

  return (
    <div ref={imgRef} className="relative w-full min-h-[100px] bg-[#333] rounded overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {src && (
        <img
          src={src}
          alt="AI生成的图片"
          className="w-full object-contain"
          loading="lazy"
        />
      )}
    </div>
  );
}

// --- Lazy Loading Hook & Component ---
// 使用 IntersectionObserver 在图片进入视口时才加载，离开后释放内存

/** 判断节点是否在视口内（考虑画布缩放和偏移） */
function isNodeInViewport(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  transform: Transform,
  viewportWidth: number,
  viewportHeight: number,
  margin = 200 // 额外边距，提前加载
): boolean {
  // 将节点坐标转换到屏幕坐标
  const screenLeft = nodeX * transform.scale + transform.x;
  const screenTop = nodeY * transform.scale + transform.y;
  const screenRight = screenLeft + nodeWidth * transform.scale;
  const screenBottom = screenTop + nodeHeight * transform.scale;

  return !(
    screenRight < -margin ||
    screenLeft > viewportWidth + margin ||
    screenBottom < -margin ||
    screenTop > viewportHeight + margin
  );
}

/** 懒加载 hook：监听元素是否进入视口 */
function useIntersectionObserver(
  containerRef: React.RefObject<HTMLDivElement | null>,
  rootMargin = 200 // 额外边距，提前加载
): [boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsIntersecting(entry.isIntersecting);
        });
      },
      {
        root: null, // 视口
        rootMargin: `${rootMargin}px`,
        threshold: 0,
      }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, rootMargin]);

  return [isIntersecting];
}

/** 懒加载版 OptimizedImage：进入视口才加载原图，离开释放 */
function LazyOptimizedImage({
  base64,
  className,
  alt,
  maxSide = 640,
  quality = 0.62,
  onClick,
  onDoubleClick,
  draggable = false,
  isInViewport = true, // 默认在视口内
}: {
  base64: string;
  className?: string;
  alt?: string;
  maxSide?: number;
  quality?: number;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  isInViewport?: boolean;
}) {
  const [src, setSrc] = useState('');
  const [loaded, setLoaded] = useState(false);
  const maxSideRef = useRef(maxSide);
  maxSideRef.current = maxSide;

  // 仅当在视口内且有 base64 时才加载
  useEffect(() => {
    if (!base64) {
      setSrc('');
      setLoaded(false);
      return;
    }

    // 不在视口内则显示空白占位
    if (!isInViewport) {
      setSrc('');
      setLoaded(false);
      return;
    }

    // 检查缓存（仅缓存小图或缩略图）
    const cachedKey = `${base64.slice(0, 48)}|${base64.slice(-48)}|${base64.length}|${maxSideRef.current}|${quality}`;
    const cached = thumbnailCache.get(cachedKey);
    if (cached) {
      setSrc(cached);
      setLoaded(true);
      return;
    }

    setSrc('');
    const originalSrc = base64ToImageDataUrl(base64);
    const img = new Image();
    img.onload = () => {
      const maxEdge = Math.max(img.width, img.height);
      if (maxEdge <= maxSideRef.current) {
        thumbnailCache.set(cachedKey, originalSrc);
        setSrc(originalSrc);
        setLoaded(true);
        return;
      }
      const scale = maxSideRef.current / maxEdge;
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const thumbSrc = canvas.toDataURL('image/jpeg', quality);
      thumbnailCache.set(cachedKey, thumbSrc);
      if (thumbnailCache.size > THUMB_MAX_CACHE) {
        const firstKey = thumbnailCache.keys().next().value;
        if (firstKey) thumbnailCache.delete(firstKey);
      }
      setSrc(thumbSrc);
      setLoaded(true);
    };
    img.onerror = () => setSrc(originalSrc);
    img.src = originalSrc;
  }, [base64, isInViewport, quality]);

  if (!loaded || !src) {
    // 未加载时显示占位背景
    return (
      <div
        className={`bg-[#2a2a2a] ${className || ''}`}
        style={{ minHeight: 50 }}
      />
    );
  }

  return <img src={src} className={className} alt={alt} onClick={onClick} onDoubleClick={onDoubleClick} draggable={draggable} />;
}

/** 响应式图片预览组件：根据容器尺寸自动缩放图片 */
function ResponsiveImagePreview({
  base64,
  assetId,
  className,
  alt,
  quality = 0.62,
  onClick,
  onDoubleClick,
  draggable = false,
  fill = 'contain',
  isInViewport = true,
}: {
  base64?: string;
  assetId?: string;
  className?: string;
  alt?: string;
  quality?: number;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  /** 图片填充方式：'contain' | 'cover' */
  fill?: 'contain' | 'cover';
  /** 懒加载优化：是否在视口内，不在视口内时显示占位符 */
  isInViewport?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const maxSide = Math.max(dimensions.width, dimensions.height, 100);
  const hasSource = (!!base64 && base64.length > 80) || !!assetId;

  // 懒加载优化：不在视口内时显示占位背景，不加载图片
  if (!isInViewport || !hasSource) {
    return (
      <div
        ref={containerRef}
        className={`w-full h-full bg-[#2a2a2a] ${className || ''}`}
      />
    );
  }

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`}>
      <OptimizedImage
        base64={base64}
        assetId={assetId}
        maxSide={maxSide}
        quality={quality}
        className={`w-full h-full object-${fill}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        draggable={draggable}
        alt={alt}
      />
    </div>
  );
}

const INPUT_NODE_TYPES: NodeType[] = ['t2i', 'i2i', 'image', 'panorama', 'annotation', 'gridSplit', 'gridMerge', 'panoramaT2i', 'director3d', 'chat', 'video', 'audio'];

type CanvasProject = CanvasProjectSnapshot;

/**
 * 旧版会在初始画布 / 清空 / 新建项目时自动放一个 320×560 空白文生图（或 id 为 t2i-initial）。
 * 从本地草稿恢复时不应再显示；右键菜单新建的文生图为 720×840，不会被误判。
 */
function normalizeLegacyAutoEmptyT2iCanvas(
  nodes: CanvasNode[],
  edges: Edge[]
): { nodes: CanvasNode[]; edges: Edge[]; stripped: boolean } {
  if (nodes.length !== 1) return { nodes, edges, stripped: false };
  const n = nodes[0];
  if (n.type !== 't2i') return { nodes, edges, stripped: false };
  if ((n.prompt || '').trim() !== '') return { nodes, edges, stripped: false };
  if (n.images && n.images.length > 0) return { nodes, edges, stripped: false };
  const legacy =
    n.id === 't2i-initial' || ((n.width ?? 0) === 320 && (n.height ?? 0) === 560);
  if (!legacy) return { nodes, edges, stripped: false };
  return { nodes: [], edges: [], stripped: true };
}

function normalizeProjectStripLegacyAutoT2i(p: CanvasProject): { project: CanvasProject; stripped: boolean } {
  const norm = normalizeLegacyAutoEmptyT2iCanvas(p.nodes || [], p.edges || []);
  if (!norm.stripped) return { project: p, stripped: false };
  return {
    project: { ...p, nodes: norm.nodes, edges: norm.edges, updatedAt: Date.now() },
    stripped: true,
  };
}

function normalizeLibraryProjectsStripLegacyAutoT2i(projects: CanvasProject[]): {
  next: CanvasProject[];
  changed: boolean;
} {
  let changed = false;
  const next = projects.map((p) => {
    const { project, stripped } = normalizeProjectStripLegacyAutoT2i(p);
    if (stripped) changed = true;
    return project;
  });
  return { next, changed };
}

function cloneCanvasForProject(nodes: CanvasNode[], edges: Edge[], transform: Transform) {
  let nodesClone: CanvasNode[];
  let edgesClone: Edge[];
  try {
    nodesClone = structuredClone(nodes);
    edgesClone = structuredClone(edges);
  } catch {
    nodesClone = nodes.map((n) => ({ ...n })) as CanvasNode[];
    edgesClone = edges.map((e) => ({ ...e }));
  }
  return { nodes: nodesClone, edges: edgesClone, transform: { ...transform } };
}

/** 把内存中的当前画布合并进「当前项目」对应的那条记录（仅返回新数组，不写盘） */
function mergeCurrentCanvasIntoProjectList(
  projects: CanvasProject[],
  activeId: string | null,
  nodes: CanvasNode[],
  edges: Edge[],
  transform: Transform,
  auditModeData?: AuditModeData
): CanvasProject[] {
  if (!activeId) return projects;
  const nodesForPersist = stripImagesFromNodes(nodes);
  const { nodes: nc, edges: ec, transform: tc } = cloneCanvasForProject(nodesForPersist, edges, transform);
  const now = Date.now();
  const idx = projects.findIndex((p) => p.id === activeId);
  if (idx === -1) {
    return [{ id: activeId, name: '未命名项目', updatedAt: now, nodes: nc, edges: ec, transform: tc, auditModeData }, ...projects];
  }
  return projects.map((p) => (p.id === activeId ? { ...p, nodes: nc, edges: ec, transform: tc, updatedAt: now, auditModeData } : p));
}

function projectDraftDisplayName(p: CanvasProject): string {
  const s = (p.draftTitle?.trim() || p.name?.trim() || '').trim();
  return s || '未命名草稿';
}

/** 与顶栏展示一致的实际存名字符串（无双击占位文案），用于行内重命名初始值 */
function projectDraftEditSeed(p: CanvasProject): string {
  return (p.draftTitle?.trim() || p.name?.trim() || '').trim();
}

function projectExportBasename(p: CanvasProject): string {
  const raw = (p.draftTitle?.trim() || p.name?.trim() || 'project').trim() || 'project';
  return sanitizeFilename(raw);
}

/** 去掉旧版「（系统选择器…」等说明尾缀，仅保留路径展示用主文案 */
function sanitizeDraftStoragePathNote(raw: string | undefined): string {
  if (!raw?.trim()) return '';
  const s = raw.trim();
  const iFull = s.indexOf('（');
  const iHalf = s.indexOf('(');
  const candidates = [iFull, iHalf].filter((i) => i > 0);
  const cut = candidates.length ? Math.min(...candidates) : -1;
  return cut > 0 ? s.slice(0, cut).trim() : s;
}

type DraftDiskModalState =
  | null
  | {
      mode: 'firstSave';
      mergedProjects: CanvasProject[];
      pid: string;
      basenameDraft: string;
    }
  | {
      mode: 'saveAs';
      snapshot: CanvasProject;
      basenameDraft: string;
    };

/** 图生图预设：按「角色 / 场景 / 道具 / 故事板 / 其他」分类，供下拉选择 */
type I2iPresetCategoryId = 'character' | 'scene' | 'props' | 'storyboard' | 'other';

const I2I_PRESET_CATEGORY_OPTIONS: { id: I2iPresetCategoryId; label: string }[] = [
  { id: 'character', label: '角色' },
  { id: 'scene', label: '场景' },
  { id: 'props', label: '道具' },
  { id: 'storyboard', label: '故事板' },
  { id: 'other', label: '其他' },
];

/** 通用模板预设键 */
const COMMON_TEMPLATE_KEY = '通用模板';

/** 文生图预设分类——只保留故事板，通用模板以独立下拉框存在 */
type T2iPresetCategoryId = 'storyboard';

const T2I_PRESET_CATEGORY_OPTIONS: { id: T2iPresetCategoryId; label: string }[] = [
  { id: 'storyboard', label: '故事板' },
];

const I2I_PRESETS_BY_CATEGORY: Record<I2iPresetCategoryId, { key: string; label: string }[]> = {
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
    { key: '场景九视图', label: '场景九视图' },
    { key: '场景反打及细节', label: '场景反打及细节' },
  ],
  props: [
    { key: '道具拆分', label: '道具拆分' },
    { key: '道具5视图', label: '道具5视图' },
    { key: '道具转线稿色块', label: '道具转线稿色块' },
    { key: '道具转超写实', label: '道具转超写实' },
    { key: '道具转白模', label: '道具转白模' },
  ],
  storyboard: [
    { key: '故事板_A', label: '故事板_A' },
    { key: '故事板_B', label: '故事板_B' },
    { key: '故事板_CCC', label: '故事板_CCC' },
    { key: 'CCCC_故事板简化版', label: 'CCCC_故事板简化版' },
  ],
  other: [
    { key: '故事九宫格', label: '故事九宫格' },
    { key: '高清放大4K', label: '高清放大' },
  ],
};

const I2I_PRESET_FLAT = (Object.keys(I2I_PRESETS_BY_CATEGORY) as I2iPresetCategoryId[]).flatMap(
  (id) => I2I_PRESETS_BY_CATEGORY[id]
);

/** 文生图预设分类数据——只包含故事板预设 */
const T2I_PRESETS_BY_CATEGORY: Record<T2iPresetCategoryId, { key: string; label: string }[]> = {
  storyboard: [
    { key: '故事板_A', label: '故事板_A' },
    { key: '故事板_B', label: '故事板_B' },
    { key: '故事板_CCC', label: '故事板_CCC' },
    { key: 'CCCC_故事板简化版', label: 'CCCC_故事板简化版' },
  ],
};

const T2I_PRESET_FLAT = (Object.keys(T2I_PRESETS_BY_CATEGORY) as T2iPresetCategoryId[]).flatMap(
  (id) => T2I_PRESETS_BY_CATEGORY[id]
);

function t2iCategoryForPreset(preset: string | undefined): T2iPresetCategoryId {
  if (!preset) return 'storyboard';
  for (const id of Object.keys(T2I_PRESETS_BY_CATEGORY) as T2iPresetCategoryId[]) {
    if (T2I_PRESETS_BY_CATEGORY[id].some((p) => p.key === preset)) return id;
  }
  return 'storyboard';
}

function i2iCategoryForPreset(preset: string | undefined): I2iPresetCategoryId {
  if (!preset) return 'character';
  for (const id of Object.keys(I2I_PRESETS_BY_CATEGORY) as I2iPresetCategoryId[]) {
    if (I2I_PRESETS_BY_CATEGORY[id].some((p) => p.key === preset)) return id;
  }
  return 'other';
}

/** 设置页预设分类：内置名走图生图规则，用户可覆盖 */
function settingsPresetCategory(
  name: string,
  overrides: Record<string, I2iPresetCategoryId>
): I2iPresetCategoryId {
  return overrides[name] ?? i2iCategoryForPreset(name);
}

/** 设置页预设顶层大类：对话 / 文生图 / 图生图 */
type PresetDomainId = 'chat' | 't2i' | 'i2i';

const PRESET_DOMAIN_TAB_OPTIONS: { id: PresetDomainId; label: string }[] = [
  { id: 'chat', label: 'AI对话' },
  { id: 't2i', label: '文生图' },
  { id: 'i2i', label: '图生图' },
];

/** 内置 AI 对话快捷预设键（与对话节点按钮一致，默认归入 AI对话 类） */
const DEFAULT_CHAT_PRESET_KEYS = new Set([
  'AAAA_全能资产',
  '反推提示词',
  'BBBB_全能资产',
  'EEEE_备选万能资产',
  'CCC即梦分镜',
  'CCC即梦视频',
]);

/** 内置文生图预设键（默认归入文生图类） */
const DEFAULT_T2I_PRESET_KEYS = new Set([
  '通用模板',
  '真人写实',
  '真人古风',
  '古风国漫3D',
  '游戏cg动画',
  '二维新海诚',
  '赛博朋克',
]);

/** 内置图生图预设键（默认归入图生图类，包含故事板） */
const DEFAULT_I2I_PRESET_KEYS = new Set([
  '故事板_A',
  '故事板_B',
  '故事板_CCC',
]);

function defaultPresetDomain(name: string): PresetDomainId {
  if (DEFAULT_CHAT_PRESET_KEYS.has(name)) return 'chat';
  if (DEFAULT_T2I_PRESET_KEYS.has(name)) return 't2i';
  if (DEFAULT_I2I_PRESET_KEYS.has(name)) return 'i2i';
  return 'i2i';
}

function settingsPresetDomain(name: string, overrides: Record<string, PresetDomainId>): PresetDomainId {
  return overrides[name] ?? defaultPresetDomain(name);
}

/** 图生图下拉：与设置共用 promptPresets，按分类（含设置里覆盖）列出 */
function i2iPresetListForCategory(
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
const STORYBOARD_PRESET_KEYS = new Set(['故事板_A', '故事板_B', '故事板_CCC', 'CCCC_故事板简化版']);
function isStoryboardPreset(name: string): boolean {
  return STORYBOARD_PRESET_KEYS.has(name);
}

/** 文生图下拉：与设置共用 promptPresets，按分类列出（故事板预设也会出现） */
function t2iPresetListForCategory(
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

/** 首次加载时的图生图侧预设（不含 AI 对话模板，对话模板在文件后部与 CHAT_PROMPT_* 合并为 INITIAL_PROMPT_PRESETS_ALL） */
const INITIAL_I2I_PROMPT_PRESETS: Record<string, string> = {
  '角色4视图':
    '电影级古风写实摄影、ARRI Alexa 65实拍、中式古典美学、真实物理材质、自然光影，一张2x2的四宫格人物设定图。左上角：从头到脚完整全身的正面站立；右上角：从头到脚完整全身的侧面站立；左下角：从头到脚完整全身的背面站立；右下角：面部特写。所有视角的人物发型、服装细节和配饰必须保持绝对一致。纯白背景，无多余杂物。皮肤毛孔细节、胶片颗粒感、非CG、Raw photo、极致高清8K。 --ar 9:16',
  '场景四视图':
    '根据参考图直接生成2x2场景宫格图，图 1 (左上，主视图)：呈现完整的 [环境背景]，[核心主体] 位于其中，光影和透视角度尽可能还原用户提供的参考图。图 2 (右上，正面聚焦视图)：调整为更正面的透视角度，拉近并聚焦于 [核心主体]，展现空间深度。图 3 (左下，高处俯视透视图)：高角度的透视图，从上方斜看 [核心主体] 和周围的地面/环境。图 4 (右下，正交平面顶视图)：完美的垂直正上方的正交平面图，展示 [核心主体] 在地面上的精确形状和位置，完全消除透视变形。一致性与限制要求（绝对强制）：四个视角必须在同一张图片中生成。必须与原图保持绝对统一的 [艺术风格]、[光影类型]、材质纹理和物体特征。每个宫格标注1-4的数字。严禁在画面中生成任何其他字母、对话、指示线或多余的 UI 标记。',
  '角色6视图':
    '主体为真实照片风格角色设定图，白色背景，画面分为两部分：画面左侧-三张全身视图，依次为人物站立正面、侧面、背面（严格参考图片形象，禁止照搬原图动作）；画面右侧-四张多角度面部特写：依次为-正脸：-3/4左侧脸-3/4右侧脸-头部背面。并且在每张面部特写以半透明水印加大标注"虚拟模型面部(方向)"：保持好角色本体的现有特征，例如脸型、发色、身材等归属于人体特征的内容。图片风格为真人照片质感，禁止转绘为漫画或其它风格。',
  '角色8视图':
    '8格角色多角度设定表，手中武器去掉，上排4张头部特写（正面、四分之三侧面、纯侧面、背面），下排4张全身站姿（正面、四分之三侧面、纯侧面、背面，同时下排4张的人脸五官需要全部抹除掉），保持角色设计完全统一，极简纯白背景，干净网格布局+细黑线分割，超写实，8K超高清，电影级光影，专业角色参考图，比例一致无变形，焦点清晰，棚拍肖像质感，并在每格左上角标注格数数字。',
  '角色无头视图':
    '上下分屏排版。上半部分：面部特写。下半部分：角色三视图（正视图、侧视图、背视图）。注意：下半部分的三个身体必须完全无头（仅保留脖子以下）。中性灰背景，图片风格为真人照片质感，禁止转绘为漫画或其它风格。',
  '角色细节图':
    '专业游戏角色设定参考图，标准三视图+细节特写排版，左侧3张全身站姿（正面、左侧面、背面），右侧4行3列细节分镜，保持角色设计完全统一，极简纯白背景，细黑线分割网格，超写实人像摄影，8K分辨率，锐度拉满，电影级柔光，角色100%一致，无变形无穿模，包含头部多角度、面部五官、服装面料、拉链细节、背包细节、鞋履细节、手部细节，专业3D建模参考图，棚拍质感，并在每格左上角标注格数数字。',
  '角色身高比例图':
    '帮我生成全身身高比例图，角色均正视面向镜头。',
  '角色刷光':
    '角色图上半部分(面部)和下半(全身)部分的光线设定都按照场景图中的光线以及色相色温来做设定。不要改变角色人设图的构图,背景白色。',
  '场景9视图':
    '根据所有画面中保持外观、比例、材质、颜色和风格的完美一致性的原则。生成一个(16:9比例)设计的电影级专业3X3(共9张)的电影分镜网格。共9个面板。每个面板标记1-9的数字，该网格需采用3D电影截图风格。每一帧都是根据场景下不同角度，不同面的场景图。AI自动选择所有摄像机角度和构图。确保电影级布光、一致的调色、真实的景深以及连贯的环境演变。无重复镜头。',
  '场景九视图':
    '请根据提供的图片做出这个场景的不同角度图片，创作一个由九个画面组成的九宫格3*3排列画幅16:9。每个画面需精心设计以体现不同的景别和技术手法，包括但不限于特写、远景、俯拍、仰拍和运动镜头。场景中没有人物，用不同镜头角度展现。每个宫格标注1-9的数字。',
  '场景反打及细节':
    '为我创建一张综合图。这张图将包含场景的正面图、反面图，以及几个关键道具的特写小图，同时严格保持参考图中的陈设、装饰、光线和布局风格。\n场景分析与生成策略：\n    正面场景图：将忠实地再现您提供的原始图片，确保所有细节、光线和氛围都一致。\n    反面场景图：这是最具挑战性的部分。我将根据原始图的风格和布局推断房间的另一侧。\n   假设原始图展示的是房间的一面，那么反面图将展示房间的另一面，可能包含入口、另一组家具或艺术品，但会保持整体的协调性。我会想象相机转过180度后看到的景象，\n    关键道具小图：我会从原始图片中提取并放大以下关键道具的特写：\n综合图布局：\n我将采用一个清晰的布局，将正面和反面场景图作为主要部分，并在下方或侧面区域展示关键道具的特写小图。',
  '故事九宫格':
    '请根据提供的图片内容及前面叙述的故事背景，创作一个由九个画面构成的写实风格九宫格故事3*3排列画幅16:9。每个画面精心设计以体现不同的景别和技术手法，包括但不限于特写、远景、俯拍、仰拍和运动镜头等，以此强化故事的紧张氛围和视觉表现力。具体要求如下：整体一致性：所有画面应保持与上传图片相同的写实风格；故事连贯性：九宫格中的每幅画都应当紧密围绕一个完整的故事线展开，确保故事逻辑清晰且连贯；景别多样性：至少包含一个特写镜头，用于捕捉角色的表情或关键物品的细节；加入至少一个远景镜头，展示环境全貌或大规模的动作场景；运用俯拍或仰拍来增强特定场景的情感表达或戏剧效果；考虑使用运动镜头（如跟随角色移动）以增加动态感和紧张气氛；视觉与情感深度：利用光影对比、色彩调配以及构图技巧来加强故事的情感层次和视觉吸引力。请务必让每一张图像都能够独立讲述一部分故事，同时作为整个九宫格的一部分共同编织出一个引人入胜的整体叙事。按照要求生成图片。',
  '全景图生成':
    '等柱状投影720°×360°全景图,严格遵循提供的网格模板:网格从左到右依次对应东、南、西、北四个方位,场景布局与方位一一对应;所有场景主体与元素必须严格按照网格的相对变形规律摆放,透视、比例与网格曲率完全贴合画面上下空白区域为天空/屋顶或地面的延伸部分,填充对应场景的环境内容;全景无接缝、无拉伸畸变,整体画面连贯自然,符合真实空间透视逻辑;最终生成的成品画面中,绝对禁止出现任何参考网格、辅助线条、定位线、结构标记等所有参考类元素,仅呈现纯净、完整的符合要求的全景场景内容',
  '高清放大4K': '高清放大到4K，极致清晰，保留原始细节，无噪点，无模糊，超高质量，完美画质',
  道具拆分:
    '识别主要物体，并将其拆分成 合适数量的 逻辑部件。\n使用干净的 Quixel 风格资产网格进行排布。\n必须满足：输出图像的**完整背景**为纯白色 (#FFFFFF)。\n物体部分的风格必须保持一致（100% 风格一致性）。',
  道具5视图:
    '生成 5 个视图（45 度透视、正面、背面、侧面、顶部）。在所有视图中保持完美的结构逻辑、比例尺度与物体身份一致。保持原始尺寸不变。',
  道具转线稿色块: '将图片转换为线稿色块图：在灰色背景上使用扁平色块呈现线稿风格。保持与原图相同的构图与比例。',
  道具转超写实: '识别图片中的物体，quixel资产库效果，灰色背景。',
  道具转白模: '将图片转成传统3D游戏影视流程中的白模效果图，灰色背景。',
  '故事板_A':
    '避免场景过于相似，创建一个电影制作板/视觉规划表，展示短片或商业广告的完整概念。布局应简洁、基于网格，并分为清晰标记的部分。包含：共享创意指导（顶部栏）：整体限制，如镜头数量、统一的调色板和一般的环境背景。角色与风格参考部分：一个从多个角度展示的模型（正面、背面、侧面、特写、放松姿态），配有服装和配饰参考。强调身份的一致性，同时允许在特定场景中进行细微变化。环境和场景设计部分：一个具有戏剧性自然特征的场景户外地点，以及一个俯视示意图，说明在空间中的移动路径。包括摄像机位置和沿路线标注的拍摄类型。故事板部分：一系列编号的帧（大约8个镜头）展示场景的进展。每个帧包括：摄像机类型/镜头感觉，镜头大小（广角、中景、特写、微距），运动方式（静态、跟踪、手持等），动作和情绪进展的简要描述。灯光/情绪/风格备注：与灯光条件、氛围和纹理相关的视觉示例和简短描述。包括一天中不同时间的过渡和光线质量的变化。情绪和关键词块：指导作品的简洁情绪基调主题描述列表。音频/音调部分：环境声音、音乐风格和整体声音氛围的指示。电影摄影笔记：包括镜头特性、运动风格和后期处理感觉的总体视觉哲学。整个版面应感觉连贯、电影化且专业设计——就像导演的预制作指南，能一眼传达出基调、节奏和视觉叙事。将宽高比设为16:9，并且标注每个镜头的时长（秒）。这是一个以清晰排版和文字可读性为优先的专业故事板设计。所有文字必须清晰锐利、准确可读，禁止乱码和伪文字。分区标题、镜头编号、角色角度标签必须明显放大。每个分镜中的文字说明必须非常简短，控制在1到2行内，避免长段落。采用干净背景、高对比度文字、整齐网格布局和充足留白，确保整张板上的中文说明一眼可读。',
  '故事板_B':
    '一张AI视频生成指导图，整体采用真实影视前期提案板风格，画面像电影导演组内部使用的专业视觉开发文件，而不是普通拼贴海报。整个版面为高端中文电影UI排版包含角色设定、环境设计、摄影机位图、分镜故事板、情绪关键词、灯光设计、音频设计、摄影笔记、色调建议、节奏建议等多个模块，整体统一为超写实电影摄影风格，8K，高细节，真实胶片质感，具有强烈的电影工业化氛围。整张故事板必须以我的场景参考图为主，严格参考场景中的建筑结构、空间布局、地面材质，光影方向、环境氛围、远景层次、游客尺度与真实空间关系，确保所有分镜中的场景保持一致性和连续性。场景整体具有真实空间纵深，拥有电影级体积光、空气透视、漂浮灰尘、湿润反光、真实天气氛围与环境色温变化，整体风格统一，不能出现空间穿帮与建筑错位。环境氛围需要根据剧情自动匹配，例如压抑、宿命感、神性、史诗感、悬疑感、肃杀感、废墟感或超现实感。人物部分严格参考我的人物三视图进行统一生成，角色外观、发型、服装、盔甲、配饰、体型、颜色、材质、面部特征必须保持完全一致，不能在不同分镜中出现人物变形、服装变化、盔甲错误、脸部漂移或比例错误。人物需要生成标准角色设定区域，包括正面、背面、侧面、面部特写、情绪表情、站姿或坐姿参考，以及武器和装备细节参考。角色整体采用真实电影角色设计风格，而不是动漫设定图，人物皮肤、布料、金属、战损、灰尘、汗水与光影细节必须真实可信。故事板主体区域根据我的文字分镜脚本自动生成完整的电影分镜结构。每一个镜头都需要自动分析脚本中的人物动作、镜头运动、情绪变化、空间关系与叙事节奏，并生成对应的分镜画面。每格分镜必须包含时间码、景别、镜头角度、摄影机运动、人物动作、对白、音效与情绪描述。例如角色缓慢抬头时自动使用Slow Dolly-in，情绪爆发时自动使用Crash Zoom，战斗冲击时自动使用Dynamic Follow Shot，人物离场时自动使用Whip Pan或Handheld Tracking。所有镜头之间必须遵守180度轴线原则与30度有效分镜原则，确保角色站位、视线方向与镜头方向保持统一，形成真实电影剪辑逻辑，而不是随机拼接。镜头风格必须是真实电影摄影语言，包含低角度仰拍、过肩镜头、俯拍、长焦压缩、手持跟拍、浅景深、动态模糊、运动残影、镜头拉背、航拍推近等专业电影镜头设计。系统自动根据剧情判断镜头节奏，例如压抑对话采用稳定慢推镜头，紧张情绪采用手持微晃，史诗场景采用航拍大远景，人物心理震动采用焦点转移与背景虚化。所有镜头之间具有明确情绪递进，形成完整的观察→压迫→冲突→爆发→余韵的电影节奏。故事板底部自动生成情绪与风格关键词区域，根据剧情与场景自动提取风格标签，例如：超写实、电影感、宿命感、压抑、史诗感、神性、金属反光、潮湿空气、能量冲击，逆光尘埃、冷暖对比、烟雾氛围、胶片颗粒、真实光影、木质旧化、战损细节等，用于统一整部短片的视觉方向。同时自动生成音频与声场设计区域，根据分镜动作生成环境音、动作音效与BGM氛围。例如风声、脚步声、游客惊呼、火焰燃烧、金属摩擦、水能量轰鸣、低频震动、压迫鼓点，空旷回声、烟灰掉落声等，并自动匹配整体声场风格，例如贴近、压迫、低频，空旷、留白感或震撼感。故事板最后生成电影摄影笔记区域，自动分析整组镜头所需的镜头焦段、灯光逻辑与后期调色方向。例如35mm、50mm、85mm电影镜头组合，暖金高光与冷蓝阴影对比，真实皮肤纹理，胶片颗粒，HDR高动态范围，电影级动态模糊，真实镜头呼吸感，低饱和电影调色，摄影机慢推、手持跟随、镜头甩动、镜头摇移等电影语言。画面信息量巨大，一定要我的文字信息进行分析，分析故事内容和剧情走向等等，具有专业中文UI排版、真实摄影逻辑、真实故事板结构、真实镜头分析与真实电影工业化气质。',
  '故事板_CCC': '生成一张导演故事板分镜图，要求如下。\n【最终图片排版与文字标注要求（3:4画幅）】\n在一张比例为3:4的画幅中进行结构排版。\n\n🎬 模块一：分镜板（主模块） \n- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。\n- 内容：根据剧情逻辑推演4个纯视觉分镜图。\n示例：\n列表展示\n第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：\n第二列：分镜图\n第三列：运镜流程示意图及景别、运镜文字说明（图示表达镜头运动方式）\n第四列："\n主体：[主体描述，如角色、物体、环境元素]\n动作：[主体动作或行为描述，主体的具体行为、肢体动作或物理动态变化]\n描述：[画面构图]\n台词：[人物对白及说话语气，若无则填"无"]\n音效：[环境、动作音效]\n\n\n模块二：场景图、风格、光影与物品参考\n（横向铺展于画面底部，提供全方位的设定支撑材料与参数）\n1. 空间与环境设定\n人物站位图（必含）：[提供俯视视角的简图或详尽描述，清晰标明主要角色在场景中的空间位置、相对距离、视线方向以及摄影机（机位）的摆放位置]\n场景参考图：\n场景 1（宏观）：[大环境、建筑布局、地形地貌或大范围气候特征]\n场景 2（微观）：[局部环境、内部空间结构或特定角落的陈设]\n2. 道具与物件设定\n其他物品参考图：[画面中出现的关键道具、载具、武器或核心物件的特写参考与质感描述]\n3. 光影与色彩设定 (Lighting & Mood)\n光影布局：\n主光源：[类型、颜色、强度、照射方向]\n辅助光：[类型、颜色、强度、补光位置]\n环境光：[类型、颜色、强度、整体笼罩氛围]\n色彩板：\n主色/辅色/点缀色：[明确画面占据最大面积的核心颜色、平衡画面的辅助色以及用于视觉焦点的对比色]\n整体风格：[明确具体的艺术风格（如赛博朋克、写实电影感等）、渲染质感及最终的情绪基调]\n',
  'CCCC_故事板简化版': `生成一张导演故事板分镜图，要求如下。
【最终图片排版与文字标注要求（3:4画幅）】
在一张比例为3:4的画幅中进行结构排版。

模块一：分镜板（主模块） 
- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。
- 内容：根据剧情逻辑推演至少6个纯视觉分镜图，需保持景别运用丰富。
示例：
列表展示
第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：
第二列：分镜图
第三列：运镜及画面描述。
第四列："
主体：[主体描述，如角色、物体、环境元素]
台词：[人物对白及说话语气，若无则填"无"]
音效：[环境、动作音效]
第五列：其他注意事项。


模块二：场景图、风格、光影。
（横向铺展于画面底部，提供全方位的设定支撑材料与参数）
1. 空间与环境设定
人物站位图（必含）：[提供俯视视角的简图或详尽描述，清晰标明主要角色在场景中的空间位置、相对距离、视线方向以及摄影机（机位）的摆放位置]
整体的拍摄设备，动作风格。
2. 光影与色彩设定 (Lighting & Mood)
光影布局：
主光源：[类型、颜色、强度、照射方向]
辅助光：[类型、颜色、强度、补光位置]
环境光：[类型、颜色、强度、整体笼罩氛围]
色彩板：
主色/辅色/点缀色：[明确画面占据最大面积的核心颜色、平衡画面的辅助色以及用于视觉焦点的对比色]
视觉风格：[明确具体的艺术风格（如赛博朋克、写实电影感等）、渲染质感及最终的情绪基调]
导演备注信息。`,
};

/** 文生图预设内容 */
const INITIAL_T2I_PROMPT_PRESETS: Record<string, string> = {
  '故事板_A':
    '避免场景过于相似，创建一个电影制作板/视觉规划表，展示短片或商业广告的完整概念。布局应简洁、基于网格，并分为清晰标记的部分。包含：共享创意指导（顶部栏）：整体限制，如镜头数量、统一的调色板和一般的环境背景。角色与风格参考部分：一个从多个角度展示的模型（正面、背面、侧面、特写、放松姿态），配有服装和配饰参考。强调身份的一致性，同时允许在特定场景中进行细微变化。环境和场景设计部分：一个具有戏剧性自然特征的场景户外地点，以及一个俯视示意图，说明在空间中的移动路径。包括摄像机位置和沿路线标注的拍摄类型。故事板部分：一系列编号的帧（大约8个镜头）展示场景的进展。每个帧包括：摄像机类型/镜头感觉，镜头大小（广角、中景、特写、微距），运动方式（静态、跟踪、手持等），动作和情绪进展的简要描述。灯光/情绪/风格备注：与灯光条件、氛围和纹理相关的视觉示例和简短描述。包括一天中不同时间的过渡和光线质量的变化。情绪和关键词块：指导作品的简洁情绪基调主题描述列表。音频/音调部分：环境声音、音乐风格和整体声音氛围的指示。电影摄影笔记：包括镜头特性、运动风格和后期处理感觉的总体视觉哲学。整个版面应感觉连贯、电影化且专业设计——就像导演的预制作指南，能一眼传达出基调、节奏和视觉叙事。将宽高比设为16:9，并且标注每个镜头的时长（秒）。这是一个以清晰排版和文字可读性为优先的专业故事板设计。所有文字必须清晰锐利、准确可读，禁止乱码和伪文字。分区标题、镜头编号、角色角度标签必须明显放大。每个分镜中的文字说明必须非常简短，控制在1到2行内，避免长段落。采用干净背景、高对比度文字、整齐网格布局和充足留白，确保整张板上的中文说明一眼可读。',
  '故事板_B':
    '一张AI视频生成指导图，整体采用真实影视前期提案板风格，画面像电影导演组内部使用的专业视觉开发文件，而不是普通拼贴海报。整个版面为高端中文电影UI排版包含角色设定、环境设计、摄影机位图、分镜故事板、情绪关键词、灯光设计、音频设计、摄影笔记、色调建议、节奏建议等多个模块，整体统一为超写实电影摄影风格，8K，高细节，真实胶片质感，具有强烈的电影工业化氛围。整张故事板必须以我的场景参考图为主，严格参考场景中的建筑结构、空间布局、地面材质，光影方向、环境氛围、远景层次、游客尺度与真实空间关系，确保所有分镜中的场景保持一致性和连续性。场景整体具有真实空间纵深，拥有电影级体积光、空气透视、漂浮灰尘、湿润反光、真实天气氛围与环境色温变化，整体风格统一，不能出现空间穿帮与建筑错位。环境氛围需要根据剧情自动匹配，例如压抑、宿命感、神性、史诗感、悬疑感、肃杀感、废墟感或超现实感。人物部分严格参考我的人物三视图进行统一生成，角色外观、发型、服装、盔甲、配饰、体型、颜色、材质、面部特征必须保持完全一致，不能在不同分镜中出现人物变形、服装变化、盔甲错误、脸部漂移或比例错误。人物需要生成标准角色设定区域，包括正面、背面、侧面、面部特写、情绪表情、站姿或坐姿参考，以及武器和装备细节参考。角色整体采用真实电影角色设计风格，而不是动漫设定图，人物皮肤、布料、金属、战损、灰尘、汗水与光影细节必须真实可信。故事板主体区域根据我的文字分镜脚本自动生成完整的电影分镜结构。每一个镜头都需要自动分析脚本中的人物动作、镜头运动、情绪变化、空间关系与叙事节奏，并生成对应的分镜画面。每格分镜必须包含时间码、景别、镜头角度、摄影机运动、人物动作、对白、音效与情绪描述。例如角色缓慢抬头时自动使用Slow Dolly-in，情绪爆发时自动使用Crash Zoom，战斗冲击时自动使用Dynamic Follow Shot，人物离场时自动使用Whip Pan或Handheld Tracking。所有镜头之间必须遵守180度轴线原则与30度有效分镜原则，确保角色站位、视线方向与镜头方向保持统一，形成真实电影剪辑逻辑，而不是随机拼接。镜头风格必须是真实电影摄影语言，包含低角度仰拍、过肩镜头、俯拍、长焦压缩、手持跟拍、浅景深、动态模糊、运动残影、镜头拉背、航拍推近等专业电影镜头设计。系统自动根据剧情判断镜头节奏，例如压抑对话采用稳定慢推镜头，紧张情绪采用手持微晃，史诗场景采用航拍大远景，人物心理震动采用焦点转移与背景虚化。所有镜头之间具有明确情绪递进，形成完整的观察→压迫→冲突→爆发→余韵的电影节奏。故事板底部自动生成情绪与风格关键词区域，根据剧情与场景自动提取风格标签，例如：超写实、电影感、宿命感、压抑、史诗感、神性、金属反光、潮湿空气、能量冲击，逆光尘埃、冷暖对比、烟雾氛围、胶片颗粒、真实光影、木质旧化、战损细节等，用于统一整部短片的视觉方向。同时自动生成音频与声场设计区域，根据分镜动作生成环境音、动作音效与BGM氛围。例如风声、脚步声、游客惊呼、火焰燃烧、金属摩擦、水能量轰鸣、低频震动、压迫鼓点，空旷回声、烟灰掉落声等，并自动匹配整体声场风格，例如贴近、压迫、低频，空旷、留白感或震撼感。故事板最后生成电影摄影笔记区域，自动分析整组镜头所需的镜头焦段、灯光逻辑与后期调色方向。例如35mm、50mm、85mm电影镜头组合，暖金高光与冷蓝阴影对比，真实皮肤纹理，胶片颗粒，HDR高动态范围，电影级动态模糊，真实镜头呼吸感，低饱和电影调色，摄影机慢推、手持跟随、镜头甩动、镜头摇移等电影语言。画面信息量巨大，一定要我的文字信息进行分析，分析故事内容和剧情走向等等，具有专业中文UI排版、真实摄影逻辑、真实故事板结构、真实镜头分析与真实电影工业化气质。',
  '故事板_CCC': '生成一张导演故事板分镜图，要求如下。\n【最终图片排版与文字标注要求（3:4画幅）】\n在一张比例为3:4的画幅中进行结构排版。\n\n🎬 模块一：分镜板（主模块） \n- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。\n- 内容：根据剧情逻辑推演4个纯视觉分镜图。\n示例：\n列表展示\n第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：\n第二列：分镜图\n第三列：运镜流程示意图及景别、运镜文字说明（图示表达镜头运动方式）\n第四列："\n主体：[主体描述，如角色、物体、环境元素]\n动作：[主体动作或行为描述，主体的具体行为、肢体动作或物理动态变化]\n描述：[画面构图]\n台词：[人物对白及说话语气，若无则填"无"]\n音效：[环境、动作音效]\n\n\n模块二：场景图、风格、光影与物品参考\n（横向铺展于画面底部，提供全方位的设定支撑材料与参数）\n1. 空间与环境设定\n人物站位图（必含）：[提供俯视视角的简图或详尽描述，清晰标明主要角色在场景中的空间位置、相对距离、视线方向以及摄影机（机位）的摆放位置]\n场景参考图：\n场景 1（宏观）：[大环境、建筑布局、地形地貌或大范围气候特征]\n场景 2（微观）：[局部环境、内部空间结构或特定角落的陈设]\n2. 道具与物件设定\n其他物品参考图：[画面中出现的关键道具、载具、武器或核心物件的特写参考与质感描述]\n3. 光影与色彩设定 (Lighting & Mood)\n光影布局：\n主光源：[类型、颜色、强度、照射方向]\n辅助光：[类型、颜色、强度、补光位置]\n环境光：[类型、颜色、强度、整体笼罩氛围]\n色彩板：\n主色/辅色/点缀色：[明确画面占据最大面积的核心颜色、平衡画面的辅助色以及用于视觉焦点的对比色]\n整体风格：[明确具体的艺术风格（如赛博朋克、写实电影感等）、渲染质感及最终的情绪基调]\n',
  'CCCC_故事板简化版': `根据如上剧本生成一张导演故事板分镜图，要求如下。
【最终图片排版与文字标注要求（3:4画幅）】
在一张比例为3:4的画幅中进行结构排版。在画面上通过不一样的颜色箭头描述出人物运动方向和镜头轨迹。

模块一：分镜板（主模块）
- 位置：画面中央靠上，宫格图顺序排列，占据主要画面。
- 内容：根据剧情逻辑推演4个纯视觉分镜图。
示例：
列表展示
第一列：时间轴：[例如：Cut 1  00:00 - 00:03，持续3秒]：
第二列：分镜图
第三列：运镜流程示意图及景别、运镜文字说明（图示表达镜头运动方式）
第四列："
主体：[主体描述，如角色、物体、环境元素]
动作：[主体动作或行为描述，主体的具体行为、肢体动作或物理动态变化]
描述：[画面构图]
台词：[人物对白及说话语气，若无则填"无"]
音效：[环境、动作音效]`,
  '通用模板':
    '16:9横屏，专业摄影，高清8K，电影级质感，写实风格，自然光影',
  '真人写实':
    '真人写实摄影风格，参考导演美学：王家卫 ，真实肤质，真实五官，电影级构图，环境光自然，情绪化光影，生活化细节，现实主义质感',
  '真人古风':
    '真人古风写实电影风格，参考导演美学张艺谋,东方史诗电影美学，真实人物质感，精致服化道，东方美学，电影级布光，史诗感构图，',
  '古风国漫3D':
    '古风国漫3D CG风格，参考导演美学：田晓鹏，东方美学，精致3D建模，国漫电影质感，虚幻引擎渲染。',
  '游戏cg动画':
    '高质量动画游戏3DCG风格，参考导演美学：小岛秀夫，高燃游戏CG过场动画，科幻大片质感，强烈动作张力，精致3D建模，PBR材质，电影级灯光，虚幻引擎渲染。',
  '二维新海诚':
    '日系青春2D动画电影美术风格，参考导演美学：新海诚，光影清透，色彩明亮，空气感强，青春感，手绘动画背景，高细节2D插画，唯美治愈氛围。',
  '赛博朋克':
    '赛博朋克科幻写实风格，参考导演美学：Ridley Scott ，雨夜霓虹，高楼压迫感，冷峻未来城市，全息广告，机械义体，真实电影摄影,背景有全息广告、飞行汽车和湿润路面反光，冷暖对比光，电影级科幻摄影，超写实细节。',
};

const INITIAL_PROMPT_PRESETS_ALL: Record<string, string> = {
  ...INITIAL_T2I_PROMPT_PRESETS,
  ...INITIAL_I2I_PROMPT_PRESETS,
  ...INITIAL_CHAT_PROMPT_PRESETS,
};

const PRESET_SETTINGS_GUARD_PASSWORD = 'zhangbiwen666';

/** 用指针画布坐标算节点矩形；手柄带 translate(±50%)，抓取点往往在角/边外侧，须用按下时的 grab 与几何参考点的差值修正，否则四角起手会跳。 */
function computeNodeResizeFromPointer(
  origin: { x: number; y: number; width: number; height: number },
  direction: string,
  px: number,
  py: number,
  grabPx: number,
  grabPy: number,
  shiftKey: boolean,
  minWidth: number,
  minHeight: number
): { x: number; y: number; width: number; height: number } {
  const ox = origin.x;
  const oy = origin.y;
  const right = ox + origin.width;
  const bottom = oy + origin.height;

  let newX = ox;
  let newY = oy;
  let newW = origin.width;
  let newH = origin.height;

  if (direction === 'e') {
    const edgeX = px - (grabPx - right);
    newW = Math.max(minWidth, edgeX - ox);
    newX = ox;
    newY = oy;
    newH = origin.height;
  } else if (direction === 'w') {
    // 左边界钳位：不允许 edgeX < 0，同时调整 newW
    const edgeX = Math.max(0, px - (grabPx - ox));
    newW = Math.max(minWidth, right - edgeX);
    newX = right - newW;
    newY = oy;
    newH = origin.height;
  } else if (direction === 's') {
    const edgeY = py - (grabPy - bottom);
    newH = Math.max(minHeight, edgeY - oy);
    newX = ox;
    newY = oy;
    newW = origin.width;
  } else if (direction === 'n') {
    // 上边界钳位：不允许 edgeY < 0，同时调整 newH
    const edgeY = Math.max(0, py - (grabPy - oy));
    newH = Math.max(minHeight, bottom - edgeY);
    newY = bottom - newH;
    newX = ox;
    newW = origin.width;
  } else if (direction === 'se') {
    newX = ox;
    newY = oy;
    const cx = px - (grabPx - right);
    const cy = py - (grabPy - bottom);
    const tw = cx - ox;
    const th = cy - oy;
    if (shiftKey) {
      const ratio = origin.width / origin.height;
      if (tw > 0 && th > 0) {
        if (tw / th > ratio) {
          newW = Math.max(minWidth, th * ratio);
          newH = Math.max(minHeight, th);
        } else {
          newW = Math.max(minWidth, tw);
          newH = Math.max(minHeight, tw / ratio);
        }
      } else {
        newW = minWidth;
        newH = minHeight;
      }
    } else {
      newW = Math.max(minWidth, tw);
      newH = Math.max(minHeight, th);
    }
  } else if (direction === 'sw') {
    newY = oy;
    // 左边界钳位
    const cx = Math.max(0, px - (grabPx - ox));
    const cy = py - (grabPy - bottom);
    newW = Math.max(minWidth, right - cx);
    newX = right - newW;
    newH = Math.max(minHeight, cy - oy);
  } else if (direction === 'ne') {
    newX = ox;
    const cx = px - (grabPx - right);
    // 上边界钳位
    const cy = Math.max(0, py - (grabPy - oy));
    newW = Math.max(minWidth, cx - ox);
    newH = Math.max(minHeight, bottom - cy);
    newY = bottom - newH;
  } else if (direction === 'nw') {
    // 左 + 上边界钳位
    const cx = Math.max(0, px - (grabPx - ox));
    const cy = Math.max(0, py - (grabPy - oy));
    newW = Math.max(minWidth, right - cx);
    newH = Math.max(minHeight, bottom - cy);
    newX = right - newW;
    newY = bottom - newH;
  }

  return { x: newX, y: newY, width: newW, height: newH };
}

type SettingsPresetPwdIntent =
  | { type: 'copy'; content: string }
  | { type: 'rename'; name: string }
  | { type: 'delete'; name: string }
  | { type: 'add' };

function I2iPresetCategorySelect({
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

function T2iPresetCategorySelect({
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

interface FsImageInfoPanelProps {
  imageSrc: string;
  onClose: () => void;
  onDownload: () => void;
}

function fullscreenImageDisplaySrc(src: string): string {
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:')
  ) {
    return src;
  }
  return `data:image/jpeg;base64,${src}`;
}

function FsImageInfoPanel({ imageSrc, onClose, onDownload }: FsImageInfoPanelProps) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [formatLabel, setFormatLabel] = useState('JPEG');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImgSize(null);
    setFileSize(0);

    void probeImageDisplayMetadata(imageSrc).then((meta) => {
      if (cancelled) return;
      if (meta) {
        if (meta.width > 0 && meta.height > 0) {
          setImgSize({ width: meta.width, height: meta.height });
        }
        setFileSize(meta.fileSize);
        setFormatLabel(meta.formatLabel);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const formatFileSize = (bytes: number) => {
    if (bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const aspectRatio =
    imgSize && imgSize.width > 0 && imgSize.height > 0
      ? (imgSize.width / imgSize.height).toFixed(2)
      : '—';
  const megapixels =
    imgSize && imgSize.width > 0 && imgSize.height > 0
      ? ((imgSize.width * imgSize.height) / 1_000_000).toFixed(2)
      : '—';

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-64 bg-[#1a1a1a]/95 backdrop-blur-md border-l border-[#333] flex flex-col z-20 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] shrink-0">
        <span className="text-white font-bold text-sm">图片信息</span>
        <div className="flex items-center">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="mr-[100px] flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
            title="下载图片"
          >
            <DownloadIcon size={14} />
            下载
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <InfoItem
          label="分辨率"
          value={imgSize ? `${imgSize.width} × ${imgSize.height}` : loading ? '加载中…' : '—'}
        />
        <InfoItem label="宽高比" value={aspectRatio} />
        <InfoItem label="像素" value={megapixels === '—' ? '—' : `${megapixels} MP`} />
        <InfoItem label="文件大小" value={formatFileSize(fileSize)} />
        <InfoItem label="格式" value={formatLabel} />
        <InfoItem label="颜色空间" value="sRGB" />
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-white font-mono">{value}</div>
    </div>
  );
}

/** GPT Image 2：君澜 / codesonline / ToAPIs / 满 e 节点选择时默认 2K */
function isGptImage2CanvasModelId(id: string): boolean {
  return id === 'gpt-image-2-junlan' || id === 'gpt-image-2-codesonline' || id === 'gpt-image-2' || id === 'gpt-image-2-manxue';
}

/** 满 eAPI Gemini 图像模型 */
function isManxueGeminiImageModel(id: string): boolean {
  return id === 'gemini-3-pro-image-preview-2k-manxue' || id === 'gemini-3-pro-image-preview-4k-manxue' || id === 'gemini-3.1-flash-image-preview-2k-manxue' || id === 'gemini-3.1-flash-image-preview-4k-manxue';
}

/** 满 eAPI GPT Image 2 模型 */
function isManxueGptImage2Model(id: string): boolean {
  return id === 'gpt-image-2-pro-manxue' || id === 'gpt-image-2-manxue';
}

/** 画布主界面快捷键说明（与 window keydown / paste 逻辑一致） */
const CANVAS_SHORTCUT_HELP_ROWS: readonly { combo: string; detail: string }[] = [
  { combo: 'V', detail: '选择工具' },
  { combo: 'B', detail: '框选工具' },
  { combo: '空格（按住）', detail: '临时切换到平移；松开后恢复选择工具' },
  { combo: 'Q', detail: '在视图中心新建「AI 对话」节点（无 Ctrl / ⌘ / Alt；不在输入框内）' },
  { combo: 'W', detail: '新建「文生图」节点' },
  { combo: 'E', detail: '新建「图生图」节点' },
  { combo: 'R', detail: '新建「文本」节点' },
  { combo: 'X', detail: '将当前选中节点设为吸管目标；无选中则取消吸管' },
  { combo: 'C', detail: '将选中节点的当前图片复制为新图片节点（节点须包含图片）' },
  { combo: 'Esc', detail: '关闭本快捷键窗口（若已打开）；否则取消选中、关闭菜单与草稿连线、退出全屏图、取消吸管' },
  { combo: 'Delete / Backspace', detail: '删除当前选中的节点（非全屏预览图时）' },
  { combo: 'Alt + Q', detail: '删除当前选中的节点（同上）' },
  { combo: 'Ctrl + C / ⌘ + C', detail: '复制节点（仅当选中恰好 1 个节点时）' },
  { combo: 'Ctrl + V / ⌘ + V', detail: '粘贴（输入框外；支持一次粘贴多张图片为新节点，否则粘贴已复制节点）' },
  { combo: 'Ctrl + S / ⌘ + S', detail: '保存当前项目' },
  { combo: 'Ctrl + Alt + S / ⌘ + ⌥ + S', detail: '另存 JSON 草稿（不改变当前 Ctrl+S 绑定）' },
  { combo: 'Ctrl + Z / ⌘ + Z', detail: '撤销画布操作' },
  { combo: 'Ctrl + A / ⌘ + A', detail: '全选画布上的节点' },
  { combo: 'F', detail: '视口缩放并居中到当前选中节点（需先选中；非输入框）' },
];

/** 打开项目时默认画布缩放比例（20%） */
const DEFAULT_CANVAS_VIEW_SCALE = 0.2;

// --- Main App Component ---

export default function App() {
  // --- State ---
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE });
  // 懒加载优化：跟踪视口尺寸和画布容器引用
  const viewportRef = useRef({ width: typeof window !== 'undefined' ? window.innerWidth : 1920, height: typeof window !== 'undefined' ? window.innerHeight : 1080 });
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const updateViewport = () => {
      const next = { width: window.innerWidth, height: window.innerHeight };
      viewportRef.current = next;
      setViewportSize(next);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  const { ensureJimengReady, openLogin, authInfo, logout } = useJimengAuth();
  const openLoginRef = useRef(openLogin);
  useEffect(() => { openLoginRef.current = openLogin; }, [openLogin]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('canvas');
  const [auditImages, setAuditImages] = useState<AuditImage[]>([]);
  const auditImagesRef = useRef<AuditImage[]>([]);
  useEffect(() => { auditImagesRef.current = auditImages; }, [auditImages]);
  // 跨模式共享剪贴板：两个画布模式下最后一次复制的图片
  const sharedClipboardImageRef = useRef<AuditImage | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 多选支持
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Selection Box State
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionBoxRef = useRef<{ x: number, y: number, width: number, height: number } | null>(null);
  const selectionBoxDomRef = useRef<HTMLDivElement | null>(null);
  const isSelectingRef = useRef(false);
  const boxSelectRafRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pressStartPosRef = useRef<{ x: number, y: number } | null>(null);
  const lastPasteTimeRef = useRef(0);
  const selectionModifiersRef = useRef<{ ctrl: boolean, alt: boolean }>({ ctrl: false, alt: false });

  // Edge Drag State
  const [draggingEdgeId, setDraggingEdgeId] = useState<string | null>(null);
  const draggingEdgeIdRef = useRef<string | null>(null);
  const canvasHistoryRef = useRef<CanvasHistoryEntry[]>([]);
  const canvasHistoryIndexRef = useRef(-1);
  const isApplyingCanvasHistoryRef = useRef(false);
  const historyDebounceTimerRef = useRef<number | null>(null);
  const historyInitializedRef = useRef(false);
  /** 因体量过大未建立撤销栈时，只提示一次 */
  const canvasHistoryOversizedWarnedRef = useRef(false);
  const [canvasHistoryNotice, setCanvasHistoryNotice] = useState<string | null>(null);
  const lastCanvasHistorySignatureRef = useRef('');
  const lastStructuralHistoryKeyRef = useRef('');
  const lastPromptHistoryKeyRef = useRef('');
  const canvasCommandStackRef = useRef<CanvasCommand[]>([]);
  const nodeDragHistoryStartRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  // Connection Drafting
  const [draftEdge, setDraftEdge] = useState<{ sourceId: string, x: number, y: number } | null>(null);

  // Pending edge source - for auto-connecting after creating new node
  const [pendingEdgeSourceId, setPendingEdgeSourceId] = useState<string | null>(null);
  const pendingEdgeSourceIdRef = useRef<string | null>(null);
  useEffect(() => {
    pendingEdgeSourceIdRef.current = pendingEdgeSourceId;
  }, [pendingEdgeSourceId]);

  /** 供早于声明处的键盘 effect 安全调用 */
  const addNodeAtCanvasPositionRef = useRef<(type: NodeType, canvasX: number, canvasY: number) => void>(() => {});

  // Context Menu & Clipboard
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, canvasX: number, canvasY: number } | null>(null);
  const [clipboard, setClipboard] = useState<CanvasNode | null>(null);
  const [projects, setProjects] = useState<CanvasProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const saveSuccessTimerRef = useRef<number | null>(null);
  const [projectExportMenuOpen, setProjectExportMenuOpen] = useState(false);
  const [projectStoreReady, setProjectStoreReady] = useState(false);
  /** 切换/打开项目后下一帧将视口重置为默认 20% 居中 */
  const pendingDefaultViewportRef = useRef(true);
  const [autosaveIntervalMin, setAutosaveIntervalMin] = useState<0 | 5 | 10 | 20 | 30>(() => {
    try {
      const v = localStorage.getItem('wxcanvas-autosave-interval-min');
      if (v === '0') return 0;
      if (v === '5' || v === '10' || v === '20' || v === '30') return Number(v) as 5 | 10 | 20 | 30;
    } catch {
      /* ignore */
    }
    return 20;
  });
  const [draftNameInput, setDraftNameInput] = useState('');
  const [draftStoragePathInput, setDraftStoragePathInput] = useState('');
  const [centerTitleEditValue, setCenterTitleEditValue] = useState<string | null>(null);
  const skipCenterRenameBlurRef = useRef(false);
  const persistWarningShownRef = useRef(false);
  const lastJsonFileHandleRef = useRef<any>(null);
  /** 最近一次通过「另存为」成功绑定的 ZIP 句柄（仅内存，切换项目会清空） */
  const lastZipFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  /** 最近一次用户选择的磁盘覆盖目标：JSON 另存为 或 ZIP 另存为 */
  const lastDiskWriteFormatRef = useRef<'json' | 'zip' | null>(null);
  const [lastJsonFilename, setLastJsonFilename] = useState<string>('');
  const draftDiskFlowResolveRef = useRef<((v: boolean) => void) | null>(null);
  const draftDiskModalRef = useRef<DraftDiskModalState>(null);
  const [draftDiskModal, setDraftDiskModal] = useState<DraftDiskModalState>(null);

  // 全局大编辑框（所有节点的 textarea 双击弹出）
  const [bigEditorOpen, setBigEditorOpen] = useState(false);
  const [bigEditorValue, setBigEditorValue] = useState('');
  const bigEditorOnSaveRef = useRef<((v: string) => void) | null>(null);
  const bigEditorLastClickRef = useRef(0);

  /** 双击 textarea 时调用：打开全局大编辑框 */
  const openBigEditor = useCallback((current: string, onSave: (v: string) => void) => {
    setBigEditorValue(current);
    bigEditorOnSaveRef.current = onSave;
    setBigEditorOpen(true);
  }, []);

  /** 与画布/项目 state 同步，供保存与列表操作读取「最新」快照，避免闭包滞后 */
  const activeProjectIdRef = useRef(activeProjectId);
  const projectsRef = useRef(projects);
  const transformRef = useRef(transform);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  /** 绘制前同步，避免新建节点后立刻拖缩放时 ref 仍为上一轮渲染（useEffect 晚一拍会导致 origin/grab 错位跳一下） */
  useLayoutEffect(() => {
    transformRef.current = transform;
  }, [transform]);
  useLayoutEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // 同步视口信息（transform + 容器尺寸）到 ref，供离屏节点过滤使用
  useLayoutEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    canvasViewportRef.current = {
      x: transform.x,
      y: transform.y,
      width: rect.width,
      height: rect.height,
      scale: transform.scale,
    };
  }, [transform]);

  // 容器尺寸变化时也更新视口 ref
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      canvasViewportRef.current.width = rect.width;
      canvasViewportRef.current.height = rect.height;
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    draftDiskModalRef.current = draftDiskModal;
  }, [draftDiskModal]);

  useEffect(() => {
    setCenterTitleEditValue(null);
  }, [activeProjectId]);

  useEffect(() => {
    if (!showProjectModal) return;
    const p = projectsRef.current.find((x) => x.id === activeProjectId);
    if (!p) return;
    setDraftNameInput((p.draftTitle?.trim() || p.name || '').trim() || '');
    const raw = (p.draftStoragePathNote || '').trim();
    const cleaned = sanitizeDraftStoragePathNote(raw);
    setDraftStoragePathInput(cleaned);
    if (cleaned !== raw) {
      const pid = p.id;
      setProjects((prev) => {
        const next = prev.map((x) =>
          x.id === pid ? { ...x, draftStoragePathNote: cleaned || undefined, updatedAt: Date.now() } : x
        );
        projectsRef.current = next;
        void saveProjectLibrary(next, pid);
        return next;
      });
    }
  }, [showProjectModal, activeProjectId]);

  // Fullscreen Image Modal
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenNodeId, setFullscreenNodeId] = useState<string | null>(null);
  const [fullscreenImageIdx, setFullscreenImageIdx] = useState(0);
  const [fsTransform, setFsTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [fsContextMenu, setFsContextMenu] = useState<{ x: number, y: number } | null>(null);
  const openFullscreenImage = (nodeId: string, img: string, idx: number) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    const assetId = node?.imageAssetIds?.[idx];
    void resolveCanvasImageSource(img, assetId).then((src) => {
      if (!src) return;
      setFullscreenNodeId(nodeId);
      setFullscreenImage(src);
      setFullscreenImageIdx(idx);
      setFsTransform({ scale: 1, x: 0, y: 0 });
    });
  };
  /** 通用全屏查看（不需要 nodeId，用于对话消息中的图片） */
  const openFullscreenFromBase64 = (base64: string) => {
    void resolveCanvasImageSource(base64, undefined).then((src) => {
      if (!src) return;
      setFullscreenNodeId(null);
      setFullscreenImage(src);
      setFullscreenImageIdx(0);
      setFsTransform({ scale: 1, x: 0, y: 0 });
    });
  };
  const fsNavigate = (dir: 1 | -1) => {
    const node = nodesRef.current.find(n => n.id === fullscreenNodeId);
    if (!node?.images?.length) return;
    const nextIdx = fullscreenImageIdx + dir;
    if (nextIdx < 0 || nextIdx >= node.images.length) return;
    const nextImg = node.images[nextIdx];
    const nextAssetId = node.imageAssetIds?.[nextIdx];
    void resolveCanvasImageSource(nextImg, nextAssetId).then((src) => {
      if (!src) return;
      setFullscreenImageIdx(nextIdx);
      setFullscreenImage(src);
      setFsTransform({ scale: 1, x: 0, y: 0 });
    });
  };

  // Image Import Target
  const [importTargetNodeId, setImportTargetNodeId] = useState<string | null>(null);

  // Eyedropper State (全局吸管状态)
  const [eyedropperTargetNodeId, setEyedropperTargetNodeId] = useState<string | null>(null);
  const eyedropperTargetNodeIdRef = useRef<string | null>(null);
  // 保持 ref 与 state 同步
  useEffect(() => {
    eyedropperTargetNodeIdRef.current = eyedropperTargetNodeId;
  }, [eyedropperTargetNodeId]);

  // 快捷节点面板
  const [quickPaletteOpen, setQuickPaletteOpen] = useState(true);
  // 画布背景样式 'dots' | 'grid' | 'none'
  const [canvasBgStyle, setCanvasBgStyle] = useState<'dots' | 'grid' | 'none'>('dots');
  const [canvasBgColor, setCanvasBgColor] = useState<'dark' | 'black'>('dark');

  // 节点缩放状态
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const resizingNodeIdRef = useRef<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState<string>('');
  const resizeDirectionRef = useRef<string>('');
  const [isResizing, setIsResizing] = useState(false);
  /** 按下缩放手柄时的节点几何快照 + 指针在画布上的抓取点（用于抵消手柄 CSS 偏移） */
  const nodeResizeSessionRef = useRef<{
    nodeId: string;
    direction: string;
    origin: { x: number; y: number; width: number; height: number };
    grabCanvasX: number;
    grabCanvasY: number;
    minWidth: number;
    minHeight: number;
  } | null>(null);
  useEffect(() => {
    resizingNodeIdRef.current = resizingNodeId;
    resizeDirectionRef.current = resizeDirection;
  }, [resizingNodeId, resizeDirection]);

  // --- Node Update Handler (must be defined early for use by other callbacks) ---
  const handleUpdateNode = useCallback((id: string, updates: Partial<CanvasNode>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const generationAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationStartedAtRef = useRef<Map<string, number>>(new Map());

  const handleCancelGeneration = useCallback((nodeId: string) => {
    generationAbortControllersRef.current.get(nodeId)?.abort();
    generationAbortControllersRef.current.delete(nodeId);
    generationStartedAtRef.current.delete(nodeId);
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
    );
  }, []);

  const handleClearCanvas = useCallback(() => {
    if (
      !confirm('确定清空画布？将删除所有节点与连线，画布变为空白（建议先「保存当前画布」或导出项目）。')
    ) {
      return;
    }
    setNodes([]);
    setEdges([]);
    pendingDefaultViewportRef.current = true;
    setSelectedIds([]);
    canvasHistoryRef.current = [];
    canvasHistoryIndexRef.current = -1;
    historyInitializedRef.current = false;
    canvasHistoryOversizedWarnedRef.current = false;
    lastCanvasHistorySignatureRef.current = '';
    lastStructuralHistoryKeyRef.current = '';
    lastPromptHistoryKeyRef.current = '';
    canvasCommandStackRef.current = [];
    nodeDragHistoryStartRef.current = null;
    generationAbortControllersRef.current.clear();
    generationStartedAtRef.current.clear();
    clearCanvasThumbnailCache();
  }, []);

  const handleClearCanvasPreviewCache = useCallback(() => {
    clearCanvasThumbnailCache();
    alert('已清理画布预览缩略图缓存（内存）。大图仍可从节点数据加载；本地项目存档不受影响。');
  }, []);

  const handleLogout = useCallback(async () => {
    if (!window.confirm('确定要退出即梦账号吗？')) return;
    try {
      await logout();
      alert('已退出即梦账号');
    } catch (e: any) {
      alert('退出失败: ' + (e.message || '未知错误'));
    }
  }, [logout]);

  // --- Error Classification & Quick Fix ---
  const classifyError = useCallback((rawError: string, node: CanvasNode) => {
    const msg = (rawError || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('too many requests') || msg.includes('resource exhausted') || msg.includes('insufficient_user_quota')) {
      return {
        title: '⚠️ 额度不足',
        reason: 'AI 服务额度已用完，请前往充值后重试。',
        fixes: [
          { label: '💰 充值额度', action: () => { window.open('https://manxueapi.com/recharge', '_blank'); handleUpdateNode(node.id, { error: undefined }); } },
          { label: '切换免费模型', action: () => handleUpdateNode(node.id, { model: node.type === 'chat' ? 'gemini-2.5-flash' : 'gemini-3.1-flash-image-preview', error: undefined }) },
        ]
      };
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline') || msg.includes('network') || msg.includes('fetch failed')) {
      return {
        title: '⏱️ 请求超时',
        reason: '网络或模型响应超时，可尝试降低画质或切换网络。',
        fixes: [
          { label: '🔄 重试一次', action: () => handleUpdateNode(node.id, { error: undefined }) },
          { label: '📉 降低画质', action: () => handleUpdateNode(node.id, { imageCount: 1, resolution: '1k', error: undefined }) },
        ]
      };
    }
    if (msg.includes('invalid') || msg.includes('unsupported') || msg.includes('bad request') || msg.includes('400') || msg.includes('参数')) {
      return {
        title: '⚙️ 参数无效',
        reason: '当前参数组合或输入内容不符合接口要求。',
        fixes: [
          {
            label: '🔄 恢复默认',
            action: () =>
              handleUpdateNode(node.id, {
                aspectRatio: node.type === 'panoramaT2i' ? '2:1' : '16:9',
                imageCount: 1,
                resolution: '2k',
                ...(node.type === 't2i' || node.type === 'i2i' || node.type === 'panoramaT2i' ? { model: defaultCanvasImageModel() } : {}),
                error: undefined,
              }),
          },
          { label: '❌ 关闭提示', action: () => handleUpdateNode(node.id, { error: undefined }) },
        ]
      };
    }
    return {
      title: '❌ API 错误',
      reason: '接口鉴权失败、服务不可用或返回格式异常。',
      fixes: [
        { label: '⚙️ 检查 API Key', action: () => { setSettingsTab('api'); setShowSettingsModal(true); handleUpdateNode(node.id, { error: undefined }); } },
        { label: '🔄 切换模型', action: () => handleUpdateNode(node.id, { model: node.type === 'chat' ? 'gemini-2.5-flash' : 'gemini-3.1-flash-image-preview', error: undefined }) },
      ]
    };
  }, [handleUpdateNode]);

  const renderNodeErrorPanel = useCallback((node: CanvasNode) => {
    if (!node.error) return null;
    const diagnosis = classifyError(node.error, node);
    return (
      <div
        className="absolute inset-x-3 bottom-3 z-20 text-xs text-red-200 bg-red-950/95 p-2 rounded border border-red-900/50 shadow-lg break-words max-h-40 overflow-y-auto backdrop-blur-md cursor-pointer"
        onClick={() => handleUpdateNode(node.id, { error: undefined })}
      >
        <div className="flex justify-between items-start mb-1 gap-2">
          <span className="font-bold">{diagnosis.title}</span>
          <div className="flex gap-1">
            <button onPointerDown={(e) => { e.stopPropagation(); navigator.clipboard.writeText(node.error || ''); }} className="text-red-300 hover:text-red-100"><CopyIcon size={12} /></button>
            <button onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { error: undefined }); }} className="text-red-300 hover:text-red-100"><XIcon size={12} /></button>
          </div>
        </div>
        <div className="text-red-100/90 mb-1">{diagnosis.reason}</div>
        <div className="text-red-300 mb-2">{node.error}</div>
        <div className="flex flex-wrap gap-1">
          {diagnosis.fixes.map((fix, idx) => (
            <button
              key={`${node.id}-fix-${idx}`}
              onPointerDown={(e) => { e.stopPropagation(); fix.action(); }}
              className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-red-50 border border-red-600/50"
            >
              {fix.label}
            </button>
          ))}
        </div>
      </div>
    );
  }, [classifyError, handleUpdateNode]);

  // Handle canvas click for eyedropper - 创建连线而非复制图片（成功返回 true）
  const handleCanvasEyedropper = useCallback((sourceNodeId: string, targetNodeId: string): boolean => {
    if (!targetNodeId) return false;
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    const targetNode = nodes.find(n => n.id === targetNodeId);
    if (!sourceNode || !targetNode) return false;

    const canReceiveConnection = (node: CanvasNode) => INPUT_NODE_TYPES.includes(node.type);
    const canConnectNodes = (source: CanvasNode, target: CanvasNode) => {
      if (source.id === target.id) return false;
      if (!canReceiveConnection(target)) return false;
      // 对话节点只接收明确支持的上游类型，避免“能吸附但不生效”的不稳定体验
      if (target.type === 'chat') {
        return (
          source.type === 'text' ||
          source.type === 'image' ||
          source.type === 't2i' ||
          source.type === 'i2i' ||
          source.type === 'video'
        );
      }
      return true;
    };
    if (!canConnectNodes(sourceNode, targetNode)) {
      setEyedropperTargetNodeId(null);
      return false;
    }

    // 检查是否已存在连线
    const existingEdge = edges.find(
      e => e.sourceId === sourceNodeId && e.targetId === targetNodeId
    );
    
    if (existingEdge) {
      // 已存在连线，取消吸取模式
      setEyedropperTargetNodeId(null);
      return false;
    }

    // 创建新的连线
    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      sourceId: sourceNodeId,
      targetId: targetNodeId,
    };
    setEdges(prev => [...prev, newEdge]);
    setEyedropperTargetNodeId(null);
    return true;
  }, [nodes, edges]);

  // 默认节点尺寸映射（新建 / 重置窗口；文生图宽:高≈3:4；图生图 高:宽≈1.4；图片标注宽:高≈4:5；AI对话更高且内部分区 2:1；全景图生成等仍偏横向）
  const DEFAULT_NODE_SIZES: Record<string, { width: number, height: number }> = {
    /** 文生图：竖向窗，宽:高 = 3:4（与常见文生图界面比例接近） */
    't2i': { width: 900, height: 1200 },
    /** 图生图：高:宽 ≈ 1.4:1（较 2:3 略矮，贴近参考界面） */
    'i2i': { width: 900, height: 1260 },
    'panorama': { width: 1300, height: 1000 },
    'panoramaT2i': { width: 1300, height: 1000 },
    /** 图片标注：近方形略竖长，宽:高 = 4:5（介于 4:5～5:6） */
    'annotation': { width: 960, height: 1000 },
    'director3d': { width: 900, height: 780 },
    /** AI 对话：竖向更高；内容区消息列表:底部输入带 = 2:1 */
    'chat': { width: 1560, height: 2760 },
    'text': { width: 1050, height: 750 },
    'image': { width: 960, height: 1056 },
    'gridSplit': { width: 1680, height: 1200 },
    'gridMerge': { width: 1680, height: 1200 },
    'video': { width: 1200, height: 1400 },
    'audio': { width: 400, height: 300 },
  };

  // 节点最小尺寸限制（按类型；与默认倍率一致）
  const MIN_NODE_SIZES: Record<string, { width: number, height: number }> = {
    image: { width: 840, height: 780 },
    gridSplit: { width: 720, height: 560 },
    gridMerge: { width: 720, height: 560 },
    /** 文生图：与默认 3:4 比例一致 */
    t2i: { width: 720, height: 960 },
    /** 图生图：与默认 高:宽≈1.4 一致 */
    i2i: { width: 600, height: 840 },
    /** 图片标注：与默认 4:5 比例一致 */
    annotation: { width: 640, height: 800 },
    chat: { width: 640, height: 1200 },
  };

  // 重置节点大小
  const handleResetNodeSize = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const defaultSize = DEFAULT_NODE_SIZES[node.type];
    if (defaultSize) {
      handleUpdateNode(nodeId, { width: defaultSize.width, height: defaultSize.height });
    }
  }, [nodes, handleUpdateNode]);

  /** 缩放手柄按下：同步 ref + 记录 resize session（相对指针起点算尺寸，不依赖逐帧 lastMousePos） */
  const beginNodeResize = useCallback((e: React.PointerEvent, nodeId: string, direction: string) => {
    e.stopPropagation();
    e.preventDefault();
    // 取消节点拖拽遗留的 RAF，避免下一帧仍 apply 位移导致 origin 快照与屏幕不一致（缩放开始就「跳一下」）
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    nodeDragAccumRef.current = null;

    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tf = transformRef.current;
    const scale = Math.max(tf.scale, 0.1);
    const grabCanvasX = (e.clientX - rect.left - tf.x) / scale;
    const grabCanvasY = (e.clientY - rect.top - tf.y) / scale;
    const minSize = MIN_NODE_SIZES[node.type] || { width: 200, height: 150 };
    nodeResizeSessionRef.current = {
      nodeId,
      direction,
      origin: { x: node.x, y: node.y, width: node.width, height: node.height },
      grabCanvasX,
      grabCanvasY,
      minWidth: minSize.width,
      minHeight: minSize.height,
    };
    activePointerTypeRef.current = 'resize';
    resizingNodeIdRef.current = nodeId;
    resizeDirectionRef.current = direction;
    setResizingNodeId(nodeId);
    setResizeDirection(direction);
    setIsResizing(true);
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // 兼容旧数据：防止历史项目中的宫格节点过小导致内容显示不全
  useEffect(() => {
    setNodes(prev => {
      let changed = false;
      const next = prev.map(n => {
        if (n.type !== 'gridSplit' && n.type !== 'gridMerge') return n;
        const minSize = MIN_NODE_SIZES[n.type];
        const nextWidth = Math.max(n.width, minSize.width);
        const nextHeight = Math.max(n.height, minSize.height);
        if (nextWidth !== n.width || nextHeight !== n.height) {
          changed = true;
          return { ...n, width: nextWidth, height: nextHeight };
        }
        return n;
      });
      return changed ? next : prev;
    });
  }, []);

  // 将现有全景节点调整为更横向的长方形比例
  useEffect(() => {
    setNodes(prev => {
      let changed = false;
      const next = prev.map(n => {
        if (n.type !== 'panorama') return n;
        const targetWidth = 840;
        const targetHeight = 630;
        if (n.width !== targetWidth || n.height !== targetHeight) {
          changed = true;
          return { ...n, width: targetWidth, height: targetHeight };
        }
        return n;
      });
      return changed ? next : prev;
    });
  }, []);

  // Unified Settings (API + Presets)
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'api' | 'presets' | 'downloads' | 'credits' | 'appearance'>('api');
  /** 设置 → 预设：顶层大类（AI对话 / 文生图 / 图生图） */
  const [settingsPresetDomainTab, setSettingsPresetDomainTab] = useState<PresetDomainId>('i2i');
  /** 设置 → 预设：预设名 → 顶层大类手动覆盖 */
  const [promptPresetDomainOverrides, setPromptPresetDomainOverrides] = useState<Record<string, PresetDomainId>>({});
  /** 设置 → 预设：仅「图生图」大类下使用 — 角色/场景/道具/其他 */
  const [settingsPresetCategoryTab, setSettingsPresetCategoryTab] = useState<I2iPresetCategoryId>('character');
  /** 设置 → 预设：仅「文生图」大类下使用 — 故事板 */
  const [settingsT2iPresetCategoryTab, setSettingsT2iPresetCategoryTab] = useState<T2iPresetCategoryId>('storyboard');
  /** 设置 → 预设：密码验证通过后的本会话内可自由编辑、复制/重命名/删除不再弹密码 */
  const [settingsPresetAuthSession, setSettingsPresetAuthSession] = useState(false);
  /** 设置 → 预设：密码校验弹层（复制 / 重命名 / 删除 / 解锁 / 添加 前弹出） */
  const [settingsPresetPwdModal, setSettingsPresetPwdModal] = useState<{
    intent: SettingsPresetPwdIntent | null;
    input: string;
  }>({ intent: null, input: '' });
  const [downloadPathSettings, setDownloadPathSettings] = useState<DownloadPathPersisted>(() =>
    loadDownloadPathSettings()
  );
  const [downloadDirLabels, setDownloadDirLabels] = useState<{
    combined?: string;
    image?: string;
    video?: string;
  }>({});

  /** 设置 → 积分消耗：密码通过后本会话内可增删改 */
  const [settingsCreditsAuthSession, setSettingsCreditsAuthSession] = useState(false);
  const [settingsCreditsPwdModal, setSettingsCreditsPwdModal] = useState<{ open: boolean; input: string }>({
    open: false,
    input: '',
  });
  const [creditPricingRows, setCreditPricingRows] = useState<CreditPricingRow[]>(() => loadCreditPricingRows());

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
  const [codesonlineBaseInput, setCodesonlineBaseInput] = useState(() => getAiSettingsSnapshot().codesonlineBaseUrl);
  const [codesonlineKeyInput, setCodesonlineKeyInput] = useState(() => getAiSettingsSnapshot().codesonlineKey);
  const [codesonlineChatKeyInput, setCodesonlineChatKeyInput] = useState(() => getCodesonlineChatSavedKey());
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

  /** 保存 JSON 到本机；支持 File System Access API 时弹出「另存为」选择路径。saved=已写入或已触发下载；aborted=用户取消另存为 */
  const saveJsonToDisk = useCallback(
    async (
      filename: string,
      data: unknown,
      opts?: { backupProjectId?: string }
    ): Promise<'saved' | 'aborted'> => {
    const json = JSON.stringify(data, null, 2);
    const hasPicker = typeof (window as any).showSaveFilePicker === 'function';
    if (hasPicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'JSON 文件',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        lastJsonFileHandleRef.current = handle;
        lastDiskWriteFormatRef.current = 'json';
        const backupPid = opts?.backupProjectId ?? activeProjectIdRef.current;
        if (backupPid) {
          void persistProjectBackupFileHandle(backupPid, handle as FileSystemFileHandle).catch((e) =>
            console.warn('持久化项目 JSON 句柄失败', e)
          );
        }
        setLastJsonFilename(handle?.name || filename);
        return 'saved';
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'aborted';
        console.warn('文件保存器失败，回退为浏览器下载：', err);
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setLastJsonFilename(filename);
    URL.revokeObjectURL(url);
    return 'saved';
  },
  []
);

  // --- Project Management ---
  /**
   * 本地存档策略（简要）：
   * - 画布上的 nodes / edges / transform 只在内存中实时变化；
   * - 「保存当前画布 / Ctrl+S」：写入 IndexedDB；若该项目尚未绑定本地草稿 JSON，会先弹出对话框填写文件名并选择保存文件夹（Chrome / Edge）；确认后绑定句柄，项目名下展示草稿位置；取消则仍只写草稿库；
   * - 已绑定草稿后：**Ctrl+S** 会同步覆盖绑定的 JSON；**Ctrl+Alt+S（⌘+⌥+S）** 为「另存 JSON」（选文件夹 + 文件名），不改变当前绑定的主草稿；
   * - 「定时自动保存」：已绑定草稿的项目打开时默认每 **5** 分钟静默保存（IndexedDB + 覆盖绑定 JSON）；可在项目管理里改为关闭或其它间隔；
   * - 图片 / 视频下载在已选择草稿文件夹时，默认写入该文件夹（无需在设置里启用固定目录）；
   * - 「导出 JSON / ZIP」仍可通过菜单另存；导出 JSON 也会标记已做过磁盘备份；
   * - 首次打开会从旧版 localStorage 迁移到 IndexedDB；
   * - 「切换项目」：先保存当前画布到原项目，再载入目标项目。
   */
  const createNewProject = useCallback((name?: string) => {
    const projectId = `project-${Date.now()}`;
    const prevList = projectsRef.current;
    const projectName = (name || '').trim() || `项目 ${prevList.length + 1}`;
    const newProject: CanvasProject = {
      id: projectId,
      name: projectName,
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      transform: { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE }
    };
    const merged = mergeCurrentCanvasIntoProjectList(
      prevList,
      activeProjectIdRef.current,
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    const nextList = [newProject, ...merged];
    setProjects(nextList);
    projectsRef.current = nextList;
    setActiveProjectId(projectId);
    setNodes(newProject.nodes);
    setEdges(newProject.edges);
    pendingDefaultViewportRef.current = true;
    void saveProjectLibrary(nextList, projectId).then((ok) => {
      if (!ok) {
        alert('新建项目已生效，但写入本地草稿库（IndexedDB）失败。请检查浏览器存储权限或磁盘空间。');
      } else {
        persistWarningShownRef.current = false;
      }
    });
  }, []);

  const flushBoundDraftJsonToDisk = useCallback(
    async (
      pid: string,
      list: CanvasProject[],
      opts?: { alertOnFailure?: boolean; onSaved?: (filename: string) => void }
    ): Promise<string | null> => {
      const p = list.find((x) => x.id === pid);
      if (!p?.diskSaveEstablished || lastDiskWriteFormatRef.current !== 'json') return null;
      let h = lastJsonFileHandleRef.current as FileSystemFileHandle | null;
      if (!h) {
        const fetched = await getProjectBackupFileHandle(pid);
        h = fetched ?? null;
        lastJsonFileHandleRef.current = h;
      }
      if (!h) return null;
      const savedFilename = h.name || '';
      try {
        const forWrite = { ...p };
        delete (forWrite as { diskSaveEstablished?: boolean }).diskSaveEstablished;
        const json = JSON.stringify(forWrite, null, 2);
        const writable = await h.createWritable();
        await writable.write(json);
        await writable.close();
        setLastJsonFilename(savedFilename);
        opts?.onSaved?.(savedFilename);
        return savedFilename;
      } catch (e) {
        console.warn('[canvas] 覆盖本地草稿 JSON 失败', e);
        if (opts?.alertOnFailure) {
          alert('草稿库已更新，但覆盖本地 JSON 草稿失败（文件可能被移动或无写入权限）。');
        }
        return null;
      }
    },
    []
  );

  const saveCurrentProject = useCallback(
    (options?: { skipDiskPrompt?: boolean }): Promise<boolean> => {
      const pid = activeProjectIdRef.current;
      if (!pid) {
        alert('项目数据仍在加载，请稍后再试保存。');
        return Promise.resolve(false);
      }
      const nextProjects = mergeCurrentCanvasIntoProjectList(
        projectsRef.current,
        pid,
        nodesRef.current,
        edgesRef.current,
        transformRef.current,
        auditImagesRef.current.length > 0 ? { images: auditImagesRef.current } : undefined
      );
      const cur = nextProjects.find((p) => p.id === pid);
      const needsDiskPrompt = !options?.skipDiskPrompt && cur != null && !cur.diskSaveEstablished;

      const commitToIdb = (list: CanvasProject[]): Promise<boolean> => {
        setProjects(list);
        projectsRef.current = list;
        return saveProjectLibrary(list, pid).then((ok) => {
          if (!ok) {
            alert('保存失败：无法写入 IndexedDB 草稿库。请检查存储权限或尝试导出 ZIP/JSON 备份。');
          } else {
            persistWarningShownRef.current = false;
          }
          return ok;
        });
      };

      if (!needsDiskPrompt) {
        return (async () => {
          const ok = await commitToIdb(nextProjects);
          if (!ok) return false;
          await flushBoundDraftJsonToDisk(pid, nextProjects, {
            alertOnFailure: !options?.skipDiskPrompt,
            onSaved: (filename) => {
              setSaveSuccessMsg(`已保存至: ${filename}`);
              if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
              saveSuccessTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(null), 3000);
            },
          });
          return true;
        })();
      }

      return new Promise<boolean>((resolve) => {
        draftDiskFlowResolveRef.current = resolve;
        setDraftDiskModal({
          mode: 'firstSave',
          mergedProjects: nextProjects,
          pid,
          basenameDraft: projectExportBasename(cur as CanvasProject),
        });
      });
    },
    [flushBoundDraftJsonToDisk]
  );

  const saveCurrentProjectRef = useRef(saveCurrentProject);
  useEffect(() => {
    saveCurrentProjectRef.current = saveCurrentProject;
  }, [saveCurrentProject]);

  useEffect(() => {
    if (!projectStoreReady || autosaveIntervalMin <= 0) return;
    const ms = autosaveIntervalMin * 60 * 1000;
    const timer = window.setInterval(() => {
      const pid = activeProjectIdRef.current;
      if (!pid) return;
      const p = projectsRef.current.find((x) => x.id === pid);
      if (!p?.diskSaveEstablished) return;
      void saveCurrentProjectRef.current({ skipDiskPrompt: true });
    }, ms);
    return () => clearInterval(timer);
  }, [projectStoreReady, autosaveIntervalMin]);

  useEffect(() => {
    if (!projectStoreReady || !activeProjectId) return;
    const pid = activeProjectId;
    void getProjectDraftDirectoryHandle(pid).then((dir) => {
      setActiveProjectDraftDownloadDirectory(dir ?? null);
    });
    const p = projectsRef.current.find((x) => x.id === pid);
    if (p?.diskSaveEstablished) {
      setAutosaveIntervalMin((p.draftAutosaveIntervalMin ?? 5) as 0 | 5 | 10 | 20 | 30);
    } else {
      try {
        const v = localStorage.getItem('wxcanvas-autosave-interval-min');
        if (v === '0') setAutosaveIntervalMin(0);
        else if (v === '5' || v === '10' || v === '20' || v === '30')
          setAutosaveIntervalMin(Number(v) as 5 | 10 | 20 | 30);
        else setAutosaveIntervalMin(20);
      } catch {
        setAutosaveIntervalMin(20);
      }
    }
  }, [projectStoreReady, activeProjectId]);

  const handleAutosaveIntervalChange = useCallback((v: 0 | 5 | 10 | 20 | 30) => {
    setAutosaveIntervalMin(v);
    try {
      if (v === 0) localStorage.removeItem('wxcanvas-autosave-interval-min');
      else localStorage.setItem('wxcanvas-autosave-interval-min', String(v));
    } catch {
      /* ignore */
    }
    const pid = activeProjectIdRef.current;
    const cur = projectsRef.current.find((x) => x.id === pid);
    if (cur?.diskSaveEstablished) {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === pid ? { ...p, draftAutosaveIntervalMin: v, updatedAt: Date.now() } : p
        );
        projectsRef.current = next;
        void saveProjectLibrary(next, pid);
        return next;
      });
    }
  }, []);

  const cancelDraftDiskModal = useCallback(() => {
    const modal = draftDiskModalRef.current;
    if (modal?.mode === 'firstSave') {
      const resolve = draftDiskFlowResolveRef.current;
      draftDiskFlowResolveRef.current = null;
      setDraftDiskModal(null);
      const { mergedProjects, pid } = modal;
      void (async () => {
        setProjects(mergedProjects);
        projectsRef.current = mergedProjects;
        const ok = await saveProjectLibrary(mergedProjects, pid);
        if (!ok) alert('保存失败：无法写入 IndexedDB 草稿库。');
        else persistWarningShownRef.current = false;
        resolve?.(false);
      })();
      return;
    }
    draftDiskFlowResolveRef.current = null;
    setDraftDiskModal(null);
  }, []);

  const confirmDraftDiskModal = useCallback(async () => {
    const modal = draftDiskModalRef.current;
    if (!modal) return;

    const snap =
      modal.mode === 'firstSave'
        ? modal.mergedProjects.find((p) => p.id === modal.pid)
        : modal.snapshot;
    if (!snap) {
      alert('无法保存：项目数据无效。');
      return;
    }

    const defaultStem = projectExportBasename(snap);
    const raw = modal.basenameDraft.trim();
    const stem = sanitizeFilename((raw || defaultStem).replace(/\.json$/i, ''));
    const filename = `${stem}.json`;

    const payload = { ...snap };
    delete (payload as { diskSaveEstablished?: boolean }).diskSaveEstablished;
    const json = JSON.stringify(payload, null, 2);

    const w = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      showSaveFilePicker?: (opts: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    };

    let fileHandle: FileSystemFileHandle;
    let dirHandle: FileSystemDirectoryHandle | null = null;

    try {
      if (typeof w.showDirectoryPicker === 'function') {
        dirHandle = await w.showDirectoryPicker({ mode: 'readwrite' });
        fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      } else if (typeof w.showSaveFilePicker === 'function') {
        fileHandle = await w.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON 文件', accept: { 'application/json': ['.json'] } }],
        });
      } else {
        alert('当前浏览器不支持选择保存文件夹，请使用 Chrome / Edge（HTTPS 或 localhost）。');
        return;
      }

      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      console.error(e);
      alert('写入失败：可能无权限或磁盘已满。');
      return;
    }

    if (modal.mode === 'saveAs') {
      setDraftDiskModal(null);
      setSaveSuccessMsg(`已另存为: ${fileHandle.name}`);
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(null), 3000);
      return;
    }

    const pid = modal.pid;
    try {
      await persistProjectBackupFileHandle(pid, fileHandle);
      if (dirHandle) await persistProjectDraftDirectoryHandle(pid, dirHandle);
    } catch (e) {
      console.warn(e);
    }

    lastJsonFileHandleRef.current = fileHandle;
    lastDiskWriteFormatRef.current = 'json';
    setLastJsonFilename(fileHandle.name);

    const folderLabel = dirHandle?.name?.trim() || '';
    const pathNote = folderLabel ? `${folderLabel} · ${fileHandle.name}` : fileHandle.name;
    const projectName = (snap.name || '').trim();
    const draftTitle = stem !== projectName ? stem : undefined;

    const resolve = draftDiskFlowResolveRef.current;
    draftDiskFlowResolveRef.current = null;
    setDraftDiskModal(null);

    const updatedList = modal.mergedProjects.map((p) =>
      p.id === pid
        ? {
            ...p,
            diskSaveEstablished: true as const,
            draftStoragePathNote: pathNote,
            draftTitle,
            draftAutosaveIntervalMin: 5 as const,
            updatedAt: Date.now(),
          }
        : p
    );

    setProjects(updatedList);
    projectsRef.current = updatedList;
    const ok = await saveProjectLibrary(updatedList, pid);
    if (!ok) alert('本地 JSON 已写入，但同步 IndexedDB 草稿库失败，请重试。');
    else persistWarningShownRef.current = false;

    setAutosaveIntervalMin(5);
    try {
      localStorage.setItem('wxcanvas-autosave-interval-min', '5');
    } catch {
      /* ignore */
    }

    if (dirHandle) setActiveProjectDraftDownloadDirectory(dirHandle);
    else setActiveProjectDraftDownloadDirectory(null);

    resolve?.(ok);
    if (ok) {
      const savedPath = pathNote || fileHandle.name;
      setSaveSuccessMsg(`草稿已绑定至: ${savedPath}`);
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = window.setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  }, []);

  const handleApplyDraftTitle = useCallback(() => {
    const pid = activeProjectIdRef.current;
    if (!pid) return;
    const trimmed = draftNameInput.trim();
    const nameRef = projectsRef.current.find((x) => x.id === pid)?.name?.trim() || '';
    const useCustom = trimmed.length > 0 && trimmed !== nameRef;
    setProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== pid) return p;
        return {
          ...p,
          draftTitle: useCustom ? trimmed : undefined,
        updatedAt: Date.now(),
      };
      });
      projectsRef.current = next;
      void saveProjectLibrary(next, pid).then((ok) => {
        if (!ok) alert('草稿名称已更新，但写入草稿库失败，请重试。');
      });
      return next;
    });
  }, [draftNameInput]);

  const handleApplyDraftStoragePath = useCallback(async () => {
    const pid = activeProjectIdRef.current;
    if (!pid) return;

    const persistPath = (raw: string) => {
      const cleaned = sanitizeDraftStoragePathNote(raw) || raw.trim();
      setDraftStoragePathInput(cleaned);
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === pid
            ? { ...p, draftStoragePathNote: cleaned || undefined, updatedAt: Date.now() }
            : p
        );
        projectsRef.current = next;
        void saveProjectLibrary(next, pid).then((ok) => {
          if (!ok) alert('草稿存储位置已更新，但写入草稿库失败，请重试。');
        });
        return next;
      });
    };

    if (supportsFileSystemAccess()) {
      try {
        const w = window as unknown as {
          showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
        };
        const dirHandle = await w.showDirectoryPicker?.({ mode: 'read' });
        if (!dirHandle) {
          throw new Error('no handle');
        }
        const folderName = (dirHandle.name || '').trim();
        persistPath(folderName);
        return;
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        console.warn('showDirectoryPicker 失败', e);
      }
    }

    const suggestion = draftStoragePathInput.trim();
    const entered = window.prompt(
      '当前环境不支持文件夹选择器（请使用 Chrome / Edge 且为 HTTPS 或 localhost），或您已取消选择。请手动输入本机草稿所在完整路径：',
      suggestion
    );
    if (entered === null) return;
    persistPath(entered.trim());
  }, [draftStoragePathInput]);

  const commitCenterProjectRename = useCallback((raw: string) => {
    setCenterTitleEditValue(null);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const pid = activeProjectIdRef.current;
    if (!pid) return;
    const merged = mergeCurrentCanvasIntoProjectList(
      projectsRef.current,
      pid,
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    const next = merged.map((p) =>
      p.id === pid
        ? { ...p, name: trimmed, draftTitle: undefined, updatedAt: Date.now() }
        : p
    );
    setProjects(next);
    projectsRef.current = next;
    setDraftNameInput(trimmed);
    void saveProjectLibrary(next, pid).then((ok) => {
      if (!ok) alert('名称已更新，但写入草稿库失败，请重试。');
    });
  }, []);

  const switchProject = useCallback((projectId: string) => {
    const target = projectsRef.current.find((p) => p.id === projectId);
    if (!target) return;
    saveCurrentProject();
    const { project: normalizedTarget, stripped } = normalizeProjectStripLegacyAutoT2i(target);
    if (stripped) {
      const next = projectsRef.current.map((p) => (p.id === projectId ? normalizedTarget : p));
      setProjects(next);
      projectsRef.current = next;
      void saveProjectLibrary(next, projectId).then((ok) => {
        if (!ok) console.warn('[canvas] 切换项目时已剥离旧版默认文生图占位，但写回草稿库失败');
      });
    }
    setActiveProjectId(projectId);
    setNodes(normalizedTarget.nodes || []);
    setEdges(normalizedTarget.edges || []);
    pendingDefaultViewportRef.current = true;
    if (normalizedTarget.auditModeData?.images) {
      setAuditImages(normalizedTarget.auditModeData.images);
      auditImagesRef.current = normalizedTarget.auditModeData.images;
    } else {
      setAuditImages([]);
      auditImagesRef.current = [];
    }
    void getProjectBackupFileHandle(projectId).then((h) => {
      lastJsonFileHandleRef.current = h ?? null;
      lastZipFileHandleRef.current = null;
      lastDiskWriteFormatRef.current = h ? 'json' : null;
      setLastJsonFilename(h?.name ?? '');
    });
  }, [saveCurrentProject]);

  const deleteProject = useCallback((projectId: string) => {
    void removeProjectBackupFileHandle(projectId);
    const prev = projectsRef.current;
    if (prev.length <= 1) return;
    const remained = prev.filter((p) => p.id !== projectId);
    const curActive = activeProjectIdRef.current;

    if (curActive === projectId) {
      const fallback = remained[0];
      if (!fallback) return;
      const { project: fbNorm, stripped } = normalizeProjectStripLegacyAutoT2i(fallback);
      const nextRemained = stripped
        ? remained.map((p) => (p.id === fbNorm.id ? fbNorm : p))
        : remained;
      setProjects(nextRemained);
      projectsRef.current = nextRemained;
      setActiveProjectId(fbNorm.id);
      setNodes(fbNorm.nodes || []);
      setEdges(fbNorm.edges || []);
      pendingDefaultViewportRef.current = true;
      void getProjectBackupFileHandle(fbNorm.id).then((h) => {
        lastJsonFileHandleRef.current = h ?? null;
        lastZipFileHandleRef.current = null;
        lastDiskWriteFormatRef.current = h ? 'json' : null;
        setLastJsonFilename(h?.name ?? '');
      });
      void saveProjectLibrary(nextRemained, fbNorm.id).then((ok) => {
        if (!ok) alert('项目已删除，但更新草稿库失败，请尝试导出 ZIP/JSON 备份。');
      });
      return;
    }

    setProjects(remained);
    projectsRef.current = remained;
    void saveProjectLibrary(remained, curActive).then((ok) => {
      if (!ok) alert('项目已删除，但更新草稿库失败，请尝试导出 ZIP/JSON 备份。');
    });
  }, []);

  const handleExportProjectJson = useCallback(
    async (project: CanvasProject) => {
      const filename = `${projectExportBasename(project)}.json`;
      const payload = { ...project };
      delete (payload as { diskSaveEstablished?: boolean }).diskSaveEstablished;
      const r = await saveJsonToDisk(filename, payload, { backupProjectId: project.id });
      if (r !== 'saved') return;
      const pid = project.id;
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === pid ? { ...p, diskSaveEstablished: true as const } : p));
        projectsRef.current = next;
        void saveProjectLibrary(next, activeProjectIdRef.current);
        return next;
      });
    },
    [saveJsonToDisk]
  );

  /** 项目管理「打开位置」：需已填「草稿存储位置」或已绑定另存为 JSON；再提示 IndexedDB 与参考路径 */
  const openProjectLocationInfo = useCallback((project: CanvasProject) => {
    void (async () => {
      const manualRaw = project.draftStoragePathNote?.trim() || '';
      const manual = manualRaw ? sanitizeDraftStoragePathNote(manualRaw) || manualRaw : '';
      const jsonHandle = await getProjectBackupFileHandle(project.id);
      if (!manual && !jsonHandle) {
        window.alert(
          [
            '尚未设置可展示的本地参考路径。',
            '',
            '请先在本窗口上方填写「草稿存储位置」（您本机用于存放草稿/备份的文件夹路径，仅作记录），',
            '或先通过「保存当前画布 / 导出 JSON」使用系统「另存为」绑定 JSON 文件后再点「打开位置」。',
            '若与草稿说明为同一路径，只需在「草稿存储位置」中填写即可。',
          ].join('\n')
        );
        return;
      }
      const { database, objectStore, documentKey } = CANVAS_LIBRARY_IDB_LABELS;
      const lines: string[] = [
        '【浏览器内实际草稿】保存在 IndexedDB（无 D:\\… 普通文件夹路径）：',
        `数据库：${database}`,
        `对象库：${objectStore}`,
        `键：${documentKey}`,
        '',
      ];
      if (manual) {
        lines.push('【您填写的本机草稿/备份参考路径】');
        lines.push(manual);
        lines.push('');
      }
      if (jsonHandle) {
        lines.push('【已绑定的另存为 JSON 文件名】');
        lines.push(jsonHandle.name);
        lines.push('');
      }
      lines.push('Chrome / Edge：按 F12 →「应用程序」(Application) →「IndexedDB」可查看库内数据。');
      window.alert(lines.join('\n'));
    })();
  }, []);

  /** 导出 JSON 时：若目标即当前打开的项目，附带内存中最新的画布（无需先点保存） */
  const projectSnapshotForJsonExport = useCallback((project: CanvasProject): CanvasProject => {
    if (project.id !== activeProjectIdRef.current) return project;
    const { nodes: nc, edges: ec, transform: tc } = cloneCanvasForProject(
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    return { ...project, nodes: nc, edges: ec, transform: tc, updatedAt: Date.now() };
  }, []);

  /** Ctrl+Alt+S：另存 JSON（选文件夹 + 文件名），不替换当前绑定的主草稿 */
  const handleSaveDraftJsonSaveAs = useCallback(() => {
    const active = projectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    if (!active) {
      alert('未找到当前项目');
      return;
    }
    const snapshot = projectSnapshotForJsonExport(active);
    setDraftDiskModal({
      mode: 'saveAs',
      snapshot,
      basenameDraft: projectExportBasename(snapshot),
    });
  }, [projectSnapshotForJsonExport]);

  const handleExportProjectZip = useCallback(
    async (project: CanvasProject) => {
      try {
        const r = await exportProjectZipToDisk(projectSnapshotForJsonExport(project));
        if (r.kind === 'aborted') return;
        if (r.kind === 'handle') {
          lastZipFileHandleRef.current = r.handle;
          lastDiskWriteFormatRef.current = 'zip';
        }
        const pid = project.id;
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === pid ? { ...p, diskSaveEstablished: true as const } : p));
          projectsRef.current = next;
          void saveProjectLibrary(next, activeProjectIdRef.current);
          return next;
        });
      } catch (e) {
        console.error(e);
        alert('导出 ZIP 失败，请重试。');
      }
    },
    [projectSnapshotForJsonExport]
  );

  const finishImportNewProject = useCallback((newProject: CanvasProject) => {
    const merged = mergeCurrentCanvasIntoProjectList(
      projectsRef.current,
      activeProjectIdRef.current,
      nodesRef.current,
      edgesRef.current,
      transformRef.current
    );
    const nextList = [newProject, ...merged];
    setProjects(nextList);
    projectsRef.current = nextList;
    setActiveProjectId(newProject.id);
    setNodes(newProject.nodes);
    setEdges(newProject.edges);
    pendingDefaultViewportRef.current = true;
    if (newProject.auditModeData?.images) {
      setAuditImages(newProject.auditModeData.images);
      auditImagesRef.current = newProject.auditModeData.images;
    } else {
      setAuditImages([]);
      auditImagesRef.current = [];
    }
    void saveProjectLibrary(nextList, newProject.id).then((ok) => {
      if (!ok) {
        alert('导入已生效，但写入草稿库失败。请导出 ZIP/JSON 备份后重试。');
      } else {
        persistWarningShownRef.current = false;
      }
    });
  }, []);

  const handleImportProjectFile = useCallback(
    (file: File) => {
      const lower = file.name.toLowerCase();
      const isZip =
        lower.endsWith('.zip') ||
        lower.endsWith('.wxcanvas.zip') ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed';

      if (isZip) {
        void parseProjectFromZipFile(file)
          .then((parsed) => {
            const newProject: CanvasProject = {
              ...parsed,
              id: `project-${Date.now()}`,
              name: parsed.name || file.name.replace(/\.(wxcanvas\.)?zip$/i, '') || '导入项目',
      updatedAt: Date.now(),
              diskSaveEstablished: false,
            };
            finishImportNewProject(newProject);
          })
          .catch((err) => {
            console.error(err);
            alert(err instanceof Error ? err.message : '导入 ZIP 失败');
          });
        return;
      }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const imported = JSON.parse(raw) as Partial<CanvasProject>;
        if (!imported || !Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) {
          alert('导入失败：JSON 格式不正确。');
          return;
        }
          const impNodes = imported.nodes as CanvasNode[];
          const impEdges = imported.edges as Edge[];
        const newProject: CanvasProject = {
          id: `project-${Date.now()}`,
          name: (imported.name || file.name.replace(/\.json$/i, '') || '导入项目').toString(),
          updatedAt: Date.now(),
            nodes: impNodes,
            edges: impEdges,
          transform: (imported.transform || { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE }) as Transform,
            diskSaveEstablished: false,
            draftStoragePathNote:
              typeof imported.draftStoragePathNote === 'string' && imported.draftStoragePathNote.trim()
                ? imported.draftStoragePathNote.trim()
                : undefined,
          };
          finishImportNewProject(newProject);
      } catch (err) {
        console.error('导入项目失败:', err);
        alert('导入失败：无法解析 JSON。');
      }
    };
    reader.readAsText(file);
    },
    [finishImportNewProject]
  );

  // 初始化项目数据：IndexedDB 草稿库；首次启动时从旧 localStorage 迁移
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await loadProjectLibrary();
        if (cancelled) return;
        if (lib && lib.projects.length > 0) {
          const { next: patchedProjects, changed: libStrippedLegacy } =
            normalizeLibraryProjectsStripLegacyAutoT2i(lib.projects);
          const activeId = lib.activeProjectId || patchedProjects[0].id;
          const initial =
            patchedProjects.find((p) => p.id === activeId) || patchedProjects[0];
          setProjects(patchedProjects);
          projectsRef.current = patchedProjects;
          setActiveProjectId(initial.id);
          setNodes(initial.nodes || []);
          setEdges(initial.edges || []);
          pendingDefaultViewportRef.current = true;
          if (initial.auditModeData?.images) {
            setAuditImages(initial.auditModeData.images);
            auditImagesRef.current = initial.auditModeData.images;
          } else {
            setAuditImages([]);
            auditImagesRef.current = [];
          }
          if (libStrippedLegacy) {
            void saveProjectLibrary(patchedProjects, initial.id).then((ok) => {
              if (!ok) console.warn('[canvas] 已剥离旧版默认文生图占位，但写回草稿库失败');
            });
          }
          setProjectStoreReady(true);
          void getProjectBackupFileHandle(initial.id).then((h) => {
            if (cancelled) return;
            lastJsonFileHandleRef.current = h ?? null;
            lastZipFileHandleRef.current = null;
            lastDiskWriteFormatRef.current = h ? 'json' : null;
            setLastJsonFilename(h?.name ?? '');
          });
          return;
      }
    } catch (err) {
      console.error('读取项目存档失败:', err);
    }
      if (cancelled) return;
    const defaultProject: CanvasProject = {
      id: `project-${Date.now()}`,
      name: '默认项目',
      updatedAt: Date.now(),
      nodes,
      edges,
        transform,
    };
    setProjects([defaultProject]);
      projectsRef.current = [defaultProject];
    setActiveProjectId(defaultProject.id);
      await saveProjectLibrary([defaultProject], defaultProject.id);
    setProjectStoreReady(true);
      void getProjectBackupFileHandle(defaultProject.id).then((h) => {
        if (cancelled) return;
        lastJsonFileHandleRef.current = h ?? null;
        lastZipFileHandleRef.current = null;
        lastDiskWriteFormatRef.current = h ? 'json' : null;
        setLastJsonFilename(h?.name ?? '');
      });
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 画布编辑不自动写盘；显式「保存当前项目」与列表操作会写入 IndexedDB 草稿库

  const [promptPresets, setPromptPresets] = useState<Record<string, string>>(() => ({
    ...INITIAL_PROMPT_PRESETS_ALL,
  }));

  /** 设置里对预设「角色/场景/道具/其他」的手动覆盖（键为预设名） */
  const [promptPresetCategoryOverrides, setPromptPresetCategoryOverrides] = useState<
    Record<string, I2iPresetCategoryId>
  >({});

  const executePresetCopy = (content: string) => {
    void navigator.clipboard
      .writeText(content)
      .then(() => window.alert('已复制到剪贴板'))
      .catch(() => window.alert('复制失败，请检查浏览器权限'));
  };

  const executePresetAdd = () => {
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
  };

  const executePresetRename = (name: string) => {
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
  };

  const executePresetDelete = (name: string) => {
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
  };

  /** 设置 → 预设密码弹层：校验通过后开启本会话，并执行触发的操作 */
  const confirmSettingsPresetPassword = () => {
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
  };

  const confirmSettingsCreditsPassword = () => {
    if (!settingsCreditsPwdModal.open) return;
    if (settingsCreditsPwdModal.input.trim() !== PRESET_SETTINGS_GUARD_PASSWORD) {
      window.alert('密码错误');
      setSettingsCreditsPwdModal((p) => ({ ...p, input: '' }));
      return;
    }
    setSettingsCreditsPwdModal({ open: false, input: '' });
    setSettingsCreditsAuthSession(true);
  };

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

  // --- Apply Preset Prompt ---
  const handleTogglePreset = useCallback((nodeId: string, presetKey: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const current = node.activePresets ?? [];
    const next = current.includes(presetKey)
      ? current.filter(k => k !== presetKey)
      : [...current, presetKey];

    // 选择特定预设时自动设置默认比例和分辨率，取消时改回 16:9 和 2K
    const patch: Partial<CanvasNode> = { activePresets: next };
    if (!current.includes(presetKey)) {
      if (presetKey === '故事板_CCC') {
        patch.aspectRatio = '3:4';
      } else if (presetKey === '角色4视图' || presetKey === '角色无头视图') {
        patch.aspectRatio = '9:16';
      }
      // 故事板预设默认使用 1K 分辨率
      if (isStoryboardPreset(presetKey)) {
        patch.resolution = '1k';
      }
    } else {
      if (presetKey === '故事板_CCC' || presetKey === '角色4视图' || presetKey === '角色无头视图') {
        patch.aspectRatio = '16:9';
      }
      // 清除故事板预设时恢复默认分辨率
      if (isStoryboardPreset(presetKey)) {
        patch.resolution = '2k';
      }
    }
    handleUpdateNode(nodeId, patch);
  }, [handleUpdateNode, nodes]);

  // 清除预设选择
  const handleClearPreset = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const clearedPresets = node.activePresets ?? [];
    handleUpdateNode(nodeId, { activePresets: undefined });
    // 如果有特殊预设被清除，比例和分辨率都改回默认值
    if (clearedPresets.some(k => k === '故事板_CCC' || k === '角色4视图' || k === '角色无头视图')) {
      handleUpdateNode(nodeId, { aspectRatio: '16:9' });
    }
    // 如果清除的是故事板预设，恢复默认分辨率 2k
    if (clearedPresets.some(k => isStoryboardPreset(k))) {
      handleUpdateNode(nodeId, { resolution: '2k' });
    }
  }, [handleUpdateNode, nodes]);

  // 复制节点生成的图片到新的图片节点
  const handleCopyToImage = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const imgLen = Math.max(node.images?.length ?? 0, node.imageAssetIds?.length ?? 0);
    let newNodes: CanvasNode[] = [];

    if (imgLen > 0) {
      const items = Array.from({ length: imgLen }, (_, idx) => ({
        base64: node.images?.[idx],
        assetId: node.imageAssetIds?.[idx],
      }));
      newNodes = buildSpacedImageNodes(items, node.x + node.width + 50, node.y);
    } else {
      const pn = node as { panoramaImage?: string; panoramaImageAssetId?: string };
      newNodes = buildSpacedImageNodes(
        [{ base64: pn.panoramaImage, assetId: pn.panoramaImageAssetId }],
        node.x + node.width + 50,
        node.y
      );
    }

    if (newNodes.length === 0) {
      alert('没有可复制的图片');
      return;
    }

    setNodes(prev => [...prev, ...newNodes]);
  }, [nodes, setNodes]);

  // --- Refs for Global Dragging ---
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const importPosRef = useRef<{ x: number, y: number, pendingSourceId?: string }>({ x: 0, y: 0 });

  // Refs to hold latest state for global event listeners
  const draftEdgeRef = useRef<{ sourceId: string, x: number, y: number } | null>(null);
  const activePointerTypeRef = useRef<'canvas' | 'node' | 'edge' | 'fullscreen' | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const lastFsMousePosRef = useRef({ x: 0, y: 0 });
  /** 持续追踪鼠标在画布坐标中的位置，供快捷键新建节点时定位 */
  const canvasMouseRef = useRef({ x: 0, y: 0 });
  /** 记录最近一次新建节点的画布坐标，用于错开叠加 */
  const lastCreatedNodePosRef = useRef({ x: -9999, y: -9999, stagger: 0 });
  const edgeDraggingRef = useRef<{ edgeId: string, x: number, y: number, nearStart: boolean, nearEnd: boolean } | null>(null);
  
  // 节点拖拽优化：使用 ref 累积位置，只在动画帧中更新（支持多选）
  const nodeDragAccumRef = useRef<{ nodeIds: string[], deltaX: number, deltaY: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // 视口信息 ref（用于离屏节点虚拟化）
  const canvasViewportRef = useRef({ x: 0, y: 0, width: 0, height: 0, scale: 1 });

  /** Alt + 拖拽：超过阈值后复制选中节点；与复制集相连的边（含外部入边/出边）一并映射到新节点 */
  const altDupPendingRef = useRef(false);
  const altDupDoneRef = useRef(false);
  const altDupClickNodeIdRef = useRef<string | null>(null);
  const altDragScreenAccumRef = useRef({ x: 0, y: 0 });
  const duplicateNodesSubgraphForAltDragRef = useRef<() => void>(() => {});

  useEffect(() => { draftEdgeRef.current = draftEdge; }, [draftEdge]);
  useEffect(() => { draggingEdgeIdRef.current = draggingEdgeId; }, [draggingEdgeId]);
  
  // selectedIds ref 用于事件处理中获取最新值
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  duplicateNodesSubgraphForAltDragRef.current = () => {
    const primaryId = draggingNodeIdRef.current;
    if (!primaryId) return;
    const sel = selectedIdsRef.current;
    const ids = sel.includes(primaryId) ? [...sel] : [primaryId];
    const idSet = new Set(ids);
    const snapNodes = nodesRef.current;
    const snapEdges = edgesRef.current;
    let n = 0;
    const genId = (prefix: string) => {
      // 直接使用 crypto.randomUUID() 保证全局唯一性，每次调用都生成新 UUID
      const timestamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const uuidPart = typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
        ? globalThis.crypto.randomUUID()
        : `fallback-${timestamp}-${n++}`;
      return `${prefix}-${uuidPart}`;
    };
    const idMap = new Map<string, string>();
    for (const oid of ids) {
      const srcNode = snapNodes.find((x) => x.id === oid);
      idMap.set(oid, genId(srcNode?.type || 'node'));
    }
    const newNodes: CanvasNode[] = [];
    for (const oid of ids) {
      const src = snapNodes.find((x) => x.id === oid);
      if (!src) continue;
      const cloned = structuredClone(src) as CanvasNode;
      cloned.id = idMap.get(oid)!;
      if (cloned.type === 'chat' && cloned.messages?.length) {
        cloned.messages = cloned.messages.map((m) => ({ ...m, id: genId('msg') }));
      }
      if (cloned.type === 'annotation' && cloned.annotations?.length) {
        cloned.annotations = cloned.annotations.map((a) => ({ ...a, id: genId('ann') }));
      }
      if (cloned.type === 'director3d' && cloned.figures?.length) {
        const figMap = new Map<string, string>();
        cloned.figures = cloned.figures.map((f) => {
          const nid = genId('figure');
          figMap.set(f.id, nid);
          return { ...f, id: nid };
        });
        if (cloned.selectedFigureId && figMap.has(cloned.selectedFigureId)) {
          cloned.selectedFigureId = figMap.get(cloned.selectedFigureId)!;
        }
      }
      newNodes.push(cloned);
    }
    const newEdges: Edge[] = [];
    const edgeDupKey = (s: string, t: string) => `${s}->${t}`;
    const seenEdge = new Set<string>();
    for (const e of snapEdges) {
      const sIn = idSet.has(e.sourceId);
      const tIn = idSet.has(e.targetId);
      if (!sIn && !tIn) continue;
      let newS: string;
      let newT: string;
      if (sIn && tIn) {
        newS = idMap.get(e.sourceId)!;
        newT = idMap.get(e.targetId)!;
      } else if (!sIn && tIn) {
        newS = e.sourceId;
        newT = idMap.get(e.targetId)!;
      } else {
        newS = idMap.get(e.sourceId)!;
        newT = e.targetId;
      }
      if (newS === newT) continue;
      const k = edgeDupKey(newS, newT);
      if (seenEdge.has(k)) continue;
      seenEdge.add(k);
      newEdges.push({ id: genId('edge'), sourceId: newS, targetId: newT });
    }
    const newSel = ids.map((oid) => idMap.get(oid)!).filter(Boolean);
    const primaryNew = idMap.get(primaryId);
    if (!primaryNew) return;
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    selectedIdsRef.current = newSel;
    setSelectedIds(newSel);
    draggingNodeIdRef.current = primaryNew;
    setDraggingNodeId(primaryNew);
  };

  const layoutKey = useMemo(() => nodeLayoutKey(nodes), [nodes]);
  const edgesKey = useMemo(
    () => edges.map((e) => `${e.sourceId}->${e.targetId}`).join('|'),
    [edges]
  );

  const buildCanvasHistorySignature = useCallback((snapshot: CanvasHistoryEntry) => {
    return JSON.stringify({
      nodes: snapshot.nodes.map(n => ({
        id: n.id,
        type: n.type,
        x: Math.round(n.x),
        y: Math.round(n.y),
        width: Math.round(n.width),
        height: Math.round(n.height),
        prompt: n.prompt || '',
        imageCount: n.images?.length || 0,
        videoCount: n.videos?.length || 0,
        inputImagesCount: (n as any).inputImages?.length || 0,
        outputImagesCount: (n as any).outputImages?.length || 0,
        currentImageIndex: n.currentImageIndex || 0,
        currentVideoIndex: n.currentVideoIndex || 0,
      })),
      edges: snapshot.edges.map(e => `${e.sourceId}->${e.targetId}`),
    });
  }, []);

  const pushCanvasHistorySnapshot = useCallback((snapshot: CanvasHistoryEntry) => {
    const signature = buildCanvasHistorySignature(snapshot);
    if (signature === lastCanvasHistorySignatureRef.current) return;
    const payloadChars = estimateCanvasBase64PayloadChars(snapshot.nodes);
    const historyEmpty = canvasHistoryRef.current.length === 0;
    if (!historyEmpty && payloadChars > CANVAS_HISTORY_SKIP_PAYLOAD_CHARS) {
      lastCanvasHistorySignatureRef.current = signature;
      setCanvasHistoryNotice('画布图片数据过大，本步撤销已跳过。建议导出 ZIP 备份或拆分项目。');
      console.warn(
        '[canvas] 当前画布图片数据过大，已跳过本步撤销记录以降低崩溃风险（建议拆分项目或导出备份）。'
      );
      return;
    }
    const maxSteps = canvasHistoryMaxSteps(payloadChars);
    let historyBefore = canvasHistoryRef.current.slice(0, canvasHistoryIndexRef.current + 1);
    if (historyBefore.length > maxSteps - 1) {
      historyBefore = historyBefore.slice(historyBefore.length - (maxSteps - 1));
    }
    let cloned: CanvasHistoryEntry;
    try {
      cloned = structuredClone(snapshot);
    } catch (e) {
      console.warn('[canvas] 撤销快照克隆失败，尝试剥离图片数据后重试', e);
      // 剥离所有图片 base64 后重试，大幅降低内存占用
      const strippedSnapshot: CanvasHistoryEntry = {
        nodes: stripImagesFromNodes(snapshot.nodes),
        edges: snapshot.edges,
        selectedIds: snapshot.selectedIds,
      };
      try {
        cloned = structuredClone(strippedSnapshot);
      } catch (e2) {
        console.warn('[canvas] 剥离图片后仍失败，已跳过本次撤销记录', e2);
        lastCanvasHistorySignatureRef.current = signature;
        return;
      }
    }
    const merged = [...historyBefore, cloned];
    const cappedHistory = merged.length > maxSteps ? merged.slice(merged.length - maxSteps) : merged;
    canvasHistoryRef.current = cappedHistory;
    canvasHistoryIndexRef.current = cappedHistory.length - 1;
    lastCanvasHistorySignatureRef.current = signature;
  }, [buildCanvasHistorySignature]);

  const pushCanvasCommand = useCallback((cmd: CanvasCommand) => {
    if (isApplyingCanvasHistoryRef.current) return;
    const stack = canvasCommandStackRef.current;
    stack.push(cmd);
    if (stack.length > CANVAS_COMMAND_STACK_MAX) {
      stack.splice(0, stack.length - CANVAS_COMMAND_STACK_MAX);
    }
  }, []);
  const pushCanvasCommandRef = useRef(pushCanvasCommand);
  pushCanvasCommandRef.current = pushCanvasCommand;

  const flushCanvasHistoryImmediate = useCallback((partial?: { nodes?: CanvasNode[]; edges?: Edge[] }) => {
    pushCanvasHistorySnapshot({
      nodes: partial?.nodes ?? nodesRef.current,
      edges: partial?.edges ?? edgesRef.current,
      selectedIds: selectedIdsRef.current,
    });
  }, [pushCanvasHistorySnapshot]);
  const flushCanvasHistoryImmediateRef = useRef(flushCanvasHistoryImmediate);
  flushCanvasHistoryImmediateRef.current = flushCanvasHistoryImmediate;

  const undoCanvasState = useCallback(() => {
    const stack = canvasCommandStackRef.current;
    if (stack.length > 0) {
      const cmd = stack.pop()!;
      isApplyingCanvasHistoryRef.current = true;
      reverseCanvasCommand(cmd, setNodes, setEdges);
      queueMicrotask(() => {
        isApplyingCanvasHistoryRef.current = false;
      });
      return;
    }
    if (canvasHistoryIndexRef.current <= 0) return;
    const prevIndex = canvasHistoryIndexRef.current - 1;
    const snapshot = canvasHistoryRef.current[prevIndex];
    if (!snapshot) return;
    let nodesN: CanvasNode[];
    let edgesN: Edge[];
    let selN: string[];
    try {
      nodesN = mergeHistoryNodesWithCurrentImages(structuredClone(snapshot.nodes), nodesRef.current);
      edgesN = structuredClone(snapshot.edges);
      selN = structuredClone(snapshot.selectedIds);
    } catch (e) {
      console.warn('[canvas] 撤销还原克隆失败', e);
      alert('撤销失败：内存不足，请刷新页面后从最近保存的项目恢复。');
      return;
    }
    isApplyingCanvasHistoryRef.current = true;
    canvasHistoryIndexRef.current = prevIndex;
    lastCanvasHistorySignatureRef.current = buildCanvasHistorySignature(snapshot);
    setNodes(nodesN);
    setEdges(edgesN);
    setSelectedIds(selN);
    window.setTimeout(() => {
      isApplyingCanvasHistoryRef.current = false;
    }, 0);
  }, [buildCanvasHistorySignature]);

  useEffect(() => {
    if (isApplyingCanvasHistoryRef.current) return;
    const snapshot: CanvasHistoryEntry = { nodes, edges, selectedIds };
    if (!historyInitializedRef.current) {
      pushCanvasHistorySnapshot(snapshot);
      if (canvasHistoryRef.current.length > 0) {
        historyInitializedRef.current = true;
      } else {
        historyInitializedRef.current = true;
        if (!canvasHistoryOversizedWarnedRef.current) {
          canvasHistoryOversizedWarnedRef.current = true;
          setCanvasHistoryNotice('画布过大，无法建立撤销栈（Ctrl+Z 不可用）。建议导出 ZIP 或拆分项目。');
          console.warn('[canvas] 画布图片数据过大，无法建立撤销栈（Ctrl+Z 不可用）；建议拆分项目或导出后再编辑。');
        }
      }
      lastStructuralHistoryKeyRef.current = buildStructuralHistoryKey(nodes, layoutKey, edgesKey);
      lastPromptHistoryKeyRef.current = buildPromptHistoryKey(nodes);
      return;
    }
    const structuralKey = buildStructuralHistoryKey(nodes, layoutKey, edgesKey);
    const promptKey = buildPromptHistoryKey(nodes);
    const structuralChanged = structuralKey !== lastStructuralHistoryKeyRef.current;
    const promptChanged = promptKey !== lastPromptHistoryKeyRef.current;
    if (!structuralChanged && !promptChanged) return;

    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    const delayMs = structuralChanged ? HISTORY_DEBOUNCE_STRUCTURAL_MS : HISTORY_DEBOUNCE_PROMPT_MS;
    historyDebounceTimerRef.current = window.setTimeout(() => {
      pushCanvasHistorySnapshot(snapshot);
      lastStructuralHistoryKeyRef.current = structuralKey;
      lastPromptHistoryKeyRef.current = promptKey;
    }, delayMs);
    return () => {
      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current);
        historyDebounceTimerRef.current = null;
      }
    };
  }, [nodes, edges, layoutKey, edgesKey, pushCanvasHistorySnapshot]);

  const canReceiveConnection = useCallback((node: CanvasNode) => INPUT_NODE_TYPES.includes(node.type), []);
  const canConnectNodes = useCallback((source: CanvasNode, target: CanvasNode) => {
    if (source.id === target.id) return false;
    if (!canReceiveConnection(target)) return false;
    if (target.type === 'chat') {
      return (
        source.type === 'text' ||
        source.type === 'image' ||
        source.type === 't2i' ||
        source.type === 'i2i' ||
        source.type === 'video'
      );
    }
    return true;
  }, [canReceiveConnection]);

  const findConnectTargetNode = useCallback((mouseX: number, mouseY: number, sourceId: string) => {
    const sourceNode = nodesRef.current.find(n => n.id === sourceId);
    if (!sourceNode) return null;

    const scale = Math.max(transformRef.current.scale, 0.2);
    const portSnapRadius = 56 / scale; // 保持屏幕约 56px 的吸附手感
    const boxPadding = 20 / scale;

    let bestPortTarget: CanvasNode | null = null;
    let bestPortDistance = Number.POSITIVE_INFINITY;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (!canConnectNodes(sourceNode, n)) continue;
      const portX = n.x;
      const portY = n.y + n.height / 2;
      const dist = Math.hypot(mouseX - portX, mouseY - portY);
      if (dist <= portSnapRadius && dist < bestPortDistance) {
        bestPortDistance = dist;
        bestPortTarget = n;
      }
    }
    if (bestPortTarget) return bestPortTarget;

    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (!canConnectNodes(sourceNode, n)) continue;
      if (
        mouseX >= n.x - boxPadding &&
        mouseX <= n.x + n.width + boxPadding &&
        mouseY >= n.y - boxPadding &&
        mouseY <= n.y + n.height + boxPadding
      ) {
        return n;
      }
    }
    return null;
  }, [canConnectNodes]);

  // --- Global Pointer Events for Robust Dragging ---
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
    // 安全兜底：鼠标按键已释放但未收到 pointerup 时，强制清理拖拽状态
    if (e.buttons === 0 && activePointerTypeRef.current) {
      if (draggingNodeIdRef.current) {
        draggingNodeIdRef.current = null;
        setDraggingNodeId(null);
        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
        nodeDragAccumRef.current = null;
      }
      if (isSelectingRef.current) {
        if (boxSelectRafRef.current !== null) { cancelAnimationFrame(boxSelectRafRef.current); boxSelectRafRef.current = null; }
        isSelectingRef.current = false;
        setIsSelecting(false);
        selectionBoxRef.current = null;
        setSelectionBox(null);
        pressStartPosRef.current = null;
      }
      activePointerTypeRef.current = null;
      return;
    }

    const pointerType = activePointerTypeRef.current;

    // 始终追踪鼠标在画布坐标中的位置（供快捷键/右键菜单创建节点定位）
    if (containerRef.current && containerRef.current.offsetWidth > 0) {
      const r = containerRef.current.getBoundingClientRect();
      const tf = transformRef.current;
      canvasMouseRef.current = {
        x: (e.clientX - r.left - tf.x) / Math.max(tf.scale, 0.1),
        y: (e.clientY - r.top - tf.y) / Math.max(tf.scale, 0.1),
      };
    }

    if (pointerType === 'canvas') {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (pointerType === 'node') {
      const ddx = e.clientX - lastMousePosRef.current.x;
      const ddy = e.clientY - lastMousePosRef.current.y;
      const dx = ddx / transformRef.current.scale;
      const dy = ddy / transformRef.current.scale;

      if (altDupPendingRef.current && !altDupDoneRef.current) {
        altDragScreenAccumRef.current.x += ddx;
        altDragScreenAccumRef.current.y += ddy;
        if (Math.hypot(altDragScreenAccumRef.current.x, altDragScreenAccumRef.current.y) > 6) {
          duplicateNodesSubgraphForAltDragRef.current();
          const adx = altDragScreenAccumRef.current.x / transformRef.current.scale;
          const ady = altDragScreenAccumRef.current.y / transformRef.current.scale;
          const moved = selectedIdsRef.current;
          setNodes((prev) =>
            prev.map((n) => (moved.includes(n.id) ? { ...n, x: n.x + adx, y: n.y + ady } : n))
          );
          altDupDoneRef.current = true;
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // 获取当前选中的节点ID列表（用于多选拖拽）
      const currentSelectedIds = selectedIdsRef.current;
      
      // 累积移动量（支持多选）
      if (nodeDragAccumRef.current) {
        nodeDragAccumRef.current.deltaX += dx;
        nodeDragAccumRef.current.deltaY += dy;
      } else {
        // 以当前拖拽的节点为基准，同时移动所有选中的节点
        const nodeIdsToMove = currentSelectedIds.length > 0 ? currentSelectedIds : (draggingNodeIdRef.current ? [draggingNodeIdRef.current] : []);
        nodeDragAccumRef.current = { nodeIds: nodeIdsToMove, deltaX: dx, deltaY: dy };
      }
      
      // 使用 RAF 批量更新位置
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          if (nodeDragAccumRef.current && (nodeDragAccumRef.current.deltaX !== 0 || nodeDragAccumRef.current.deltaY !== 0)) {
            const { nodeIds, deltaX, deltaY } = nodeDragAccumRef.current;
            setNodes(prev => prev.map(node =>
              nodeIds.includes(node.id)
                ? { ...node, x: node.x + deltaX, y: node.y + deltaY }
                : node
            ));
            nodeDragAccumRef.current = { nodeIds, deltaX: 0, deltaY: 0 };
          }
          rafIdRef.current = null;
        });
      }
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (pointerType === 'edge') {
      const rect = containerRef.current!.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale;
      const mouseY = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale;

      // 更新连线草稿
      if (draftEdgeRef.current) {
        setDraftEdge(prev => prev ? { ...prev, x: mouseX, y: mouseY } : null);
      }

      let snappedX = mouseX;
      let snappedY = mouseY;
      if (draftEdgeRef.current?.sourceId) {
        const targetNode = findConnectTargetNode(mouseX, mouseY, draftEdgeRef.current.sourceId);
        if (targetNode) {
          snappedX = targetNode.x;
          snappedY = targetNode.y + targetNode.height / 2;
        }
      }
      
      if (draftEdgeRef.current) {
        draftEdgeRef.current = { ...draftEdgeRef.current, x: snappedX, y: snappedY };
        setDraftEdge({ ...draftEdgeRef.current });
      }
    } else if (pointerType === 'fullscreen') {
      const dx = e.clientX - lastFsMousePosRef.current.x;
      const dy = e.clientY - lastFsMousePosRef.current.y;
      setFsTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastFsMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (pointerType === 'resize') {
      const sess = nodeResizeSessionRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (sess && rect) {
        const scale = Math.max(transformRef.current.scale, 0.1);
        const px = (e.clientX - rect.left - transformRef.current.x) / scale;
        const py = (e.clientY - rect.top - transformRef.current.y) / scale;
        const next = computeNodeResizeFromPointer(
          sess.origin,
          sess.direction,
          px,
          py,
          sess.grabCanvasX,
          sess.grabCanvasY,
          e.shiftKey,
          sess.minWidth,
          sess.minHeight
        );
        const id = sess.nodeId;
        setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...next } : n)));
      }
    }
  };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      const pointerType = activePointerTypeRef.current;
      activePointerTypeRef.current = null;

      // 清除长按计时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (pointerType === 'node') {
        const subtractId = altDupClickNodeIdRef.current;
        if (altDupPendingRef.current && !altDupDoneRef.current && subtractId) {
          setSelectedIds((prev) => prev.filter((sid) => sid !== subtractId));
        }
        altDupPendingRef.current = false;
        altDupDoneRef.current = false;
        altDupClickNodeIdRef.current = null;
        altDragScreenAccumRef.current = { x: 0, y: 0 };

        draggingNodeIdRef.current = null;
        setDraggingNodeId(null);
        // 结束拖拽时必须取消 RAF 并刷掉剩余累积位移，否则下一帧仍会移动节点（紧接着拖缩放柄时会突然错位一跳）
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        const acc = nodeDragAccumRef.current;
        const dragStartMap = nodeDragHistoryStartRef.current;
        nodeDragHistoryStartRef.current = null;
        if (acc && (acc.deltaX !== 0 || acc.deltaY !== 0)) {
          const { nodeIds, deltaX, deltaY } = acc;
          const workingNodes = nodesRef.current.map((node) =>
            nodeIds.includes(node.id) ? { ...node, x: node.x + deltaX, y: node.y + deltaY } : node
          );
          setNodes(workingNodes);
          if (dragStartMap) {
            const cmd = buildMoveNodesCommand(dragStartMap, workingNodes);
            if (cmd) pushCanvasCommandRef.current(cmd);
          }
        }
        nodeDragAccumRef.current = null;
      }

      // 清理缩放状态
      if (pointerType === 'resize') {
        nodeResizeSessionRef.current = null;
        setResizingNodeId(null);
        resizingNodeIdRef.current = null;
        setResizeDirection('');
        resizeDirectionRef.current = '';
        setIsResizing(false);
      }

      // 处理框选结束（使用 ref 避免闭包过期）
      const selBox = selectionBoxRef.current;
      const selActive = isSelectingRef.current;
      if ((pointerType === 'boxSelect' || pointerType === 'selection') && selActive && selBox) {
        const box = selBox;
        // 找出所有与选框相交的节点
        const selectedNodes = nodesRef.current.filter(node => {
          const nodeRight = node.x + node.width;
          const nodeBottom = node.y + node.height;
          const boxRight = box.x + box.width;
          const boxBottom = box.y + box.height;

          return !(node.x > boxRight || nodeRight < box.x || node.y > boxBottom || nodeBottom < box.y);
        });

        if (selectedNodes.length > 0) {
          setSelectedIds(selectedNodes.map(n => n.id));
        }

        setIsSelecting(false); isSelectingRef.current = false;
        if (boxSelectRafRef.current !== null) { cancelAnimationFrame(boxSelectRafRef.current); boxSelectRafRef.current = null; }
        setSelectionBox(null); selectionBoxRef.current = null;
        pressStartPosRef.current = null;
      } else if (pointerType === 'edge' && draftEdgeRef.current) {
        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale;
        const mouseY = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale;

        const targetNode = findConnectTargetNode(mouseX, mouseY, draftEdgeRef.current.sourceId);

        if (targetNode) {
          const sourceId = draftEdgeRef.current.sourceId;
          const targetId = targetNode.id;
          const exists = edgesRef.current.some(edge => edge.sourceId === sourceId && edge.targetId === targetId);
          // 只有在 sourceId 不为空时才创建连线（框选模式 sourceId 为空）
          if (!exists && sourceId) {
            const newEdge: Edge = { id: `edge-${Date.now()}`, sourceId, targetId };
            setEdges((prev) => {
              const next = [...prev, newEdge];
              queueMicrotask(() => pushCanvasCommandRef.current({ type: 'addEdge', edge: newEdge }));
              return next;
            });
          }
        } else {
          // 没有连接到任何节点时，自动弹出右键菜单
          const rect = containerRef.current!.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale;
          const canvasY = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale;
          // 保存源节点 ID，用于创建新节点后自动连线
          setPendingEdgeSourceId(draftEdgeRef.current?.sourceId || null);
          setContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
        }
        setDraftEdge(null);
        draftEdgeRef.current = null;
      }
    };

    // 连线拖拽事件处理
    const handleEdgeDrag = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      edgeDraggingRef.current = detail;
      setDraggingEdgeId(detail.edgeId);
    };

    const handleEdgeDragEnd = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const drag = edgeDraggingRef.current;
      if (drag && drag.edgeId === detail.edgeId) {
        // 检查是否拖拽远离了节点
        const edge = edgesRef.current.find(ed => ed.id === drag.edgeId);
        if (edge) {
          const source = nodesRef.current.find(n => n.id === edge.sourceId);
          const target = nodesRef.current.find(n => n.id === edge.targetId);
          if (source && target) {
            const targetPortX = target.x;
            const targetPortY = target.y + target.height / 2;
            const sourcePortX = source.x + source.width;
            const sourcePortY = source.y + source.height / 2;

            const distFromTarget = Math.hypot(drag.x - targetPortX, drag.y - targetPortY);
            const distFromSource = Math.hypot(drag.x - sourcePortX, drag.y - sourcePortY);

            // 如果拖拽远离了目标节点，删除连线
            if (distFromTarget > 80) {
              setEdges((prev) => {
                const edgeToDelete = prev.find((ed) => ed.id === drag.edgeId);
                if (!edgeToDelete) return prev;
                const next = prev.filter((ed) => ed.id !== drag.edgeId);
                queueMicrotask(() =>
                  pushCanvasCommandRef.current({ type: 'deleteEdge', edge: edgeToDelete })
                );
                return next;
              });
            }
          }
        }
        edgeDraggingRef.current = null;
        setDraggingEdgeId(null);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('edge-drag', handleEdgeDrag);
    window.addEventListener('edge-drag-end', handleEdgeDragEnd);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('edge-drag', handleEdgeDrag);
      window.removeEventListener('edge-drag-end', handleEdgeDragEnd);
    };
  }, []);

  const createImageNodesFromBase64List = useCallback((base64List: string[]) => {
    const list = base64List.filter((b) => b && b.length > 80);
    if (list.length === 0) return;
    const mp = canvasMouseRef.current;
    const startX = mp.x - SPAWNED_IMAGE_NODE_WIDTH / 2;
    const startY = mp.y - SPAWNED_IMAGE_NODE_HEIGHT / 2;
    const newNodes = buildSpacedImageNodesFromLists(list, startX, startY);
    if (newNodes.length === 0) return;
    setNodes((prev) => [...prev, ...newNodes]);
    setSelectedIds(newNodes.map((n) => n.id));
  }, []);

  const createImageNodeFromBase64 = useCallback(
    (base64: string) => {
      createImageNodesFromBase64List([base64]);
    },
    [createImageNodesFromBase64List]
  );

  /** 重置视口到画布中心，缩放比例为 20% */
  const resetViewportToCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 8 || rect.height < 8) return;
    const newScale = DEFAULT_CANVAS_VIEW_SCALE;
    // 将画布中心 (0, 0) 移动到视口中心
    const newX = rect.width / 2;
    const newY = rect.height / 2;
    setTransform({ x: newX, y: newY, scale: newScale });
  }, []);

  /** 缩放并平移视口，使当前选中节点的外接矩形尽量占满画布区域（无选中时重置到中心） */
  const fitViewportToSelectedNodes = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 8 || rect.height < 8) return;
    const pad = 48;
    const availW = Math.max(40, rect.width - pad * 2);
    const availH = Math.max(40, rect.height - pad * 2);
    const selIds = selectedIdsRef.current;
    if (selIds.length === 0) {
      // 无选中时重置到画布中心，缩放 20%
      resetViewportToCenter();
      return;
    }
    const list = nodesRef.current.filter((n) => selIds.includes(n.id));
    if (list.length === 0) {
      resetViewportToCenter();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of list) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    // 有选中时强制缩放 50%，以选中节点为中心
    const newScale = 0.5;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const newX = rect.width / 2 - cx * newScale;
    const newY = rect.height / 2 - cy * newScale;
    setTransform({ x: newX, y: newY, scale: newScale });
  }, [resetViewportToCenter]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT';
      const isContentEditable = (e.target as HTMLElement).isContentEditable;

      // 看图模式下：仅支持空格平移（其他快捷键在 AuditModeCanvas 内部处理）
      if (canvasMode === 'audit') {
        // 看图模式下 Ctrl+C 需要 preventDefault 以避免浏览器默认复制文本行为干扰
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
          e.preventDefault();
        }
        if (e.code === 'Space' && !isInput) {
          e.preventDefault();
          setActiveTool('pan');
        }
        return;
      }

      const shortcutCreatesNode =
        !isInput &&
        !isContentEditable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey;

      const placeNewNodeAtMouse = (type: NodeType) => {
        const defaultSize = DEFAULT_NODE_SIZES[type] || { width: 420, height: 300 };
        const mp = canvasMouseRef.current;
        const canvasX = mp.x - defaultSize.width / 2;
        const canvasY = mp.y - defaultSize.height / 2;
        addNodeAtCanvasPositionRef.current(type, canvasX, canvasY);
      };

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        setActiveTool('pan');
      } else if (e.code === 'KeyV' && !isInput && !e.ctrlKey && !e.metaKey) {
        setActiveTool('select');
      } else if (e.code === 'KeyB' && !isInput && !isContentEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setActiveTool('boxSelect');
      } else if (e.code === 'KeyG' && !isInput && !isContentEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        selectedIds.forEach(id => handleResetNodeSize(id));
      } else if (e.code === 'KeyQ' && shortcutCreatesNode) {
        e.preventDefault();
        placeNewNodeAtMouse('chat');
      } else if (e.code === 'KeyW' && shortcutCreatesNode) {
        e.preventDefault();
        placeNewNodeAtMouse('t2i');
      } else if (e.code === 'KeyE' && shortcutCreatesNode) {
        e.preventDefault();
        placeNewNodeAtMouse('i2i');
      } else if (e.code === 'KeyR' && shortcutCreatesNode) {
        e.preventDefault();
        placeNewNodeAtMouse('text');
      } else if (e.code === 'KeyT' && shortcutCreatesNode) {
        e.preventDefault();
        placeNewNodeAtMouse('video');
      } else if (
        e.code === 'KeyX' &&
        !isInput &&
        !(e.target as HTMLElement).isContentEditable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const sel = selectedIdsRef.current;
        if (sel.length === 0) {
          setEyedropperTargetNodeId(null);
          return;
        }
        const id = sel[0];
        setEyedropperTargetNodeId((prev) => (prev === id ? null : id));
      } else if (
        e.code === 'KeyC' &&
        !isInput &&
        !isContentEditable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !fullscreenImage
      ) {
        e.preventDefault();
        const sid = selectedIdsRef.current[0];
        if (!sid) return;
        const node = nodes.find(n => n.id === sid);
        if (!node) return;
        const idx = node.currentImageIndex ?? 0;
        const payload = cloneImageSlotForNewNode(node.images?.[idx], node.imageAssetIds?.[idx]);
        if (!payload) return;
        const mp = canvasMouseRef.current;
        const newNode: CanvasNode = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: mp.x,
          y: mp.y,
          width: 720,
          height: 792,
          ...payload,
          currentImageIndex: 0,
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedIds([newNode.id]);
      } else if (e.code === 'Escape') {
        if (showShortcutsPanel) {
          setShowShortcutsPanel(false);
          return;
        }
        // 清理所有拖拽/框选/缩放状态
        if (draggingNodeIdRef.current) {
          draggingNodeIdRef.current = null;
          setDraggingNodeId(null);
          if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
          nodeDragAccumRef.current = null;
        }
        if (isSelectingRef.current) {
          if (boxSelectRafRef.current !== null) { cancelAnimationFrame(boxSelectRafRef.current); boxSelectRafRef.current = null; }
          isSelectingRef.current = false;
          setIsSelecting(false);
          selectionBoxRef.current = null;
          setSelectionBox(null);
          pressStartPosRef.current = null;
        }
        if (resizingNodeIdRef.current) {
          resizingNodeIdRef.current = null;
          setResizingNodeId(null);
          setIsResizing(false);
          nodeResizeSessionRef.current = null;
        }
        activePointerTypeRef.current = null;
        setSelectedIds([]);
        setContextMenu(null);
        setDraftEdge(null);
        setFullscreenImage(null);
        setEyedropperTargetNodeId(null);
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && !isInput && !fullscreenImage) {
        selectedIdsRef.current.forEach(id => handleDeleteNode(id));
      } else if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.code === 'KeyQ' &&
        !isInput &&
        !isContentEditable &&
        !fullscreenImage
      ) {
        e.preventDefault();
        const sel = selectedIdsRef.current;
        if (sel.length === 0) return;
        sel.forEach((id) => handleDeleteNode(id));
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !isInput) {
        // 节点内 textarea 或消息气泡内选中文本时，交给浏览器默认复制
        const sel = window.getSelection();
        const activeTextarea = document.activeElement?.closest?.('textarea');
        // 消息气泡内（chat-bubble-wrap）选中文字时允许浏览器默认复制
        const selAnchor = sel?.anchorNode;
        const activeChatBubble = selAnchor ? !!selAnchor.parentElement?.closest?.('.chat-bubble-wrap') : false;
        if ((activeTextarea || activeChatBubble) && sel && sel.toString().length > 0) return;
        // 阻止浏览器默认复制行为（如复制选中文本）
        e.preventDefault();
        // 画布模式下复制选中节点
        if (selectedIdsRef.current.length > 0) {
          const nodesList = selectedIdsRef.current.map(id => nodes.find(n => n.id === id)).filter(Boolean) as CanvasNode[];
          if (nodesList.length > 0) {
            // 只取第一个作为内部 clipboard（节点复制）
            setClipboard(nodesList[0]);
            // 如果有图片节点，写入图片到系统剪贴板 + 共享剪贴板
            const imgNode = nodesList.find((n) => {
              const i = n.currentImageIndex ?? 0;
              return hasCanvasImagePayload(n.images?.[i], n.imageAssetIds?.[i]);
            });
            if (imgNode) {
              const slotIdx = imgNode.currentImageIndex ?? 0;
              void resolveCanvasImageSource(
                imgNode.images?.[slotIdx],
                imgNode.imageAssetIds?.[slotIdx]
              ).then((fullSrc) => {
                if (!fullSrc) return;
                const rawSrc = fullSrc;
                const base64 = rawSrc.includes(',') ? rawSrc.split(',')[1] : rawSrc.startsWith('data:') ? '' : rawSrc;
                const imgEl = new Image();
                imgEl.onload = () => {
                  const imgWidth = imgEl.naturalWidth || 512;
                  const imgHeight = imgEl.naturalHeight || 512;
                  if (base64) {
                    sharedClipboardImageRef.current = {
                      id: `shared-copy-${Date.now()}`,
                      base64,
                      x: 0, y: 0,
                      width: imgWidth,
                      height: imgHeight,
                      scale: 1,
                    };
                  }
                  const canvas = document.createElement('canvas');
                  canvas.width = imgWidth;
                  canvas.height = imgHeight;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(async (blob) => {
                      if (blob) {
                        try {
                          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                        } catch (_) {}
                      }
                    }, 'image/png');
                  }
                };
                imgEl.onerror = () => {
                  const fallbackW = imgNode.width || 512;
                  const fallbackH = imgNode.height || 512;
                  if (base64) {
                    sharedClipboardImageRef.current = {
                      id: `shared-copy-${Date.now()}`,
                      base64,
                      x: 0, y: 0,
                      width: fallbackW,
                      height: fallbackH,
                      scale: 1,
                    };
                  }
                };
                imgEl.src = rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || rawSrc.startsWith('http')
                  ? rawSrc
                  : `data:image/png;base64,${rawSrc}`;
              });
            }
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !isInput) {
        e.preventDefault();
        // 统一从系统剪贴板读取（内部/外部复制都写入了系统剪贴板，确保最新内容优先）
        const now = Date.now();
        lastPasteTimeRef.current = now;
        if (typeof navigator?.clipboard?.read === 'function') {
          navigator.clipboard.read().then(clipboardItems => {
            if (lastPasteTimeRef.current !== now) return;
            const imageClipboardItems = clipboardItems.filter((item) =>
              item.types.some((t) => t.startsWith('image/'))
            );
            if (imageClipboardItems.length === 0) {
              fallbackSharedClipboard();
              return;
            }
            Promise.all(
              imageClipboardItems.map(async (item) => {
                const targetType = item.types.find((t) => t.startsWith('image/')) || 'image/png';
                return item.getType(targetType);
              })
            )
              .then((blobs) => readBlobsAsBase64(blobs))
              .then((base64List) => {
                if (lastPasteTimeRef.current !== now) return;
                createImageNodesFromBase64List(base64List);
              })
              .catch(() => fallbackSharedClipboard());
          }).catch(() => fallbackSharedClipboard());
        } else {
          fallbackSharedClipboard();
        }

        function fallbackSharedClipboard() {
          if (lastPasteTimeRef.current !== now) return;
          if (sharedClipboardImageRef.current) {
            const img = sharedClipboardImageRef.current;
            const mp = canvasMouseRef.current;
            const newNode: CanvasNode = {
              id: `image-${Date.now()}`,
              type: 'image',
              x: mp.x - img.width / 2,
              y: mp.y - img.height / 2,
              width: img.width,
              height: img.height,
              prompt: '',
              images: [img.base64],
              viewMode: 'single',
              currentImageIndex: 0,
            };
            setNodes(prev => [...prev, newNode]);
            setSelectedIds([newNode.id]);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyS' && !isInput && !(e.target as HTMLElement).isContentEditable) {
        e.preventDefault();
        void handleSaveDraftJsonSaveAs();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !e.altKey && !isInput && !(e.target as HTMLElement).isContentEditable) {
        e.preventDefault();
        void saveCurrentProject();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ' && !isInput && !fullscreenImage) {
        e.preventDefault();
        undoCanvasState();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !isInput && !isContentEditable) {
        e.preventDefault();
        const all = nodesRef.current;
        if (all.length === 0) return;
        const ids = all.map((n) => n.id);
        selectedIdsRef.current = ids;
        setSelectedIds(ids);
      } else if (
        e.code === 'KeyF' &&
        !isInput &&
        !isContentEditable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !fullscreenImage &&
        !e.repeat
      ) {
        e.preventDefault();
        fitViewportToSelectedNodes();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.code === 'KeyL' &&
        !isInput &&
        !isContentEditable &&
        !fullscreenImage
      ) {
        e.preventDefault();
        autoLayoutFromSelection();
      }
    };

    /** 自动排列选中节点及其连接的上下游节点为从左到右的流程布局 */
    const autoLayoutFromSelection = () => {
      const sel = selectedIdsRef.current;
      if (sel.length === 0) return;
      const nx = nodesRef.current;
      const ex = edgesRef.current;
      const GAP_X = 280;
      const GAP_Y = 100;
      // 构建邻接表
      const outMap = new Map<string, string[]>(); // source -> targets
      const inMap = new Map<string, string[]>(); // target -> sources
      ex.forEach((e) => {
        if (!outMap.has(e.sourceId)) outMap.set(e.sourceId, []);
        outMap.get(e.sourceId)!.push(e.targetId);
        if (!inMap.has(e.targetId)) inMap.set(e.targetId, []);
        inMap.get(e.targetId)!.push(e.sourceId);
      });
      // BFS 分层：从选中节点向前（inMap）找上游层，向后（outMap）找下游层
      const levelMap = new Map<string, number>(); // nodeId -> level (negative = upstream, 0 = root, positive = downstream)
      const rootIds = sel.filter((id) => nx.some((n) => n.id === id));
      rootIds.forEach((id) => levelMap.set(id, 0));
      // 上游 BFS
      const upQueue = rootIds.map((id) => ({ id, level: 0 }));
      while (upQueue.length > 0) {
        const { id, level } = upQueue.shift()!;
        const sources = inMap.get(id) || [];
        sources.forEach((sid) => {
          if (!levelMap.has(sid)) { levelMap.set(sid, level - 1); upQueue.push({ id: sid, level: level - 1 }); }
        });
      }
      // 下游 BFS
      const downQueue = rootIds.map((id) => ({ id, level: 0 }));
      while (downQueue.length > 0) {
        const { id, level } = downQueue.shift()!;
        const targets = outMap.get(id) || [];
        targets.forEach((tid) => {
          if (!levelMap.has(tid)) { levelMap.set(tid, level + 1); downQueue.push({ id: tid, level: level + 1 }); }
        });
      }
      // 将孤立节点也纳入（放在同一层）
      nx.forEach((n) => { if (!levelMap.has(n.id)) levelMap.set(n.id, 0); });
      // 按层级分组
      const groups = new Map<number, CanvasNode[]>();
      levelMap.forEach((level, nodeId) => {
        const node = nx.find((n) => n.id === nodeId);
        if (!node) return;
        if (!groups.has(level)) groups.set(level, []);
        groups.get(level)!.push(node);
      });
      // 每层内部按 y 排序
      groups.forEach((g) => g.sort((a, b) => a.y - b.y));
      // 计算位置：root 层中心为原始选中节点位置
      const rootNode = nx.find((n) => n.id === rootIds[0]);
      const baseX = rootNode ? rootNode.x : 0;
      const baseY = rootNode ? rootNode.y : 0;
      const levelXs = new Map<number, number>();
      const minLevel = Math.min(...groups.keys());
      const maxLevel = Math.max(...groups.keys());
      const totalLevels = maxLevel - minLevel + 1;
      const totalWidth = totalLevels * (GAP_X + 300);
      const startX = baseX - (totalWidth / 2);
      for (let l = minLevel; l <= maxLevel; l++) {
        levelXs.set(l, startX + (l - minLevel) * GAP_X);
      }
      // 计算每层总高度
      const levelHeights = new Map<number, number>();
      groups.forEach((g, level) => {
        levelHeights.set(level, g.reduce((sum, n) => sum + n.height + GAP_Y, 0) - (g.length > 0 ? GAP_Y : 0));
      });
      const maxLevelHeight = Math.max(...levelHeights.values(), 100);
      // 生成新位置
      const updates = new Map<string, { x: number; y: number }>();
      groups.forEach((g, level) => {
        const x = levelXs.get(level)!;
        const totalH = levelHeights.get(level)!;
        let y = baseY - totalH / 2;
        g.forEach((node) => {
          updates.set(node.id, { x, y });
          y += node.height + GAP_Y;
        });
      });
      setNodes((prev) => prev.map((n) => updates.has(n.id) ? { ...n, ...updates.get(n.id)! } : n));
    };

    const handlePaste = (e: ClipboardEvent) => {
      // 防止 keydown 已处理过后的重复触发
      if (Date.now() - lastPasteTimeRef.current < 1000) return;

      // 看图模式下不处理粘贴（AuditModeCanvas 内部处理）
      if (canvasMode === 'audit') return;

      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (isInput) return;

      const imageFiles = collectImageFilesFromClipboardData(e.clipboardData?.items ?? null);
      if (imageFiles.length > 0) {
        e.preventDefault();
        void readFilesAsBase64(imageFiles)
          .then((base64List) => createImageNodesFromBase64List(base64List))
          .catch((err) => {
            console.error(err);
            alert('无法读取剪贴板中的图片。');
          });
        return;
      }

      // 优先从共享剪贴板粘贴（跨模式复制）
      if (sharedClipboardImageRef.current) {
        e.preventDefault();
        const img = sharedClipboardImageRef.current;
        const mp = canvasMouseRef.current;
        const newNode: CanvasNode = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: mp.x - img.width / 2,
          y: mp.y - img.height / 2,
          width: img.width,
          height: img.height,
          prompt: '',
          images: [img.base64],
          viewMode: 'single',
          currentImageIndex: 0
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedIds([newNode.id]);
        return;
      }

      // 非图片剪贴板时，回退为节点复制粘贴
      if (clipboard) {
        e.preventDefault();
        const mp = canvasMouseRef.current;
        const newNode: CanvasNode = {
          ...clipboard,
          id: `${clipboard.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          x: mp.x,
          y: mp.y,
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedIds([newNode.id]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT';
      if (e.code === 'Space' && !isInput) {
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('paste', handlePaste);
    };
  }, [
    selectedIds,
    nodes,
    clipboard,
    fullscreenImage,
    showShortcutsPanel,
    createImageNodeFromBase64,
    createImageNodesFromBase64List,
    undoCanvasState,
    saveCurrentProject,
    handleSaveDraftJsonSaveAs,
    fitViewportToSelectedNodes,
    canvasMode,
  ]);

  // --- Fullscreen Modal Handlers ---
  useEffect(() => {
    if (fullscreenImage) {
      setFsTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [fullscreenImage]);

  const handleFsWheel = useCallback((e: React.WheelEvent) => {
    if (e.cancelable) e.preventDefault();
    const zoomSensitivity = 0.002;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.05, fsTransform.scale * (1 + delta)), 10);
    setFsTransform(prev => ({ ...prev, scale: newScale }));
  }, [fsTransform.scale]);

  const handleFsPointerDown = useCallback((e: React.PointerEvent) => {
    activePointerTypeRef.current = 'fullscreen';
    lastFsMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // --- Canvas Interaction Handlers ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current || fullscreenImage) return;
    const target = e.target as HTMLElement;
    // 节点内部滚轮仅作用于节点自身，不触发画布缩放
    if (target.closest('[data-node-root="true"]')) {
      return;
    }
    if (e.cancelable) e.preventDefault();
    setContextMenu(null);

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.05, transform.scale * (1 + delta)), 5);

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleRatio = newScale / transform.scale;
    const newX = mouseX - (mouseX - transform.x) * scaleRatio;
    const newY = mouseY - (mouseY - transform.y) * scaleRatio;

    setTransform({ x: newX, y: newY, scale: newScale });
  }, [transform, fullscreenImage]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2 || fullscreenImage) return;
    // 节点内右键不弹出创建面板
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-root]')) return;
    setContextMenu(null);

    if (activeTool === 'pan' || e.button === 1) {
      activePointerTypeRef.current = 'canvas';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (activeTool === 'boxSelect') {
      // 框选工具：立即开始框选
      pressStartPosRef.current = { x: e.clientX, y: e.clientY };
      selectionModifiersRef.current = { ctrl: e.ctrlKey, alt: e.altKey };
      activePointerTypeRef.current = 'boxSelect';
      isSelectingRef.current = true;
      setIsSelecting(true);
      selectionBoxRef.current = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
      setSelectionBox({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
    } else if (activeTool === 'select') {
      const target = e.target as HTMLElement | SVGElement;
      const isCanvasClick = target.id === 'canvas-container' || target.id === 'svg-layer' || target.tagName === 'path';
      
      // 只有在没有按修饰键时才清空选择
      if (isCanvasClick && !e.ctrlKey && !e.altKey) {
        setSelectedIds([]);
      }

      // 开始长按计时，用于框选
      pressStartPosRef.current = { x: e.clientX, y: e.clientY };
      selectionModifiersRef.current = { ctrl: e.ctrlKey, alt: e.altKey };
      activePointerTypeRef.current = 'selectStart';

      longPressTimerRef.current = window.setTimeout(() => {
        // 长按触发框选
        activePointerTypeRef.current = 'selection';
        isSelectingRef.current = true;
        setIsSelecting(true);
        selectionBoxRef.current = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
        setSelectionBox({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
      }, 300);
    }
  }, [activeTool, fullscreenImage]);

  // 框选移动处理 - 直接操作 DOM 避免 React 渲染延迟
  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isSelectingRef.current || !pressStartPosRef.current) return;

    // 更新修饰键状态
    selectionModifiersRef.current = { ctrl: e.ctrlKey, alt: e.altKey };

    const startX = pressStartPosRef.current.x;
    const startY = pressStartPosRef.current.y;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const box = {
      x: Math.min(startX, startX + dx),
      y: Math.min(startY, startY + dy),
      width: Math.abs(dx),
      height: Math.abs(dy)
    };
    selectionBoxRef.current = box;

    // 直接操作 DOM 避免 React 渲染延迟
    if (selectionBoxDomRef.current) {
      const dom = selectionBoxDomRef.current;
      dom.style.left = box.x + 'px';
      dom.style.top = box.y + 'px';
      dom.style.width = box.width + 'px';
      dom.style.height = box.height + 'px';
    }
  }, []);

  // 处理画布上的指针释放（用于框选和节点缩放）
  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    const pointerType = activePointerTypeRef.current;

    // 清除长按计时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 处理节点缩放结束
    if (pointerType === 'resize') {
      nodeResizeSessionRef.current = null;
      setResizingNodeId(null);
      resizingNodeIdRef.current = null;
      setResizeDirection('');
      resizeDirectionRef.current = '';
      setIsResizing(false);
      return;
    }

    if ((pointerType === 'boxSelect' || pointerType === 'selection') && isSelectingRef.current && selectionBoxRef.current) {
      // 使用 selectionBoxRef.current
      const box = selectionBoxRef.current;
      if (!box || (box.width === 0 && box.height === 0)) {
        setIsSelecting(false);
        pressStartPosRef.current = null;
        activePointerTypeRef.current = null;
        return;
      }
      const rect = containerRef.current!.getBoundingClientRect();
      const scale = transformRef.current.scale;

      // 将屏幕坐标转换为画布坐标
      const boxX = (box.x - rect.left - transformRef.current.x) / scale;
      const boxY = (box.y - rect.top - transformRef.current.y) / scale;
      const boxWidth = box.width / scale;
      const boxHeight = box.height / scale;

      // 找出所有与选框相交的节点
      const selectedNodes = nodesRef.current.filter(node => {
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        const boxRight = boxX + boxWidth;
        const boxBottom = boxY + boxHeight;

        return !(node.x > boxRight || nodeRight < boxX || node.y > boxBottom || nodeBottom < boxY);
      });

      if (selectedNodes.length > 0) {
        const newIds = selectedNodes.map(n => n.id);
        const isCtrl = selectionModifiersRef.current.ctrl;
        const isAlt = selectionModifiersRef.current.alt;

        if (isCtrl) {
          // Ctrl: 加选
          setSelectedIds(prev => [...new Set([...prev, ...newIds])]);
        } else if (isAlt) {
          // Alt: 减选
          setSelectedIds(prev => prev.filter(id => !newIds.includes(id)));
        } else {
          // 默认: 替换选中
          setSelectedIds(newIds);
        }
      } else if (!selectionModifiersRef.current.ctrl && !selectionModifiersRef.current.alt) {
        // 没有选中任何节点且没有按修饰键，清空选择
        setSelectedIds([]);
      }

      // 清除 RAF
      if (boxSelectRafRef.current !== null) { cancelAnimationFrame(boxSelectRafRef.current); boxSelectRafRef.current = null; }
      setIsSelecting(false);
      pressStartPosRef.current = null;
      activePointerTypeRef.current = null;
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (fullscreenImage || canvasMode === 'audit') return;
    // 节点内右键不弹出创建面板
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-root]')) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
    const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
  }, [transform, fullscreenImage, canvasMode]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    if (fullscreenImage || canvasMode === 'audit') return;
    const target = e.target as HTMLElement;
    // 只响应画布空白区域双击，忽略节点/按钮/SVG等
    if (target.closest('[data-node-root]') || target.closest('button') || target.closest('svg') || target.closest('select') || target.closest('textarea') || target.closest('input')) return;
    if (target.id !== 'canvas-container' && target.id !== 'svg-layer' && !target.classList.contains('pointer-events-none')) {
      // 检查是否在节点区域外
      const hasNode = target.closest('[data-node-root]');
      if (hasNode) return;
    }
    const rect = containerRef.current!.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
    const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
  }, [transform, fullscreenImage]);

  const handleNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button === 2 || fullscreenImage) return;

    const targetEl = e.target as HTMLElement | null;
    /** 节点内表单控件：不应触发整块节点拖拽（否则调整下拉/输入时窗口会跟着「飞」） */
    const isInteractiveSurface =
      !!targetEl?.closest(
        'input, textarea, select, button, a, [role="button"], [role="slider"], [role="listbox"], [contenteditable="true"], [data-resize-handle], .text-node-content::-webkit-scrollbar'
      );

    /** 吸管模式：点击节点窗口任意非表单区域即可与「吸取目标」节点连线（与预览区点击行为一致） */
    const eyeT = eyedropperTargetNodeIdRef.current;
    // text 节点内容区域（textarea）在吸管模式下应可被点击拾取作为源节点
    const pickedNode = nodes.find(n => n.id === id);
    const isEyedropperPickable = eyeT && eyeT !== id && (pickedNode?.type === 'text' ? true : !isInteractiveSurface);
    if (isEyedropperPickable) {
      if (handleCanvasEyedropper(id, eyeT)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    
    // 如果正在拖拽其他节点，取消当前拖拽并切换到新节点
    if (activePointerTypeRef.current === 'node' && draggingNodeIdRef.current !== id) {
      // 取消之前的 RAF
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      nodeDragAccumRef.current = null;
      altDupPendingRef.current = false;
      altDupDoneRef.current = false;
      altDupClickNodeIdRef.current = null;
      altDragScreenAccumRef.current = { x: 0, y: 0 };
    }
    
    if (activeTool === 'select' || activeTool === 'boxSelect') {
      e.stopPropagation();

      const isAlreadySelected = selectedIdsRef.current.includes(id);

      const isPureAlt = e.altKey && !e.ctrlKey && !e.metaKey;
      if (!isPureAlt) {
        altDupPendingRef.current = false;
        altDupDoneRef.current = false;
        altDupClickNodeIdRef.current = null;
        altDragScreenAccumRef.current = { x: 0, y: 0 };
      }

      // Ctrl + 点击：加选/减选
      if (e.ctrlKey || e.metaKey) {
        if (isAlreadySelected) {
          setSelectedIds((prev) => prev.filter((sid) => sid !== id));
        } else {
          setSelectedIds((prev) => [...prev, id]);
        }
      } else if (isPureAlt) {
        // Alt：拖拽超过阈值后复制子图（pointermove）；未拖拽则在 pointerup 时减选
        if (!isAlreadySelected) {
          setSelectedIds([id]);
          selectedIdsRef.current = [id];
        }
      } else {
        // 如果节点未被选中，则切换为单选这个节点
        // 如果节点已被选中，保持当前多选状态不变
        if (!isAlreadySelected) {
          setSelectedIds([id]);
        }
      }

      setContextMenu(null);

      if (isInteractiveSurface) {
        return;
      }

      if (isPureAlt) {
        altDupPendingRef.current = true;
        altDupClickNodeIdRef.current = id;
        altDragScreenAccumRef.current = { x: 0, y: 0 };
        altDupDoneRef.current = false;
      }

      // 开始拖拽（标题栏与节点空白区域）
      setDraggingNodeId(id);
      draggingNodeIdRef.current = id;
      activePointerTypeRef.current = 'node';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      nodeDragAccumRef.current = null;
      const idsToMove = selectedIdsRef.current.includes(id) ? selectedIdsRef.current : [id];
      const startMap = new Map<string, { x: number; y: number }>();
      for (const nid of idsToMove) {
        const n = nodesRef.current.find((x) => x.id === nid);
        if (n) startMap.set(nid, { x: n.x, y: n.y });
      }
      nodeDragHistoryStartRef.current = startMap;
    }
  };

  const handlePortPointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    activePointerTypeRef.current = 'edge';
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
    const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;
    const newDraft = { sourceId: nodeId, x: mouseX, y: mouseY };
    setDraftEdge(newDraft);
    draftEdgeRef.current = newDraft;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  // --- Drag and Drop Handlers ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - transform.x) / transform.scale;
    const mouseY = (e.clientY - rect.top - transform.y) / transform.scale;

    const isVideoFile = (f: File) =>
      f.type.startsWith('video/') ||
      /\.(mp4|webm|mov|mkv|avi|m4v|ogv|mpeg|mpg)(\?.*)?$/i.test(f.name);

    const allFiles = Array.from(e.dataTransfer.files || []);
    const videoFiles = allFiles.filter(isVideoFile);
    const imageFiles = collectImageFilesFromDataTransfer(e.dataTransfer);

    if (imageFiles.length > 0) {
      void readFilesAsBase64(imageFiles)
        .then((base64List) => {
          const newNodes = buildSpacedImageNodesFromLists(
            base64List,
            mouseX - SPAWNED_IMAGE_NODE_WIDTH / 2,
            mouseY - SPAWNED_IMAGE_NODE_HEIGHT / 2
          );
          if (newNodes.length === 0) return;
          setNodes((prev) => [...prev, ...newNodes]);
          setSelectedIds(newNodes.map((n) => n.id));
        })
        .catch((err) => {
          console.error(err);
          alert('无法加载拖入的图片文件。');
        });
    }

    if (videoFiles.length > 0) {
      const def = DEFAULT_NODE_SIZES.video || { width: 720, height: 840 };
      try {
        const urls = videoFiles.map((f) => URL.createObjectURL(f));
        const stripName = (name: string) =>
          sanitizeFilename(name.replace(/\.[^.]+$/i, '').trim() || '本地视频');
        const promptLabel =
          videoFiles.length === 1
            ? stripName(videoFiles[0].name)
            : `已拖入 ${videoFiles.length} 个本地视频`;
        const newNode: CanvasNode = {
          id: `video-${Date.now()}`,
          type: 'video',
          x: mouseX - def.width / 2,
          y: mouseY - def.height / 2,
          width: def.width,
          height: def.height,
          prompt: promptLabel,
          images: [],
          aspectRatio: '16:9',
          resolution: '2k',
          imageCount: 1,
          model: 'veo3.1-fast',
          viewMode: 'single',
          currentImageIndex: 0,
          videos: urls,
          currentVideoIndex: 0,
          videoDuration: 8,
          videoResolution: '720p',
          isGenerating: false,
        };
        setNodes((prev) => [...prev, newNode]);
        setSelectedIds([newNode.id]);
      } catch (err) {
        console.error(err);
        alert('无法加载拖入的视频文件。');
      }
    }
  }, [transform]);

  // --- Node Actions ---
  const addNodeAtCanvasPosition = useCallback((type: NodeType, canvasX: number, canvasY: number) => {
    const defaultSize = DEFAULT_NODE_SIZES[type] || { width: 420, height: 300 };
    // 与上次创建的节点位置相同（阈值 30px）则向右错开 100px，避免完全叠压
    const prev = lastCreatedNodePosRef.current;
    const STAGGER_THRESHOLD = 30;
    const STAGGER_X = 100;
    let finalX = canvasX;
    let finalY = canvasY;
    if (Math.abs(prev.x - canvasX) < STAGGER_THRESHOLD && Math.abs(prev.y - canvasY) < STAGGER_THRESHOLD) {
      finalX = canvasX + STAGGER_X * (prev.stagger + 1);
      finalY = canvasY + 24 * (prev.stagger + 1);
      lastCreatedNodePosRef.current = { x: canvasX, y: canvasY, stagger: prev.stagger + 1 };
    } else {
      lastCreatedNodePosRef.current = { x: canvasX, y: canvasY, stagger: 0 };
    }
    const newId = `${type}-${Date.now()}`;
    const newNode: CanvasNode = {
      id: newId,
      type,
      x: finalX,
      y: finalY,
      width: defaultSize.width,
      height: defaultSize.height,
      prompt: '', // 提示词使用预设，不直接设置
      images: [],
      aspectRatio:
        type === 'panoramaT2i'
          ? '2:1'
          : type === 't2i' || type === 'i2i' || type === 'video' || type === 'gridSplit' || type === 'gridMerge'
            ? '16:9'
            : '1:1',
      resolution: '2k',
      imageCount: 1,
      model:
        type === 't2i' || type === 'i2i' || type === 'panoramaT2i'
          ? defaultCanvasImageModel()
          : 'gemini-3.1-flash-image-preview',
      viewMode: 'single',
      currentImageIndex: 0,
      ...(type === 'panoramaT2i' ? { activePresets: ['全景图生成'] } : {}),
      ...(type === 'panorama' ? { panoramaImage: '', yaw: 0, pitch: 0, fov: 75, envMode: 'day' as const } : {}),
      ...(type === 'panoramaT2i' ? { panoramaImage: '', isGenerating: false } : {}),
      ...(type === 'annotation'
        ? { sourceImage: '', annotations: [], isEditing: false, selectedAnnotationId: undefined }
        : {}),
      ...(type === 'gridSplit' ? { inputImage: '', gridCount: 4 as const, outputImages: [] } : {}),
      ...(type === 'gridMerge' ? { inputImages: [], gridCount: 4 as const, outputImage: '' } : {}),
      ...(type === 'director3d'
        ? { backgroundImage: '', yaw: 0, pitch: 0, fov: 75, figures: [], selectedFigureId: undefined }
        : {}),
      ...(type === 'chat'
        ? {
            messages: [],
            model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
            isGenerating: false,
            chatInputHeight: Math.round((304 * CHAT_NODE_DEFAULT_PIXEL_HEIGHT) / 1800 * CHAT_PANEL_FONT_SCALE),
            imageAspectRatio: '16:9',
            imageResolution: '2k',
          }
        : {}),
      ...(type === 'video'
        ? {
            videos: [],
            currentVideoIndex: 0,
            videoDuration: 8,
            videoResolution: '720p' as const,
            model: 'veo3.1-fast',
          }
        : {}),
    };
    const MAX_CANVAS_NODES = 150;
    const currentCount = nodesRef.current.length;
    if (currentCount >= MAX_CANVAS_NODES) {
      alert(`节点数已达 ${MAX_CANVAS_NODES} 个上限，建议清理不需要的节点或新建项目，以保持画布流畅运行。`);
      return;
    }
    setNodes((prev) => [...prev, newNode]);
    setSelectedIds([newId]);

    const pending = pendingEdgeSourceIdRef.current;
    if (pending) {
      setEdges((prev) => {
        if (prev.some((edge) => edge.sourceId === pending && edge.targetId === newId)) return prev;
        return [...prev, { id: `edge-${Date.now()}`, sourceId: pending, targetId: newId }];
      });
      setPendingEdgeSourceId(null);
      pendingEdgeSourceIdRef.current = null;
    }
  }, []);

  addNodeAtCanvasPositionRef.current = addNodeAtCanvasPosition;

  const handleAddNode = (type: NodeType) => {
    if (!contextMenu) return;
    addNodeAtCanvasPosition(type, contextMenu.canvasX, contextMenu.canvasY);
    setContextMenu(null);
  };

  const handleImportImageClick = () => {
    if (!contextMenu) return;
    importPosRef.current = { x: contextMenu.canvasX, y: contextMenu.canvasY };
    // 保存待连接的源节点 ID（用于创建节点后自动连线）
    if (pendingEdgeSourceId) {
      importPosRef.current.pendingSourceId = pendingEdgeSourceId;
    }
    fileInputRef.current?.click();
    setContextMenu(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      if (importTargetNodeId) {
        setNodes(prev => prev.map(n => n.id === importTargetNodeId ? { ...n, images: [base64], currentImageIndex: 0 } : n));
        setImportTargetNodeId(null);
      } else {
        const newNode: CanvasNode = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: importPosRef.current.x,
          y: importPosRef.current.y,
          width: 480,
          height: 528,
          prompt: '',
          images: [base64],
          viewMode: 'single',
          currentImageIndex: 0
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedIds([newNode.id]);

        // 如果有待连接的源节点，自动连线
        const pendingSourceId = importPosRef.current.pendingSourceId;
        if (pendingSourceId) {
          const exists = edges.some(edge => edge.sourceId === pendingSourceId && edge.targetId === newNode.id);
          if (!exists) {
            setEdges(prev => [...prev, { id: `edge-${Date.now()}`, sourceId: pendingSourceId, targetId: newNode.id }]);
          }
          importPosRef.current.pendingSourceId = undefined;
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset
  };

  const handleDeleteNode = (id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (node) {
      revokeNodeBlobUrls(id);
      const remaining = nodesRef.current.filter((n) => n.id !== id);
      revokeNodeCanvasAssets(node, remaining);
    }
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.sourceId !== id && e.targetId !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleDeleteEdge = (id: string) => {
    setEdges((prev) => {
      const edge = prev.find((e) => e.id === id);
      if (!edge) return prev;
      const next = prev.filter((e) => e.id !== id);
      queueMicrotask(() => pushCanvasCommandRef.current({ type: 'deleteEdge', edge }));
      return next;
    });
  };

  const handleGenerate = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || (node.type !== 't2i' && node.type !== 'i2i' && node.type !== 'panoramaT2i')) return;

    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);
    generationStartedAtRef.current.set(nodeId, Date.now());

    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, isGenerating: true, error: undefined } : n));

    try {
      // ---- 即梦生图分支 ----
      const imageModel = node.model || defaultCanvasImageModel();
      if (isJimengImageModel(imageModel)) {
        const isI2i = node.type === 'i2i' || node.type === 'panoramaT2i';

        // 构建 prompt（即梦分支独立构建）
        const incomingEdges = edges.filter(e => e.targetId === nodeId);
        const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
        const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);
        const presetPrompts = (node.activePresets ?? []).map(key => promptPresets[key] || '').filter(Boolean);
        const combined = [...presetPrompts, node.prompt, ...textInputs].filter(Boolean).join('\n');
        const prompt = stripRefMarkers(combined) || combined;

        if (!prompt) throw new Error("请输入提示词或连接文本节点");

        await ensureJimengReady();
        const { generateJimengImage } = await import('./integrations/jimeng/jimengClient');

        // 图生图：取第一张参考图
        let imageUrl: string | undefined;
        if (isI2i) {
          const slots = buildIncomingRefSlots(nodeId, edges, nodes);
          const pickIndices = parseRefPickIndices(combined);
          const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);
          if (imageInputs.length > 0) imageUrl = imageInputs[0];
        }

        const result = await generateJimengImage({
          prompt,
          model: imageModel,
          imageUrl,
          ratio: node.aspectRatio || '16:9',
          resolution: node.resolution || '4k',
          nodeId,
        });

        // 处理多张图片生成
        if (result.imageUrls && result.imageUrls.length > 0) {
          const prevImages = node.images || [];
          const newImages = [...prevImages, ...result.imageUrls];
          setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            isGenerating: false,
            images: newImages,
            currentImageIndex: prevImages.length,
          } : n));
        } else {
          const prevImages = node.images || [];
          const newImages = [...prevImages, result.imageUrl];
          setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            isGenerating: false,
            images: newImages,
            currentImageIndex: prevImages.length,
          } : n));
        }
        return;
      }

      const incomingEdges = edges.filter(e => e.targetId === nodeId);
      const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];

      const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);

      // 获取预设提示词（如果有激活的预设）
      const presetPrompts = (node.activePresets ?? []).map(key => promptPresets[key] || '').filter(Boolean);
      
      // 预设提示词在前，用户输入在后
      const combinedPrompt = [...presetPrompts, node.prompt, ...textInputs].filter(Boolean).join('\n');
      
      // Do NOT append resolution/aspect ratio to the prompt text to avoid confusing the model's style adherence.
      const finalPrompt2 = combinedPrompt;

      let base64DataArray: string[] = [];

      if (node.type === 't2i') {
        if (!finalPrompt2) throw new Error("请输入提示词或连接文本节点");
        base64DataArray = await generateNewImage(
          finalPrompt2,
          node.aspectRatio || '16:9',
          node.imageCount || 1,
          node.model || defaultCanvasImageModel(),
          node.resolution,
          node.quality,
          ac.signal
        );
      } else if (node.type === 'i2i' || node.type === 'panoramaT2i') {
        const slots = buildIncomingRefSlots(nodeId, edges, nodes);
        const pickIndices = parseRefPickIndices(finalPrompt2);
        const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);
        const promptForModel = stripRefMarkers(finalPrompt2) || finalPrompt2;
        if (imageInputs.length === 0) throw new Error("请连接参考图片或视频节点，或使用 @R 引用有效参考槽位");
        if (!promptForModel) throw new Error("请输入编辑指令或连接文本节点");
        // 全景图生成使用节点配置的画幅
        const aspectRatio = node.aspectRatio || '2:1';
        base64DataArray = await editExistingImage(
          imageInputs,
          promptForModel,
          node.imageCount || 1,
          node.model || defaultCanvasImageModel(),
          aspectRatio,
          node.resolution,
          node.quality,
          ac.signal
        );
      }

        // Upscale images if 2k or 4k is selected
      const upscaledImages = await Promise.all(base64DataArray.map(img => upscaleImage(img, node.resolution || '4k')));

        // Append new images to existing ones
        const newImages = [...(node.images || []), ...upscaledImages];
        
        setNodes(prev => prev.map(n => n.id === nodeId ? { 
          ...n, 
          isGenerating: false, 
          images: newImages,
          currentImageIndex: (node.images || []).length // Point to the first newly generated image
        } : n));

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setNodes(prev =>
          prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
        );
      } else {
        setNodes(prev =>
          prev.map(n =>
            n.id === nodeId ? { ...n, isGenerating: false, error: err.message || '生成失败' } : n
          )
        );
      }
    } finally {
      generationAbortControllersRef.current.delete(nodeId);
      generationStartedAtRef.current.delete(nodeId);
    }
  };

  // 处理对话节点发送消息（支持多轮上下文；可选 baseMessages + prompt 用于「编辑历史后重发」）
  const handleSendMessage = async (
    nodeId: string,
    opts?: { baseMessages?: ChatMessage[]; promptText?: string }
  ) => {
    const node = nodes.find(n => n.id === nodeId) as (CanvasNode & ChatNode) | undefined;
    if (!node || node.type !== 'chat') return;

    const inputText = (opts?.promptText ?? node.prompt)?.trim();
    if (!inputText) return;

    // 设置取消控制器
    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);

    // 检测是否为生图模式（以 [生图] 开头）
    const isImageGenMode = inputText.startsWith('[生图]');
    const imageGenPrompt = isImageGenMode ? inputText.replace(/^\[生图\]\s*/, '').trim() : '';

    const incomingEdges = edges.filter(e => e.targetId === nodeId);
    const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
    const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);

    const slots = buildIncomingRefSlots(nodeId, edges, nodes);
    const pickIndices = parseRefPickIndices(inputText);
    const msgPickIndices = parseMsgPickIndices(inputText);
    const { base64s: refImages, missing } = await resolveSlotImagesForIndices(slots, pickIndices);

    // 从历史消息中提取图片（@M 引用）
    const msgImages: string[] = [];
    const msgRefDescs: string[] = [];
    if (msgPickIndices && msgPickIndices.length > 0) {
      const allMsgImages: { index: number; images: string[] }[] = [];
      let assistantCount = 0;
      for (let i = 0; i < (node.messages || []).length; i++) {
        const msg = (node.messages || [])[i];
        if (msg.role === 'assistant' && (msg.images?.length || msg.image)) {
          assistantCount++;
          allMsgImages.push({ index: assistantCount, images: msg.images || (msg.image ? [msg.image] : []) });
        }
      }
      for (const idx of msgPickIndices) {
        const found = allMsgImages.find(m => m.index === idx);
        if (found) {
          msgImages.push(...found.images);
          msgRefDescs.push(`@M${idx}`);
        }
      }
    }

    const strippedQuestion = stripRefMarkers(inputText) || inputText;

    const baseMessages = opts?.baseMessages ?? (node.messages || []);

      const contextParts: string[] = [];
      if (refImages.length > 0) {
        contextParts.push(`用户通过参考区提供了 ${refImages.length} 张视觉参考（见附图，顺序与 @R 序号一致）。`);
      }
      if (msgImages.length > 0) {
        contextParts.push(`用户提供了 ${msgImages.length} 张历史消息图片参考（见附图，顺序与 @M 序号一致）：${msgRefDescs.join(', ')}。请根据这些图片理解用户所指的具体内容。`);
      }
      const fallbackVideos = slots.filter(
        (s) => s.kind === 'video' && s.videoUrl && missing.includes(s.n)
      );
      if (fallbackVideos.length > 0) {
        contextParts.push(
          '以下参考视频若模型无法解码为附图，请结合链接理解场景（外链可能受跨域限制）：\n' +
            fallbackVideos.map((s) => `@R${s.n} ${s.videoUrl}`).join('\n')
        );
      }
      if (textInputs.length > 0) {
        contextParts.push('相关背景信息：' + textInputs.join('\n'));
      }
      contextParts.push('用户问题：' + strippedQuestion);
      const fullPrompt = contextParts.join('\n\n');

    const historyForApi = baseMessages.filter(
      (m) =>
        (m.content && m.content.trim().length > 0) ||
        (m.role === 'user' && (m.image || (m.images?.length ?? 0) > 0))
    );

    generationStartedAtRef.current.set(nodeId, Date.now());

    // 构建用户消息对象（保留@R标记用于显示，同时附加引用的图片）
    const genImages = [...refImages, ...msgImages];
    const userMsg: ChatMessage = {
      id: nextMsgId('user'),
      role: 'user',
      content: inputText, // 显示原始输入，保留 @R 引用标记
      image: genImages.length === 1 ? genImages[0] : undefined,
      images: genImages.length > 1 ? genImages : undefined,
    };

    // 立即显示用户消息并设置加载状态
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const ch = n as ChatNode;
        const existingMsgs = (ch.messages || []) as ChatMessage[];
        const MAX_CHAT_MESSAGES = 50;
        const afterUser = [...existingMsgs, userMsg];
        const trimmedAfterUser = afterUser.length > MAX_CHAT_MESSAGES ? afterUser.slice(-MAX_CHAT_MESSAGES) : afterUser;
        return { ...ch, messages: trimmedAfterUser, isGenerating: true, error: undefined, prompt: '' } as CanvasNode;
      })
    );

    try {
      // 生图模式：直接调用图片生成服务
      if (isImageGenMode) {
        if (!imageGenPrompt) {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId ? { ...n, isGenerating: false, error: '请在 [生图] 后填写要生成的图片描述' } : n
            )
          );
          generationStartedAtRef.current.delete(nodeId);
          return;
        }
        const imageModel = (node as ChatNode).imageModel || 'gpt-image-2-codesonline';
        const aspectRatio = (node as ChatNode).imageAspectRatio || '16:9';
        const resolution = (node as ChatNode).imageResolution || '2k';
        const imageCount = 1;

        // 构建带上下文的生图提示词（传递最近10轮对话摘要，最多2000字符）
        const allCurrentMessages = (node.messages || []) as ChatMessage[];
        const recentMessages = allCurrentMessages.slice(-20); // 最近20条消息（约10轮对话）
        let contextSummary = '';
        const MAX_CONTEXT_CHARS = 2000; // 限制上下文总字符数
        if (recentMessages.length > 0) {
          const userMsgs = recentMessages.filter(m => m.role === 'user').slice(-10);
          if (userMsgs.length > 0) {
            // 限制每个用户消息的显示长度
            const truncatedMsgs = userMsgs.map(m => {
              const content = typeof m.content === 'string' ? m.content : String(m.content);
              return content.length > 300 ? content.slice(0, 300) + '...' : content;
            });
            contextSummary = `【对话上下文参考】最近对话：${truncatedMsgs.join(' → ')}`;
            // 如果超出限制，截断
            if (contextSummary.length > MAX_CONTEXT_CHARS) {
              contextSummary = contextSummary.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
            }
          }
        }
        const fullImagePrompt = contextSummary ? `${contextSummary}\n\n【本次生图要求】${imageGenPrompt}` : imageGenPrompt;

        let generatedImages: string[];
        if (genImages.length > 0) {
          // 有参考图时，使用图生图（editExistingImage）而非纯文生图
          generatedImages = await editExistingImage(
            genImages,
            fullImagePrompt,
            imageCount,
            imageModel,
            aspectRatio,
            resolution,
            undefined, // quality
          );
        } else {
          // 无参考图时，使用纯文生图
          generatedImages = await generateNewImage(
            fullImagePrompt,
            aspectRatio,
            imageCount,
            imageModel,
            resolution
          );
        }

        const assistantMessage: ChatMessage = {
          id: nextMsgId('assistant'),
          role: 'assistant',
          content: `已根据您的描述生成 ${generatedImages.length} 张图片：`,
          images: generatedImages,
        };

        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== nodeId) return n;
            const ch = n as ChatNode;
            const existingMsgs = (ch.messages || []) as ChatMessage[];
            const MAX_CHAT_MESSAGES = 50;
            const trimmedAfterUser = existingMsgs.length > MAX_CHAT_MESSAGES ? existingMsgs.slice(-MAX_CHAT_MESSAGES) : existingMsgs;
            return { ...ch, messages: [...trimmedAfterUser, assistantMessage], isGenerating: false, prompt: '' } as CanvasNode;
          })
        );
        generationStartedAtRef.current.delete(nodeId);
        return;
      }

      // 普通对话模式
      const apiTurns = [
        ...historyForApi.map((m) => {
          const imgs = m.role === 'user' && m.images?.length ? m.images : undefined;
          const single =
            m.role === 'user' && !imgs?.length && m.image ? m.image : undefined;
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
            imageBase64: imgs && imgs.length === 1 ? imgs[0] : single,
            imageBase64s: imgs && imgs.length > 1 ? imgs : undefined,
          };
        }),
        {
          role: 'user' as const,
          content: fullPrompt,
          imageBase64: ([...refImages, ...msgImages].length) === 1 ? [...refImages, ...msgImages][0] : undefined,
          imageBase64s: ([...refImages, ...msgImages].length) > 1 ? [...refImages, ...msgImages] : undefined,
        },
      ];

      const chatModel = normalizeDeepSeekChatModelId(node.model || DEFAULT_DEEPSEEK_CHAT_MODEL_ID).trim();
      const response = await callGeminiChatWithHistory(apiTurns, chatModel);

      const assistantMessage: ChatMessage = {
        id: nextMsgId('assistant'),
        role: 'assistant',
        content: response.text,
        ...(response.images?.length ? { images: response.images } : {}),
      };

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const ch = n as ChatNode;
          const MAX_CHAT_MESSAGES = 50;
          const existingMsgs = (ch.messages || []) as ChatMessage[];
          const trimmedMsgs = existingMsgs.length > MAX_CHAT_MESSAGES ? existingMsgs.slice(-MAX_CHAT_MESSAGES) : existingMsgs;
          return { ...ch, messages: [...trimmedMsgs, assistantMessage], isGenerating: false, prompt: '' } as CanvasNode;
        })
      );
      generationStartedAtRef.current.delete(nodeId);
    } catch (err: any) {
      generationStartedAtRef.current.delete(nodeId);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? ({
        ...n,
        isGenerating: false,
                error: err.message || '生成失败',
              } as CanvasNode)
            : n
        )
      );
    }
  };

  // 优化提示词：优先使用 gpt-5.5（君澜），失败则使用 deepseek-v4-flash
  const handleOptimizePrompt = async (nodeId: string, text: string) => {
    const sourceNode = nodes.find(n => n.id === nodeId);
    if (!sourceNode) return;

    // 设置源节点为生成状态（用于显示加载动画）
    generationStartedAtRef.current.set(nodeId, Date.now());
    handleUpdateNode(nodeId, { isGenerating: true, error: undefined });

    try {
      const apiTurns = [
        {
          role: 'user' as const,
          content: `请将以下文字内容优化成在 seedance 2.0 中进行生图和生视频的提示词。只输出优化后的提示词内容，不要解释。

原文内容：
${text}`,
        },
      ];

      let result = '';
      let usedFallback = false;

      try {
        result = (await callGeminiChatWithHistory(apiTurns, 'gpt-5.5-junlan')).text;
      } catch (err: any) {
        // GPT-5.5 失败，尝试 deepseek-v4-flash
        usedFallback = true;
        try {
          result = (await callGeminiChatWithHistory(apiTurns, 'deepseek-v4-flash')).text;
        } catch {
          handleUpdateNode(nodeId, { isGenerating: false, error: '优化提示词失败，请检查 API 配置' });
          return;
        }
      }

      if (!result.trim()) {
        handleUpdateNode(nodeId, { isGenerating: false, error: '未获取到优化后的提示词' });
        return;
      }

      // 在当前文本节点右侧创建新的文本节点，填入优化后的提示词
      const newId = `text-${Date.now()}`;
      const defaultSize = { width: 420, height: 300 };
      const newNode: CanvasNode = {
        id: newId,
        type: 'text',
        x: (sourceNode?.x || 0) + defaultSize.width + 50,
        y: sourceNode?.y || 0,
        width: defaultSize.width,
        height: defaultSize.height,
        prompt: result.trim(),
        images: [],
        aspectRatio: '1:1',
        resolution: '2k',
        imageCount: 1,
        model: defaultCanvasImageModel(),
        viewMode: 'single',
        currentImageIndex: 0,
      };

      // 结束源节点生成状态
      handleUpdateNode(nodeId, { isGenerating: false });

      setNodes((prev) => [...prev, newNode]);
      setSelectedIds([newId]);

      // 自动选中新节点进入编辑状态
      setTimeout(() => {
        setEditingTextNodeIds((prev) => {
          const next = new Set(prev);
          next.add(newId);
          return next;
        });
      }, 50);
    } catch (err: any) {
      handleUpdateNode(nodeId, { isGenerating: false, error: err.message || '优化失败' });
    }
  };

  // 处理连线数据传递 - 当有连线连接到 panorama 或 annotation 节点时
  useEffect(() => {
    nodes.forEach(node => {
      if (node.type === 'panorama' || node.type === 'annotation' || node.type === 'panoramaT2i' || node.type === 'director3d') {
        const incomingEdges = edges.filter(e => e.targetId === node.id || e.sourceId === node.id);
        if (incomingEdges.length > 0) {
          const sourceNodes = resolveImageProviderNodes(node.id, nodes, edges);

          const primaryRef = sourceNodes
            .map((n) => getNodePrimaryImageRef(n))
            .find((ref) => ref !== null);

          if (primaryRef) {
            const { base64, assetId } = imageRefToSingleImageFields(primaryRef);
            const updates: Partial<CanvasNode> = {};

            if (node.type === 'panorama') {
              updates.panoramaImage = base64;
              updates.panoramaImageAssetId = assetId;
            } else if (node.type === 'annotation') {
              updates.sourceImage = base64;
              updates.sourceImageAssetId = assetId;
            } else if (node.type === 'panoramaT2i') {
              updates.images = [base64];
              updates.imageAssetIds = assetId ? [assetId] : undefined;
              updates.currentImageIndex = 0;
            } else if (node.type === 'director3d') {
              updates.backgroundImage = base64;
              updates.backgroundImageAssetId = assetId;
            }

            const changed =
              node.type === 'panorama'
                ? !singleImageFieldsMatch(node.panoramaImage, node.panoramaImageAssetId, { base64, assetId })
                : node.type === 'annotation'
                  ? !singleImageFieldsMatch(node.sourceImage, node.sourceImageAssetId, { base64, assetId })
                  : node.type === 'director3d'
                    ? !singleImageFieldsMatch(node.backgroundImage, node.backgroundImageAssetId, { base64, assetId })
                    : node.type === 'panoramaT2i'
                      ? !singleImageFieldsMatch(node.images?.[0], node.imageAssetIds?.[0], { base64, assetId })
                      : false;

            if (changed) {
              handleUpdateNode(node.id, updates);
            }
          }
        }
      }
    });
  }, [edges, nodes]);

  const downloadImage = useCallback(async (imageSrc: string) => {
    try {
      const raw = await imageSrcToRawBase64(
        imageSrc.startsWith('http://') ||
          imageSrc.startsWith('https://') ||
          imageSrc.startsWith('data:') ||
          imageSrc.startsWith('blob:')
          ? imageSrc
          : fullscreenImageDisplaySrc(imageSrc)
      );
      if (!raw?.base64) {
        window.alert('无法读取图片数据，可尝试右键图片另存为。');
        return;
      }
      const r = await saveImageDownload(raw.base64, raw.mime);
      if (!r.ok && r.message) window.alert(r.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '下载失败';
      window.alert(`${msg}。可尝试右键图片另存为。`);
    }
  }, []);

  const downloadVideoFromUrl = useCallback(async (url: string) => {
    try {
      const r = await saveVideoDownloadFromUrl(url);
      if (!r.ok && r.message) window.alert(r.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '下载失败';
      window.alert(`${msg}。可直接右键视频「另存为」或复制链接。`);
    }
  }, []);

  /** 轮询即梦任务直到完成 */
  const pollJimengTask = useCallback(async (nodeId: string, submitId: string, setNodesFn: any, edgesList: Edge[], nodesList: CanvasNode[]) => {
    const maxAttempts = 2160; // 最长轮询 3 小时（5 秒一次）
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await queryJimengTask(submitId);
        if (res.ok && res.data) {
          const data = res.data;
          const genStatus = data.gen_status || data.status || "";
          if (genStatus === "completed" || genStatus === "done") {
            // 任务完成，获取视频 URL
            const videoUrl = data.video_url || data.url || "";
            if (videoUrl) {
              setNodesFn((prev: CanvasNode[]) => prev.map(n =>
                n.id === nodeId
                  ? {
                      ...n,
                      isGenerating: false,
                      videos: [...(n.videos || []), videoUrl],
                      currentVideoIndex: (n.videos || []).length,
                    }
                  : n
              ));
              return;
            }
          }
          if (genStatus === "fail") {
            setNodesFn((prev: CanvasNode[]) => prev.map(n =>
              n.id === nodeId ? { ...n, isGenerating: false, error: `[即梦] ${data.fail_reason || "生成失败"}` } : n
            ));
            return;
          }
          // querying / pending / running — 继续等待
          const queueInfo = data.queue_info || {};
          const pos = queueInfo.queue_idx ?? "?";
          const total = queueInfo.queue_length ?? "?";
          setNodesFn((prev: CanvasNode[]) => prev.map(n =>
            n.id === nodeId ? { ...n, status: `队列 ${pos}/${total}` } : n
          ));
        }
      } catch (e) {
        console.warn("[jimeng] poll error:", e);
      }
    }
    // 超时
    setNodesFn((prev: CanvasNode[]) => prev.map(n =>
      n.id === nodeId ? { ...n, isGenerating: false, error: "[即梦] 生成超时，请稍后重试" } : n
    ));
  }, []);

  const handleGenerateVideo = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'video') return;

    // 日志：确认选择的模型值
    console.log('[jimeng] handleGenerateVideo node.model =', node.model);
    console.log('[jimeng] isJimengVideoModel(node.model) =', isJimengVideoModel(node.model));

    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);
    generationStartedAtRef.current.set(nodeId, Date.now());

    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: true, error: undefined } : n)));

    // ---- 提前判断是否为即梦模型 ----
    const isJimeng = isJimengVideoModel(node.model);

    if (isJimeng) {
      console.log('[jimeng] entering jimeng video generation');

      try {
        // 检查 prompt（即梦也需 prompt）
        const incomingEdges = edges.filter(e => e.targetId === nodeId);
        const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
        const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);

        const combinedRaw = [node.prompt, ...textInputs].filter(Boolean).join('\n').trim();
        if (!combinedRaw) throw new Error('请输入提示词');

        const slots = buildIncomingRefSlots(nodeId, edges, nodes);
        const pickIndices = parseRefPickIndices(combinedRaw);
        const combinedPrompt = stripRefMarkers(combinedRaw) || combinedRaw;
        const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);

        // 即梦路径：先确保登录
        await ensureJimengReady();

        // 如果有参考图，取第一张作为 imageUrl
        let imageUrl: string | undefined;
        if (imageInputs.length > 0) {
          imageUrl = imageInputs[0];
        }

        const result = await generateJimengVideo({
          prompt: combinedPrompt,
          model: node.model || 'jimeng-video-v3',
          imageUrl,
          images: imageInputs, // 传递所有参考图（用于全能参考、智能多帧等模式）
          videoMode: node.videoMode || 'image2video',
          duration: node.videoDuration || 8,
          ratio: node.aspectRatio || '16:9',
          nodeId,
        });

        // 如果返回了 submitId（任务在队列中），启动轮询
        if (!result.ok && (result as any).submitId) {
          const submitId = (result as any).submitId;
          setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: true, error: undefined, status: '队列中...' } : n)));
          await pollJimengTask(nodeId, submitId, setNodes, edges, nodes);
          return;
        }

        const prevVideos = node.videos || [];
        const newVideos = [...prevVideos, result.videoUrl];
        setNodes(prev =>
          prev.map(n =>
            n.id === nodeId
              ? {
                  ...n,
                  isGenerating: false,
                  videos: newVideos,
                  currentVideoIndex: prevVideos.length,
                  // 保存原始URL用于错误回退
                  originalVideoUrl: result.videoUrl.includes('localhost:3107') 
                    ? result.originalUrl || result.videoUrl 
                    : result.videoUrl,
                }
              : n
          )
        );
      } catch (err: unknown) {
        const aborted =
          (err as { name?: string })?.name === 'AbortError' ||
          (err instanceof DOMException && err.name === 'AbortError');
        if (aborted) {
          setNodes(prev =>
            prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
          );
        } else {
          const message = err instanceof Error ? err.message : '即梦视频生成失败';
          console.error('[jimeng] error:', message, 'node.model=', node.model);
          // 如果是登录过期，自动弹出登录对话框
          if ((err as any).loginRequired && typeof openLoginRef.current === 'function') {
            openLoginRef.current();
          }
          setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: `[即梦] ${message}` } : n)));
        }
      } finally {
        generationAbortControllersRef.current.delete(nodeId);
        generationStartedAtRef.current.delete(nodeId);
      }
      return; // 即梦分支处理完毕，直接返回
    }

    // ---- 非即梦模型，走原有 ToAPIs 逻辑 ----
    try {
      const incomingEdges = edges.filter(e => e.targetId === nodeId);
      const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
      const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);

      const combinedRaw = [node.prompt, ...textInputs].filter(Boolean).join('\n').trim();
      if (!combinedRaw) throw new Error('请输入提示词或连接文本节点');

      const slots = buildIncomingRefSlots(nodeId, edges, nodes);
      const pickIndices = parseRefPickIndices(combinedRaw);
      const combinedPrompt = stripRefMarkers(combinedRaw) || combinedRaw;
      const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);

      // 解析语音参考
      const audioRefs = resolveSlotAudios(slots);
      const audioBase64 = audioRefs.length > 0 ? audioRefs[0].base64 : undefined;

      const videoModel = videoNodeModelToToApis(node.model);

      // --- ToAPIs 路径（原有逻辑） ---
        let videoUrl: string;

        const resolution: '480p' | '720p' | '1080p' | '4k' =
          videoModel === 'veo3.1-fast'
            ? (['1080p', '4k'].includes(node.videoResolution || '') ? (node.videoResolution as '1080p' | '4k') : '1080p')
            : videoModel === 'sora-2-vvip'
              ? '720p'
              : videoModel === 'doubao-seedance-1-5-pro'
                ? (['480p', '1080p'].includes(node.videoResolution || '') ? (node.videoResolution as '480p' | '1080p') : '720p')
                : videoModel === 'seedance-2'
                  ? (node.videoResolution === '1080p' ? '1080p' : '720p')
                  : videoModel === 'seedance-2-fast'
                    ? '720p'
                    : videoModel === 'doubao-seedance-2-0-260128' || videoModel === 'doubao-seedance-2-0-fast-260128'
                      ? (['480p', '1080p'].includes(node.videoResolution || '') ? (node.videoResolution as '480p' | '1080p') : '720p')
                      : node.videoResolution === '480p'
                  ? '480p'
                  : '720p';

        videoUrl = await generateCanvasVideoViaToApis(combinedPrompt, {
          videoModel,
          durationSeconds:
            node.videoDuration ??
            (videoModel === 'sora-2-vvip' || videoModel === 'veo3.1-fast' ? 8 : 10),
          aspectRatio: node.aspectRatio || '16:9',
          resolution,
          referenceImagesBase64: (videoModel === 'doubao-seedance-1-5-pro' || videoModel === 'gemini-omni-flash' || videoModel === 'seedance-2' || videoModel === 'seedance-2-fast' || videoModel === 'doubao-seedance-2-0-260128' || videoModel === 'doubao-seedance-2-0-fast-260128') ? imageInputs.slice(0, 2) : imageInputs.slice(0, 3),
          referenceAudioBase64: audioBase64,
          signal: ac.signal,
        });

        const prevVideos = node.videos || [];
        const newVideos = [...prevVideos, videoUrl];
        setNodes(prev =>
          prev.map(n =>
            n.id === nodeId
              ? {
                  ...n,
                  isGenerating: false,
                  videos: newVideos,
                  currentVideoIndex: prevVideos.length,
                }
              : n
          )
        );
    } catch (err: unknown) {
      const aborted =
        (err as { name?: string })?.name === 'AbortError' ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (aborted) {
        setNodes(prev =>
          prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
        );
      } else {
        const message = err instanceof Error ? err.message : '生成失败';
        setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: message } : n)));
      }
    } finally {
      generationAbortControllersRef.current.delete(nodeId);
      generationStartedAtRef.current.delete(nodeId);
    }
  };

  // --- Canvas render memoization ---
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edgeBridges = useMemo(() => computeEdgeBridges(edges, nodeMap), [edges, nodeMap]);
  const visibleNodeIds = useMemo(
    () => computeVisibleNodeIds(nodes, transform, viewportSize.width, viewportSize.height, 300),
    [nodes, transform, viewportSize]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const edgeRenderNodeIds = useMemo(() => {
    const set = new Set(visibleNodeIds);
    if (draggingNodeId) set.add(draggingNodeId);
    for (const id of selectedIds) set.add(id);
    return set;
  }, [visibleNodeIds, draggingNodeId, selectedIds]);

  const handleMinimapNavigate = useCallback((canvasX: number, canvasY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTransform((prev) => ({
      ...prev,
      x: rect.width / 2 - canvasX * prev.scale,
      y: rect.height / 2 - canvasY * prev.scale,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const patches = new Map<string, Partial<CanvasNode>>();
      for (const node of nodes) {
        if (cancelled || !nodeNeedsMediaOffload(node)) continue;
        const patch = await buildNodeMediaOffloadPatch(node);
        if (cancelled || !patch) continue;
        patches.set(node.id, patch);
      }
      if (cancelled || patches.size === 0) return;
      setNodes((prev) =>
        prev.map((n) => {
          const patch = patches.get(n.id);
          return patch ? { ...n, ...patch } : n;
        })
      );
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [nodes]);

  // --- Render Helpers ---
  const renderNodeRef = useRef<(node: CanvasNode) => React.ReactNode>(() => null);
  const renderNode = (node: CanvasNode) => {
    const genStart = generationStartedAtRef.current.get(node.id);

    // 懒加载优化：预计算节点是否在视口内
    const nodeInViewport = (() => {
      const vp = viewportRef.current;
      const t = transform;
      const screenLeft = node.x * t.scale + t.x;
      const screenTop = node.y * t.scale + t.y;
      const screenRight = screenLeft + node.width * t.scale;
      const screenBottom = screenTop + node.height * t.scale;
      const margin = 300;
      return !(screenRight < -margin || screenLeft > vp.width + margin || screenBottom < -margin || screenTop > vp.height + margin);
    })();

    const isSelected = selectedIds.includes(node.id);
    const hasInputPort = canReceiveConnection(node);
    const hasOutputPort = true;

    let headerIcon, headerTitle, borderColor, shadowColor;
    if (node.type === 'text') {
      headerIcon = <TextIcon size={14} className="text-gray-400" />;
      headerTitle = '文本节点';
      borderColor = isSelected ? 'border-gray-400' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-gray-500/20' : '';
    } else if (node.type === 'image') {
      headerIcon = <ImageIcon size={14} className="text-green-400" />;
      headerTitle = '图片节点';
      borderColor = isSelected ? 'border-green-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-green-900/30' : '';
    } else if (node.type === 't2i') {
      headerIcon = <ImageIcon size={14} className="text-purple-400" />;
      headerTitle = '文生图';
      borderColor = isSelected ? 'border-purple-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-purple-900/30' : '';
    } else if (node.type === 'panorama') {
      headerIcon = <PanoramaIcon size={14} className="text-cyan-400" />;
      headerTitle = '360° 全景图';
      borderColor = isSelected ? 'border-cyan-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-cyan-900/30' : '';
    } else if (node.type === 'annotation') {
      headerIcon = <AnnotationIcon size={14} className="text-orange-400" />;
      headerTitle = '图片标注';
      borderColor = isSelected ? 'border-orange-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-orange-900/30' : '';
    } else if (node.type === 'gridSplit') {
      headerIcon = <GridIcon size={21} className="text-teal-400" />;
      headerTitle = '宫格拆分';
      borderColor = isSelected ? 'border-teal-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-teal-900/30' : '';
    } else if (node.type === 'gridMerge') {
      headerIcon = <GridMergeIcon size={21} className="text-teal-400" />;
      headerTitle = '宫格合并';
      borderColor = isSelected ? 'border-teal-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-teal-900/30' : '';
    } else if (node.type === 'panoramaT2i') {
      headerIcon = <WidePanoramaIcon size={14} className="text-indigo-400" />;
      headerTitle = '全景图生成';
      borderColor = isSelected ? 'border-indigo-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-indigo-900/30' : '';
    } else if (node.type === 'director3d') {
      headerIcon = <Director3DIcon size={14} className="text-pink-400" />;
      headerTitle = '3D导演台';
      borderColor = isSelected ? 'border-pink-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-pink-900/30' : '';
    } else if (node.type === 'video') {
      headerIcon = <VideoIcon size={14} className="text-amber-400" />;
      headerTitle = '视频生成';
      borderColor = isSelected ? 'border-amber-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-amber-900/30' : '';
    } else if (node.type === 'audio') {
      headerIcon = <AudioIcon size={14} className="text-blue-400" />;
      headerTitle = '语音节点';
      borderColor = isSelected ? 'border-blue-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-blue-900/30' : '';
    } else if (node.type === 'chat') {
      headerIcon = <MessageIcon size={14} className="text-rose-400" />;
      headerTitle = 'AI对话';
      borderColor = isSelected ? 'border-rose-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-rose-900/30' : '';
    } else {
      headerIcon = <WandIcon size={14} className="text-blue-400" />;
      headerTitle = '图生图';
      borderColor = isSelected ? 'border-blue-500' : 'border-[#333]';
      shadowColor = isSelected ? 'shadow-blue-900/30' : '';
    }

    const images = node.images || [];
    const imageAssetIds = node.imageAssetIds;
    const hasDisplayableImages = countNodeImageSlots(images, imageAssetIds) > 0;
    const viewMode = node.viewMode || 'single';
    const currentIndex = node.currentImageIndex || 0;
    const videoUrls = node.videos || [];
    const currentVideoIdx = node.currentVideoIndex ?? 0;

    return (
      <div
        key={node.id}
        data-node-root="true"
        data-selected={isSelected ? 'true' : 'false'}
        className={`absolute flex flex-col bg-[#1e1e1e] rounded-[20px] border-8 shadow-2xl transition-shadow ${borderColor} ${shadowColor} ${isSelected ? 'z-20' : 'z-10 hover:border-[#555]'} ${node.type === 'chat' ? 'canvas-node-root--chat' : 'canvas-node-font-195'}${node.type === 'annotation' ? ' canvas-node-annotation' : ''}${node.type === 'gridSplit' || node.type === 'gridMerge' ? ' canvas-node-grid-tool-150' : ''}`}
        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        onPointerDown={(e) => handleNodePointerDown(e, node.id)}
        onDoubleClick={() => {
          if (!isSelected && (node.type === 'chat' || node.type === 'text')) {
            setSelectedIds([node.id]);
          }
          if (node.type === 'text') {
            setEditingTextNodeIds(prev => { const next = new Set(prev); next.add(node.id); return next; });
          }
        }}
      >
        {/* 文本节点取消选中时退出编辑 */}
        {node.type === 'text' && !isSelected && editingTextNodeIds.has(node.id) ? (
          <></>
        ) : null}
        {/* Floating title - outside window, transparent */}
        <div className="absolute -top-[7rem] left-3 z-30 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
          {headerIcon}
          <span className="canvas-node-window-title text-white/80 font-medium">{headerTitle}</span>
        </div>
        {/* Input Port (Left) */}
        {hasInputPort && (
          <div 
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#333] border-2 border-[#666] rounded-full z-30 group/port hover:border-green-400 hover:bg-green-500 transition-all cursor-crosshair"
            onPointerDown={(e) => { e.stopPropagation(); handlePortPointerDown(e, node.id); }}
            title={
              node.type === 'gridSplit'
                ? '输入端口 (连接图片节点)'
                : node.type === 'gridMerge'
                  ? '输入端口 (连接图片节点)'
                  : node.type === 'panorama'
                    ? '输入端口 (连接图片节点输入全景图)'
                    : node.type === 'annotation'
                      ? '输入端口 (连接图片节点)'
                      : node.type === 'panoramaT2i'
                        ? '输入端口 (连接图片节点)'
                        : node.type === 'director3d'
                          ? '输入端口 (连接图片节点作为背景)'
                          : node.type === 'chat'
                            ? '输入端口 (文本 / 图片 / 视频节点作为参考)'
                            : node.type === 'video'
                              ? '输入端口 (文本；参考图片或视频节点)'
                              : '输入端口 (连接文本或图片)'
            }
          />
        )}
        
        {/* Output Port (Right) */}
        {hasOutputPort && (
          <div 
            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-[#555] border-2 border-[#888] hover:border-blue-400 hover:bg-blue-500 hover:scale-150 transition-all rounded-full cursor-crosshair z-30 group/port"
            onPointerDown={(e) => handlePortPointerDown(e, node.id)}
            title="拖拽连线到其他节点"
          >
            <div className="absolute inset-0 rounded-full bg-blue-400 opacity-0 group-hover/port:opacity-50 animate-ping" />
          </div>
        )}

        {/* Resize Handles - 仅选中节点时显示 */}
        {isSelected && (
          <>
            {/* 四个角的缩放手柄 */}
            <div
              className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 cursor-nw-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'nw')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 cursor-ne-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'ne')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-4 h-4 cursor-sw-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'sw')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-4 h-4 cursor-se-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'se')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>

            {/* 四条边的缩放手柄 */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-3 cursor-n-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'n')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-6 h-3 cursor-s-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 's')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 cursor-w-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'w')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-6 cursor-e-resize z-40 group/resize"
              data-resize-handle
              onPointerDown={(e) => beginNodeResize(e, node.id, 'e')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
          </>
        )}

        {/* Content (Merged Window Layout) */}
        <div 
          className={`flex-1 flex flex-col relative rounded-b-xl min-h-0 overflow-hidden ${eyedropperTargetNodeId ? 'cursor-crosshair' : 'bg-[#1a1a1a]'}`}
          style={{ backgroundColor: eyedropperTargetNodeId ? undefined : '#1a1a1a' }}
        >
          
          {/* Image Area */}
          {(node.type === 't2i' || node.type === 'i2i' || node.type === 'image' || node.type === 'panoramaT2i') && (
            <div
              className={`w-full bg-[#2a2a2a] relative border-b border-[#333] overflow-hidden group flex flex-col min-h-0 ${
                node.type === 'image'
                  ? 'flex-1 min-h-[160px]'
                  : 'flex-[5] min-h-[240px] basis-0 min-w-0'
              }`}
            >
              {node.isGenerating && (
                <div className="absolute inset-0 z-[3] pointer-events-none" style={{ 
                  background: 'radial-gradient(ellipse at 50% 30%, rgba(0,245,255,0.15) 0%, rgba(102,126,234,0.10) 30%, rgba(168,85,247,0.08) 60%, transparent 80%)',
                  overflow: 'hidden'
                }}>
                  {/* 全息扫描背景 */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `
                      repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(0,245,255,0.03) 2px,
                        rgba(0,245,255,0.03) 4px
                      )
                    `,
                    animation: 'hologramScan 0.5s linear infinite',
                  }} />
                  
                  {/* 主扫描线 - 青色 */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: '4px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(0,245,255,0.3) 10%, rgba(0,245,255,0.9) 50%, rgba(0,245,255,0.3) 90%, transparent 100%)',
                    boxShadow: '0 0 20px rgba(0,245,255,0.8), 0 0 40px rgba(0,245,255,0.4), 0 0 80px rgba(0,245,255,0.2)',
                    animation: 'genScanDown 2s ease-in-out infinite',
                  }} />
                  
                  {/* 次扫描线 - 紫色 */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: '3px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.3) 10%, rgba(168,85,247,0.9) 50%, rgba(168,85,247,0.3) 90%, transparent 100%)',
                    boxShadow: '0 0 15px rgba(168,85,247,0.8), 0 0 30px rgba(168,85,247,0.4)',
                    animation: 'genScanDown 2s ease-in-out 1s infinite',
                  }} />
                  
                  {/* 第三扫描线 - 白色高光 */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: '2px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                    boxShadow: '0 0 10px rgba(255,255,255,0.6)',
                    animation: 'genScanDown 2s ease-in-out 0.5s infinite',
                  }} />
                  
                  {/* 神经网络连接线 */}
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.6 }}>
                    <defs>
                      <linearGradient id="neuralGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(0,245,255,0)" />
                        <stop offset="50%" stopColor="rgba(0,245,255,1)" />
                        <stop offset="100%" stopColor="rgba(168,85,247,0)" />
                      </linearGradient>
                    </defs>
                    {[...Array(8)].map((_, i) => (
                      <line
                        key={i}
                        x1={`${10 + i * 12}%`}
                        y1="20%"
                        x2={`${15 + i * 10}%`}
                        y2="80%"
                        stroke="url(#neuralGrad)"
                        strokeWidth="1"
                        style={{
                          animation: `neuralPulse ${1.5 + i * 0.2}s ease-in-out ${i * 0.15}s infinite`,
                        }}
                      />
                    ))}
                  </svg>
                  
                  {/* 浮动粒子群 - 第一层 */}
                  {[...Array(15)].map((_, i) => (
                    <div key={`p1-${i}`} style={{
                      position: 'absolute',
                      width: i % 3 === 0 ? '5px' : i % 3 === 1 ? '3px' : '4px',
                      height: i % 3 === 0 ? '5px' : i % 3 === 1 ? '3px' : '4px',
                      borderRadius: '50%',
                      background: i % 4 === 0 ? '#00f5ff' : i % 4 === 1 ? '#667eea' : i % 4 === 2 ? '#a855f7' : '#60a5fa',
                      boxShadow: `0 0 8px ${i % 4 === 0 ? '#00f5ff' : i % 4 === 1 ? '#667eea' : i % 4 === 2 ? '#a855f7' : '#60a5fa'}, 0 0 16px ${i % 4 === 0 ? 'rgba(0,245,255,0.5)' : i % 4 === 1 ? 'rgba(102,126,234,0.5)' : i % 4 === 2 ? 'rgba(168,85,247,0.5)' : 'rgba(96,165,250,0.5)'}`,
                      left: `${5 + i * 6.5}%`,
                      top: `${15 + (i % 5) * 18}%`,
                      animation: `genParticleFloat ${1.8 + i * 0.15}s ease-in-out ${i * 0.12}s infinite`,
                    }} />
                  ))}
                  
                  {/* 浮动粒子群 - 第二层（大粒子） */}
                  {[...Array(6)].map((_, i) => (
                    <div key={`p2-${i}`} style={{
                      position: 'absolute',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(0,245,255,1) 0%, rgba(0,245,255,0) 70%)',
                      boxShadow: '0 0 15px #00f5ff, 0 0 30px rgba(0,245,255,0.5)',
                      left: `${8 + i * 15}%`,
                      top: `${10 + (i % 3) * 30}%`,
                      animation: `genParticleBreathe ${2.5 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                  
                  {/* 能量波纹 */}
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '20px',
                    height: '20px',
                    transform: 'translate(-50%, -50%)',
                    border: '2px solid rgba(0,245,255,0.5)',
                    borderRadius: '50%',
                    animation: 'genEnergyWave 2s ease-out infinite',
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '20px',
                    height: '20px',
                    transform: 'translate(-50%, -50%)',
                    border: '1px solid rgba(168,85,247,0.4)',
                    borderRadius: '50%',
                    animation: 'genEnergyWave 2s ease-out 0.7s infinite',
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: '20px',
                    height: '20px',
                    transform: 'translate(-50%, -50%)',
                    border: '1px solid rgba(102,126,234,0.3)',
                    borderRadius: '50%',
                    animation: 'genEnergyWave 2s ease-out 1.4s infinite',
                  }} />
                  
                  {/* 网格 - 赛博朋克风格 */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `
                      linear-gradient(rgba(0,245,255,0.15) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(0,245,255,0.15) 1px, transparent 1px),
                      linear-gradient(rgba(168,85,247,0.08) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(168,85,247,0.08) 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 60px, 60px 60px, 30px 30px, 30px 30px',
                    backgroundPosition: '0 0, 0 0, 30px 30px, 30px 30px',
                    animation: 'genGridPulse 3s ease-in-out infinite',
                  }} />
                  
                  {/* 扫描光栅 */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 20px,
                      rgba(0,245,255,0.02) 20px,
                      rgba(0,245,255,0.02) 21px
                    )`,
                    animation: 'genRasterScan 4s linear infinite',
                  }} />
                  
                  {/* 角落装饰 */}
                  <div style={{
                    position: 'absolute', top: '8px', left: '8px',
                    width: '30px', height: '30px',
                    borderTop: '2px solid rgba(0,245,255,0.8)',
                    borderLeft: '2px solid rgba(0,245,255,0.8)',
                    boxShadow: '0 0 10px rgba(0,245,255,0.5)',
                  }} />
                  <div style={{
                    position: 'absolute', top: '8px', right: '8px',
                    width: '30px', height: '30px',
                    borderTop: '2px solid rgba(0,245,255,0.8)',
                    borderRight: '2px solid rgba(0,245,255,0.8)',
                    boxShadow: '0 0 10px rgba(0,245,255,0.5)',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: '8px', left: '8px',
                    width: '30px', height: '30px',
                    borderBottom: '2px solid rgba(168,85,247,0.8)',
                    borderLeft: '2px solid rgba(168,85,247,0.8)',
                    boxShadow: '0 0 10px rgba(168,85,247,0.5)',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: '8px', right: '8px',
                    width: '30px', height: '30px',
                    borderBottom: '2px solid rgba(168,85,247,0.8)',
                    borderRight: '2px solid rgba(168,85,247,0.8)',
                    boxShadow: '0 0 10px rgba(168,85,247,0.5)',
                  }} />
                  
                  {/* 加载文字 */}
                  <div style={{
                    position: 'absolute', bottom: '15px', left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '11px',
                    color: 'rgba(0,245,255,0.9)',
                    textShadow: '0 0 10px rgba(0,245,255,0.8)',
                    fontFamily: 'monospace',
                    letterSpacing: '2px',
                    animation: 'genTextBlink 1s ease-in-out infinite',
                  }}>
                    ◉ PROCESSING ◈
                  </div>
                </div>
              )}
              {hasDisplayableImages ? (
                <>
                  {/* Top right controls */}
                  <div className={`absolute top-2 right-2 z-10 flex gap-1 transition-opacity ${node.type === 'image' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {/* 吸管按钮 - 图生图与图片节点显示 */}
                    {(node.type === 'i2i' || node.type === 'image') && (
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); setEyedropperTargetNodeId(node.id); }}
                        className={`p-1.5 rounded text-white backdrop-blur-sm ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-black/60 hover:bg-black/80'}`}
                        title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
                      >
                        <EyedropperIcon size={25} />
                      </button>
                    )}
                    {viewMode === 'single' && (
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); openFullscreenImage(node.id, images[currentIndex], currentIndex); }}
                        className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                        title="放大查看"
                      >
                        <MaximizeIcon size={50}/>
                      </button>
                    )}
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const payload = cloneImageSlotForNewNode(
                          images[currentIndex],
                          imageAssetIds?.[currentIndex]
                        );
                        if (!payload) return;
                        const newNodeId = `image-${Date.now()}`;
                        const newNode: CanvasNode = {
                          id: newNodeId,
                          type: 'image',
                          x: node.x + 525,
                          y: node.y,
                          width: 480,
                          height: 528,
                          ...payload,
                          currentImageIndex: 0,
                        };
                        setNodes(prev => [...prev, newNode]);
                      }}
                      className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="复制图片 (C)"
                    >
                      <CopyIcon size={25}/>
                    </button>
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { viewMode: viewMode === 'grid' ? 'single' : 'grid' }); }}
                      className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="切换视图"
                    >
                      {viewMode === 'grid' ? <SingleIcon size={25}/> : <GridIcon size={25}/>}
                    </button>
                    {/* 智能超清按钮 - 所有图片节点可用 */}
                    {hasDisplayableImages && (
                      <div className="relative">
                        <button
                          onPointerDown={async (e) => {
                            e.stopPropagation();
                            const scale = window.prompt('请输入超清倍数 (2 或 4):', '2');
                            if (!scale) return;
                            const scaleNum = parseInt(scale, 10);
                            if (![2, 4].includes(scaleNum)) {
                              alert('仅支持 2x 或 4x 超清');
                              return;
                            }
                            const imgData = images[currentIndex];
                            if (!imgData) return;
                            try {
                              const result = await upscaleJimengImage(imgData, scaleNum);
                              const newImages = [...(node.images || []), result.imageUrl];
                              handleUpdateNode(node.id, { images: newImages });
                            } catch (err: any) {
                              alert('智能超清失败: ' + err.message);
                            }
                          }}
                          className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg text-white backdrop-blur-sm shadow-lg flex items-center justify-center"
                          title="智能超清 (2x/4x)"
                          style={{ minWidth: '48px', minHeight: '48px' }}
                        >
                          <SparklesIcon size={30}/>
                        </button>
                      </div>
                    )}
                  </div>

                  {viewMode === 'grid' ? (
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-1 overflow-y-auto p-1 content-start">
                      {images.map((img, idx) => {
                        const slotAssetId = imageAssetIds?.[idx];
                        if (!hasCanvasImagePayload(img, slotAssetId)) return null;
                        return (
                        <div key={idx} className="relative w-full group/item" style={{ aspectRatio: '1' }}>
                          <ResponsiveImagePreview
                            base64={img}
                            assetId={slotAssetId}
                            quality={0.58}
                            fill="contain"
                            className="bg-[#3A3A3A] rounded transition-opacity"
                            isInViewport={nodeInViewport}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (eyedropperTargetNodeId) {
                                handleCanvasEyedropper(node.id, eyedropperTargetNodeIdRef.current!);
                              } else {
                                handleUpdateNode(node.id, { viewMode: 'single', currentImageIndex: idx });
                              }
                            }}
                            draggable={false}
                            alt={`Generated ${idx}`}
                          />
                          <button 
                            onPointerDown={(e) => { e.stopPropagation(); openFullscreenImage(node.id, img, idx); }} 
                            className="absolute inset-0 m-auto w-8 h-8 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover/item:opacity-100 transition-opacity"
                            title="放大查看"
                          >
                            <MaximizeIcon size={50}/>
                          </button>
                        </div>
                      );})}
                    </div>
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center group/single">
                      <ResponsiveImagePreview
                        base64={images[currentIndex]}
                        assetId={imageAssetIds?.[currentIndex]}
                        quality={0.6}
                        fill="contain"
                        className={eyedropperTargetNodeId ? 'cursor-cyan-400' : ''}
                        isInViewport={nodeInViewport}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (eyedropperTargetNodeId) {
                            handleCanvasEyedropper(node.id, eyedropperTargetNodeIdRef.current!);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!eyedropperTargetNodeId) {
                            openFullscreenImage(node.id, images[currentIndex], currentIndex);
                          }
                        }}
                        draggable={false}
                        alt="Generated"
                      />
                      
                      <button 
                        onPointerDown={(e) => { e.stopPropagation(); openFullscreenImage(node.id, images[currentIndex], currentIndex); }} 
                        className="absolute inset-0 m-auto w-10 h-10 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover/single:opacity-100 transition-opacity"
                        title="放大查看"
                      >
                        <MaximizeIcon size={50}/>
                      </button>

                      {/* Pagination Controls */}
                      {images.length > 1 && (
                        <>
                          <button 
                            onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { currentImageIndex: Math.max(0, currentIndex - 1) }); }} 
                            disabled={currentIndex === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                          >
                            <ChevronLeftIcon size={75}/>
                          </button>
                          <button
                            onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { currentImageIndex: Math.min(images.length - 1, currentIndex + 1) }); }}
                            disabled={currentIndex === images.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                          >
                            <ChevronRightIcon size={75}/>
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/60 rounded-full text-[10px] text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            {currentIndex + 1} / {images.length}
                          </div>
                        </>
                      )}

                      {/* Text Overlays on Image */}
                      {(node.textOverlays || []).map((overlay) => (
                        <div
                          key={overlay.id}
                          className="absolute group/overlay"
                          style={{
                            left: `${overlay.x}%`,
                            top: `${overlay.y}%`,
                            transform: 'translate(-50%, -50%)',
                            fontSize: overlay.fontSize || 16,
                            color: overlay.color || '#ffffff',
                            backgroundColor: overlay.backgroundColor || 'rgba(0,0,0,0.5)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            cursor: 'move',
                            whiteSpace: 'nowrap',
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {overlay.text}
                          <button
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const newOverlays = (node.textOverlays || []).filter(o => o.id !== overlay.id);
                              handleUpdateNode(node.id, { textOverlays: newOverlays });
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover/overlay:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {/* Add Text Overlay Button */}
                      {hasDisplayableImages && (
                        <button
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const text = prompt('输入要添加的文字:');
                            if (text) {
                              const newOverlay = {
                                id: `text-overlay-${Date.now()}`,
                                text,
                                x: 50,
                                y: 50,
                                fontSize: 24,
                                color: '#ffffff',
                                backgroundColor: 'rgba(0,0,0,0.7)',
                              };
                              handleUpdateNode(node.id, {
                                textOverlays: [...(node.textOverlays || []), newOverlay]
                              });
                            }
                          }}
                          className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm opacity-0 group-hover/single:opacity-100 transition-opacity"
                          title="添加文字"
                        >
                          <TextIcon size={14}/>
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
                  {eyedropperTargetNodeId && eyedropperTargetNodeId !== node.id ? (
                    <div
                      className="absolute inset-0 z-[1] cursor-crosshair bg-transparent"
                      title="点击连接上游节点"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const t = eyedropperTargetNodeIdRef.current;
                        if (t) handleCanvasEyedropper(node.id, t);
                      }}
                    />
                  ) : null}
                  {node.isGenerating ? (
                    <div className="relative z-[2] flex flex-col items-center gap-1.5 text-gray-400">
                      <div className="absolute inset-0 noise-overlay pointer-events-none" />
                      <LoaderIcon size={24} />
                      {genStart != null ? (
                        <GenerationTimer
                          startedAt={genStart}
                          prefix="已用时"
                          className="text-xs tabular-nums tracking-tight"
                          showSeconds
                          secondsClassName="text-[10px] text-gray-500"
                        />
                      ) : null}
                    </div>
                  ) : (
                    node.type === 'image' ? (
                      <div className="relative z-[2] flex flex-col items-center gap-2">
                        <button 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setImportTargetNodeId(node.id);
                            fileInputRef.current?.click();
                          }}
                          className="w-16 h-16 rounded-full bg-[#333] hover:bg-blue-600 flex items-center justify-center text-white transition-colors shadow-lg"
                          title="从本地读取图片"
                        >
                          <PlusIcon size={32} />
                        </button>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        </div>
                        <button
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setEyedropperTargetNodeId(node.id);
                          }}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'}`}
                          title={
                            eyedropperTargetNodeId === node.id
                              ? '取消吸取（快捷键 X）'
                              : '吸取画布内图片（快捷键 X）'
                          }
                        >
                          <EyedropperIcon size={10} /> 吸管
                        </button>
                      </div>
                    ) : (
                      <span className="relative z-[2]" />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {node.type === 'video' && (
            <div className={`w-full ${!isSelected && videoUrls.length > 0 ? 'flex-1 min-h-0' : 'h-[680px] shrink-0'} relative border-b border-[#333] overflow-hidden group ${isSelected ? 'bg-[#2a2a2a]' : 'bg-[#1a1a1a]'}`}>
              {videoUrls.length > 0 ? (
                <>
                <div className="relative w-full h-full">
                  <video
                    key={videoUrls[currentVideoIdx] || 'v'}
                    src={videoUrls[currentVideoIdx]}
                    controls={false}
                    autoPlay={false}
                    preload="metadata"
                    crossOrigin="anonymous"
                    ref={(el) => {
                      if (el) (el as any).videoRef = el;
                    }}
                    onError={(e) => {
                      console.error('视频加载错误:', e);
                      console.log('视频URL:', videoUrls[currentVideoIdx]);
                      const videoEl = e.target as HTMLVideoElement;
                      const error = videoEl.error;
                      console.error('视频错误详情:', {
                        code: error?.code,
                        message: error?.message,
                        mediaError: error
                      });
                      
                      // 尝试修复方案
                      const originalUrl = videoUrls[currentVideoIdx];
                      
                      // 方案1: 添加缓存避免
                      if (originalUrl.includes('localhost')) {
                        videoEl.src = originalUrl + '?t=' + Date.now();
                      }
                      // 方案2: 回退到原始即梦URL（如果当前是本地URL）
                      else if (originalUrl.includes('localhost:3107')) {
                        // 尝试从节点数据中获取原始URL
                        const node = nodes.find(n => n.id === nodeId);
                        if (node?.originalVideoUrl) {
                          console.log('尝试回退到原始URL:', node.originalVideoUrl);
                          videoEl.src = node.originalVideoUrl;
                        }
                      }
                    }}
                    onLoadedData={(e) => {
                      console.log('视频已加载:', videoUrls[currentVideoIdx]);
                      console.log('视频信息:', {
                        duration: e.target.duration,
                        videoWidth: e.target.videoWidth,
                        videoHeight: e.target.videoHeight,
                        readyState: e.target.readyState
                      });
                    }}
                    className={`w-full h-full object-contain bg-black ${isSelected ? '' : 'pointer-events-none'}`}
                  />
                  {/* 调试信息 */}
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-50 hover:opacity-100">
                    {videoUrls[currentVideoIdx]?.includes('localhost:3107') ? '本地' : '远程'}
                  </div>
                </div>
                  <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {videoUrls.length > 1 && (
                      <>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = (currentVideoIdx - 1 + videoUrls.length) % videoUrls.length;
                            handleUpdateNode(node.id, { currentVideoIndex: next });
                          }}
                          className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                          title="上一条"
                        >
                          <ChevronLeftIcon size={20} />
                        </button>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = (currentVideoIdx + 1) % videoUrls.length;
                            handleUpdateNode(node.id, { currentVideoIndex: next });
                          }}
                          className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                          title="下一条"
                        >
                          <ChevronRightIcon size={20} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const u = videoUrls[currentVideoIdx];
                        if (u) downloadVideoFromUrl(u);
                      }}
                      className="p-2 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="下载当前视频"
                    >
                      <DownloadIcon size={20} />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/50 px-2 py-0.5 rounded">
                    {currentVideoIdx + 1} / {videoUrls.length}
                  </div>
                  {/* 自定义视频控制按钮 */}
                  <div className="absolute bottom-2 right-2 z-10 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const videoEl = e.currentTarget.closest('.relative')?.querySelector('video') as HTMLVideoElement;
                        if (videoEl) {
                          if (videoEl.paused) {
                            videoEl.play();
                          } else {
                            videoEl.pause();
                          }
                        }
                      }}
                      className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
                      title="播放/暂停"
                    >
                      <VideoIcon size={40} />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const videoEl = e.currentTarget.closest('.relative')?.querySelector('video') as HTMLVideoElement;
                        if (videoEl) {
                          if (videoEl.requestFullscreen) {
                            videoEl.requestFullscreen();
                          }
                        }
                      }}
                      className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
                      title="最大化"
                    >
                      <MaximizeIcon size={40} />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const videoEl = e.currentTarget.closest('.relative')?.querySelector('video') as HTMLVideoElement;
                        if (videoEl) {
                          videoEl.muted = !videoEl.muted;
                        }
                      }}
                      className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
                      title="静音/取消静音"
                    >
                      <AudioIcon size={40} />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const u = videoUrls[currentVideoIdx];
                        if (u) downloadVideoFromUrl(u);
                      }}
                      className="p-4 bg-black/70 hover:bg-black/90 rounded-xl text-white backdrop-blur-sm shadow-lg"
                      title="下载当前视频"
                    >
                      <DownloadIcon size={40} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
                  {eyedropperTargetNodeId && eyedropperTargetNodeId !== node.id ? (
                    <div
                      className="absolute inset-0 z-[1] cursor-crosshair bg-transparent"
                      title="点击连接上游节点"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const t = eyedropperTargetNodeIdRef.current;
                        if (t) handleCanvasEyedropper(node.id, t);
                      }}
                    />
                  ) : null}
                  {node.isGenerating ? (
                    <div className="relative z-[2] flex flex-col items-center gap-1.5">
                      {/* 琥珀色能量场背景 */}
                      <div className="absolute inset-0 -m-8" style={{
                        background: 'radial-gradient(ellipse at 50% 50%, rgba(255,170,0,0.2) 0%, rgba(255,100,0,0.1) 40%, transparent 70%)',
                        animation: 'videoGenPulse 2s ease-in-out infinite',
                      }} />
                      
                      {/* 能量环 */}
                      <div className="relative w-16 h-16">
                        <div style={{
                          position: 'absolute', inset: 0,
                          border: '3px solid transparent',
                          borderTopColor: '#ffaa00',
                          borderRightColor: '#ff6600',
                          borderRadius: '50%',
                          animation: 'videoEnergySpin 1s linear infinite',
                          boxShadow: '0 0 15px rgba(255,170,0,0.5), inset 0 0 15px rgba(255,170,0,0.3)',
                        }} />
                        <div style={{
                          position: 'absolute', inset: '4px',
                          border: '2px solid transparent',
                          borderBottomColor: '#ff8800',
                          borderLeftColor: '#ff4400',
                          borderRadius: '50%',
                          animation: 'videoEnergySpin 0.8s linear reverse infinite',
                          boxShadow: '0 0 10px rgba(255,136,0,0.4)',
                        }} />
                        <div style={{
                          position: 'absolute', inset: '8px',
                          background: 'radial-gradient(circle, rgba(255,170,0,0.8) 0%, rgba(255,100,0,0.4) 50%, transparent 70%)',
                          borderRadius: '50%',
                          animation: 'videoCorePulse 1s ease-in-out infinite',
                        }} />
                      </div>
                      
                      {/* 文字 */}
                      {genStart != null ? (
                        <GenerationTimer
                          startedAt={genStart}
                          prefix="已用时"
                          className="relative text-amber-400 text-xs tabular-nums tracking-tight"
                          showSeconds
                          secondsClassName="relative text-amber-500/70 text-[10px]"
                          glitch="amber"
                        />
                      ) : null}
                      
                      {/* 粒子 */}
                      {[...Array(8)].map((_, i) => (
                        <div key={i} style={{
                          position: 'absolute',
                          width: i % 2 === 0 ? '4px' : '3px',
                          height: i % 2 === 0 ? '4px' : '3px',
                          borderRadius: '50%',
                          background: i % 3 === 0 ? '#ffaa00' : i % 3 === 1 ? '#ff6600' : '#ff8800',
                          boxShadow: `0 0 6px ${i % 3 === 0 ? '#ffaa00' : i % 3 === 1 ? '#ff6600' : '#ff8800'}`,
                          left: `${15 + i * 10}%`,
                          top: `${20 + (i % 4) * 15}%`,
                          animation: `videoParticleFloat ${1.5 + i * 0.1}s ease-in-out ${i * 0.1}s infinite`,
                        }} />
                      ))}
                    </div>
                  ) : (
                    <span className="relative z-[2]">生成后在此预览（链接约 24 小时内有效）</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 语音节点内容 */}
          {node.type === 'audio' && (
            <div className="flex flex-col gap-2 p-3 bg-[#1a1a1a] shrink-0">
              {node.audio ? (
                <div className="flex flex-col gap-2">
                  <audio
                    src={node.audio}
                    controls
                    className="w-full h-8"
                  />
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>{node.audioName || '音频文件'}</span>
                    {node.audioDuration && (
                      <span>{Math.floor(node.audioDuration / 60)}:{String(Math.floor(node.audioDuration % 60)).padStart(2, '0')}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      if (confirm('确定要删除音频吗？')) {
                        handleUpdateNode(node.id, { audio: undefined, audioDuration: undefined, audioName: undefined });
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-600/30 rounded hover:bg-red-900/20"
                  >
                    删除音频
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] text-gray-500 text-center py-2">
                    上传或录制音频作为视频生成的语音参考
                  </div>
                  <input
                    type="file"
                    accept="audio/*"
                    id={`audio-upload-${node.id}`}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const base64 = ev.target?.result as string;
                          // 获取音频时长
                          const audio = new Audio();
                          audio.onloadedmetadata = () => {
                            handleUpdateNode(node.id, {
                              audio: base64,
                              audioDuration: audio.duration,
                              audioName: file.name,
                            });
                          };
                          audio.src = base64;
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = '';
                    }}
                  />
                  <label
                    htmlFor={`audio-upload-${node.id}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" x2="12" y1="3" y2="15"/>
                    </svg>
                    上传音频
                  </label>
                </div>
              )}
            </div>
          )}

          {/* 360° 全景图节点内容 */}
          {node.type === 'panorama' && (
            <ThreeEngineGate label="加载全景引擎…">
            <PanoramaNodeContent 
              node={node as PanoramaNode} 
              nodes={nodes}
              eyedropperTargetNodeId={eyedropperTargetNodeId}
              onEyedropperSelect={() => setEyedropperTargetNodeId(node.id)}
              onEyedropperPickLink={
                eyedropperTargetNodeId && eyedropperTargetNodeId !== node.id
                  ? () => {
                      const t = eyedropperTargetNodeIdRef.current;
                      if (t) handleCanvasEyedropper(node.id, t);
                    }
                  : undefined
              }
              onUpdate={(updates) => handleUpdateNode(node.id, updates)}
              onCreateImageNode={(images, x, y) => {
                const newNode: CanvasNode = {
                  id: `image-${Date.now()}`,
                  type: 'image',
                  x,
                  y,
                  width: 480,
                  height: 528,
                  prompt: '',
                  images,
                  viewMode: 'single',
                  currentImageIndex: 0
                };
                setNodes(prev => [...prev, newNode]);
              }}
            />
            </ThreeEngineGate>
          )}

          {/* 3D导演台节点内容 */}
          {node.type === 'director3d' && (
            <ThreeEngineGate label="加载 3D 引擎…">
            <Director3DNodeContent
              node={node as Director3DNode}
              nodes={nodes}
              eyedropperTargetNodeId={eyedropperTargetNodeId}
              onEyedropperSelect={() => setEyedropperTargetNodeId(node.id)}
              onUpdate={(updates) => handleUpdateNode(node.id, updates)}
              onCreateImageNode={(images, x, y) => {
                const newNode: CanvasNode = {
                  id: `image-${Date.now()}`,
                  type: 'image',
                  x,
                  y,
                  width: 480,
                  height: 528,
                  prompt: '',
                  images,
                  viewMode: 'single',
                  currentImageIndex: 0
                };
                setNodes(prev => [...prev, newNode]);
              }}
            />
            </ThreeEngineGate>
          )}

          {/* 图片标注节点内容 */}
          {node.type === 'annotation' && (
            <Suspense fallback={<HeavyNodeFallback label="加载标注工具…" />}>
            <AnnotationNodeContent
              node={node as AnnotationNode}
              nodes={nodes}
              edges={edges}
              eyedropperTargetNodeId={eyedropperTargetNodeId}
              onEyedropperSelect={() => setEyedropperTargetNodeId(node.id)}
              onEyedropperPickLink={
                eyedropperTargetNodeId && eyedropperTargetNodeId !== node.id
                  ? () => {
                      const t = eyedropperTargetNodeIdRef.current;
                      if (t) handleCanvasEyedropper(node.id, t);
                    }
                  : undefined
              }
              onUpdate={(updates) => handleUpdateNode(node.id, updates)}
              onCreateImageNode={(images, x, y) => {
                const newNode: CanvasNode = {
                  id: `image-${Date.now()}`,
                  type: 'image',
                  x,
                  y,
                  width: 480,
                  height: 528,
                  prompt: '',
                  images,
                  viewMode: 'single',
                  currentImageIndex: 0
                };
                setNodes(prev => [...prev, newNode]);
              }}
              onFullscreenImage={(base64) => setFullscreenImage(base64)}
              onDeleteEdge={handleDeleteEdge}
            />
            </Suspense>
          )}

          {/* 宫格拆分节点内容 */}
          {node.type === 'gridSplit' && (
            <GridSplitNodeContent
              node={node as GridSplitNode}
              nodes={nodes}
              edges={edges}
              eyedropperTargetNodeId={eyedropperTargetNodeId}
              onEyedropperSelect={() => setEyedropperTargetNodeId(node.id)}
              onUpdate={(updates) => handleUpdateNode(node.id, updates)}
              onCreateImageNode={(images, x, y) => {
                const gsNode = node as GridSplitNode;
                const newNodes = buildStackedImageNodesFromLists(
                  images,
                  x,
                  y,
                  gsNode.outputImageAssetIds
                );
                if (newNodes.length === 0) return;
                setNodes((prev) => [...prev, ...newNodes]);
              }}
            />
          )}

          {/* 宫格合并节点内容 */}
          {node.type === 'gridMerge' && (
            <GridMergeNodeContent
              node={node as GridMergeNode}
              nodes={nodes}
              edges={edges}
              eyedropperTargetNodeId={eyedropperTargetNodeId}
              onEyedropperSelect={() => setEyedropperTargetNodeId(node.id)}
              onUpdate={(updates) => handleUpdateNode(node.id, updates)}
              onCreateImageNode={(image, x, y, assetId) => {
                const payload = cloneImageSlotForNewNode(image, assetId);
                if (!payload) return;
                const newNode: CanvasNode = {
                  id: `image-${Date.now()}`,
                  type: 'image',
                  x,
                  y,
                  width: 480,
                  height: 528,
                  prompt: '',
                  ...payload,
                  viewMode: 'single',
                  currentImageIndex: 0,
                };
                setNodes(prev => [...prev, newNode]);
              }}
            />
          )}

          {/* 对话节点内容 */}
          {node.type === 'chat' && (
            <ChatNodeContent
              node={node as ChatNode}
              nodes={nodes}
              edges={edges}
              isSelected={isSelected}
              eyedropperTargetNodeId={eyedropperTargetNodeId}
              onEyedropperSelect={() => setEyedropperTargetNodeId(node.id)}
              onDeleteEdge={handleDeleteEdge}
              onUpdate={(updates) => handleUpdateNode(node.id, updates)}
              onSendMessage={() => void handleSendMessage(node.id)}
              onResendWithHistory={(base, prompt) => void handleSendMessage(node.id, { baseMessages: base, promptText: prompt })}
              onOpenApiSettings={() => {
                setSettingsTab('api');
                setShowSettingsModal(true);
              }}
              promptPresets={promptPresets}
              generationStartedAt={node.isGenerating ? genStart : undefined}
              onOpenBigEditor={openBigEditor}
              onActivate={() => setSelectedIds([node.id])}
              onCreateImageNode={(images, x, y) => {
                const newNode: CanvasNode = {
                  id: `image-${Date.now()}`,
                  type: 'image',
                  x,
                  y,
                  width: 480,
                  height: 528,
                  prompt: '',
                  images,
                  viewMode: 'single',
                  currentImageIndex: 0
                };
                setNodes(prev => [...prev, newNode]);
                setSelectedIds([newNode.id]);
              }}
              onOpenFullscreen={(base64) => void openFullscreenFromBase64(base64)}
              onCancelGeneration={handleCancelGeneration}
            />
          )}

          {/* Header */}
        <div className="min-h-8 py-1.5 bg-[#252525] border-b border-[#333] flex items-center justify-between px-3 cursor-grab active:cursor-grabbing shrink-0">
          <div className="flex items-center gap-2">
            {headerIcon}
            {node.type === 'text' && (
              <>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); setEyedropperTargetNodeId(node.id); }}
                  className={`ml-1 px-1.5 py-0.5 rounded text-[10px] text-white ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
                  title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取文本"}
                >
                  <EyedropperIcon size={10} />
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const text = node.prompt?.trim();
                    if (!text) {
                      alert('请先在文本节点输入要优化的提示词内容');
                      return;
                    }
                    handleOptimizePrompt(node.id, text);
                  }}
                  className="ml-1 px-1.5 py-0.5 rounded text-[30px] text-white bg-purple-600 hover:bg-purple-500"
                  title="AI优化提示词（生成Seedance 2.0提示词）"
                >
                  优化提示词
                </button>
                <select
                  className="ml-2 bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-[30px] text-gray-200 outline-none focus:border-blue-500"
                  value={textNodeFontSize}
                  onChange={(e) => setTextNodeFontSize(Number(e.target.value))}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="文本节点字号"
                >
                  {[11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 50].map((px) => (
                    <option key={px} value={px}>{px}px</option>
                  ))}
                </select>
              </>
            )}
          </div>
          {isSelected && (node.type === 't2i' || node.type === 'i2i' || node.type === 'panoramaT2i') && (
            <>
              <select className="nodemodel-select bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500 flex-1 min-w-[90px]" value={node.model || defaultCanvasImageModel()} onChange={(e) => { const m = e.target.value; const patch: Partial<CanvasNode> = { model: m }; if (isGptImage2CanvasModelId(m) || isManxueGptImage2Model(m)) patch.resolution = '2k'; handleUpdateNode(node.id, patch); }} onPointerDown={e => e.stopPropagation()}>
                {(node.type === 't2i' || node.type === 'panoramaT2i') ? (<><option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option><option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option><optgroup label="满 e（manxueapi.com）"><option value="gemini-3.1-flash-image-preview-2k-manxue">Gemini 3.1 Flash Image 2K（满 e）</option><option value="gemini-3-pro-image-preview-2k-manxue">Gemini 3 Pro Image 2K（满 e）</option><option value="gpt-image-2-manxue">GPT Image 2（满 e）</option><option value="gpt-image-2-pro-manxue">GPT Image 2 Pro（满 e）</option><option value="gemini-3-pro-image-preview-4k-manxue">Gemini 3 Pro Image 4K（满 e）</option><option value="gemini-3.1-flash-image-preview-4k-manxue">Gemini 3.1 Flash Image 4K（满 e）</option></optgroup><optgroup label="ToAPIs"><option value="gpt-image-2">GPT Image 2（ToAPIs）</option><option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option><option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option><option value="nano-banana-2">Nano-Banana 2（ToAPIs）</option><option value="imagen-4">Imagen 4</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option></optgroup><optgroup label="即梦 (Dreamina)"><option value="jimeng-image-5.0">即梦 5.0</option><option value="jimeng-image-4.6">即梦 4.6</option><option value="jimeng-image-4.5">即梦 4.5</option><option value="jimeng-image-4.0">即梦 4.0</option></optgroup></>) : (<><option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option><option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option><optgroup label="满 e（manxueapi.com）"><option value="gemini-3.1-flash-image-preview-2k-manxue">Gemini 3.1 Flash Image 2K（满 e）</option><option value="gemini-3-pro-image-preview-2k-manxue">Gemini 3 Pro Image 2K（满 e）</option><option value="gpt-image-2-manxue">GPT Image 2（满 e）</option><option value="gpt-image-2-pro-manxue">GPT Image 2 Pro（满 e）</option><option value="gemini-3-pro-image-preview-4k-manxue">Gemini 3 Pro Image 4K（满 e）</option><option value="gemini-3.1-flash-image-preview-4k-manxue">Gemini 3.1 Flash Image 4K（满 e）</option></optgroup><optgroup label="ToAPIs"><option value="gpt-image-2">GPT Image 2（ToAPIs）</option><option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option><option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option><option value="nano-banana-2">Nano-Banana 2（ToAPIs）</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option></optgroup><optgroup label="即梦 (Dreamina)"><option value="jimeng-image-5.0">即梦 5.0</option><option value="jimeng-image-4.6">即梦 4.6</option><option value="jimeng-image-4.5">即梦 4.5</option><option value="jimeng-image-4.0">即梦 4.0</option></optgroup></>)}
              </select>
              <div className="nodemeta-skip-scale flex items-center gap-0.5">
                <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.aspectRatio || (node.type === 'panoramaT2i' ? '2:1' : '16:9')} onChange={(e) => handleUpdateNode(node.id, { aspectRatio: e.target.value })} onPointerDown={e => e.stopPropagation()}>
                  {node.type === 'panoramaT2i' ? (<><option value="2:1">2:1</option><option value="21:9">21:9</option></>) : (<><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="21:9">21:9</option><option value="4:3">4:3</option><option value="3:4">3:4</option></>)}
                </select>
                <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.resolution || '2k'} onChange={(e) => handleUpdateNode(node.id, { resolution: e.target.value })} onPointerDown={e => e.stopPropagation()}><option value="4k">4K</option><option value="2k">2K</option><option value="1k">1K</option></select>
                <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.imageCount || 1} onChange={(e) => handleUpdateNode(node.id, { imageCount: parseInt(e.target.value) })} onPointerDown={e => e.stopPropagation()}><option value={1}>1</option><option value={2}>2</option><option value={4}>4</option></select>
                {isGptImage2CanvasModelId(node.model || defaultCanvasImageModel()) || isManxueGptImage2Model(node.model || defaultCanvasImageModel()) && (
                  <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.quality || 'high'} onChange={(e) => handleUpdateNode(node.id, { quality: e.target.value })} onPointerDown={e => e.stopPropagation()}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="auto">auto</option>
                  </select>
                )}
              </div>
            </>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleResetNodeSize(node.id);
              }}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-[#333] hover:text-blue-400"
              title="恢复为默认宽高"
            >
              <MaximizeIcon size={node.type === 'gridSplit' || node.type === 'gridMerge' ? 15 : 12} />
              <span className="whitespace-nowrap">重置大小</span>
            </button>
            <button
              type="button"
              title="删除节点（Alt+Q）"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleDeleteNode(node.id);
              }}
              className="text-gray-500 hover:text-red-400 transition-colors p-1"
            >
              <TrashIcon size={node.type === 'gridSplit' || node.type === 'gridMerge' ? 21 : 14} />
            </button>
          </div>
        </div>

                {node.type === 'video' && (() => {
          const vm = node.model || '';
          const modelSelectValue = node.model || '';
          const isSora = isVideoSoraStyleModel(vm);
          const isVeo = isVideoVeoStyleModel(vm);
          const isGroDur = isVideoGrokDurationStyleModel(vm);
          const isDoubao = vm === 'doubao-seedance-1-5-pro' || vm === 'doubao-seedance-2-0-260128' || vm === 'doubao-seedance-2-0-fast-260128';
          const isSeedance2 = vm === 'seedance-2';
          const isSeedance2Fast = vm === 'seedance-2-fast';
          const isGemini = vm === 'gemini-omni-flash';
          const isDoubaoSeedance2 = vm === 'doubao-seedance-2-0-260128' || vm === 'doubao-seedance-2-0-fast-260128';
          const vSlots = buildIncomingRefSlots(node.id, edges, nodes);
          const imageSlots = vSlots.filter((s) => s.kind === 'image');
          const videoSlots = vSlots.filter((s) => s.kind === 'video');
          const audioSlots = vSlots.filter((s) => s.kind === 'audio');
          return (
          <div className="flex flex-col gap-3 p-3 bg-[#252525] border-b border-[#333] text-xs shrink-0">
            {(() => {
              return (
                <div className="flex items-center gap-3 px-3 py-2 bg-[#1a1a1a] rounded-lg text-xs">
                  <span className="text-gray-400 shrink-0 font-medium">参考素材:</span>
                  <span className="text-green-400 font-semibold shrink-0">
                    {imageSlots.length} 图
                    {videoSlots.length > 0 && (
                      <span className="text-amber-400"> · {videoSlots.length} 视频</span>
                    )}
                    {audioSlots.length > 0 && (
                      <span className="text-blue-400"> · {audioSlots.length} 语音</span>
                    )}
                  </span>
                  <div className="flex gap-2 ml-2 flex-wrap">
                    {vSlots.slice(0, 12).map((slot) => (
                      <div key={`${node.id}-vslot-${slot.n}`} className="relative group">
                        <div className="absolute -top-1 left-0 z-[1] rounded bg-black/70 px-1 text-[8px] font-bold leading-none text-cyan-300">
                          R{slot.n}
                        </div>
                        {slot.kind === 'image' && slot.imageBase64 ? (
                          <OptimizedImage
                            base64={slot.imageBase64}
                            maxSide={80}
                            quality={0.72}
                            alt={slot.label}
                            className="w-9 h-9 rounded border border-[#444] object-cover"
                          />
                        ) : slot.kind === 'video' && slot.videoUrl ? (
                          <video
                            src={slot.videoUrl}
                            className="w-9 h-9 rounded border border-[#444] object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : slot.kind === 'audio' ? (
                          <div className="w-9 h-9 rounded border border-[#444] bg-[#333] flex items-center justify-center" title={slot.label}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                              <line x1="12" x2="12" y1="19" y2="22"/>
                            </svg>
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
                            handleDeleteEdge(slot.edgeId);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="取消引用"
                        >
                          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        </button>
                      </div>
                    ))}
                    {vSlots.length > 12 && (
                      <span className="flex items-center text-gray-500">+{vSlots.length - 12}</span>
                    )}
                  </div>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setEyedropperTargetNodeId(node.id);
                    }}
                    className={`ml-auto shrink-0 rounded-lg px-3 py-1.5 text-white text-xs font-medium ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
                    title={eyedropperTargetNodeId === node.id ? '取消吸取' : '吸取参考（图片 / 视频 / 语音节点）'}
                  >
                    <EyedropperIcon size={14} />
                  </button>
                </div>
              );
            })()}
            <div className="text-xs text-gray-500 px-1 leading-relaxed">
              需 OpenAI 兼容 + ToAPIs Base URL。最多 3 张参考图（视频将截取关键帧）{audioSlots.length > 0 && <span className="text-blue-400 font-medium">· 已连接语音参考</span>}。
              {isVeo
                ? ' · Veo：固定 8 秒；画幅 16:9 或 9:16；720p/1080p/4k'
                : isSora
                  ? ' · Sora 系：4/8/12 秒、16:9 或 9:16、720p'
                  : isGroDur
                    ? ' · Grok：多档秒数与画幅'
                    : isDoubao
                      ? ' · Seedance 2：5-10 秒；画幅 16:9/9:16/1:1'
                      : ''}
            </div>
            {!isSora && !isVeo && isGroDur && (
              <div className="text-[9px] text-amber-600/95 px-1 leading-snug">
                分辨率：Grok 系路径已随请求发送 resolution；若成品仍为 480p，多为上游默认。
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
            <select
                className="nodemodel-select bg-[#222222] border border-[#444] rounded-lg px-3 py-2 text-gray-300 outline-none focus:border-amber-500 min-w-[160px] text-sm"
                value={modelSelectValue}
                onChange={(e) => {
                  const m = e.target.value;
                  const updates: Partial<CanvasNode> = { model: m };
                  if (m === 'sora-2-vvip') {
                    updates.videoResolution = '720p';
                    const d = node.videoDuration ?? 10;
                    updates.videoDuration = d === 4 || d === 8 || d === 12 ? d : 8;
                    const ar = node.aspectRatio || '16:9';
                    if (ar !== '16:9' && ar !== '9:16') updates.aspectRatio = '16:9';
                  } else if (m === 'veo3.1-fast') {
                    updates.videoDuration = 8;
                    updates.videoResolution =
                      node.videoResolution === '1080p' || node.videoResolution === '4k'
                        ? node.videoResolution
                        : '720p';
                    const ar = node.aspectRatio || '16:9';
                    if (!['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'].includes(ar)) updates.aspectRatio = '16:9';
                  } else if (m === 'doubao-seedance-1-5-pro') {
                    const d = node.videoDuration ?? 8;
                    updates.videoDuration = [4, 5, 8, 10, 12, 15].includes(d) ? d : 8;
                    updates.videoResolution =
                      node.videoResolution === '480p' || node.videoResolution === '1080p'
                        ? node.videoResolution
                        : '720p';
                  } else if (m === 'seedance-2') {
                    const d = node.videoDuration ?? 8;
                    updates.videoDuration = [4, 5, 8, 10, 12, 15].includes(d) ? d : 8;
                    updates.videoResolution = node.videoResolution === '1080p' ? '1080p' : '720p';
                    const ar = node.aspectRatio || '16:9';
                    if (!['16:9', '9:16', '1:1'].includes(ar)) updates.aspectRatio = '16:9';
                  } else if (m === 'seedance-2-fast') {
                    const d = node.videoDuration ?? 8;
                    updates.videoDuration = [4, 5, 8, 10, 12].includes(d) ? d : 8;
                    updates.videoResolution = '720p';
                    const ar = node.aspectRatio || '16:9';
                    if (!['16:9', '9:16', '1:1'].includes(ar)) updates.aspectRatio = '16:9';
                  } else if (m === 'gemini-omni-flash') {
                    const d = node.videoDuration ?? 6;
                    updates.videoDuration = [6, 10].includes(d) ? d : 6;
                    updates.videoResolution = '720p';
                  } else if (m === 'doubao-seedance-2-0-260128' || m === 'doubao-seedance-2-0-fast-260128') {
                    const d = node.videoDuration ?? 8;
                    updates.videoDuration = [4, 6, 8, 10, 12, 15].includes(d) ? d : 8;
                    updates.videoResolution =
                      node.videoResolution === '480p' || node.videoResolution === '1080p'
                        ? node.videoResolution
                        : '720p';
                    const ar = node.aspectRatio || '16:9';
                    if (!['16:9', '9:16', '1:1', '4:3', '3:4'].includes(ar)) updates.aspectRatio = '16:9';
                  } else {
                    const d = node.videoDuration ?? 8;
                    if (d === 4 || d === 8 || d === 12) updates.videoDuration = 10;
                    if (node.videoResolution === '1080p' || node.videoResolution === '4k') {
                      updates.videoResolution = '720p';
                    }
                  }
                  handleUpdateNode(node.id, updates);
                }}
              onPointerDown={e => e.stopPropagation()}
            >
                <optgroup label="ToAPIs">
                  <option value="veo3.1-fast">Veo 3.1 Fast</option>
                  <option value="grok-video-3">Grok Video 3</option>
                  <option value="sora-2-vvip">Sora2 VVIP</option>
                  <option value="doubao-seedance-1-5-pro">Doubao SeeDance 1.5 Pro</option>
                  <option value="seedance-2">Seedance 2</option>
                  <option value="seedance-2-fast">Seedance 2 Fast</option>
                  <option value="gemini-omni-flash">Gemini Omni Flash</option>
                </optgroup>
                <optgroup label="AIID (豆包Seedance2.0)">
                  <option value="doubao-seedance-2-0-260128">Doubao Seedance 2.0</option>
                  <option value="doubao-seedance-2-0-fast-260128">Doubao Seedance 2.0 Fast</option>
                </optgroup>
                <optgroup label="即梦 (Dreamina)">
                  <option value="jimeng-seedance2.0fast">即梦 Seedance 2.0 (Fast)</option>
                  <option value="jimeng-seedance2.0">即梦 Seedance 2.0</option>
                  <option value="jimeng-seedance2.0fast-vip">即梦 Seedance 2.0 Fast (VIP)</option>
                  <option value="jimeng-seedance2.0-vip">即梦 Seedance 2.0 (VIP)</option>
                </optgroup>
            </select>
              {isJimengVideoModel(node.model) && (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500"
                  value={node.videoMode || 'image2video'}
                  onChange={(e) => handleUpdateNode(node.id, { videoMode: e.target.value as any })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="image2video">图生视频</option>
                  <option value="frames2video">首尾帧</option>
                  <option value="multiframe2video">智能多帧</option>
                  <option value="multimodal2video">全能参考</option>
                </select>
              )}
              <div className="nodemeta-skip-scale flex flex-wrap items-center gap-1.5">
              {isVeo ? (
                <span className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-400 text-xs whitespace-nowrap">
                  8 秒（固定）
                </span>
              ) : isSora ? (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[4, 8, 12].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={e => e.stopPropagation()}
            >
                  <option value={4}>4 秒 (7毛)</option>
                  <option value={8}>8 秒 (1元)</option>
                  <option value={12}>12 秒 (1.3元)</option>
            </select>
              ) : isDoubao ? (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[4, 5, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={4}>4 秒</option>
                  <option value={5}>5 秒</option>
                  <option value={8}>8 秒</option>
                  <option value={10}>10 秒</option>
                  <option value={12}>12 秒</option>
                  <option value={15}>15 秒</option>
                </select>
              ) : isDoubaoSeedance2 ? (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[4, 6, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={4}>4 秒</option>
                  <option value={6}>6 秒</option>
                  <option value={8}>8 秒</option>
                  <option value={10}>10 秒</option>
                  <option value={12}>12 秒</option>
                  <option value={15}>15 秒</option>
                </select>
              ) : isSeedance2 ? (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[4, 5, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={4}>4 秒</option>
                  <option value={5}>5 秒</option>
                  <option value={8}>8 秒</option>
                  <option value={10}>10 秒</option>
                  <option value={12}>12 秒</option>
                  <option value={15}>15 秒</option>
                </select>
              ) : isSeedance2Fast ? (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[4, 5, 8, 10, 12].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={4}>4 秒</option>
                  <option value={5}>5 秒</option>
                  <option value={8}>8 秒</option>
                  <option value={10}>10 秒</option>
                  <option value={12}>12 秒</option>
                </select>
              ) : isGemini ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[6, 10].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 6}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={6}>6 秒 (1元)</option>
                  <option value={10}>10 秒 (1.4元)</option>
                </select>
              ) : isJimengVideoModel(node.model) ? (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={[4, 5, 7, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={4}>4 秒</option>
                  <option value={5}>5 秒</option>
                  <option value={7}>7 秒</option>
                  <option value={8}>8 秒</option>
                  <option value={10}>10 秒</option>
                  <option value={12}>12 秒</option>
                  <option value={15}>15 秒</option>
                </select>
              ) : (
            <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.videoDuration ?? 10}
                  onChange={(e) => handleUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value={5}>5 秒（API 提交为 6 秒）</option>
                  <option value={10}>10 秒</option>
                  <option value={15}>15 秒</option>
                  <option value={20}>20 秒</option>
                  <option value={25}>25 秒</option>
                  <option value={30}>30 秒</option>
                </select>
              )}
              {isVeo ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.aspectRatio || '16:9'}
              onChange={(e) => handleUpdateNode(node.id, { aspectRatio: e.target.value })}
              onPointerDown={e => e.stopPropagation()}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
                  <option value="1:1">1:1（按 16:9 提交）</option>
                  <option value="4:3">4:3（按 16:9 提交）</option>
                  <option value="3:4">3:4（按 16:9 提交）</option>
                  <option value="3:2">3:2（按 16:9 提交）</option>
                  <option value="2:3">2:3（按 16:9 提交）</option>
                </select>
              ) : isSora ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.aspectRatio === '9:16' ? '9:16' : '16:9'}
                  onChange={(e) => handleUpdateNode(node.id, { aspectRatio: e.target.value })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                </select>
              ) : isDoubao ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.aspectRatio || '16:9'}
                  onChange={(e) => handleUpdateNode(node.id, { aspectRatio: e.target.value })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                  <option value="21:9">21:9</option>
                </select>
              ) : (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.aspectRatio || '16:9'}
                  onChange={(e) => handleUpdateNode(node.id, { aspectRatio: e.target.value })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="3:2">3:2</option>
                  <option value="2:3">2:3</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
              )}
              {isSora ? (
                <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p</span>
              ) : isVeo ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={
                    node.videoResolution === '4k'
                      ? node.videoResolution
                      : '1080p'
                  }
                  onChange={(e) =>
                    handleUpdateNode(node.id, {
                      videoResolution: e.target.value as '1080p' | '4k',
                    })
                  }
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="1080p">1080p (6毛/次)</option>
                  <option value="4k">4K (1.5元/次)</option>
                </select>
              ) : isDoubao ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.videoResolution === '480p' || node.videoResolution === '1080p' ? node.videoResolution : '720p'}
                  onChange={(e) =>
                    handleUpdateNode(node.id, { videoResolution: e.target.value as '480p' | '720p' | '1080p' })
                  }
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="480p">480p (1.4毛/秒)</option>
                  <option value="720p">720p (2.9毛/秒)</option>
                  <option value="1080p">1080p (7.5毛/秒)</option>
                </select>
              ) : isSeedance2 ? (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.videoResolution === '1080p' ? '1080p' : '720p'}
                  onChange={(e) =>
                    handleUpdateNode(node.id, { videoResolution: e.target.value as '720p' | '1080p' })
                  }
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="720p">720p (1元/秒)</option>
                  <option value="1080p">1080p (2.5元/秒)</option>
                </select>
              ) : isSeedance2Fast ? (
                <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p (8毛/秒)</span>
              ) : isGemini ? (
                <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p</span>
              ) : (
                <select
                  className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
                  value={node.videoResolution === '480p' ? '480p' : '720p'}
                  onChange={(e) => handleUpdateNode(node.id, { videoResolution: e.target.value as '480p' | '720p' })}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                </select>
              )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* i2i reference bar */}
          {(node.type === 'i2i' || node.type === 'panoramaT2i') && (() => {
            const i2iIncomingEdges = edges.filter(e => e.targetId === node.id);
            const i2iSourceNodes = i2iIncomingEdges
              .map(e => nodes.find(n => n.id === e.sourceId))
              .filter(Boolean) as CanvasNode[];
            return i2iIncomingEdges.length > 0 ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-[#1e1e1e] border-b border-[#333] text-[10px] shrink-0">
                <span className="text-gray-500">参考:</span>
                <span className="text-green-400 font-medium">{i2iIncomingEdges.length}张</span>
                <div className="flex gap-0.5 ml-1 flex-wrap">
                  {i2iIncomingEdges.slice(0, 12).map((edge, idx) => {
                    const srcNode = i2iSourceNodes[idx];
                    const img = srcNode?.images?.[0];
                    const imgAssetId = srcNode?.imageAssetIds?.[0];
                    if (!hasCanvasImagePayload(img, imgAssetId)) return null;
                    return (
                      <div key={edge.id} className="relative group">
                        <OptimizedImage base64={img} assetId={imgAssetId} maxSide={64} quality={0.72} alt={`R${idx+1}`} className="w-9 h-9 object-cover rounded border border-[#444]" />
                        <button
                          onPointerDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="取消参考"
                        >
                          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        </button>
                      </div>
                    );
                  })}
                  {i2iIncomingEdges.length > 12 && <span className="text-gray-600">+{i2iIncomingEdges.length-12}</span>}
                </div>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); setEyedropperTargetNodeId(node.id); }}
                  className={`ml-auto px-1.5 py-0.5 rounded text-[10px] text-white ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
                  title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
                >
                  <EyedropperIcon size={10} />
                </button>
              </div>
            ) : null;
          })()}
          {/* Text Area - panoramaT2i 使用内置提示词，不显示输入框；视频节点未选中且有视频时隐藏 */}
          {(node.type === 't2i' || node.type === 'i2i' || node.type === 'text' || (node.type === 'video' && isSelected)) && (
            <div
              className={`flex flex-col min-h-0 overflow-hidden ${
                node.type === 't2i' || node.type === 'i2i' ? 'flex-[3] basis-0' : 'flex-1'
              }`}
              style={node.type === 'text' ? {} : undefined}
            >
              {/* 预设按钮区域 - i2i节点 */}
              {node.type === 'i2i' && (
                <I2iPresetCategorySelect
                  nodeId={node.id}
                  activePresets={node.activePresets}
                  promptPresets={promptPresets}
                  presetDomainOverrides={promptPresetDomainOverrides}
                  presetCategoryOverrides={promptPresetCategoryOverrides}
                  onTogglePreset={handleTogglePreset}
                  onClearPreset={handleClearPreset}
                />
              )}
              {/* 预设按钮区域 - t2i节点 */}
              {node.type === 't2i' && (
                <T2iPresetCategorySelect
                  nodeId={node.id}
                  activePresets={node.activePresets}
                  promptPresets={promptPresets}
                  presetDomainOverrides={promptPresetDomainOverrides}
                  onTogglePreset={handleTogglePreset}
                  onClearPreset={handleClearPreset}
                />
              )}
              <div className="relative flex flex-col flex-1 min-h-0">
                {(node.type === 'i2i' || node.type === 'video') && (
                  <RefPickBar
                    slots={buildIncomingRefSlots(node.id, edges, nodes)}
                    disabled={node.isGenerating}
                    onInsert={(tok) => {
                      // 获取当前 prompt 和光标位置
                      const curPrompt = node.prompt || '';
                      const inputEl = document.querySelector(`[data-node-prompt="${node.id}"]`) as HTMLTextAreaElement | null;
                      let insertPos = curPrompt.length;
                      if (inputEl) {
                        const sel = inputEl.selectionStart;
                        if (sel !== null) {
                          insertPos = sel;
                        }
                      }
                      const next = curPrompt.slice(0, insertPos) + tok + curPrompt.slice(insertPos);
                      handleUpdateNode(node.id, { prompt: next });
                      requestAnimationFrame(() => {
                        if (inputEl) {
                          inputEl.focus();
                          inputEl.selectionStart = inputEl.selectionEnd = insertPos + tok.length;
                        }
                      });
                    }}
                  />
                )}
                {node.type === 'text' && !(isSelected && editingTextNodeIds.has(node.id)) ? (
                  <div
                    className="w-full h-full bg-[#222222] text-gray-200 p-3 rounded-lg border border-[#444] overflow-y-auto leading-relaxed whitespace-pre-wrap break-words text-node-content relative"
                    style={{ fontSize: textNodeFontSize + 'px', minHeight: '120px' }}
                    onPointerDown={(e) => {
                      if (eyedropperTargetNodeId) {
                        return;
                      }
                      e.stopPropagation();
                    }}
                    onDoubleClick={(e) => {
                      if (!isSelected) {
                        e.stopPropagation();
                        setSelectedIds([node.id]);
                        setEditingTextNodeIds(prev => { const next = new Set(prev); next.add(node.id); return next; });
                      }
                    }}
                  >
                    {node.isGenerating ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#222222]/90 rounded-lg z-10">
                        <div className="gen-progress-orb mb-3" style={{ transform: 'scale(3)' }}>
                          <div className="gen-progress-orb-ring" />
                          <div className="gen-progress-orb-core">
                            <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>
                        {genStart != null ? (
                          <GenerationTimer
                            startedAt={genStart}
                            className="gen-text-glitch tabular-nums text-purple-400 mt-5 text-[20px]"
                            showSeconds
                            secondsClassName="text-gray-500 mt-1 text-[14px]"
                            glitch
                          />
                        ) : null}
                      </div>
                    ) : null}
                    {node.prompt || <span className="text-gray-500">双击编辑文本</span>}
                    <style>{`
                      .text-node-content::-webkit-scrollbar { width: 72px; }
                      .text-node-content::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 4px; }
                      .text-node-content::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; border: 4px solid transparent; background-clip: content-box; }
                      .text-node-content::-webkit-scrollbar-thumb:hover { background: #666; border: 4px solid transparent; background-clip: content-box; }
                      .text-node-textarea::-webkit-scrollbar { width: 72px; }
                      .text-node-textarea::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 4px; }
                      .text-node-textarea::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; border: 4px solid transparent; background-clip: content-box; }
                      .text-node-textarea::-webkit-scrollbar-thumb:hover { background: #666; border: 4px solid transparent; background-clip: content-box; }
                    `}</style>
                  </div>
                ) : (
                <textarea
                  data-node-prompt={node.id}
                  className="w-full h-full bg-[#222222] text-gray-200 p-3 rounded-lg border border-[#444] focus:outline-none focus:border-blue-500 transition-colors resize-none leading-relaxed text-node-textarea" style={{ fontSize: textNodeFontSize + 'px', minHeight: node.type === 'i2i' ? '80px' : '120px' }}
                  value={node.prompt}
                  onChange={(e) => handleUpdateNode(node.id, { prompt: e.target.value })}
                  placeholder=""
                  readOnly={node.type === 'text' && !(isSelected && editingTextNodeIds.has(node.id))}
                  onPointerDown={(e) => {
                    // 吸管模式激活时，允许事件冒泡触发吸管连线
                    if (eyedropperTargetNodeId) return;
                    e.stopPropagation();
                    // 双击检测：基于时间戳
                    const now = Date.now();
                    if (now - bigEditorLastClickRef.current < 320) {
                      bigEditorLastClickRef.current = 0;
                      openBigEditor(node.prompt || '', (v) => handleUpdateNode(node.id, { prompt: v }));
                    } else {
                      bigEditorLastClickRef.current = now;
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openBigEditor(node.prompt || '', (v) => handleUpdateNode(node.id, { prompt: v }));
                  }}
                />
                )}
              </div>
              {(node.type === 't2i' || node.type === 'i2i') && (
                <div className="flex gap-2 w-full shrink-0">
                  <div className={`relative flex-1 min-w-0 ${node.isGenerating ? 'gen-btn-generating' : 'gen-btn-holo'}`}>
                    {/* 角落装饰 - 仅非生成状态显示 */}
                    {!node.isGenerating && (
                      <>
                        <span className="gen-btn-cyber-corner top-left" />
                        <span className="gen-btn-cyber-corner top-right" />
                        <span className="gen-btn-cyber-corner bottom-left" />
                        <span className="gen-btn-cyber-corner bottom-right" />
                      </>
                    )}
                    {/* 神经网络粒子 - 仅非生成状态显示 */}
                    {!node.isGenerating && <span className="holo-particles" />}
                    <button
                      type="button"
                      onPointerDown={(e) => { e.stopPropagation(); handleGenerate(node.id); }}
                      disabled={node.isGenerating}
                      className={`relative w-full py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition-all
                        ${node.isGenerating ? 'text-cyan-400 cursor-wait' : 'text-white hover:brightness-110'}`}
                    >
                      {node.isGenerating ? (
                        <span className="flex items-center gap-2">
                          {/* 环形进度能量球 */}
                          <div className="gen-progress-orb">
                            <div className="gen-progress-orb-ring" />
                            <div className="gen-progress-orb-core">
                              <svg className="w-3 h-3 text-cyan-400" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </div>
                          </div>
                          {genStart != null ? (
                            <GenerationTimer
                              startedAt={genStart}
                              className="gen-text-glitch tabular-nums text-[11px] opacity-90"
                              showSeconds
                              secondsClassName="text-[10px] opacity-75 text-cyan-300/70"
                              glitch
                            />
                          ) : null}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {/* 全息图标 */}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="gen-text-holo">生成图片</span>
                        </span>
                      )}
                    </button>
                  </div>
                  {node.isGenerating && (
                    <button
                      type="button"
                      title="仅在点击「生成图片」后出现，用于中断 ToAPIs 轮询"
                      onPointerDown={(e) => { e.stopPropagation(); handleCancelGeneration(node.id); }}
                      className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium gen-btn-cancel text-cyan-400 hover:text-cyan-300"
                    >
                      取消
                    </button>
                  )}
                </div>
              )}
              {node.type === 'video' && (
                <div className={`flex gap-2 w-full shrink-0${isSelected ? '' : ' hidden'}`}>
                  <div className={`relative flex-1 min-w-0 ${node.isGenerating ? 'gen-btn-generating' : 'gen-btn-video-core'}`}>
                    <button
                      type="button"
                      onPointerDown={(e) => { e.stopPropagation(); handleGenerateVideo(node.id); }}
                      disabled={node.isGenerating}
                      className={`relative w-full py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition-all
                        ${node.isGenerating ? 'text-amber-400 cursor-wait' : 'text-white hover:brightness-110'}`}
                    >
                      {node.isGenerating ? (
                        <span className="flex items-center gap-2">
                          {/* 环形进度能量球 - 琥珀色 */}
                          <div className="gen-progress-orb">
                            <div className="gen-progress-orb-ring" style={{
                              background: 'conic-gradient(from 0deg, #ffaa00 0deg, #ff6600 180deg, #ffaa00 360deg)',
                              filter: 'drop-shadow(0 0 6px rgba(255, 170, 0, 0.8))'
                            }} />
                            <div className="gen-progress-orb-core" style={{
                              borderColor: 'rgba(255, 170, 0, 0.4)',
                              animationName: 'corePulseAmber'
                            }}>
                              <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none">
                                <path d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </div>
                          </div>
                          {genStart != null ? (
                            <GenerationTimer
                              startedAt={genStart}
                              className="gen-text-glitch-amber tabular-nums text-[11px] opacity-90"
                              showSeconds
                              secondsClassName="text-[10px] opacity-75 text-amber-300/70"
                              glitch="amber"
                            />
                          ) : null}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {/* 能量核心图标 */}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <path d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span style={{
                            background: 'linear-gradient(90deg, #ffaa00 0%, #ffffff 25%, #ff6600 50%, #ffffff 75%, #ffaa00 100%)',
                            backgroundSize: '200% 100%',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            filter: 'drop-shadow(0 0 8px rgba(255, 170, 0, 0.6))'
                          }}>生成视频</span>
                        </span>
                      )}
                    </button>
                  </div>
                  {node.isGenerating && (
                    <button
                      type="button"
                      title="仅在点击「生成视频」后出现，用于中断 ToAPIs 轮询"
                      onPointerDown={(e) => { e.stopPropagation(); handleCancelGeneration(node.id); }}
                      className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium gen-btn-cancel gen-btn-cancel-video text-amber-400 hover:text-amber-300"
                    >
                      取消
                    </button>
                  )}
                </div>
              )}
              
              {renderNodeErrorPanel(node)}
            </div>
          )}
          {/* 全景图生成节点 - 预设按钮 + 提示词可修改 */}
          {node.type === 'panoramaT2i' && (
            <div className="flex flex-col flex-[3] basis-0 min-h-0 overflow-hidden">
              {/* 工具栏 */}
              <div className="flex items-center gap-1 p-2 bg-[#252525] border-b border-[#333] shrink-0">
                <button
                  onPointerDown={(e) => { e.stopPropagation(); setEyedropperTargetNodeId(node.id); }}
                  className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
                  title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
                >
                  <EyedropperIcon size={10} /> 吸管
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const base64 = (evt.target?.result as string).split(',')[1];
                        handleUpdateNode(node.id, { images: [base64] });
                      };
                      reader.readAsDataURL(file);
                    };
                    input.click();
                  }}
                  className="py-1 px-2 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-1"
                  title="导入图片"
                >
                  <ImageIcon size={10} /> 导入
                </button>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); handleCopyToImage(node.id); }}
                  className="py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white flex items-center gap-1"
                  title="复制视口到图片节点"
                >
                  <CopyIcon size={10} /> 复制
                </button>
              </div>
              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-2 min-h-0">
                {/* 图片预览 */}
                {countNodeImageSlots(node.images, node.imageAssetIds) > 0 && (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="text-[10px] text-gray-400">生成: {node.images?.length ?? 0}张</div>
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {node.images?.map((img, idx) => {
                        const slotAssetId = node.imageAssetIds?.[idx];
                        if (!hasCanvasImagePayload(img, slotAssetId)) return null;
                        return (
                        <div key={idx} className="relative shrink-0 w-14 h-14 rounded overflow-hidden border border-[#444]">
                          <OptimizedImage
                            base64={img}
                            assetId={slotAssetId}
                            maxSide={Math.round(160 * thumbResolutionRef.v / 100)}
                            quality={0.72}
                            alt={`图${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onPointerDown={(e) => { e.stopPropagation(); handleCopyToImage(node.id); }}
                            className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center text-white text-xs"
                            title="复制"
                          >
                            复制
                          </button>
                        </div>
                      );})}
                    </div>
                  </div>
                )}
                {/* 当前激活的预设显示 */}
                {node.activePresets && node.activePresets.length > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 rounded border border-indigo-600/50 mb-2">
                    <span className="text-[10px] text-indigo-400">预设:</span>
                    <span className="text-xs text-white font-bold">{node.activePresets.join(', ')}</span>
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); handleClearPreset(node.id); }}
                      className="ml-auto text-[10px] text-gray-400 hover:text-white px-1 py-0.5 rounded hover:bg-white/10"
                    >
                      清除
                    </button>
                  </div>
                )}
                {/* 预设按钮 */}
                <button
                  onPointerDown={(e) => { e.stopPropagation(); handleTogglePreset(node.id, '全景图生成'); }}
                  className={`w-full px-2 py-1 text-[10px] rounded transition-all mb-2 ${
                    (node.activePresets ?? []).includes('全景图生成') 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white ring-1 ring-indigo-400' 
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white'
                  }`}
                >
                  全景图生成
                </button>
              </div>
              <div className="relative flex flex-col shrink-0 p-2 border-t border-[#333] bg-[#252525]">
                <textarea
                  className="w-full bg-[#222222] text-gray-200 text-xs p-2 rounded border border-[#333] focus:outline-none focus:border-indigo-500 transition-colors resize-y"
                  value={node.prompt}
                  onChange={(e) => handleUpdateNode(node.id, { prompt: e.target.value })}
                  placeholder="补充描述..."
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    // 双击检测：基于时间戳
                    const now = Date.now();
                    if (now - bigEditorLastClickRef.current < 320) {
                      bigEditorLastClickRef.current = 0;
                      openBigEditor(node.prompt || '', (v) => handleUpdateNode(node.id, { prompt: v }));
                    } else {
                      bigEditorLastClickRef.current = now;
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openBigEditor(node.prompt || '', (v) => handleUpdateNode(node.id, { prompt: v }));
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    const nextHeight = Math.max(64, Math.round((e.currentTarget as HTMLTextAreaElement).offsetHeight));
                    if (nextHeight !== (node.panoramaPromptHeight || 72)) {
                      handleUpdateNode(node.id, { panoramaPromptHeight: nextHeight });
                    }
                  }}
                  style={{ height: node.panoramaPromptHeight || 72 }}
                />
              </div>
              <div className="flex gap-2 w-full shrink-0 px-2 pb-2">
              <button
                  type="button"
                onPointerDown={(e) => { e.stopPropagation(); handleGenerate(node.id); }}
                disabled={node.isGenerating}
                  className={`flex-1 min-w-0 py-2 rounded text-sm font-bold flex justify-center items-center gap-2 transition-all
                  ${node.isGenerating ? 'bg-[#333] text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                  {node.isGenerating ? (
                    <span className="flex items-center gap-2">
                      <LoaderIcon size={14} />
                      {genStart != null ? (
                        <GenerationTimer
                          startedAt={genStart}
                          className="tabular-nums text-[11px] opacity-90"
                          showSeconds
                        />
                      ) : null}
                    </span>
                  ) : (
                    '生成全景图'
                  )}
              </button>
                {node.isGenerating && (
                  <button
                    type="button"
                    title="仅在点击「生成全景图」后出现，用于中断 ToAPIs 轮询"
                    onPointerDown={(e) => { e.stopPropagation(); handleCancelGeneration(node.id); }}
                    className="shrink-0 px-3 py-2 rounded text-sm font-medium bg-[#444] hover:bg-[#555] text-gray-200 border border-[#555]"
                  >
                    取消生成
                  </button>
                )}
              </div>
              {node.error && (
                <div className="relative">
                  {renderNodeErrorPanel(node)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };
  renderNodeRef.current = renderNode;
  const stableRenderNode = useCallback((node: CanvasNode) => renderNodeRef.current(node), []);

  // 首页 / 项目列表
  const [showHomePage, setShowHomePage] = useState(true);
  const [homeProjects, setHomeProjects] = useState<CanvasProjectSnapshot[]>([]);

  /** 打开/切换项目后应用默认 20% 居中视口（等画布容器尺寸就绪） */
  useLayoutEffect(() => {
    if (!pendingDefaultViewportRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 8 || rect.height < 8) return;
    pendingDefaultViewportRef.current = false;
    setTransform({
      x: rect.width / 2,
      y: rect.height / 2,
      scale: DEFAULT_CANVAS_VIEW_SCALE,
    });
  }, [projectStoreReady, activeProjectId, showHomePage]);

  useEffect(() => { loadProjectLibrary().then(lib => { if (lib) setHomeProjects(lib.projects); }); }, []);

  // 底部静态图片展示（可自行替换 URL）
  const [homeImages, setHomeImages] = useState([
    'https://images.unsplash.com/photo-1549490349-8643362247b5?w=400&h=250&fit=crop', // cyberpunk city
    'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=400&h=250&fit=crop', // tech abstract
    'https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf?w=400&h=250&fit=crop', // neon circuit
  ]);
  const [editingImgIdx, setEditingImgIdx] = useState<number | null>(null);
  const Carousel3D = () => (
    <div className="flex items-center justify-center gap-3 -mt-[70px]" style={{ perspective: '1000px' }}>
      {homeImages.map((src, i) => {
        const isCenter = i === 1;
        const isLeft = i === 0;
        const isRight = i === 2;
        return (
        <div key={i} className="group relative shrink-0 rounded-xl border border-[#484848] overflow-hidden transition-all duration-500"
          style={{
            width: isCenter ? '340px' : '220px',
            height: isCenter ? '210px' : '140px',
            transform: isLeft ? 'rotateY(25deg) translateZ(-30px)' : isRight ? 'rotateY(-25deg) translateZ(-30px)' : 'translateZ(0)',
            opacity: isCenter ? 1 : 0.6,
            zIndex: isCenter ? 2 : 1,
            filter: isCenter ? 'none' : 'brightness(0.5)',
            boxShadow: isCenter ? '0 0 40px rgba(144,64,240,0.15)' : 'none',
          }}
        >
          <img src={src} alt="" className="w-full h-full object-cover" draggable={false} loading="lazy" />
          <button onClick={() => setEditingImgIdx(i)}
            className="absolute top-2 right-2 w-6 h-6 rounded-md bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            title="修改图片URL"
          ><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
        </div>
        );
      })}
      {editingImgIdx !== null && (
        <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center" onClick={() => setEditingImgIdx(null)}>
          <div className="bg-[#2C2C2C] border border-[#202020] rounded-2xl p-6 w-[480px]" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-white mb-3">修改图片 {editingImgIdx + 1} 的 URL</p>
            <input autoFocus className="w-full bg-[#3A3A3A] border border-[#4A4A4A] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#9040F0]/30 mb-3"
              defaultValue={homeImages[editingImgIdx]}
              onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { setHomeImages(prev => { const n = [...prev]; n[editingImgIdx] = v; return n; }); } setEditingImgIdx(null); } }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingImgIdx(null)} className="px-4 py-2 rounded-xl text-sm text-[#F5F5F5] hover:text-white">取消</button>
              <button onClick={() => { const input = document.querySelector<HTMLInputElement>('[class*=\"修改图片\"] input'); if (input) { const v = input.value.trim(); if (v) { setHomeImages(prev => { const n = [...prev]; n[editingImgIdx] = v; return n; }); } } setEditingImgIdx(null); }}
                className="px-4 py-2 rounded-xl bg-[#9040F0] text-white text-sm font-medium">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 首页 AI 对话
  const [homeChatInput, setHomeChatInput] = useState('');
  const [homeChatMessages, setHomeChatMessages] = useState<{role:string,content:string}[]>([]);
  const [homeChatLoading, setHomeChatLoading] = useState(false);
  const [showAllProjectsModal, setShowAllProjectsModal] = useState(false);
  const [allProjectsList, setAllProjectsList] = useState<CanvasProjectSnapshot[]>([]);
  const [editingTextNodeIds, setEditingTextNodeIds] = useState<Set<string>>(new Set());
  const [textNodeFontSize, setTextNodeFontSize] = useState(40);
  const [renameTarget, setRenameTarget] = useState<CanvasProjectSnapshot | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CanvasProjectSnapshot | null>(null);
  const homeChatSend = async () => {
    const q = homeChatInput.trim(); if (!q) return;
    setHomeChatInput(''); setHomeChatLoading(true);
    // 无论 API 是否成功，都创建项目跳转画布
    const newId = `project-${Date.now()}`;
    const chatNodeId = `chat-${Date.now()}`;
    const userMsg = { id: nextMsgId('user'), role: 'user' as const, content: q };
    const chatNode: CanvasNode = {
      id: chatNodeId, type: 'chat', x: 200, y: 200, width: 1560, height: 2760,
      prompt: q, model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
      messages: [userMsg],
      imageAspectRatio: '16:9',
      imageResolution: '2k',
    };
    const newProject: CanvasProject = {
      id: newId, name: q.substring(0, 20) || 'AI 对话', updatedAt: Date.now(),
      nodes: [chatNode], edges: [], transform: { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE },
    };
    const lib = await loadProjectLibrary();
    const projects = [newProject, ...(lib?.projects || [])];
    setProjects(projects); projectsRef.current = projects;
    setActiveProjectId(newId);
    setNodes([chatNode]); setEdges([]);
    pendingDefaultViewportRef.current = true;
    await saveProjectLibrary(projects, newId);
    setShowHomePage(false);
    // 在画布中自动触发发送
    setTimeout(() => {
      handleSendMessage(chatNodeId, { promptText: q });
    }, 500);
  };

  const handleCreateProject = async () => {
    const lib = await loadProjectLibrary();
    const projects = lib?.projects || [];
    const newProject: CanvasProject = {
      id: `project-${Date.now()}`,
      name: `项目 ${projects.length + 1}`,
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      transform: { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE },
    };
    const next = [newProject, ...projects];
    setProjects(next); projectsRef.current = next;
    setActiveProjectId(newProject.id);
    setNodes([]); setEdges([]);
    pendingDefaultViewportRef.current = true;
    await saveProjectLibrary(next, newProject.id);
    setShowHomePage(false);
  };
  const handleOpenProject = async (p: CanvasProjectSnapshot) => {
    const lib = await loadProjectLibrary();
    const projects = lib?.projects || [];
    const target = projects.find(x => x.id === p.id) || p;
    setProjects(projects); projectsRef.current = projects;
    setActiveProjectId(p.id);
    setNodes(target.nodes || []); setEdges(target.edges || []);
    pendingDefaultViewportRef.current = true;
    if (target.auditModeData?.images) {
      setAuditImages(target.auditModeData.images);
      auditImagesRef.current = target.auditModeData.images;
    } else {
      setAuditImages([]);
      auditImagesRef.current = [];
    }
    await saveProjectLibrary(projects, p.id);
    setShowHomePage(false);
  };

  // 设置弹窗（首页+画布共用）
  const SettingsModalShared = showSettingsModal ? (
    <div className="fixed inset-0 z-[220] bg-black/80 flex items-center justify-center" onClick={() => setShowSettingsModal(false)}>
      <div className="bg-[#1e1e1e] rounded-2xl p-0 w-[900px] h-[82vh] overflow-hidden flex shadow-2xl border border-[#333]" onClick={e => e.stopPropagation()}>
        <div className="w-[200px] shrink-0 bg-[#171717] border-r border-[#333] p-3 flex flex-col gap-2">
          {(['api','presets','downloads','credits','appearance'] as const).map(tab => (
            <button key={tab} onClick={() => setSettingsTab(tab)} className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${settingsTab === tab ? 'bg-[#9040F0] text-white' : 'text-[#F5F5F5] hover:bg-[#3A3A3A] hover:text-white'}`}>
              {tab === 'api' ? '⚡ API' : tab === 'presets' ? '📋 预设' : tab === 'downloads' ? '📥 下载路径' : tab === 'credits' ? '💰 积分消耗' : '🎨 外观'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-[#F5F5F5] leading-relaxed">
            {settingsTab === 'api' && 'API 设置 — 配置各 AI 服务的 API Key 和 Base URL。配置完成后在画布节点中即可调用对应模型。'}
            {settingsTab === 'presets' && '预设管理 — 管理文生图、图生图的提示词预设模板。'}
            {settingsTab === 'downloads' && '下载路径 — 设置图片导出和项目备份的默认存储位置。'}
            {settingsTab === 'credits' && '积分消耗 — 查看各模型的积分消耗和定价信息。'}
            {settingsTab === 'appearance' && '外观设置 — 自定义画布背景样式、颜色主题等视觉偏好。'}
          </p>
        </div>
      </div>
    </div>
  ) : null;

  if (showHomePage) {
    return (
      <div className="w-screen h-screen bg-black text-white select-none font-sans flex flex-col relative overflow-hidden" onContextMenu={e => e.preventDefault()}>
        {/* 朦胧背景光效 - 20个大小差异色球，无方块硬切 */}
        <div className="absolute top-[5%] left-[10%] w-[60px] h-[60px] rounded-full pointer-events-none animate-[breathe_8s_ease-in-out_infinite]" style={{background: 'radial-gradient(circle, rgba(180,80,255,0.10) 0%, transparent 97%)'}} />
        <div className="absolute top-[8%] left-[45%] w-[300px] h-[300px] rounded-full pointer-events-none animate-[breathe_10s_ease-in-out_2s_infinite]" style={{background: 'radial-gradient(circle, rgba(100,60,220,0.16) 0%, transparent 97%)'}} />
        <div className="absolute top-[15%] right-[8%] w-[40px] h-[40px] rounded-full pointer-events-none animate-[breathe_6s_ease-in-out_1s_infinite]" style={{background: 'radial-gradient(circle, rgba(0,200,220,0.08) 0%, transparent 97%)'}} />
        <div className="absolute top-[25%] left-[30%] w-[175px] h-[175px] rounded-full pointer-events-none animate-[breathe_12s_ease-in-out_3s_infinite]" style={{background: 'radial-gradient(circle, rgba(140,80,240,0.13) 0%, transparent 97%)'}} />
        <div className="absolute top-[30%] right-[20%] w-[90px] h-[90px] rounded-full pointer-events-none animate-[breathe_7s_ease-in-out_5s_infinite]" style={{background: 'radial-gradient(circle, rgba(220,120,160,0.09) 0%, transparent 97%)'}} />
        <div className="absolute top-[40%] left-[5%] w-[125px] h-[125px] rounded-full pointer-events-none animate-[breathe_9s_ease-in-out_4s_infinite]" style={{background: 'radial-gradient(circle, rgba(80,180,240,0.12) 0%, transparent 97%)'}} />
        <div className="absolute top-[45%] left-[55%] w-[210px] h-[210px] rounded-full pointer-events-none animate-[breathe_11s_ease-in-out_infinite]" style={{background: 'radial-gradient(circle, rgba(160,100,240,0.14) 0%, transparent 97%)'}} />
        <div className="absolute top-[55%] right-[5%] w-[50px] h-[50px] rounded-full pointer-events-none animate-[breathe_5s_ease-in-out_2s_infinite]" style={{background: 'radial-gradient(circle, rgba(255,160,60,0.08) 0%, transparent 97%)'}} />
        <div className="absolute top-[60%] left-[15%] w-[250px] h-[250px] rounded-full pointer-events-none animate-[breathe_13s_ease-in-out_6s_infinite]" style={{background: 'radial-gradient(circle, rgba(100,140,240,0.13) 0%, transparent 97%)'}} />
        <div className="absolute top-[65%] left-[60%] w-[75px] h-[75px] rounded-full pointer-events-none animate-[breathe_8s_ease-in-out_3s_infinite]" style={{background: 'radial-gradient(circle, rgba(200,80,180,0.09) 0%, transparent 97%)'}} />
        <div className="absolute top-[70%] right-[15%] w-[150px] h-[150px] rounded-full pointer-events-none animate-[breathe_10s_ease-in-out_5s_infinite]" style={{background: 'radial-gradient(circle, rgba(60,200,200,0.10) 0%, transparent 97%)'}} />
        <div className="absolute top-[75%] left-[40%] w-[30px] h-[30px] rounded-full pointer-events-none animate-[breathe_6s_ease-in-out_1s_infinite]" style={{background: 'radial-gradient(circle, rgba(180,220,100,0.07) 0%, transparent 97%)'}} />
        <div className="absolute top-[80%] left-[8%] w-[100px] h-[100px] rounded-full pointer-events-none animate-[breathe_9s_ease-in-out_4s_infinite]" style={{background: 'radial-gradient(circle, rgba(240,140,100,0.09) 0%, transparent 97%)'}} />
        <div className="absolute top-[85%] left-[50%] w-[275px] h-[275px] rounded-full pointer-events-none animate-[breathe_14s_ease-in-out_7s_infinite]" style={{background: 'radial-gradient(circle, rgba(130,70,230,0.13) 0%, transparent 97%)'}} />
        <div className="absolute top-[88%] right-[25%] w-[45px] h-[45px] rounded-full pointer-events-none animate-[breathe_7s_ease-in-out_2s_infinite]" style={{background: 'radial-gradient(circle, rgba(100,220,180,0.08) 0%, transparent 97%)'}} />
        <div className="absolute top-[15%] left-[65%] w-[140px] h-[140px] rounded-full pointer-events-none animate-[breathe_11s_ease-in-out_5s_infinite]" style={{background: 'radial-gradient(circle, rgba(200,150,220,0.10) 0%, transparent 97%)'}} />
        <div className="absolute top-[50%] left-[75%] w-[35px] h-[35px] rounded-full pointer-events-none animate-[breathe_5s_ease-in-out_3s_infinite]" style={{background: 'radial-gradient(circle, rgba(255,200,80,0.07) 0%, transparent 97%)'}} />
        <div className="absolute top-[35%] left-[20%] w-[225px] h-[225px] rounded-full pointer-events-none animate-[breathe_12s_ease-in-out_8s_infinite]" style={{background: 'radial-gradient(circle, rgba(90,160,240,0.12) 0%, transparent 97%)'}} />
        <div className="absolute top-[10%] left-[80%] w-[70px] h-[70px] rounded-full pointer-events-none animate-[breathe_8s_ease-in-out_6s_infinite]" style={{background: 'radial-gradient(circle, rgba(220,100,160,0.09) 0%, transparent 97%)'}} />
        <div className="absolute top-[68%] left-[70%] w-[160px] h-[160px] rounded-full pointer-events-none animate-[breathe_10s_ease-in-out_4s_infinite]" style={{background: 'radial-gradient(circle, rgba(140,120,240,0.12) 0%, transparent 97%)'}} />
        {/* 呼吸动画 keyframes */}
        <style>{`@keyframes breathe { 0%,100% { opacity:0.6; transform:translate(-50%,0) scale(1); } 50% { opacity:1; transform:translate(-50%,0) scale(1.15); } }`}</style>

        {/* 顶栏 - 毛玻璃 */}
        <div className="relative flex items-center justify-between px-8 pt-[50px] pb-5 shrink-0 border-b border-white/[0.04] bg-black/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9040F0] to-[#6020E0] flex items-center justify-center shadow-lg shadow-[#9040F0]/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C7 2 3 5 2 10c-1 5 1 10 4 12l1-2c1 1 2 2 5 2s4-1 5-2l1 2c3-2 5-7 4-12C21 5 17 2 12 2z" fill="url(#snakeGrad)" stroke="white"/>
                <defs><linearGradient id="snakeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="white" stopOpacity="0.15"/><stop offset="100%" stopColor="white" stopOpacity="0.05"/></linearGradient></defs>
                <ellipse cx="8.5" cy="9" rx="2" ry="2.5" fill="white" stroke="none"/>
                <ellipse cx="15.5" cy="9" rx="2" ry="2.5" fill="white" stroke="none"/>
                <circle cx="8.5" cy="8.5" r="1" fill="#6020E0"/>
                <circle cx="15.5" cy="8.5" r="1" fill="#6020E0"/>
                <path d="M7 4l-3 2" strokeWidth="1.5" opacity="0.6"/>
                <path d="M17 4l3 2" strokeWidth="1.5" opacity="0.6"/>
                <path d="M10 13c-1 1-2 2-2 3" strokeWidth="1.5" opacity="0.7"/>
                <path d="M14 13c1 1 2 2 2 3" strokeWidth="1.5" opacity="0.7"/>
                <path d="M12 14v3" strokeWidth="1.2" opacity="0.5"/>
                <path d="M5 8c0 2 1 4 3 5" strokeWidth="0.8" opacity="0.4"/>
                <path d="M19 8c0 2-1 4-3 5" strokeWidth="0.8" opacity="0.4"/>
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white">NwwWoW</span>
          </div>
        </div>

        {/* 主体 - 整体上移60px */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-8 gap-8 overflow-y-auto -mt-[460px]">
          {/* AI 对话框 */}
          <div className="w-full max-w-[640px] rounded-3xl border border-[#484848] bg-[#1E1E1E]/80 backdrop-blur-sm p-4 -mt-[150px]">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-2 h-2 rounded-full bg-[#9040F0]" />
              <span className="text-xs text-[#D0D0D0] font-medium">AI 助手 · DeepSeek</span>
            </div>
            {homeChatMessages.length > 0 && (
              <div className="max-h-[320px] overflow-y-auto mb-3 space-y-2 px-1">
                {homeChatMessages.map((m, i) => (
                  <div key={i} className={`text-xs leading-relaxed ${m.role === 'user' ? 'text-[#F5F5F5]' : 'text-[#F5F5F5]'}`}>
                    <span className="text-[10px] text-[#F5F5F5] mr-1">{m.role === 'user' ? 'You' : 'AI'}</span>
                    {m.content}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={homeChatInput} onChange={e => setHomeChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && homeChatSend()}
                placeholder="" disabled={homeChatLoading}
                className="flex-1 bg-[#2C2C2C] border border-[#4A4A4A] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#404040] outline-none focus:border-[#9040F0]/30 transition-colors"
              />
              <button onClick={homeChatSend} disabled={homeChatLoading}
                className="px-4 py-2.5 rounded-xl bg-[#9040F0] hover:bg-[#A050F0] text-white text-sm font-medium transition-all disabled:opacity-50"
              >{homeChatLoading ? '...' : '发送'}</button>
            </div>
          </div>

          {/* 项目区域 */}
          {homeProjects.length === 0 ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 w-14 h-14 rounded-2xl bg-[#9040F0]/20 blur-xl" />
                <div className="relative w-14 h-14 rounded-2xl bg-[#2C2C2C] border border-[#4A4A4A] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9040F0" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="4"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                </div>
              </div>
              <p className="text-[#D0D0D0] text-sm">在无限画布上探索 AI 驱动的视觉叙事</p>
              <button onClick={handleCreateProject}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9040F0] to-[#7020D0] hover:from-[#A050F0] hover:to-[#8030E0] text-white text-sm font-semibold transition-all duration-300 shadow-lg shadow-[#9040F0]/20"
              >创建第一个项目</button>
            </div>
          ) : (
            <div className="w-full max-w-[960px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">最近的项目</h3>
                <button onClick={async () => { const lib = await loadProjectLibrary(); if (lib) setAllProjectsList(lib.projects); setShowAllProjectsModal(true); }} className="text-xs text-[#B0B0B0] hover:text-white transition-colors">查看全部项目 →</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* 新建卡片 */}
                <div onClick={handleCreateProject}
                  className="group cursor-pointer rounded-2xl border border-dashed border-[#4A4A4A] bg-transparent hover:border-[#9040F0]/30 hover:bg-[#222222] transition-all duration-300 p-6 flex flex-col items-center justify-center gap-4 min-h-[220px]"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#2C2C2C] border border-[#4A4A4A] group-hover:border-[#9040F0]/30 group-hover:bg-[#3A3A3A] flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="1.8" className="group-hover:stroke-[#9040F0] transition-colors"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </div>
                  <span className="text-sm text-[#F5F5F5] group-hover:text-[#B0B0B0] transition-colors font-medium">新建项目</span>
                </div>
                {/* 项目卡片 */}
                {homeProjects.map(p => (
                  <div key={p.id}
                    className="group relative cursor-pointer rounded-2xl border border-[#505050] bg-[#303030] hover:border-[#9040F0]/25 hover:bg-[#282828] transition-all duration-300 p-5 flex flex-col gap-4 min-h-[220px] hover:shadow-lg hover:shadow-[#9040F0]/5"
                  >
                    {/* 光晕效果 */}
                    <div className="absolute inset-0 rounded-2xl bg-[#9040F0]/0 group-hover:bg-[#9040F0]/3 transition-colors duration-500 pointer-events-none" />
                    {/* 编辑/删除 */}
                    <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setRenameTarget(p); setRenameDraft(p.name); }}
                        className="w-7 h-7 rounded-lg bg-black/80 backdrop-blur-sm hover:bg-[#1a1a1a] border border-[#4A4A4A] flex items-center justify-center transition-all" title="重命名"
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="w-7 h-7 rounded-lg bg-black/80 backdrop-blur-sm hover:bg-[#2a1111] border border-[#4A4A4A] flex items-center justify-center transition-all" title="删除"
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CC4444" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </div>
                    {/* 缩略图 - 显示项目第一张图片 */}
                    <div className="relative w-full aspect-video rounded-xl bg-[#282828] border border-[#3A3A3A] group-hover:border-[#484848] overflow-hidden transition-all" onClick={() => handleOpenProject(p)}>
                      {(() => {
                        const firstImg = (p.nodes || []).reduce<string | null>((found, n) => found || ((n.images?.length || 0) > 0 ? n.images![0] : null), null);
                        return firstImg ? (
                          <img src={`data:image/jpeg;base64,${firstImg}`} alt="" className="w-full h-full object-cover" draggable={false} />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-[#2E2E2E] via-[#2C2C2C] to-[#222222] flex items-center justify-center">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5a5a5a" strokeWidth="1.2" className="group-hover:stroke-[#6a6a6a] transition-colors"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                          </div>
                        );
                      })()}
                      {/* 底部渐变线 */}
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#9040F0]/0 group-hover:via-[#9040F0]/30 to-transparent transition-all duration-500" />
                    </div>
                    {/* 信息 */}
                    <div className="flex flex-col gap-1" onClick={() => handleOpenProject(p)}>
                      <p className="text-sm text-[#b0b0b0] group-hover:text-white truncate font-medium">{p.name}</p>
                      <p className="text-[11px] text-[#B0B0B0]">{new Date(p.updatedAt).toLocaleDateString('zh-CN', { month:'short', day:'numeric' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* 底部图片轮播 */}
        <div className="relative shrink-0 border-t border-white/[0.02] py-6 px-8 -mt-[600px]">
          <Carousel3D />
        </div>
        {/* 底栏 */}
        <div className="relative text-center py-3 text-[10px] text-[#808080] shrink-0 tracking-[0.2em]">NwwWoW · STORYBOARD</div>
        {/* 查看全部项目弹窗 */}
        {showAllProjectsModal && (
          <div className="fixed inset-0 z-[500] bg-black/85 flex items-center justify-center" onClick={() => setShowAllProjectsModal(false)}>
            <div className="bg-[#1E1E1E] border border-[#444] rounded-2xl w-[700px] max-h-[75vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] shrink-0">
                <h3 className="text-base font-bold text-white">全部项目</h3>
                <button onClick={() => setShowAllProjectsModal(false)} className="text-[#808080] hover:text-white text-lg leading-none">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {allProjectsList.length === 0 ? (
                  <p className="text-sm text-[#808080] text-center py-8">暂无项目</p>
                ) : (
                  <div className="space-y-2">
                    {allProjectsList.map(p => (
                      <div key={p.id}
                        className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#333] bg-[#181818] hover:bg-[#222] hover:border-[#9040F0]/30 transition-all group"
                      >
                        <div className="flex flex-col gap-0.5 cursor-pointer flex-1 min-w-0 mr-4" onClick={() => { handleOpenProject(p); setShowAllProjectsModal(false); }}>
                          <span className="text-sm text-white font-medium group-hover:text-[#C0A0F0] transition-colors truncate">{p.name}</span>
                          <span className="text-[11px] text-[#707070]">{new Date(p.updatedAt).toLocaleDateString('zh-CN', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })} · {p.nodes?.length || 0} 节点</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setRenameTarget(p); setRenameDraft(p.name); }}
                            className="px-2 py-1 rounded-md text-xs text-[#808080] hover:text-white hover:bg-[#333] transition-colors"
                          >重命名</button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="px-2 py-1 rounded-md text-xs text-[#CC4444] hover:text-white hover:bg-[#441111] transition-colors"
                          >删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* 删除确认弹窗 */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center" onClick={() => setDeleteTarget(null)}>
            <div className="bg-[#1E1E1E] border border-[#444] rounded-2xl p-6 w-[380px]" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-white mb-2">删除项目</h3>
              <p className="text-sm text-[#909090] mb-4">确定要删除「{deleteTarget.name}」？此操作不可撤销。</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl text-sm text-[#909090] hover:text-white">取消</button>
                <button onClick={async () => { const p = deleteTarget; setDeleteTarget(null); const lib = await loadProjectLibrary(); if (!lib) return; const projects = lib.projects.filter(x => x.id !== p.id); const activeId = projects.find(x => x.id === lib.activeProjectId) ? lib.activeProjectId : projects[0]?.id || ''; setHomeProjects(projects); setAllProjectsList(projects); setProjects(projects); projectsRef.current = projects; if (projects.length > 0) await saveProjectLibrary(projects, activeId); }}
                  className="px-4 py-2 rounded-xl bg-[#CC3333] hover:bg-[#DD4444] text-white text-sm font-medium">确认删除</button>
              </div>
            </div>
          </div>
        )}
        {/* 重命名弹窗 */}
        {renameTarget && (
          <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center" onClick={() => setRenameTarget(null)}>
            <div className="bg-[#1E1E1E] border border-[#444] rounded-2xl p-6 w-[400px]" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-white mb-4">重命名项目</h3>
              <input autoFocus className="w-full bg-[#222] border border-[#444] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#9040F0] mb-4"
                value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const name = renameDraft.trim(); if (name) { const lib = loadProjectLibrary(); lib.then(l => { if (!l) return; const prj = l.projects.map(x => x.id === renameTarget.id ? { ...x, name, updatedAt: Date.now() } : x); const aid = prj.find(x => x.id === l.activeProjectId) ? l.activeProjectId : prj[0]?.id || ''; setAllProjectsList(prj); setHomeProjects(prj); setProjects(prj); projectsRef.current = prj; saveProjectLibrary(prj, aid); }); } setRenameTarget(null); } }}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setRenameTarget(null)} className="px-4 py-2 rounded-xl text-sm text-[#909090] hover:text-white">取消</button>
                <button onClick={() => { const name = renameDraft.trim(); if (name) { const p = renameTarget; loadProjectLibrary().then(l => { if (!l) return; const prj = l.projects.map(x => x.id === p.id ? { ...x, name, updatedAt: Date.now() } : x); const aid = prj.find(x => x.id === l.activeProjectId) ? l.activeProjectId : prj[0]?.id || ''; setAllProjectsList(prj); setHomeProjects(prj); setProjects(prj); projectsRef.current = prj; saveProjectLibrary(prj, aid); }); } setRenameTarget(null); }}
                  className="px-4 py-2 rounded-xl bg-[#9040F0] text-white text-sm font-medium">确认</button>
              </div>
            </div>
          </div>
        )}
        {SettingsModalShared}
      </div>
    );
  }

  // 全局大编辑框 Portal
  const bigEditorPortal = bigEditorOpen && createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          setBigEditorOpen(false);
        }
      }}
    >
      <div
        className="flex flex-col bg-[#1e1e1e] border border-[#444] rounded-xl shadow-2xl w-[80vw] max-w-[800px] h-[75vh] max-h-[700px] p-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <span className="text-gray-300 font-medium" style={{ fontSize: 16 }}>编辑文本</span>
          <button
            type="button"
            onClick={() => setBigEditorOpen(false)}
            className="rounded p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <textarea
          className="flex-1 w-full resize-none rounded-lg border border-[#444] bg-[#252525] p-4 text-gray-200 outline-none focus:border-rose-500"
          style={{ fontSize: 16 }}
          value={bigEditorValue}
          onChange={(e) => setBigEditorValue(e.target.value)}
          autoFocus
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div className="flex justify-end gap-3 mt-3 shrink-0">
          <button
            type="button"
            onClick={() => setBigEditorOpen(false)}
            className="rounded-lg border border-[#555] px-5 py-2 text-gray-300 hover:bg-white/10 transition-colors"
            style={{ fontSize: 14 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              bigEditorOnSaveRef.current?.(bigEditorValue);
              setBigEditorOpen(false);
            }}
            className="rounded-lg bg-rose-600 px-5 py-2 text-white hover:bg-rose-500 transition-colors"
            style={{ fontSize: 14 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f0f0f] text-neutral-100 select-none font-sans" onContextMenu={handleContextMenu} onDoubleClick={handleCanvasDoubleClick}>

      {/* 保存成功提示 */}
      {saveSuccessMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 bg-green-600 text-white text-sm font-medium rounded-lg shadow-xl flex items-center gap-2 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
          {saveSuccessMsg}
        </div>
      )}
      
      {/* Hidden File Input for Image Import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileChange} 
      />

      {/* Selection Overlay - 始终渲染避免条件渲染延迟 */}
      <div
        className="fixed inset-0 z-[100]"
        style={{ pointerEvents: isSelecting ? 'auto' : 'none' }}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
      />

      {/* Selection Box - 直接操作 DOM 避免 React 渲染延迟 */}
      <div
        ref={selectionBoxDomRef}
        className="fixed border-2 border-blue-400 bg-blue-400/20 pointer-events-none"
        style={{
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          zIndex: 9999,
          display: isSelecting ? 'block' : 'none',
        }}
      />

      {/* Resize Overlay - 只在缩放时激活 */}
      {isResizing && (
        <div
          className="fixed inset-0 z-[100] cursor-pointer"
          style={{ pointerEvents: 'none' }}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        />
      )}

      {/* Canvas Area */}
      <div 
        id="canvas-container"
        ref={containerRef}
        className={`absolute inset-0 w-full h-full ${canvasMode === 'audit' ? 'hidden' : ''} ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'boxSelect' ? 'cursor-crosshair' : 'cursor-default'}`}
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ touchAction: 'none' }}
      >
        {canvasHistoryNotice && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[120] max-w-[min(92vw,520px)] px-4 py-2 rounded-lg bg-amber-900/90 border border-amber-600/60 text-amber-100 text-xs flex items-start gap-2 shadow-lg pointer-events-auto canvas-chrome-150">
            <span className="flex-1">{canvasHistoryNotice}</span>
            <button
              type="button"
              className="shrink-0 text-amber-200/80 hover:text-white"
              onClick={() => setCanvasHistoryNotice(null)}
            >
              ×
            </button>
          </div>
        )}
        {/* Canvas Background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundSize: canvasBgStyle === 'grid' ? `${32 * transform.scale}px ${32 * transform.scale}px` : canvasBgStyle === 'dots' ? `${48 * transform.scale}px ${48 * transform.scale}px` : '0',
            backgroundImage: canvasBgStyle === 'grid'
              ? `linear-gradient(to right, ${canvasBgColor === 'dark' ? '#2a2a2a' : '#1a1a1a'} 1px, transparent 1px), linear-gradient(to bottom, ${canvasBgColor === 'dark' ? '#2a2a2a' : '#1a1a1a'} 1px, transparent 1px)`
              : canvasBgStyle === 'dots'
                ? `radial-gradient(circle, ${canvasBgColor === 'dark' ? '#333' : '#222'} 0.5px, transparent 0.5px)`
                : 'none',
            backgroundPosition: `${transform.x}px ${transform.y}px`,
            backgroundColor: canvasBgColor === 'black' ? '#0a0a0a' : '#0f0f0f',
          }}
        />

        {/* Transform Layer */}
        <div 
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
        >
          {/* SVG Connections Layer - Fixed size to cover all possible node positions */}
          <svg 
            id="svg-layer" 
            className="absolute pointer-events-none"
            style={{ 
              left: 0, 
              top: 0, 
              width: '50000px', 
              height: '50000px',
              overflow: 'visible'
            }}
          >
            <defs>
              {/* 活跃连线发光滤镜 */}
              <filter id="glow-active" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* 跃线标记（小弧形桥） */}
              <marker id="jump-marker" markerWidth="14" markerHeight="10" refX="7" refY="5" orient="auto">
                <path d="M 0,5 Q 7,-1 14,5" fill="none" stroke="#60a5fa" strokeWidth="2" />
                <circle cx="7" cy="5" r="2" fill="#60a5fa" />
              </marker>
              <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                <polygon points="0 0, 12 4, 0 8" fill="#4a5568" />
              </marker>
              <marker id="arrowhead-active" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
                <polygon points="0 0, 12 4, 0 8" fill="#60a5fa" />
              </marker>
            </defs>
            
            {/* Render existing edges */}
            {edges.map(edge => {
              const source = nodes.find(n => n.id === edge.sourceId);
              const target = nodes.find(n => n.id === edge.targetId);
              if (!source || !target) return null;
              if (!edgeRenderNodeIds.has(source.id) || !edgeRenderNodeIds.has(target.id)) return null;

              const startX = source.x + source.width;
              const startY = source.y + source.height / 2;
              const endX = target.x;
              const endY = target.y + target.height / 2;

              const dist = Math.abs(endX - startX);
              const controlOffset = Math.max(dist / 2, 60);

              const cp1X = startX + controlOffset;
              const cp1Y = startY;
              const cp2X = endX - controlOffset;
              const cp2Y = endY;

              const isActive = selectedIds.includes(source.id) || selectedIds.includes(target.id);

              return (
                <g key={edge.id} className="group/edge">
                  {/* Main edge path with drag and delete support */}
                  <EdgePath
                    edgeId={edge.id}
                    startX={startX}
                    startY={startY}
                    cp1X={cp1X}
                    cp1Y={cp1Y}
                    cp2X={cp2X}
                    cp2Y={cp2Y}
                    endX={endX}
                    endY={endY}
                    isActive={isActive}
                    onDelete={handleDeleteEdge}
                  />
                  {/* Hover delete button */}
                  <g
                    transform={`translate(${(startX + cp2X) / 2}, ${(startY + cp2Y) / 2})`}
                    className="opacity-0 group-hover/edge:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => handleDeleteEdge(edge.id)}
                  >
                    <circle r="10" fill="#ef4444" stroke="#fff" strokeWidth="1" />
                    <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fff" strokeWidth="2" />
                    <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fff" strokeWidth="2" />
                  </g>
                </g>
              );
            })}

            {/* 跃线标记：检测连线交叉点并绘制弧形桥 */}
            {edgeBridges.map((b) => (
              <g key={b.id} pointerEvents="none">
                <circle cx={b.x} cy={b.y} r={5} fill="#1e1e1e" stroke="#60a5fa" strokeWidth={1.5} />
                <path
                  d={`M ${b.x - 4} ${b.y} Q ${b.x} ${b.y - 5} ${b.x + 4} ${b.y}`}
                  fill="none" stroke="#60a5fa" strokeWidth={1.5}
                />
              </g>
            ))}

            {/* Render drafting edge */}
            {draftEdge && (() => {
              const source = nodes.find(n => n.id === draftEdge.sourceId);
              if (!source) return null;
              const startX = source.x + source.width;
              const startY = source.y + source.height / 2;
              const endX = draftEdge.x;
              const endY = draftEdge.y;
              
              const dist = Math.abs(endX - startX);
              const controlOffset = Math.max(dist / 2, 60);

              const cp1X = startX + controlOffset;
              const cp1Y = startY;
              const cp2X = endX - controlOffset;
              const cp2Y = endY;

              return (
                <path
                  d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                  stroke="#60a5fa"
                  strokeWidth="3"
                  strokeDasharray="8,4"
                  fill="none"
                />
              );
            })()}
          </svg>

          {/* Nodes Layer */}
          {nodes.map((node) => {
            const isInViewport = visibleNodeIds.has(node.id);
            const isDragging = draggingNodeId === node.id;
            const isSelected = selectedIdSet.has(node.id);
            const isHeavyWebGL = node.type === 'panorama' || node.type === 'director3d';
            const usePlaceholder =
              (!isInViewport && !isDragging && !isSelected) ||
              (isHeavyWebGL && !isInViewport && !isDragging);
            if (usePlaceholder) {
              return (
                <MemoizedNodePlaceholder
                  key={node.id}
                  node={node}
                  isSelected={isSelected}
                  onPointerDown={handleNodePointerDown}
                />
              );
            }
            return (
              <MemoNodeCard
                key={node.id}
                node={node}
                isSelected={isSelected}
                isInViewport={isInViewport}
                isDragging={isDragging}
                edgesKey={edgesKey}
                eyedropperTargetNodeId={eyedropperTargetNodeId}
                renderNode={stableRenderNode}
              />
            );
          })}
        </div>

        {/* Global Eyedropper Overlay - 透明层，让图片仍可点击 */}
        {eyedropperTargetNodeId && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 50 }}
          >
            {/* 点击提示 - 只在顶部显示提示文字，不遮挡内容 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-cyan-600 text-white text-xs font-medium rounded-lg shadow-lg flex items-center gap-2 pointer-events-auto canvas-chrome-150" style={{ zIndex: 100 }}>
              <EyedropperIcon size={14} /> 点击节点连线吸取 · 快捷键 X · ESC 取消
            </div>
          </div>
        )}
        {canvasMode === 'canvas' && nodes.length > 0 && (
          <CanvasMinimap
            nodes={nodes}
            transform={transform}
            viewportSize={viewportSize}
            onNavigate={handleMinimapNavigate}
          />
        )}
      </div>

      {/* 看图模式覆盖层 */}
      {canvasMode === 'audit' && (
        <Suspense fallback={<HeavyNodeFallback label="加载看图模式…" />}>
        <AuditModeCanvas
          auditImages={auditImages}
          setAuditImages={setAuditImages}
          transform={transform}
          setTransform={setTransform}
          containerRef={containerRef}
          onWheel={handleWheel}
          sharedClipboardImageRef={sharedClipboardImageRef}
          saveCurrentProject={saveCurrentProject}
        />
        </Suspense>
      )}

    {/* Context Menu */}
    {contextMenu && canvasMode !== 'audit' && (
      <div
        className="absolute z-50 bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[160px] overflow-hidden canvas-chrome-150"
        style={{ left: contextMenu.x, top: contextMenu.y, transform: 'scale(0.55)', transformOrigin: 'top left' }}
        onPointerDown={e => e.stopPropagation()}
      >
        <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-rose-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('chat')}>
          <MessageIcon size={14} /> 新建对话节点
        </button>
        <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-green-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('image')}>
          <ImageIcon size={14} /> 新建图片节点
        </button>
        <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-amber-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('video')}>
          <VideoIcon size={14} /> 新建视频生成节点
        </button>
        <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('audio')}>
          <AudioIcon size={14} /> 新建语音节点
        </button>
        <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('text')}>
          <TextIcon size={14} /> 新建文本节点
        </button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-purple-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('t2i')}>
            <ImageIcon size={14} /> 新建文生图节点
          </button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('i2i')}>
            <WandIcon size={14} /> 新建图生图节点
          </button>
          <div className="h-px bg-[#444] my-1 mx-2" />
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-cyan-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('panorama')}>
            <PanoramaIcon size={14} /> 新建 360° 全景图节点
          </button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-indigo-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('panoramaT2i')}>
            <WidePanoramaIcon size={14} /> 新建全景图生成节点
          </button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-pink-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('director3d')}>
            <Director3DIcon size={14} /> 新建 3D导演台节点
          </button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-orange-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('annotation')}>
            <AnnotationIcon size={14} /> 新建图片标注节点
          </button>
          <div className="h-px bg-[#444] my-1 mx-2" />
          <div className="px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">宫格工具</div>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-teal-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('gridSplit')}>
            <GridIcon size={14} /> 新建宫格拆分节点
          </button>
          <button className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-teal-600 hover:text-white flex items-center gap-2" onPointerDown={() => handleAddNode('gridMerge')}>
            <GridMergeIcon size={14} /> 新建宫格合并节点
          </button>
        </div>
      )}

      {/* UI Overlay: 快捷键 + 工具栏（左上） */}
      <div className={`absolute top-6 left-6 z-40 flex flex-col gap-1.5 ${canvasMode === 'audit' ? 'hidden' : ''}`}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowShortcutsPanel(true)}
          className="canvas-chrome-150 bg-[#1e1e1e]/90 backdrop-blur-md p-2.5 rounded-xl shadow-2xl border border-[#333] hover:bg-[#333] transition-colors text-gray-400 hover:text-white flex items-center justify-center"
          title="快捷键说明"
        >
          <KeyIcon size={18} />
        </button>
        <div className="canvas-chrome-150 bg-[#1e1e1e]/90 backdrop-blur-md p-1.5 rounded-xl shadow-2xl border border-[#333] flex flex-col gap-1">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveTool('select');
            }}
            className={`p-2.5 rounded-lg transition-colors ${activeTool === 'select' ? 'bg-blue-600 text-white' : 'hover:bg-[#333] text-gray-400 hover:text-white'}`}
            title="选择工具 (V)"
          >
            <MousePointerIcon size={18} />
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveTool('pan');
            }}
            className={`p-2.5 rounded-lg transition-colors ${activeTool === 'pan' ? 'bg-blue-600 text-white' : 'hover:bg-[#333] text-gray-400 hover:text-white'}`}
            title="平移工具 (空格)"
          >
            <HandIcon size={18} />
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveTool('boxSelect');
            }}
            className={`p-2.5 rounded-lg transition-colors ${activeTool === 'boxSelect' ? 'bg-blue-600 text-white' : 'hover:bg-[#333] text-gray-400 hover:text-white'}`}
            title="框选工具 (B)"
          >
            <BoxSelectIcon size={18} />
          </button>
        </div>
      </div>

      {/* Settings + project actions（左上第二列） */}
      <div className={`canvas-chrome-150 absolute top-6 left-28 z-40 flex flex-wrap items-center gap-2 ${canvasMode === 'audit' ? 'hidden' : ''}`} style={{ transform: 'scale(0.67)', transformOrigin: 'top left' }}>
      <button
        onClick={() => {
          setSettingsTab('api');
          setShowSettingsModal(true);
        }}
          className="bg-[#1e1e1e]/90 backdrop-blur-md p-2.5 rounded-xl shadow-2xl border border-[#333] hover:bg-[#333] transition-colors flex items-center gap-2"
          title="设置（API、预设、下载路径、积分消耗）"
      >
        <SettingsIcon size={18} />
        <span className="text-gray-400 text-xs font-medium">设置</span>
      </button>

      <button
          onClick={() => setShowProjectModal(true)}
          className="bg-[#1e1e1e]/90 backdrop-blur-md p-2.5 rounded-xl shadow-2xl border border-[#333] hover:bg-[#333] transition-colors flex items-center gap-2"
          title="项目管理：IndexedDB 草稿库、JSON / ZIP 导入导出"
        >
          <GridIcon size={18} />
          <span className="text-gray-400 text-xs font-medium">项目</span>
      </button>

      <button
          type="button"
          onClick={handleClearCanvas}
          className="bg-[#1e1e1e]/90 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-2xl border border-[#333] hover:bg-[#333] transition-colors"
          title="删除所有节点与连线，画布变为空白"
        >
          <span className="text-gray-400 text-xs font-medium whitespace-nowrap">清空画布</span>
      </button>

      <button
          type="button"
          onClick={handleClearCanvasPreviewCache}
          className="bg-[#1e1e1e]/90 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-2xl border border-amber-900/50 hover:bg-[#333] transition-colors"
          title="仅清理内存里为节点缩略图生成的缓存（不删节点里的图片、不改 IndexedDB 草稿）；可缓解内存占用，缩略图会按需重新生成"
        >
          <span className="text-amber-500/90 text-xs font-medium whitespace-nowrap">清预览缓存</span>
      </button>
      </div>

      {/* Jimeng login button — 右上角（看图模式下隐藏） */}
      <div className={`fixed top-[17px] right-[304px] z-[60] flex items-center gap-2 ${canvasMode === 'audit' ? 'hidden' : ''}`}
        onClick={(e) => { e.stopPropagation(); openLogin(); }}
        style={{ cursor: 'pointer' }}
      >
        <span className={`px-4 py-2 rounded-lg text-base font-medium border bg-[#1a1a2e]/80 hover:bg-[#e94560]/20 inline-block tracking-wider ${
          authInfo.loggedIn
            ? 'border-green-500/60 text-green-400'
            : 'border-[#e94560]/40 text-[#e94560]'
        }`}>
          即梦 {authInfo.loggedIn ? '✓ 已登录' : ''}
        </span>
      </div>

      {/* 退出即梦按钮 - 右上角（已登录时显示） */}
      {authInfo.loggedIn && (
        <div
          className={`fixed top-[25px] right-[200px] z-[60] ${canvasMode === 'audit' ? 'hidden' : ''}`}
          onClick={(e) => { e.stopPropagation(); handleLogout(); }}
          style={{ cursor: 'pointer' }}
        >
          <span className="px-3 py-2 rounded-lg text-sm font-medium border border-red-500/40 text-red-400 bg-[#1a1a2e]/80 hover:bg-red-500/20">
            退出即梦
          </span>
        </div>
      )}

      {showShortcutsPanel && (
        <div
          className="fixed inset-0 z-[205] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowShortcutsPanel(false)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="canvas-chrome-150 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#444] bg-[#1a1a1a] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
              <h2 className="text-base font-semibold text-white">快捷键</h2>
              <button
                type="button"
                className="rounded p-1 text-gray-400 transition-colors hover:bg-[#333] hover:text-white"
                title="关闭"
                onClick={() => setShowShortcutsPanel(false)}
              >
                <XIcon size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <p className="mb-3 text-xs leading-relaxed text-gray-500">
                以下快捷键在画布区域生效；当焦点在<strong className="text-gray-400">输入框</strong>、
                <strong className="text-gray-400">文本域</strong>或<strong className="text-gray-400">下拉框</strong>
                内时，其中大部分不会拦截（各行括号内另有说明）。
              </p>
              <table className="w-full border-collapse text-left text-sm text-gray-200">
                <thead>
                  <tr className="border-b border-[#333] text-gray-500">
                    <th className="w-[38%] py-2 pr-3 font-medium">按键</th>
                    <th className="py-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {CANVAS_SHORTCUT_HELP_ROWS.map((row) => (
                    <tr key={row.combo} className="border-b border-[#2a2a2a]">
                      <td className="whitespace-nowrap py-2 pr-3 align-top font-mono text-xs text-cyan-200/95">{row.combo}</td>
                      <td className="py-2 align-top text-xs text-gray-300">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 模式切换按钮 — 固定在顶部，不影响审核模式叠加层 */}
      {activeProjectId && (
        <div className="fixed top-[20px] left-1/2 z-[55] -translate-x-1/2 flex items-center gap-2">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCanvasMode('canvas')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              canvasMode === 'canvas'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-[#1e1e1e]/80 border border-[#333] text-gray-400 hover:bg-[#333] hover:text-white'
            }`}
          >
            画布模式
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCanvasMode('audit')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              canvasMode === 'audit'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                : 'bg-[#1e1e1e]/80 border border-[#333] text-gray-400 hover:bg-[#333] hover:text-white'
            }`}
          >
            看图模式
          </button>
        </div>
      )}

      {/* Center — current draft / project title（双击改项目名，与草稿展示同步并写回 IndexedDB） */}
      {activeProjectId ? (() => {
        const curProj = projects.find((p) => p.id === activeProjectId);
        if (!curProj) return null;
        const editing = centerTitleEditValue !== null;
        return (
          <>
          <div className={`absolute top-[70px] left-1/2 z-[35] -translate-x-1/2 flex items-center gap-[50px] ${canvasMode === 'audit' ? 'hidden' : ''}`}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { loadProjectLibrary().then(lib => { if (lib) setHomeProjects(lib.projects); }); setShowHomePage(true); }}
              className="bg-[#1e1e1e]/90 backdrop-blur-md p-2 rounded-xl shadow-2xl border border-[#333] hover:bg-[#9040F0]/30 transition-colors text-gray-400 hover:text-white flex items-center justify-center shrink-0"
              title="返回首页"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
            <div
            className="max-w-[min(640px,calc(100vw-14rem))] px-4 text-center"
            title={editing ? undefined : `${projectDraftDisplayName(curProj)} — 双击修改项目名（与草稿名同步）`}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (centerTitleEditValue !== null) return;
              const seed = projectDraftEditSeed(curProj);
              window.setTimeout(() => {
                setCenterTitleEditValue(seed);
              }, 16);
            }}
          >
            {editing ? (
              <input
                type="text"
                autoFocus
                className="w-full min-w-[12rem] rounded-lg border border-blue-500/70 bg-[#141414]/95 px-3 py-2 text-center text-xl font-semibold tracking-tight text-white outline-none ring-2 ring-blue-500/30 sm:text-2xl"
                value={centerTitleEditValue ?? ''}
                onChange={(e) => setCenterTitleEditValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onFocus={(ev) => {
                  const el = ev.currentTarget;
                  const len = el.value.length;
                  requestAnimationFrame(() => {
                    try {
                      el.setSelectionRange(len, len);
                    } catch {
                      /* ignore */
                    }
                  });
                }}
                onBlur={(e) => {
                  if (skipCenterRenameBlurRef.current) {
                    skipCenterRenameBlurRef.current = false;
                    return;
                  }
                  commitCenterProjectRename(e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    skipCenterRenameBlurRef.current = true;
                    setCenterTitleEditValue(null);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <div className="cursor-text truncate text-xl font-semibold tracking-tight text-gray-50 drop-shadow-md sm:text-2xl">
                {projectDraftDisplayName(curProj)}
        </div>
      )}
          </div>
          </div>
          </>
        );
      })() : null}

      {/* Projects Modal */}
      {showProjectModal && (
        <div
          className="fixed inset-0 z-[210] bg-black/80 flex items-center justify-center"
          onClick={() => {
            setShowProjectModal(false);
            setProjectExportMenuOpen(false);
          }}
        >
          <div
            className="bg-[#1e1e1e] rounded-2xl p-6 w-[640px] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-[#333]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">项目管理</h2>
              <button
                onClick={() => {
                  setShowProjectModal(false);
                  setProjectExportMenuOpen(false);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XIcon size={20} />
              </button>
            </div>
            <div className="mb-3 rounded-lg border border-[#333] bg-[#141414] p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[200px]">
                  <span className="block text-[10px] text-gray-500 mb-0.5">草稿名称（留空或与项目名相同则自动跟项目名）</span>
                  <input
                    type="text"
                    value={draftNameInput}
                    onChange={(e) => setDraftNameInput(e.target.value)}
                    className="w-full rounded-md border border-[#444] bg-[#303030] px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-blue-600"
                    placeholder={projects.find((p) => p.id === activeProjectId)?.name || '未命名项目'}
                  />
                </label>
              <button
                  type="button"
                  onClick={() => handleApplyDraftTitle()}
                  className="shrink-0 rounded-md bg-[#333] px-2.5 py-1.5 text-[11px] text-gray-100 hover:bg-[#444]"
                >
                  应用草稿名
                </button>
                <button
                  type="button"
                onClick={() => {
                    const n = projects.find((p) => p.id === activeProjectId)?.name || '';
                    setDraftNameInput(n);
                }}
                  className="shrink-0 rounded-md border border-[#444] px-2.5 py-1.5 text-[11px] text-gray-400 hover:bg-[#3A3A3A]"
              >
                  填入项目名
              </button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[200px]">
                  <span className="block text-[10px] text-gray-500 mb-0.5">草稿存储位置</span>
                  <input
                    type="text"
                    value={draftStoragePathInput}
                    onChange={(e) => setDraftStoragePathInput(e.target.value)}
                    className="w-full rounded-md border border-[#444] bg-[#303030] px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-cyan-600"
                    placeholder="例如 D:\备份\无限画布草稿"
                  />
                </label>
              <button
                  type="button"
                  onClick={() => void handleApplyDraftStoragePath()}
                  className="shrink-0 rounded-md bg-cyan-900/60 px-2.5 py-1.5 text-[11px] text-cyan-50 hover:bg-cyan-800/70"
                  title="支持时弹出系统「选择文件夹」窗口；不支持时改为手动输入路径"
                >
                  应用存储位置
              </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-gray-500 shrink-0">定时自动保存草稿</span>
                <select
                  value={autosaveIntervalMin}
                  onChange={(e) =>
                    handleAutosaveIntervalChange(Number(e.target.value) as 0 | 5 | 10 | 20 | 30)
                  }
                  className="rounded-md border border-[#444] bg-[#303030] px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-600"
                >
                  <option value={0}>关闭</option>
                  <option value={5}>每 5 分钟</option>
                  <option value={10}>每 10 分钟</option>
                  <option value={20}>每 20 分钟</option>
                  <option value={30}>每 30 分钟</option>
                </select>
                <span className="text-[10px] text-gray-600 leading-snug max-w-[260px]">
                  已绑定本地草稿 JSON 的项目打开时默认每 5 分钟；会写入 IndexedDB 并覆盖绑定 JSON。
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => {
                  const name = prompt('新项目名称:');
                  createNewProject(name || undefined);
                }}
                className="px-3 py-2.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                新建项目
              </button>
              <button
                type="button"
                onClick={() => void saveCurrentProject()}
                className="px-3 py-2.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium"
                title="合并画布写入 IndexedDB；未绑定本地草稿时会先填写文件名并选择文件夹。Ctrl+S / ⌘+S 保存；Ctrl+Alt+S 另存 JSON。"
              >
                保存当前画布
              </button>
              <button
                type="button"
                onClick={() => projectImportInputRef.current?.click()}
                className="px-3 py-2.5 text-xs rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-medium"
                title="支持 .json 与 .wxcanvas.zip / .zip"
              >
                导入 JSON / ZIP
              </button>
              <div className="relative">
              <button
                  type="button"
                  onClick={() => setProjectExportMenuOpen((o) => !o)}
                  className="w-full px-3 py-2.5 text-xs rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-medium"
                  title="下载到本机"
                >
                  导出 JSON / ZIP ▾
              </button>
                {projectExportMenuOpen ? (
                  <div
                    className="absolute right-0 z-[300] mt-1 min-w-[160px] rounded-lg border border-[#444] bg-[#1a1a1a] py-1 shadow-xl"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs text-gray-100 hover:bg-[#2a2a2a]"
                      onClick={() => {
                        const current = projects.find((p) => p.id === activeProjectId);
                        if (current) void handleExportProjectJson(projectSnapshotForJsonExport(current));
                        setProjectExportMenuOpen(false);
                      }}
                    >
                      导出 JSON…
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs text-gray-100 hover:bg-[#2a2a2a]"
                      onClick={() => {
                        const current = projects.find((p) => p.id === activeProjectId);
                        if (current) void handleExportProjectZip(projectSnapshotForJsonExport(current));
                        setProjectExportMenuOpen(false);
                      }}
                    >
                      导出 ZIP…
                    </button>
                  </div>
                ) : null}
              </div>
              <input
                ref={projectImportInputRef}
                type="file"
                accept=".json,.zip,.wxcanvas.zip,application/json,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportProjectFile(file);
                  e.currentTarget.value = '';
                }}
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {projects
                .slice()
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((project) => {
                  const draftLocDisplay = sanitizeDraftStoragePathNote(project.draftStoragePathNote);
                  return (
                  <div
                    key={project.id}
                    className={`p-3 rounded-lg border ${project.id === activeProjectId ? 'border-blue-500 bg-blue-900/20' : 'border-[#333] bg-[#222222]'}`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => switchProject(project.id)}
                        className="text-left flex-1"
                      >
                        <div className="text-sm text-gray-100">{projectDraftDisplayName(project)}</div>
                        {draftLocDisplay ? (
                          <div className="text-[10px] text-cyan-500/95 mt-0.5 leading-snug">
                            草稿位置：{draftLocDisplay}
                          </div>
                        ) : null}
                        {project.draftTitle?.trim() && project.draftTitle.trim() !== (project.name || '').trim() ? (
                          <div className="text-[10px] text-gray-600">项目名：{project.name}</div>
                        ) : null}
                        <div className="text-[10px] text-gray-500">
                          节点 {project.nodes.length} | 连线 {project.edges.length} | 更新时间 {new Date(project.updatedAt).toLocaleString()}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openProjectLocationInfo(project)}
                        className="shrink-0 px-2 py-1 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-gray-100"
                        title="需已填写「草稿存储位置」或已另存为 JSON；点击查看 IndexedDB 与本机参考路径"
                      >
                        打开位置
                      </button>
                      <button
                        onClick={() => {
                          const nextName = prompt('重命名项目:', project.name);
                          const trimmed = nextName?.trim();
                          if (!trimmed) return;
                          setProjects((prev) => {
                            const next = prev.map((p) =>
                              p.id === project.id ? { ...p, name: trimmed, updatedAt: Date.now() } : p
                            );
                            projectsRef.current = next;
                            void saveProjectLibrary(next, activeProjectIdRef.current).then((ok) => {
                              if (!ok) alert('名称已更新，但写入草稿库失败，请重试。');
                            });
                            return next;
                          });
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-[#333] hover:bg-[#444] text-gray-200"
                      >
                        重命名
                      </button>
                      <button
                        disabled={projects.length <= 1}
                        onClick={() => {
                          if (confirm(`确定删除项目 "${project.name}" 吗？`)) {
                            deleteProject(project.id);
                          }
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-red-800 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        删除
                      </button>
                      <button
                        onClick={() => handleExportProjectJson(projectSnapshotForJsonExport(project))}
                        className="px-2 py-1 text-[10px] rounded bg-indigo-800 hover:bg-indigo-700 text-white"
                      >
                        导出
                      </button>
                    </div>
                  </div>
                );
                })}
            </div>
          </div>
        </div>
      )}

      {draftDiskModal ? (
        <div
          className="fixed inset-0 z-[400] bg-black/75 flex items-center justify-center p-4"
          onClick={() => cancelDraftDiskModal()}
        >
          <div
            className="bg-[#1a1a1a] rounded-xl border border-[#444] shadow-2xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-100 mb-1">
              {draftDiskModal.mode === 'firstSave' ? '首次保存草稿 JSON' : '另存 JSON'}
            </h3>
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
              {draftDiskModal.mode === 'firstSave'
                ? '设置文件名（不含扩展名）；留空则使用当前项目名。确认后将弹出系统文件夹选择器，请选择草稿保存位置。'
                : '设置另存文件名；留空则使用与导出一致的默认名。确认后将弹出文件夹选择器（不改变当前 Ctrl+S 绑定的主草稿）。'}
            </p>
            <label className="block mb-4">
              <span className="text-[10px] text-gray-500 mb-1 block">JSON 文件名（不含 .json）</span>
              <input
                type="text"
                value={draftDiskModal.basenameDraft}
                onChange={(e) =>
                  setDraftDiskModal((m) => (m ? { ...m, basenameDraft: e.target.value } : m))
                }
                className="w-full rounded-md border border-[#444] bg-[#303030] px-2 py-2 text-xs text-gray-100 outline-none focus:border-cyan-600"
                placeholder={
                  (draftDiskModal.mode === 'firstSave'
                    ? draftDiskModal.mergedProjects.find((p) => p.id === draftDiskModal.pid)?.name
                    : draftDiskModal.snapshot.name) || '项目名'
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[#444] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#3A3A3A]"
                onClick={() => cancelDraftDiskModal()}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-cyan-700 hover:bg-cyan-600 px-3 py-1.5 text-xs text-white"
                onClick={() => void confirmDraftDiskModal()}
              >
                {draftDiskModal.mode === 'firstSave' ? '选择文件夹并保存' : '选择文件夹并另存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Unified Settings Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-[220] bg-black/80 flex items-center justify-center"
          onClick={() => setShowSettingsModal(false)}
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
                  onClick={() => setShowSettingsModal(false)}
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
                              setShowSettingsModal(false);
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
                              setShowSettingsModal(false);
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
                          setShowSettingsModal(false);
                        }
                      }}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors text-sm"
                    />
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setShowSettingsModal(false)}
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
                          setShowSettingsModal(false);
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
      )}

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

      {/* Fullscreen Image Modal */}
      {fullscreenImage && canvasMode !== 'audit' && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center overflow-hidden backdrop-blur-sm"
          onPointerDown={() => { setFullscreenImage(null); setFsContextMenu(null); }}
          onContextMenu={(e) => { e.preventDefault(); setFsContextMenu(null); }}
          onWheel={handleFsWheel}
        >
          <div
            className="relative w-full h-full flex items-center justify-center"
            onPointerDown={(e) => { e.stopPropagation(); handleFsPointerDown(e); }}
          >
            <img
              src={fullscreenImageDisplaySrc(fullscreenImage)}
              className="max-w-[calc(100vw-18rem)] max-h-[90vh] object-contain shadow-2xl"
              style={{
                transform: `translate(${fsTransform.x}px, ${fsTransform.y}px) scale(${fsTransform.scale})`,
                cursor: activePointerTypeRef.current === 'fullscreen' ? 'grabbing' : 'grab',
                transition: activePointerTypeRef.current === 'fullscreen' ? 'none' : 'transform 0.1s ease-out'
              }}
              draggable={false}
              alt="Fullscreen"
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setFsContextMenu({ x: e.clientX, y: e.clientY }); }}
            />
          </div>
          {/* 右侧图片信息栏 */}
          <FsImageInfoPanel
            imageSrc={fullscreenImage}
            onClose={() => { setFullscreenImage(null); setFsContextMenu(null); }}
            onDownload={() => { void downloadImage(fullscreenImage); }}
          />
          {/* 翻页按钮 */}
          {fullscreenNodeId && (() => {
            const fsNode = nodesRef.current.find(n => n.id === fullscreenNodeId);
            const total = fsNode?.images?.length || 0;
            if (total <= 1) return null;
            return (
              <>
                <button onPointerDown={e => { e.stopPropagation(); fsNavigate(-1); }}
                  disabled={fullscreenImageIdx <= 0}
                  className="absolute left-6 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-20 rounded-full text-white transition-colors"
                  title="上一张"
                ><ChevronLeftIcon size={28} /></button>
                <button onPointerDown={e => { e.stopPropagation(); fsNavigate(1); }}
                  disabled={fullscreenImageIdx >= total - 1}
                  className="absolute right-[17rem] top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-20 rounded-full text-white transition-colors"
                  title="下一张"
                ><ChevronRightIcon size={28} /></button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 rounded-full text-white text-sm backdrop-blur-sm">{fullscreenImageIdx + 1} / {total}</div>
              </>
            );
          })()}
          {fsContextMenu && (
            <div
              className="fixed z-[110] bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[140px] overflow-hidden"
              style={{ left: fsContextMenu.x, top: fsContextMenu.y }}
              onPointerDown={e => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-orange-600 hover:text-white flex items-center gap-2"
                onPointerDown={(e) => { e.stopPropagation(); setFsContextMenu(null);
                  const rect = containerRef.current?.getBoundingClientRect();
                  const cx = rect ? (window.innerWidth / 2 - rect.left - transformRef.current.x) / transformRef.current.scale : 0;
                  const cy = rect ? (window.innerHeight / 2 - rect.top - transformRef.current.y) / transformRef.current.scale : 0;
                  const newId = `annotation-${Date.now()}`;
                  setNodes(prev => [...prev, { id: newId, type: 'annotation', x: cx - 480, y: cy - 500, width: 960, height: 1000, sourceImage: fullscreenImage, annotations: [], isEditing: false, selectedAnnotationId: undefined }]);
                  setSelectedIds([newId]);
                  setFullscreenImage(null);
                }}
              >
                <AnnotationIcon size={16} /> 编辑图片
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                onPointerDown={(e) => { e.stopPropagation(); downloadImage(fullscreenImage); setFsContextMenu(null); }}
              >
                <DownloadIcon size={16} /> 下载图片
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-red-600 hover:text-white flex items-center gap-2"
                onPointerDown={(e) => { e.stopPropagation(); setFullscreenImage(null); setFsContextMenu(null); }}
              >
                <XIcon size={16} /> 关闭
              </button>
            </div>
          )}
        </div>
      )}

      {/* 快捷节点面板（左侧） */}
      <div
        className={`absolute left-6 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 canvas-chrome-150 ${canvasMode === 'audit' ? 'hidden' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setQuickPaletteOpen((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-[#1e1e1e]/90 backdrop-blur-md border border-[#333] text-gray-400 hover:text-white hover:bg-[#333] transition-colors shadow-lg"
          title={quickPaletteOpen ? '折叠面板' : '展开快捷节点面板'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {quickPaletteOpen
              ? <><polyline points="15,18 9,12 15,6"/></>
              : <><polyline points="9,18 15,12 9,6"/></>}
          </svg>
        </button>
        {quickPaletteOpen && (
          <div className="flex flex-col gap-0.5 bg-[#1e1e1e]/90 backdrop-blur-md rounded-xl border border-[#333] p-1.5 shadow-lg">
            {([
              { type: 'chat' as NodeType, label: '对话', icon: <MessageIcon size={15} />, color: 'hover:bg-rose-600' },
              { type: 't2i' as NodeType, label: '文生图', icon: <ImageIcon size={15} />, color: 'hover:bg-purple-600' },
              { type: 'i2i' as NodeType, label: '图生图', icon: <WandIcon size={15} />, color: 'hover:bg-blue-600' },
              { type: 'image' as NodeType, label: '图片', icon: <ImageIcon size={15} />, color: 'hover:bg-green-600' },
              { type: 'annotation' as NodeType, label: '标注', icon: <AnnotationIcon size={15} />, color: 'hover:bg-orange-600' },
              { type: 'video' as NodeType, label: '视频', icon: <VideoIcon size={15} />, color: 'hover:bg-amber-600' },
              { type: 'audio' as NodeType, label: '语音', icon: <AudioIcon size={15} />, color: 'hover:bg-blue-600' },
              { type: 'text' as NodeType, label: '文本', icon: <TextIcon size={15} />, color: 'hover:bg-blue-600' },
            ] as const).map((item) => (
              <button
                key={item.type}
                onClick={() => {
                  const defaultSize = DEFAULT_NODE_SIZES[item.type] || { width: 420, height: 300 };
                  const mp = canvasMouseRef.current;
                  addNodeAtCanvasPosition(item.type, mp.x - defaultSize.width / 2, mp.y - defaultSize.height / 2);
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 ${item.color} hover:text-white transition-colors`}
                title={`新建${item.label}节点`}
              >
                {item.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 缩放指示器 + 控制按钮（左下角） */}
      <div
        className={`absolute bottom-6 left-6 z-30 flex items-center gap-1 bg-[#1e1e1e]/90 backdrop-blur-md rounded-xl border border-[#333] px-2 py-1.5 shadow-lg canvas-chrome-150 ${canvasMode === 'audit' ? 'hidden' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            const ns = Math.max(0.05, transform.scale - 0.1);
            setTransform((p) => ({ ...p, scale: ns }));
          }}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-[#333] hover:text-white text-sm font-bold transition-colors"
          title="缩小"
        >−</button>
        <span
          className="text-xs text-gray-300 font-mono w-12 text-center select-none cursor-pointer hover:text-white transition-colors"
          title="点击重置为 100%"
          onClick={() => setTransform((p) => ({ ...p, scale: 1 }))}
        >{Math.round(transform.scale * 100)}%</span>
        <button
          onClick={() => {
            const ns = Math.min(5, transform.scale + 0.1);
            setTransform((p) => ({ ...p, scale: ns }));
          }}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-[#333] hover:text-white text-sm font-bold transition-colors"
          title="放大"
        >+</button>
        <div className="w-px h-4 bg-[#444] mx-0.5" />
        <button
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect || nodes.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach((n) => {
              if (n.x < minX) minX = n.x;
              if (n.y < minY) minY = n.y;
              if (n.x + n.width > maxX) maxX = n.x + n.width;
              if (n.y + n.height > maxY) maxY = n.y + n.height;
            });
            const pad = 80;
            const nw = maxX - minX + pad * 2;
            const nh = maxY - minY + pad * 2;
            const s = Math.min(rect.width / nw, rect.height / nh, 2);
            setTransform({
              x: rect.width / 2 - ((minX + (maxX - minX) / 2) * s),
              y: rect.height / 2 - ((minY + (maxY - minY) / 2) * s),
              scale: Math.max(0.05, s),
            });
          }}
          className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:bg-[#333] hover:text-white transition-colors"
          title="适合窗口 — 缩放并平移以显示所有节点"
        >⊞</button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:bg-[#333] hover:text-white transition-colors"
          title="重置为 100%"
        >1:1</button>
      </div>

      {/* 预览图分辨率调节（右下角） */}
      <div
        className={`absolute bottom-6 right-6 z-30 flex items-center gap-1 bg-[#1e1e1e]/90 backdrop-blur-md rounded-xl border border-[#333] px-2 py-1.5 shadow-lg ${canvasMode === 'audit' ? 'hidden' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] text-gray-400 select-none">预览</span>
        <select
          value={thumbResolutionRef.v}
          onChange={(e) => {
            thumbResolutionRef.v = Number(e.target.value);
            thumbnailCache.clear();
            // 强制刷新所有节点的 images 属性（创建新对象触发重渲染）
            setNodes(prev => prev.map(n => ({ ...n, _thumbTick: Date.now() })));
          }}
          className="rounded border border-[#444] bg-[#333] px-1 py-0.5 text-[10px] text-gray-200 outline-none cursor-pointer"
          title="预览图分辨率（影响所有缩略图质量）"
        >
          <option value="10">10%</option>
          <option value="20">20%</option>
          <option value="50">50%</option>
          <option value="70">70%</option>
          <option value="100">100%</option>
        </select>
      </div>
      {canvasMode !== 'audit' && bigEditorPortal}

    </div>
  );
}
