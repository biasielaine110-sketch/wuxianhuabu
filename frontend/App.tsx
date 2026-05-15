import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { CanvasNode, Edge, Transform, Tool, NodeType, Annotation, AnnotationNode, PanoramaNode, GridSplitNode, GridMergeNode, PanoramaT2iNode, Director3DNode, Figure3D, ChatNode, ChatMessage } from './types';
import type { AiProvider } from './services/aiSettings';
import {
  DEFAULT_CODESONLINE_IMAGE_BASE_URL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
  DEFAULT_JUNLAN_BASE_URL,
  DEFAULT_NEWAPI_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  getAiSettingsSnapshot,
  normalizeDeepSeekChatModelId,
  getCodesonlineSavedKey,
  getJunlanSavedKey,
  getNewApiSavedKey,
  migrateAiSettingsIfLegacy,
  persistAiSettings,
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
  stripRefMarkers,
  resolveSlotImagesForIndices,
  resolveSlotAudios,
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
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

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

/** ToAPIs 等返回的 base64 可能是 PNG/WebP，一律按魔数识别后再喂给 Image/canvas */
function sniffImageMimeFromBase64(raw: string): string {
  if (!raw || raw.length < 8) return 'image/jpeg';
  try {
    const dec = atob(raw.slice(0, 48));
    const a = dec.charCodeAt(0);
    const b = dec.charCodeAt(1);
    if (a === 0xff && b === 0xd8) return 'image/jpeg';
    if (a === 0x89 && b === 0x50) return 'image/png';
    if (a === 0x47 && b === 0x49) return 'image/gif';
    if (a === 0x52 && b === 0x49 && dec.startsWith('RIFF')) return 'image/webp';
  } catch {
    /* ignore */
  }
  return 'image/jpeg';
}

/** 视频节点：下拉仅 ToAPIs；旧工程里曾存的 New API 画布 id 映射为等价 ToAPIs 模型 */
function videoNodeModelToToApis(m?: string): 'grok-video-3' | 'sora-2-vvip' | 'veo3.1-fast' {
  const vm = (m || '').trim();
  if (vm === 'sora-2-vvip' || vm === 'firefly-sora2-newapi' || vm === 'firefly-sora2-pro-newapi') {
    return 'sora-2-vvip';
  }
  if (isVeo31FastVideoModel(vm) || vm === 'firefly-veo31-ref-newapi') {
    return 'veo3.1-fast';
  }
  return 'grok-video-3';
}

/** 视频节点 Veo：当前存 `veo3.1-fast`；旧工程可能仍为 `veo3.1-fast-official` */
function isVeo31FastVideoModel(m?: string): boolean {
  return m === 'veo3.1-fast' || m === 'veo3.1-fast-official';
}

/** 视频节点 Veo：ToAPIs 或旧工程中的 firefly-veo31-ref-newapi */
function isVideoVeoStyleModel(m?: string): boolean {
  return isVeo31FastVideoModel(m) || m === 'firefly-veo31-ref-newapi';
}

/** 视频节点 Sora：ToAPIs 或旧工程中的 firefly-sora2* */
function isVideoSoraStyleModel(m?: string): boolean {
  return m === 'sora-2-vvip' || m === 'firefly-sora2-newapi' || m === 'firefly-sora2-pro-newapi';
}

/** 视频节点 Grok 秒数档：ToAPIs Grok3；旧工程可能仍为 grok-imagine-newapi / Kling id */
function isVideoGrokDurationStyleModel(m?: string): boolean {
  const x = (m || '').trim();
  return (
    !x ||
    x === 'grok-video-3' ||
    x === 'grok-imagine-video-newapi' ||
    x === 'firefly-kling30-newapi' ||
    x === 'firefly-kling30omni-newapi'
  );
}

function base64ToImageDataUrl(raw: string): string {
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

const thumbnailCache = new Map<string, string>();
const THUMB_MAX_CACHE = 120;

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

/** 清理节点预览用的缩略图内存缓存（不涉及项目本地存档） */
function clearCanvasThumbnailCache(): void {
  thumbnailCache.clear();
}

function OptimizedImage({
  base64,
  className,
  alt,
  maxSide = 640,
  quality = 0.62,
  onClick,
  onDoubleClick,
  draggable = false,
  containerRef,
}: {
  base64: string;
  className?: string;
  alt?: string;
  maxSide?: number;
  quality?: number;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  /** 传入容器 ref 以实现响应式缩放：容器尺寸变化时自动重新计算缩略图 */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [src, setSrc] = useState('');
  const [dynamicMaxSide, setDynamicMaxSide] = useState(maxSide);
  const maxSideRef = useRef(maxSide);
  maxSideRef.current = maxSide;

  // 响应式缩放：根据容器尺寸动态计算 maxSide
  useEffect(() => {
    if (!containerRef?.current) {
      setDynamicMaxSide(maxSideRef.current);
      return;
    }

    const updateMaxSide = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerMax = Math.max(rect.width, rect.height);
      // 容器尺寸至少为 100px 才启用响应式
      if (containerMax >= 100) {
        setDynamicMaxSide(Math.round(containerMax));
      }
    };

    updateMaxSide();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateMaxSide);
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (!base64) {
      setSrc('');
      return;
    }
    const currentMaxSide = dynamicMaxSide;
    const cacheKey = `${base64.slice(0, 48)}|${base64.slice(-48)}|${base64.length}|${currentMaxSide}|${quality}`;
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      setSrc(cached);
      return;
    }

    const originalSrc = base64ToImageDataUrl(base64);
    setSrc('');

    const img = new Image();
    img.onload = () => {
      const maxEdge = Math.max(img.width, img.height);
      if (maxEdge <= currentMaxSide) {
        thumbnailCache.set(cacheKey, originalSrc);
        setSrc(originalSrc);
        return;
      }
      const scale = currentMaxSide / maxEdge;
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
      thumbnailCache.set(cacheKey, thumbSrc);
      if (thumbnailCache.size > THUMB_MAX_CACHE) {
        const firstKey = thumbnailCache.keys().next().value;
        if (firstKey) thumbnailCache.delete(firstKey);
      }
      setSrc(thumbSrc);
    };
    img.onerror = () => setSrc(originalSrc);
    img.src = originalSrc;
  }, [base64, dynamicMaxSide, quality]);

  if (!src) return null;
  return <img src={src} className={className} alt={alt} onClick={onClick} onDoubleClick={onDoubleClick} draggable={draggable} />;
}

