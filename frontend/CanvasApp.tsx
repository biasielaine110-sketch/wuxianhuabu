import React, { lazy, Suspense, useState, useRef, useCallback, useEffect, useLayoutEffect, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { CanvasNode, Edge, Tool, NodeType, PanoramaNode, GridSplitNode, GridMergeNode, PanoramaT2iNode, Director3DNode, ChatNode, CanvasMode, AuditImage } from './types';
import { HeavyNodeFallback } from './canvas/HeavyNodeFallback';

const AuditModeCanvasHostLazy = lazy(() =>
  import('./canvas/AuditModeCanvasHost').then((m) => ({ default: m.AuditModeCanvasHost }))
);
const CanvasProjectModalLazy = lazy(() =>
  import('./canvas/CanvasProjectModal').then((m) => ({ default: m.CanvasProjectModal }))
);
const CanvasSettingsModalLazy = lazy(() =>
  import('./canvas/CanvasSettingsModal').then((m) => ({ default: m.CanvasSettingsModal }))
);
import { clearCanvasThumbnailCache } from './canvas/thumbnailCache';
import { ThumbResolutionControl } from './canvas/ThumbResolutionControl';
import {
  AnnotationIcon,
  AudioIcon,
  BoxSelectIcon,
  CopyIcon,
  Director3DIcon,
  DownloadIcon,
  EyedropperIcon,
  FullscreenIcon,
  GridIcon,
  GridMergeIcon,
  HandIcon,
  ImageIcon,
  KeyIcon,
  MessageIcon,
  MousePointerIcon,
  PanoramaIcon,
  SettingsIcon,
  TextIcon,
  VideoIcon,
  WandIcon,
  WidePanoramaIcon,
  XIcon,
} from './canvas/canvasIcons';
import { defaultCanvasImageModel } from './canvas/canvasModelUtils';
import { loadChatPromptPresets } from './canvas/loadChatPromptPresets';
import { CanvasStage } from './canvas/CanvasStage';
import { CanvasShortcutsPanel } from './canvas/CanvasShortcutsPanel';
import { useCanvasSettingsPanelState } from './canvas/useCanvasSettingsPanelState';
import { INITIAL_PROMPT_PRESETS_BASE } from './canvas/initialPromptPresets';
import { isStoryboardPreset } from './canvas/promptPresetCatalog';
import { fullscreenImageDisplaySrc } from './canvas/fullscreenImageUtils';
import { useCanvasFullscreenImage } from './canvas/useCanvasFullscreenImage';
const CanvasFullscreenImageModalLazy = lazy(() =>
  import('./canvas/CanvasFullscreenImageModal').then((m) => ({ default: m.CanvasFullscreenImageModal }))
);
import { useLazyCanvasGeneration } from './canvas/useLazyCanvasGeneration';
import { useCanvasInteractionHandlers } from './canvas/useCanvasInteractionHandlers';
import { useCanvasGlobalPointerEvents } from './canvas/useCanvasGlobalPointerEvents';
import { useLazyCanvasKeyboardShortcuts } from './canvas/useLazyCanvasKeyboardShortcuts';
import { useCanvasProjectLibrary } from './canvas/useCanvasProjectLibrary';
import { CanvasDraftDiskModal } from './canvas/CanvasDraftDiskModal';
import { INPUT_NODE_TYPES, CANVAS_HISTORY_SKIP_PAYLOAD_CHARS } from './canvas/canvasConstants';
import { computeNodeResizeFromPointer } from './canvas/canvasNodeResizeUtils';
import { estimateCanvasBase64PayloadChars, canvasHistoryMaxSteps } from './canvas/canvasHistoryPayloadUtils';
import { revokeNodeBlobUrls } from './canvas/canvasBlobUrlRegistry';
import { buildCanvasNodeRenderOverlay } from './canvas/buildCanvasNodeRenderOverlay';
import { useLazyRenderCanvasNode } from './canvas/useLazyRenderCanvasNode';
import {
  projectDraftDisplayName,
  projectDraftEditSeed,
} from './canvas/projectDraftUtils';
import { CanvasBackground } from './canvas/CanvasBackground';
import { pendingHomeChatRef } from './canvas/pendingHomeChat';
import { nodeLayoutKey } from './canvas/edgeUtils';
import type { DragPreview, ResizePreview } from './canvas/canvasEdgeGeometry';
import { resolveNodeGeometry } from './canvas/canvasEdgeGeometry';
import { hideDraftEdgePath, showDraftEdgePath } from './canvas/canvasDraftEdgeDom';
import {
  buildStructuralHistoryKey,
  buildPromptHistoryKey,
  HISTORY_DEBOUNCE_STRUCTURAL_MS,
  HISTORY_DEBOUNCE_PROMPT_MS,
} from './canvas/canvasHistoryPolicy';
import { CanvasMinimapHost } from './canvas/CanvasMinimapHost';
import { CanvasZoomControl } from './canvas/CanvasZoomControl';
import { CanvasEyedropperOverlay } from './canvas/CanvasEyedropperOverlay';
import { applyCanvasTransformDom, patchCanvasViewportRef } from './canvas/canvasTransformDom';
import {
  applyNodeDragPreview,
  clearNodeDragPreview,
  clearNodeGeometryPreview,
  readNodeGeometryFromDom,
} from './canvas/canvasNodeDragDom';
import { clearEdgeGeometryPreviews } from './canvas/canvasEdgeDragDom';
import { buildSpacedImageNodes, buildSpacedImageNodesFromLists, buildStackedImageNodes, SPAWNED_IMAGE_NODE_HEIGHT, SPAWNED_IMAGE_NODE_WIDTH } from './canvas/spawnImageNodes';
import { resolveCopyToImageOptions, type CopyToImageLayout, type CopyToImageOptions } from './canvas/copyToImageOptions';
import {
  stripImagesFromNodes,
  mergeHistoryNodesWithCurrentImages,
  type CanvasHistoryEntry,
} from './canvas/canvasHistoryUtils';
import { buildNodeMediaOffloadPatch, buildMediaOffloadScanKey, nodeNeedsMediaOffload } from './services/canvasAssetSync';
import { revokeNodeCanvasAssets } from './services/canvasAssetCleanup';
import { imageSrcToRawBase64 } from './services/canvasAssetResolver';
import {
  buildMoveNodesCommand,
  reverseCanvasCommand,
  CANVAS_COMMAND_STACK_MAX,
  type CanvasCommand,
} from './canvas/canvasCommands';
import { DEFAULT_CANVAS_VIEW_SCALE, useCanvasStore, syncCanvasStoreToRefs } from './stores/canvasStore';
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
  getCodesonlineSavedKey,
  getCodesonlineChatSavedKey,
  setCodesonlineChatKey,
  getJunlanSavedKey,
  migrateAiSettingsIfLegacy,
  persistAiSettings,
  getAiidBaseUrl,
  getAiidSavedKey,
} from './services/aiSettings';
import { saveProjectLibrary } from './services/projectPersistence';
import { useJimengAuth } from './integrations/jimeng/jimengAuthContext';
import type { CanvasNodeRenderState } from './canvas/canvasNodeRenderState';
import { useSyncRenderStateOverlay } from './canvas/useSyncRenderStateOverlay';
import {
  isGptImage2CanvasModelId,
  isManxueGeminiImageModel,
  isManxueGptImage2Model,
} from './canvas/canvasModelUtils';
import {
  getNodePrimaryImageRef,
  collectCopyableImageRefsFromNode,
  getNodePrimaryCopyRef,
  imageRefToSingleImageFields,
  resolveImageProviderNodes,
  singleImageFieldsMatch,
} from './referenceSlots';
import {
  saveImageDownload,
  saveVideoDownloadFromUrl,
} from './services/downloadPathSettings';

