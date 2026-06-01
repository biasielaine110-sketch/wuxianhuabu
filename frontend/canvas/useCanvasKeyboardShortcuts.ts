import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject, Dispatch, SetStateAction } from 'react';
import type { AuditImage, CanvasMode, CanvasNode, Edge, NodeType, Tool } from '../types';
import {
  buildSpacedImageNodes,
  readBlobsAsBase64,
  readFilesAsBase64,
  SPAWNED_IMAGE_NODE_HEIGHT,
  SPAWNED_IMAGE_NODE_WIDTH,
} from './spawnImageNodes';
import { collectImageFilesFromClipboardData } from './spawnImageNodes';
import {
  cloneImageSlotForNewNode,
  hasCanvasImagePayload,
  resolveCanvasImageSource,
} from '../services/canvasAssetResolver';
import {
  collectCopyableImageRefsFromNode,
  getNodePrimaryCopyRef,
} from '../referenceSlots';
import { clearNodeDragPreview } from './canvasNodeDragDom';
import { clearNodeGeometryPreview } from './canvasNodeDragDom';
import { clearEdgeGeometryPreviews } from './canvasEdgeDragDom';
import { hideDraftEdgePath } from './canvasDraftEdgeDom';

export type CanvasKeyboardShortcutDeps = {
  canvasMode: CanvasMode;
  fullscreenImage: string | null;
  showShortcutsPanel: boolean;
  clipboard: CanvasNode | null;
  setActiveTool: Dispatch<SetStateAction<Tool>>;
  setFullscreenImage: Dispatch<SetStateAction<string | null>>;
  setEyedropperTargetNodeId: Dispatch<SetStateAction<string | null>>;
  setShowShortcutsPanel: Dispatch<SetStateAction<boolean>>;
  setDraggingNodeId: Dispatch<SetStateAction<string | null>>;
  setResizingNodeId: Dispatch<SetStateAction<string | null>>;
  setNodeResizePreview: Dispatch<SetStateAction<{ nodeId: string; x: number; y: number; width: number; height: number } | null>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
  setSelectionBox: Dispatch<SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; canvasX: number; canvasY: number } | null>>;
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setClipboard: Dispatch<SetStateAction<CanvasNode | null>>;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  selectedIdsRef: MutableRefObject<string[]>;
  canvasMouseRef: MutableRefObject<{ x: number; y: number }>;
  addNodeAtCanvasPositionRef: MutableRefObject<(type: NodeType, canvasX: number, canvasY: number) => void>;
  draggingNodeIdRef: MutableRefObject<string | null>;
  resizingNodeIdRef: MutableRefObject<string | null>;
  nodeDragAccumRef: MutableRefObject<{ nodeIds: string[]; dx: number; dy: number } | null>;
  nodeResizePreviewRef: MutableRefObject<{ nodeId: string; x: number; y: number; width: number; height: number } | null>;
  nodeResizeSessionRef: MutableRefObject<unknown>;
  isSelectingRef: MutableRefObject<boolean>;
  selectionBoxRef: MutableRefObject<{ x: number; y: number; width: number; height: number } | null>;
  boxSelectRafRef: MutableRefObject<number | null>;
  pressStartPosRef: MutableRefObject<{ x: number; y: number } | null>;
  activePointerTypeRef: MutableRefObject<string | null>;
  canvasTransformLayerRef: RefObject<HTMLDivElement | null>;
  edgesSvgRef: RefObject<SVGSVGElement | null>;
  draftEdgePathRef: MutableRefObject<SVGPathElement | null>;
  draftEdgeRef: MutableRefObject<unknown>;
  dragPreviewRef: MutableRefObject<unknown>;
  resizePreviewRef: MutableRefObject<unknown>;
  rafIdRef: MutableRefObject<number | null>;
  lastPasteTimeRef: MutableRefObject<number>;
  sharedClipboardImageRef: MutableRefObject<AuditImage | null>;
  DEFAULT_NODE_SIZES: Record<string, { width: number; height: number }>;
  handleResetNodeSize: (nodeId: string) => void;
  handleDeleteNode: (id: string) => void;
  appendNodesWithUndo: (nodes: CanvasNode[], opts?: { selectIds?: string[] }) => void;
  createImageNodesFromBase64List: (base64List: string[]) => void;
  undoCanvasState: () => void;
  saveCurrentProject: () => Promise<boolean>;
  handleSaveDraftJsonSaveAs: () => void;
  fitViewportToSelectedNodes: () => void;
};