/** 响应式图片预览组件：根据容器尺寸自动缩放图片 */
function ResponsiveImagePreview({
  base64,
  className,
  alt,
  quality = 0.62,
  onClick,
  onDoubleClick,
  draggable = false,
  fill = 'contain',
}: {
  base64: string;
  className?: string;
  alt?: string;
  quality?: number;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  /** 图片填充方式：'contain' | 'cover' */
  fill?: 'contain' | 'cover';
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

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`}>
      {dimensions.width > 0 && dimensions.height > 0 && (
        <OptimizedImage
          base64={base64}
          maxSide={maxSide}
          quality={quality}
          className={`w-full h-full object-${fill}`}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          draggable={draggable}
          alt={alt}
        />
      )}
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
  transform: Transform
): CanvasProject[] {
  if (!activeId) return projects;
  const { nodes: nc, edges: ec, transform: tc } = cloneCanvasForProject(nodes, edges, transform);
  const now = Date.now();
  const idx = projects.findIndex((p) => p.id === activeId);
  if (idx === -1) {
    return [{ id: activeId, name: '未命名项目', updatedAt: now, nodes: nc, edges: ec, transform: tc }, ...projects];
  }
  return projects.map((p) => (p.id === activeId ? { ...p, nodes: nc, edges: ec, transform: tc, updatedAt: now } : p));
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

type CanvasHistoryEntry = {
  nodes: CanvasNode[];
  edges: Edge[];
  selectedIds: string[];
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

/** 文生图预设分类 */
type T2iPresetCategoryId = 'template' | 'storyboard';

const T2I_PRESET_CATEGORY_OPTIONS: { id: T2iPresetCategoryId; label: string }[] = [
  { id: 'template', label: '模板' },
  { id: 'storyboard', label: '故事板' },
];

const I2I_PRESETS_BY_CATEGORY: Record<I2iPresetCategoryId, { key: string; label: string }[]> = {
  character: [
    { key: '角色4视图', label: '角色4视图' },
    { key: '角色6视图', label: '角色6视图' },
    { key: '角色8视图', label: '角色8视图' },
    { key: '角色无头视图', label: '角色无头视图' },
    { key: '角色细节图', label: '角色细节图' },
  ],
  scene: [
    { key: '场景四视图', label: '场景四视图' },
    { key: '场景9视图', label: '场景9视图' },
    { key: '场景九视图', label: '场景九视图' },
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
  ],
  other: [
    { key: '故事九宫格', label: '故事九宫格' },
    { key: '高清放大4K', label: '高清放大' },
  ],
};

const I2I_PRESET_FLAT = (Object.keys(I2I_PRESETS_BY_CATEGORY) as I2iPresetCategoryId[]).flatMap(
  (id) => I2I_PRESETS_BY_CATEGORY[id]
);

/** 文生图预设分类数据 */
const T2I_PRESETS_BY_CATEGORY: Record<T2iPresetCategoryId, { key: string; label: string }[]> = {
  template: [
    { key: '通用模板', label: '通用模板' },
  ],
  storyboard: [
    { key: '故事板_A', label: '故事板_A' },
    { key: '故事板_B', label: '故事板_B' },
  ],
};

const T2I_PRESET_FLAT = (Object.keys(T2I_PRESETS_BY_CATEGORY) as T2iPresetCategoryId[]).flatMap(
  (id) => T2I_PRESETS_BY_CATEGORY[id]
);

function t2iCategoryForPreset(preset: string | undefined): T2iPresetCategoryId {
  if (!preset) return 'template';
  for (const id of Object.keys(T2I_PRESETS_BY_CATEGORY) as T2iPresetCategoryId[]) {
    if (T2I_PRESETS_BY_CATEGORY[id].some((p) => p.key === preset)) return id;
  }
  return 'template';
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
  '反推提示词',
  'BBBB_全能资产',
  'EEEE_备选万能资产',
  'CCC即梦分镜',
  'CCC即梦视频',
]);

/** 内置文生图预设键（默认归入文生图类） */
const DEFAULT_T2I_PRESET_KEYS = new Set([
  '故事板_A',
  '故事板_B',
  '通用模板',
]);

/** 内置图生图预设键（默认归入图生图类，包含故事板） */
const DEFAULT_I2I_PRESET_KEYS = new Set([
  '故事板_A',
  '故事板_B',
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

/** 文生图下拉：与设置共用 promptPresets，按分类列出 */
function t2iPresetListForCategory(
  cat: T2iPresetCategoryId,
  promptPresets: Record<string, string>,
  domainOverrides: Record<string, PresetDomainId>
): { key: string; label: string }[] {
  return Object.keys(promptPresets)
    .filter(
      (name) =>
        settingsPresetDomain(name, domainOverrides) === 't2i' &&
        t2iCategoryForPreset(name) === cat
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
    '上下分屏排版。上半部分：面部特写。下半部分：角色三视图（正视图、侧视图、背视图）。注意：下半部分的三个身体必须完全无头（仅保留脖子以下）。白色背景，图片风格为真人照片质感，禁止转绘为漫画或其它风格。',
  '角色细节图':
    '专业游戏角色设定参考图，标准三视图+细节特写排版，左侧3张全身站姿（正面、左侧面、背面），右侧4行3列细节分镜，保持角色设计完全统一，极简纯白背景，细黑线分割网格，超写实人像摄影，8K分辨率，锐度拉满，电影级柔光，角色100%一致，无变形无穿模，包含头部多角度、面部五官、服装面料、拉链细节、背包细节、鞋履细节、手部细节，专业3D建模参考图，棚拍质感，并在每格左上角标注格数数字。',
  '场景9视图':
    '根据所有画面中保持外观、比例、材质、颜色和风格的完美一致性的原则。生成一个(16:9比例)设计的电影级专业3X3(共9张)的电影分镜网格。共9个面板。每个面板标记1-9的数字，该网格需采用3D电影截图风格。每一帧都是根据场景下不同角度，不同面的场景图。AI自动选择所有摄像机角度和构图。确保电影级布光、一致的调色、真实的景深以及连贯的环境演变。无重复镜头。',
  '场景九视图':
    '请根据提供的图片做出这个场景的不同角度图片，创作一个由九个画面组成的九宫格3*3排列画幅16:9。每个画面需精心设计以体现不同的景别和技术手法，包括但不限于特写、远景、俯拍、仰拍和运动镜头。场景中没有人物，用不同镜头角度展现。每个宫格标注1-9的数字。',
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
};

/** 文生图预设内容 */
const INITIAL_T2I_PROMPT_PRESETS: Record<string, string> = {
  '故事板_A':
    '避免场景过于相似，创建一个电影制作板/视觉规划表，展示短片或商业广告的完整概念。布局应简洁、基于网格，并分为清晰标记的部分。包含：共享创意指导（顶部栏）：整体限制，如镜头数量、统一的调色板和一般的环境背景。角色与风格参考部分：一个从多个角度展示的模型（正面、背面、侧面、特写、放松姿态），配有服装和配饰参考。强调身份的一致性，同时允许在特定场景中进行细微变化。环境和场景设计部分：一个具有戏剧性自然特征的场景户外地点，以及一个俯视示意图，说明在空间中的移动路径。包括摄像机位置和沿路线标注的拍摄类型。故事板部分：一系列编号的帧（大约8个镜头）展示场景的进展。每个帧包括：摄像机类型/镜头感觉，镜头大小（广角、中景、特写、微距），运动方式（静态、跟踪、手持等），动作和情绪进展的简要描述。灯光/情绪/风格备注：与灯光条件、氛围和纹理相关的视觉示例和简短描述。包括一天中不同时间的过渡和光线质量的变化。情绪和关键词块：指导作品的简洁情绪基调主题描述列表。音频/音调部分：环境声音、音乐风格和整体声音氛围的指示。电影摄影笔记：包括镜头特性、运动风格和后期处理感觉的总体视觉哲学。整个版面应感觉连贯、电影化且专业设计——就像导演的预制作指南，能一眼传达出基调、节奏和视觉叙事。将宽高比设为16:9，并且标注每个镜头的时长（秒）。这是一个以清晰排版和文字可读性为优先的专业故事板设计。所有文字必须清晰锐利、准确可读，禁止乱码和伪文字。分区标题、镜头编号、角色角度标签必须明显放大。每个分镜中的文字说明必须非常简短，控制在1到2行内，避免长段落。采用干净背景、高对比度文字、整齐网格布局和充足留白，确保整张板上的中文说明一眼可读。',
  '故事板_B':
    '一张AI视频生成指导图，整体采用真实影视前期提案板风格，画面像电影导演组内部使用的专业视觉开发文件，而不是普通拼贴海报。整个版面为高端中文电影UI排版包含角色设定、环境设计、摄影机位图、分镜故事板、情绪关键词、灯光设计、音频设计、摄影笔记、色调建议、节奏建议等多个模块，整体统一为超写实电影摄影风格，8K，高细节，真实胶片质感，具有强烈的电影工业化氛围。整张故事板必须以我的场景参考图为主，严格参考场景中的建筑结构、空间布局、地面材质，光影方向、环境氛围、远景层次、游客尺度与真实空间关系，确保所有分镜中的场景保持一致性和连续性。场景整体具有真实空间纵深，拥有电影级体积光、空气透视、漂浮灰尘、湿润反光、真实天气氛围与环境色温变化，整体风格统一，不能出现空间穿帮与建筑错位。环境氛围需要根据剧情自动匹配，例如压抑、宿命感、神性、史诗感、悬疑感、肃杀感、废墟感或超现实感。人物部分严格参考我的人物三视图进行统一生成，角色外观、发型、服装、盔甲、配饰、体型、颜色、材质、面部特征必须保持完全一致，不能在不同分镜中出现人物变形、服装变化、盔甲错误、脸部漂移或比例错误。人物需要生成标准角色设定区域，包括正面、背面、侧面、面部特写、情绪表情、站姿或坐姿参考，以及武器和装备细节参考。角色整体采用真实电影角色设计风格，而不是动漫设定图，人物皮肤、布料、金属、战损、灰尘、汗水与光影细节必须真实可信。故事板主体区域根据我的文字分镜脚本自动生成完整的电影分镜结构。每一个镜头都需要自动分析脚本中的人物动作、镜头运动、情绪变化、空间关系与叙事节奏，并生成对应的分镜画面。每格分镜必须包含时间码、景别、镜头角度、摄影机运动、人物动作、对白、音效与情绪描述。例如角色缓慢抬头时自动使用Slow Dolly-in，情绪爆发时自动使用Crash Zoom，战斗冲击时自动使用Dynamic Follow Shot，人物离场时自动使用Whip Pan或Handheld Tracking。所有镜头之间必须遵守180度轴线原则与30度有效分镜原则，确保角色站位、视线方向与镜头方向保持统一，形成真实电影剪辑逻辑，而不是随机拼接。镜头风格必须是真实电影摄影语言，包含低角度仰拍、过肩镜头、俯拍、长焦压缩、手持跟拍、浅景深、动态模糊、运动残影、镜头拉背、航拍推近等专业电影镜头设计。系统自动根据剧情判断镜头节奏，例如压抑对话采用稳定慢推镜头，紧张情绪采用手持微晃，史诗场景采用航拍大远景，人物心理震动采用焦点转移与背景虚化。所有镜头之间具有明确情绪递进，形成完整的观察→压迫→冲突→爆发→余韵的电影节奏。故事板底部自动生成情绪与风格关键词区域，根据剧情与场景自动提取风格标签，例如：超写实、电影感、宿命感、压抑、史诗感、神性、金属反光、潮湿空气、能量冲击，逆光尘埃、冷暖对比、烟雾氛围、胶片颗粒、真实光影、木质旧化、战损细节等，用于统一整部短片的视觉方向。同时自动生成音频与声场设计区域，根据分镜动作生成环境音、动作音效与BGM氛围。例如风声、脚步声、游客惊呼、火焰燃烧、金属摩擦、水能量轰鸣、低频震动、压迫鼓点，空旷回声、烟灰掉落声等，并自动匹配整体声场风格，例如贴近、压迫、低频，空旷、留白感或震撼感。故事板最后生成电影摄影笔记区域，自动分析整组镜头所需的镜头焦段、灯光逻辑与后期调色方向。例如35mm、50mm、85mm电影镜头组合，暖金高光与冷蓝阴影对比，真实皮肤纹理，胶片颗粒，HDR高动态范围，电影级动态模糊，真实镜头呼吸感，低饱和电影调色，摄影机慢推、手持跟随、镜头甩动、镜头摇移等电影语言。画面信息量巨大，一定要我的文字信息进行分析，分析故事内容和剧情走向等等，具有专业中文UI排版、真实摄影逻辑、真实故事板结构、真实镜头分析与真实电影工业化气质。',
  '通用模板':
    '16:9横屏，专业摄影，高清8K，电影级质感，写实风格，自然光影',
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
  activePreset,
  promptPresets,
  presetDomainOverrides,
  presetCategoryOverrides,
  onApplyPreset,
  onClearPreset,
}: {
  nodeId: string;
  activePreset?: string;
  promptPresets: Record<string, string>;
  presetDomainOverrides: Record<string, PresetDomainId>;
  presetCategoryOverrides: Record<string, I2iPresetCategoryId>;
  onApplyPreset: (nodeId: string, presetKey: string) => void;
  onClearPreset: (nodeId: string) => void;
}) {
  const [category, setCategory] = React.useState<I2iPresetCategoryId>(() =>
    settingsPresetCategory(activePreset ?? '', presetCategoryOverrides)
  );

  React.useEffect(() => {
    setCategory(settingsPresetCategory(activePreset ?? '', presetCategoryOverrides));
  }, [activePreset, presetCategoryOverrides]);

  const list = React.useMemo(
    () => i2iPresetListForCategory(category, promptPresets, presetDomainOverrides, presetCategoryOverrides),
    [category, promptPresets, presetDomainOverrides, presetCategoryOverrides]
  );
  const presetSelectValue =
    activePreset && list.some((p) => p.key === activePreset) ? activePreset : '';

  return (
    <div className="flex flex-col gap-1.5 p-2 shrink-0 border-b border-[#333]">
      {activePreset && (
        <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 rounded border border-cyan-600/50">
          <span className="text-[10px] text-cyan-400 font-medium">预设:</span>
          <span className="text-xs text-white font-bold">
            {I2I_PRESET_FLAT.find((p) => p.key === activePreset)?.label || activePreset}
          </span>
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
        <span className="text-[10px] text-gray-500 shrink-0">分类</span>
        <select
          className="i2i-preset-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-amber-500 min-w-[72px]"
          value={category}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setCategory(e.target.value as I2iPresetCategoryId);
          }}
        >
          {I2I_PRESET_CATEGORY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-gray-500 shrink-0">预设</span>
        <select
          className="i2i-preset-select flex-1 min-w-[120px] bg-[#222222] border border-[#444] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-amber-500"
          value={presetSelectValue}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const key = e.target.value;
            if (key) onApplyPreset(nodeId, key);
          }}
        >
          <option value="">选择预设…</option>
          {list.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function T2iPresetCategorySelect({
  nodeId,
  activePreset,
  promptPresets,
  presetDomainOverrides,
  onApplyPreset,
  onClearPreset,
}: {
  nodeId: string;
  activePreset?: string;
  promptPresets: Record<string, string>;
  presetDomainOverrides: Record<string, PresetDomainId>;
  onApplyPreset: (nodeId: string, presetKey: string) => void;
  onClearPreset: (nodeId: string) => void;
}) {
  const [category, setCategory] = React.useState<T2iPresetCategoryId>(() =>
    t2iCategoryForPreset(activePreset ?? '')
  );

  React.useEffect(() => {
    setCategory(t2iCategoryForPreset(activePreset ?? ''));
  }, [activePreset]);

  const list = React.useMemo(
    () => t2iPresetListForCategory(category, promptPresets, presetDomainOverrides),
    [category, promptPresets, presetDomainOverrides]
  );
  const presetSelectValue =
    activePreset && list.some((p) => p.key === activePreset) ? activePreset : '';

  return (
    <div className="flex flex-col gap-1.5 p-2 shrink-0 border-b border-[#333]">
      {activePreset && (
        <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-purple-900/40 to-pink-900/40 rounded border border-purple-600/50">
          <span className="text-[10px] text-purple-400 font-medium">预设:</span>
          <span className="text-xs text-white font-bold">
            {T2I_PRESET_FLAT.find((p) => p.key === activePreset)?.label || activePreset}
          </span>
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
        <span className="text-[10px] text-gray-500 shrink-0">分类</span>
        <select
          className="t2i-preset-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-purple-500 min-w-[72px]"
          value={category}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setCategory(e.target.value as T2iPresetCategoryId);
          }}
        >
          {T2I_PRESET_CATEGORY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-gray-500 shrink-0">预设</span>
        <select
          className="t2i-preset-select flex-1 min-w-[120px] bg-[#222222] border border-[#444] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-purple-500"
          value={presetSelectValue}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const key = e.target.value;
            if (key) onApplyPreset(nodeId, key);
          }}
        >
          <option value="">选择预设…</option>
          {list.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** 君澜 → codesonline → ToAPIs → New API（Firefly），与下拉选项顺序一致 */
function defaultCanvasImageModel(): string {
  return 'gpt-image-2-junlan';
}

/** 画布节点 Firefly（New API）模型 id */
function isFireflyNewApiImageModelId(id: string): boolean {
  return id === 'firefly-nano-banana-pro-newapi' || id === 'firefly-nano-banana2-newapi';
}

/** GPT Image 2：君澜 / codesonline / ToAPIs 节点选择时默认 4K */
function isGptImage2CanvasModelId(id: string): boolean {
  return id === 'gpt-image-2-junlan' || id === 'gpt-image-2-codesonline' || id === 'gpt-image-2';
}

/** 画布主界面快捷键说明（与 window keydown / paste 逻辑一致） */
const CANVAS_SHORTCUT_HELP_ROWS: readonly { combo: string; detail: string }[] = [
  { combo: 'V', detail: '选择工具' },
  { combo: 'B', detail: '框选工具' },
  { combo: '空格（按住）', detail: '临时切换到平移；松开后恢复选择工具' },
  { combo: 'Q', detail: '在视图中心新建「AI 对话」节点（无 Ctrl / ⌘ / Alt；不在输入框内）' },
  { combo: 'W', detail: '新建「文生图」节点' },
  { combo: 'E', detail: '新建「图生图」节点' },
  { combo: 'R', detail: '新建「图片标注」节点' },
  { combo: 'X', detail: '将当前选中节点设为吸管目标；无选中则取消吸管' },
  { combo: 'Esc', detail: '关闭本快捷键窗口（若已打开）；否则取消选中、关闭菜单与草稿连线、退出全屏图、取消吸管' },
  { combo: 'Delete / Backspace', detail: '删除当前选中的节点（非全屏预览图时）' },
  { combo: 'Alt + Q', detail: '删除当前选中的节点（同上）' },
  { combo: 'Ctrl + C / ⌘ + C', detail: '复制节点（仅当选中恰好 1 个节点时）' },
  { combo: 'Ctrl + V / ⌘ + V', detail: '粘贴（输入框外；优先粘贴图片为新节点，否则粘贴已复制节点）' },
  { combo: 'Ctrl + S / ⌘ + S', detail: '保存当前项目' },
  { combo: 'Ctrl + Alt + S / ⌘ + ⌥ + S', detail: '另存 JSON 草稿（不改变当前 Ctrl+S 绑定）' },
  { combo: 'Ctrl + Z / ⌘ + Z', detail: '撤销画布操作' },
  { combo: 'Ctrl + A / ⌘ + A', detail: '全选画布上的节点' },
  { combo: 'F', detail: '视口缩放并居中到当前选中节点（需先选中；非输入框）' },
];

// --- Main App Component ---

export default function App() {
  // --- State ---
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 0.4 });
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 多选支持
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Selection Box State
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionBoxRef = useRef<{ x: number, y: number, width: number, height: number } | null>(null);
  const isSelectingRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const pressStartPosRef = useRef<{ x: number, y: number } | null>(null);
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
  const lastCanvasHistorySignatureRef = useRef('');

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
    setFullscreenNodeId(nodeId);
    setFullscreenImage(img);
    setFullscreenImageIdx(idx);
    setFsTransform({ scale: 1, x: 0, y: 0 });
  };
  const fsNavigate = (dir: 1 | -1) => {
    const node = nodesRef.current.find(n => n.id === fullscreenNodeId);
    if (!node?.images?.length) return;
    const nextIdx = fullscreenImageIdx + dir;
    if (nextIdx < 0 || nextIdx >= node.images.length) return;
    setFullscreenImageIdx(nextIdx);
    setFullscreenImage(node.images[nextIdx]);
    setFsTransform({ scale: 1, x: 0, y: 0 });
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
  const [generationClockTick, setGenerationClockTick] = useState(0);

  const isAnyNodeGenerating = nodes.some(n => n.isGenerating);
  useEffect(() => {
    if (!isAnyNodeGenerating) return;
    const id = window.setInterval(() => {
      setGenerationClockTick(t => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isAnyNodeGenerating]);

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
    setTransform({ x: 0, y: 0, scale: 1 });
    setSelectedIds([]);
    canvasHistoryRef.current = [];
    canvasHistoryIndexRef.current = -1;
    historyInitializedRef.current = false;
    canvasHistoryOversizedWarnedRef.current = false;
    lastCanvasHistorySignatureRef.current = '';
    generationAbortControllersRef.current.clear();
    generationStartedAtRef.current.clear();
    clearCanvasThumbnailCache();
  }, []);

  const handleClearCanvasPreviewCache = useCallback(() => {
    clearCanvasThumbnailCache();
    alert('已清理画布预览缩略图缓存（内存）。大图仍可从节点数据加载；本地项目存档不受影响。');
  }, []);

  // --- Error Classification & Quick Fix ---
  const classifyError = useCallback((rawError: string, node: CanvasNode) => {
    const msg = (rawError || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('too many requests') || msg.includes('resource exhausted')) {
      return {
        title: '限流',
        reason: '请求频率过高或配额已达上限。',
        fixes: [
          { label: '切换轻量模型', action: () => handleUpdateNode(node.id, { model: node.type === 'chat' ? 'gemini-2.5-flash' : 'gemini-3.1-flash-image-preview', error: undefined }) },
          { label: '降低生成负载', action: () => handleUpdateNode(node.id, { imageCount: 1, resolution: '1k', error: undefined }) },
        ]
      };
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline') || msg.includes('network') || msg.includes('fetch failed')) {
      return {
        title: '超时',
        reason: '网络或模型响应超时。',
        fixes: [
          { label: '降低任务复杂度', action: () => handleUpdateNode(node.id, { imageCount: 1, resolution: '1k', error: undefined }) },
          { label: '清除错误重试', action: () => handleUpdateNode(node.id, { error: undefined }) },
        ]
      };
    }
    if (msg.includes('invalid') || msg.includes('unsupported') || msg.includes('bad request') || msg.includes('400') || msg.includes('参数')) {
      return {
        title: '参数无效',
        reason: '当前参数组合或输入内容不符合接口要求。',
        fixes: [
          {
            label: '恢复推荐参数',
            action: () =>
              handleUpdateNode(node.id, {
                aspectRatio: node.type === 'panoramaT2i' ? '2:1' : '16:9',
                imageCount: 1,
                resolution: '4k',
                ...(node.type === 't2i' || node.type === 'i2i' || node.type === 'panoramaT2i' || node.type === 'panorama' ? { model: defaultCanvasImageModel() } : {}),
                error: undefined,
              }),
          },
          { label: '清空本次报错', action: () => handleUpdateNode(node.id, { error: undefined }) },
        ]
      };
    }
    return {
      title: 'API 错误',
      reason: '接口鉴权、服务状态或返回格式异常。',
      fixes: [
        { label: '检查 API Key', action: () => { setSettingsTab('api'); setShowSettingsModal(true); handleUpdateNode(node.id, { error: undefined }); } },
        { label: '切换备用模型', action: () => handleUpdateNode(node.id, { model: node.type === 'chat' ? 'gemini-2.5-flash' : 'gemini-3.1-flash-image-preview', error: undefined }) },
      ]
    };
  }, [handleUpdateNode]);

  const renderNodeErrorPanel = useCallback((node: CanvasNode) => {
    if (!node.error) return null;
    const diagnosis = classifyError(node.error, node);
    return (
      <div className="absolute inset-x-3 bottom-3 z-20 text-xs text-red-200 bg-red-950/95 p-2 rounded border border-red-900/50 shadow-lg break-words max-h-40 overflow-y-auto backdrop-blur-md">
        <div className="flex justify-between items-start mb-1 gap-2">
          <span className="font-bold">{diagnosis.title}</span>
          <button onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { error: undefined }); }} className="text-red-300 hover:text-red-100"><XIcon size={12} /></button>
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
    'panorama': { width: 840, height: 630 },
    'panoramaT2i': { width: 880, height: 960 },
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
  /** 设置 → 预设：仅「文生图」大类下使用 — 模板/故事板 */
  const [settingsT2iPresetCategoryTab, setSettingsT2iPresetCategoryTab] = useState<T2iPresetCategoryId>('template');
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
  const [newApiBaseInput, setNewApiBaseInput] = useState(() => getAiSettingsSnapshot().newApiBaseUrl);
  const [newApiKeyInput, setNewApiKeyInput] = useState(() => getAiSettingsSnapshot().newApiKey);
  const [codesonlineBaseInput, setCodesonlineBaseInput] = useState(() => getAiSettingsSnapshot().codesonlineBaseUrl);
  const [codesonlineKeyInput, setCodesonlineKeyInput] = useState(() => getAiSettingsSnapshot().codesonlineKey);

  useEffect(() => {
    const s = getAiSettingsSnapshot();
    setAiProvider(s.provider);
    setOpenAiBaseInput(s.openAiBaseUrl);
    setApiKeyInput(s.provider === 'gemini' ? s.geminiKey : s.openAiKey);
    setDeepSeekKeyInput(s.deepSeekKey);
    setDeepSeekBaseInput(s.deepSeekBaseUrl);
    setJunlanBaseInput(s.junlanBaseUrl);
    setJunlanKeyInput(s.junlanKey);
    setNewApiBaseInput(s.newApiBaseUrl);
    setNewApiKeyInput(s.newApiKey);
    setCodesonlineBaseInput(s.codesonlineBaseUrl);
    setCodesonlineKeyInput(s.codesonlineKey);
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
    setNewApiBaseInput(s.newApiBaseUrl);
    setNewApiKeyInput(s.newApiKey);
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
      transform: { x: 0, y: 0, scale: 1 }
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
    setTransform(newProject.transform);
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
        transformRef.current
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
    setTransform(normalizedTarget.transform || { x: 0, y: 0, scale: 1 });
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
      setTransform(fbNorm.transform || { x: 0, y: 0, scale: 1 });
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
    setTransform(newProject.transform);
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
          transform: (imported.transform || { x: 0, y: 0, scale: 1 }) as Transform,
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
          setTransform(initial.transform || { x: 0, y: 0, scale: 1 });
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
        setSettingsT2iPresetCategoryTab('template');
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
  const handleApplyPreset = useCallback((nodeId: string, presetKey: string) => {
    // 只设置激活的预设标识，不改变 prompt 内容
    handleUpdateNode(nodeId, { activePreset: presetKey });
  }, [handleUpdateNode]);

  // 清除预设选择
  const handleClearPreset = useCallback((nodeId: string) => {
    handleUpdateNode(nodeId, { activePreset: undefined });
  }, [handleUpdateNode]);

  // 复制节点生成的图片到新的图片节点
  const handleCopyToImage = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 获取图片
    let images: string[] = [];
    if (node.images && node.images.length > 0) {
      images = node.images;
    } else if ((node as any).panoramaImage) {
      images = [(node as any).panoramaImage];
    }

    if (images.length === 0) {
      alert('没有可复制的图片');
      return;
    }

    // 创建图片节点
    const newNodes: CanvasNode[] = images.map((img, idx) => ({
      id: `image-${Date.now()}-${idx}`,
      type: 'image' as const,
      x: node.x + node.width + 50 + idx * 510,
      y: node.y,
      width: 480,
      height: 528,
      prompt: '',
      images: [img],
      viewMode: 'single' as const,
      currentImageIndex: 0
    }));

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
    const genId = (prefix: string) => `${prefix}-${Date.now()}-${n++}-${Math.floor(Math.random() * 10000)}`;
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
      selectedIds: [...snapshot.selectedIds].sort(),
    });
  }, []);

  const pushCanvasHistorySnapshot = useCallback((snapshot: CanvasHistoryEntry) => {
    const signature = buildCanvasHistorySignature(snapshot);
    if (signature === lastCanvasHistorySignatureRef.current) return;
    const payloadChars = estimateCanvasBase64PayloadChars(snapshot.nodes);
    const historyEmpty = canvasHistoryRef.current.length === 0;
    if (!historyEmpty && payloadChars > CANVAS_HISTORY_SKIP_PAYLOAD_CHARS) {
      lastCanvasHistorySignatureRef.current = signature;
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
      console.warn('[canvas] 撤销快照克隆失败，释放旧历史后重试', e);
      canvasHistoryRef.current = canvasHistoryRef.current.slice(-2);
      canvasHistoryIndexRef.current = canvasHistoryRef.current.length - 1;
      historyBefore = canvasHistoryRef.current.slice(0, canvasHistoryIndexRef.current + 1);
      if (historyBefore.length > maxSteps - 1) {
        historyBefore = historyBefore.slice(historyBefore.length - (maxSteps - 1));
      }
      try {
        cloned = structuredClone(snapshot);
      } catch (e2) {
        console.warn('[canvas] 已跳过本次撤销记录', e2);
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

  const undoCanvasState = useCallback(() => {
    if (canvasHistoryIndexRef.current <= 0) return;
    const prevIndex = canvasHistoryIndexRef.current - 1;
    const snapshot = canvasHistoryRef.current[prevIndex];
    if (!snapshot) return;
    let nodesN: CanvasNode[];
    let edgesN: Edge[];
    let selN: string[];
    try {
      nodesN = structuredClone(snapshot.nodes);
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
          console.warn('[canvas] 画布图片数据过大，无法建立撤销栈（Ctrl+Z 不可用）；建议拆分项目或导出后再编辑。');
        }
      }
      return;
    }
    if (historyDebounceTimerRef.current) {
      clearTimeout(historyDebounceTimerRef.current);
      historyDebounceTimerRef.current = null;
    }
    historyDebounceTimerRef.current = window.setTimeout(() => {
      pushCanvasHistorySnapshot(snapshot);
    }, 480);
    return () => {
      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current);
        historyDebounceTimerRef.current = null;
      }
    };
  }, [nodes, edges, selectedIds, pushCanvasHistorySnapshot]);

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
    if (containerRef.current) {
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
    } else if (pointerType === 'boxSelect') {
      // 框选移动处理 - 使用屏幕坐标
      if (isSelecting && pressStartPosRef.current) {
        const startX = pressStartPosRef.current.x;
        const startY = pressStartPosRef.current.y;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        setSelectionBox({
          x: Math.min(startX, startX + dx),
          y: Math.min(startY, startY + dy),
          width: Math.abs(dx),
          height: Math.abs(dy)
        }); selectionBoxRef.current = {
          x: Math.min(startX, startX + dx),
          y: Math.min(startY, startY + dy),
          width: Math.abs(dx),
          height: Math.abs(dy)
        };
      }
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
        if (acc && (acc.deltaX !== 0 || acc.deltaY !== 0)) {
          const { nodeIds, deltaX, deltaY } = acc;
          setNodes((prev) =>
            prev.map((node) =>
              nodeIds.includes(node.id) ? { ...node, x: node.x + deltaX, y: node.y + deltaY } : node
            )
          );
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
            setEdges(prev => [...prev, { id: `edge-${Date.now()}`, sourceId, targetId }]);
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
              setEdges(prev => prev.filter(ed => ed.id !== drag.edgeId));
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

  const createImageNodeFromBase64 = useCallback((base64: string) => {
    const mp = canvasMouseRef.current;
    const x = mp.x - 240;
    const y = mp.y - 264;
    const newNode: CanvasNode = {
      id: `image-${Date.now()}`,
      type: 'image',
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: 480,
      height: 528,
      prompt: '',
      images: [base64],
      viewMode: 'single',
      currentImageIndex: 0
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedIds([newNode.id]);
  }, [transform]);

  /** 缩放并平移视口，使当前选中节点的外接矩形尽量占满画布区域（无选中时不做） */
  const fitViewportToSelectedNodes = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 8 || rect.height < 8) return;
    const pad = 48;
    const availW = Math.max(40, rect.width - pad * 2);
    const availH = Math.max(40, rect.height - pad * 2);
    const selIds = selectedIdsRef.current;
    if (selIds.length === 0) return;
    const list = nodesRef.current.filter((n) => selIds.includes(n.id));
    if (list.length === 0) return;
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
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const scaleX = availW / bw;
    const scaleY = availH / bh;
    let newScale = Math.min(scaleX, scaleY, 5);
    newScale = Math.max(0.1, newScale);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const newX = rect.width / 2 - cx * newScale;
    const newY = rect.height / 2 - cy * newScale;
    setTransform({ x: newX, y: newY, scale: newScale });
  }, []);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT';
      const isContentEditable = (e.target as HTMLElement).isContentEditable;

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
        placeNewNodeAtMouse('annotation');
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
        if (selectedIdsRef.current.length === 1) {
          const node = nodes.find(n => n.id === selectedIdsRef.current[0]);
          if (node) setClipboard(node);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !isInput) {
        // 交给 paste 事件统一处理（优先粘贴外部图片）
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
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (isInput) return;

      const items = e.clipboardData?.items;
      const imageItem = items ? Array.from(items).find(item => item.type.startsWith('image/')) : null;
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          const base64 = result.split(',')[1];
          if (base64) createImageNodeFromBase64(base64);
        };
        reader.readAsDataURL(file);
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
    undoCanvasState,
    saveCurrentProject,
    handleSaveDraftJsonSaveAs,
    fitViewportToSelectedNodes,
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
    const newScale = Math.min(Math.max(0.1, transform.scale * (1 + delta)), 5);

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
    setContextMenu(null);

    if (activeTool === 'pan' || e.button === 1) {
      activePointerTypeRef.current = 'canvas';
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (activeTool === 'boxSelect') {
      // 框选工具：立即开始框选
      pressStartPosRef.current = { x: e.clientX, y: e.clientY };
      selectionModifiersRef.current = { ctrl: e.ctrlKey, alt: e.altKey };
      activePointerTypeRef.current = 'boxSelect';
      flushSync(() => {
        isSelectingRef.current = true;
        setIsSelecting(true);
        selectionBoxRef.current = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
        setSelectionBox({ x: e.clientX, y: e.clientY, width: 0, height: 0 }); selectionBoxRef.current = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
      });
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
        flushSync(() => {
          isSelectingRef.current = true;
          setIsSelecting(true);
          selectionBoxRef.current = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
          setSelectionBox({ x: e.clientX, y: e.clientY, width: 0, height: 0 }); selectionBoxRef.current = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
        });
      }, 300);
    }
  }, [activeTool, fullscreenImage]);

  // 框选移动处理
  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    // 节点缩放仅由 window pointermove + session 处理（此处曾用未除 scale 的 delta，易与全局监听叠加导致跳动）

    if (!isSelecting || !pressStartPosRef.current) return;

    // 更新修饰键状态
    selectionModifiersRef.current = { ctrl: e.ctrlKey, alt: e.altKey };

    const startX = pressStartPosRef.current.x;
    const startY = pressStartPosRef.current.y;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    setSelectionBox({
      x: Math.min(startX, startX + dx),
      y: Math.min(startY, startY + dy),
      width: Math.abs(dx),
      height: Math.abs(dy)
    });
  }, [isSelecting]);

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

    if ((pointerType === 'boxSelect' || pointerType === 'selection') && isSelecting && selectionBox) {
      const rect = containerRef.current!.getBoundingClientRect();
      const scale = transformRef.current.scale;

      // 将屏幕坐标转换为画布坐标
      const boxX = (selectionBox.x - rect.left - transformRef.current.x) / scale;
      const boxY = (selectionBox.y - rect.top - transformRef.current.y) / scale;
      const boxWidth = selectionBox.width / scale;
      const boxHeight = selectionBox.height / scale;

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

      setIsSelecting(false);
      setSelectionBox(null);
      pressStartPosRef.current = null;
      activePointerTypeRef.current = null;
    }
  }, [selectionBox, isSelecting]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (fullscreenImage) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
    const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
  }, [transform, fullscreenImage]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    if (fullscreenImage) return;
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
        'input, textarea, select, button, a, [role="button"], [role="slider"], [role="listbox"], [contenteditable="true"]'
      );

    /** 吸管模式：点击节点窗口任意非表单区域即可与「吸取目标」节点连线（与预览区点击行为一致） */
    const eyeT = eyedropperTargetNodeIdRef.current;
    if (eyeT && eyeT !== id && !isInteractiveSurface) {
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

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const isVideoFile = (f: File) =>
      f.type.startsWith('video/') ||
      /\.(mp4|webm|mov|mkv|avi|m4v|ogv|mpeg|mpg)(\?.*)?$/i.test(f.name);

    const videoFiles = files.filter(isVideoFile);
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
      return;
    }

    const file = files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        const newNode: CanvasNode = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: mouseX - 240, // Center the node (width 480/2)
          y: mouseY - 264, // Center the node (height 528/2)
          width: 480,
          height: 528,
          prompt: '',
          images: [base64],
          viewMode: 'single',
          currentImageIndex: 0
        };
        setNodes(prev => [...prev, newNode]);
        setSelectedIds([newNode.id]);
      };
      reader.readAsDataURL(file);
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
      resolution: type === 't2i' || type === 'i2i' || type === 'panoramaT2i' ? '4k' : '2k',
      imageCount: 1,
      model:
        type === 't2i' || type === 'i2i' || type === 'panoramaT2i' || type === 'panorama'
          ? defaultCanvasImageModel()
          : 'gemini-3.1-flash-image-preview',
      viewMode: 'single',
      currentImageIndex: 0,
      ...(type === 'panoramaT2i' ? { activePreset: '全景图生成' } : {}),
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
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.sourceId !== id && e.targetId !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleDeleteEdge = (id: string) => {
    setEdges(prev => prev.filter(e => e.id !== id));
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
      const incomingEdges = edges.filter(e => e.targetId === nodeId);
      const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];

      const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);

      // 获取预设提示词（如果有激活的预设）
      const presetPrompt = node.activePreset ? promptPresets[node.activePreset] || '' : '';
      
      // 预设提示词在前，用户输入在后
      const combinedPrompt = [presetPrompt, node.prompt, ...textInputs].filter(Boolean).join('\n');
      
      // Do NOT append resolution/aspect ratio to the prompt text to avoid confusing the model's style adherence.
      const finalPrompt = combinedPrompt;

      let base64DataArray: string[] = [];

      if (node.type === 't2i') {
        if (!finalPrompt) throw new Error("请输入提示词或连接文本节点");
        base64DataArray = await generateNewImage(
          finalPrompt,
          node.aspectRatio || '16:9',
          node.imageCount || 1,
          node.model || defaultCanvasImageModel(),
          node.resolution,
          ac.signal
        );
      } else if (node.type === 'i2i' || node.type === 'panoramaT2i') {
        const slots = buildIncomingRefSlots(nodeId, edges, nodes);
        const pickIndices = parseRefPickIndices(finalPrompt);
        const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);
        const promptForModel = stripRefMarkers(finalPrompt) || finalPrompt;
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

    const incomingEdges = edges.filter(e => e.targetId === nodeId);
    const inputNodes = incomingEdges.map(e => nodes.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
    const textInputs = inputNodes.map(n => n.prompt).filter(Boolean);

    const slots = buildIncomingRefSlots(nodeId, edges, nodes);
    const pickIndices = parseRefPickIndices(inputText);
    const { base64s: refImages, missing } = await resolveSlotImagesForIndices(slots, pickIndices);

    const strippedQuestion = stripRefMarkers(inputText) || inputText;

    const baseMessages = opts?.baseMessages ?? (node.messages || []);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: inputText,
      image: refImages.length >= 1 ? refImages[0] : undefined,
      images: refImages.length > 1 ? refImages : undefined,
    };

      const contextParts: string[] = [];
      if (refImages.length > 0) {
        contextParts.push(`用户通过参考区提供了 ${refImages.length} 张视觉参考（见附图，顺序与 @R 序号一致）。`);
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
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? ({
              ...n,
              messages: [...baseMessages, userMessage],
              prompt: '',
              isGenerating: true,
              error: undefined,
            } as CanvasNode)
          : n
      )
    );

    try {
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
          imageBase64: refImages.length === 1 ? refImages[0] : undefined,
          imageBase64s: refImages.length > 1 ? refImages : undefined,
        },
      ];

      const response = await callGeminiChatWithHistory(
        apiTurns,
        normalizeDeepSeekChatModelId(node.model || DEFAULT_DEEPSEEK_CHAT_MODEL_ID).trim()
      );

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: response,
      };

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const ch = n as ChatNode;
          const msgs = ch.messages || [];
          return { ...ch, messages: [...msgs, assistantMessage], isGenerating: false } as CanvasNode;
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

  // 处理连线数据传递 - 当有连线连接到 panorama 或 annotation 节点时
  useEffect(() => {
    nodes.forEach(node => {
      if (node.type === 'panorama' || node.type === 'annotation' || node.type === 'panoramaT2i' || node.type === 'director3d') {
        const incomingEdges = edges.filter(e => e.targetId === node.id);
        if (incomingEdges.length > 0) {
          // 获取连接的源节点图片
          const sourceNodes = incomingEdges
            .map(e => nodes.find(n => n.id === e.sourceId))
            .filter(Boolean) as CanvasNode[];
          
          const sourceImages = sourceNodes.flatMap((n) => {
            const imgs = n.images || [];
            if (!imgs.length) return [];
            const idx = Math.min(Math.max(0, n.currentImageIndex ?? 0), imgs.length - 1);
            const b = imgs[idx];
            return b ? [b] : [];
          });
          
          if (sourceImages.length > 0) {
            // 更新可接收图片输入的节点
            const updates: Partial<CanvasNode> = {};
            if (node.type === 'panorama') {
              updates.panoramaImage = sourceImages[0]; // 使用第一个连接的图片
            } else if (node.type === 'annotation') {
              updates.sourceImage = sourceImages[0];
            } else if (node.type === 'panoramaT2i') {
              updates.images = [sourceImages[0]]; // 全景图生成节点使用 images
            } else if (node.type === 'director3d') {
              updates.backgroundImage = sourceImages[0]; // 3D导演台节点使用 backgroundImage
            } else if (node.type === 'image') {
              updates.images = [sourceImages[0]];
              updates.currentImageIndex = 0;
            }
            
            // 只有当图片不同时才更新
            if (node.type === 'panorama' && node.panoramaImage !== sourceImages[0]) {
              handleUpdateNode(node.id, updates);
            } else if (node.type === 'annotation' && node.sourceImage !== sourceImages[0]) {
              handleUpdateNode(node.id, updates);
            } else if (node.type === 'director3d' && node.backgroundImage !== sourceImages[0]) {
              handleUpdateNode(node.id, updates);
            } else if (node.type === 'image' && node.images?.[0] !== sourceImages[0]) {
              handleUpdateNode(node.id, updates);
            }
          }
        }
      }
    });
  }, [edges, nodes]);

  const downloadImage = useCallback(async (base64: string) => {
    const mime = sniffImageMimeFromBase64(base64);
    try {
      const r = await saveImageDownload(base64, mime);
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

  const handleGenerateVideo = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'video') return;

    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);
    generationStartedAtRef.current.set(nodeId, Date.now());

    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: true, error: undefined } : n)));

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

      let videoUrl: string;
      const videoModel = videoNodeModelToToApis(node.model);

      const resolution: '480p' | '720p' | '1080p' | '4k' =
        videoModel === 'veo3.1-fast'
          ? (['1080p', '4k'].includes(node.videoResolution || '') ? (node.videoResolution as '1080p' | '4k') : '720p')
          : videoModel === 'sora-2-vvip'
            ? '720p'
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
        referenceImagesBase64: imageInputs.slice(0, 3),
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

  // --- Render Helpers ---
  const renderNode = (node: CanvasNode) => {
    void generationClockTick;
    const genStart = generationStartedAtRef.current.get(node.id);
    const genElapsedSec =
      node.isGenerating && genStart != null
        ? Math.max(0, Math.floor((Date.now() - genStart) / 1000))
        : 0;
    const genTimeMmSs = `${String(Math.floor(genElapsedSec / 60)).padStart(2, '0')}:${String(genElapsedSec % 60).padStart(2, '0')}`;

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
        onDoubleClick={node.type === 'text' ? () => { setEditingTextNodeIds(prev => { const next = new Set(prev); next.add(node.id); return next; }); } : undefined}
      >
        {/* 文本节点取消选中时退出编辑 */}
        {node.type === 'text' && !isSelected && editingTextNodeIds.has(node.id) ? (
          <></>
        ) : null}
        {/* Floating title - outside window, transparent */}
        <div className="absolute -top-14 left-3 z-30 flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
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
              className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 cursor-nw-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 'nw')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-3 h-3 cursor-ne-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 'ne')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-3 h-3 cursor-sw-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 'sw')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-3 h-3 cursor-se-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 'se')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>

            {/* 四条边的缩放手柄 */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-2 cursor-n-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 'n')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-2 cursor-s-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 's')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-4 cursor-w-resize z-40 group/resize"
              onPointerDown={(e) => beginNodeResize(e, node.id, 'w')}
            >
              <div className="w-full h-full rounded-full bg-gray-600 group-hover/resize:bg-gray-400 transition-colors" />
            </div>
            <div
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-4 cursor-e-resize z-40 group/resize"
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
              {images.length > 0 ? (
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
                        <MaximizeIcon size={25}/>
                      </button>
                    )}
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const imgData = images[currentIndex];
                        if (imgData) {
                          const newNodeId = `image-${Date.now()}`;
                          const newNode: CanvasNode = {
                            id: newNodeId,
                            type: 'image',
                            x: node.x + 525,
                            y: node.y,
                            width: 480,
                            height: 528,
                            images: [imgData],
                            currentImageIndex: 0,
                          };
                          setNodes(prev => [...prev, newNode]);
                        }
                      }}
                      className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="复制图片"
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
                  </div>

                  {viewMode === 'grid' ? (
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-1 overflow-y-auto p-1 content-start">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative w-full group/item" style={{ aspectRatio: '1' }}>
                          <ResponsiveImagePreview
                            base64={img}
                            quality={0.58}
                            fill="contain"
                            className="bg-[#3A3A3A] rounded transition-opacity"
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
                            <MaximizeIcon size={25}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center group/single">
                      <ResponsiveImagePreview
                        base64={images[currentIndex]}
                        quality={0.6}
                        fill="contain"
                        className={eyedropperTargetNodeId ? 'cursor-cyan-400' : ''}
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
                        <MaximizeIcon size={25}/>
                      </button>

                      {/* Pagination Controls */}
                      {images.length > 1 && (
                        <>
                          <button 
                            onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { currentImageIndex: Math.max(0, currentIndex - 1) }); }} 
                            disabled={currentIndex === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                          >
                            <ChevronLeftIcon size={25}/>
                          </button>
                          <button
                            onPointerDown={(e) => { e.stopPropagation(); handleUpdateNode(node.id, { currentImageIndex: Math.min(images.length - 1, currentIndex + 1) }); }}
                            disabled={currentIndex === images.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                          >
                            <ChevronRightIcon size={25}/>
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
                      {images.length > 0 && (
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
                      <span className="text-xs tabular-nums tracking-tight">已用时 {genTimeMmSs}</span>
                      <span className="text-[10px] text-gray-500">{genElapsedSec} 秒</span>
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
            <div className="w-full h-[680px] shrink-0 bg-[#2a2a2a] relative border-b border-[#333] overflow-hidden group">
              {videoUrls.length > 0 ? (
                <>
                <video
                    key={videoUrls[currentVideoIdx] || 'v'}
                    src={videoUrls[currentVideoIdx]}
                  controls
                    className="w-full h-full object-contain bg-black"
                  />
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
                          className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                          title="上一条"
                        >
                          <ChevronLeftIcon size={14} />
                        </button>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = (currentVideoIdx + 1) % videoUrls.length;
                            handleUpdateNode(node.id, { currentVideoIndex: next });
                          }}
                          className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                          title="下一条"
                        >
                          <ChevronRightIcon size={14} />
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
                      className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                      title="下载当前视频"
                    >
                      <DownloadIcon size={14} />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-black/50 px-2 py-0.5 rounded">
                    {currentVideoIdx + 1} / {videoUrls.length}
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
                      <span className="relative text-amber-400 text-xs tabular-nums tracking-tight" style={{
                        textShadow: '0 0 10px rgba(255,170,0,0.8)',
                        animation: 'genTextBlink 1.5s ease-in-out infinite',
                      }}>已用时 {genTimeMmSs}</span>
                      <span className="relative text-amber-500/70 text-[10px]">{genElapsedSec} 秒</span>
                      
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
          )}

          {/* 3D导演台节点内容 */}
          {node.type === 'director3d' && (
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
          )}

          {/* 图片标注节点内容 */}
          {node.type === 'annotation' && (
            <AnnotationNodeContent
              node={node as AnnotationNode}
              nodes={nodes}
              edges={edges}
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
              onFullscreenImage={(base64) => setFullscreenImage(base64)}
            />
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
                images.forEach((img, idx) => {
                  const newNode: CanvasNode = {
                    id: `image-${Date.now()}-${idx}`,
                    type: 'image',
                    x: x + idx * 510,
                    y,
                    width: 480,
                    height: 528,
                    prompt: '',
                    images: [img],
                    viewMode: 'single',
                    currentImageIndex: 0
                  };
                  setNodes(prev => [...prev, newNode]);
                });
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
              onCreateImageNode={(image, x, y) => {
                const newNode: CanvasNode = {
                  id: `image-${Date.now()}`,
                  type: 'image',
                  x,
                  y,
                  width: 480,
                  height: 528,
                  prompt: '',
                  images: [image],
                  viewMode: 'single',
                  currentImageIndex: 0
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
              generationMmSs={node.isGenerating ? genTimeMmSs : undefined}
              generationSeconds={node.isGenerating ? genElapsedSec : undefined}
            />
          )}

          {/* Header */}
        <div className="min-h-8 py-1.5 bg-[#252525] border-b border-[#333] flex items-center justify-between px-3 cursor-grab active:cursor-grabbing shrink-0">
          <div className="flex items-center gap-2">
            {headerIcon}
          </div>
          {(node.type === 't2i' || node.type === 'i2i' || node.type === 'panoramaT2i' || node.type === 'panorama') && (
            <>
              <select className="nodemodel-select bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500 flex-1 min-w-[90px]" value={node.model || defaultCanvasImageModel()} onChange={(e) => { const m = e.target.value; const patch: Partial<CanvasNode> = { model: m }; if (isFireflyNewApiImageModelId(m)) patch.resolution = '2k'; else if (isGptImage2CanvasModelId(m)) patch.resolution = '4k'; handleUpdateNode(node.id, patch); }} onPointerDown={e => e.stopPropagation()}>
                {(node.type === 't2i' || node.type === 'panoramaT2i') ? (<><option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option><option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option><option value="gpt-image-2">GPT Image 2（ToAPIs）</option><option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option><option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option><option value="firefly-nano-banana-pro-newapi">Firefly Nano Banana Pro（New API）</option><option value="firefly-nano-banana2-newapi">Firefly Nano Banana 2（New API）</option><option value="imagen-4">Imagen 4</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option></>) : (<><option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option><option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option><option value="gpt-image-2">GPT Image 2（ToAPIs）</option><option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option><option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option><option value="firefly-nano-banana-pro-newapi">Firefly Nano Banana Pro（New API）</option><option value="firefly-nano-banana2-newapi">Firefly Nano Banana 2（New API）</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option></>)}
              </select>
              <div className="nodemeta-skip-scale flex items-center gap-0.5">
                <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.aspectRatio || (node.type === 'panoramaT2i' ? '2:1' : '16:9')} onChange={(e) => handleUpdateNode(node.id, { aspectRatio: e.target.value })} onPointerDown={e => e.stopPropagation()}>
                  {node.type === 'panoramaT2i' ? (<><option value="2:1">2:1</option><option value="21:9">21:9</option></>) : (<><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="21:9">21:9</option><option value="4:3">4:3</option><option value="3:4">3:4</option></>)}
                </select>
                <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.resolution || '4k'} onChange={(e) => handleUpdateNode(node.id, { resolution: e.target.value })} onPointerDown={e => e.stopPropagation()}><option value="4k">4K</option><option value="2k">2K</option><option value="1k">1K</option></select>
                <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.imageCount || 1} onChange={(e) => handleUpdateNode(node.id, { imageCount: parseInt(e.target.value) })} onPointerDown={e => e.stopPropagation()}><option value={1}>1</option><option value={2}>2</option><option value={4}>4</option></select>
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
          const modelSelectValue = videoNodeModelToToApis(vm);
          const isSora = isVideoSoraStyleModel(vm);
          const isVeo = isVideoVeoStyleModel(vm);
          const isGroDur = isVideoGrokDurationStyleModel(vm);
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
                    {vSlots.slice(0, 6).map((slot) => (
                      <div key={`${node.id}-vslot-${slot.n}`} className="relative group">
                        <div className="absolute -top-1 left-0 z-[1] rounded bg-black/70 px-1 text-[8px] font-bold leading-none text-cyan-300">
                          R{slot.n}
                        </div>
                        {slot.kind === 'image' && slot.imageBase64 ? (
                          <OptimizedImage
                            base64={slot.imageBase64}
                            maxSide={160}
                            quality={0.7}
                            alt={slot.label}
                            className="h-10 w-10 rounded border border-[#444] object-cover"
                          />
                        ) : slot.kind === 'video' && slot.videoUrl ? (
                          <video
                            src={slot.videoUrl}
                            className="h-10 w-10 rounded border border-[#444] object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : slot.kind === 'audio' ? (
                          <div className="h-10 w-10 rounded border border-[#444] bg-[#333] flex items-center justify-center" title={slot.label}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                              <line x1="12" x2="12" y1="19" y2="22"/>
                            </svg>
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded border border-[#444] bg-[#333]" title={slot.label} />
                        )}
                        <button
                          onPointerDown={(e) => {
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEdge(slot.edgeId);
                          }}
                          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                          title="取消引用"
                        >
                          <span className="text-[9px] leading-none">×</span>
                        </button>
                      </div>
                    ))}
                    {vSlots.length > 6 && (
                      <span className="flex items-center text-gray-500">+{vSlots.length - 6}</span>
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
                </optgroup>
            </select>
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
                  <option value={4}>4 秒</option>
                  <option value={8}>8 秒</option>
                  <option value={12}>12 秒</option>
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
                    node.videoResolution === '1080p' || node.videoResolution === '4k'
                      ? node.videoResolution
                      : '720p'
                  }
                  onChange={(e) =>
                    handleUpdateNode(node.id, {
                      videoResolution: e.target.value as '720p' | '1080p' | '4k',
                    })
                  }
                  onPointerDown={e => e.stopPropagation()}
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4k">4K</option>
                </select>
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
            const i2iSourceImages = i2iSourceNodes.flatMap(n => n.images || []).filter(img => img && img !== '');
            return i2iSourceImages.length > 0 ? (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-[#1e1e1e] border-b border-[#333] text-[10px] shrink-0">
                <span className="text-gray-500">参考:</span>
                <span className="text-green-400 font-medium">{i2iSourceImages.length}张</span>
                <div className="flex gap-0.5 ml-1 flex-wrap">
                  {i2iSourceImages.slice(0, 4).map((img, idx) => (
                    <OptimizedImage key={idx} base64={img} maxSide={64} quality={0.6} alt={`R${idx+1}`} className="w-5 h-5 object-cover rounded border border-[#444]" />
                  ))}
                  {i2iSourceImages.length > 4 && <span className="text-gray-600">+{i2iSourceImages.length-4}</span>}
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
          {/* Text Area - panoramaT2i 使用内置提示词，不显示输入框 */}
          {(node.type === 't2i' || node.type === 'i2i' || node.type === 'text' || node.type === 'video') && (
            <div
              className={`flex flex-col min-h-0 overflow-hidden ${
                node.type === 't2i' || node.type === 'i2i' ? 'flex-[3] basis-0' : 'flex-1'
              }`}
              style={node.type === 'text' ? { display: isSelected && editingTextNodeIds.has(node.id) ? undefined : 'none' } : undefined}
            >
              {/* 预设按钮区域 - i2i节点 */}
              {node.type === 'i2i' && (
                <I2iPresetCategorySelect
                  nodeId={node.id}
                  activePreset={node.activePreset}
                  promptPresets={promptPresets}
                  presetDomainOverrides={promptPresetDomainOverrides}
                  presetCategoryOverrides={promptPresetCategoryOverrides}
                  onApplyPreset={handleApplyPreset}
                  onClearPreset={handleClearPreset}
                />
              )}
              {/* 预设按钮区域 - t2i节点 */}
              {node.type === 't2i' && (
                <T2iPresetCategorySelect
                  nodeId={node.id}
                  activePreset={node.activePreset}
                  promptPresets={promptPresets}
                  presetDomainOverrides={promptPresetDomainOverrides}
                  onApplyPreset={handleApplyPreset}
                  onClearPreset={handleClearPreset}
                />
              )}
              <div className="relative flex flex-col flex-1 min-h-0">
                {(node.type === 'i2i' || node.type === 'video') && (
                  <RefPickBar
                    slots={buildIncomingRefSlots(node.id, edges, nodes)}
                    disabled={node.isGenerating}
                    onInsert={(tok) =>
                      handleUpdateNode(node.id, { prompt: (node.prompt || '') + tok })
                    }
                  />
                )}
                <textarea
                  className="w-full h-full bg-[#222222] text-gray-200 p-3 rounded-lg border border-[#444] focus:outline-none focus:border-blue-500 transition-colors resize-none leading-relaxed" style={{ fontSize: '100px' }}
                  value={node.prompt}
                  onChange={(e) => handleUpdateNode(node.id, { prompt: e.target.value })}
                  placeholder=""
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ minHeight: node.type === 'i2i' ? '80px' : '120px' }}
                />
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
                          <span 
                            className="gen-text-glitch tabular-nums text-[11px] opacity-90" 
                            data-text={genTimeMmSs}
                          >
                            {genTimeMmSs}
                          </span>
                          <span className="text-[10px] opacity-75 text-cyan-300/70">({genElapsedSec}s)</span>
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
                <div className="flex gap-2 w-full shrink-0">
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
                          <span 
                            className="gen-text-glitch-amber tabular-nums text-[11px] opacity-90" 
                            data-text={genTimeMmSs}
                          >
                            {genTimeMmSs}
                          </span>
                          <span className="text-[10px] opacity-75 text-amber-300/70">({genElapsedSec}s)</span>
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
                  onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
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
                {node.images && node.images.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="text-[10px] text-gray-400">生成: {node.images.length}张</div>
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {node.images.map((img, idx) => (
                        <div key={idx} className="relative shrink-0 w-14 h-14 rounded overflow-hidden border border-[#444]">
                          <OptimizedImage
                            base64={img}
                            maxSide={160}
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
                      ))}
                    </div>
                  </div>
                )}
                {/* 当前激活的预设显示 */}
                {node.activePreset && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 rounded border border-indigo-600/50 mb-2">
                    <span className="text-[10px] text-indigo-400">预设:</span>
                    <span className="text-xs text-white font-bold">{node.activePreset}</span>
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
                  onPointerDown={(e) => { e.stopPropagation(); handleApplyPreset(node.id, '全景图生成'); }}
                  className={`w-full px-2 py-1 text-[10px] rounded transition-all mb-2 ${
                    node.activePreset === '全景图生成' 
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
                  onPointerDown={(e) => e.stopPropagation()}
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
                      <span className="tabular-nums text-[11px] opacity-90">{genTimeMmSs}</span>
                      <span className="text-[10px] opacity-75">({genElapsedSec}s)</span>
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

  // 首页 / 项目列表
  const [showHomePage, setShowHomePage] = useState(true);
  const [homeProjects, setHomeProjects] = useState<CanvasProjectSnapshot[]>([]);
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
  const [renameTarget, setRenameTarget] = useState<CanvasProjectSnapshot | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CanvasProjectSnapshot | null>(null);
  const homeChatSend = async () => {
    const q = homeChatInput.trim(); if (!q) return;
    setHomeChatInput(''); setHomeChatLoading(true);
    // 无论 API 是否成功，都创建项目跳转画布
    const newId = `project-${Date.now()}`;
    const chatNodeId = `chat-${Date.now()}`;
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user' as const, content: q };
    const chatNode: CanvasNode = {
      id: chatNodeId, type: 'chat', x: 200, y: 200, width: 1560, height: 2760,
      prompt: q, model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
      messages: [userMsg],
    };
    const newProject: CanvasProject = {
      id: newId, name: q.substring(0, 20) || 'AI 对话', updatedAt: Date.now(),
      nodes: [chatNode], edges: [], transform: { x: 0, y: 0, scale: 1 },
    };
    const lib = await loadProjectLibrary();
    const projects = [newProject, ...(lib?.projects || [])];
    setProjects(projects); projectsRef.current = projects;
    setActiveProjectId(newId);
    setNodes([chatNode]); setEdges([]); setTransform({ x: 0, y: 0, scale: 1 });
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
      transform: { x: 0, y: 0, scale: 1 },
    };
    const next = [newProject, ...projects];
    setProjects(next); projectsRef.current = next;
    setActiveProjectId(newProject.id);
    setNodes([]); setEdges([]); setTransform({ x: 0, y: 0, scale: 1 });
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
    setTransform(target.transform || { x: 0, y: 0, scale: 1 });
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

      {/* Selection Overlay - 捕获所有框选事件（放在最外层避免transform影响） */}
      {isSelecting && (
        <div
          className="fixed inset-0 z-[100]"
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        />
      )}

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
        className={`absolute inset-0 w-full h-full ${activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : activeTool === 'boxSelect' ? 'cursor-crosshair' : 'cursor-default'}`}
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ touchAction: 'none' }}
      >
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
            {(() => {
              const bridges: { x: number; y: number; id: string }[] = [];
              const lineSegs = edges.map((edge) => {
                const s = nodes.find((n) => n.id === edge.sourceId);
                const t = nodes.find((n) => n.id === edge.targetId);
                if (!s || !t) return null;
                return {
                  id: edge.id,
                  x1: s.x + s.width, y1: s.y + s.height / 2,
                  x2: t.x, y2: t.y + t.height / 2,
                };
              }).filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number }[];
              for (let i = 0; i < lineSegs.length; i++) {
                for (let j = i + 1; j < lineSegs.length; j++) {
                  const a = lineSegs[i], b = lineSegs[j];
                  const d = (b.y2 - b.y1) * (a.x2 - a.x1) - (b.x2 - b.x1) * (a.y2 - a.y1);
                  if (Math.abs(d) < 0.001) continue;
                  const t1 = ((b.x2 - b.x1) * (a.y1 - b.y1) - (b.y2 - b.y1) * (a.x1 - b.x1)) / d;
                  const t2 = ((a.x2 - a.x1) * (a.y1 - b.y1) - (a.y2 - a.y1) * (a.x1 - b.x1)) / d;
                  if (t1 > 0.05 && t1 < 0.95 && t2 > 0.05 && t2 < 0.95) {
                    bridges.push({
                      x: a.x1 + t1 * (a.x2 - a.x1),
                      y: a.y1 + t1 * (a.y2 - a.y1),
                      id: `bridge-${a.id}-${b.id}`,
                    });
                  }
                }
              }
              return bridges.map((b) => (
                <g key={b.id} pointerEvents="none">
                  <circle cx={b.x} cy={b.y} r={5} fill="#1e1e1e" stroke="#60a5fa" strokeWidth={1.5} />
                  <path
                    d={`M ${b.x - 4} ${b.y} Q ${b.x} ${b.y - 5} ${b.x + 4} ${b.y}`}
                    fill="none" stroke="#60a5fa" strokeWidth={1.5}
                  />
                </g>
              ));
            })()}

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
          {nodes.map(renderNode)}
        </div>

        {/* Selection Box - 直接使用屏幕坐标 */}
        {selectionBox && (
          <div
            className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none z-50"
            style={{
              left: selectionBox.x,
              top: selectionBox.y,
              width: selectionBox.width,
              height: selectionBox.height,
            }}
          />
        )}

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
      </div>

    {/* Context Menu */}
    {contextMenu && (
      <div
        className="absolute z-50 bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[160px] overflow-hidden canvas-chrome-150"
        style={{ left: contextMenu.x, top: contextMenu.y, transform: 'scale(0.75)', transformOrigin: 'top left' }}
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
      <div className="absolute top-6 left-6 z-40 flex flex-col gap-1.5">
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
      <div className="canvas-chrome-150 absolute top-6 left-28 z-40 flex flex-wrap items-center gap-2" style={{ transform: 'scale(0.67)', transformOrigin: 'top left' }}>
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

      {/* Center — current draft / project title（双击改项目名，与草稿展示同步并写回 IndexedDB） */}
      {activeProjectId ? (() => {
        const curProj = projects.find((p) => p.id === activeProjectId);
        if (!curProj) return null;
        const editing = centerTitleEditValue !== null;
        return (
          <div className="absolute top-[70px] left-1/2 z-[35] -translate-x-1/2 flex items-center gap-[50px]">
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
                                newApiApiKey: newApiKeyInput.trim(),
                                newApiBaseUrl: newApiBaseInput.trim(),
                                deepSeekApiKey: deepSeekKeyInput.trim(),
                                deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                              });
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
                                newApiApiKey: newApiKeyInput.trim(),
                                newApiBaseUrl: newApiBaseInput.trim(),
                                deepSeekApiKey: deepSeekKeyInput.trim(),
                                deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                              });
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

                  {/* ⑤ New API */}
                  <div className="mt-5 pt-4 border-t border-[#333]">
                    <h3 className="text-sm font-semibold text-gray-200 mb-2">New API</h3>
                    <span hidden><label className="text-xs text-gray-500 block mb-1">New API Base URL</label>
                    <input
                      type="text"
                      readOnly
                      value={newApiBaseInput}
                      placeholder={DEFAULT_NEWAPI_BASE_URL}
                      className="w-full mb-3 bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5 text-gray-400 text-sm cursor-not-allowed"
                    /></span>
                    <label className="text-xs text-gray-500 block mb-1">New API Key</label>
                    <input
                      type="password"
                      value={newApiKeyInput}
                      onChange={(e) => setNewApiKeyInput(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#222222] border border-[#444] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors text-sm"
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
                          newApiApiKey: newApiKeyInput.trim(),
                          newApiBaseUrl: newApiBaseInput.trim(),
                          deepSeekApiKey: deepSeekKeyInput.trim(),
                          deepSeekBaseUrl: deepSeekBaseInput.trim() || DEFAULT_DEEPSEEK_BASE_URL,
                        });
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
      {fullscreenImage && (
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
              src={`data:image/jpeg;base64,${fullscreenImage}`}
              className="max-w-[95vw] max-h-[90vh] object-contain shadow-2xl"
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
                  className="absolute right-6 top-1/2 -translate-y-1/2 p-4 bg-white/10 hover:bg-white/20 disabled:opacity-20 rounded-full text-white transition-colors"
                  title="下一张"
                ><ChevronRightIcon size={28} /></button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/50 rounded-full text-white text-sm backdrop-blur-sm">{fullscreenImageIdx + 1} / {total}</div>
              </>
            );
          })()}
          <button
            onPointerDown={(e) => { e.stopPropagation(); setFullscreenImage(null); setFullscreenNodeId(null); }}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            title="关闭"
          >
            <XIcon size={24} />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); downloadImage(fullscreenImage); }}
            className="absolute bottom-8 right-8 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold shadow-lg shadow-blue-900/50 flex items-center gap-2 transition-all"
            title="下载图片"
          >
            <DownloadIcon size={20} /> 下载图片
          </button>
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
        className="absolute left-6 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1 canvas-chrome-150"
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
        className="absolute bottom-6 left-6 z-30 flex items-center gap-1 bg-[#1e1e1e]/90 backdrop-blur-md rounded-xl border border-[#333] px-2 py-1.5 shadow-lg canvas-chrome-150"
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

    </div>
  );
}