export type CanvasAppProps = {
  onBackToHome: () => void;
};

export function CanvasApp({ onBackToHome }: CanvasAppProps) {
  // --- Canvas state（Zustand：App 仅持有 setter，渲染订阅在 CanvasStage） ---
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setTransform = useCanvasStore((s) => s.setTransform);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const setDraggingNodeId = useCanvasStore((s) => s.setDraggingNodeId);
  const setResizingNodeId = useCanvasStore((s) => s.setResizingNodeId);
  const setNodeResizePreview = useCanvasStore((s) => s.setNodeResizePreview);
  const setEyedropperTargetNodeId = useCanvasStore((s) => s.setEyedropperTargetNodeId);
  const setEditingTextNodeIds = useCanvasStore((s) => s.setEditingTextNodeIds);
  const setImportTargetNodeId = useCanvasStore((s) => s.setImportTargetNodeId);
  const setTextNodeFontSize = useCanvasStore((s) => s.setTextNodeFontSize);
  const resetCanvas = useCanvasStore((s) => s.resetCanvas);
  // 懒加载优化：跟踪视口尺寸和画布容器引用
  const viewportRef = useRef({ width: typeof window !== 'undefined' ? window.innerWidth : 1920, height: typeof window !== 'undefined' ? window.innerHeight : 1080 });
  const canvasViewportRef = useRef({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));
  const [viewportCullTick, setViewportCullTick] = useState(0);
  const viewportCullRafRef = useRef<number | null>(null);
  useEffect(() => {
    const updateViewport = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const next = rect
        ? { width: rect.width, height: rect.height }
        : { width: window.innerWidth, height: window.innerHeight };
      viewportRef.current = next;
      setViewportSize(next);
      canvasViewportRef.current.width = next.width;
      canvasViewportRef.current.height = next.height;
    };
    updateViewport();
    const obs = new ResizeObserver(updateViewport);
    if (containerRef.current) obs.observe(containerRef.current);
    window.addEventListener('resize', updateViewport);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
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
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const resizePreviewRef = useRef<ResizePreview | null>(null);
  const [, setResizePreview] = useState<ResizePreview | null>(null);
  const draftEdgePathRef = useRef<SVGPathElement>(null);

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

  const transformRef = useRef(useCanvasStore.getState().transform);
  const nodesRef = useRef(useCanvasStore.getState().nodes);

  const fullscreen = useCanvasFullscreenImage(nodesRef);
  const {
    fullscreenImage,
    setFullscreenImage,
    fullscreenNodeId,
    fullscreenImageIdx,
    fsTransform,
    setFsTransform,
    fsContextMenu,
    setFsContextMenu,
    openFullscreenImage,
    openFullscreenFromBase64,
    fsNavigate,
    closeFullscreen,
    handleFsWheel,
    handleFsPointerDown,
    imageTotal,
  } = fullscreen;

  const edgesRef = useRef(useCanvasStore.getState().edges);
  const projectLibrary = useCanvasProjectLibrary({
    setNodes,
    setEdges,
    setTransform,
    setAuditImages,
    nodesRef,
    edgesRef,
    transformRef,
    auditImagesRef,
  });
  const {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    showProjectModal,
    setShowProjectModal,
    saveSuccessMsg,
    setSaveSuccessMsg,
    projectExportMenuOpen,
    setProjectExportMenuOpen,
    projectStoreReady,
    pendingDefaultViewportRef,
    autosaveIntervalMin,
    draftNameInput,
    setDraftNameInput,
    draftStoragePathInput,
    setDraftStoragePathInput,
    centerTitleEditValue,
    setCenterTitleEditValue,
    skipCenterRenameBlurRef,
    persistWarningShownRef,
    lastJsonFilename,
    draftDiskModal,
    setDraftDiskModal,
    projectImportInputRef,
    projectsRef,
    activeProjectIdRef,
    createNewProject,
    saveCurrentProject,
    switchProject,
    deleteProject,
    handleExportProjectJson,
    handleExportProjectZip,
    handleImportProjectFile,
    handleApplyDraftTitle,
    handleApplyDraftStoragePath,
    handleAutosaveIntervalChange,
    cancelDraftDiskModal,
    confirmDraftDiskModal,
    openProjectLocationInfo,
    projectSnapshotForJsonExport,
    handleSaveDraftJsonSaveAs,
    commitCenterProjectRename,
    flushPendingProjectWrites,
  } = projectLibrary;


  const selectedIdsRef = useRef(useCanvasStore.getState().selectedIds);
  const canvasTransformLayerRef = useRef<HTMLDivElement>(null);
  const edgesSvgRef = useRef<SVGSVGElement>(null);
  const canvasBgRef = useRef<HTMLDivElement>(null);
  const wheelTransformCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasBgStyleRef = useRef<'dots' | 'grid' | 'none'>('dots');
  useEffect(() => {
    const syncStoreRefs = () => {
      syncCanvasStoreToRefs({ nodesRef, edgesRef, transformRef, selectedIdsRef });
      resizingNodeIdRef.current = useCanvasStore.getState().resizingNodeId;
      eyedropperTargetNodeIdRef.current = useCanvasStore.getState().eyedropperTargetNodeId;
    };
    syncStoreRefs();
    return useCanvasStore.subscribe(syncStoreRefs);
  }, []);

  const commitTransformFromRef = useCallback(() => {
    setTransform({ ...transformRef.current });
  }, []);

  const bumpViewportCull = useCallback(() => {
    if (viewportCullRafRef.current != null) return;
    viewportCullRafRef.current = requestAnimationFrame(() => {
      viewportCullRafRef.current = null;
      setViewportCullTick((t) => t + 1);
    });
  }, []);

  const applyLiveCanvasTransform = useCallback((tf: Transform) => {
    applyCanvasTransformDom(tf, canvasTransformLayerRef.current, canvasBgRef.current, canvasBgStyleRef.current);
    patchCanvasViewportRef(canvasViewportRef, tf);
    bumpViewportCull();
  }, [bumpViewportCull]);

  useLayoutEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tf = useCanvasStore.getState().transform;
    canvasViewportRef.current = {
      x: tf.x,
      y: tf.y,
      width: rect.width,
      height: rect.height,
      scale: tf.scale,
    };
  }, [viewportSize, viewportCullTick]);

  // Image Import Target（canvas store，App 不订阅以免重渲染）
  const eyedropperTargetNodeIdRef = useRef<string | null>(null);

  // 快捷节点面板
  const [quickPaletteOpen, setQuickPaletteOpen] = useState(true);
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  // 画布背景样式 'dots' | 'grid' | 'none'
  const [canvasBgStyle, setCanvasBgStyle] = useState<'dots' | 'grid' | 'none'>('dots');
  const [canvasBgColor, setCanvasBgColor] = useState<'dark' | 'black'>('dark');
  useEffect(() => {
    canvasBgStyleRef.current = canvasBgStyle;
  }, [canvasBgStyle]);

  // 节点缩放状态
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
  const nodeResizePreviewRef = useRef<{
    nodeId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    resizeDirectionRef.current = resizeDirection;
  }, [resizeDirection]);

  // --- Node Update Handler (must be defined early for use by other callbacks) ---
  const handleUpdateNode = useCallback((id: string, updates: Partial<CanvasNode>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
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
    const sourceNode = nodesRef.current.find(n => n.id === sourceNodeId);
    const targetNode = nodesRef.current.find(n => n.id === targetNodeId);
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
    const existingEdge = edgesRef.current.find(
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
  }, []);

  // 默认节点尺寸映射（新建 / 重置窗口；文生图宽:高≈3:4；图生图 高:宽≈1.4；图片标注宽:高≈4:5；AI对话更高且内部分区 2:1；全景图生成等仍偏横向）
  const DEFAULT_NODE_SIZES: Record<string, { width: number, height: number }> = {
    /** 文生图：竖向窗，宽:高 = 3:4（与常见文生图界面比例接近） */
    't2i': { width: 900, height: 1200 },
    /** 图生图：高:宽 ≈ 1.4:1（较 2:3 略矮，贴近参考界面） */
    'i2i': { width: 900, height: 1260 },
    'panorama': { width: 1300, height: 1000 },
    'panoramaT2i': { width: 2000, height: 1800 },
    /** 图片标注：近方形略竖长，宽:高 = 4:5（介于 4:5～5:6） */
    'annotation': { width: 960, height: 1000 },
    'director3d': { width: 4000, height: 4700 },
    /** AI 对话：竖向更高；内容区消息列表:底部输入带 = 2:1 */
    'chat': { width: 1560, height: 2760 },
    'text': { width: 1000, height: 2000 },
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
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;
    const defaultSize = DEFAULT_NODE_SIZES[node.type];
    if (defaultSize) {
      handleUpdateNode(nodeId, { width: defaultSize.width, height: defaultSize.height });
    }
  }, [handleUpdateNode]);

  /** 缩放手柄按下：同步 ref + 记录 resize session（相对指针起点算尺寸，不依赖逐帧 lastMousePos） */
  const beginNodeResize = useCallback((e: React.PointerEvent, nodeId: string, direction: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const nodeBefore = nodesRef.current.find((n) => n.id === nodeId);
    if (!nodeBefore) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tf = transformRef.current;
    const scale = Math.max(tf.scale, 0.1);

    // 先从屏幕读取真实位置（含未提交的拖拽 transform），再提交拖拽，避免 origin 落到 state 旧坐标 (0,0)
    const originGeom = readNodeGeometryFromDom(
      canvasTransformLayerRef.current,
      nodeId,
      {
        x: nodeBefore.x,
        y: nodeBefore.y,
        width: nodeBefore.width,
        height: nodeBefore.height,
      },
      rect,
      tf,
    );

    const dragAcc = nodeDragAccumRef.current;
    if (dragAcc && (dragAcc.deltaX !== 0 || dragAcc.deltaY !== 0)) {
      const { nodeIds, deltaX, deltaY } = dragAcc;
      setNodes((prev) =>
        prev.map((n) =>
          nodeIds.includes(n.id) ? { ...n, x: n.x + deltaX, y: n.y + deltaY } : n,
        ),
      );
    }
    if (dragAcc) {
      clearNodeDragPreview(canvasTransformLayerRef.current, dragAcc.nodeIds);
    }
    clearEdgeGeometryPreviews(edgesSvgRef.current);
    nodeDragAccumRef.current = null;
    dragPreviewRef.current = null;
    setDraggingNodeId(null);
    draggingNodeIdRef.current = null;

    const grabCanvasX = (e.clientX - rect.left - tf.x) / scale;
    const grabCanvasY = (e.clientY - rect.top - tf.y) / scale;
    const minSize = MIN_NODE_SIZES[nodeBefore.type] || { width: 200, height: 150 };
    nodeResizeSessionRef.current = {
      nodeId,
      direction,
      origin: originGeom,
      grabCanvasX,
      grabCanvasY,
      minWidth: minSize.width,
      minHeight: minSize.height,
    };

    const initialPreview = { nodeId, ...originGeom };
    nodeResizePreviewRef.current = initialPreview;
    resizePreviewRef.current = initialPreview;
    setNodeResizePreview(initialPreview);

    activePointerTypeRef.current = 'resize';
    resizingNodeIdRef.current = nodeId;
    resizeDirectionRef.current = direction;
    setResizingNodeId(nodeId);
    setResizeDirection(direction);
    setIsResizing(true);
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [setDraggingNodeId, setNodeResizePreview, setNodes, setResizingNodeId]);

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

  // 画布编辑不自动写盘；显式「保存当前项目」与列表操作会写入 IndexedDB 草稿库

  const [promptPresets, setPromptPresets] = useState<Record<string, string>>(() => ({
    ...INITIAL_PROMPT_PRESETS_BASE,
  }));

  useEffect(() => {
    void loadChatPromptPresets().then((chatPresets) => {
      setPromptPresets((prev) => ({ ...prev, ...chatPresets }));
    });
  }, []);


  const {
    showSettingsModal,
    setShowSettingsModal,
    settingsTab,
    setSettingsTab,
    promptPresetDomainOverrides,
    promptPresetCategoryOverrides,
    settingsModalProps,
  } = useCanvasSettingsPanelState({
    promptPresets,
    setPromptPresets,
    canvasBgStyle,
    setCanvasBgStyle,
    canvasBgColor,
    setCanvasBgColor,
  });

  // --- Apply Preset Prompt ---
  const handleTogglePreset = useCallback((nodeId: string, presetKey: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
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
  }, [handleUpdateNode]);

  // 清除预设选择
  const handleClearPreset = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
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
  }, [handleUpdateNode]);

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

  const appendNodesWithUndo = useCallback((
    newNodes: CanvasNode[],
    options?: { edges?: Edge[]; selectIds?: string[] }
  ) => {
    if (newNodes.length === 0) return;
    const prevSel = [...selectedIdsRef.current];
    const newEdges = options?.edges ?? [];
    setNodes((prev) => [...prev, ...newNodes]);
    if (newEdges.length > 0) {
      setEdges((prev) => [...prev, ...newEdges]);
    }
    if (options?.selectIds) {
      setSelectedIds(options.selectIds);
    }
    queueMicrotask(() =>
      pushCanvasCommandRef.current({
        type: 'addNodes',
        nodes: newNodes,
        edges: newEdges,
        previousSelectedIds: prevSel,
      })
    );
  }, [setNodes, setEdges, setSelectedIds]);

  // 复制节点上的图片到新的图片节点（多图水平排开；stacked 为叠压式导出）
  const handleCopyToImage = useCallback((
    nodeId: string,
    layoutOrOptions: CopyToImageLayout | CopyToImageOptions = 'spaced'
  ) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;

    const opts = resolveCopyToImageOptions(layoutOrOptions);
    const items = opts.primaryOnly
      ? ((ref) => (ref ? [ref] : []))(getNodePrimaryCopyRef(node))
      : collectCopyableImageRefsFromNode(node);
    const startX = node.x + node.width + 50;
    const startY = node.y;
    const newNodes =
      opts.layout === 'stacked'
        ? buildStackedImageNodes(items, startX, startY)
        : buildSpacedImageNodes(items, startX, startY);

    if (newNodes.length === 0) {
      alert('没有可复制的图片');
      return;
    }

    appendNodesWithUndo(newNodes);
  }, [appendNodesWithUndo]);

  const {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
    generationAbortControllersRef,
    generationStartedAtRef,
  } = useLazyCanvasGeneration({
    setNodes,
    nodesRef,
    edgesRef,
    promptPresets,
    ensureJimengReady,
    openLoginRef,
    handleUpdateNode,
    appendNodesWithUndo,
    setEditingTextNodeIds,
  });

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

  // --- Refs for Global Dragging ---
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importPosRef = useRef<{ x: number, y: number, pendingSourceId?: string }>({ x: 0, y: 0 });

  // Refs to hold latest state for global event listeners
  const draftEdgeRef = useRef<{ sourceId: string, x: number, y: number } | null>(null);

  const refreshDraftEdgePath = useCallback(() => {
    const draft = draftEdgeRef.current;
    if (!draft?.sourceId) {
      hideDraftEdgePath(draftEdgePathRef.current);
      return;
    }
    const source = nodesRef.current.find((n) => n.id === draft.sourceId);
    if (!source) {
      hideDraftEdgePath(draftEdgePathRef.current);
      return;
    }
    const geom = resolveNodeGeometry(source, dragPreviewRef.current, resizePreviewRef.current);
    showDraftEdgePath(
      draftEdgePathRef.current,
      geom.x + geom.width,
      geom.y + geom.height / 2,
      draft.x,
      draft.y,
    );
  }, []);

  const activePointerTypeRef = useRef<
    'canvas' | 'node' | 'edge' | 'fullscreen' | 'resize' | 'boxSelect' | 'selection' | 'selectStart' | null
  >(null);
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

  useEffect(() => { draggingEdgeIdRef.current = draggingEdgeId; }, [draggingEdgeId]);
  
  // selectedIds ref 用于事件处理中获取最新值（由 store subscribe 同步）

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
    appendNodesWithUndo(newNodes, { edges: newEdges, selectIds: newSel });
    selectedIdsRef.current = newSel;
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
    });
  }, []);

  const pushCanvasHistorySnapshot = useCallback((snapshot: CanvasHistoryEntry) => {
    const signature = buildCanvasHistorySignature(snapshot);
    if (signature === lastCanvasHistorySignatureRef.current) return;
    /** 撤销栈始终剥离媒体 base64，结构变更可撤销且内存占用可控 */
    const strippedNodes = stripImagesFromNodes(snapshot.nodes);
    const payloadChars = estimateCanvasBase64PayloadChars(strippedNodes);
    const historyEmpty = canvasHistoryRef.current.length === 0;
    if (!historyEmpty && payloadChars > CANVAS_HISTORY_SKIP_PAYLOAD_CHARS) {
      lastCanvasHistorySignatureRef.current = signature;
      setCanvasHistoryNotice('画布数据过大，本步撤销已跳过。建议导出 ZIP 备份或拆分项目。');
      console.warn(
        '[canvas] 当前画布数据过大，已跳过本步撤销记录以降低崩溃风险（建议拆分项目或导出备份）。'
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
      cloned = structuredClone({
        nodes: strippedNodes,
        edges: snapshot.edges,
        selectedIds: snapshot.selectedIds,
      });
    } catch (e) {
      console.warn('[canvas] 剥离媒体后撤销快照克隆仍失败，已跳过', e);
      lastCanvasHistorySignatureRef.current = signature;
      return;
    }
    const merged = [...historyBefore, cloned];
    const cappedHistory = merged.length > maxSteps ? merged.slice(merged.length - maxSteps) : merged;
    canvasHistoryRef.current = cappedHistory;
    canvasHistoryIndexRef.current = cappedHistory.length - 1;
    lastCanvasHistorySignatureRef.current = signature;
  }, [buildCanvasHistorySignature]);

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
      reverseCanvasCommand(cmd, setNodes, setEdges, setSelectedIds);
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
    const runHistoryTick = () => {
      if (isApplyingCanvasHistoryRef.current) return;
      const { nodes: ns, edges: es, selectedIds: sel } = useCanvasStore.getState();
      const layoutKey = nodeLayoutKey(ns);
      const edgesKey = es.map((e) => `${e.sourceId}->${e.targetId}`).join('|');
      const snapshot: CanvasHistoryEntry = { nodes: ns, edges: es, selectedIds: sel };
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
        lastStructuralHistoryKeyRef.current = buildStructuralHistoryKey(ns, layoutKey, edgesKey);
        lastPromptHistoryKeyRef.current = buildPromptHistoryKey(ns);
        return;
      }
      const structuralKey = buildStructuralHistoryKey(ns, layoutKey, edgesKey);
      const promptKey = buildPromptHistoryKey(ns);
      const structuralChanged = structuralKey !== lastStructuralHistoryKeyRef.current;
      const promptChanged = promptKey !== lastPromptHistoryKeyRef.current;
      if (!structuralChanged && !promptChanged) return;

      if (historyDebounceTimerRef.current) {
        clearTimeout(historyDebounceTimerRef.current);
        historyDebounceTimerRef.current = null;
      }
      const delayMs = structuralChanged ? HISTORY_DEBOUNCE_STRUCTURAL_MS : HISTORY_DEBOUNCE_PROMPT_MS;
      historyDebounceTimerRef.current = window.setTimeout(() => {
        startTransition(() => {
          pushCanvasHistorySnapshot(snapshot);
          lastStructuralHistoryKeyRef.current = structuralKey;
          lastPromptHistoryKeyRef.current = promptKey;
        });
      }, delayMs);
    };

    runHistoryTick();
    return useCanvasStore.subscribe(() => {
      runHistoryTick();
    });
  }, [pushCanvasHistorySnapshot]);

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

  const interaction = useCanvasInteractionHandlers({
    containerRef,
    fileInputRef,
    transformRef,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    fullscreenImage,
    canvasMode,
    activeTool,
    contextMenu,
    pendingEdgeSourceId,
    setContextMenu,
    setSelectedIds,
    setIsSelecting,
    setSelectionBox,
    setDraggingNodeId,
    setResizingNodeId,
    setNodeResizePreview,
    setResizeDirection,
    setIsResizing,
    setNodes,
    setEdges,
    setPendingEdgeSourceId,
    setImportTargetNodeId,
    setResizePreview,
    applyLiveCanvasTransform,
    commitTransformFromRef,
    handleCanvasEyedropper,
    appendNodesWithUndo,
    pushCanvasCommandRef,
    revokeNodeBlobUrls,
    DEFAULT_NODE_SIZES,
    activePointerTypeRef,
    lastMousePosRef,
    pressStartPosRef,
    selectionModifiersRef,
    longPressTimerRef,
    isSelectingRef,
    selectionBoxRef,
    selectionBoxDomRef,
    boxSelectRafRef,
    wheelTransformCommitTimerRef,
    eyedropperTargetNodeIdRef,
    draggingNodeIdRef,
    rafIdRef,
    nodeDragAccumRef,
    altDupPendingRef,
    altDupDoneRef,
    altDupClickNodeIdRef,
    altDragScreenAccumRef,
    nodeDragHistoryStartRef,
    nodeResizePreviewRef,
    nodeResizeSessionRef,
    resizingNodeIdRef,
    resizeDirectionRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    resizePreviewRef,
    draftEdgeRef,
    refreshDraftEdgePath,
    importPosRef,
    pendingEdgeSourceIdRef,
    lastCreatedNodePosRef,
    addNodeAtCanvasPositionRef,
  });
  const {
    handleWheel,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleContextMenu,
    handleCanvasDoubleClick,
    handleNodePointerDown,
    handlePortPointerDown,
    handleDragOver,
    handleDrop,
    addNodeAtCanvasPosition,
    handleAddNode,
    handleImportImageClick,
    handleFileChange,
    handleDeleteNode,
    handleDeleteEdge,
  } = interaction;

  addNodeAtCanvasPositionRef.current = addNodeAtCanvasPosition;

  useCanvasGlobalPointerEvents({
    containerRef,
    transformRef,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    draftEdgeRef,
    draftEdgePathRef,
    dragPreviewRef,
    resizePreviewRef,
    activePointerTypeRef,
    lastMousePosRef,
    lastFsMousePosRef,
    canvasMouseRef,
    draggingNodeIdRef,
    rafIdRef,
    nodeDragAccumRef,
    altDupPendingRef,
    altDupDoneRef,
    altDupClickNodeIdRef,
    altDragScreenAccumRef,
    nodeDragHistoryStartRef,
    isSelectingRef,
    selectionBoxRef,
    boxSelectRafRef,
    pressStartPosRef,
    longPressTimerRef,
    nodeResizeSessionRef,
    nodeResizePreviewRef,
    resizingNodeIdRef,
    resizeDirectionRef,
    edgeDraggingRef,
    wheelTransformCommitTimerRef,
    duplicateNodesSubgraphForAltDragRef,
    pushCanvasCommandRef,
    refreshDraftEdgePath,
    findConnectTargetNode,
    computeNodeResizeFromPointer,
    applyLiveCanvasTransform,
    commitTransformFromRef,
    setNodes,
    setEdges,
    setSelectedIds,
    setDraggingNodeId,
    setIsSelecting,
    setSelectionBox,
    setContextMenu,
    setPendingEdgeSourceId,
    setDraggingEdgeId,
    setResizingNodeId,
    setNodeResizePreview,
    setResizeDirection,
    setIsResizing,
    setFsTransform,
  });

  const createImageNodesFromBase64List = useCallback((base64List: string[]) => {
    const list = base64List.filter((b) => b && b.length > 80);
    if (list.length === 0) return;
    const mp = canvasMouseRef.current;
    const startX = mp.x - SPAWNED_IMAGE_NODE_WIDTH / 2;
    const startY = mp.y - SPAWNED_IMAGE_NODE_HEIGHT / 2;
    const newNodes = buildSpacedImageNodesFromLists(list, startX, startY);
    if (newNodes.length === 0) return;
    appendNodesWithUndo(newNodes, { selectIds: newNodes.map((n) => n.id) });
  }, [appendNodesWithUndo]);

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

  // 处理连线数据传递 - 当有连线连接到 panorama 或 annotation 节点时
  useEffect(() => {
    const syncConnectedMedia = () => {
      const nodes = useCanvasStore.getState().nodes;
      const edges = useCanvasStore.getState().edges;
      nodes.forEach((node) => {
        if (node.type === 'panorama' || node.type === 'annotation' || node.type === 'panoramaT2i' || node.type === 'director3d') {
          const incomingEdges = edges.filter((e) => e.targetId === node.id || e.sourceId === node.id);
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
    };
    syncConnectedMedia();
    return useCanvasStore.subscribe(syncConnectedMedia);
  }, [handleUpdateNode]);

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

  useLazyCanvasKeyboardShortcuts({
    canvasMode,
    fullscreenImage,
    showShortcutsPanel,
    clipboard,
    setActiveTool,
    setFullscreenImage,
    setEyedropperTargetNodeId,
    setShowShortcutsPanel,
    setDraggingNodeId,
    setResizingNodeId,
    setNodeResizePreview,
    setIsResizing,
    setIsSelecting,
    setSelectionBox,
    setSelectedIds,
    setContextMenu,
    setNodes,
    setClipboard,
    nodesRef,
    edgesRef,
    selectedIdsRef,
    canvasMouseRef,
    addNodeAtCanvasPositionRef,
    draggingNodeIdRef,
    resizingNodeIdRef,
    nodeDragAccumRef,
    nodeResizePreviewRef,
    nodeResizeSessionRef,
    isSelectingRef,
    selectionBoxRef,
    boxSelectRafRef,
    pressStartPosRef,
    activePointerTypeRef,
    canvasTransformLayerRef,
    edgesSvgRef,
    draftEdgePathRef,
    draftEdgeRef,
    dragPreviewRef,
    resizePreviewRef,
    rafIdRef,
    lastPasteTimeRef,
    sharedClipboardImageRef,
    DEFAULT_NODE_SIZES,
    handleResetNodeSize,
    handleDeleteNode,
    appendNodesWithUndo,
    createImageNodesFromBase64List,
    undoCanvasState,
    saveCurrentProject,
    handleSaveDraftJsonSaveAs,
    fitViewportToSelectedNodes,
  });

  // --- Render Helpers ---
  const renderCanvasNodeStateRef = useRef<CanvasNodeRenderState>(null!);
  const renderStateOverlayRef = useSyncRenderStateOverlay(() => buildCanvasNodeRenderOverlay({
    promptPresets,
    generationStartedAtRef,
    fileInputRef,
    bigEditorLastClickRef,
    canReceiveConnection,
    handleUpdateNode,
    handleNodePointerDown,
    handlePortPointerDown,
    handleDeleteEdge,
    handleGenerate,
    handleGenerateVideo,
    handleCancelGeneration,
    handleSendMessage,
    handleOptimizePrompt,
    handleClearPreset,
    handleTogglePreset,
    handleCopyToImage,
    handleResetNodeSize,
    handleDeleteNode,
    handleCanvasEyedropper,
    openBigEditor,
    openFullscreenImage,
    openFullscreenFromBase64,
    renderNodeErrorPanel,
    setSelectedIds,
    setNodes,
    setEyedropperTargetNodeId,
    setEditingTextNodeIds,
    setImportTargetNodeId,
    setTextNodeFontSize,
    setShowSettingsModal,
    setSettingsTab,
    setFullscreenImage,
    canvasViewportRef,
    nodesRef,
    edgesRef,
    beginNodeResize,
    eyedropperTargetNodeIdRef,
    promptPresetDomainOverrides,
    promptPresetCategoryOverrides,
    downloadImage,
    downloadVideoFromUrl,
    appendNodesWithUndo,
  }));
  const handleMinimapNavigate = useCallback((canvasX: number, canvasY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTransform((prev) => ({
      ...prev,
      x: rect.width / 2 - canvasX * prev.scale,
      y: rect.height / 2 - canvasY * prev.scale,
    }));
  }, [setTransform]);

  useEffect(() => {
    let cancelled = false;
    let lastKey = buildMediaOffloadScanKey(useCanvasStore.getState().nodes);
    const runOffload = async (nodeList: CanvasNode[]) => {
      const patches = new Map<string, Partial<CanvasNode>>();
      for (const node of nodeList) {
        if (cancelled || !nodeNeedsMediaOffload(node)) continue;
        const patch = await buildNodeMediaOffloadPatch(node);
        if (cancelled || !patch) continue;
        patches.set(node.id, patch);
      }
      if (cancelled || patches.size === 0) return;
      startTransition(() => {
        setNodes((prev) =>
          prev.map((n) => {
            const patch = patches.get(n.id);
            return patch ? { ...n, ...patch } : n;
          })
        );
      });
    };
    void runOffload(useCanvasStore.getState().nodes);
    return useCanvasStore.subscribe((state) => {
      const key = buildMediaOffloadScanKey(state.nodes);
      if (key === lastKey) return;
      lastKey = key;
      void runOffload(state.nodes);
    });
  }, [setNodes]);

  const stableRenderNode = useLazyRenderCanvasNode(renderCanvasNodeStateRef);

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  /** 首页 AI 对话创建项目后，进入画布自动发送首条消息 */
  useEffect(() => {
    if (!projectStoreReady) return;
    const pending = pendingHomeChatRef.current;
    if (!pending) return;
    pendingHomeChatRef.current = null;
    const t = window.setTimeout(() => {
      handleSendMessageRef.current(pending.nodeId, { promptText: pending.prompt });
    }, 500);
    return () => window.clearTimeout(t);
  }, [projectStoreReady]);

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
  }, [projectStoreReady, activeProjectId, setTransform]);

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
        <CanvasBackground canvasBgRef={canvasBgRef} canvasBgStyle={canvasBgStyle} canvasBgColor={canvasBgColor} />

        <CanvasStage
          canvasTransformLayerRef={canvasTransformLayerRef}
          edgesSvgRef={edgesSvgRef}
          draftEdgePathRef={draftEdgePathRef}
          canvasViewportRef={canvasViewportRef}
          viewportSize={viewportSize}
          viewportCullTick={viewportCullTick}
          renderCanvasNodeStateRef={renderCanvasNodeStateRef}
          renderStateOverlayRef={renderStateOverlayRef}
          dragPreviewRef={dragPreviewRef}
          nodeResizePreviewRef={nodeResizePreviewRef}
          inputNodeTypes={INPUT_NODE_TYPES}
          renderNode={stableRenderNode}
          onDeleteEdge={handleDeleteEdge}
          onNodePointerDown={handleNodePointerDown}
          onPortPointerDown={handlePortPointerDown}
          onBeginResize={beginNodeResize}
        />

        <CanvasEyedropperOverlay />
        <CanvasMinimapHost
          viewportSize={viewportSize}
          onNavigate={handleMinimapNavigate}
        />
      </div>

      {/* 看图模式覆盖层 */}
      {canvasMode === 'audit' && (
        <Suspense fallback={<HeavyNodeFallback label="加载看图模式…" />}><AuditModeCanvasHostLazy
          auditImages={auditImages}
          setAuditImages={setAuditImages}
          setTransform={setTransform}
          onWheel={handleWheel}
          sharedClipboardImageRef={sharedClipboardImageRef}
          saveCurrentProject={saveCurrentProject}
          openBigEditor={openBigEditor}
        /></Suspense>
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


      <CanvasShortcutsPanel open={showShortcutsPanel} onClose={() => setShowShortcutsPanel(false)} />

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
              onClick={() => {
                // 返回首页前先等所有 pending saveProjectLibrary 落盘，
                // 避免 HomeScreen mount 后立即 loadProjectLibrary 读到 IDB 旧值
                // 导致画布内刚改的项目名（或其它字段）在首页上不同步。
                void flushPendingProjectWrites().finally(() => onBackToHome());
              }}
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

      {showProjectModal ? (
        <Suspense fallback={null}>
          <CanvasProjectModalLazy
            open
            onClose={() => setShowProjectModal(false)}
            projects={projects}
            activeProjectId={activeProjectId}
            draftNameInput={draftNameInput}
            setDraftNameInput={setDraftNameInput}
            draftStoragePathInput={draftStoragePathInput}
            setDraftStoragePathInput={setDraftStoragePathInput}
            autosaveIntervalMin={autosaveIntervalMin}
            projectExportMenuOpen={projectExportMenuOpen}
            setProjectExportMenuOpen={setProjectExportMenuOpen}
            projectImportInputRef={projectImportInputRef}
            onApplyDraftTitle={handleApplyDraftTitle}
            onApplyDraftStoragePath={handleApplyDraftStoragePath}
            onAutosaveIntervalChange={handleAutosaveIntervalChange}
            onCreateNewProject={createNewProject}
            onSaveCurrentProject={saveCurrentProject}
            onImportProjectFile={handleImportProjectFile}
            onExportProjectJson={handleExportProjectJson}
            onExportProjectZip={handleExportProjectZip}
            projectSnapshotForJsonExport={projectSnapshotForJsonExport}
            onSwitchProject={switchProject}
            onOpenProjectLocationInfo={openProjectLocationInfo}
            onRenameProject={(projectId, trimmedName) => {
              setProjects((prev) => {
                const next = prev.map((p) =>
                  p.id === projectId ? { ...p, name: trimmedName, updatedAt: Date.now() } : p
                );
                projectsRef.current = next;
                void saveProjectLibrary(next, activeProjectIdRef.current).then((ok) => {
                  if (!ok) alert('名称已更新，但写入草稿库失败，请重试。');
                });
                return next;
              });
            }}
            onDeleteProject={(projectId) => deleteProject(projectId)}
          />
        </Suspense>
      ) : null}

      {draftDiskModal ? (
        <CanvasDraftDiskModal
          modal={draftDiskModal}
          setDraftDiskModal={setDraftDiskModal}
          onCancel={cancelDraftDiskModal}
          onConfirm={confirmDraftDiskModal}
        />
      ) : null}

      {showSettingsModal ? (
        <Suspense fallback={null}>
          <CanvasSettingsModalLazy
            open
            onClose={() => setShowSettingsModal(false)}
            {...settingsModalProps}
          />
        </Suspense>
      ) : null}


      {fullscreenImage && canvasMode !== 'audit' ? (
        <Suspense fallback={null}>
          <CanvasFullscreenImageModalLazy
          imageSrc={fullscreenImage}
          fsTransform={fsTransform}
          fsContextMenu={fsContextMenu}
          setFsContextMenu={setFsContextMenu}
          activePointerTypeRef={activePointerTypeRef}
          fullscreenNodeId={fullscreenNodeId}
          fullscreenImageIdx={fullscreenImageIdx}
          imageTotal={imageTotal}
          onClose={closeFullscreen}
          onWheel={handleFsWheel}
          onImagePointerDown={(e) => handleFsPointerDown(e, activePointerTypeRef, lastFsMousePosRef)}
          onNavigate={fsNavigate}
          onDownload={() => { void downloadImage(fullscreenImage); }}
          onEditAsAnnotation={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            const cx = rect
              ? (window.innerWidth / 2 - rect.left - transformRef.current.x) / transformRef.current.scale
              : 0;
            const cy = rect
              ? (window.innerHeight / 2 - rect.top - transformRef.current.y) / transformRef.current.scale
              : 0;
            const newId = `annotation-${Date.now()}`;
            const newNode: CanvasNode = {
              id: newId,
              type: 'annotation',
              x: cx - 480,
              y: cy - 500,
              width: 960,
              height: 1000,
              sourceImage: fullscreenImage,
              annotations: [],
              isEditing: false,
              selectedAnnotationId: undefined,
            };
            appendNodesWithUndo([newNode], { selectIds: [newId] });
            closeFullscreen();
          }}
        />
        </Suspense>
      ) : null}

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

      <CanvasZoomControl containerRef={containerRef} hidden={canvasMode === 'audit'} />

      <ThumbResolutionControl
        hidden={
          canvasMode === 'audit' ||
          !!fullscreenImage ||
          bigEditorOpen ||
          showSettingsModal ||
          showProjectModal
        }
      />
      {bigEditorPortal}

    </div>
  );
}
