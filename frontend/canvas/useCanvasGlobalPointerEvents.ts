import { useEffect, type RefObject, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { CanvasNode, Edge, Transform } from '../types';
import type { DragPreview, ResizePreview } from './canvasEdgeGeometry';
import { hideDraftEdgePath } from './canvasDraftEdgeDom';
import {
  applyNodeDragPreview,
  clearNodeDragPreview,
  clearNodeGeometryPreview,
} from './canvasNodeDragDom';
import {
  applyEdgeDragPreview,
  applyEdgeResizePreview,
  clearEdgeGeometryPreviews,
} from './canvasEdgeDragDom';
import { buildMoveNodesCommand, type CanvasCommand } from './canvasCommands';

export type UseCanvasGlobalPointerEventsOptions = {
  containerRef: RefObject<HTMLDivElement>;
  transformRef: RefObject<Transform>;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  selectedIdsRef: RefObject<string[]>;
  canvasTransformLayerRef: RefObject<HTMLDivElement | null>;
  edgesSvgRef: RefObject<SVGSVGElement | null>;
  draftEdgeRef: RefObject<{ sourceId: string; x: number; y: number } | null>;
  draftEdgePathRef: RefObject<SVGPathElement | null>;
  dragPreviewRef: RefObject<DragPreview | null>;
  resizePreviewRef: RefObject<ResizePreview | null>;
  activePointerTypeRef: RefObject<'canvas' | 'node' | 'edge' | 'fullscreen' | 'resize' | 'boxSelect' | 'selection' | 'selectStart' | null>;
  lastMousePosRef: RefObject<{ x: number; y: number }>;
  lastFsMousePosRef: RefObject<{ x: number; y: number }>;
  canvasMouseRef: RefObject<{ x: number; y: number }>;
  draggingNodeIdRef: RefObject<string | null>;
  rafIdRef: RefObject<number | null>;
  nodeDragAccumRef: RefObject<{ nodeIds: string[]; deltaX: number; deltaY: number } | null>;
  altDupPendingRef: RefObject<boolean>;
  altDupDoneRef: RefObject<boolean>;
  altDupClickNodeIdRef: RefObject<string | null>;
  altDragScreenAccumRef: RefObject<{ x: number; y: number }>;
  nodeDragHistoryStartRef: RefObject<Map<string, { x: number; y: number }> | null>;
  isSelectingRef: RefObject<boolean>;
  selectionBoxRef: RefObject<{ x: number; y: number; width: number; height: number } | null>;
  boxSelectRafRef: RefObject<number | null>;
  pressStartPosRef: RefObject<{ x: number; y: number } | null>;
  longPressTimerRef: RefObject<number | null>;
  nodeResizeSessionRef: RefObject<{
    nodeId: string;
    origin: CanvasNode;
    direction: string;
    grabCanvasX: number;
    grabCanvasY: number;
    minWidth: number;
    minHeight: number;
  } | null>;
  nodeResizePreviewRef: RefObject<{ nodeId: string; x: number; y: number; width: number; height: number } | null>;
  resizingNodeIdRef: RefObject<string | null>;
  resizeDirectionRef: RefObject<string>;
  edgeDraggingRef: RefObject<{ edgeId: string; x: number; y: number; nearStart: boolean; nearEnd: boolean } | null>;
  wheelTransformCommitTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  duplicateNodesSubgraphForAltDragRef: RefObject<() => void>;
  pushCanvasCommandRef: RefObject<(cmd: CanvasCommand) => void>;
  refreshDraftEdgePath: () => void;
  findConnectTargetNode: (mouseX: number, mouseY: number, sourceId: string) => CanvasNode | null;
  computeNodeResizeFromPointer: (
    origin: CanvasNode,
    direction: string,
    px: number,
    py: number,
    grabCanvasX: number,
    grabCanvasY: number,
    shiftKey: boolean,
    minWidth: number,
    minHeight: number,
  ) => { x: number; y: number; width: number; height: number };
  applyLiveCanvasTransform: (tf: Transform) => void;
  commitTransformFromRef: () => void;
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setDraggingNodeId: Dispatch<SetStateAction<string | null>>;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
  setSelectionBox: Dispatch<SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; canvasX: number; canvasY: number } | null>>;
  setPendingEdgeSourceId: Dispatch<SetStateAction<string | null>>;
  setDraggingEdgeId: Dispatch<SetStateAction<string | null>>;
  setResizingNodeId: Dispatch<SetStateAction<string | null>>;
  setNodeResizePreview: Dispatch<SetStateAction<ResizePreview | null>>;
  setResizeDirection: Dispatch<SetStateAction<string>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setFsTransform: Dispatch<SetStateAction<{ x: number; y: number; scale: number }>>;
};