// ==================== 360° 全景图节点组件 ====================
interface PanoramaNodeContentProps {
  node: PanoramaNode;
  nodes: CanvasNode[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  /** 吸管激活时点击无图预览区：将本节点作为连线起点连向吸管目标 */
  onEyedropperPickLink?: () => void;
  onUpdate: (updates: Partial<PanoramaNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
  onCopyToImage?: () => void;
}

// 小吸管图标组件
const EyedropperIcon = ({ size = 12 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2 22 1-1h3v-3H1l1-1V2h3v3h3L4.5 2 6 3.5 10.5 8l-1.5 1.5L15 5v3h3L17 9v3h3l1 1v9h-3v-3h-3v3l-4-4-5.5 5.5-1.5 1.5Z"/>
  </svg>
);

// 全屏图标
const FullscreenIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  </svg>
);

function PanoramaNodeContent({
  node,
  nodes,
  eyedropperTargetNodeId,
  onEyedropperSelect,
  onEyedropperPickLink,
  onUpdate,
  onCreateImageNode,
  onCopyToImage,
}: PanoramaNodeContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number>(0);
  const currentImageRef = useRef<string>(''); // 跟踪当前加载的图片
  const [forceUpdateKey, setForceUpdateKey] = useState(0); // 强制更新key

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [displayInfo, setDisplayInfo] = useState({ yaw: 0, pitch: 0, fov: 75 });
  const [fullscreenCapture, setFullscreenCapture] = useState<{type: 'single' | 'grid', base64: string} | null>(null);
  // 720全景图模式（上下360度，即垂直720度）
  const [is720Mode, setIs720Mode] = useState((node as any).is720Mode ?? false);
  const [forceTextureReload, setForceTextureReload] = useState(0);

  const panoramaImage = node.panoramaImage ?? '';

  // 同步720模式从节点属性
  useEffect(() => {
    const newMode = (node as any).is720Mode ?? false;
    if (newMode !== is720Mode) {
      setIs720Mode(newMode);
      setForceTextureReload(prev => prev + 1);
    }
  }, [(node as any).is720Mode]);

  // 处理全屏截图 - 传递给父组件创建节点
  useEffect(() => {
    if (fullscreenCapture && fullscreenCapture.base64) {
      onCreateImageNode([fullscreenCapture.base64], node.x + node.width + 50, node.y);
      setFullscreenCapture(null);
    }
  }, [fullscreenCapture, node.x, node.width, node.y, onCreateImageNode]);

  // 将图片转换为全景图
  const convertToPanorama = async () => {
    if (!panoramaImage) {
      alert('请先导入或吸取一张图片');
      return;
    }

    setIsConverting(true);

    try {
      // 固定提示词：将图片转换为360度全景图
      const prompt = 'Convert this image into a seamless 360-degree panoramic view. Extend the edges naturally to create a continuous horizontal panorama. Maintain the original lighting, colors, and style. The result should be a panoramic image suitable for a 360-degree VR environment.';

      // 使用 Gemini 图片编辑功能转换
      const convertAspect = node.aspectRatio === '9:16' ? '9:16' : '16:9';
      const modelForPanorama = (node.model || defaultCanvasImageModel()).trim();
      const results = await editExistingImage(
        [panoramaImage],
        prompt,
        1,
        modelForPanorama,
        convertAspect,
        '4k'
      );

      if (results && results.length > 0) {
        // 更新全景图
        onUpdate({ panoramaImage: results[0] });
        alert('全景图转换成功！');
      } else {
        alert('转换失败，请重试');
      }
    } catch (error) {
      console.error('转换全景图失败:', error);
      alert('转换失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsConverting(false);
    }
  };

  // 初始化 Three.js 场景 - 只在首次挂载时执行
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('360全景图: 容器不存在');
      return;
    }

    let isInitialized = false;
    let cleanupFn: (() => void) | null = null;
    let retryCount = 0;
    const maxRetries = 20;

    const initScene = () => {
      try {
        const rect = container.getBoundingClientRect();
        console.log('360全景图初始化尝试:', retryCount, '尺寸:', rect.width, 'x', rect.height);

        if (rect.width === 0 || rect.height === 0) {
          if (retryCount < maxRetries) {
            retryCount++;
            requestAnimationFrame(initScene);
          }
          return;
        }

        if (isInitialized) {
          console.log('360全景图: 已初始化，跳过');
          return;
        }
        isInitialized = true;

      const width = rect.width;
      const height = rect.height;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 0, 0.1);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x1a1a1a, 1);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      console.log('360全景图: canvas已添加', renderer.domElement.width, renderer.domElement.height);

      const sphereRadius = 500;
      const horizontalSegments = 60;
      const verticalSegments = 80; // 统一使用80分段以支持720模式
      const geometry = new THREE.SphereGeometry(sphereRadius, horizontalSegments, verticalSegments);
      geometry.scale(-1, 1, 1);

      const material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      materialRef.current = material;

      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
      sphereRef.current = sphere;

      let isDragging = false;
      let lastX = 0;
      let lastY = 0;
      let theta = 0;
      let phi = Math.PI / 2;

      const updateCamera = () => {
        const fov = node.fov ?? 75;
        camera.fov = fov;
        camera.updateProjectionMatrix();
        const x = 500 * Math.sin(phi) * Math.sin(theta);
        const y = 500 * Math.cos(phi);
        const z = 500 * Math.sin(phi) * Math.cos(theta);
        camera.lookAt(x, y, z);
      };

      const onMouseDown = (e: MouseEvent) => {
        e.stopPropagation();
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseMove = (e: MouseEvent) => {
        e.stopPropagation();
        if (!isDragging) return;
        theta -= (e.clientX - lastX) * 0.005;
        // 720模式下 phi 范围更广
        const phiMin = is720Mode ? 0.01 : 0.1;
        const phiMax = is720Mode ? Math.PI - 0.01 : Math.PI - 0.1;
        phi = Math.max(phiMin, Math.min(phiMax, phi + (e.clientY - lastY) * 0.005));
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
        setDisplayInfo({ yaw: ((theta * 180 / Math.PI) % 360 + 360) % 360, pitch: 90 - (phi * 180 / Math.PI), fov: node.fov ?? 75 });
      };

      const onMouseUp = () => { isDragging = false; };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        onUpdate({ fov: Math.max(30, Math.min(120, (node.fov ?? 75) + e.deltaY * 0.05)) });
      };

      container.addEventListener('mousedown', onMouseDown);
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('mouseup', onMouseUp);
      container.addEventListener('mouseleave', onMouseUp);
      container.addEventListener('wheel', onWheel, { passive: false });

      controlsRef.current = {
        dispose: () => {
          container.removeEventListener('mousedown', onMouseDown);
          container.removeEventListener('mousemove', onMouseMove);
          container.removeEventListener('mouseup', onMouseUp);
          container.removeEventListener('mouseleave', onMouseUp);
          container.removeEventListener('wheel', onWheel);
        },
        update: updateCamera,
        setTheta: (t: number) => { theta = t; },
        setPhi: (p: number) => { phi = p; }
      };

      let animLoopActive = false;
      const animate = () => {
        if (!animLoopActive) return;
        animationFrameRef.current = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      const startAnim = () => {
        if (animLoopActive) return;
        animLoopActive = true;
        animate();
      };
      const stopAnim = () => {
        animLoopActive = false;
        cancelAnimationFrame(animationFrameRef.current);
      };
      let inViewport = true;
      const syncAnimState = () => {
        if (document.hidden || !inViewport) stopAnim();
        else startAnim();
      };
      document.addEventListener('visibilitychange', syncAnimState);
      const io = new IntersectionObserver(
        (entries) => {
          inViewport = entries[0]?.isIntersecting ?? false;
          syncAnimState();
        },
        { root: null, rootMargin: '100px', threshold: 0 }
      );
      io.observe(container);
      syncAnimState();

      updateCamera();

      cleanupFn = () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', syncAnimState);
        stopAnim();
        controlsRef.current?.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
      } catch (error) {
        console.error('360全景图初始化失败:', error);
        isInitialized = false;
      }
    };

    initScene();

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []); // 只在首次挂载时初始化