export function attachCanvasKeyboardShortcuts(
  getDeps: () => CanvasKeyboardShortcutDeps
): () => void {
    const handleKeyDown = (e: KeyboardEvent) => {
      const d = getDeps();
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT';
      const isContentEditable = (e.target as HTMLElement).isContentEditable;

      // 看图模式下：仅支持空格平移（其他快捷键在 AuditModeCanvas 内部处理）
      if (d.canvasMode === 'audit') {
        // 看图模式下 Ctrl+C 需要 preventDefault 以避免浏览器默认复制文本行为干扰
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
          e.preventDefault();
        }
        if (e.code === 'Space' && !isInput) {
          e.preventDefault();
          d.setActiveTool('pan');
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
        const defaultSize = d.DEFAULT_NODE_SIZES[type] || { width: 420, height: 300 };
        const mp = d.canvasMouseRef.current;
        const canvasX = mp.x - defaultSize.width / 2;
        const canvasY = mp.y - defaultSize.height / 2;
        d.addNodeAtCanvasPositionRef.current(type, canvasX, canvasY);
      };

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        d.setActiveTool('pan');
      } else if (e.code === 'KeyV' && !isInput && !e.ctrlKey && !e.metaKey) {
        d.setActiveTool('select');
      } else if (e.code === 'KeyB' && !isInput && !isContentEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        d.setActiveTool('boxSelect');
      } else if (e.code === 'KeyG' && !isInput && !isContentEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        d.selectedIdsRef.current.forEach(id => d.handleResetNodeSize(id));
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
        const sel = d.selectedIdsRef.current;
        if (sel.length === 0) {
          d.setEyedropperTargetNodeId(null);
          return;
        }
        const id = sel[0];
        d.setEyedropperTargetNodeId((prev) => (prev === id ? null : id));
      } else if (
        e.code === 'KeyC' &&
        !isInput &&
        !isContentEditable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !d.fullscreenImage
      ) {
        e.preventDefault();
        const sid = d.selectedIdsRef.current[0];
        if (!sid) return;
        const node = d.nodesRef.current.find(n => n.id === sid);
        if (!node) return;
        const mp = d.canvasMouseRef.current;
        const allRefs = collectCopyableImageRefsFromNode(node);
        if (allRefs.length === 0) return;

        const imgLen = Math.max(node.images?.length ?? 0, node.imageAssetIds?.length ?? 0);
        const copyAll =
          node.type === 'gridSplit' && allRefs.length > 1 && imgLen === 0;

        if (copyAll) {
          const newNodes = buildSpacedImageNodes(
            allRefs,
            mp.x - SPAWNED_IMAGE_NODE_WIDTH / 2,
            mp.y - SPAWNED_IMAGE_NODE_HEIGHT / 2
          );
          if (newNodes.length === 0) return;
          d.appendNodesWithUndo(newNodes, { selectIds: newNodes.map((n) => n.id) });
          return;
        }

        const ref = getNodePrimaryCopyRef(node);
        if (!ref) return;
        const payload = cloneImageSlotForNewNode(ref.base64, ref.assetId);
        if (!payload) return;
        const newNode: CanvasNode = {
          id: `image-${Date.now()}`,
          type: 'image',
          x: mp.x - SPAWNED_IMAGE_NODE_WIDTH / 2,
          y: mp.y - SPAWNED_IMAGE_NODE_HEIGHT / 2,
          width: SPAWNED_IMAGE_NODE_WIDTH,
          height: SPAWNED_IMAGE_NODE_HEIGHT,
          ...payload,
          currentImageIndex: 0,
        };
        d.appendNodesWithUndo([newNode], { selectIds: [newNode.id] });
      } else if (e.code === 'Escape') {
        if (d.showShortcutsPanel) {
          d.setShowShortcutsPanel(false);
          return;
        }
        // 清理所有拖拽/框选/缩放状态
        if (d.draggingNodeIdRef.current) {
          const acc = d.nodeDragAccumRef.current;
          if (acc) {
            clearNodeDragPreview(d.canvasTransformLayerRef.current, acc.nodeIds);
          }
          clearEdgeGeometryPreviews(d.edgesSvgRef.current);
          d.dragPreviewRef.current = null;
          d.draggingNodeIdRef.current = null;
          d.setDraggingNodeId(null);
          if (d.rafIdRef.current) { cancelAnimationFrame(d.rafIdRef.current); d.rafIdRef.current = null; }
          d.nodeDragAccumRef.current = null;
        }
        if (d.isSelectingRef.current) {
          if (d.boxSelectRafRef.current !== null) { cancelAnimationFrame(d.boxSelectRafRef.current); d.boxSelectRafRef.current = null; }
          d.isSelectingRef.current = false;
          d.setIsSelecting(false);
          d.selectionBoxRef.current = null;
          d.setSelectionBox(null);
          d.pressStartPosRef.current = null;
        }
        if (d.resizingNodeIdRef.current) {
          const preview = d.nodeResizePreviewRef.current;
          if (preview) {
            clearNodeGeometryPreview(d.canvasTransformLayerRef.current, preview.nodeId);
            d.nodeResizePreviewRef.current = null;
          }
          clearEdgeGeometryPreviews(d.edgesSvgRef.current);
          d.resizePreviewRef.current = null;
          d.resizingNodeIdRef.current = null;
          d.setResizingNodeId(null);
          d.setNodeResizePreview(null);
          d.setIsResizing(false);
          d.nodeResizeSessionRef.current = null;
        }
        d.activePointerTypeRef.current = null;
        d.setSelectedIds([]);
        d.setContextMenu(null);
        hideDraftEdgePath(d.draftEdgePathRef.current);
        d.draftEdgeRef.current = null;
        d.dragPreviewRef.current = null;
        d.resizePreviewRef.current = null;
        clearEdgeGeometryPreviews(d.edgesSvgRef.current);
        d.setFullscreenImage(null);
        d.setEyedropperTargetNodeId(null);
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && !isInput && !d.fullscreenImage) {
        d.selectedIdsRef.current.forEach(id => d.handleDeleteNode(id));
      } else if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.code === 'KeyQ' &&
        !isInput &&
        !isContentEditable &&
        !d.fullscreenImage
      ) {
        e.preventDefault();
        const sel = d.selectedIdsRef.current;
        if (sel.length === 0) return;
        sel.forEach((id) => d.handleDeleteNode(id));
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
        if (d.selectedIdsRef.current.length > 0) {
          const nodesList = d.selectedIdsRef.current.map(id => d.nodesRef.current.find(n => n.id === id)).filter(Boolean) as CanvasNode[];
          if (nodesList.length > 0) {
            // 只取第一个作为内部 d.clipboard（节点复制）
            d.setClipboard(nodesList[0]);
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
                    d.sharedClipboardImageRef.current = {
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
                    d.sharedClipboardImageRef.current = {
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
        d.lastPasteTimeRef.current = now;
        if (typeof navigator?.clipboard?.read === 'function') {
          navigator.clipboard.read().then(clipboardItems => {
            if (d.lastPasteTimeRef.current !== now) return;
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
                if (d.lastPasteTimeRef.current !== now) return;
                d.createImageNodesFromBase64List(base64List);
              })
              .catch(() => fallbackSharedClipboard());
          }).catch(() => fallbackSharedClipboard());
        } else {
          fallbackSharedClipboard();
        }

        function fallbackSharedClipboard() {
          if (d.lastPasteTimeRef.current !== now) return;
          if (d.sharedClipboardImageRef.current) {
            const img = d.sharedClipboardImageRef.current;
            const mp = d.canvasMouseRef.current;
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
            d.appendNodesWithUndo([newNode], { selectIds: [newNode.id] });
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyS' && !isInput && !(e.target as HTMLElement).isContentEditable) {
        e.preventDefault();
        void d.handleSaveDraftJsonSaveAs();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !e.altKey && !isInput && !(e.target as HTMLElement).isContentEditable) {
        e.preventDefault();
        void d.saveCurrentProject();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ' && !isInput && !d.fullscreenImage) {
        e.preventDefault();
        d.undoCanvasState();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !isInput && !isContentEditable) {
        e.preventDefault();
        const all = d.nodesRef.current;
        if (all.length === 0) return;
        const ids = all.map((n) => n.id);
        d.selectedIdsRef.current = ids;
        d.setSelectedIds(ids);
      } else if (
        e.code === 'KeyF' &&
        !isInput &&
        !isContentEditable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !d.fullscreenImage &&
        !e.repeat
      ) {
        e.preventDefault();
        d.fitViewportToSelectedNodes();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.code === 'KeyL' &&
        !isInput &&
        !isContentEditable &&
        !d.fullscreenImage
      ) {
        e.preventDefault();
        autoLayoutFromSelection();
      }
    };

    /** 自动排列选中节点及其连接的上下游节点为从左到右的流程布局 */
    const autoLayoutFromSelection = () => {
      const d = getDeps();
      const sel = d.selectedIdsRef.current;
      if (sel.length === 0) return;
      const nx = d.nodesRef.current;
      const ex = d.edgesRef.current;
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
      d.setNodes((prev) => prev.map((n) => updates.has(n.id) ? { ...n, ...updates.get(n.id)! } : n));
    };

    const handlePaste = (e: ClipboardEvent) => {
      const d = getDeps();
      // 防止 keydown 已处理过后的重复触发
      if (Date.now() - d.lastPasteTimeRef.current < 1000) return;

      // 看图模式下不处理粘贴（AuditModeCanvas 内部处理）
      if (d.canvasMode === 'audit') return;

      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (isInput) return;

      const imageFiles = collectImageFilesFromClipboardData(e.clipboardData?.items ?? null);
      if (imageFiles.length > 0) {
        e.preventDefault();
        void readFilesAsBase64(imageFiles)
          .then((base64List) => d.createImageNodesFromBase64List(base64List))
          .catch((err) => {
            console.error(err);
            alert('无法读取剪贴板中的图片。');
          });
        return;
      }

      // 优先从共享剪贴板粘贴（跨模式复制）
      if (d.sharedClipboardImageRef.current) {
        e.preventDefault();
        const img = d.sharedClipboardImageRef.current;
        const mp = d.canvasMouseRef.current;
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
        d.appendNodesWithUndo([newNode], { selectIds: [newNode.id] });
        return;
      }

      // 非图片剪贴板时，回退为节点复制粘贴
      if (d.clipboard) {
        e.preventDefault();
        const mp = d.canvasMouseRef.current;
        const newNode: CanvasNode = {
          ...clipboard,
          id: `${d.clipboard.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          x: mp.x,
          y: mp.y,
        };
        d.appendNodesWithUndo([newNode], { selectIds: [newNode.id] });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const d = getDeps();
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT';
      if (e.code === 'Space' && !isInput) {
        d.setActiveTool('select');
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
}

export function useCanvasKeyboardShortcuts(deps: CanvasKeyboardShortcutDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  useEffect(() => attachCanvasKeyboardShortcuts(() => depsRef.current), []);
}