export function useCanvasGlobalPointerEvents(opts: UseCanvasGlobalPointerEventsOptions) {
  const {
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
  } = opts;

  useEffect(() => {
    const commitNodeResizeSession = () => {
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
      nodeResizeSessionRef.current = null;
      setNodeResizePreview(null);
      setResizingNodeId(null);
      resizingNodeIdRef.current = null;
      setResizeDirection('');
      resizeDirectionRef.current = '';
      setIsResizing(false);
    };

    const handleGlobalPointerMove = (e: PointerEvent) => {
    // 安全兜底：鼠标按键已释放但未收到 pointerup 时，强制清理拖拽/框选状态（缩放仅 pointerup 结束，避免误触）
    // 注意：'canvas'（pan 工具 / 中键平移）不在此处清——
    // 中键 pan 时浏览器 autoscroll 偶尔会派发 buttons===0 的 pointermove，
    // 这里清掉 activePointerTypeRef.current=null 会让后续 pan 事件被忽略，
    // 造成"卡住/弹回"。pan 由 pointerup / pointercancel 自然结束。
    if (e.buttons === 0 && activePointerTypeRef.current
        && activePointerTypeRef.current !== 'resize'
        && activePointerTypeRef.current !== 'canvas') {
      if (draggingNodeIdRef.current) {
        draggingNodeIdRef.current = null;
        setDraggingNodeId(null);
        if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
        if (nodeDragAccumRef.current) {
          clearNodeDragPreview(canvasTransformLayerRef.current, nodeDragAccumRef.current.nodeIds);
        }
        clearEdgeGeometryPreviews(edgesSvgRef.current);
        dragPreviewRef.current = null;
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
      const tf = transformRef.current;
      const next = { ...tf, x: tf.x + dx, y: tf.y + dy };
      transformRef.current = next;
      applyLiveCanvasTransform(next);
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
      
      // 使用 RAF 批量更新 DOM 预览（pointerup 再 commit 到 state）
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          const acc = nodeDragAccumRef.current;
          if (acc) {
            applyNodeDragPreview(canvasTransformLayerRef.current, acc.nodeIds, acc.deltaX, acc.deltaY);
            const preview = { nodeIds: acc.nodeIds, deltaX: acc.deltaX, deltaY: acc.deltaY };
            dragPreviewRef.current = preview;
            applyEdgeDragPreview(
              edgesSvgRef.current,
              edgesRef.current,
              new Map(nodesRef.current.map((n) => [n.id, n])),
              preview,
            );
          }
          rafIdRef.current = null;
        });
      }
      
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (pointerType === 'edge') {
      const rect = containerRef.current!.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale;
      const mouseY = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale;

      // 更新连线草稿（DOM 直写，避免每帧 setState）
      if (draftEdgeRef.current) {
        let snappedX = mouseX;
        let snappedY = mouseY;
        if (draftEdgeRef.current.sourceId) {
          const targetNode = findConnectTargetNode(mouseX, mouseY, draftEdgeRef.current.sourceId);
          if (targetNode) {
            snappedX = targetNode.x;
            snappedY = targetNode.y + targetNode.height / 2;
          }
        }
        draftEdgeRef.current = { ...draftEdgeRef.current, x: snappedX, y: snappedY };
        refreshDraftEdgePath();
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
        const preview = { nodeId: id, ...next };
        nodeResizePreviewRef.current = preview;
        resizePreviewRef.current = preview;
        setNodeResizePreview(preview);
        applyEdgeResizePreview(
          edgesSvgRef.current,
          edgesRef.current,
          new Map(nodesRef.current.map((n) => [n.id, n])),
          preview,
        );
      }
    }
  };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      const pointerType = activePointerTypeRef.current;

      if (pointerType === 'canvas') {
        commitTransformFromRef();
      }

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
        if (acc) {
          clearNodeDragPreview(canvasTransformLayerRef.current, acc.nodeIds);
        }
        clearEdgeGeometryPreviews(edgesSvgRef.current);
        dragPreviewRef.current = null;
        if (acc && (acc.deltaX !== 0 || acc.deltaY !== 0)) {
          const { nodeIds, deltaX, deltaY } = acc;
          const workingNodes = nodesRef.current.map((node) =>
            nodeIds.includes(node.id) ? { ...node, x: node.x + deltaX, y: node.y + deltaY } : node,
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
        commitNodeResizeSession();
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
        hideDraftEdgePath(draftEdgePathRef.current);
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
      if (wheelTransformCommitTimerRef.current) {
        clearTimeout(wheelTransformCommitTimerRef.current);
        wheelTransformCommitTimerRef.current = null;
      }
    };
  }, [applyLiveCanvasTransform, commitTransformFromRef, findConnectTargetNode, refreshDraftEdgePath]);
}

