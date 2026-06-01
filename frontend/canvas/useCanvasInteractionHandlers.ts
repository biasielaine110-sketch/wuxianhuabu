import { useCallback, useRef, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { CanvasNode, Edge, NodeType, Transform } from '../types';
import { useCanvasStore } from '../stores/canvasStore';
import { defaultCanvasImageModel } from './canvasModelUtils';
import { CHAT_NODE_DEFAULT_PIXEL_HEIGHT, CHAT_PANEL_FONT_SCALE } from './chatNodeUtils';
import { DEFAULT_DEEPSEEK_CHAT_MODEL_ID } from '../services/aiSettings';
import { sanitizeFilename } from '../services/projectPersistence';
import {
  buildSpacedImageNodesFromLists,
  collectImageFilesFromDataTransfer,
  readFilesAsBase64,
  SPAWNED_IMAGE_NODE_HEIGHT,
  SPAWNED_IMAGE_NODE_WIDTH,
} from './spawnImageNodes';
import { clearNodeDragPreview, clearNodeGeometryPreview } from './canvasNodeDragDom';
import { clearEdgeGeometryPreviews } from './canvasEdgeDragDom';
import type { ResizePreview } from './canvasEdgeGeometry';
import { revokeNodeCanvasAssets } from '../services/canvasAssetCleanup';

export type CanvasContextMenu = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
} | null;

export type UseCanvasInteractionHandlersOptions = {
  containerRef: RefObject<HTMLDivElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  transformRef: RefObject<Transform>;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  selectedIdsRef: RefObject<string[]>;
  fullscreenImage: string | null;
  canvasMode: string;
  activeTool: string;
  contextMenu: CanvasContextMenu;
  pendingEdgeSourceId: string | null;
  setContextMenu: Dispatch<SetStateAction<CanvasContextMenu>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
  setSelectionBox: Dispatch<SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  setDraggingNodeId: Dispatch<SetStateAction<string | null>>;
  setResizingNodeId: Dispatch<SetStateAction<string | null>>;
  setNodeResizePreview: Dispatch<SetStateAction<ResizePreview | null>>;
  setResizeDirection: Dispatch<SetStateAction<string>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setPendingEdgeSourceId: Dispatch<SetStateAction<string | null>>;
  setImportTargetNodeId: (id: string | null) => void;
  setResizePreview: Dispatch<SetStateAction<ResizePreview | null>>;
  applyLiveCanvasTransform: (tf: Transform) => void;
  commitTransformFromRef: () => void;
  handleCanvasEyedropper: (sourceNodeId: string, targetNodeId: string) => boolean;
  appendNodesWithUndo: (
    newNodes: CanvasNode[],
    opts?: { edges?: Edge[]; selectIds?: string[] }
  ) => void;
  pushCanvasCommandRef: RefObject<(cmd: unknown) => void>;
  revokeNodeBlobUrls: (nodeId: string) => void;
  DEFAULT_NODE_SIZES: Record<string, { width: number; height: number }>;
  activePointerTypeRef: RefObject<string | null>;
  lastMousePosRef: RefObject<{ x: number; y: number }>;
  pressStartPosRef: RefObject<{ x: number; y: number } | null>;
  selectionModifiersRef: RefObject<{ ctrl: boolean; alt: boolean }>;
  longPressTimerRef: RefObject<number | null>;
  isSelectingRef: RefObject<boolean>;
  selectionBoxRef: RefObject<{ x: number; y: number; width: number; height: number } | null>;
  selectionBoxDomRef: RefObject<HTMLDivElement | null>;
  boxSelectRafRef: RefObject<number | null>;
  wheelTransformCommitTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  eyedropperTargetNodeIdRef: RefObject<string | null>;
  draggingNodeIdRef: RefObject<string | null>;
  rafIdRef: RefObject<number | null>;
  nodeDragAccumRef: RefObject<{ nodeIds: string[]; deltaX: number; deltaY: number } | null>;
  altDupPendingRef: RefObject<boolean>;
  altDupDoneRef: RefObject<boolean>;
  altDupClickNodeIdRef: RefObject<string | null>;
  altDragScreenAccumRef: RefObject<{ x: number; y: number }>;
  nodeDragHistoryStartRef: RefObject<Map<string, { x: number; y: number }> | null>;
  nodeResizePreviewRef: RefObject<{ nodeId: string; x: number; y: number; width: number; height: number } | null>;
  nodeResizeSessionRef: RefObject<unknown>;
  resizingNodeIdRef: RefObject<string | null>;
  resizeDirectionRef: RefObject<string>;
  canvasTransformLayerRef: RefObject<HTMLDivElement | null>;
  edgesSvgRef: RefObject<SVGSVGElement | null>;
  resizePreviewRef: RefObject<unknown>;
  draftEdgeRef: RefObject<{ sourceId: string; x: number; y: number } | null>;
  refreshDraftEdgePath: () => void;
  importPosRef: RefObject<{ x: number; y: number; pendingSourceId?: string }>;
  pendingEdgeSourceIdRef: RefObject<string | null>;
  lastCreatedNodePosRef: RefObject<{ x: number; y: number; stagger: number }>;
  addNodeAtCanvasPositionRef: RefObject<(type: NodeType, canvasX: number, canvasY: number) => void>;
};