  // 节点尺寸变化时同步更新渲染器尺寸，避免预览区域出现半黑屏
  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!container || !renderer || !camera) return;

    const resizeRenderer = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (sceneRef.current) renderer.render(sceneRef.current, camera);
    };

    resizeRenderer();
    const observer = new ResizeObserver(resizeRenderer);
    observer.observe(container);
    return () => observer.disconnect();
  }, [node.width, node.height]);

  // 720模式变化时强制重新加载纹理
  useEffect(() => {
    if (panoramaImage) {
      setForceTextureReload(prev => prev + 1);
    }
  }, [is720Mode]);

  // 720模式切换时动态调整视角
  useEffect(() => {
    const controls = controlsRef.current;
    if (controls && controls.setPhi) {
      // 720模式下向上偏移，360模式下居中
      const newPhi = is720Mode ? Math.PI / 2 + 0.5 : Math.PI / 2;
      controls.setPhi(newPhi);
      controls.update();
    }
  }, [is720Mode]);

  // 加载全景图片
  useEffect(() => {
    const loadTexture = () => {
      console.log('=== 纹理加载检查 ===');
      console.log('panoramaImage 存在:', !!panoramaImage, '长度:', panoramaImage?.length);

      if (!panoramaImage) {
        console.log('没有图片数据，跳过');
        return;
      }

      const material = materialRef.current;
      console.log('material 存在:', !!material);

      if (!material) {
        console.log('等待 material 准备好...');
        setTimeout(loadTexture, 100);
        return;
      }

      // 720模式切换时强制重新加载纹理（通过forceTextureReload变化触发）
      currentImageRef.current = '';
      console.log('开始加载纹理');

      const img = new Image();
      img.onload = () => {
        console.log('Image onload 触发, 尺寸:', img.width, img.height);

        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        if (textureRef.current) {
          textureRef.current.dispose();
        }
        textureRef.current = texture;

        material.map = texture;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
        currentImageRef.current = panoramaImage;

        // 强制触发重新渲染
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
        console.log('材质已更新，纹理设置完成');
      };

      img.onerror = () => {
        console.error('JPEG 加载失败，尝试 PNG 格式');
        const imgPng = new Image();
        imgPng.onload = () => {
          console.log('PNG 格式加载成功, 尺寸:', imgPng.width, imgPng.height);
          const texture = new THREE.Texture(imgPng);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;

          if (textureRef.current) {
            textureRef.current.dispose();
          }
          textureRef.current = texture;

          material.map = texture;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;

          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        };
        imgPng.onerror = (err) => console.error('PNG 格式也加载失败', err);
        imgPng.src = `data:image/png;base64,${panoramaImage}`;
      };

      console.log('开始设置 img.src');
      img.src = `data:image/jpeg;base64,${panoramaImage}`;
      console.log('img.src 已设置');
    };

    loadTexture();
  }, [panoramaImage, is720Mode, forceTextureReload]);

  // 监听 WebGL 上下文丢失/恢复
  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL 上下文丢失');
    };

    const handleContextRestored = () => {
      console.log('WebGL 上下文恢复');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  // 强制刷新渲染
  const forceRefresh = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
      console.log('手动刷新渲染');
    }
    // 强制重新加载纹理
    currentImageRef.current = '';
    setForceUpdateKey(k => k + 1);
  };

  // 重置相机
  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.setTheta(0);
      controlsRef.current.setPhi(Math.PI / 2);
      controlsRef.current.update();
    }
    onUpdate({ yaw: 0, pitch: 0, fov: 75 });
    setDisplayInfo({ yaw: 0, pitch: 0, fov: 75 });
    // 强制重新加载纹理
    currentImageRef.current = '';
    setForceUpdateKey(k => k + 1);
  };

  // 截图功能
  const captureCurrentView = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !panoramaImage) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!container) return;

    // 立即截图当前视图
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.95);
    const base64 = dataURL.split(',')[1];
    setFullscreenCapture({ type: 'single', base64 });
  };

  // 四宫格截图
  const captureGrid = (cols: number, rows: number) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !panoramaImage) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    // 创建离屏 Canvas
    const canvasObj = document.createElement('canvas');
    const cellWidth = 960;
    const cellHeight = 540;
    canvasObj.width = cellWidth * cols;
    canvasObj.height = cellHeight * rows;
    const ctx = canvasObj.getContext('2d');
    if (!ctx) return;

    // 设置渲染器为单格尺寸
    renderer.setSize(cellWidth, cellHeight);
    camera.aspect = cellWidth / cellHeight;
    camera.updateProjectionMatrix();

    let captured = 0;
    const total = cols * rows;

    // 生成方向列表 - 始终在地平线上截图
    // 720模式切换只影响界面上的视角范围，不影响截图
    const directions: { theta: number; phi: number }[] = [];
    const fixedPhi = Math.PI / 2;  // 固定在地平线
    const angleStep = (2 * Math.PI) / total;

    for (let i = 0; i < total; i++) {
      const theta = -Math.PI + i * angleStep;
      directions.push({ theta, phi: fixedPhi });
    }

    const captureNext = () => {
      if (captured >= total) {
        // 绘制白色分割线
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        for (let i = 1; i < cols; i++) {
          ctx.beginPath();
          ctx.moveTo(i * cellWidth, 0);
          ctx.lineTo(i * cellWidth, canvasObj.height);
          ctx.stroke();
        }
        for (let i = 1; i < rows; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * cellHeight);
          ctx.lineTo(canvasObj.width, i * cellHeight);
          ctx.stroke();
        }

        // 恢复原始尺寸
        const container = containerRef.current;
        if (container) {
          renderer.setSize(container.clientWidth, container.clientHeight);
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
        }
        renderer.render(scene, camera);

        const base64 = canvasObj.toDataURL('image/jpeg', 0.95).split(',')[1];
        onCreateImageNode([base64], node.x + node.width + 50, node.y);
        return;
      }

      const col = captured % cols;
      const row = Math.floor(captured / cols);
      const dir = directions[captured];

      if (controlsRef.current) {
        controlsRef.current.setTheta(dir.theta);
        controlsRef.current.setPhi(dir.phi);
        controlsRef.current.update();
      }

      renderer.render(scene, camera);

      // 使用 requestAnimationFrame 确保渲染完成后再截图
      requestAnimationFrame(() => {
        const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.95);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
          captured++;
          captureNext();
        };
        img.onerror = () => {
          // 如果加载失败，填充黑色
          ctx.fillStyle = '#000';
          ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
          captured++;
          captureNext();
        };
        img.src = dataURL;
      });
    };

    captureNext();
  };

  // 全屏查看
  const openFullscreen = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !panoramaImage) return;
    // 保存当前视角参数
    setFsFullscreenParams({ yaw: displayInfo.yaw, pitch: displayInfo.pitch, fov: displayInfo.fov });
    setIsFullscreen(true);
  };

  // 全屏模式下的渲染参数
  const [fsFullscreenParams, setFsFullscreenParams] = useState({ yaw: 0, pitch: 0, fov: 75 });

  // 全屏模式下的渲染
  useEffect(() => {
    if (!isFullscreen) return;

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#000;cursor:grab;';
    document.body.appendChild(container);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let theta = fsFullscreenParams.yaw * Math.PI / 180;
    let phi = (90 - fsFullscreenParams.pitch) * Math.PI / 180;
    let fov = fsFullscreenParams.fov;
    let textureLoaded = false;

    const updateCamera = () => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
      const x = 500 * Math.sin(phi) * Math.sin(theta);
      const y = 500 * Math.cos(phi);
      const z = 500 * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(x, y, z);
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      container.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      theta -= dx * 0.005;
      phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + dy * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    };

    const onMouseUp = () => {
      isDragging = false;
      container.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      fov = Math.max(30, Math.min(120, fov + e.deltaY * 0.05));
      updateCamera();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };

    const animate = () => {
      if (!isFullscreen) return;
      animFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    let animFrameId: number;

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    updateCamera();

    // 加载纹理并等待完成后开始渲染
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      `data:image/jpeg;base64,${panoramaImage}`,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);
        
        // 纹理加载完成后开始渲染
        textureLoaded = true;
        animate();
      },
      undefined,
      (err) => {
        console.error('全景图加载失败:', err);
        // 即使加载失败也尝试渲染（显示黑色背景）
        animate();
      }
    );

    // 如果纹理加载超时（5秒），也开始渲染
    setTimeout(() => {
      if (!textureLoaded) {
        animate();
      }
    }, 5000);

    // 截图功能 - 创建图片节点
    const captureScreenshot = () => {
      // 检查场景中是否有球体（纹理是否已加载）
      let meshInScene = false;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshInScene = true;
      });

      if (!meshInScene) {
        alert('请等待全景图加载完成后再截图');
        return;
      }

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      // 创建图片节点
      setFullscreenCapture({ type: 'single', base64 });
    };

    // 宫格截图功能 - 创建图片节点
    const captureGrid = (cols: number, rows: number) => {
      // 检查场景中是否有球体（纹理是否已加载）
      let meshInScene = false;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshInScene = true;
      });

      if (!meshInScene) {
        alert('请等待全景图加载完成后再截图');
        return;
      }

      const cellWidth = Math.floor(window.innerWidth / cols);
      const cellHeight = Math.floor(window.innerHeight / rows);
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth * cols;
      canvas.height = cellHeight * rows;
      const ctx = canvas.getContext('2d')!;

      // 临时停止动画循环
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = 0;
      }

      // 覆盖整个球面的视角网格
      // 水平方向：从 -180° 到 180°，垂直方向：从 -90° 到 90°
      const hFovRad = fov * Math.PI / 180;
      const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / (window.innerWidth / window.innerHeight));

      let captured = 0;
      const total = cols * rows;

      // 预计算所有格子的中心视角（每个角度间隔 360/总数 度）
      const directions: { theta: number; phi: number }[] = [];
      const fixedPhi = Math.PI / 2;  // 固定在地平线
      const angleStep = (2 * Math.PI) / total;

      for (let i = 0; i < total; i++) {
        const col = i % cols;
        const theta = -Math.PI + col * angleStep;
        directions.push({ theta, phi: fixedPhi });
      }

      const captureNext = () => {
        if (captured >= total) {
          // 创建图片节点
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          setFullscreenCapture({ type: 'grid', base64 });

          // 恢复原始相机角度
          theta = fsFullscreenParams.yaw * Math.PI / 180;
          phi = (90 - fsFullscreenParams.pitch) * Math.PI / 180;
          fov = fsFullscreenParams.fov;
          updateCamera();
          // 立即渲染恢复后的画面
          renderer.render(scene, camera);

          // 重新开始动画循环
          animate();
          return;
        }

        const col = captured % cols;
        const row = Math.floor(captured / cols);
        const dir = directions[captured];

        // 设置相机朝向
        theta = dir.theta;
        phi = dir.phi;
        updateCamera();

        // 等待渲染完成后再截图
        setTimeout(() => {
          renderer.render(scene, camera);
          // 使用 toDataURL 确保持久化渲染内容
          const dataUrl = renderer.domElement.toDataURL('image/png');
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
            captured++;
            captureNext();
          };
          img.onerror = () => {
            // 如果加载失败，尝试直接绘制 canvas
            ctx.fillStyle = '#000';
            ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
            captured++;
            captureNext();
          };
          img.src = dataUrl;
        }, 100);
      };

      captureNext();
    };

    const cleanup = () => {
      setIsFullscreen(false);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('mouseleave', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      renderer.dispose();
      geometry.dispose();
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    };

    // ESC 按钮
    const escBtn = document.createElement('button');
    escBtn.textContent = '× 退出';
    escBtn.style.cssText = 'position:fixed;top:20px;right:20px;width:40px;height:40px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:white;font-size:20px;cursor:pointer;z-index:1001;backdrop-filter:blur(10px);transition:all 0.2s;display:flex;align-items:center;justify-content:center;';
    escBtn.onclick = cleanup;
    document.body.appendChild(escBtn);

    // 截图和宫格按钮
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'position:fixed;top:20px;left:20px;display:flex;gap:8px;z-index:1001;';
    
    const captureBtn = document.createElement('button');
    captureBtn.textContent = '📷 截图';
    captureBtn.style.cssText = 'padding:10px 16px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:white;font-size:13px;cursor:pointer;backdrop-filter:blur(10px);transition:all 0.2s;';
    captureBtn.onclick = captureScreenshot;
    btnContainer.appendChild(captureBtn);
    
    [2, 4, 6, 9].forEach(n => {
      const cols = n === 6 ? 3 : n === 9 ? 3 : n === 4 ? 2 : 1;
      const rows = n === 6 ? 2 : n === 9 ? 3 : n === 4 ? 2 : n;
      const gridBtn = document.createElement('button');
      gridBtn.textContent = `${rows}×${cols}`;
      gridBtn.style.cssText = 'padding:10px 14px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:white;font-size:13px;cursor:pointer;backdrop-filter:blur(10px);transition:all 0.2s;';
      gridBtn.onclick = () => captureGrid(cols, rows);
      btnContainer.appendChild(gridBtn);
    });
    
    document.body.appendChild(btnContainer);

    // 视角信息提示
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 20px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:13px;z-index:1001;backdrop-filter:blur(10px);font-family:monospace;white-space:nowrap;';
    const updateInfo = () => {
      const yawDeg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
      const pitchDeg = 90 - (phi * 180 / Math.PI);
      infoDiv.textContent = `YAW: ${yawDeg.toFixed(0)}°  PITCH: ${pitchDeg.toFixed(0)}°  FOV: ${fov.toFixed(0)}°  |  拖动旋转 | 滚轮缩放 | ESC退出`;
    };
    updateInfo();
    document.body.appendChild(infoDiv);

    // 添加鼠标移动更新信息
    const onMouseMoveUpdateInfo = () => { updateInfo(); };
    container.addEventListener('mousemove', onMouseMoveUpdateInfo);

    return () => {
      cleanup();
      if (document.body.contains(escBtn)) document.body.removeChild(escBtn);
      if (document.body.contains(infoDiv)) document.body.removeChild(infoDiv);
      if (document.body.contains(btnContainer)) document.body.removeChild(btnContainer);
      container.removeEventListener('mousemove', onMouseMoveUpdateInfo);
    };
  }, [isFullscreen, panoramaImage, is720Mode, fsFullscreenParams]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-1 p-2 overflow-y-auto">
      {/* 预览区域 */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[200px] rounded-lg border border-[#333] overflow-hidden bg-[#2a2a2a]"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {!panoramaImage && (
          <>
            {onEyedropperPickLink ? (
              <button
                type="button"
                className="absolute inset-0 z-[15] cursor-crosshair bg-transparent border-0 p-0"
                title="点击连接上游节点"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onEyedropperPickLink();
                }}
              />
            ) : null}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 pointer-events-none">
              <PanoramaIcon size={36} />
              <span className="text-gray-300 text-xs text-center px-4">
                点击下方&quot;导入&quot;加载图片<br />或从其他节点连线获取图片
              </span>
            </div>
          </>
        )}

        {/* 视角指示器 */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white backdrop-blur-sm z-20">
          Y: {displayInfo.yaw.toFixed(0)}° P: {displayInfo.pitch.toFixed(0)}° FOV: {displayInfo.fov.toFixed(0)}°
        </div>

        {/* 全屏按钮 */}
        {panoramaImage && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={openFullscreen}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm z-20"
            title="全屏查看"
          >
            <FullscreenIcon size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 shrink-0">
        {/* 图片导入按钮和吸管 */}
        <div className="flex gap-1">
          <button
            onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
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
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const base64 = (ev.target?.result as string).split(',')[1];
                    onUpdate({ panoramaImage: base64 });
                  };
                  reader.readAsDataURL(file);
                }
              };
              input.click();
            }}
            className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 flex items-center justify-center gap-1"
          >
            <ImageIcon size={10} /> 导入
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={resetCamera}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
            title="重置视角"
          >
            重置
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={forceRefresh}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
            title="刷新渲染"
          >
            刷新
          </button>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void convertToPanorama()}
          disabled={!panoramaImage || isConverting}
          className="w-full py-1.5 px-2 rounded text-[10px] bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConverting ? '全景转换中…' : 'AI 转为全景（沿用上方所选模型）'}
        </button>

        {/* 截图功能 */}
        <div className="flex flex-wrap gap-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={captureCurrentView}
            disabled={!panoramaImage}
            className="flex-1 py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            截图
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (panoramaImage) {
                onCreateImageNode([panoramaImage], node.x + node.width + 50, node.y);
              }
            }}
            disabled={!panoramaImage}
            className="py-1 px-2 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="复制当前图片"
          >
            <CopyIcon size={12} />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => captureGrid(2, 2)}
            disabled={!panoramaImage}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="4宫格截图"
          >
            4宫格
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => captureGrid(3, 2)}
            disabled={!panoramaImage}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="6宫格截图"
          >
            6宫格
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => captureGrid(3, 3)}
            disabled={!panoramaImage}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="9宫格截图"
          >
            9宫格
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onUpdate({ is720Mode: !is720Mode } as any); }}
            className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${is720Mode ? 'bg-orange-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'}`}
            title={is720Mode ? "当前: 720°全景图模式" : "切换到720°全景图模式"}
          >
            {is720Mode ? '720°' : '360°'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 3D导演台节点组件 ====================
interface Director3DNodeContentProps {
  node: Director3DNode;
  nodes: CanvasNode[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<Director3DNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
}

// 删除图标
const DeleteIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// 人物图标
const PersonIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

// 视角图标
const ViewIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

function Director3DNodeContent({ node, nodes, eyedropperTargetNodeId, onEyedropperSelect, onUpdate, onCreateImageNode }: Director3DNodeContentProps) {
  const figurePalette = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
  const buildFigureColor = (index: number) => figurePalette[index % figurePalette.length];
  const buildFigureLabelSprite = (labelText: string, color: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(6, 10, canvas.width - 12, canvas.height - 20);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 10, canvas.width - 12, canvas.height - 20);
    ctx.fillStyle = color;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(12, 3, 1);
    sprite.position.set(0, 9.5, 0);
    sprite.userData = { isFigureLabel: true };
    return sprite;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const groundMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const groundTextureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number>(0);
  const currentImageRef = useRef<string>('');
  const figuresRef = useRef<Map<string, THREE.Group>>(new Map());
  const nodeRef = useRef(node);
  nodeRef.current = node; // 保持 ref 同步
  const [forceUpdateKey, setForceUpdateKey] = useState(0);
  const [displayInfo, setDisplayInfo] = useState({ yaw: 0, pitch: 0, fov: 75 });
  const [fullscreenCapture, setFullscreenCapture] = useState<{ type: 'single' | 'grid', base64: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const isDraggingFigureRef = useRef(false);
  const draggingFigureIdRef = useRef<string | null>(null);

  // 全屏参数
  const [fsFullscreenParams, setFsFullscreenParams] = useState({ yaw: 0, pitch: 0, fov: 75 });

  const backgroundImage = node.backgroundImage ?? '';
  const figures = node.figures ?? [];

  // 处理全屏截图
  useEffect(() => {
    if (fullscreenCapture && fullscreenCapture.base64) {
      onCreateImageNode([fullscreenCapture.base64], node.x + node.width + 50, node.y);
      setFullscreenCapture(null);
    }
  }, [fullscreenCapture, node.x, node.width, node.y, onCreateImageNode]);

  // 初始化 Three.js 场景
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('3D导演台: 容器不存在');
      return;
    }

    let isInitialized = false;
    let cleanupFn: (() => void) | null = null;
    let retryCount = 0;
    const maxRetries = 20;

    const initScene = () => {
      const rect = container.getBoundingClientRect();
      console.log('3D导演台初始化尝试:', retryCount, '尺寸:', rect.width, 'x', rect.height);

      if (rect.width === 0 || rect.height === 0) {
        if (retryCount < maxRetries) {
          retryCount++;
          requestAnimationFrame(initScene);
        }
        return;
      }

      if (isInitialized) {
        console.log('3D导演台: 已初始化，跳过');
        return;
      }
      isInitialized = true;

      const width = rect.width;
      const height = rect.height;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x333333);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
      camera.position.set(0, 25, 50);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x333333, 1);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // 设置 canvas 可以接收键盘事件
      renderer.domElement.tabIndex = 0;
      renderer.domElement.style.outline = 'none';

      console.log('3D导演台: canvas已添加', renderer.domElement.width, renderer.domElement.height);

      const gridHelper = new THREE.GridHelper(500, 50, 0x666666, 0x444444);
      gridHelper.position.y = 0;
      (gridHelper.material as THREE.Material).opacity = 0.6;
      (gridHelper.material as THREE.Material).transparent = true;
      scene.add(gridHelper);
      gridRef.current = gridHelper;

      const axesHelper = new THREE.AxesHelper(50);
      scene.add(axesHelper);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(50, 100, 50);
      scene.add(directionalLight);

      // 720全景图背景（天空穹顶）
      const skyGeometry = new THREE.SphereGeometry(900, 64, 40);
      skyGeometry.scale(-1, 1, 1);
      const skyMaterial = new THREE.MeshBasicMaterial({
        color: 0x2f2f2f,
        side: THREE.BackSide,
      });
      const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
      scene.add(skyMesh);
      sphereRef.current = skyMesh;
      materialRef.current = skyMaterial;

      // 720全景图地面（使用全景图下半部分纹理）
      const groundGeometry = new THREE.CircleGeometry(500, 72);
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b2b2b,
        roughness: 0.95,
        metalness: 0.02,
      });
      const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = -0.05;
      scene.add(groundMesh);
      groundRef.current = groundMesh;
      groundMaterialRef.current = groundMaterial;

      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setSize(1.6); // 操纵轴放大一倍
      transformControlsRef.current = transformControls;
      console.log('TransformControls已创建:', transformControls);

      // 获取并添加 helper 到场景中
      const helper = transformControls.getHelper();
      if (helper) {
        scene.add(helper);
        console.log('TransformControls helper 已添加');
      }

      // 使用一个标志来避免循环更新
      let isTransforming = false;

      transformControls.addEventListener('change', () => {
        console.log('TransformControls change 事件触发');
        if (isTransforming) return;
        if (transformControls.object) {
          const figureId = (transformControls.object as THREE.Group).userData.figureId;
          if (figureId) {
            isTransforming = true;

            // 直接更新 Three.js 中的角色位置
            const worldX = transformControls.object.position.x;
            const worldZ = transformControls.object.position.z;
            const rotation = transformControls.object.rotation.y * 180 / Math.PI;
            const scale = transformControls.object.scale.x;

            // 使用 nodeRef.current 获取最新的 figures 数据
            const newFigures = (nodeRef.current.figures || []).map((f: Figure3D) => f.id === figureId
              ? { ...f, x: Math.max(0, Math.min(100, ((worldX + 500) / 1000) * 100)), y: Math.max(0, Math.min(100, ((worldZ + 500) / 1000) * 100)), rotation, scale }
              : f);

            console.log('TransformControls change, figures数量从', (nodeRef.current.figures || []).length, '变为', newFigures.length);

            onUpdate({ figures: newFigures });

            setTimeout(() => { isTransforming = false; }, 100);
          }
        }
        renderer.render(scene, camera);
      });

      transformControls.addEventListener('mouseDown', () => {
        isDragging = false;
        isPanning = false;
      });

      let isDragging = false;
      let isPanning = false;
      let lastX = 0;
      let lastY = 0;
      let theta = 0.3;
      let phi = 0.8;
      let cameraDistance = 60;
      let cameraTarget = new THREE.Vector3(0, 0, 0);

      const updateCamera = () => {
        const fov = nodeRef.current.fov ?? 60;
        camera.fov = fov;
        camera.updateProjectionMatrix();

        const x = cameraDistance * Math.sin(phi) * Math.sin(theta);
        const y = cameraDistance * Math.cos(phi);
        const z = cameraDistance * Math.sin(phi) * Math.cos(theta);

        camera.position.set(cameraTarget.x + x, cameraTarget.y + y, cameraTarget.z + z);
        camera.lookAt(cameraTarget);
      };

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const getMousePosition = (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const onMouseDown = (e: MouseEvent) => {
        console.log('onMouseDown 触发, button:', e.button, 'transformControls.dragging:', transformControls.dragging);

        if (transformControls.dragging) return;

        getMousePosition(e);
        raycaster.setFromCamera(mouse, camera);

        const allObjects: THREE.Object3D[] = [];
        scene.traverse((obj) => {
          if (obj.userData && (obj.userData.isFigure || obj.userData.isFigurePart)) {
            allObjects.push(obj);
          }
        });

        console.log('点击检测:', allObjects.length, '个对象');

        const intersects = raycaster.intersectObjects(allObjects, true);
        console.log('射线检测结果:', intersects.length);

        if (intersects.length > 0) {
          let target = intersects[0].object;
          console.log('点击对象:', target.type, target.userData);
          while (target.parent && !target.userData.figureId) {
            target = target.parent;
          }
          console.log('找到角色ID:', target.userData.figureId);
          if (target.userData.figureId) {
            const figureId = target.userData.figureId;
            const figureGroup = figuresRef.current.get(figureId);
            console.log('角色Group:', figureGroup ? '存在' : '不存在');
            if (figureGroup) {
              // 在 attach 之前设置标志，防止 attach 触发的 change 事件
              isTransforming = true;
              setSelectedFigureId(figureId);
              transformControls.attach(figureGroup);
              // 选中后让 canvas 获取焦点，以便接收键盘事件
              renderer.domElement.focus();
              // attach 完成后，重置标志
              setTimeout(() => { isTransforming = false; }, 100);
              return;
            }
          }
        }

        setSelectedFigureId(null);
        transformControls.detach();

        if (e.button === 2 || e.button === 1) {
          isPanning = true;
        } else {
          isDragging = true;
        }
        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;

        if (transformControls.dragging) return;

        if (isPanning) {
          const panSpeed = 0.1;
          cameraTarget.x -= dx * panSpeed * (cameraDistance / 100);
          cameraTarget.z -= dy * panSpeed * (cameraDistance / 100);
          updateCamera();
        } else if (isDragging) {
          theta -= dx * 0.01;
          phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, phi + dy * 0.01));
          updateCamera();

          const yawDeg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
          const pitchDeg = 90 - (phi * 180 / Math.PI);
          setDisplayInfo({ yaw: yawDeg, pitch: pitchDeg, fov: nodeRef.current.fov ?? 60 });
        }

        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseUp = () => {
        isDragging = false;
        isPanning = false;
        isDraggingFigureRef.current = false;
        draggingFigureIdRef.current = null;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        cameraDistance = Math.max(10, Math.min(200, cameraDistance + e.deltaY * 0.05));
        updateCamera();
      };

      const onContextMenu = (e: Event) => {
        e.preventDefault();
      };

      // 键盘事件 - 快捷键切换变换模式
      const onKeyDown = (e: KeyboardEvent) => {
        if (!transformControls.object) return; // 只有选中物体时才响应
        if (e.target instanceof HTMLInputElement) return; // 输入框中不响应

        switch (e.key.toLowerCase()) {
          case 'g':
            transformControls.setMode('translate');
            setTransformMode('translate');
            break;
          case 'r':
            transformControls.setMode('rotate');
            setTransformMode('rotate');
            break;
          case 's':
            transformControls.setMode('scale');
            setTransformMode('scale');
            break;
        }
      };

      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('mouseleave', onMouseUp);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      renderer.domElement.addEventListener('contextmenu', onContextMenu);
      renderer.domElement.addEventListener('keydown', onKeyDown);

      controlsRef.current = {
        dispose: () => {
          renderer.domElement.removeEventListener('mousedown', onMouseDown);
          renderer.domElement.removeEventListener('mousemove', onMouseMove);
          renderer.domElement.removeEventListener('mouseup', onMouseUp);
          renderer.domElement.removeEventListener('mouseleave', onMouseUp);
          renderer.domElement.removeEventListener('wheel', onWheel);
          renderer.domElement.removeEventListener('contextmenu', onContextMenu);
          renderer.domElement.removeEventListener('keydown', onKeyDown);
          transformControls.dispose();
        },
        update: updateCamera,
        setTheta: (t: number) => { theta = t; },
        setPhi: (p: number) => { phi = p; }
      };

      let animLoopActive = false;
      const animate = () => {
        if (!animLoopActive) return;
        animationFrameRef.current = requestAnimationFrame(animate);
        if (transformControls.object) {
          transformControls.update();
        }
        renderer.render(scene, camera);
      };
      const startAnim = () => {
        if (animLoopActive) return;
        animLoopActive = true;
        animate();
      };
      const stopAnim = () => {
        animLoopActive = false;
        cancelAnimationFrame(animationFrameRef.current);
      };
      let inViewport = true;
      const syncAnimState = () => {
        if (document.hidden || !inViewport) stopAnim();
        else startAnim();
      };
      document.addEventListener('visibilitychange', syncAnimState);
      const io = new IntersectionObserver(
        (entries) => {
          inViewport = entries[0]?.isIntersecting ?? false;
          syncAnimState();
        },
        { root: null, rootMargin: '100px', threshold: 0 }
      );
      io.observe(container);
      syncAnimState();

      updateCamera();

      cleanupFn = () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', syncAnimState);
        stopAnim();
        controlsRef.current?.dispose();
        if (textureRef.current) {
          textureRef.current.dispose();
          textureRef.current = null;
        }
        if (groundTextureRef.current) {
          groundTextureRef.current.dispose();
          groundTextureRef.current = null;
        }
        if (materialRef.current) {
          materialRef.current.dispose();
          materialRef.current = null;
        }
        if (groundMaterialRef.current) {
          groundMaterialRef.current.dispose();
          groundMaterialRef.current = null;
        }
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    };

    initScene();

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []);

  // 载入720全景图作为背景+地面纹理
  useEffect(() => {
    const scene = sceneRef.current;
    const skyMaterial = materialRef.current;
    const groundMaterial = groundMaterialRef.current;
    if (!scene || !skyMaterial || !groundMaterial) return;

    if (!backgroundImage) {
      skyMaterial.map = null;
      skyMaterial.color.setHex(0x2f2f2f);
      skyMaterial.needsUpdate = true;
      groundMaterial.map = null;
      groundMaterial.color.setHex(0x2b2b2b);
      groundMaterial.needsUpdate = true;
      scene.background = new THREE.Color(0x333333);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (textureRef.current) {
        textureRef.current.dispose();
      }
      if (groundTextureRef.current) {
        groundTextureRef.current.dispose();
      }

      const skyTexture = new THREE.Texture(img);
      skyTexture.colorSpace = THREE.SRGBColorSpace;
      skyTexture.minFilter = THREE.LinearFilter;
      skyTexture.magFilter = THREE.LinearFilter;
      skyTexture.generateMipmaps = false;
      skyTexture.needsUpdate = true;
      textureRef.current = skyTexture;

      skyMaterial.map = skyTexture;
      skyMaterial.color.setHex(0xffffff);
      skyMaterial.needsUpdate = true;
      scene.background = skyTexture;

      // 地面纹理：取全景图下半部分映射到圆盘
      const groundCanvas = document.createElement('canvas');
      const groundSize = 1024;
      groundCanvas.width = groundSize;
      groundCanvas.height = groundSize;
      const gctx = groundCanvas.getContext('2d');
      if (gctx) {
        gctx.drawImage(
          img,
          0, Math.floor(img.height / 2),
          img.width, Math.ceil(img.height / 2),
          0, 0,
          groundSize, groundSize
        );
        const groundTexture = new THREE.CanvasTexture(groundCanvas);
        groundTexture.colorSpace = THREE.SRGBColorSpace;
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(2, 2);
        groundTexture.minFilter = THREE.LinearFilter;
        groundTexture.magFilter = THREE.LinearFilter;
        groundTexture.needsUpdate = true;
        groundTextureRef.current = groundTexture;
        groundMaterial.map = groundTexture;
        groundMaterial.color.setHex(0xffffff);
        groundMaterial.needsUpdate = true;
      }
    };
    img.onerror = () => {
      skyMaterial.map = null;
      skyMaterial.color.setHex(0x2f2f2f);
      skyMaterial.needsUpdate = true;
      groundMaterial.map = null;
      groundMaterial.color.setHex(0x2b2b2b);
      groundMaterial.needsUpdate = true;
      scene.background = new THREE.Color(0x333333);
    };
    img.src = `data:image/jpeg;base64,${backgroundImage}`;
  }, [backgroundImage]);

  // 节点尺寸变化时同步更新3D渲染尺寸，避免右侧/底部被裁切
  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!container || !renderer || !camera) return;

    const resizeRenderer = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (sceneRef.current) renderer.render(sceneRef.current, camera);
    };

    resizeRenderer();
    const observer = new ResizeObserver(resizeRenderer);
    observer.observe(container);
    return () => observer.disconnect();
  }, [node.width, node.height]);

  // 同步TransformControls模式
  useEffect(() => {
    if (transformControlsRef.current) {
      switch (transformMode) {
        case 'translate':
          transformControlsRef.current.setMode('translate');
          break;
        case 'rotate':
          transformControlsRef.current.setMode('rotate');
          break;
        case 'scale':
          transformControlsRef.current.setMode('scale');
          break;
      }
    }
  }, [transformMode]);

  // 管理3D角色 - 在网格地面上
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentFigures = figures || [];
    console.log('角色管理Effect运行, node.id:', node.id, 'figures数量:', currentFigures.length);

    // 如果有角色被TransformControls控制但不在当前列表中，先分离
    const tc = transformControlsRef.current;
    if (tc?.object) {
      const controlledId = (tc.object as THREE.Group).userData?.figureId;
      if (controlledId && !currentFigures.find(f => f.id === controlledId)) {
        console.log('分离被删除的角色:', controlledId);
        tc.detach();
      }
    }

    const currentFigureIds = new Set(currentFigures.map(f => f.id));
    console.log('当前figures列表:', Array.from(currentFigureIds));

    // 删除不存在的角色
    figuresRef.current.forEach((group, id) => {
      if (!currentFigureIds.has(id)) {
        console.log('删除角色:', id, '原因: 不在currentFigures中');
        scene.remove(group);
        figuresRef.current.delete(id);
      }
    });

    // 添加或更新角色
    currentFigures.forEach((figure, index) => {
      const figureColor = new THREE.Color(buildFigureColor(index));
      const labelText = figure.name || `角色${index + 1}`;
      if (figuresRef.current.has(figure.id)) {
        // 检查是否正被TransformControls控制，如果是则跳过位置更新
        const tc = transformControlsRef.current;
        const controlledGroup = tc?.object as THREE.Group | undefined;
        const isControlled = controlledGroup?.userData?.figureId === figure.id;

        // 更新现有角色（但不在TransformControls控制时更新位置）
        const group = figuresRef.current.get(figure.id)!;
        if (!isControlled) {
          group.rotation.y = (figure.rotation || 0) * Math.PI / 180;
          group.scale.setScalar(figure.scale || 1);

          // 将网格坐标转换为世界坐标
          const worldX = (figure.x / 100) * 1000 - 500;
          const worldZ = (figure.y / 100) * 1000 - 500;
          group.position.set(worldX, 0, worldZ);
        }

        // 更新角色颜色、编号标签和选中状态
        group.traverse((child) => {
          if (child.userData?.isFigureLabel && child instanceof THREE.Sprite) {
            const mat = child.material as THREE.SpriteMaterial;
            mat.map?.dispose();
            mat.dispose();
            group.remove(child);
            return;
          }
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            (child.material as THREE.MeshStandardMaterial).color.copy(figureColor);
            if (selectedFigureId === figure.id) {
              (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x444444);
            } else {
              (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            }
          }
        });
        const labelSprite = buildFigureLabelSprite(labelText, `#${figureColor.getHexString()}`);
        if (labelSprite) group.add(labelSprite);
      } else {
        // 创建新角色 - 尺寸更大，有光照效果
        const group = new THREE.Group();
        group.userData = { figureId: figure.id, isFigure: true };

        const material = new THREE.MeshStandardMaterial({
          color: figureColor,
          roughness: 0.5,
          metalness: 0.3,
          emissive: 0x000000
        });

        // 头部 - 放大约3倍
        const headGeometry = new THREE.SphereGeometry(1.5, 24, 24);
        const head = new THREE.Mesh(headGeometry, material.clone());
        head.position.y = 6;
        head.userData = { figureId: figure.id, isFigurePart: true };
        group.add(head);

        // 身体 - 放大约3倍
        const bodyGeometry = new THREE.BoxGeometry(2.5, 4, 1.2);
        const body = new THREE.Mesh(bodyGeometry, material.clone());
        body.position.y = 3;
        body.userData = { figureId: figure.id, isFigurePart: true };
        group.add(body);

        // 左手臂
        const armGeometry = new THREE.BoxGeometry(0.6, 3, 0.6);
        const leftArm = new THREE.Mesh(armGeometry, material.clone());
        leftArm.position.set(-1.8, 3, 0);
        leftArm.userData = { figureId: figure.id, isFigurePart: true };
        group.add(leftArm);

        // 右手臂
        const rightArm = new THREE.Mesh(armGeometry, material.clone());
        rightArm.position.set(1.8, 3, 0);
        rightArm.userData = { figureId: figure.id, isFigurePart: true };
        group.add(rightArm);

        // 左腿
        const legGeometry = new THREE.BoxGeometry(0.8, 3.5, 0.8);
        const leftLeg = new THREE.Mesh(legGeometry, material.clone());
        leftLeg.position.set(-0.6, 0.75, 0);
        leftLeg.userData = { figureId: figure.id, isFigurePart: true };
        group.add(leftLeg);

        // 右腿
        const rightLeg = new THREE.Mesh(legGeometry, material.clone());
        rightLeg.position.set(0.6, 0.75, 0);
        rightLeg.userData = { figureId: figure.id, isFigurePart: true };
        group.add(rightLeg);

        // 设置位置和旋转
        group.rotation.y = (figure.rotation || 0) * Math.PI / 180;
        group.scale.setScalar(figure.scale || 1);

        const worldX = (figure.x / 100) * 1000 - 500;
        const worldZ = (figure.y / 100) * 1000 - 500;
        group.position.set(worldX, 0, worldZ);

        const labelSprite = buildFigureLabelSprite(labelText, `#${figureColor.getHexString()}`);
        if (labelSprite) group.add(labelSprite);

        scene.add(group);
        figuresRef.current.set(figure.id, group);
      }
    });
  }, [figures, selectedFigureId]);

  // 强制刷新渲染
  const forceRefresh = () => {
    setForceUpdateKey(k => k + 1);
  };

  // 重置相机
  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.setTheta(0.3);
      controlsRef.current.setPhi(0.8);
      controlsRef.current.update();
    }
    onUpdate({ yaw: 0, pitch: 0, fov: 60 });
    setDisplayInfo({ yaw: 0, pitch: 0, fov: 60 });
  };

  // 截图功能
  const captureCurrentView = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const base64 = dataURL.split(',')[1];
    setFullscreenCapture({ type: 'single', base64 });
  };

  // 全屏查看
  const openFullscreen = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setFsFullscreenParams({ yaw: displayInfo.yaw, pitch: displayInfo.pitch, fov: displayInfo.fov });
    setIsFullscreen(true);
  };

  // 添加角色 - 直接创建3D模型
  const addFigure = () => {
    const newFigure: Figure3D = {
      id: `figure-${Date.now()}`,
      name: `角色${figures.length + 1}`,
      image: '',
      x: 50, // 场景中心
      y: 50, // 场景中心
      scale: 2, // 默认缩放2倍
      rotation: 0
    };
    onUpdate({ figures: [...figures, newFigure] });
  };

  // 选择小人
  const selectFigure = (figureId: string) => {
    setSelectedFigureId(selectedFigureId === figureId ? null : figureId);
  };

  // 删除小人
  const deleteFigure = (figureId: string) => {
    const group = figuresRef.current.get(figureId);
    if (group && sceneRef.current) {
      sceneRef.current.remove(group);
      figuresRef.current.delete(figureId);
    }
    onUpdate({ figures: figures.filter(f => f.id !== figureId) });
    if (selectedFigureId === figureId) {
      setSelectedFigureId(null);
    }
  };

  // 更新小人属性
  const updateFigure = (figureId: string, updates: Partial<Figure3D>) => {
    onUpdate({ figures: figures.map(f => f.id === figureId ? { ...f, ...updates } : f) });
  };

  const selectedFigure = figures.find(f => f.id === selectedFigureId);

  return (
    <div className="flex flex-col h-full min-h-0 gap-2 p-3 overflow-y-auto">
      {/* 3D场景预览 - 默认显示网格地面 */}
      <div
        ref={containerRef}
        className="relative w-full aspect-video min-h-[220px] rounded-lg border border-[#333] overflow-hidden shrink-0 bg-[#3A3A3A]"
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 视角指示器 */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white backdrop-blur-sm z-30 pointer-events-none flex items-center gap-1">
          <ViewIcon size={10} /> 视角: {displayInfo.yaw.toFixed(0)}° / {displayInfo.pitch.toFixed(0)}°
        </div>

        {/* 操作提示 */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-[10px] text-gray-300 backdrop-blur-sm z-30 pointer-events-none flex flex-col items-end gap-1">
          <span>左键旋转 | 右键平移 | 滚轮缩放</span>
          {selectedFigureId && (
            <span className="text-yellow-400">G移动 | R旋转 | S缩放</span>
          )}
          {/* 变换模式切换 */}
          <div className="flex gap-1">
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('translate'); }}
              className={`px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'translate' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="移动模式"
            >
              移动
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('rotate'); }}
              className={`px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'rotate' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="旋转模式"
            >
              旋转
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('scale'); }}
              className={`px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'scale' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="缩放模式"
            >
              缩放
            </button>
          </div>
        </div>

        {/* 全屏按钮 */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); openFullscreen(); }}
          className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm z-30 cursor-pointer"
          title="全屏查看"
        >
          <FullscreenIcon size={14} />
        </button>

        {/* 角色数量提示 */}
        {figures.length > 0 && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-pink-300 backdrop-blur-sm z-30 pointer-events-none flex items-center gap-1">
            <PersonIcon size={10} /> {figures.length}个角色 | 点击选中后用轴操作
          </div>
        )}
      </div>

      {/* 控制按钮 */}
      <div className="flex gap-1">
        <button
          onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
          className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
          title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取背景图片"}
        >
          <EyedropperIcon size={10} /> 吸管
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const base64 = (ev.target?.result as string).split(',')[1];
                  onUpdate({ backgroundImage: base64 });
                };
                reader.readAsDataURL(file);
              }
            };
            input.click();
          }}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 flex items-center justify-center gap-1"
        >
          <ImageIcon size={10} /> 导入背景
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={resetCamera}
          className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
          title="重置视角"
        >
          重置
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={forceRefresh}
          className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
          title="刷新渲染"
        >
          刷新
        </button>
      </div>

      {/* 小人管理区 */}
      <div className="border border-[#333] rounded-lg p-2 bg-[#1a1a1a]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-300 font-medium flex items-center gap-1">
            <PersonIcon size={12} /> 角色管理 ({figures.length})
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={addFigure}
            className="py-1 px-2 rounded text-[10px] bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1"
          >
            <PlusIcon size={10} /> 添加角色
          </button>
        </div>

        {/* 角色列表 */}
        {figures.length > 0 ? (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {figures.map(figure => (
              <div
                key={figure.id}
                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer ${selectedFigureId === figure.id ? 'bg-pink-600/30 border border-pink-500/50' : 'bg-[#252525] hover:bg-[#333]'}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectFigure(figure.id);
                }}
              >
                <div className="w-8 h-8 rounded border border-[#444] bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                  <PersonIcon size={16} className="text-white" />
                </div>
                <span className="flex-1 text-[10px] text-gray-300 truncate">{figure.name}</span>

                {/* 选中角色的控制按钮 */}
                {selectedFigureId === figure.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { scale: Math.max(0.2, (figure.scale || 1) - 0.1) });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="缩小"
                    >
                      -
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { scale: Math.min(3, (figure.scale || 1) + 0.1) });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="放大"
                    >
                      +
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { rotation: ((figure.rotation || 0) - 15) % 360 });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="左旋转15度"
                    >
                      ↺
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { rotation: ((figure.rotation || 0) + 15) % 360 });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="右旋转15度"
                    >
                      ↻
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        deleteFigure(figure.id);
                      }}
                      className="p-1.5 rounded bg-red-600/50 hover:bg-red-500 text-white"
                      title="删除角色"
                    >
                      <DeleteIcon size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 text-center py-2">
            暂无角色，点击"添加角色"创建3D人物
          </div>
        )}

        {/* 选中角色的详细信息 */}
        {selectedFigure && (
          <div className="mt-2 pt-2 border-t border-[#333] space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">名称:</label>
              <input
                type="text"
                value={selectedFigure.name}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { name: e.target.value })}
                className="flex-1 bg-[#252525] text-gray-200 text-[10px] px-2 py-1 rounded border border-[#333] focus:outline-none focus:border-pink-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">缩放:</label>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={selectedFigure.scale}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { scale: parseFloat(e.target.value) })}
                className="flex-1 accent-pink-500"
              />
              <span className="text-[10px] text-gray-400 w-10 text-right">{selectedFigure.scale.toFixed(1)}x</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">旋转:</label>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={selectedFigure.rotation}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { rotation: parseInt(e.target.value) })}
                className="flex-1 accent-pink-500"
              />
              <span className="text-[10px] text-gray-400 w-10 text-right">{selectedFigure.rotation}°</span>
            </div>
          </div>
        )}
      </div>

      {/* 截图功能 */}
      <div className="flex gap-1">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={captureCurrentView}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white"
        >
          截图
        </button>
      </div>
    </div>
  );
}

// ==================== 宫格拆分节点组件 ====================
interface GridSplitNodeContentProps {
  node: GridSplitNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<GridSplitNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
}

function GridSplitNodeContent({ node, nodes, edges, eyedropperTargetNodeId, onEyedropperSelect, onUpdate, onCreateImageNode }: GridSplitNodeContentProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const inputImage = node.inputImage ?? '';
  const outputImages = node.outputImages ?? [];
  const gridCount = node.gridCount ?? 4;
  const frameAspectRatio = node.aspectRatio === '9:16' ? '9:16' : '16:9';
  const previewRef = useRef<HTMLDivElement>(null);

  // 获取连接的图片（根据连线关系）
  const connectedImage = (() => {
    // 找到连接到当前节点的边
    const incomingEdges = edges.filter(e => e.targetId === node.id);
    if (incomingEdges.length === 0) return undefined;

    // 获取源节点
    const sourceIds = incomingEdges.map(e => e.sourceId);
    const sourceNodes = nodes.filter(n => sourceIds.includes(n.id));

    // 从源节点取当前展示的一张图（与参考槽 / 生成逻辑一致）
    for (const n of sourceNodes) {
      const imgs = n.images;
      if (imgs && imgs.length > 0) {
        const idx = Math.min(Math.max(0, n.currentImageIndex ?? 0), imgs.length - 1);
        return imgs[idx];
      }
    }
    return undefined;
  })();

  const displayImage = inputImage || connectedImage;

  // 导入图片
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(',')[1];
          onUpdate({ inputImage: base64 });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  // 执行拆分
  const handleSplit = async () => {
    const sourceImage = displayImage;
    if (!sourceImage) {
      alert('请先导入或连接一张图片');
      return;
    }

    setIsProcessing(true);

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = `data:image/jpeg;base64,${sourceImage}`;
      });

      // 先按目标画幅统一裁一次，再切宫格，避免每格二次裁切导致错位
      const cols = gridCount <= 4 ? 2 : 3;
      const rows = gridCount <= 4 ? 2 : (gridCount === 6 ? 2 : 3);
      const targetRatio = frameAspectRatio === '9:16' ? 9 / 16 : 16 / 9;
      const sourceRatio = img.width / img.height;
      let frameWidth = img.width;
      let frameHeight = img.height;
      let frameX = 0;
      let frameY = 0;

      if (sourceRatio > targetRatio) {
        frameWidth = img.height * targetRatio;
        frameX = (img.width - frameWidth) / 2;
      } else if (sourceRatio < targetRatio) {
        frameHeight = img.width / targetRatio;
        frameY = (img.height - frameHeight) / 2;
      }

      const cellWidth = frameWidth / cols;
      const cellHeight = frameHeight / rows;

      const results: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sourceX = frameX + c * cellWidth;
          const sourceY = frameY + r * cellHeight;
          canvas.width = Math.max(1, Math.round(cellWidth));
          canvas.height = Math.max(1, Math.round(cellHeight));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            img,
            sourceX, sourceY,
            cellWidth, cellHeight,
            0, 0,
            canvas.width, canvas.height
          );
          results.push(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
        }
      }

      onUpdate({ outputImages: results });
    } catch (error) {
      console.error('拆分失败:', error);
      alert('拆分失败');
    } finally {
      setIsProcessing(false);
    }
  };

  // 导出结果
  const handleExport = () => {
    if (outputImages.length > 0) {
      onCreateImageNode(outputImages, node.x + node.width + 50, node.y);
    }
  };

  // 计算宫格框样式
  const cols = gridCount <= 4 ? 2 : 3;
  const rows = gridCount <= 4 ? 2 : (gridCount === 6 ? 2 : 3);

  return (
    <div className="flex flex-col h-full min-h-0 gap-1 p-2 overflow-y-auto">
      {/* 图片预览带宫格框：随节点窗口高度伸缩 */}
      <div ref={previewRef} className="relative w-full flex-1 min-h-[240px] min-w-0 rounded-lg border border-[#333] bg-[#3A3A3A] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center p-1 min-h-0">
          <div
            className="relative rounded border border-[#333] bg-[#3A3A3A] overflow-hidden mx-auto"
            style={{
              aspectRatio: frameAspectRatio === '9:16' ? '9 / 16' : '16 / 9',
              height: '100%',
              maxWidth: '100%',
            }}
          >
            {displayImage ? (
              <>
                <OptimizedImage
                  base64={displayImage}
                  maxSide={1440}
                  quality={0.62}
                  className="w-full h-full object-cover"
                  alt="待拆分图片"
                />
                {/* 宫格分割线 */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(0,255,255,0.8) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(0,255,255,0.8) 1px, transparent 1px)
                    `,
                    backgroundSize: `${100 / cols}% ${100 / rows}%`,
                  }}
                />
                {/* 宫格编号 */}
                {Array.from({ length: gridCount }).map((_, idx) => {
                  const c = idx % cols;
                  const r = Math.floor(idx / cols);
                  return (
                    <div
                      key={idx}
                      className="absolute flex items-center justify-center text-xs font-bold text-cyan-400 bg-black/50 rounded"
                      style={{
                        left: `${(c * 100) / cols}%`,
                        top: `${(r * 100) / rows}%`,
                        width: `${100 / cols}%`,
                        height: `${100 / rows}%`,
                      }}
                    >
                      {idx + 1}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 宫格选择 */}
      <div className="flex gap-1">
        {([4, 6, 9] as const).map(count => (
          <button
            key={count}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onUpdate({ gridCount: count })}
            className={`flex-1 py-1 px-2 rounded text-[10px] ${
              gridCount === count ? 'bg-teal-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'
            }`}
          >
            {count}宫格
          </button>
        ))}
      </div>

      {/* 画幅选择 */}
      <div className="flex gap-1">
        {(['16:9', '9:16'] as const).map((ratio) => (
          <button
            key={ratio}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onUpdate({ aspectRatio: ratio })}
            className={`flex-1 py-1 px-2 rounded text-[10px] ${
              frameAspectRatio === ratio ? 'bg-indigo-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'
            }`}
          >
            {ratio}
          </button>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1">
        <button
          onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
          className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
          title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
        >
          <EyedropperIcon size={15} /> 吸管
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleImport}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
        >
          导入
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleSplit}
          disabled={isProcessing || (!inputImage && !connectedImage)}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
        >
          {isProcessing ? '处理中...' : '拆分'}
        </button>
      </div>

      {/* 拆分结果预览 */}
      {outputImages.length > 0 && (
        <div className="flex gap-1">
          {outputImages.slice(0, 4).map((img, idx) => (
            <OptimizedImage
              key={idx}
              base64={img}
              maxSide={128}
              quality={0.72}
              className="w-8 h-8 object-cover rounded border border-[#444]"
              alt={`格${idx + 1}`}
            />
          ))}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleExport}
            className="px-2 py-1 rounded text-[10px] bg-green-600 hover:bg-green-500 text-white"
            title="导出到节点"
          >
            导出
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== 宫格合并节点组件 ====================
interface GridMergeNodeContentProps {
  node: GridMergeNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<GridMergeNode>) => void;
  onCreateImageNode: (image: string, nodeX: number, nodeY: number) => void;
}

function GridMergeNodeContent({ node, nodes, edges, eyedropperTargetNodeId, onEyedropperSelect, onUpdate, onCreateImageNode }: GridMergeNodeContentProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const inputImages = node.inputImages ?? [];
  const outputImage = node.outputImage ?? '';
  const gridCount = node.gridCount ?? 4;
  const frameAspectRatio = node.aspectRatio === '9:16' ? '9:16' : '16:9';
  const previewRef = useRef<HTMLDivElement>(null);

  // 计算行列数
  const cols = gridCount <= 4 ? 2 : 3;
  const rows = gridCount <= 4 ? 2 : (gridCount === 6 ? 2 : 3);

  // 获取连接的图片（根据连线关系）
  const connectedImages = (() => {
    // 找到连接到当前节点的边
    const incomingEdges = edges.filter(e => e.targetId === node.id);
    if (incomingEdges.length === 0) return [];

    // 获取源节点
    const sourceIds = incomingEdges.map(e => e.sourceId);
    const sourceNodes = nodes.filter(n => sourceIds.includes(n.id));

    // 从源节点获取所有图片
    return sourceNodes.flatMap((n) => {
      const imgs = n.images ?? [];
      if (!imgs.length) return [];
      const idx = Math.min(Math.max(0, n.currentImageIndex ?? 0), imgs.length - 1);
      const b = imgs[idx];
      return b ? [b] : [];
    });
  })();

  // 导入多张图片
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      let loadedCount = 0;
      const results: string[] = [];

      Array.from(files).forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          results[idx] = (ev.target?.result as string).split(',')[1];
          loadedCount++;
          if (loadedCount === files.length) {
            onUpdate({ inputImages: results });
          }
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  };

  // 执行合并
  const handleMerge = async () => {
    // 合并使用 inputImages 和 connectedImages
    const allImages = [...inputImages, ...connectedImages].slice(0, gridCount);
    if (allImages.length < gridCount) {
      alert(`请先导入或连接 ${gridCount} 张图片`);
      return;
    }

    setIsProcessing(true);

    try {
      const loadedImages: HTMLImageElement[] = [];
      for (const base64 of allImages) {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/jpeg;base64,${base64}`;
        });
        loadedImages.push(img);
      }

      // 计算行列数
      const cols = gridCount <= 4 ? 2 : 3;
      const rows = gridCount <= 4 ? 2 : (gridCount === 6 ? 2 : 3);

      // 使用第一张图片的尺寸
      const cellWidth = loadedImages[0].width;
      const cellHeight = loadedImages[0].height;
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth * cols;
      canvas.height = cellHeight * rows;
      const ctx = canvas.getContext('2d')!;

      let idx = 0;
      for (let r = 0; r < rows && idx < gridCount; r++) {
        for (let c = 0; c < cols && idx < gridCount; c++) {
          ctx.drawImage(loadedImages[idx], c * cellWidth, r * cellHeight, cellWidth, cellHeight);
          idx++;
        }
      }

      const targetRatio = frameAspectRatio === '9:16' ? 9 / 16 : 16 / 9;
      let cropWidth = canvas.width;
      let cropHeight = canvas.height;
      if (cropWidth / cropHeight > targetRatio) {
        cropWidth = cropHeight * targetRatio;
      } else {
        cropHeight = cropWidth / targetRatio;
      }
      const cropX = (canvas.width - cropWidth) / 2;
      const cropY = (canvas.height - cropHeight) / 2;
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = Math.max(1, Math.round(cropWidth));
      outputCanvas.height = Math.max(1, Math.round(cropHeight));
      const outputCtx = outputCanvas.getContext('2d')!;
      outputCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, outputCanvas.width, outputCanvas.height);
      const result = outputCanvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      onUpdate({ outputImage: result });
    } catch (error) {
      console.error('合并失败:', error);
      alert('合并失败');
    } finally {
      setIsProcessing(false);
    }
  };

  // 导出结果
  const handleExport = () => {
    if (outputImage) {
      onCreateImageNode(outputImage, node.x + node.width + 50, node.y);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-1 p-2 overflow-y-auto">
      {/* 图片预览带宫格框：随节点窗口高度伸缩 */}
      <div ref={previewRef} className="relative w-full flex-1 min-h-[240px] min-w-0 rounded-lg border border-[#333] bg-[#3A3A3A] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center p-1 min-h-0">
          <div
            className="relative rounded border border-[#333] bg-[#3A3A3A] overflow-hidden mx-auto"
            style={{
              aspectRatio: frameAspectRatio === '9:16' ? '9 / 16' : '16 / 9',
              height: '100%',
              maxWidth: '100%',
            }}
          >
            {(inputImages.length > 0 || connectedImages.length > 0) ? (
              <>
                {/* 合并显示 inputImages 和 connectedImages */}
                <div
                  className="absolute inset-0 grid gap-px p-1"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: gridCount }).map((_, idx) => {
                    const img = inputImages[idx] || connectedImages[idx];
                    return (
                      <div
                        key={idx}
                        className="relative bg-[#1a1a1a] rounded overflow-hidden flex items-center justify-center"
                      >
                        {img ? (
                          <>
                            <OptimizedImage
                              base64={img}
                              maxSide={1440}
                              quality={0.62}
                              className="w-full h-full object-cover"
                              alt={`格${idx + 1}`}
                            />
                            <div className="absolute top-0.5 left-0.5 text-[8px] font-bold text-teal-400 bg-black/60 px-1 rounded">
                              {idx + 1}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-600 text-[10px]">{idx + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* 空状态显示宫格框 */}
                <div
                  className="absolute inset-0 grid gap-px p-1"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: gridCount }).map((_, idx) => (
                    <div
                      key={idx}
                      className="border border-dashed border-[#444] rounded flex items-center justify-center"
                    >
                      <span className="text-gray-600 text-xs">{idx + 1}</span>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                  </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 宫格选择 */}
      <div className="flex gap-1">
        {([4, 6, 9] as const).map(count => (
          <button
            key={count}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onUpdate({ gridCount: count })}
            className={`flex-1 py-1 px-2 rounded text-[10px] ${
              gridCount === count ? 'bg-teal-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'
            }`}
          >
            {count}宫格
          </button>
        ))}
      </div>

      {/* 画幅选择 */}
      <div className="flex gap-1">
        {(['16:9', '9:16'] as const).map((ratio) => (
          <button
            key={ratio}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onUpdate({ aspectRatio: ratio })}
            className={`flex-1 py-1 px-2 rounded text-[10px] ${
              frameAspectRatio === ratio ? 'bg-indigo-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'
            }`}
          >
            {ratio}
          </button>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1">
        <button
          onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
          className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
          title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
        >
          <EyedropperIcon size={15} /> 吸管
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleImport}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
        >
          导入
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleMerge}
          disabled={isProcessing || (inputImages.length + connectedImages.length) < gridCount}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
        >
          {isProcessing ? '处理中...' : '合并'}
        </button>
      </div>

      {/* 合并结果预览 */}
      {outputImage && (
        <div className="flex items-center gap-2">
          <OptimizedImage
            base64={outputImage}
            maxSide={120}
            quality={0.56}
            className="w-16 h-16 object-cover rounded border border-[#444]"
            alt="合并结果"
          />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleExport}
            className="px-2 py-1 rounded text-[10px] bg-green-600 hover:bg-green-500 text-white"
            title="导出到节点"
          >
            导出
          </button>
        </div>
      )}
    </div>
  );
}

/** 在提示词中插入 @R 序号，引用汇入节点的参考槽位 */
function RefPickBar({
  slots,
  disabled,
  onInsert,
  uiScale = 1,
}: {
  slots: IncomingRefSlot[];
  disabled?: boolean;
  onInsert: (token: string) => void;
  /** 仅 AI 对话节点传 CHAT_PANEL_FONT_SCALE；其它节点默认 1 */
  uiScale?: number;
}) {
  if (!slots.length) return null;
  const sp = (px: number) => Math.round(px * uiScale);
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pt-1.5 pb-1" style={{ fontSize: sp(11) }}>
      <span className="text-gray-500 shrink-0 font-medium">引用参考:</span>
      {slots.map((s) => (
        <button
          key={`${s.edgeId}-r${s.n}-${s.kind}`}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onInsert(`@R${s.n}`);
          }}
          className="rounded-lg border border-cyan-800/60 bg-cyan-950/40 px-2 py-1 font-semibold text-cyan-200 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-35 text-xs"
          title={s.label}
        >
          @R{s.n}
        </button>
      ))}
      <span className="text-gray-600 leading-snug">点击插入 / 键盘输入 @R</span>
    </div>
  );
}

// ==================== 对话节点组件 ====================
/** AI 对话节点界面文字相对原设计的倍数（与「字号」存盘值相乘；与节点内 1.95×1.5 对齐） */
const CHAT_PANEL_FONT_SCALE = 2.925;
/** 新建 / 重置时 AI 对话节点默认高度（与下方 chatInputHeight 比例公式一致） */
const CHAT_NODE_DEFAULT_PIXEL_HEIGHT = 1840;
const CHAT_FONT_LS_KEY = 'wxcanvas-chat-font-px';
function clampChatFontPx(n: number): number {
  if (!Number.isFinite(n)) return 14;
  return Math.min(22, Math.max(11, Math.round(n)));
}
function readStoredChatFontPx(): number {
  if (typeof window === 'undefined') return 14;
  try {
    const raw = localStorage.getItem(CHAT_FONT_LS_KEY);
    if (raw == null || raw === '') return 14;
    return clampChatFontPx(parseInt(raw, 10));
  } catch {
    return 14;
  }
}

/** 即梦 CCC 资产分镜工程提示词（对话节点一键填入） */
const CHAT_PROMPT_JIMENG_CCC_ASSETS = `【角色定位】
你是即梦AI视频生成工具的竖屏/横屏短剧专属分镜提示词工程师，擅长将各类详略程度的短剧剧本，拆解为即梦agent可直接执行的标准化分镜提示词工程文件，完美适配横屏16:9画幅的纯AI生成图片+视频+人工后期剪辑全流程，可自动补全剧本未标注的镜头、景别、人设、场景、画风细节，严格遵循单Clip整数秒时长规范，精准匹配AI生成逻辑与竖屏短剧的叙事节奏。
【输入剧本原文】
我将给你完整的短剧剧本，支持带时间码、画面描述、台词、音效、核心主题的分段式竖屏剧本，也支持常规分场景剧本，剧本全文如下：
---【把你的剧本在此处粘贴/传附件】---
【核心任务与强制输出规范】
请严格遵循以下所有要求，将上述剧本100%还原转换为即梦agent可直接使用的分镜提示词工程文件，不得增减、修改原剧本的核心剧情、人设、台词、时长节点、特效要求，具体要求如下：
一、第一部分：分场景Shot级镜头拆分（AI生成专属适配）
1. 严格遵循原剧本的叙事顺序、时间节点、核心剧情，拆分出独立的最小镜头单元，每个镜头标注固定格式：场景序号+场景名称（日/夜 内/外）、Shot ID、景别、横屏16:9适配画面内容、同步音效/环境音
2. 若原剧本未标注景别，需根据画面内容与竖屏短剧呈现逻辑，自动匹配适配的景别（怼脸特写、近景、中景、全景等）；原剧本已标注的景别、镜头、特效要求，必须100%完整对应到单个Shot中，不得打乱原剧本叙事逻辑
3. 原剧本中的所有台词、旁白、内心OS、画外音、音效标注，必须精准对应到所属画面的Shot中，不得遗漏任何原剧本内容。
4. 所有画面描述优先适配横屏16:9画幅，突出人物主体与核心冲突，贴合AI文生图/文生视频的prompt逻辑，补充明确的画风、光影、构图细节，为后续AI生成与Clip拆分做好基础适配
二、第二部分：分镜计时表（全整数时长强制规范）
1. 制作规范表格，表头固定为：镜头ID、景别、画面内容、台词/旁白、字数、说话时长、动作时长、计算时长、AI生成适配说明
2. 时长核算规则：全表格所有时长必须为正整数，不得出现小数；严格对齐原剧本标注的时间节点，中文说话时长按每秒5个字标准语速计算后向上取整；单镜头动作时长贴合原剧本时间分配，最低2秒，全部取整数
3. 计算时长取值规则：说话时长＞动作时长，取说话时长；反之取动作时长；对时长＜4秒的镜头，必须标注「⚠️<4s需合并入同场景Clip」
4. 结尾核算所有镜头总时长，保证与原剧本要求的单集时长完全匹配，总时长为整数，误差为0，同时备注单镜头合并规则，严格匹配后续4-15秒整数Clip的拆分要求
三、第三部分：分镜组合Clip表（整数时长+AI生成专属规范）
1. 按原剧本的单集总时长、镜头切换点、叙事节拍，拆分为适配AI视频生成的Clip片段，单Clip时长必须为整数秒，严格控制在4秒≤单Clip时长≤15秒区间内，仅可使用4-15之间的整数时长，不得出现小数、超上限、低于下限的片段
2. 拆分规则：优先按原剧本的时间码、镜头切换节点拆分，同一场景、连续动作、单句台词优先归入同一个Clip，每个Clip内的镜头切换不超过3个，保证AI生成画面的连贯性，拆分完成后每个Clip必须明确标注整数时长
3. 每个Clip片段内，按叙事逻辑组合对应Shot，完整描述连贯画面内容、镜头切换顺序、同步音效、台词/旁白；画面描述必须补充精准的人物状态、服饰妆造、道具细节、环境光影、统一画风，适配竖屏9:16画幅与即梦AI生成规则
4. 每个Clip片段末尾，必须标注3项核心内容：参考人物素材、参考场景素材、参考物品素材，素材名称必须和后续资产设定完全对应，保证AI生成画面的前后一致性
四、第四部分：角色设计标准化设定（AI生成专属）
1. 提取原剧本中所有出现的核心角色，逐个做标准化设定，每个角色必须包含：角色名称、AI生成基础设定（年龄、外貌、五官特征、发型、气质、妆造、服饰、核心性格、统一画风适配）、涉及Clip序号
2. 若原剧本未详细描述角色外观，需根据角色人设、剧情定位、题材风格，自动补全符合逻辑、适配AI生成的标准化设定，保证角色形象在全片所有Clip中完全统一，无画风、五官、服饰偏差
五、第五部分：核心道具/物品+场景设计标准化设定（AI生成专属）
1. 道具资产部分：提取原剧本中所有出现的关键道具、核心物品，逐个做标准化设定，每个道具必须包含：物品名称、分类 (Category)、AI生成基础设定 (Base)、物品类别、涉及Clip序号；基础设定需精准描述材质、尺寸、外观细节、核心特征、光影质感，100%还原原剧本描述，未提及的细节贴合剧情题材自动补全，适配AI生成逻辑
2. 场景资产部分：提取原剧本中所有出现的场景，逐个做标准化设定，每个场景必须包含：场景名称、环境细节描述、光影与色调设定、氛围设定、统一画风适配、涉及Clip序号；环境描述需精准到建筑材质、空间陈设、环境细节，光影色调贴合剧情情绪，适配竖屏9:16画幅与AI生成要求
六、第六部分：音频资产设计（适配人工后期剪辑）
1. 提取原剧本中所有有台词/旁白/OS/画外音的角色，逐个标注标准化音色设定，每个角色必须包含：角色名称、音色描述（性别、年龄、语调、音高、语速、口音、情绪适配）
2. 提取原剧本中所有标注的音效、背景音要求，补充适配剧情氛围的环境音设计，标注对应出现的镜头ID与Clip序号，精准对齐每个Clip的整数时长节点，适配人工后期剪辑的音画同步需求
【格式与最终校验规则】
1. 所有内容使用中文，层级清晰，用markdown格式规范排版，标题、列表、表格格式正确，适配即梦agent的读取规则
2. 所有镜头、片段、资产的描述，必须适配即梦AI文生图/文生视频的prompt规范，画面描述具象化，避免抽象词汇，精准到人物动作、微表情、环境细节、光影特效、画风统一，横屏16:9画幅适配贯穿全内容
3. 核心强制校验项：
- 全文档所有时长（单镜头、单Clip、总时长）必须全部为正整数，不得出现任何小数
- 所有Clip片段必须严格遵守4-15秒整数时长要求，不得出现时长＜4秒、＞15秒的Clip
- 全内容全程适配纯AI生成图片+视频，无任何真人实拍相关要求与描述
- 拆分完成后需单独标注全片Clip总数量、单Clip整数时长明细、总时长，确保与原剧本要求时长完全匹配
4. 原剧本中标注的特效、镜头要求、核心剧情节点，必须在对应镜头、片段中重复标注，确保AI生成时精准触发
5. 最终输出内容必须100%还原原剧本，不得擅自修改、增减任何剧情、台词、人设、时长节点，哪怕原剧本描述简略，也需在不改动核心内容的前提下，仅补全AI生成所需的画面细节。`;

/** 即梦 Seedance 2.0 · CCC 单镜视频提示词模板（对话节点一键填入） */
const CHAT_PROMPT_JIMENG_CCC_VIDEO_SEEDANCE = `【角色定位】
即梦 Seedance 2.0 横屏短剧·标准化分镜生成提示词模板
你现在是即梦 Seedance 2.0 视频生成专属提示词工程师，核心任务是：将投喂的剧本分镜工程文件，转化为「零崩脸、零崩盘、叙事节奏清晰、可直接复制进即梦零修改生成视频」的标准化单镜生成提示词，全程严格遵循以下所有规则。
第一章·核心铁则
（一）模型稳定性铁则
1. 参考素材绝对优先：上传的角色/场景参考图优先级高于任何文字描述，文字仅做补充，严禁修改素材内角色五官、妆容、服饰、场景布局、光影风格。
2. 提示词模块顺序固定，严禁调换或遗漏：导演讲戏·分镜时间轴 → 风格光影定调 → 正向稳定约束 → 音效约束 → 特殊约束 → 本镜头专项负面词
3. 单镜内容安全上限：同框角色最多 2 人，仅 1 人为核心动作主体；单镜固定单一场景，严禁时空跳变；单镜仅承载 1 个核心连贯动作或 1 个核心叙事节拍。
4. 时长严格对齐分镜工程文件：单镜时长锁定 4～15 秒整数，与 Clip 工程文件时长 100% 一致。
时长区间：4～6 秒 适配场景：短镜，强冲击特写、道具细节、情绪定格
时长区间：7～10 秒 适配场景：中镜，角色对话、剧情推进、情绪递进
时长区间：11～15 秒 适配场景：长镜，氛围渲染、情绪沉浸、长线铺垫
5. 动作物理真实防崩：所有动作描述必须包含「起点状态 → 过程变化 → 终点状态」完整物理链，明确标注衣物飘动方向与幅度、肢体联动起止细节，严禁描述孤立静止画面。
6. 字数上限：4～6 秒 ≤500 字；7～10 秒 ≤1000 字；11～15 秒 ≤1500 字。输出前必须自检，超出立即压缩。
（二）叙事创作铁则
1. 神还原：100% 匹配原分镜工程文件的核心剧情、人设、台词、时长节点、特效要求；仅可在自然语义停顿处拆分超长台词，严禁机械拆分完整语义。
2. 单镜单节拍叙事：每个镜头仅承载 1 个核心叙事节拍；强冲击用短镜，氛围渲染用长镜。
3. 落地具象：所有描述必须为 AI 可直接识别的具象物理细节——景别+角度+运镜方式、具体面部肌肉状态、可被摄影机捕捉的物理动作，严禁使用"展示情绪""感到悲伤""神情复杂"等抽象表述。
4. 五维融合叙述：【导演讲戏·分镜时间轴】将画面内容、人物动作、台词声音、镜头运动、光影氛围五个维度融合为自然叙述段落，严禁分条列举与标签堆砌。
第二章·开始前必须输出的全剧锚定基准
开始任何分镜输出之前，必须先完成并输出素材对应表，同角色/同场景全剧仅保留唯一一张参考图，严禁使用多张。
【素材对应表】@图片1 = [角色/场景/道具名称]（核心特征简述）@图片2 = [角色/场景/道具名称]（核心特征简述）@图片N = …
第三章·输出强制规则
@素材引用直接复用第二章【素材对应表】代号，单独占一行，行后严禁附加任何说明文字
【风格光影定调】每个单镜必须完整独立写出，严禁省略，需结合本镜头具体光影情绪描述
【本镜头专项负面词】仅保留 3～5 条本镜头专项负面词
第四章·标准化单镜生成提示词模板
每个分镜单独成块，开头标注 【集数 X | 镜头 X | 时长 XXs | 核心叙事节拍】，镜头间用 --- 分隔，所有字段必须填写，无内容标「无」。
@图片X
@图片X
【导演讲戏·分镜时间轴】0-Xs：[景别+运镜+画面内容+人物动作（起点→过程→终点）+台词/旁白原文+光影氛围+音效卡点，五维融合为连续自然叙述，角色以完整姓名写入，场景以完整地点名写入，严禁分条列举]X-Xs：[景别+运镜+承接上段动作终点，递进物理动作链+台词/旁白（如有）+环境细节+音效卡点]X-XXs：[景别+运镜+动作闭环+物理余韵+台词/旁白（如有）+收尾定格+转场方式（硬切/淡出）+音效卡点]
【风格光影定调】[本镜头画风+光影色调+布光方式+色温+明暗对比+画面质感，结合本镜头情绪完整独立描述]，8K超高清，超细节
【正向稳定约束】
全程画面流畅丝滑，无跳帧、无抖动、无突兀切换；角色五官、妆容、发型、服饰全程100%固定不变；人物肢体自然正常，无多手指、无肢体扭曲、无穿模；画面焦点始终锁定核心主体；
【音效专属约束】
基础环境音：[内容]卡点动作音：[内容/无]氛围音效：[内容/无]硬性约束：全程无背景音乐、无BGM，音效与画面动作完全同步，人声清晰优先，无穿帮音效
【特殊约束】
[本镜头特殊生成约束，如道具细节固定、特效层叠加、动作幅度限制；无则标「无」]
【本镜头专项负面词】
[3～5条，仅针对当前镜头AI易错点；无则标「无」]
第五章·核心禁忌红线
红线1·时长：单镜时长严禁超过 15 秒；时长必须与 Clip 工程文件 100% 一致。
红线2·人数与场景：单镜严禁 3 人及以上交互；严禁单镜内多场景切换；严禁堆砌多个核心动作节拍。
红线3·原著还原：严禁偏离原分镜工程文件的核心情节、角色人设、时长节点；严禁修改或增删原台词。
红线4·音效：严禁出现背景音乐/BGM/现代音效；严禁音效盖过人声。
红线5·角色与场景写法：严禁使用代号替代角色姓名或场景地点；所有出镜角色必须以完整姓名写入，所有场景必须以完整地点名写入。
红线6·风格光影：严禁【风格光影定调】以任何形式省略；每个单镜必须完整独立描述，与当前镜头情绪精准匹配。`;

/** BBBB_全能资产：全中文 AI 绘画提示词专家模板（人物四宫格 / 场景与关键帧九宫格） */
const CHAT_PROMPT_BBBB_ALL_ASSET = `# Role: 资深影视概念设计师 & AI绘图提示词专家

## 任务目标
请仔细阅读我提供的【剧本内容】和【视觉风格】，为我撰写用于AI绘画（如 Nano Banana, Flux, Qwen）的**全中文自然语言提示词**。

## 核心规则（必须严格遵守）
1. **语言要求**：所有输出的提示词必须是**中文**，使用优美、精准的自然语言描述（包含光影、材质、构图、氛围）。
2. **格式要求**：请将每组提示词放入独立的**代码块**中，方便我直接点击“复制”按钮。
3. **画幅锁定**：
   - **人物设定图**：严格锁定 **--ar 9:16**。
   - **场景设定图**：严格锁定 **--ar 16:9**。
   - **关键帧拼图**：严格锁定 **--ar 16:9**。
4. **拼图逻辑**：
   - 人物图：严格使用 **2x2 四宫格**。
   - 场景设定图与关键帧：统一严格使用 **3x3 九宫格**（取消2x2模式）。

## 风格控制（Style Control）
请根据用户指定的【视觉风格】，在提示词的开头和结尾加入对应的风格修饰词。**注意：以下列出的专业修饰词仅为“参考示例”，请不要太过限定或生搬硬套。请根据剧本的具体氛围，在网络相关提示词的常识基础上灵活调整、发散组合，不要受限于下方举例。**
- **写实电影类**：（示例：电影级摄影、ARRI Alexa实拍、真实物理材质、皮肤毛孔细节、胶片颗粒感、自然光影、非CG、Raw photo...）
- **动漫/二次元类**：（示例：吉卜力画风、赛璐璐上色、新海诚式唯美光影、京阿尼精细线条、浓郁色彩、平面插画...）
- **唯美CG/游戏类**：（示例：虚幻引擎5渲染、辛烷渲染、极致全局光照、3D精细建模、CG艺术杰作、次世代游戏质感...）

---

## 输出内容结构

### 第一部分：人物设定图 (Character Design)
- **提取要求**：仔细阅读剧本，**提取剧本中出现的所有重要人物（不能只写一两个主角）**，为每一个人物单独生成一组提示词。
- **命名规则（极其重要）**：在最终输出的提示词文本内，**绝对不要出现剧本里的具体姓名**，请用角色定位、性别、身份或职业代称（例如：女主、男主、伯爵、伯爵夫人、管家、公主、怪物、一名年轻男性、神秘的女剑客、年迈的反派等）。
- **排版要求**：在每个人物的提示词代码块上方，请用加粗文本清晰标注：\`### 角色[X]：[人物身份]\`。
- **一致性与构图规则**：除面部特写外，必须在提示词中强制强调正面、侧面、背面视图**包含从头到脚的完整全身（避免画面截断）**。同时，必须要求**不同视角的发型、服装细节、配饰保持绝对一致**。
- **垫图规则**：如果用户在输入区提供了【人物面部参考】，请在提示词中明确加入指令：**“保持人物面部特征与参考图完全一致”**。
- **内容**：生成人物的白底（或中性灰底）四视图。
- **结构参考**：
  > [风格修饰词]，一张2x2的四宫格人物设定图。主角是[人物身份代称，禁带原名]，[外貌/服装/气质]。左上角：从头到脚完整全身的正面站立；右上角：从头到脚完整全身的侧面；左下角：从头到脚完整全身的背面；右下角：面部特写，[五官细节]。[一致性指令：所有视角的人物发型、服装细节和配饰必须保持绝对一致]。[垫图指令：面部特征需参考上传图片]。[画质修饰词]。 --ar 9:16

### 第二部分：场景设定图 (Scene Design)
- **内容**：梳理剧本中的核心环境，强调宏大感和空间关系。
- **结构参考**：
  > [风格修饰词]，一张3x3的九宫格场景概念图。
  > 画面1：[场景名]，[宏大的环境描述、天气、光影、建筑风格]；
  > 画面2：[场景名]...
  > 画面9：[场景名]...
  > [画质修饰词]。 --ar 16:9

### 第三部分：关键剧情首帧图 (Key Frames)
- **内容**：提取剧本中控制剧情走向的关键节点（用于视频生成的起始帧）。
- **垫图提醒**：在生成提示词前，请加粗提示：**“生成本图时，建议配合前两部分的人物和场景图以保持一致性。”**
- **结构参考**：
  > [风格修饰词]，一张3x3的电影分镜关键帧拼图。
  > 画面1：[人物代称]身处[场景]中，[具体的动作、神态、交互]，[镜头语言：特写/广角/过肩镜头]；
  > 画面2：[剧情发展]...
  > 画面9：[剧情发展]...
  > [画质修饰词]。 --ar 16:9

---
等待用户输入
## 用户输入区

**1. 【剧本内容】：**
（请在此处粘贴剧本）

**2. 【人物面部参考】：**
（例如：男主参考上传图片1；大反派参考上传图片2；其余未提及人物则自由发挥）

**3. 【视觉风格】：**
（请填写你想要的风格，如：好莱坞废土写实风、唯美3D国漫风、水墨武侠风等）

**4. 【其他要求】：**
（如有特殊光影、特定动作或色调要求请填写）`;

/** EEEE_备选万能资产：与 BBBB 同套全中文 AI 绘画规范（人物 2x2·9:16；场景与关键帧 3x3·16:9），备用入口 */
const CHAT_PROMPT_EEEE_ALT_UNIVERSAL_ASSET = CHAT_PROMPT_BBBB_ALL_ASSET;

function buildReversePromptPresetText(): string {
  const spec = {
    prompt_main:
      '请作为专业的电影分析师与AI提示词工程师，对上传视频进行逐分镜解构，逆向推导可复现该画面的AI视频提示词。',
    prompt_detail:
      '请严格按以下维度分析：1.镜头设计：含镜头类型、角度、运动、构图；2.主体与动作：识别核心主体、行为动作、叙事意图；3.场景环境：场景、时间、天气、空间细节；4.光影色彩：光线方向、色调、对比度、氛围；5.风格质感：艺术风格、画质、质感、参考风格；6.音频信息：旁白、台词、音效、背景音乐；7.技术参数：分辨率、帧率、渲染质量。输出需完整覆盖各分镜，格式清晰，确保提示词可直接用于AI视频生成。',
    output_format:
      'JSON结构，包含分镜序号、时间戳、画面提示词、音频描述、风格参数、运镜参数、完整可复用提示词。',
  };
  return [
    '【任务：反推提示词】',
    '',
    '—— 以下为结构化指令（随本消息发送）——',
    JSON.stringify(spec, null, 2),
    '',
    '请基于我提供的参考（视频/截图/文字描述），严格按上述维度与 output_format 输出；若无法访问视频本体，请说明原因并基于可用信息尽力完成。',
  ].join('\n');
}

/** 与对话节点「功能」按钮一致的预设条目（可在设置 → 预设 → AI对话 中编辑） */
const INITIAL_CHAT_PROMPT_PRESETS: Record<string, string> = {
  '反推提示词': buildReversePromptPresetText(),
  'BBBB_全能资产': CHAT_PROMPT_BBBB_ALL_ASSET,
  'EEEE_备选万能资产': CHAT_PROMPT_EEEE_ALT_UNIVERSAL_ASSET,
  'CCC即梦分镜': CHAT_PROMPT_JIMENG_CCC_ASSETS,
  'CCC即梦视频': CHAT_PROMPT_JIMENG_CCC_VIDEO_SEEDANCE,
};

const INITIAL_PROMPT_PRESETS_ALL: Record<string, string> = {
  ...INITIAL_T2I_PROMPT_PRESETS,
  ...INITIAL_I2I_PROMPT_PRESETS,
  ...INITIAL_CHAT_PROMPT_PRESETS,
};

type ChatFeatureButtonSpec = {
  id: string;
  presetKey: string;
  label: string;
  title: string;
  icon?: 'video' | 'wand' | 'message';
};

const CHAT_FEATURE_BUTTON_SPECS: ChatFeatureButtonSpec[] = [
  {
    id: 'reverse-prompt',
    presetKey: '反推提示词',
    label: '反推提示词',
    icon: 'video',
    title:
      '',
  },
  {
    id: 'bbbb-all-asset',
    presetKey: 'BBBB_全能资产',
    label: 'BBBB_全能资产',
    icon: 'wand',
    title:
      'BBBB_全能资产：根据剧本与视觉风格生成全中文 AI 绘画提示词（人物 2x2·9:16；场景与关键帧 3x3·16:9）。发送前请填入剧本、风格与可选面部参考说明，并可连接参考图。',
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
    id: 'jimeng-ccc-assets-storyboard',
    presetKey: 'CCC即梦分镜',
    label: 'CCC即梦分镜',
    icon: 'wand',
    title:
      'CCC_资产分镜提示词_即梦：一键填入即梦 agent 分镜工程规范（Shot/计时表/Clip/角色与场景资产/音频）。发送前请在占位处粘贴完整剧本或连接文本节点。',
  },
  {
    id: 'jimeng-ccc-seedance-video',
    presetKey: 'CCC即梦视频',
    label: 'CCC即梦视频',
    icon: 'message',
    title:
      'CCC_视频提示词_即梦（Seedance 2.0）：单镜标准化提示词工程模板。发送前请连接或粘贴分镜工程文件要点，并在参考区绑定角色/场景参考图。',
  },
];

interface ChatNodeContentProps {
  node: ChatNode;
  nodes: CanvasNode[];
  edges: Edge[];
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
  generationMmSs?: string;
  generationSeconds?: number;
}

function ChatNodeContent({
  node,
  nodes,
  edges,
  eyedropperTargetNodeId,
  onEyedropperSelect,
  onDeleteEdge,
  onUpdate,
  onSendMessage,
  onResendWithHistory,
  onOpenApiSettings,
  promptPresets,
  generationMmSs,
  generationSeconds,
}: ChatNodeContentProps) {
  const [showAllRefs, setShowAllRefs] = useState(false);
  const chatPromptRef = useRef<HTMLTextAreaElement>(null);
  const refSlots = useMemo(() => buildIncomingRefSlots(node.id, edges, nodes), [node.id, edges, nodes]);

  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const [editUserDraft, setEditUserDraft] = useState('');
  const [chatFontPx, setChatFontPx] = useState(readStoredChatFontPx);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

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
          { label: '清除报错', action: () => onUpdate({ error: undefined }) },
        ],
      };
    }
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('too many requests') || msg.includes('resource exhausted')) {
      return {
        title: '限流',
        reason: '请求过多或配额已达上限。',
        fixes: [
          { label: '切换到 Gemini 2.5 Flash', action: () => onUpdate({ model: 'gemini-2.5-flash', error: undefined }) },
          { label: '清除报错重试', action: () => onUpdate({ error: undefined }) },
        ]
      };
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline') || msg.includes('network') || msg.includes('fetch failed')) {
      return {
        title: '超时',
        reason: '网络或模型响应超时。',
        fixes: [
          { label: '清除报错重试', action: () => onUpdate({ error: undefined }) },
        ]
      };
    }
    if (msg.includes('invalid') || msg.includes('unsupported') || msg.includes('400') || msg.includes('参数')) {
      return {
        title: '参数无效',
        reason: '输入内容或参数配置不符合接口要求。',
        fixes: [
          { label: '清空输入框', action: () => onUpdate({ prompt: '', error: undefined }) },
          { label: '切换到 Gemini 3 Pro', action: () => onUpdate({ model: 'gemini-3-pro-preview', error: undefined }) },
        ]
      };
    }
    return {
      title: 'API 错误',
      reason: '接口鉴权、服务状态或响应格式异常。',
      fixes: [
        { label: '切换到 DeepSeek-V4-Flash', action: () => onUpdate({ model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID, error: undefined }) },
        { label: '切换到 GPT-5.5（君澜）', action: () => onUpdate({ model: 'gpt-5.5-junlan', error: undefined }) },
        { label: '切换到 Gemini 2.5 Flash', action: () => onUpdate({ model: 'gemini-2.5-flash', error: undefined }) },
        { label: '打开 API 设置', action: () => onOpenApiSettings() },
        { label: '清除报错', action: () => onUpdate({ error: undefined }) },
      ],
    };
  })();

  const totalRefImages = refSlots.reduce((sum, slot) => sum + (slot.imageBase64s?.length || (slot.imageBase64 ? 1 : 0)), 0);
  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] rounded-b-xl overflow-hidden">
      {/* 参考区：图片 + 视频 */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#252525] border-b border-[#333] shrink-0" style={{ fontSize: fs(10), order: 2 }}>
        <span className="text-gray-400 shrink-0">参考:</span>
        <span className="text-green-400 font-medium shrink-0">
          {totalRefImages}图
          {refSlots.some((s) => s.kind === 'video') ? (
            <span className="text-amber-400"> · {refSlots.filter((s) => s.kind === 'video').length}视频</span>
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
                      maxSide={96}
                      quality={0.72}
                      alt={`${slot.label}图${imgIdx + 1}`}
                      className="w-11 h-11 object-cover rounded border border-[#444]"
                    />
                  ))}
                  {slot.imageBase64s.length > 4 && (
                    <div className="w-11 h-11 rounded border border-[#444] bg-[#333] flex items-center justify-center text-gray-400 text-[8px]">
                      +{slot.imageBase64s.length - 4}
                    </div>
                  )}
                </div>
              ) : slot.kind === 'image' && slot.imageBase64 ? (
                <OptimizedImage
                  base64={slot.imageBase64}
                  maxSide={200}
                  quality={0.72}
                  alt={slot.label}
                  className="w-11 h-11 object-cover rounded border border-[#444]"
                />
              ) : slot.kind === 'video' && slot.videoUrl ? (
                <video
                  src={slot.videoUrl}
                  className="h-9 w-9 rounded border border-[#444] object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="h-9 w-9 rounded border border-[#444] bg-[#333]" title={slot.label} />
              )}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(slot.edgeId);
                }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                title="取消引用"
              >
                <span className="leading-none text-[8px]">×</span>
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
        className="flex items-center gap-2 px-3 py-2 bg-[#252525] border-b border-[#333]"
        style={{ fontSize: 27, order: 3 }}
      >
        <span className="text-gray-400">模型:</span>
        <select
          className="nodemodel-select bg-[#222222] border border-[#444] rounded px-2 py-1 text-gray-300 outline-none focus:border-rose-500 max-w-[330px]"
          value={normalizeDeepSeekChatModelId(node.model || DEFAULT_DEEPSEEK_CHAT_MODEL_ID).trim()}
          onChange={(e) => onUpdate({ model: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <optgroup label="DeepSeek（OpenAI 兼容 · api.deepseek.com/v1）">
            <option value="deepseek-v4-flash">DeepSeek-V4-Flash</option>
            <option value="deepseek-v4-pro">DeepSeek-V4-Pro</option>
          </optgroup>
          <optgroup label="君澜 AI（OpenAI 兼容）">
            <option value="gpt-5.5-junlan">GPT-5.5（君澜 · www.junlanai.com/v1）</option>
          </optgroup>
          <optgroup label="Google Gemini / ToAPIs">
            <option value="gemini-2.0-flash-official">Gemini 2.0 Flash（official · ToAPIs）</option>
            <option value="gemini-3.1-flash-lite-preview-official">Gemini 3.1 Flash Lite（official · ToAPIs）</option>
          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          <option value="gemini-3.1-flash-preview">Gemini 3.1 Flash</option>
          <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
          </optgroup>
        </select>
        <label className="flex items-center gap-1 shrink-0 text-gray-500" style={{ fontSize: fs(10) }}>
          <span className="whitespace-nowrap">字号</span>
          <select
            className="max-w-[76px] rounded border border-[#444] bg-[#222222] px-1 py-0.5 text-gray-200 outline-none focus:border-rose-500"
            style={{ fontSize: fs(10) }}
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
      <div className="flex min-h-0 flex-1 flex-col" style={{ order: 1 }} style={{ order: 1 }}>
      <div
        className="chat-messages min-h-0 flex-[2_1_0%] overflow-y-auto p-3 space-y-3 cursor-grab active:cursor-grabbing"
        style={{ userSelect: 'text' }}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          // 点击空白区域（消息容器本身或 padding 区域）允许拖动节点
          if (target.classList.contains('chat-messages') || target.tagName === 'DIV' && (target.parentElement?.classList.contains('chat-messages') || target === e.currentTarget)) {
            return; // 不阻止冒泡，让节点拖拽处理
          }
          e.stopPropagation();
        }}
      >
        <style>{`
          .chat-messages::-webkit-scrollbar {
            width: ${fs(6)}px;
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
        {messages.map((msg) => {
          const editingThis = msg.role === 'user' && editingUserMessageId === msg.id;
          return (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
                className="max-w-[92%] rounded-lg p-2.5 text-gray-200"
                style={{ fontSize: chatFontScaled }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(msg.images?.length ? msg.images : msg.image ? [msg.image] : []).map((im, ii) => (
                <OptimizedImage
                  key={`${msg.id}-img-${ii}`}
                  base64={im}
                  maxSide={210}
                  quality={0.56}
                  alt="用户参考图"
                  className={`${ii ? 'mt-1 ' : ''}mb-2 h-24 w-24 rounded object-cover`}
                />
              ))}
                {editingThis ? (
                  <>
                    <textarea
                      value={editUserDraft}
                      onChange={(e) => setEditUserDraft(e.target.value)}
                      rows={5}
                      className="w-full min-h-[180px] rounded-md bg-black/25 border border-white/35 px-2 py-1.5 text-white outline-none focus:border-white/60"
                      style={{ fontSize: chatFontScaled }}
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
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingUserMessageId(msg.id);
                            setEditUserDraft(msg.content);
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
                          onUpdate({ prompt: (node.prompt || '') + '\n' + msg.content });
                        }}
                        className="rounded border border-white/25 px-2 py-0.5 opacity-70 hover:opacity-100 hover:bg-white/10"
                        style={{ fontSize: fs(Math.max(10, chatFontPx - 2)) }}
                        title="将此条消息内容作为参考添加到输入框"
                      >
                        作为参考
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
              {generationMmSs != null && (
                <span className="tabular-nums text-gray-500" style={{ fontSize: fs(Math.max(10, chatFontPx - 1)) }}>
                  已用时 {generationMmSs}
                  {generationSeconds != null ? ` · ${generationSeconds} 秒` : ''}
                </span>
              )}
            </div>
          </div>
        )}
        {node.error && chatErrorDiagnosis && (
          <div className="flex justify-start">
            <div
              className="bg-red-950/90 rounded-lg p-2.5 text-red-200 border border-red-900/60 max-w-[92%]"
              style={{ fontSize: chatFontScaled }}
            >
              <div className="font-bold mb-1">{chatErrorDiagnosis.title}</div>
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

      {/* 输入区域（与上方消息区 flex 2:1） */}
      <div className="flex min-h-0 flex-[1_1_0%] flex-col overflow-y-auto border-t border-[#333] bg-[#252525] p-2">
        {/* 快捷功能：置于文字输入框上方 */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-[#333] bg-[#3A3A3A] px-2 py-1.5" style={{ fontSize: fs(10) }}>
          <span className="shrink-0 text-gray-500">功能</span>
          {CHAT_FEATURE_BUTTON_SPECS.map((btn) => {
            const presetBody = promptPresets[btn.presetKey] ?? '';
            return (
            <button
              key={btn.id}
              type="button"
              disabled={node.isGenerating}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ prompt: presetBody, error: undefined });
              }}
              className="inline-flex items-center gap-0.5 rounded-md border border-rose-800/55 bg-rose-950/45 px-2 py-0.5 font-medium text-rose-100 hover:bg-rose-900/55 disabled:cursor-not-allowed disabled:opacity-40"
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
        <RefPickBar
          slots={refSlots}
          disabled={node.isGenerating}
          uiScale={CHAT_PANEL_FONT_SCALE}
          onInsert={(tok) => {
            const el = chatPromptRef.current;
            const cur = node.prompt || '';
            if (el && document.activeElement === el) {
              const s = el.selectionStart ?? cur.length;
              const e = el.selectionEnd ?? cur.length;
              const next = cur.slice(0, s) + tok + cur.slice(e);
              onUpdate({ prompt: next });
              requestAnimationFrame(() => {
                const p = s + tok.length;
                el.selectionStart = el.selectionEnd = p;
                el.focus();
              });
            } else {
              onUpdate({ prompt: cur + tok });
            }
          }}
        />
        <div className="flex gap-2">
          <textarea
            ref={chatPromptRef}
            className="flex-1 bg-[#222222] text-gray-200 p-2.5 rounded border border-[#444] focus:outline-none focus:border-rose-500 resize-y"
            style={{
              fontSize: chatFontScaled,
              minHeight: fs(108),
              height: node.chatInputHeight ?? fs(152),
            }}
            value={node.prompt || ''}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder=""
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              const nextHeight = Math.max(fs(108), Math.round((e.currentTarget as HTMLTextAreaElement).offsetHeight));
              if (nextHeight !== (node.chatInputHeight ?? fs(152))) {
                onUpdate({ chatInputHeight: nextHeight });
              }
            }}
          />
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              onSendMessage();
            }}
            disabled={node.isGenerating || !node.prompt?.trim()}
            className="px-[52px] rounded bg-rose-600 hover:bg-rose-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white flex items-center justify-center"
          >
            <SendIcon size={fs(14)} />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ==================== 图片标注节点组件 ====================
interface AnnotationNodeContentProps {
  node: AnnotationNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<AnnotationNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
  onFullscreenImage?: (base64: string) => void;
}

function AnnotationNodeContent({ node, nodes, edges, eyedropperTargetNodeId, onEyedropperSelect, onUpdate, onCreateImageNode, onFullscreenImage }: AnnotationNodeContentProps) {
  // 计算链接到该节点的源图片
  const incomingEdges = edges.filter(e => e.targetId === node.id);
  const sourceNodes = incomingEdges
    .map(e => nodes.find(n => n.id === e.sourceId))
    .filter(Boolean) as CanvasNode[];
  const sourceImages = sourceNodes.flatMap(n => n.images || []).filter(img => img && img !== '');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'fillRect' | 'fillCircle' | 'crop'>('rect');
  const [currentColor, setCurrentColor] = useState('#ff6b6b');
  const [fillOpacity, setFillOpacity] = useState(0.45);
  const fillOpacityRef = useRef(0.45);
  const [currentFontSize, setCurrentFontSize] = useState(16);
  /** 裁切选区（画布坐标），等待确认 */
  const [cropPending, setCropPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropPendingRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    cropPendingRef.current = cropPending;
  }, [cropPending]);
  const cropDragRef = useRef<{ x: number; y: number; endX: number; endY: number } | null>(null);
  type CropAdjustMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
  const cropAdjustRef = useRef<{ mode: CropAdjustMode; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);

  const hitCropZone = (mx: number, my: number, r: { x: number; y: number; w: number; h: number }, margin = 10): CropAdjustMode | null => {
    const { x, y, w, h } = r;
    if (mx < x || mx > x + w || my < y || my > y + h) return null;
    const nl = mx - x <= margin;
    const nr = x + w - mx <= margin;
    const nt = my - y <= margin;
    const nb = y + h - my <= margin;
    if (nt && nl) return 'nw';
    if (nt && nr) return 'ne';
    if (nb && nl) return 'sw';
    if (nb && nr) return 'se';
    if (nt) return 'n';
    if (nb) return 's';
    if (nl) return 'w';
    if (nr) return 'e';
    return 'move';
  };

  const applyCropResize = (
    mode: CropAdjustMode,
    o: { x: number; y: number; w: number; h: number },
    dx: number,
    dy: number
  ): { x: number; y: number; w: number; h: number } => {
    switch (mode) {
      case 'move':
        return { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
      case 'se':
        return { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      case 'nw':
        return { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
      case 'ne':
        return { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
      case 'sw':
        return { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
      case 'n':
        return { x: o.x, y: o.y + dy, w: o.w, h: o.h - dy };
      case 's':
        return { x: o.x, y: o.y, w: o.w, h: o.h + dy };
      case 'w':
        return { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h };
      case 'e':
        return { x: o.x, y: o.y, w: o.w + dx, h: o.h };
    }
  };

  const clampCropRect = (
    r: { x: number; y: number; w: number; h: number },
    img: { x: number; y: number; w: number; h: number },
    minSide = 8
  ): { x: number; y: number; w: number; h: number } => {
    let { x, y, w, h } = r;
    w = Math.max(minSide, w);
    h = Math.max(minSide, h);
    x = Math.max(img.x, Math.min(x, img.x + img.w - minSide));
    y = Math.max(img.y, Math.min(y, img.y + img.h - minSide));
    if (x + w > img.x + img.w) x = img.x + img.w - w;
    if (y + h > img.y + img.h) y = img.y + img.h - h;
    if (x < img.x) x = img.x;
    if (y < img.y) y = img.y;
    w = Math.min(w, img.x + img.w - x);
    h = Math.min(h, img.y + img.h - y);
    return { x, y, w: Math.max(minSide, w), h: Math.max(minSide, h) };
  };
  const [tempAnnotation, setTempAnnotation] = useState<Partial<Annotation> | null>(null);
  // 文字输入状态
  const [isTextInputMode, setIsTextInputMode] = useState(false);
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 });
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  // 全屏标注状态
  const [isFullscreenAnnotation, setIsFullscreenAnnotation] = useState(false);
  const [fullscreenTool, setFullscreenTool] = useState<'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'fillRect' | 'fillCircle'>('rect');
  const [fullscreenColor, setFullscreenColor] = useState('#ff6b6b');
  const [fullscreenFillOpacity, setFullscreenFillOpacity] = useState(0.45);
  const fullscreenFillOpacityRef = useRef(0.45);
  const [fullscreenFontSize, setFullscreenFontSize] = useState(24);
  const [fullscreenAnnotations, setFullscreenAnnotations] = useState<Annotation[]>([]);
  const [fullscreenSelectedId, setFullscreenSelectedId] = useState<string | undefined>(undefined);
  const [isFsDrawing, setIsFsDrawing] = useState(false);
  const [fsTempAnnotation, setFsTempAnnotation] = useState<Partial<Annotation> | null>(null);
  const [isFsTextInputMode, setIsFsTextInputMode] = useState(false);
  const [fsTextInputPos, setFsTextInputPos] = useState({ x: 0, y: 0 });
  const [fsTextInputValue, setFsTextInputValue] = useState('');
  const fsTextInputRef = useRef<HTMLInputElement>(null);

  // 全屏绘制相关的 ref
  const fsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fsImageRef = useRef<{img: HTMLImageElement, x: number, y: number, w: number, h: number} | null>(null);
  const fsPenPointsRef = useRef<{x: number, y: number}[]>([]);
  const fsIsDrawingRef = useRef(false);
  const fsToolRef = useRef(fullscreenTool);
  const fsColorRef = useRef(fullscreenColor);
  const fsFontSizeRef = useRef(fullscreenFontSize);
  const fsTempRef = useRef<Partial<Annotation> | null>(null);
  const fsAnnotationsRef = useRef<Annotation[]>([]);

  // 全屏标注历史记录
  const [fsAnnotationHistory, setFsAnnotationHistory] = useState<Annotation[][]>([[]]);
  const fsHistoryIndexRef = useRef(0);
  const fsLastSavedHistoryRef = useRef<string>('');

  // 全屏撤销
  const fsUndo = () => {
    if (fsHistoryIndexRef.current > 0) {
      fsHistoryIndexRef.current--;
      const prevAnnotations = fsAnnotationHistory[fsHistoryIndexRef.current];
      fsLastSavedHistoryRef.current = JSON.stringify(prevAnnotations);
      setFullscreenAnnotations(prevAnnotations);
      fsAnnotationsRef.current = prevAnnotations;
    }
  };

  // 保存全屏标注状态到历史
  const fsSaveToHistory = (annots: Annotation[]) => {
    const currentJson = JSON.stringify(annots);
    if (currentJson !== fsLastSavedHistoryRef.current) {
      setFsAnnotationHistory(prev => {
        const newHistory = prev.slice(0, fsHistoryIndexRef.current + 1);
        newHistory.push([...annots]);
        fsHistoryIndexRef.current = newHistory.length - 1;
        if (newHistory.length > 50) {
          newHistory.shift();
          fsHistoryIndexRef.current--;
        }
        return newHistory;
      });
      fsLastSavedHistoryRef.current = currentJson;
    }
  };

  // 同步 ref
  useEffect(() => { fsToolRef.current = fullscreenTool; }, [fullscreenTool]);
  useEffect(() => { fsColorRef.current = fullscreenColor; }, [fullscreenColor]);
  useEffect(() => { fsFontSizeRef.current = fullscreenFontSize; }, [fullscreenFontSize]);
  useEffect(() => { fullscreenFillOpacityRef.current = fullscreenFillOpacity; }, [fullscreenFillOpacity]);
  useEffect(() => { fsAnnotationsRef.current = fullscreenAnnotations; }, [fullscreenAnnotations]);
  useEffect(() => { fsTempRef.current = fsTempAnnotation; }, [fsTempAnnotation]);
  useEffect(() => { fsIsDrawingRef.current = isFsDrawing; }, [isFsDrawing]);

  // 优先定义 sourceImage，因为其他 ref 会用到它
  const sourceImage = node.sourceImage ?? '';

  // 使用 ref 追踪绘制状态
  const isDrawingRef = useRef(false);
  const currentToolRef = useRef(currentTool);
  const currentColorRef = useRef(currentColor);
  const currentFontSizeRef = useRef(currentFontSize);
  const tempAnnotationRef = useRef<Partial<Annotation> | null>(null);
  const penPointsRef = useRef<{x: number, y: number}[]>([]);
  const sourceImageRef = useRef(sourceImage);

  // 图片缓存
  const imageCacheRef = useRef<{src: string, img: HTMLImageElement, x: number, y: number, w: number, h: number} | null>(null);

  // 撤销历史记录
  const [annotationHistory, setAnnotationHistory] = useState<Annotation[][]>([[]]);
  const historyIndexRef = useRef(0);
  const lastSavedHistoryRef = useRef<string>('');

  // 撤销
  const undo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const prevAnnotations = annotationHistory[historyIndexRef.current];
      lastSavedHistoryRef.current = JSON.stringify(prevAnnotations);
      onUpdate({ annotations: prevAnnotations });
    }
  };

  // 保存当前状态到历史
  const saveToHistory = (annots: Annotation[]) => {
    const currentJson = JSON.stringify(annots);
    if (currentJson !== lastSavedHistoryRef.current) {
      setAnnotationHistory(prev => {
        const newHistory = prev.slice(0, historyIndexRef.current + 1);
        newHistory.push([...annots]);
        historyIndexRef.current = newHistory.length - 1;
        // 限制历史记录数量
        if (newHistory.length > 50) {
          newHistory.shift();
          historyIndexRef.current--;
        }
        return newHistory;
      });
      lastSavedHistoryRef.current = currentJson;
    }
  };

  // 保持 ref 与 state 同步
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);
  useEffect(() => { currentFontSizeRef.current = currentFontSize; }, [currentFontSize]);
  useEffect(() => { fillOpacityRef.current = fillOpacity; }, [fillOpacity]);
  useEffect(() => { sourceImageRef.current = sourceImage; }, [sourceImage]);
  useEffect(() => { tempAnnotationRef.current = tempAnnotation; }, [tempAnnotation]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  const annotations = node.annotations ?? [];
  const selectedId = node.selectedAnnotationId;

  const colors = ['#ffffff', '#000000', '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#ff9ff3', '#54a0ff'];

  /** 嵌入画布上的图片显示区 → 全屏画布坐标 */
  const mapAnnotationEmbToFs = useCallback(
    (
      ann: Annotation,
      emb: { x: number; y: number; w: number; h: number },
      fs: { x: number; y: number; w: number; h: number }
    ): Annotation => {
      const sx = fs.w / emb.w;
      const sy = fs.h / emb.h;
      const mp = (px: number, py: number) => ({
        x: fs.x + (px - emb.x) * sx,
        y: fs.y + (py - emb.y) * sy,
      });
      const p0 = mp(ann.x, ann.y);
      const out: Annotation = {
        ...ann,
        x: p0.x,
        y: p0.y,
        strokeWidth: (ann.strokeWidth || 2) * Math.min(sx, sy),
      };
      if (ann.width != null) out.width = ann.width * sx;
      if (ann.height != null) out.height = ann.height * sy;
      if (ann.endX != null && ann.endY != null) {
        const pe = mp(ann.endX, ann.endY);
        out.endX = pe.x;
        out.endY = pe.y;
      }
      if (ann.points?.length) {
        out.points = ann.points.map((pt) => mp(pt.x, pt.y));
      }
      return out;
    },
    []
  );

  /** 全屏画布坐标 → 嵌入画布图片区坐标 */
  const mapAnnotationFsToEmb = useCallback(
    (
      ann: Annotation,
      fs: { x: number; y: number; w: number; h: number },
      emb: { x: number; y: number; w: number; h: number }
    ): Annotation => {
      const sx = emb.w / fs.w;
      const sy = emb.h / fs.h;
      const mp = (px: number, py: number) => ({
        x: emb.x + (px - fs.x) * sx,
        y: emb.y + (py - fs.y) * sy,
      });
      const p0 = mp(ann.x, ann.y);
      const out: Annotation = {
        ...ann,
        x: p0.x,
        y: p0.y,
        strokeWidth: Math.max(1, (ann.strokeWidth || 2) * Math.min(sx, sy)),
      };
      if (ann.width != null) out.width = ann.width * sx;
      if (ann.height != null) out.height = ann.height * sy;
      if (ann.endX != null && ann.endY != null) {
        const pe = mp(ann.endX, ann.endY);
        out.endX = pe.x;
        out.endY = pe.y;
      }
      if (ann.points?.length) {
        out.points = ann.points.map((pt) => mp(pt.x, pt.y));
      }
      return out;
    },
    []
  );

  const annotationsRef = useRef(annotations);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // 绘制箭头
  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) => {
    const headLen = 12;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  // 绘制单个标注
  const drawAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation, isSelected: boolean) => {
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.strokeWidth || 2;

    if (isSelected) {
      ctx.shadowColor = ann.color;
      ctx.shadowBlur = 10;
    }

    switch (ann.type) {
      case 'rect':
        ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(
          ann.x + (ann.width || 0) / 2,
          ann.y + (ann.height || 0) / 2,
          Math.abs((ann.width || 0) / 2),
          Math.abs((ann.height || 0) / 2),
          0, 0, Math.PI * 2
        );
        ctx.stroke();
        break;
      case 'arrow':
        drawArrow(ctx, ann.x, ann.y, ann.endX ?? ann.x, ann.endY ?? ann.y, ann.color);
        break;
      case 'text':
        ctx.font = `${ann.strokeWidth || 16}px sans-serif`;
        ctx.fillText(ann.text || '', ann.x, ann.y);
        break;
      case 'pen':
        if (ann.points && ann.points.length > 1) {
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = ann.strokeWidth || 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'fillRect': {
        const a = ann.fillOpacity ?? 0.45;
        ctx.globalAlpha = a;
        ctx.fillStyle = ann.color;
        ctx.fillRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
        ctx.setLineDash([]);
        break;
      }
      case 'fillCircle': {
        const a = ann.fillOpacity ?? 0.45;
        ctx.globalAlpha = a;
        ctx.fillStyle = ann.color;
        ctx.beginPath();
        ctx.ellipse(
          ann.x + (ann.width || 0) / 2,
          ann.y + (ann.height || 0) / 2,
          Math.abs((ann.width || 0) / 2),
          Math.abs((ann.height || 0) / 2),
          0, 0, Math.PI * 2
        );
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
    }

    ctx.shadowBlur = 0;
  };

  // 渲染画布
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘制背景
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imgSrc = sourceImageRef.current;
    if (imgSrc) {
      // 使用缓存或加载图片
      if (imageCacheRef.current && imageCacheRef.current.src === imgSrc) {
        const cached = imageCacheRef.current;
        ctx.drawImage(cached.img, cached.x, cached.y, cached.w, cached.h);
        renderAnnotations(ctx);
        drawCropOverlay(ctx, canvas.width, canvas.height);
      } else {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (canvas.width - w) / 2;
          const y = (canvas.height - h) / 2;
          imageCacheRef.current = { src: imgSrc, img, x, y, w, h };
          ctx.drawImage(img, x, y, w, h);
          renderAnnotations(ctx);
          drawCropOverlay(ctx, canvas.width, canvas.height);
        };
        img.src = `data:image/jpeg;base64,${imgSrc}`;
      }
    } else {
      // 显示占位文字
      ctx.fillStyle = '#444';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('导入图片后开始标注', canvas.width / 2, canvas.height / 2);
      renderAnnotations(ctx);
      drawCropOverlay(ctx, canvas.width, canvas.height);
    }
  };

  /** 裁切蒙层：拖拽中与待确认选区（保留原图可见） */
  const drawCropOverlay = (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    let cx: number;
    let cy: number;
    let cwid: number;
    let chgt: number;
    const drag = cropDragRef.current;
    if (drag) {
      cx = Math.min(drag.x, drag.endX);
      cy = Math.min(drag.y, drag.endY);
      cwid = Math.abs(drag.endX - drag.x);
      chgt = Math.abs(drag.endY - drag.y);
    } else if (cropPending) {
      cx = cropPending.x;
      cy = cropPending.y;
      cwid = cropPending.w;
      chgt = cropPending.h;
    } else {
      return;
    }
    if (cwid < 2 || chgt < 2) return;
    const cached = imageCacheRef.current;
    ctx.save();
    // 暗色遮罩盖住整张画布
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, cw, ch);
    // 裁切选区内先清再重绘原图部分，避免 clearRect 把底图擦掉
    ctx.clearRect(cx, cy, cwid, chgt);
    if (cached) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cwid, chgt);
      ctx.clip();
      ctx.drawImage(cached.img, cached.x, cached.y, cached.w, cached.h);
      ctx.restore();
    }
    // 选区淡蓝高亮
    ctx.fillStyle = 'rgba(100, 180, 255, 0.35)';
    ctx.fillRect(cx, cy, cwid, chgt);
    // 虚线边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cx, cy, cwid, chgt);
    ctx.setLineDash([]);
    ctx.restore();
  };

  // 渲染所有标注
  const renderAnnotations = (ctx: CanvasRenderingContext2D) => {
    // 绘制已保存的标注
    annotations.forEach((ann) => {
      drawAnnotation(ctx, ann, ann.id === selectedId);
    });

    // 绘制临时标注
    const temp = tempAnnotationRef.current;
    if (temp) {
      ctx.strokeStyle = temp.color || currentColorRef.current;
      ctx.fillStyle = temp.color || currentColorRef.current;
      ctx.lineWidth = temp.strokeWidth || 2;
      ctx.setLineDash([5, 5]);

      const x = temp.x ?? 0;
      const y = temp.y ?? 0;
      const endX = temp.endX ?? x;
      const endY = temp.endY ?? y;

      switch (temp.type) {
        case 'rect':
          ctx.strokeRect(x, y, endX - x, endY - y);
          break;
        case 'circle':
          ctx.beginPath();
          ctx.ellipse((x + endX) / 2, (y + endY) / 2, Math.abs((endX - x) / 2), Math.abs((endY - y) / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'fillRect': {
          const w = endX - x;
          const h = endY - y;
          const fa = fillOpacityRef.current;
          ctx.setLineDash([]);
          ctx.globalAlpha = fa;
          ctx.fillStyle = temp.color || currentColorRef.current;
          ctx.fillRect(x, y, w, h);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = temp.color || currentColorRef.current;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(x, y, w, h);
          break;
        }
        case 'fillCircle': {
          const fa = fillOpacityRef.current;
          ctx.setLineDash([]);
          ctx.globalAlpha = fa;
          ctx.fillStyle = temp.color || currentColorRef.current;
          ctx.beginPath();
          ctx.ellipse((x + endX) / 2, (y + endY) / 2, Math.abs((endX - x) / 2), Math.abs((endY - y) / 2), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = temp.color || currentColorRef.current;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          break;
        }
        case 'arrow':
          ctx.setLineDash([]);
          drawArrow(ctx, x, y, endX, endY, temp.color || currentColorRef.current);
          ctx.setLineDash([5, 5]);
          break;
        case 'text':
          ctx.font = `${temp.strokeWidth || 16}px sans-serif`;
          ctx.fillText(temp.text || '', x, y);
          break;
      }
      ctx.setLineDash([]);
    }

    // 绘制画笔轨迹
    const points = penPointsRef.current;
    if (points.length > 1) {
      ctx.strokeStyle = currentColorRef.current;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }
  };

  // 初始化 canvas（使用 canvas 自身 rect 确保 buffer 与显示一致，避免 object-fit 偏移）
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateCanvasSize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          imageCacheRef.current = null; // 重设缓存以匹配新尺寸
          renderCanvas();
        }
      }
    };

    updateCanvasSize();
    const ro = new ResizeObserver(() => updateCanvasSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 当图片或标注变化时重新渲染
  useEffect(() => {
    renderCanvas();
  }, [sourceImage, annotations, selectedId]);

  useEffect(() => {
    renderCanvas();
  }, [cropPending]);

  useEffect(() => {
    if (currentTool !== 'crop') {
      cropDragRef.current = null;
      setCropPending(null);
    }
  }, [currentTool]);

  // 获取图片在 canvas 中的显示区域
  const getImageDisplayRect = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageCacheRef.current) {
      // 如果没有缓存，根据 canvas 尺寸和图片比例计算
      if (!canvas) return null;
      // 默认使用 canvas 尺寸（假设图片填满）
      return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    }
    return {
      x: imageCacheRef.current.x,
      y: imageCacheRef.current.y,
      w: imageCacheRef.current.w,
      h: imageCacheRef.current.h,
    };
  }, []);

  // 检查坐标是否在图片显示区域内
  const isInImageArea = (x: number, y: number) => {
    const rect = getImageDisplayRect();
    if (!rect) return true; // 没有图片时允许绘制
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // 计算缩放系数，确保坐标与 canvas 逻辑尺寸对齐
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // 裁切：先处理拖动调整已有选区（需在「是否在图片内」判断之前，以便命中把手）
    if (currentToolRef.current === 'crop') {
      if (!sourceImageRef.current) return;
      const pending = cropPendingRef.current;
      if (pending) {
        const hit = hitCropZone(x, y, pending);
        if (hit) {
          cropAdjustRef.current = { mode: hit, startX: x, startY: y, orig: { ...pending } };
          isDrawingRef.current = true;
          setIsDrawing(true);
          return;
        }
        setCropPending(null);
      }
      if (!isInImageArea(x, y)) return;
      cropDragRef.current = { x, y, endX: x, endY: y };
      isDrawingRef.current = true;
      setIsDrawing(true);
      return;
    }

    // 检查是否在图片区域内
    if (!isInImageArea(x, y)) return;

    // 文字工具 - 进入输入模式
    if (currentToolRef.current === 'text') {
      setTextInputPos({ x, y });
      setTextInputValue('');
      setIsTextInputMode(true);
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    // 画笔工具
    if (currentToolRef.current === 'pen') {
      isDrawingRef.current = true;
      penPointsRef.current = [{ x, y }];
      // 直接画一个点
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = currentColorRef.current;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    // 矩形 / 圆形 / 箭头 / 填充
    isDrawingRef.current = true;
    const tt = currentToolRef.current;
    tempAnnotationRef.current = {
      type: tt as Annotation['type'],
      x,
      y,
      endX: x,
      endY: y,
      color: currentColorRef.current,
      strokeWidth: 2,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // 计算缩放系数
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x = (e.clientX - rect.left) * scaleX;
    let y = (e.clientY - rect.top) * scaleY;

    // 获取图片显示区域
    const imgRect = getImageDisplayRect();
    if (imgRect) {
      // 限制坐标在图片区域内
      x = Math.max(imgRect.x, Math.min(imgRect.x + imgRect.w, x));
      y = Math.max(imgRect.y, Math.min(imgRect.y + imgRect.h, y));
    }

    if (cropAdjustRef.current) {
      const d = cropAdjustRef.current;
      const dx = x - d.startX;
      const dy = y - d.startY;
      const raw = applyCropResize(d.mode, d.orig, dx, dy);
      const ir = getImageDisplayRect();
      if (ir) {
        setCropPending(clampCropRect(raw, ir));
      } else {
        setCropPending(raw);
      }
      renderCanvas();
      return;
    }

    const cropDrag = cropDragRef.current;
    if (cropDrag) {
      cropDrag.endX = x;
      cropDrag.endY = y;
      renderCanvas();
      return;
    }

    // 画笔 - 直接累加绘制
    if (currentToolRef.current === 'pen') {
      const points = penPointsRef.current;
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = currentColorRef.current;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        points.push({ x, y });
      }
      return;
    }

    // 其他工具 - 更新预览
    const temp = tempAnnotationRef.current;
    if (temp) {
      tempAnnotationRef.current = { ...temp, endX: x, endY: y };
      renderCanvas();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;

    if (cropAdjustRef.current) {
      cropAdjustRef.current = null;
      isDrawingRef.current = false;
      setIsDrawing(false);
      renderCanvas();
      return;
    }

    if (cropDragRef.current) {
      const d = cropDragRef.current;
      cropDragRef.current = null;
      isDrawingRef.current = false;
      setIsDrawing(false);
      const cx = Math.min(d.x, d.endX);
      const cy = Math.min(d.y, d.endY);
      const cw = Math.abs(d.endX - d.x);
      const ch = Math.abs(d.endY - d.y);
      if (cw > 5 && ch > 5) {
        setCropPending({ x: cx, y: cy, w: cw, h: ch });
      }
      renderCanvas();
      return;
    }

    // 画笔
    if (currentToolRef.current === 'pen') {
      const points = penPointsRef.current;
      if (points.length > 1) {
        const newAnnotation: Annotation = {
          id: `ann-${Date.now()}`,
          type: 'pen',
          x: points[0].x,
          y: points[0].y,
          points: [...points],
          color: currentColorRef.current,
          strokeWidth: 3,
        };
        const newAnnotations = [...annotations, newAnnotation];
        saveToHistory(annotations);
        onUpdate({ annotations: newAnnotations });
      }
      penPointsRef.current = [];
      isDrawingRef.current = false;
      setIsDrawing(false);
      renderCanvas();
      return;
    }

    // 其他工具
    const ann = tempAnnotationRef.current;
    if (ann) {
      if (ann.type === 'rect' || ann.type === 'circle' || ann.type === 'fillRect' || ann.type === 'fillCircle') {
        const width = Math.abs((ann.endX ?? 0) - (ann.x ?? 0));
        const height = Math.abs((ann.endY ?? 0) - (ann.y ?? 0));
        if (width > 5 && height > 5) {
          const topX = Math.min(ann.x ?? 0, ann.endX ?? 0);
          const topY = Math.min(ann.y ?? 0, ann.endY ?? 0);
          const next: Annotation = {
            id: `ann-${Date.now()}`,
            type: ann.type as 'rect' | 'circle' | 'fillRect' | 'fillCircle',
            x: topX,
            y: topY,
            width,
            height,
            color: ann.color || currentColorRef.current,
            strokeWidth: ann.strokeWidth || 2,
            ...(ann.type === 'fillRect' || ann.type === 'fillCircle' ? { fillOpacity: fillOpacityRef.current } : {}),
          };
          const newAnnotations = [...annotations, next];
          saveToHistory(annotations);
          onUpdate({ annotations: newAnnotations });
        }
      } else if (ann.type === 'arrow') {
        const dist = Math.hypot((ann.endX ?? 0) - (ann.x ?? 0), (ann.endY ?? 0) - (ann.y ?? 0));
        if (dist > 10) {
          const newAnnotations = [...annotations, ann as Annotation];
          saveToHistory(annotations);
          onUpdate({ annotations: newAnnotations });
        }
      }
    }

    isDrawingRef.current = false;
    tempAnnotationRef.current = null;
    setIsDrawing(false);
    setTempAnnotation(null);
    renderCanvas();
  };

  // ==================== 全屏标注功能 ====================

  // 全屏标注箭头绘制
  const drawFsArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) => {
    const headLen = 16;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  // 绘制单个全屏标注（支持拖拽中 width/height 为负或仅用 end 坐标）
  const drawFsAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation, isSelected: boolean) => {
    const fsNormBox = (a: Annotation) => {
      if (a.endX !== undefined && a.endY !== undefined) {
        const left = Math.min(a.x, a.endX);
        const top = Math.min(a.y, a.endY);
        return { left, top, w: Math.abs(a.endX - a.x), h: Math.abs(a.endY - a.y) };
      }
      const w = Math.abs(a.width || 0);
      const h = Math.abs(a.height || 0);
      const left = (a.width ?? 0) >= 0 ? a.x : a.x - w;
      const top = (a.height ?? 0) >= 0 ? a.y : a.y - h;
      return { left, top, w, h };
    };

    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.strokeWidth || 3;

    if (isSelected) {
      ctx.shadowColor = ann.color;
      ctx.shadowBlur = 15;
    }

    switch (ann.type) {
      case 'rect': {
        const b = fsNormBox(ann);
        ctx.strokeRect(b.left, b.top, b.w, b.h);
        break;
      }
      case 'circle': {
        const b = fsNormBox(ann);
        ctx.beginPath();
        ctx.ellipse(b.left + b.w / 2, b.top + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arrow':
        drawFsArrow(ctx, ann.x, ann.y, ann.endX ?? ann.x, ann.endY ?? ann.y, ann.color);
        break;
      case 'text':
        ctx.font = `bold ${ann.strokeWidth || 24}px sans-serif`;
        ctx.fillText(ann.text || '', ann.x, ann.y);
        break;
      case 'pen':
        if (ann.points && ann.points.length > 1) {
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = ann.strokeWidth || 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'fillRect': {
        const b = fsNormBox(ann);
        const a = ann.fillOpacity ?? 0.45;
        ctx.globalAlpha = a;
        ctx.fillStyle = ann.color;
        ctx.fillRect(b.left, b.top, b.w, b.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.left, b.top, b.w, b.h);
        break;
      }
      case 'fillCircle': {
        const b = fsNormBox(ann);
        const a = ann.fillOpacity ?? 0.45;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.ellipse(b.left + b.w / 2, b.top + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
    }
    ctx.shadowBlur = 0;
  };

  // 渲染全屏画布
  const renderFsCanvas = () => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (fsImageRef.current) {
      const cached = fsImageRef.current;
      ctx.drawImage(cached.img, cached.x, cached.y, cached.w, cached.h);
    }

    // 绘制已保存的标注
    fsAnnotationsRef.current.forEach((ann) => {
      drawFsAnnotation(ctx, ann, ann.id === fullscreenSelectedId);
    });
    // 绘制临时标注
    if (fsTempRef.current) {
      drawFsAnnotation(ctx, fsTempRef.current as Annotation, false);
    }
  };

  // 打开全屏标注模式（canvas 与坐标在 useEffect 中初始化）
  const openFullscreenAnnotation = () => {
    if (!sourceImage) {
      alert('请先导入图片');
      return;
    }
    setFullscreenSelectedId(node.selectedAnnotationId);
    setIsFullscreenAnnotation(true);
  };

  // 全屏打开后：挂载再测量尺寸、加载图片、嵌入坐标 → 全屏坐标
  useEffect(() => {
    if (!isFullscreenAnnotation || !sourceImage) return;

    let cancelled = false;
    let raf = 0;

    const tryLayout = () => {
    const canvas = fsCanvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent || parent.clientWidth < 1) {
        raf = requestAnimationFrame(tryLayout);
        return;
      }

      const run = () => {
        if (cancelled) return;
        const rw = Math.max(100, parent.clientWidth);
        const rh = Math.max(100, parent.clientHeight);
        canvas.width = rw;
        canvas.height = rh;

        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          const scale = Math.min(rw / img.width, rh / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const fx = (rw - w) / 2;
          const fy = (rh - h) / 2;
          fsImageRef.current = { img, x: fx, y: fy, w, h };

          const emb = imageCacheRef.current;
          const list = annotationsRef.current;
          const fs = fsImageRef.current;
          const mapped =
            emb && fs ? list.map((a) => mapAnnotationEmbToFs(a, emb, fs)) : list.map((a) => ({ ...a }));

          setFullscreenAnnotations(mapped);
          fsAnnotationsRef.current = mapped;
          setFsAnnotationHistory([mapped]);
          fsHistoryIndexRef.current = 0;
          fsLastSavedHistoryRef.current = JSON.stringify(mapped);
          renderFsCanvas();
        };
        img.src = `data:image/jpeg;base64,${sourceImage}`;
      };

      run();
    };

    tryLayout();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [isFullscreenAnnotation, sourceImage, mapAnnotationEmbToFs]);

  // 关闭全屏标注模式并应用标注，有标注时导出带标注的图片节点
  const closeFullscreenAnnotation = () => {
    const emb = imageCacheRef.current;
    const fs = fsImageRef.current;
    if (emb && fs && fullscreenAnnotations.length > 0 && sourceImage) {
      const mapped = fullscreenAnnotations.map((a) => mapAnnotationFsToEmb(a, fs, emb));
      onUpdate({ annotations: mapped });
      // 渲染标注到原图并创建图片节点
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const outCtx = tempCanvas.getContext('2d');
        if (!outCtx) return;
        outCtx.drawImage(img, 0, 0);
        const cssW = emb.w, cssH = emb.h;
        const ds = Math.min(cssW / img.width, cssH / img.height);
        const dW = img.width * ds, dH = img.height * ds;
        const dX = (cssW - dW) / 2, dY = (cssH - dH) / 2;
        const toImg = (ax, ay) => ({ x: (ax - dX) / ds, y: (ay - dY) / ds });
        mapped.forEach(ann => {
          const ip = toImg(ann.x, ann.y);
          let ox = ip.x, oy = ip.y, sw = 0, sh = 0;
          if (ann.endX !== undefined && ann.endY !== undefined) {
            const ep = toImg(ann.endX, ann.endY);
            ox = Math.min(ip.x, ep.x); oy = Math.min(ip.y, ep.y);
            sw = Math.abs(ep.x - ip.x); sh = Math.abs(ep.y - ip.y);
          } else { sw = (ann.width || 0) / ds; sh = (ann.height || 0) / ds; }
          outCtx.strokeStyle = ann.color; outCtx.fillStyle = ann.color;
          outCtx.lineWidth = Math.max(1, (ann.strokeWidth || 2) / ds);
          outCtx.lineCap = 'round'; outCtx.lineJoin = 'round';
          if (ann.type === 'rect') outCtx.strokeRect(ox, oy, sw, sh);
          else if (ann.type === 'circle') { outCtx.beginPath(); outCtx.ellipse(ox+sw/2, oy+sh/2, sw/2, sh/2, 0, 0, Math.PI*2); outCtx.stroke(); }
          else if (ann.type === 'fillRect') { outCtx.globalAlpha = ann.fillOpacity ?? 0.45; outCtx.fillRect(ox, oy, sw, sh); outCtx.globalAlpha = 1; outCtx.strokeStyle = ann.color; outCtx.lineWidth = Math.max(1, (ann.strokeWidth||2)*0.5/ds); outCtx.strokeRect(ox, oy, sw, sh); }
        });
        const base64 = tempCanvas.toDataURL('image/jpeg', 0.95).split(',')[1];
        onCreateImageNode([base64], node.x + node.width + 50, node.y);
      };
      img.src = 'data:image/jpeg;base64,' + sourceImage;
    } else if (emb && fs) {
      const mapped = fullscreenAnnotations.map((a) => mapAnnotationFsToEmb(a, fs, emb));
      onUpdate({ annotations: mapped });
    }
    fsImageRef.current = null;
    setIsFullscreenAnnotation(false);
  };

  // 全屏画布鼠标按下
  const handleFsMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tool = fsToolRef.current;

    if (tool === 'text') {
      setIsFsTextInputMode(true);
      setFsTextInputPos({ x, y });
      setFsTextInputValue('');
      setTimeout(() => fsTextInputRef.current?.focus(), 0);
      return;
    }

    setIsFsDrawing(true);
    fsIsDrawingRef.current = true;
    fsPenPointsRef.current = [{ x, y }];

    const newAnn: Partial<Annotation> = {
      id: `fsann-${Date.now()}`,
      type: tool,
      x,
      y,
      color: fsColorRef.current,
      strokeWidth: tool === 'text' ? fsFontSizeRef.current : 3,
      points: tool === 'pen' ? [{ x, y }] : undefined
    };
    setFsTempAnnotation(newAnn);
    fsTempRef.current = newAnn;
  };

  // 全屏画布鼠标移动
  const handleFsMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!fsIsDrawingRef.current) return;
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tool = fsToolRef.current;

    const current = fsTempRef.current;
    if (!current) return;

    if (tool === 'pen') {
      fsPenPointsRef.current.push({ x, y });
      const updated = { ...current, points: [...fsPenPointsRef.current] };
      setFsTempAnnotation(updated);
      fsTempRef.current = updated;
    } else {
      const updated = {
        ...current,
        width: x - (current.x || 0),
        height: y - (current.y || 0),
        endX: x,
        endY: y
      };
      setFsTempAnnotation(updated);
      fsTempRef.current = updated;
    }
    renderFsCanvas();
  };

  // 全屏画布鼠标释放
  const handleFsMouseUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!fsIsDrawingRef.current) return;
    const current = fsTempRef.current;
    const tool = fsToolRef.current;
    if (current) {
      let toAdd: Annotation | null = null;
      if (tool === 'pen') {
        const pts = fsPenPointsRef.current;
        if (pts.length > 1) {
          toAdd = {
            id: current.id || `fsann-${Date.now()}`,
            type: 'pen',
            x: pts[0].x,
            y: pts[0].y,
            points: [...pts],
            color: fsColorRef.current,
            strokeWidth: 4,
          };
        }
      } else if (tool === 'rect' || tool === 'circle' || tool === 'fillRect' || tool === 'fillCircle') {
        const x0 = current.x ?? 0;
        const y0 = current.y ?? 0;
        const x1 = current.endX ?? x0;
        const y1 = current.endY ?? y0;
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        if (w > 5 && h > 5) {
          toAdd = {
            id: current.id || `fsann-${Date.now()}`,
            type: tool as 'rect' | 'circle' | 'fillRect' | 'fillCircle',
            x: Math.min(x0, x1),
            y: Math.min(y0, y1),
            width: w,
            height: h,
            color: fsColorRef.current,
            strokeWidth: tool === 'fillRect' || tool === 'fillCircle' ? 2 : 3,
            ...(tool === 'fillRect' || tool === 'fillCircle' ? { fillOpacity: fullscreenFillOpacityRef.current } : {}),
          };
        }
      } else if (tool === 'arrow') {
        const dist = Math.hypot((current.endX ?? 0) - (current.x ?? 0), (current.endY ?? 0) - (current.y ?? 0));
        if (dist > 10) {
          toAdd = {
            id: current.id || `fsann-${Date.now()}`,
            type: 'arrow',
            x: current.x!,
            y: current.y!,
            endX: current.endX,
            endY: current.endY,
            color: fsColorRef.current,
            strokeWidth: 3,
          };
        }
      }

      if (toAdd) {
        const newAnnotations = [...fullscreenAnnotations, toAdd];
      setFullscreenAnnotations(newAnnotations);
      fsAnnotationsRef.current = newAnnotations;
      fsSaveToHistory(newAnnotations);
      }
    }
    fsIsDrawingRef.current = false;
    fsPenPointsRef.current = [];
    setFsTempAnnotation(null);
    fsTempRef.current = null;
    setIsFsDrawing(false);
    renderFsCanvas();
  };

  // 删除全屏标注
  const deleteFsAnnotation = (id: string) => {
    const newAnnotations = fullscreenAnnotations.filter(a => a.id !== id);
    setFullscreenAnnotations(newAnnotations);
    fsAnnotationsRef.current = newAnnotations;
    fsSaveToHistory(newAnnotations);
    if (fullscreenSelectedId === id) setFullscreenSelectedId(undefined);
    renderFsCanvas();
  };

  /** 按裁切选区导出为独立图片节点 */
  const confirmCrop = () => {
    if (!sourceImage || !cropPending) {
      alert('请先导入图片并拖出裁切区域');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x: cx, y: cy, w: cww, h: chh } = cropPending;
    const img = new Image();
    img.onload = () => {
      const cssWidth = canvas.width;
      const cssHeight = canvas.height;
      const displayScale = Math.min(cssWidth / img.width, cssHeight / img.height);
      const displayW = img.width * displayScale;
      const displayH = img.height * displayScale;
      const displayX = (cssWidth - displayW) / 2;
      const displayY = (cssHeight - displayH) / 2;

      const ix1 = Math.max(cx, displayX);
      const iy1 = Math.max(cy, displayY);
      const ix2 = Math.min(cx + cww, displayX + displayW);
      const iy2 = Math.min(cy + chh, displayY + displayH);
      const iw = Math.max(0, ix2 - ix1);
      const ih = Math.max(0, iy2 - iy1);
      if (iw < 2 || ih < 2) {
        alert('裁切区域与图片无交集，请重试');
        return;
      }
      const sx = (ix1 - displayX) / displayScale;
      const sy = (iy1 - displayY) / displayScale;
      const sw = iw / displayScale;
      const sh = ih / displayScale;

      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(sw));
      out.height = Math.max(1, Math.round(sh));
      const octx = out.getContext('2d');
      if (!octx) return;
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
      const base64 = out.toDataURL('image/jpeg', 0.95).split(',')[1];
      onCreateImageNode([base64], node.x + node.width + 50, node.y);
      setCropPending(null);
      cropDragRef.current = null;
      renderCanvas();
    };
    img.src = `data:image/jpeg;base64,${sourceImage}`;
  };

  // 确认标注并创建图片节点
  const confirmAnnotations = () => {
    if (!sourceImage || annotations.length === 0) {
      alert('请先导入图片并添加标注');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const outCtx = tempCanvas.getContext('2d');
      if (!outCtx) return;

      // 先绘制原图
      outCtx.drawImage(img, 0, 0);

      // 使用实际的 canvas 尺寸计算图片显示位置
      const cssWidth = canvas.width;
      const cssHeight = canvas.height;

      // 计算图片在 canvas 中的显示位置（与 renderCanvas 保持一致）
      const displayScale = Math.min(cssWidth / img.width, cssHeight / img.height);
      const displayW = img.width * displayScale;
      const displayH = img.height * displayScale;
      const displayX = (cssWidth - displayW) / 2;
      const displayY = (cssHeight - displayH) / 2;

      // 将标注从 canvas 逻辑坐标转换到原图坐标的辅助函数
      const toImageCoords = (annX: number, annY: number) => ({
        x: (annX - displayX) / displayScale,
        y: (annY - displayY) / displayScale
      });

      const boxTypes = ['rect', 'circle', 'fillRect', 'fillCircle'];

      annotations.forEach((ann) => {
        let scaledAnn: Annotation;

        if (ann.type === 'arrow') {
          const start = toImageCoords(ann.x, ann.y);
          const end = toImageCoords(ann.endX ?? ann.x, ann.endY ?? ann.y);
          scaledAnn = {
          ...ann,
            x: start.x,
            y: start.y,
            endX: end.x,
            endY: end.y,
            strokeWidth: Math.max(1, (ann.strokeWidth || 2) / displayScale),
          };
        } else if (ann.type === 'text') {
          const p = toImageCoords(ann.x, ann.y);
          scaledAnn = {
            ...ann,
            x: p.x,
            y: p.y,
            strokeWidth: Math.max(1, (ann.strokeWidth || 16) / displayScale),
          };
        } else if (ann.type === 'pen' && ann.points && ann.points.length > 0) {
          const scaledPoints = ann.points.map((pt) => toImageCoords(pt.x, pt.y));
          scaledAnn = {
            ...ann,
          points: scaledPoints,
            x: scaledPoints[0].x,
            y: scaledPoints[0].y,
            strokeWidth: Math.max(1, (ann.strokeWidth || 3) / displayScale),
          };
        } else if (boxTypes.includes(ann.type)) {
          const ip = toImageCoords(ann.x, ann.y);
          let ox = ip.x;
          let oy = ip.y;
          let sw: number;
          let sh: number;
          if (ann.endX !== undefined && ann.endY !== undefined) {
            const ep = toImageCoords(ann.endX, ann.endY);
            ox = Math.min(ip.x, ep.x);
            oy = Math.min(ip.y, ep.y);
            sw = Math.abs(ep.x - ip.x);
            sh = Math.abs(ep.y - ip.y);
          } else {
            sw = (ann.width ?? 0) / displayScale;
            sh = (ann.height ?? 0) / displayScale;
          }
          scaledAnn = {
            ...ann,
            x: ox,
            y: oy,
            width: sw,
            height: sh,
            strokeWidth: Math.max(1, (ann.strokeWidth || 2) / displayScale),
          };
        } else {
          const p = toImageCoords(ann.x, ann.y);
          scaledAnn = { ...ann, x: p.x, y: p.y };
        }

        // 直接绘制，不使用 drawAnnotation（避免坐标问题）
        outCtx.strokeStyle = scaledAnn.color;
        outCtx.fillStyle = scaledAnn.color;
        outCtx.lineWidth = scaledAnn.strokeWidth || 2;
        outCtx.lineCap = 'round';
        outCtx.lineJoin = 'round';

        switch (scaledAnn.type) {
          case 'rect':
            outCtx.strokeRect(scaledAnn.x, scaledAnn.y, scaledAnn.width || 0, scaledAnn.height || 0);
            break;
          case 'circle':
            outCtx.beginPath();
            outCtx.ellipse(
              scaledAnn.x + (scaledAnn.width || 0) / 2,
              scaledAnn.y + (scaledAnn.height || 0) / 2,
              Math.abs((scaledAnn.width || 0) / 2),
              Math.abs((scaledAnn.height || 0) / 2),
              0, 0, Math.PI * 2
            );
            outCtx.stroke();
            break;
          case 'fillRect': {
            const fa = scaledAnn.fillOpacity ?? 0.45;
            outCtx.globalAlpha = fa;
            outCtx.fillStyle = scaledAnn.color;
            outCtx.fillRect(scaledAnn.x, scaledAnn.y, scaledAnn.width || 0, scaledAnn.height || 0);
            outCtx.globalAlpha = 1;
            outCtx.strokeStyle = scaledAnn.color;
            outCtx.lineWidth = Math.max(1, (scaledAnn.strokeWidth || 2) * 0.5);
            outCtx.strokeRect(scaledAnn.x, scaledAnn.y, scaledAnn.width || 0, scaledAnn.height || 0);
            break;
          }
          case 'fillCircle': {
            const fa = scaledAnn.fillOpacity ?? 0.45;
            outCtx.globalAlpha = fa;
            outCtx.fillStyle = scaledAnn.color;
            outCtx.beginPath();
            outCtx.ellipse(
              scaledAnn.x + (scaledAnn.width || 0) / 2,
              scaledAnn.y + (scaledAnn.height || 0) / 2,
              Math.abs((scaledAnn.width || 0) / 2),
              Math.abs((scaledAnn.height || 0) / 2),
              0, 0, Math.PI * 2
            );
            outCtx.fill();
            outCtx.globalAlpha = 1;
            outCtx.strokeStyle = scaledAnn.color;
            outCtx.lineWidth = Math.max(1, (scaledAnn.strokeWidth || 2) * 0.5);
            outCtx.stroke();
            break;
          }
          case 'arrow':
            // 绘制箭头
            const fromX = scaledAnn.x;
            const fromY = scaledAnn.y;
            const toX = scaledAnn.endX ?? scaledAnn.x;
            const toY = scaledAnn.endY ?? scaledAnn.y;
            const headLen = Math.max(8, scaledAnn.strokeWidth * 3);
            const angle = Math.atan2(toY - fromY, toX - fromX);

            outCtx.beginPath();
            outCtx.moveTo(fromX, fromY);
            outCtx.lineTo(toX, toY);
            outCtx.stroke();

            outCtx.beginPath();
            outCtx.moveTo(toX, toY);
            outCtx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
            outCtx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
            outCtx.closePath();
            outCtx.fill();
            break;
          case 'text':
            outCtx.font = `${scaledAnn.strokeWidth || 16}px sans-serif`;
            outCtx.fillText(scaledAnn.text || '', scaledAnn.x, scaledAnn.y);
            break;
          case 'pen':
            if (scaledAnn.points && scaledAnn.points.length > 1) {
              outCtx.beginPath();
              outCtx.moveTo(scaledAnn.points[0].x, scaledAnn.points[0].y);
              for (let i = 1; i < scaledAnn.points.length; i++) {
                outCtx.lineTo(scaledAnn.points[i].x, scaledAnn.points[i].y);
              }
              outCtx.stroke();
            }
            break;
        }
      });

      const base64 = tempCanvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      onCreateImageNode([base64], node.x + node.width + 50, node.y);
    };
    img.src = `data:image/jpeg;base64,${sourceImage}`;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* 链接的参考图信息 */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#252525] border-b border-[#333] shrink-0" style={{ order: 3 }}>
        <span className="text-[10px] text-gray-400">参考图:</span>
        <span className="text-green-400 font-medium">{sourceImages.length} 张</span>
        <div className="flex gap-1 ml-2">
          {sourceImages.slice(0, 6).map((img, idx) => (
            <OptimizedImage
              key={idx}
              base64={img}
              maxSide={160}
              quality={0.72}
              alt={`参考图${idx + 1}`}
              className="w-8 h-8 object-cover rounded border border-[#444]"
            />
          ))}
          {sourceImages.length > 6 && (
            <span className="text-gray-500 flex items-center">+{sourceImages.length - 6}</span>
          )}
        </div>
        <button
          onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
          className={`ml-auto px-2 py-0.5 rounded text-white ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
          title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
        >
          <EyedropperIcon size={12} />
        </button>
      </div>

      {/* 标注画布：双击图片区域进入全屏标注（需已导入图片）；亦可点下方「全屏标注」 */}
      <div
        ref={containerRef}
        className={`relative flex-1 min-h-[160px] bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden ${!sourceImage ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${sourceImage ? 'cursor-crosshair' : ''}`}
          onPointerDown={(e) => {
            if (!sourceImage) return; // 无图片时允许拖动窗口
            e.stopPropagation();
            handleMouseDown(e);
          }}
          onPointerMove={(e) => {
            handleMouseMove(e);
          }}
          onPointerUp={handleMouseUp}
          onPointerLeave={handleMouseUp}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (sourceImage) openFullscreenAnnotation();
          }}
        />

        {/* 文字输入框 */}
        {isTextInputMode && (
          <input
            ref={textInputRef}
            type="text"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // 确认文字
                if (textInputValue.trim()) {
                  const newAnnotation: Annotation = {
                    id: `ann-${Date.now()}`,
                    type: 'text',
                    x: textInputPos.x,
                    y: textInputPos.y,
                    text: textInputValue.trim(),
                    color: currentColorRef.current,
                    strokeWidth: currentFontSizeRef.current,
                  };
                  const newAnnotations = [...annotations, newAnnotation];
                  saveToHistory(annotations);
                  onUpdate({ annotations: newAnnotations });
                }
                setIsTextInputMode(false);
                setTextInputValue('');
              } else if (e.key === 'Escape') {
                setIsTextInputMode(false);
                setTextInputValue('');
              }
            }}
            onBlur={() => {
              // 失焦时确认
              if (textInputValue.trim()) {
                const newAnnotation: Annotation = {
                  id: `ann-${Date.now()}`,
                  type: 'text',
                  x: textInputPos.x,
                  y: textInputPos.y,
                  text: textInputValue.trim(),
                  color: currentColorRef.current,
                  strokeWidth: currentFontSizeRef.current,
                };
                const newAnnotations = [...annotations, newAnnotation];
                saveToHistory(annotations);
                onUpdate({ annotations: newAnnotations });
              }
              setIsTextInputMode(false);
              setTextInputValue('');
            }}
            className="absolute bg-white/90 text-black px-2 py-1 rounded text-sm"
            style={{
              left: textInputPos.x,
              top: textInputPos.y - 24,
              minWidth: '100px',
              zIndex: 30,
              fontSize: currentFontSize,
              color: currentColor,
              border: `2px solid ${currentColor}`,
              outline: 'none',
            }}
            placeholder="输入文字..."
          />
        )}
      </div>

      {currentTool === 'crop' && sourceImage && (
        <p className="text-[10px] text-amber-400/90 px-1 shrink-0">
          {cropPending ? '已框选裁切区域，可点击下方确认或取消' : '在图片上按住拖拽框选裁切区域'}
        </p>
      )}
      {cropPending && (
        <div className="flex gap-1 shrink-0 px-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={confirmCrop}
            className="flex-1 py-1.5 px-2 rounded text-[10px] bg-amber-600 hover:bg-amber-500 text-white font-medium"
          >
            确认裁切并复制图片节点
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setCropPending(null);
              cropDragRef.current = null;
              renderCanvas();
            }}
            className="py-1.5 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
          >
            取消选区
          </button>
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-1 flex-wrap shrink-0">
        <span className="text-[10px] text-gray-400">工具:</span>
        {(['rect', 'circle', 'fillRect', 'fillCircle', 'arrow', 'pen', 'text', 'crop'] as const).map((tool) => (
          <button
            key={tool}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCurrentTool(tool)}
            className={`px-1.5 py-0.5 rounded text-[10px] ${currentTool === tool ? 'bg-blue-600 text-white' : 'bg-[#333] text-gray-400 hover:bg-[#444]'}`}
          >
            {tool === 'rect' ? '矩形' : tool === 'circle' ? '圆形' : tool === 'fillRect' ? '填矩形' : tool === 'fillCircle' ? '填椭圆' : tool === 'arrow' ? '箭头' : tool === 'pen' ? '画笔' : tool === 'text' ? '文字' : '裁切'}
          </button>
        ))}
      </div>

      {/* 颜色和字体大小 */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap" style={{ order: 2 }}>
        {/* 颜色选择 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">色:</span>
          <div className="flex gap-0.5">
            {colors.map((color) => (
              <button
                key={color}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setCurrentColor(color)}
                className={`w-5 h-5 rounded border-2 ${currentColor === color ? 'border-white' : color === '#ffffff' ? 'border-gray-500' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <input
            type="color"
            value={currentColor.length === 7 ? currentColor : '#ff6b6b'}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setCurrentColor(e.target.value)}
            className="w-7 h-5 rounded border border-[#555] cursor-pointer p-0 bg-transparent"
            title="自选颜色"
          />
        </div>

        {(currentTool === 'fillRect' || currentTool === 'fillCircle') && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400">不透明度:</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={fillOpacity}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setFillOpacity(Number(e.target.value))}
              className="w-20 accent-blue-500"
            />
            <span className="text-[10px] text-gray-500 w-7">{Math.round(fillOpacity * 100)}%</span>
          </div>
        )}

        {/* 字体大小 (仅文字工具显示) */}
        {currentTool === 'text' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">大小:</span>
            <select
              className="bg-[#222222] border border-[#444] rounded px-2 py-1 text-[10px] text-gray-300 outline-none focus:border-blue-500"
              value={currentFontSize}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setCurrentFontSize(Number(e.target.value))}
            >
              <option value="12">12</option>
              <option value="16">16</option>
              <option value="20">20</option>
              <option value="24">24</option>
              <option value="32">32</option>
              <option value="48">48</option>
            </select>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1 shrink-0" style={{ order: 4 }}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const base64 = (ev.target?.result as string).split(',')[1];
                  onUpdate({ sourceImage: base64 });
                };
                reader.readAsDataURL(file);
              }
            };
            input.click();
          }}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 flex items-center justify-center gap-1"
        >
          <ImageIcon size={10} /> 导入
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onUpdate({ annotations: [] })}
          className="py-1 px-2 rounded text-[10px] bg-red-900/50 hover:bg-red-800/50 text-red-300"
        >
          清除
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={undo}
          disabled={historyIndexRef.current <= 0}
          className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          title="撤销上一步 (Ctrl+Z)"
        >
          撤销
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { if (sourceImage && onFullscreenImage) onFullscreenImage(sourceImage); }}
          disabled={!sourceImage}
          className="py-1 px-2 rounded text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          title={sourceImage ? '最大化查看图片（仅看图，不含标注工具）' : '请先导入图片'}
        >
          <FullscreenIcon size={10} /> 最大化
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={openFullscreenAnnotation}
          disabled={!sourceImage}
          className="py-1 px-2 rounded text-[10px] bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          title={sourceImage ? '全屏标注（也可双击上方画布）' : '请先导入图片后再全屏标注'}
        >
          <FullscreenIcon size={10} /> 全屏标注
        </button>
      </div>

      {/* 确认标注按钮 */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={confirmAnnotations}
        disabled={!sourceImage || annotations.length === 0}
        className="w-full py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 shrink-0"
      >
        确认标注 ({annotations.length})
      </button>

      {/* 标注列表 */}
      {annotations.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto shrink-0">
          {annotations.map((ann) => (
            <button
              key={ann.id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onUpdate({ selectedAnnotationId: ann.id })}
              className={`px-2 py-0.5 rounded text-[10px] ${selectedId === ann.id ? 'ring-2 ring-white' : ''}`}
              style={{ backgroundColor: ann.color + '33', color: ann.color }}
            >
              {ann.type === 'text'
                ? ann.text?.slice(0, 10)
                : ann.type === 'pen'
                  ? '画笔'
                  : ann.type === 'fillRect'
                    ? '填矩形'
                    : ann.type === 'fillCircle'
                      ? '填椭圆'
                      : ann.type}
            </button>
          ))}
        </div>
      )}

      {/* 全屏标注模态框（Portal 到 body 以脱离 CSS transform 层，否则 fixed inset-0 会塌陷） */}
      {isFullscreenAnnotation && createPortal(
        <div
          className="fixed inset-0 z-[2000] bg-black/95 flex flex-col"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeFullscreenAnnotation();
            if (e.ctrlKey && e.key === 'z') {
              e.preventDefault();
              fsUndo();
            }
          }}
          tabIndex={0}
        >
          {/* 全屏工具栏 */}
          <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border-b border-[#333]">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium">全屏标注模式</span>
              <span className="text-gray-400 text-xs">({fullscreenAnnotations.length} 个标注)</span>
            </div>
            <div className="flex items-center gap-2">
              {/* 工具选择 */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-gray-400 text-xs">工具:</span>
                {(['rect', 'circle', 'fillRect', 'fillCircle', 'arrow', 'pen', 'text'] as const).map((tool) => (
                  <button
                    key={tool}
                    onClick={() => setFullscreenTool(tool)}
                    className={`px-3 py-1.5 rounded text-xs ${fullscreenTool === tool ? 'bg-blue-600 text-white' : 'bg-[#333] text-gray-300 hover:bg-[#444]'}`}
                  >
                    {tool === 'rect' ? '矩形' : tool === 'circle' ? '圆形' : tool === 'fillRect' ? '填矩形' : tool === 'fillCircle' ? '填椭圆' : tool === 'arrow' ? '箭头' : tool === 'pen' ? '画笔' : '文字'}
                  </button>
                ))}
              </div>

              {/* 颜色选择 */}
              <div className="flex items-center gap-1 ml-4 flex-wrap">
                <span className="text-gray-400 text-xs">颜色:</span>
                <div className="flex gap-1">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFullscreenColor(color)}
                      className={`w-6 h-6 rounded border-2 ${fullscreenColor === color ? 'border-white' : color === '#ffffff' ? 'border-gray-500' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={fullscreenColor.length === 7 ? fullscreenColor : '#ff6b6b'}
                  onChange={(e) => setFullscreenColor(e.target.value)}
                  className="w-8 h-7 rounded border border-gray-500 cursor-pointer"
                  title="自选颜色"
                />
              </div>

              {(fullscreenTool === 'fillRect' || fullscreenTool === 'fillCircle') && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-gray-400 text-xs">填充不透明度:</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={fullscreenFillOpacity}
                    onChange={(e) => setFullscreenFillOpacity(Number(e.target.value))}
                    className="w-28 accent-blue-500"
                  />
                  <span className="text-gray-400 text-xs w-8">{Math.round(fullscreenFillOpacity * 100)}%</span>
                </div>
              )}

              {/* 字体大小 */}
              {fullscreenTool === 'text' && (
                <div className="flex items-center gap-1 ml-4">
                  <span className="text-gray-400 text-xs">大小:</span>
                  <select
                    className="bg-[#333] border border-[#444] rounded px-2 py-1 text-xs text-white"
                    value={fullscreenFontSize}
                    onChange={(e) => setFullscreenFontSize(Number(e.target.value))}
                  >
                    <option value="16">16</option>
                    <option value="20">20</option>
                    <option value="24">24</option>
                    <option value="32">32</option>
                    <option value="48">48</option>
                    <option value="64">64</option>
                    <option value="80">80</option>
                  </select>
                </div>
              )}

              {/* 操作按钮 */}
              <button
                onClick={fsUndo}
                disabled={fsHistoryIndexRef.current <= 0}
                className="px-3 py-1.5 rounded text-xs bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="撤销上一步 (Ctrl+Z)"
              >
                撤销
              </button>
              <button
                onClick={() => {
                  setFullscreenAnnotations([]);
                  setFullscreenSelectedId(undefined);
                  fsSaveToHistory([]);
                }}
                className="ml-2 px-3 py-1.5 rounded text-xs bg-red-900 hover:bg-red-800 text-red-300"
              >
                清除全部
              </button>
              <button
                onClick={closeFullscreenAnnotation}
                className="px-4 py-2 rounded text-sm font-bold bg-green-600 hover:bg-green-500 text-white"
              >
                确认标注
              </button>
              <button
                onClick={closeFullscreenAnnotation}
                className="px-4 py-1.5 rounded text-xs bg-gray-600 hover:bg-gray-500 text-white"
              >
                退出全屏
              </button>
            </div>
          </div>

          {/* 全屏画布 */}
          <div className="flex-1 relative overflow-hidden">
            <canvas
              ref={fsCanvasRef}
              className="cursor-crosshair"
              style={{ width: '100%', height: '100%' }}
              onPointerDown={handleFsMouseDown}
              onPointerMove={handleFsMouseMove}
              onPointerUp={handleFsMouseUp}
              onPointerLeave={handleFsMouseUp}
            />

            {/* 全屏文字输入框 */}
            {isFsTextInputMode && (
              <input
                ref={fsTextInputRef}
                type="text"
                value={fsTextInputValue}
                onChange={(e) => setFsTextInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && fsTextInputValue.trim()) {
                    const newAnn: Annotation = {
                      id: `fsann-${Date.now()}`,
                      type: 'text',
                      x: fsTextInputPos.x,
                      y: fsTextInputPos.y,
                      text: fsTextInputValue.trim(),
                      color: fsColorRef.current,
                      strokeWidth: fsFontSizeRef.current,
                    };
                    const newAnnotations = [...fullscreenAnnotations, newAnn];
                    setFullscreenAnnotations(newAnnotations);
                    fsAnnotationsRef.current = newAnnotations;
                    fsSaveToHistory(newAnnotations);
                    setIsFsTextInputMode(false);
                    setFsTextInputValue('');
                    renderFsCanvas();
                  } else if (e.key === 'Escape') {
                    setIsFsTextInputMode(false);
                    setFsTextInputValue('');
                  }
                }}
                onBlur={() => {
                  if (fsTextInputValue.trim()) {
                    const newAnn: Annotation = {
                      id: `fsann-${Date.now()}`,
                      type: 'text',
                      x: fsTextInputPos.x,
                      y: fsTextInputPos.y,
                      text: fsTextInputValue.trim(),
                      color: fsColorRef.current,
                      strokeWidth: fsFontSizeRef.current,
                    };
                    const newAnnotations = [...fullscreenAnnotations, newAnn];
                    setFullscreenAnnotations(newAnnotations);
                    fsAnnotationsRef.current = newAnnotations;
                    fsSaveToHistory(newAnnotations);
                  }
                  setIsFsTextInputMode(false);
                  setFsTextInputValue('');
                  renderFsCanvas();
                }}
                className="absolute bg-white/90 text-black px-3 py-2 rounded-lg text-lg"
                style={{
                  left: fsTextInputPos.x,
                  top: fsTextInputPos.y - 32,
                  minWidth: '150px',
                  zIndex: 30,
                  fontSize: fullscreenFontSize,
                  color: fullscreenColor,
                  border: `2px solid ${fullscreenColor}`,
                  outline: 'none',
                }}
                placeholder="输入文字..."
              />
            )}
          </div>

          {/* 全屏标注列表 */}
          {fullscreenAnnotations.length > 0 && (
            <div className="p-3 bg-[#1a1a1a] border-t border-[#333] max-h-32 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {fullscreenAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${fullscreenSelectedId === ann.id ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: ann.color + '33', color: ann.color }}
                  >
                    <span>{ann.type === 'text' ? ann.text?.slice(0, 15) : ann.type === 'pen' ? '画笔' : ann.type}</span>
                    <button
                      onClick={() => deleteFsAnnotation(ann.id)}
                      className="ml-1 hover:text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// 绘制所有标注（用于导出）
function drawAllAnnotationsExport(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  selectedId: string | undefined,
  defaultColor: string
) {
  annotations.forEach((ann) => {
    const isSelected = ann.id === selectedId;
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.strokeWidth || 2;

    if (isSelected) {
      ctx.shadowColor = ann.color;
      ctx.shadowBlur = 10;
    }

    switch (ann.type) {
      case 'rect':
        ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(
          ann.x + (ann.width || 0) / 2,
          ann.y + (ann.height || 0) / 2,
          Math.abs((ann.width || 0) / 2),
          Math.abs((ann.height || 0) / 2),
          0, 0, Math.PI * 2
        );
        ctx.stroke();
        break;
      case 'arrow':
        drawArrowExport(ctx, ann.x, ann.y, ann.endX ?? ann.x, ann.endY ?? ann.y);
        break;
      case 'text':
        ctx.font = '14px sans-serif';
        ctx.fillText(ann.text || '', ann.x, ann.y);
        break;
      case 'pen':
        if (ann.points && ann.points.length > 1) {
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = ann.strokeWidth || 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
        }
        break;
    }

    ctx.shadowBlur = 0;
  });
}

// 绘制箭头
function drawArrowExport(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const headLen = 12;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// 连线组件 - 支持点击删除和长按拖拽取消
interface EdgePathProps {
  edgeId: string;
  startX: number;
  startY: number;
  cp1X: number;
  cp1Y: number;
  cp2X: number;
  cp2Y: number;
  endX: number;
  endY: number;
  isActive: boolean;
  onDelete: (id: string) => void;
}

function EdgePath({ edgeId, startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY, isActive, onDelete }: EdgePathProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isNearStart, setIsNearStart] = useState(false);
  const [isNearEnd, setIsNearEnd] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();

    // 检查是否靠近起点或终点
    const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;

    // 计算鼠标在 SVG 坐标系中的位置
    const svg = (e.target as SVGElement).ownerSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // 检查是否靠近起点或终点
    const nearStart = Math.hypot(svgP.x - startX, svgP.y - startY) < 20;
    const nearEnd = Math.hypot(svgP.x - endX, svgP.y - endY) < 20;
    setIsNearStart(nearStart);
    setIsNearEnd(nearEnd);

    // 长按计时器
    longPressTimerRef.current = window.setTimeout(() => {
      setIsDragging(true);
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    }, 300);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const svg = (e.target as SVGElement).ownerSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // 拖拽时动态更新终点位置（通过状态传递）
    // 这里我们发送一个自定义事件来更新
    window.dispatchEvent(new CustomEvent('edge-drag', {
      detail: { edgeId, x: svgP.x, y: svgP.y, nearStart: isNearStart, nearEnd: isNearEnd }
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isDragging) {
      setIsDragging(false);
      // 拖拽结束时，检查是否远离了节点，如果是则删除连线
      const svg = (e.target as SVGElement).ownerSVGElement;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

      // 如果拖拽到了远离节点的位置，删除连线
      if (isNearStart) {
        const distFromStart = Math.hypot(svgP.x - startX, svgP.y - startY);
        if (distFromStart > 100) {
          onDelete(edgeId);
        }
      } else if (isNearEnd) {
        const distFromEnd = Math.hypot(svgP.x - endX, svgP.y - endY);
        if (distFromEnd > 100) {
          onDelete(edgeId);
        }
      }

      // 重置连线位置
      window.dispatchEvent(new CustomEvent('edge-drag-end', { detail: { edgeId } }));
    }
  };

  return (
    <>
      {/* 可见的连线 */}
      <path
        d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
        stroke={isActive ? "#60a5fa" : "#4a5568"}
        strokeWidth={isActive ? "3" : "2"}
        fill="none"
        markerEnd={isActive ? "url(#arrowhead-active)" : "url(#arrowhead)"}
        filter={isActive ? "url(#glow-active)" : undefined}
        opacity={isActive ? 1 : 0.7}
        className={`transition-all duration-200 ${isDragging ? 'stroke-red-400' : isActive ? '' : 'hover:stroke-red-400'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: 'pointer' }}
      />
      {/* 不可见的宽线用于检测 */}
      <path
        d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
        stroke="transparent"
        strokeWidth="16"
        fill="none"
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => onDelete(edgeId)}
      />
    </>
  );
}