export function useCanvasInteractionHandlers(opts: UseCanvasInteractionHandlersOptions) {
  const {
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
  } = opts;

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
    const tf = transformRef.current;
    const newScale = Math.min(Math.max(0.05, tf.scale * (1 + delta)), 5);

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleRatio = newScale / tf.scale;
    const newX = mouseX - (mouseX - tf.x) * scaleRatio;
    const newY = mouseY - (mouseY - tf.y) * scaleRatio;

    const next = { x: newX, y: newY, scale: newScale };
    transformRef.current = next;
    applyLiveCanvasTransform(next);

    if (wheelTransformCommitTimerRef.current) {
      clearTimeout(wheelTransformCommitTimerRef.current);
    }
    wheelTransformCommitTimerRef.current = setTimeout(() => {
      wheelTransformCommitTimerRef.current = null;
      commitTransformFromRef();
    }, 120);
  }, [fullscreenImage, applyLiveCanvasTransform, commitTransformFromRef]);

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
      const preview = nodeResizePreviewRef.current;
      if (preview) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === preview.nodeId
              ? { ...n, x: preview.x, y: preview.y, width: preview.width, height: preview.height }
              : n,
          ),
        );
        clearNodeGeometryPreview(canvasTransformLayerRef.current, preview.nodeId);
        nodeResizePreviewRef.current = null;
      }
      clearEdgeGeometryPreviews(edgesSvgRef.current);
      resizePreviewRef.current = null;
      setResizePreview(null);
      setNodeResizePreview(null);
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
    const tf = transformRef.current;
    const canvasX = (e.clientX - rect.left - tf.x) / tf.scale;
    const canvasY = (e.clientY - rect.top - tf.y) / tf.scale;
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
  }, [fullscreenImage, canvasMode]);

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
    const tf = transformRef.current;
    const canvasX = (e.clientX - rect.left - tf.x) / tf.scale;
    const canvasY = (e.clientY - rect.top - tf.y) / tf.scale;
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
  }, [fullscreenImage]);

  const handleNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button === 2 || fullscreenImage) return;

    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-resize-handle]')) return;

    const pickedNode = nodesRef.current.find(n => n.id === id);
    /** 节点内表单控件：不应触发整块节点拖拽；文本节点预览区（.text-node-content）除外，未选中时可拖动 */
    const isInteractiveSurface =
      !!targetEl?.closest(
        'input, textarea, select, button, a, [role="button"], [role="slider"], [role="listbox"], [contenteditable="true"], [data-resize-handle], .text-node-content::-webkit-scrollbar'
      ) &&
      !(pickedNode?.type === 'text' && targetEl?.closest('.text-node-content'));

    /** 吸管模式：点击节点窗口任意非表单区域即可与「吸取目标」节点连线（与预览区点击行为一致） */
    const eyeT = eyedropperTargetNodeIdRef.current;
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
      if (nodeDragAccumRef.current) {
        clearNodeDragPreview(canvasTransformLayerRef.current, nodeDragAccumRef.current.nodeIds);
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
    const tf = transformRef.current;
    const mouseX = (e.clientX - rect.left - tf.x) / tf.scale;
    const mouseY = (e.clientY - rect.top - tf.y) / tf.scale;
    const newDraft = { sourceId: nodeId, x: mouseX, y: mouseY };
    draftEdgeRef.current = newDraft;
    refreshDraftEdgePath();
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
    const tf = transformRef.current;
    const mouseX = (e.clientX - rect.left - tf.x) / tf.scale;
    const mouseY = (e.clientY - rect.top - tf.y) / tf.scale;

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
          appendNodesWithUndo(newNodes, { selectIds: newNodes.map((n) => n.id) });
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
        appendNodesWithUndo([newNode], { selectIds: [newNode.id] });
      } catch (err) {
        console.error(err);
        alert('无法加载拖入的视频文件。');
      }
    }
  }, []);

  // --- Node Actions ---
  const addNodeAtCanvasPosition = useCallback((type: NodeType, canvasX: number, canvasY: number) => {
    const defaultSize = DEFAULT_NODE_SIZES[type] || { width: 420, height: 300 };
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
      prompt: '',
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
    if (nodesRef.current.length >= MAX_CANVAS_NODES) {
      alert(`节点数已达 ${MAX_CANVAS_NODES} 个上限，建议清理不需要的节点或新建项目，以保持画布流畅运行。`);
      return;
    }
    const pending = pendingEdgeSourceIdRef.current;
    const newEdges: Edge[] = pending
      ? [{ id: `edge-${Date.now()}`, sourceId: pending, targetId: newId }]
      : [];
    if (pending) {
      setPendingEdgeSourceId(null);
      pendingEdgeSourceIdRef.current = null;
    }
    appendNodesWithUndo([newNode], { edges: newEdges, selectIds: [newId] });
  }, [DEFAULT_NODE_SIZES, appendNodesWithUndo, setPendingEdgeSourceId]);

  const handleAddNode = useCallback((type: NodeType) => {
    if (!contextMenu) return;
    addNodeAtCanvasPosition(type, contextMenu.canvasX, contextMenu.canvasY);
    setContextMenu(null);
  }, [contextMenu, addNodeAtCanvasPosition, setContextMenu]);

  const handleImportImageClick = useCallback(() => {
    if (!contextMenu) return;
    importPosRef.current = { x: contextMenu.canvasX, y: contextMenu.canvasY };
    if (pendingEdgeSourceId) {
      importPosRef.current.pendingSourceId = pendingEdgeSourceId;
    }
    fileInputRef.current?.click();
    setContextMenu(null);
  }, [contextMenu, pendingEdgeSourceId, fileInputRef, setContextMenu]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const importTargetNodeId = useCanvasStore.getState().importTargetNodeId;
      if (importTargetNodeId) {
        setNodes(prev =>
          prev.map(n =>
            n.id === importTargetNodeId ? { ...n, images: [base64], currentImageIndex: 0 } : n
          )
        );
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
          currentImageIndex: 0,
        };
        const pendingSourceId = importPosRef.current.pendingSourceId;
        const newEdges: Edge[] = [];
        if (pendingSourceId) {
          const exists = edgesRef.current.some(
            (edge) => edge.sourceId === pendingSourceId && edge.targetId === newNode.id
          );
          if (!exists) {
            newEdges.push({ id: `edge-${Date.now()}`, sourceId: pendingSourceId, targetId: newNode.id });
          }
          importPosRef.current.pendingSourceId = undefined;
        }
        appendNodesWithUndo([newNode], { edges: newEdges, selectIds: [newNode.id] });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [appendNodesWithUndo, setImportTargetNodeId, setNodes]);

  const handleDeleteNode = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const connectedEdges = edgesRef.current.filter((e) => e.sourceId === id || e.targetId === id);
    revokeNodeBlobUrls(id);
    const remaining = nodesRef.current.filter((n) => n.id !== id);
    revokeNodeCanvasAssets(node, remaining);
    queueMicrotask(() =>
      pushCanvasCommandRef.current({ type: 'deleteNode', node, edges: connectedEdges })
    );
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.sourceId !== id && e.targetId !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  }, [revokeNodeBlobUrls, setNodes, setEdges, setSelectedIds]);

  const handleDeleteEdge = useCallback((id: string) => {
    setEdges((prev) => {
      const edge = prev.find((e) => e.id === id);
      if (!edge) return prev;
      const next = prev.filter((e) => e.id !== id);
      queueMicrotask(() => pushCanvasCommandRef.current({ type: 'deleteEdge', edge }));
      return next;
    });
  }, [setEdges]);

  return {
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
  };
}

