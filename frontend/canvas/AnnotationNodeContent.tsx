import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Annotation, AnnotationNode, CanvasNode, Edge } from '../types';
import { CopyIcon, EyedropperIcon, FullscreenIcon, ImageIcon, FlipHorizontalIcon } from './canvasIcons';
import { flipAndStoreAsset } from './imageFlipUtils';
import { OptimizedImage } from './OptimizedImage';
import { getNodePrimaryImageRef } from '../referenceSlots';
import { findAnnotationAtPoint, translateAnnotation } from './annotationTransform';

export interface AnnotationNodeContentProps {
  node: AnnotationNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onEyedropperPickLink?: () => void;
  onUpdate: (updates: Partial<AnnotationNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
  onCopyToImage?: () => void;
  onFullscreenImage?: (base64: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
}
export function AnnotationNodeContent({ node, nodes, edges, eyedropperTargetNodeId, onEyedropperSelect, onEyedropperPickLink, onUpdate, onCreateImageNode, onCopyToImage, onFullscreenImage, onDeleteEdge }: AnnotationNodeContentProps) {
  // 计算链接到该节点的源图片
  const incomingEdges = edges.filter(e => e.targetId === node.id);
  const sourceNodes = incomingEdges
    .map(e => nodes.find(n => n.id === e.sourceId))
    .filter(Boolean) as CanvasNode[];
  const connectedRefCount = sourceNodes.filter((n) => getNodePrimaryImageRef(n) !== null).length;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'fillRect' | 'fillCircle' | 'crop' | 'move'>('rect');
  const [exportScale, setExportScale] = useState<number>(node.exportScale ?? 100);
  const [currentColor, setCurrentColor] = useState('#ff6b6b');
  const [fillOpacity, setFillOpacity] = useState(0.45);
  const fillOpacityRef = useRef(0.45);
  const [currentFontSize, setCurrentFontSize] = useState(16);
  const [currentPenSize, setCurrentPenSize] = useState(8);
  /** 裁切选区（画布坐标），等待确认 */
  const [cropPending, setCropPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropPendingRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    cropPendingRef.current = cropPending;
  }, [cropPending]);
  const cropDragRef = useRef<{ x: number; y: number; endX: number; endY: number } | null>(null);
  type CropAdjustMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
  const cropAdjustRef = useRef<{ mode: CropAdjustMode; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);
  const cropPointerIdRef = useRef<number | null>(null);
  /** 拖动已有标注 */
  const annMoveRef = useRef<{ id: string; startX: number; startY: number; orig: Annotation } | null>(null);
  const annMovePreviewRef = useRef<Annotation | null>(null);
  const annPointerIdRef = useRef<number | null>(null);
  /** 最近与嵌入标注画布交互，用于 Ctrl+Z 作用域 */
  const annotationHotRef = useRef(false);

  const canvasPointFromEvent = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const releaseCropPointerCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const pid = cropPointerIdRef.current;
    if (canvas && pid != null && canvas.hasPointerCapture(pid)) {
      canvas.releasePointerCapture(pid);
    }
    cropPointerIdRef.current = null;
  }, []);

  const releaseAnnPointerCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const pid = annPointerIdRef.current;
    if (canvas && pid != null && canvas.hasPointerCapture(pid)) {
      canvas.releasePointerCapture(pid);
    }
    annPointerIdRef.current = null;
  }, []);

  const releaseFsAnnPointerCapture = useCallback(() => {
    const canvas = fsCanvasRef.current;
    const pid = fsAnnPointerIdRef.current;
    if (canvas && pid != null && canvas.hasPointerCapture(pid)) {
      canvas.releasePointerCapture(pid);
    }
    fsAnnPointerIdRef.current = null;
  }, []);

  const cropCursorForMode = (mode: CropAdjustMode): string => {
    switch (mode) {
      case 'move': return 'move';
      case 'nw':
      case 'se': return 'nwse-resize';
      case 'ne':
      case 'sw': return 'nesw-resize';
      case 'n':
      case 's': return 'ns-resize';
      case 'e':
      case 'w': return 'ew-resize';
    }
  };

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
  const [fullscreenTool, setFullscreenTool] = useState<'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'fillRect' | 'fillCircle' | 'crop' | 'move'>('rect');
  const [fullscreenColor, setFullscreenColor] = useState('#ff6b6b');
  const [fullscreenFillOpacity, setFullscreenFillOpacity] = useState(0.45);
  const fullscreenFillOpacityRef = useRef(0.45);
  const [fullscreenFontSize, setFullscreenFontSize] = useState(24);
  const [fullscreenPenSize, setFullscreenPenSize] = useState(8);
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
  /** 全屏初次适配窗口时的显示尺寸，用于滚轮缩放上下限 */
  const fsFitDisplayRef = useRef<{ w: number; h: number } | null>(null);
  /**
   * 全屏模式下用户上次主动设置的缩放百分比（key = sourceImage|sourceImageAssetId）。
   * 离开全屏再次进入、容器尺寸变化触发 useEffect 重跑时，恢复这个值而不是无脑回到 100%。
   * 切换 source image 时 key 不匹配，相当于清空。
   */
  const fsSavedZoomPercentRef = useRef<{ key: string; percent: number } | null>(null);
  const [fsZoomPercent, setFsZoomPercent] = useState(100);
  const fsPenPointsRef = useRef<{x: number, y: number}[]>([]);
  const fsIsDrawingRef = useRef(false);
  const fsToolRef = useRef(fullscreenTool);
  const fsColorRef = useRef(fullscreenColor);
  const fsFontSizeRef = useRef(fullscreenFontSize);
  const fsPenSizeRef = useRef(fullscreenPenSize);
  const fsTempRef = useRef<Partial<Annotation> | null>(null);
  const fsAnnotationsRef = useRef<Annotation[]>([]);
  /** 全屏裁切选区（全屏画布坐标） */
  const [fsCropPending, setFsCropPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const fsCropPendingRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const fsCropDragRef = useRef<{ x: number; y: number; endX: number; endY: number } | null>(null);
  const fsCropAdjustRef = useRef<{ mode: CropAdjustMode; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);
  const fsCropPointerIdRef = useRef<number | null>(null);
  const fsAnnMoveRef = useRef<{ id: string; startX: number; startY: number; orig: Annotation } | null>(null);
  const fsAnnMovePreviewRef = useRef<Annotation | null>(null);
  const fsAnnPointerIdRef = useRef<number | null>(null);
  const fsSpaceDownRef = useRef(false);
  const fsIsPanningRef = useRef(false);
  const [isFsPanning, setIsFsPanning] = useState(false);
  const fsPanLastClientRef = useRef({ x: 0, y: 0 });
  const fsPanPointerIdRef = useRef<number | null>(null);

  // 全屏标注历史记录 — 使用 ref 存储避免闭包陷阱
  const fsAnnotationHistoryRef = useRef<Annotation[][]>([[]]);
  const fsHistoryIndexRef = useRef(0);
  const fsLastSavedHistoryRef = useRef<string>('');

  // 全屏撤销
  const fsUndo = () => {
    if (fsHistoryIndexRef.current > 0) {
      fsHistoryIndexRef.current--;
      const prevAnnotations = fsAnnotationHistoryRef.current[fsHistoryIndexRef.current];
      fsLastSavedHistoryRef.current = JSON.stringify(prevAnnotations);
      setFullscreenAnnotations(prevAnnotations);
      fsAnnotationsRef.current = prevAnnotations;
      renderFsCanvas();
    }
  };

  // 保存全屏标注状态到历史
  const fsSaveToHistory = (annots: Annotation[]) => {
    const currentJson = JSON.stringify(annots);
    if (currentJson !== fsLastSavedHistoryRef.current) {
      const history = fsAnnotationHistoryRef.current;
      const newHistory = history.slice(0, fsHistoryIndexRef.current + 1);
      newHistory.push([...annots]);
      fsHistoryIndexRef.current = newHistory.length - 1;
      if (newHistory.length > 50) {
        newHistory.shift();
        fsHistoryIndexRef.current--;
      }
      fsAnnotationHistoryRef.current = newHistory;
      fsLastSavedHistoryRef.current = currentJson;
    }
  };

  // 同步 ref
  useEffect(() => { fsToolRef.current = fullscreenTool; }, [fullscreenTool]);
  useEffect(() => { fsColorRef.current = fullscreenColor; }, [fullscreenColor]);
  useEffect(() => { fsFontSizeRef.current = fullscreenFontSize; }, [fullscreenFontSize]);
  useEffect(() => { fsPenSizeRef.current = fullscreenPenSize; }, [fullscreenPenSize]);
  useEffect(() => { fullscreenFillOpacityRef.current = fullscreenFillOpacity; }, [fullscreenFillOpacity]);
  useEffect(() => { fsAnnotationsRef.current = fullscreenAnnotations; }, [fullscreenAnnotations]);
  useEffect(() => {
    fsCropPendingRef.current = fsCropPending;
  }, [fsCropPending]);
  useEffect(() => {
    if (fullscreenTool !== 'crop') {
      fsCropDragRef.current = null;
      fsCropAdjustRef.current = null;
      setFsCropPending(null);
    }
  }, [fullscreenTool]);

  const fsCanvasPointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const releaseFsCropPointerCapture = useCallback(() => {
    const canvas = fsCanvasRef.current;
    const pid = fsCropPointerIdRef.current;
    if (canvas && pid != null && canvas.hasPointerCapture(pid)) {
      canvas.releasePointerCapture(pid);
    }
    fsCropPointerIdRef.current = null;
  }, []);

  const releaseFsPanPointerCapture = useCallback(() => {
    const canvas = fsCanvasRef.current;
    const pid = fsPanPointerIdRef.current;
    if (canvas && pid != null && canvas.hasPointerCapture(pid)) {
      canvas.releasePointerCapture(pid);
    }
    fsPanPointerIdRef.current = null;
  }, []);

  const updateFsCanvasCursor = useCallback(() => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    if (fsIsPanningRef.current) {
      canvas.style.cursor = 'grabbing';
    } else if (fsSpaceDownRef.current) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'crosshair';
    }
  }, []);

  const getFsImageDisplayRect = useCallback(() => {
    const fs = fsImageRef.current;
    if (!fs) return null;
    return { x: fs.x, y: fs.y, w: fs.w, h: fs.h };
  }, []);

  const isInFsImageArea = useCallback((x: number, y: number) => {
    const rect = getFsImageDisplayRect();
    if (!rect) return false;
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }, [getFsImageDisplayRect]);
  useEffect(() => { fsTempRef.current = fsTempAnnotation; }, [fsTempAnnotation]);
  useEffect(() => { fsIsDrawingRef.current = isFsDrawing; }, [isFsDrawing]);

  // 优先定义 sourceImage，因为其他 ref 会用到它
  const sourceImage = node.sourceImage ?? '';
  const sourceImageAssetId = node.sourceImageAssetId;
  const hasSourceImage = !!(sourceImage || sourceImageAssetId);
  // source image 变化时清空 saved zoom：缩放比例是按图片分别记忆的，避免不同图片串味
  useEffect(() => {
    fsSavedZoomPercentRef.current = null;
  }, [sourceImage, sourceImageAssetId]);
  const annotations = node.annotations ?? [];
  const selectedId = node.selectedAnnotationId;
  const annotationsRef = useRef(annotations);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
  const resolvedSourceUrlRef = useRef('');
  const isDrawingRef = useRef(false);
  const currentToolRef = useRef(currentTool);
  const currentColorRef = useRef(currentColor);
  const currentFontSizeRef = useRef(currentFontSize);
  const currentPenSizeRef = useRef(currentPenSize);
  const tempAnnotationRef = useRef<Partial<Annotation> | null>(null);
  const penPointsRef = useRef<{x: number, y: number}[]>([]);

  // 图片缓存
  const imageCacheRef = useRef<{src: string, img: HTMLImageElement, x: number, y: number, w: number, h: number} | null>(null);

  /** 嵌入画布图片布局；全屏确认时若尚未缓存则用全屏已加载的图片补全 */
  const ensureEmbeddedImageLayout = () => {
    if (imageCacheRef.current?.img) return imageCacheRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const fs = fsImageRef.current;
    if (!canvas || !fs?.img) return null;

    const rect = container?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    if (canvas.width < 1 || canvas.height < 1) return null;

    const img = fs.img;
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const layout = {
      src: resolvedSourceUrlRef.current || '',
      img,
      x: (canvas.width - dw) / 2,
      y: (canvas.height - dh) / 2,
      w: dw,
      h: dh,
    };
    imageCacheRef.current = layout;
    return layout;
  };

  // 撤销历史记录 — 使用 ref 存储避免闭包陷阱
  const annotationHistoryRef = useRef<Annotation[][]>([[]]);
  const historyIndexRef = useRef(0);
  const lastSavedHistoryRef = useRef<string>('');

  // 撤销
  const undo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const prevAnnotations = annotationHistoryRef.current[historyIndexRef.current];
      lastSavedHistoryRef.current = JSON.stringify(prevAnnotations);
      onUpdate({ annotations: prevAnnotations });
      renderCanvas();
    }
  };

  const deleteSelectedAnnotation = () => {
    const sid = selectedId;
    if (!sid) return;
    const currentAnnots = annotationsRef.current;
    const newAnnotations = currentAnnots.filter((a) => a.id !== sid);
    saveToHistory(currentAnnots);
    onUpdate({ annotations: newAnnotations, selectedAnnotationId: undefined });
    renderCanvas();
  };

  // 保存当前状态到历史
  const saveToHistory = (annots: Annotation[]) => {
    const currentJson = JSON.stringify(annots);
    if (currentJson !== lastSavedHistoryRef.current) {
      const history = annotationHistoryRef.current;
      const newHistory = history.slice(0, historyIndexRef.current + 1);
      newHistory.push([...annots]);
      historyIndexRef.current = newHistory.length - 1;
      // 限制历史记录数量
      if (newHistory.length > 50) {
        newHistory.shift();
        historyIndexRef.current--;
      }
      annotationHistoryRef.current = newHistory;
      lastSavedHistoryRef.current = currentJson;
    }
  };

  // 保持 ref 与 state 同步
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);
  useEffect(() => { currentFontSizeRef.current = currentFontSize; }, [currentFontSize]);
  useEffect(() => { currentPenSizeRef.current = currentPenSize; }, [currentPenSize]);
  useEffect(() => { fillOpacityRef.current = fillOpacity; }, [fillOpacity]);
  useEffect(() => { tempAnnotationRef.current = tempAnnotation; }, [tempAnnotation]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // 全屏标注模式：Delete/Backspace 删除选中的全屏标注；Ctrl/Cmd+Z 撤销全屏操作
      if (isFullscreenAnnotation) {
        if (isFsTextInputMode) return; // 全屏文本输入框聚焦时不拦截
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          fsUndo();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          // 始终拦截 Delete/Backspace，避免冒泡到 useCanvasKeyboardShortcuts 把整个图片标注节点删除
          e.preventDefault();
          e.stopPropagation();
          if (fullscreenSelectedId) {
            deleteFsAnnotation(fullscreenSelectedId);
          }
        }
        return;
      }
      if (!annotationHotRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          e.stopPropagation();
          deleteSelectedAnnotation();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isFullscreenAnnotation, selectedId, fullscreenSelectedId, isFsTextInputMode]);

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

  type FsImageRect = { x: number; y: number; w: number; h: number };

  const remapFsCanvasRect = (
    r: { x: number; y: number; w: number; h: number },
    oldR: FsImageRect,
    newR: FsImageRect
  ) => {
    const sx = newR.w / oldR.w;
    const sy = newR.h / oldR.h;
    return {
      x: newR.x + (r.x - oldR.x) * sx,
      y: newR.y + (r.y - oldR.y) * sy,
      w: r.w * sx,
      h: r.h * sy,
    };
  };

  const remapAnnotationInFs = (ann: Annotation, oldR: FsImageRect, newR: FsImageRect): Annotation => {
    const sx = newR.w / oldR.w;
    const sy = newR.h / oldR.h;
    const mp = (px: number, py: number) => ({
      x: newR.x + (px - oldR.x) * sx,
      y: newR.y + (py - oldR.y) * sy,
    });
    const strokeScale = Math.min(sx, sy);
    const p0 = mp(ann.x, ann.y);
    const out: Annotation = {
      ...ann,
      x: p0.x,
      y: p0.y,
      strokeWidth: Math.max(1, (ann.strokeWidth || 2) * strokeScale),
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
  };

  const remapPartialAnnotationInFs = (
    ann: Partial<Annotation>,
    oldR: FsImageRect,
    newR: FsImageRect
  ): Partial<Annotation> => {
    if (ann.x == null || ann.y == null) return ann;
    return remapAnnotationInFs(ann as Annotation, oldR, newR);
  };

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
        if (ann.points && ann.points.length > 0) {
          const sw = ann.strokeWidth || 8;
          ctx.strokeStyle = ann.color;
          ctx.fillStyle = ann.color;
          ctx.lineWidth = sw;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (ann.points.length === 1) {
            ctx.beginPath();
            ctx.arc(ann.points[0].x, ann.points[0].y, sw / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(ann.points[0].x, ann.points[0].y);
            for (let i = 1; i < ann.points.length; i++) {
              ctx.lineTo(ann.points[i].x, ann.points[i].y);
            }
            ctx.stroke();
          }
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

    const imgSrc = resolvedSourceUrlRef.current;
    if (imgSrc) {
      // 使用缓存或加载图片
      if (imageCacheRef.current && imageCacheRef.current.src === imgSrc) {
        const cached = imageCacheRef.current;
        ctx.drawImage(cached.img, cached.x, cached.y, cached.w, cached.h);
        renderAnnotations(ctx);
        drawCropOverlay(ctx, canvas.width, canvas.height);
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
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
        img.src = imgSrc;
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
    // 八个调整把手（四角 + 四边中点）
    const handleSize = 8;
    const handles: [number, number][] = [
      [cx, cy],
      [cx + cwid / 2, cy],
      [cx + cwid, cy],
      [cx, cy + chgt / 2],
      [cx + cwid, cy + chgt / 2],
      [cx, cy + chgt],
      [cx + cwid / 2, cy + chgt],
      [cx + cwid, cy + chgt],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
    }
    ctx.restore();
  };

  // 渲染所有标注
  const renderAnnotations = (ctx: CanvasRenderingContext2D) => {
    const movePreview = annMovePreviewRef.current;
    // 绘制已保存的标注
    annotationsRef.current.forEach((ann) => {
      const drawAnn = movePreview && movePreview.id === ann.id ? movePreview : ann;
      drawAnnotation(ctx, drawAnn, ann.id === selectedId);
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
    if (points.length > 0) {
      const penSize = currentPenSizeRef.current;
      ctx.strokeStyle = currentColorRef.current;
      ctx.fillStyle = currentColorRef.current;
      ctx.lineWidth = penSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, penSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
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

  useEffect(() => {
    let cancelled = false;
    imageCacheRef.current = null;
    if (!hasSourceImage) {
      resolvedSourceUrlRef.current = '';
      renderCanvas();
      return;
    }
    void import('../services/canvasAssetResolver').then(({ resolveCanvasImageSource }) =>
      resolveCanvasImageSource(sourceImage, sourceImageAssetId).then((url) => {
        if (cancelled) return;
        resolvedSourceUrlRef.current = url;
        renderCanvas();
      })
    );
    return () => {
      cancelled = true;
    };
  }, [sourceImage, sourceImageAssetId, hasSourceImage]);

  // 当标注变化时重新渲染
  useEffect(() => {
    renderCanvas();
  }, [annotations, selectedId]);

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

  const handleMouseDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = canvasPointFromEvent(e);

    // 裁切：先处理拖动调整已有选区（需在「是否在图片内」判断之前，以便命中把手）
    if (currentToolRef.current === 'crop') {
      if (!resolvedSourceUrlRef.current) return;
      const pending = cropPendingRef.current;
      if (pending) {
        const hit = hitCropZone(x, y, pending, 12);
        if (hit) {
          cropAdjustRef.current = { mode: hit, startX: x, startY: y, orig: { ...pending } };
          isDrawingRef.current = true;
          setIsDrawing(true);
          cropPointerIdRef.current = e.pointerId;
          canvas.setPointerCapture(e.pointerId);
          return;
        }
        // 点击选区外：保留当前选区，允许拖出新框覆盖（不在 mousedown 时清除）
      }
      if (!isInImageArea(x, y)) return;
      cropDragRef.current = { x, y, endX: x, endY: y };
      isDrawingRef.current = true;
      setIsDrawing(true);
      cropPointerIdRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // 点击已有标注：拖动移动（裁切工具除外）
    if (currentToolRef.current !== 'crop') {
      const hitAnn = findAnnotationAtPoint(x, y, annotationsRef.current);
      if (hitAnn) {
        annMoveRef.current = { id: hitAnn.id, startX: x, startY: y, orig: { ...hitAnn } };
        annMovePreviewRef.current = { ...hitAnn };
        isDrawingRef.current = true;
        setIsDrawing(true);
        onUpdate({ selectedAnnotationId: hitAnn.id });
        annPointerIdRef.current = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (currentToolRef.current === 'move') {
        onUpdate({ selectedAnnotationId: undefined });
        return;
      }
    }

    if (currentToolRef.current === 'move') return;

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
      const penSize = currentPenSizeRef.current;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = currentColorRef.current;
          ctx.beginPath();
          ctx.arc(x, y, penSize / 2, 0, Math.PI * 2);
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

  const handleAnnotationHover = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || isDrawingRef.current || currentToolRef.current === 'crop') return;
    const { x, y } = canvasPointFromEvent(e);
    const hit = findAnnotationAtPoint(x, y, annotationsRef.current);
    canvas.style.cursor = hit ? 'move' : 'crosshair';
  };

  const handleCropHover = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || currentToolRef.current !== 'crop' || isDrawingRef.current) return;
    const pending = cropPendingRef.current;
    if (!pending) {
      canvas.style.cursor = 'crosshair';
      return;
    }
    const { x, y } = canvasPointFromEvent(e);
    const hit = hitCropZone(x, y, pending, 12);
    canvas.style.cursor = hit ? cropCursorForMode(hit) : 'crosshair';
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let { x, y } = canvasPointFromEvent(e);

    // 获取图片显示区域
    const imgRect = getImageDisplayRect();
    if (imgRect) {
      // 限制坐标在图片区域内
      x = Math.max(imgRect.x, Math.min(imgRect.x + imgRect.w, x));
      y = Math.max(imgRect.y, Math.min(imgRect.y + imgRect.h, y));
    }

    if (annMoveRef.current) {
      const d = annMoveRef.current;
      const dx = x - d.startX;
      const dy = y - d.startY;
      annMovePreviewRef.current = translateAnnotation(d.orig, dx, dy);
      renderCanvas();
      return;
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
      const penSize = currentPenSizeRef.current;
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = currentColorRef.current;
          ctx.lineWidth = penSize;
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

  const handleMouseUp = (e?: React.PointerEvent) => {
    if (!isDrawingRef.current) return;

    if (annMoveRef.current && annMovePreviewRef.current) {
      const moved = annMovePreviewRef.current;
      const currentAnnots = annotationsRef.current;
      const newAnnotations = currentAnnots.map((a) => (a.id === moved.id ? moved : a));
      saveToHistory(currentAnnots);
      onUpdate({ annotations: newAnnotations, selectedAnnotationId: moved.id });
      annMoveRef.current = null;
      annMovePreviewRef.current = null;
      isDrawingRef.current = false;
      setIsDrawing(false);
      releaseAnnPointerCapture();
      renderCanvas();
      if (e) handleAnnotationHover(e);
      return;
    }

    if (cropAdjustRef.current) {
      cropAdjustRef.current = null;
      isDrawingRef.current = false;
      setIsDrawing(false);
      releaseCropPointerCapture();
      renderCanvas();
      return;
    }

    if (cropDragRef.current) {
      const d = cropDragRef.current;
      cropDragRef.current = null;
      isDrawingRef.current = false;
      setIsDrawing(false);
      releaseCropPointerCapture();
      const cx = Math.min(d.x, d.endX);
      const cy = Math.min(d.y, d.endY);
      const cw = Math.abs(d.endX - d.x);
      const ch = Math.abs(d.endY - d.y);
      if (cw > 5 && ch > 5) {
        const ir = getImageDisplayRect();
        const next = { x: cx, y: cy, w: cw, h: ch };
        setCropPending(ir ? clampCropRect(next, ir) : next);
      }
      renderCanvas();
      if (e) handleCropHover(e);
      return;
    }

    // 画笔
    if (currentToolRef.current === 'pen') {
      const points = penPointsRef.current;
      if (points.length >= 1) {
        const newAnnotation: Annotation = {
          id: `ann-${Date.now()}`,
          type: 'pen',
          x: points[0].x,
          y: points[0].y,
          points: [...points],
          color: currentColorRef.current,
          strokeWidth: currentPenSizeRef.current,
        };
        const currentAnnots = annotationsRef.current;
        const newAnnotations = [...currentAnnots, newAnnotation];
        saveToHistory(currentAnnots);
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
          const currentAnnots = annotationsRef.current;
          const newAnnotations = [...currentAnnots, next];
          saveToHistory(currentAnnots);
          onUpdate({ annotations: newAnnotations });
        }
      } else if (ann.type === 'arrow') {
        const dist = Math.hypot((ann.endX ?? 0) - (ann.x ?? 0), (ann.endY ?? 0) - (ann.y ?? 0));
        if (dist > 10) {
          const currentAnnots = annotationsRef.current;
          const newAnnotations = [...currentAnnots, ann as Annotation];
          saveToHistory(currentAnnots);
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
        if (ann.points && ann.points.length > 0) {
          const sw = ann.strokeWidth || 8;
          ctx.strokeStyle = ann.color;
          ctx.fillStyle = ann.color;
          ctx.lineWidth = sw;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (ann.points.length === 1) {
            ctx.beginPath();
            ctx.arc(ann.points[0].x, ann.points[0].y, sw / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(ann.points[0].x, ann.points[0].y);
            for (let i = 1; i < ann.points.length; i++) {
              ctx.lineTo(ann.points[i].x, ann.points[i].y);
            }
            ctx.stroke();
          }
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
    const fsMovePreview = fsAnnMovePreviewRef.current;
    fsAnnotationsRef.current.forEach((ann) => {
      const drawAnn = fsMovePreview && fsMovePreview.id === ann.id ? fsMovePreview : ann;
      drawFsAnnotation(ctx, drawAnn, ann.id === fullscreenSelectedId);
    });
    // 绘制临时标注
    if (fsTempRef.current) {
      drawFsAnnotation(ctx, fsTempRef.current as Annotation, false);
    }
    drawFsCropOverlay(ctx, canvas.width, canvas.height);
  };

  /** 全屏裁切蒙层 */
  const drawFsCropOverlay = (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    let cx: number;
    let cy: number;
    let cwid: number;
    let chgt: number;
    const drag = fsCropDragRef.current;
    if (drag) {
      cx = Math.min(drag.x, drag.endX);
      cy = Math.min(drag.y, drag.endY);
      cwid = Math.abs(drag.endX - drag.x);
      chgt = Math.abs(drag.endY - drag.y);
    } else if (fsCropPending) {
      cx = fsCropPending.x;
      cy = fsCropPending.y;
      cwid = fsCropPending.w;
      chgt = fsCropPending.h;
    } else {
      return;
    }
    if (cwid < 2 || chgt < 2) return;
    const cached = fsImageRef.current;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.clearRect(cx, cy, cwid, chgt);
    if (cached) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cwid, chgt);
      ctx.clip();
      ctx.drawImage(cached.img, cached.x, cached.y, cached.w, cached.h);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(100, 180, 255, 0.35)';
    ctx.fillRect(cx, cy, cwid, chgt);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cx, cy, cwid, chgt);
    ctx.setLineDash([]);
    const handleSize = 8;
    const handles: [number, number][] = [
      [cx, cy],
      [cx + cwid / 2, cy],
      [cx + cwid, cy],
      [cx, cy + chgt / 2],
      [cx + cwid, cy + chgt / 2],
      [cx, cy + chgt],
      [cx + cwid / 2, cy + chgt],
      [cx + cwid, cy + chgt],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
    }
    ctx.restore();
  };

  useEffect(() => {
    if (isFullscreenAnnotation) renderFsCanvas();
  }, [fsCropPending, isFullscreenAnnotation]);

  const syncFsImageDisplayRect = useCallback(
    (oldR: FsImageRect, newR: FsImageRect) => {
      const cached = fsImageRef.current;
      if (!cached) return;

      fsImageRef.current = { img: cached.img, ...newR };

      const newAnnots = fsAnnotationsRef.current.map((a) => remapAnnotationInFs(a, oldR, newR));
      fsAnnotationsRef.current = newAnnots;
      setFullscreenAnnotations(newAnnots);

      if (fsAnnMovePreviewRef.current) {
        fsAnnMovePreviewRef.current = remapAnnotationInFs(fsAnnMovePreviewRef.current, oldR, newR);
      }
      if (fsTempRef.current) {
        fsTempRef.current = remapPartialAnnotationInFs(fsTempRef.current, oldR, newR);
      }
      if (fsPenPointsRef.current.length > 0) {
        const sx = newR.w / oldR.w;
        const sy = newR.h / oldR.h;
        fsPenPointsRef.current = fsPenPointsRef.current.map((p) => ({
          x: newR.x + (p.x - oldR.x) * sx,
          y: newR.y + (p.y - oldR.y) * sy,
        }));
      }

      const pending = fsCropPendingRef.current;
      if (pending) {
        const next = remapFsCanvasRect(pending, oldR, newR);
        fsCropPendingRef.current = next;
        setFsCropPending(next);
      }
      const cropDrag = fsCropDragRef.current;
      if (cropDrag) {
        const mp = (px: number, py: number) => ({
          x: newR.x + (px - oldR.x) * (newR.w / oldR.w),
          y: newR.y + (py - oldR.y) * (newR.h / oldR.h),
        });
        const p0 = mp(cropDrag.x, cropDrag.y);
        const p1 = mp(cropDrag.endX, cropDrag.endY);
        fsCropDragRef.current = { x: p0.x, y: p0.y, endX: p1.x, endY: p1.y };
      }

      if (isFsTextInputMode) {
        setFsTextInputPos((pos) => {
          const sx = newR.w / oldR.w;
          const sy = newR.h / oldR.h;
          return {
            x: newR.x + (pos.x - oldR.x) * sx,
            y: newR.y + (pos.y - oldR.y) * sy,
          };
        });
      }

      renderFsCanvas();
    },
    [isFsTextInputMode]
  );

  const applyFsDisplayZoom = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const canvas = fsCanvasRef.current;
      const cached = fsImageRef.current;
      const fit = fsFitDisplayRef.current;
      if (!canvas || !cached || !fit) return;

      const rect = canvas.getBoundingClientRect();
      const mx = (clientX - rect.left) * (canvas.width / rect.width);
      const my = (clientY - rect.top) * (canvas.height / rect.height);

      const factor = deltaY < 0 ? 1.12 : 1 / 1.12;
      let newW = cached.w * factor;
      let newH = cached.h * factor;
      const minW = fit.w * 0.2;
      const maxW = fit.w * 12;
      const minH = fit.h * 0.2;
      const maxH = fit.h * 12;
      newW = Math.max(minW, Math.min(maxW, newW));
      newH = Math.max(minH, Math.min(maxH, newH));
      if (Math.abs(newW - cached.w) < 0.5 && Math.abs(newH - cached.h) < 0.5) return;

      const relX = cached.w > 0 ? (mx - cached.x) / cached.w : 0.5;
      const relY = cached.h > 0 ? (my - cached.y) / cached.h : 0.5;
      const newX = mx - relX * newW;
      const newY = my - relY * newH;

      const oldR: FsImageRect = { x: cached.x, y: cached.y, w: cached.w, h: cached.h };
      const newR: FsImageRect = { x: newX, y: newY, w: newW, h: newH };
      syncFsImageDisplayRect(oldR, newR);
      const newPercent = Math.round((newW / fit.w) * 100);
      setFsZoomPercent(newPercent);
      // 记录本次用户主动缩放，便于离开/重开全屏后恢复
      fsSavedZoomPercentRef.current = {
        key: `${sourceImage ?? ''}::${sourceImageAssetId ?? ''}`,
        percent: newPercent,
      };
    },
    [syncFsImageDisplayRect, sourceImage, sourceImageAssetId]
  );

  const applyFsDisplayPan = useCallback(
    (dx: number, dy: number) => {
      const cached = fsImageRef.current;
      if (!cached || (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01)) return;
      const oldR: FsImageRect = { x: cached.x, y: cached.y, w: cached.w, h: cached.h };
      const newR: FsImageRect = { x: cached.x + dx, y: cached.y + dy, w: cached.w, h: cached.h };
      syncFsImageDisplayRect(oldR, newR);
    },
    [syncFsImageDisplayRect]
  );

  const handleFsWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      applyFsDisplayZoom(e.deltaY, e.clientX, e.clientY);
    },
    [applyFsDisplayZoom]
  );

  // 打开全屏标注模式（canvas 与坐标在 useEffect 中初始化）
  const openFullscreenAnnotation = () => {
    if (!hasSourceImage) {
      alert('请先导入图片');
      return;
    }
    setFullscreenSelectedId(node.selectedAnnotationId);
    setFsCropPending(null);
    fsCropDragRef.current = null;
    fsCropAdjustRef.current = null;
    fsFitDisplayRef.current = null;
    fsSpaceDownRef.current = false;
    fsIsPanningRef.current = false;
    setIsFsPanning(false);
    // 同一 source image 重复进入全屏时，恢复用户上次主动缩放比例，避免 UI 闪一下回到 100%
    const saved = fsSavedZoomPercentRef.current;
    const currentKey = `${sourceImage ?? ''}::${sourceImageAssetId ?? ''}`;
    setFsZoomPercent(saved && saved.key === currentKey ? saved.percent : 100);
    setIsFullscreenAnnotation(true);
  };

  // 全屏打开后：挂载再测量尺寸、加载图片、嵌入坐标 → 全屏坐标
  useEffect(() => {
    if (!isFullscreenAnnotation || !hasSourceImage) return;

    let cancelled = false;
    let raf = 0;

    const tryLayout = () => {
    const canvas = fsCanvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent || parent.clientWidth < 1) {
        raf = requestAnimationFrame(tryLayout);
        return;
      }

      const run = async () => {
        if (cancelled) return;
        const rw = Math.max(100, parent.clientWidth);
        const rh = Math.max(100, parent.clientHeight);
        canvas.width = rw;
        canvas.height = rh;

        const { resolveCanvasImageSource } = await import('../services/canvasAssetResolver');
        const url = await resolveCanvasImageSource(sourceImage, sourceImageAssetId);
        if (cancelled || !url) return;

        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          const scale = Math.min(rw / img.width, rh / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const fx = (rw - w) / 2;
          const fy = (rh - h) / 2;
          fsImageRef.current = { img, x: fx, y: fy, w, h };
          fsFitDisplayRef.current = { w, h };

          // 离开/重开全屏后，恢复用户上次主动设置的缩放比例；
          // 首次进入或切换 source image 时回到 100%。
          const saved = fsSavedZoomPercentRef.current;
          const currentKey = `${sourceImage ?? ''}::${sourceImageAssetId ?? ''}`;
          const restoredPercent = saved && saved.key === currentKey ? saved.percent : 100;
          if (restoredPercent !== 100) {
            const factor = restoredPercent / 100;
            const newW = w * factor;
            const newH = h * factor;
            const newX = (rw - newW) / 2;
            const newY = (rh - newH) / 2;
            const oldR: FsImageRect = { x: fx, y: fy, w, h };
            const newR: FsImageRect = { x: newX, y: newY, w: newW, h: newH };
            fsImageRef.current = { img, x: newX, y: newY, w: newW, h: newH };
            // 同步给其它依赖 cached.x/y/w/h 的渲染函数
            syncFsImageDisplayRect(oldR, newR);
          }
          setFsZoomPercent(restoredPercent);

          const emb = imageCacheRef.current ?? ensureEmbeddedImageLayout();
          const list = annotationsRef.current;
          const fs = fsImageRef.current;
          const mapped =
            emb && fs ? list.map((a) => mapAnnotationEmbToFs(a, emb, fs)) : list.map((a) => ({ ...a }));

          setFullscreenAnnotations(mapped);
          fsAnnotationsRef.current = mapped;
          fsAnnotationHistoryRef.current = [mapped];
          fsHistoryIndexRef.current = 0;
          fsLastSavedHistoryRef.current = JSON.stringify(mapped);
          renderFsCanvas();
        };
        img.src = url;
      };

      void run();
    };

    tryLayout();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [isFullscreenAnnotation, sourceImage, sourceImageAssetId, hasSourceImage, mapAnnotationEmbToFs]);

  // 全屏：空格按住可拖移图片区域；中键拖移
  useEffect(() => {
    if (!isFullscreenAnnotation) return;

    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      e.preventDefault();
      fsSpaceDownRef.current = true;
      updateFsCanvasCursor();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      fsSpaceDownRef.current = false;
      if (fsIsPanningRef.current) {
        fsIsPanningRef.current = false;
        setIsFsPanning(false);
        releaseFsPanPointerCapture();
      }
      updateFsCanvasCursor();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      fsSpaceDownRef.current = false;
      fsIsPanningRef.current = false;
      setIsFsPanning(false);
    };
  }, [isFullscreenAnnotation, updateFsCanvasCursor, releaseFsPanPointerCapture]);

  // 关闭全屏标注模式并应用标注，有标注时导出带标注的图片节点
  const closeFullscreenAnnotation = () => {
    const fs = fsImageRef.current;
    const currentFsAnnots = fsAnnotationsRef.current;

    if (fs && currentFsAnnots.length > 0) {
      const emb = ensureEmbeddedImageLayout();
      if (emb) {
        const mapped = currentFsAnnots.map((a) => mapAnnotationFsToEmb(a, fs, emb));
        annotationsRef.current = mapped;
        saveToHistory(mapped);
        onUpdate({ annotations: mapped });
      }
    }

    // 有标注时，从全屏坐标直接渲染到原始图片并创建图片节点
    if (currentFsAnnots.length > 0 && hasSourceImage && fs) {
      void (async () => {
        const { resolveCanvasImageSource } = await import('../services/canvasAssetResolver');
        const url = await resolveCanvasImageSource(sourceImage, sourceImageAssetId);
        if (!url) return;
        const img = new Image();
        img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const outCtx = tempCanvas.getContext('2d');
        if (!outCtx) return;
        outCtx.drawImage(img, 0, 0);
        // 全屏坐标 → 原始图片坐标的换算系数
        const fsScaleX = fs.w / img.width;
        const fsScaleY = fs.h / img.height;
        const fsScale = Math.min(fsScaleX, fsScaleY);
        const toFsImg = (ax: number, ay: number) => ({
          x: (ax - fs.x) / fsScale,
          y: (ay - fs.y) / fsScale,
        });
        currentFsAnnots.forEach(ann => {
          outCtx.strokeStyle = ann.color; outCtx.fillStyle = ann.color;
          const swImg = Math.max(1, (ann.strokeWidth || 2) / fsScale);
          outCtx.lineWidth = swImg;
          outCtx.lineCap = 'round'; outCtx.lineJoin = 'round';
          const boxTypes2 = ['rect', 'circle', 'fillRect', 'fillCircle'];
          if (ann.type === 'arrow') {
            const fromP = toFsImg(ann.x, ann.y);
            const toP = toFsImg(ann.endX ?? ann.x, ann.endY ?? ann.y);
            const headLen = Math.max(8, swImg * 3);
            const angle = Math.atan2(toP.y - fromP.y, toP.x - fromP.x);
            outCtx.beginPath(); outCtx.moveTo(fromP.x, fromP.y); outCtx.lineTo(toP.x, toP.y); outCtx.stroke();
            outCtx.beginPath();
            outCtx.moveTo(toP.x, toP.y);
            outCtx.lineTo(toP.x - headLen * Math.cos(angle - Math.PI / 6), toP.y - headLen * Math.sin(angle - Math.PI / 6));
            outCtx.lineTo(toP.x - headLen * Math.cos(angle + Math.PI / 6), toP.y - headLen * Math.sin(angle + Math.PI / 6));
            outCtx.closePath(); outCtx.fill();
          } else if (ann.type === 'text') {
            const tp = toFsImg(ann.x, ann.y);
            outCtx.font = `bold ${swImg}px sans-serif`;
            outCtx.fillText(ann.text || '', tp.x, tp.y);
          } else if (ann.type === 'pen' && ann.points && ann.points.length > 1) {
            const scaledPoints = ann.points.map((pt) => toFsImg(pt.x, pt.y));
            outCtx.beginPath(); outCtx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
            for (let i = 1; i < scaledPoints.length; i++) outCtx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
            outCtx.stroke();
          } else if (boxTypes2.includes(ann.type)) {
            const ip = toFsImg(ann.x, ann.y);
            let ox = ip.x, oy = ip.y, w2 = 0, h2 = 0;
            if (ann.endX !== undefined && ann.endY !== undefined) {
              const ep = toFsImg(ann.endX, ann.endY);
              ox = Math.min(ip.x, ep.x); oy = Math.min(ip.y, ep.y);
              w2 = Math.abs(ep.x - ip.x); h2 = Math.abs(ep.y - ip.y);
            } else {
              w2 = (ann.width || 0) / fsScale;
              h2 = (ann.height || 0) / fsScale;
            }
            if (ann.type === 'rect') outCtx.strokeRect(ox, oy, w2, h2);
            else if (ann.type === 'circle') { outCtx.beginPath(); outCtx.ellipse(ox+w2/2, oy+h2/2, w2/2, h2/2, 0, 0, Math.PI*2); outCtx.stroke(); }
            else if (ann.type === 'fillRect') { outCtx.globalAlpha = ann.fillOpacity ?? 0.45; outCtx.fillRect(ox, oy, w2, h2); outCtx.globalAlpha = 1; outCtx.strokeStyle = ann.color; outCtx.lineWidth = Math.max(1, swImg*0.5); outCtx.strokeRect(ox, oy, w2, h2); }
            else if (ann.type === 'fillCircle') { outCtx.globalAlpha = ann.fillOpacity ?? 0.45; outCtx.beginPath(); outCtx.ellipse(ox+w2/2, oy+h2/2, w2/2, h2/2, 0, 0, Math.PI*2); outCtx.fill(); outCtx.globalAlpha = 1; outCtx.strokeStyle = ann.color; outCtx.lineWidth = Math.max(1, swImg*0.5); outCtx.stroke(); }
          }
        });
        const base64 = tempCanvas.toDataURL('image/jpeg', 0.95).split(',')[1];
        onCreateImageNode([base64], node.x + node.width + 50, node.y);
        };
        img.src = url;
      })();
    }
    fsImageRef.current = null;
    fsFitDisplayRef.current = null;
    setFsCropPending(null);
    fsCropDragRef.current = null;
    fsCropAdjustRef.current = null;
    setIsFullscreenAnnotation(false);
    requestAnimationFrame(() => renderCanvas());
  };

  // 全屏画布鼠标按下
  const handleFsMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;

    if (e.button === 1 || fsSpaceDownRef.current) {
      e.preventDefault();
      e.stopPropagation();
      if (!fsImageRef.current) return;
      fsIsPanningRef.current = true;
      setIsFsPanning(true);
      fsPanLastClientRef.current = { x: e.clientX, y: e.clientY };
      fsPanPointerIdRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const { x, y } = fsCanvasPointFromEvent(e);
    const tool = fsToolRef.current;

    if (tool === 'crop') {
      if (!fsImageRef.current) return;
      const pending = fsCropPendingRef.current;
      if (pending) {
        const hit = hitCropZone(x, y, pending, 12);
        if (hit) {
          fsCropAdjustRef.current = { mode: hit, startX: x, startY: y, orig: { ...pending } };
          fsIsDrawingRef.current = true;
          setIsFsDrawing(true);
          fsCropPointerIdRef.current = e.pointerId;
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      if (!isInFsImageArea(x, y)) return;
      fsCropDragRef.current = { x, y, endX: x, endY: y };
      fsIsDrawingRef.current = true;
      setIsFsDrawing(true);
      fsCropPointerIdRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (tool !== 'crop') {
      const hitAnn = findAnnotationAtPoint(x, y, fsAnnotationsRef.current);
      if (hitAnn) {
        fsAnnMoveRef.current = { id: hitAnn.id, startX: x, startY: y, orig: { ...hitAnn } };
        fsAnnMovePreviewRef.current = { ...hitAnn };
        fsIsDrawingRef.current = true;
        setIsFsDrawing(true);
        setFullscreenSelectedId(hitAnn.id);
        fsAnnPointerIdRef.current = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (tool === 'move') {
        setFullscreenSelectedId(undefined);
        return;
      }
    }

    if (tool === 'move') return;

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
      strokeWidth: tool === 'text' ? fsFontSizeRef.current : tool === 'pen' ? fsPenSizeRef.current : 3,
      points: tool === 'pen' ? [{ x, y }] : undefined
    };
    setFsTempAnnotation(newAnn);
    fsTempRef.current = newAnn;
  };

  const handleFsAnnotationHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fsCanvasRef.current;
    if (!canvas || fsIsDrawingRef.current || fsIsPanningRef.current) return;
    if (fsSpaceDownRef.current) {
      canvas.style.cursor = 'grab';
      return;
    }
    if (fsToolRef.current === 'crop') return;
    const { x, y } = fsCanvasPointFromEvent(e);
    const hit = findAnnotationAtPoint(x, y, fsAnnotationsRef.current);
    canvas.style.cursor = hit ? 'move' : 'crosshair';
  };

  const handleFsCropHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fsCanvasRef.current;
    if (!canvas || fsIsPanningRef.current) return;
    if (fsSpaceDownRef.current) {
      canvas.style.cursor = 'grab';
      return;
    }
    if (fsToolRef.current !== 'crop' || fsIsDrawingRef.current) return;
    const pending = fsCropPendingRef.current;
    const { x, y } = fsCanvasPointFromEvent(e);
    if (!pending) {
      canvas.style.cursor = 'crosshair';
      return;
    }
    const hit = hitCropZone(x, y, pending, 12);
    canvas.style.cursor = hit ? cropCursorForMode(hit) : 'crosshair';
  };

  // 全屏画布鼠标移动
  const handleFsMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = fsCanvasRef.current;
    if (fsIsPanningRef.current && canvas) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const dx = (e.clientX - fsPanLastClientRef.current.x) * scaleX;
      const dy = (e.clientY - fsPanLastClientRef.current.y) * scaleY;
      fsPanLastClientRef.current = { x: e.clientX, y: e.clientY };
      applyFsDisplayPan(dx, dy);
      return;
    }

    handleFsCropHover(e);
    handleFsAnnotationHover(e);
    if (!fsIsDrawingRef.current) return;
    if (!canvas) return;
    let { x, y } = fsCanvasPointFromEvent(e);
    const imgRect = getFsImageDisplayRect();
    if (imgRect) {
      x = Math.max(imgRect.x, Math.min(imgRect.x + imgRect.w, x));
      y = Math.max(imgRect.y, Math.min(imgRect.y + imgRect.h, y));
    }

    if (fsAnnMoveRef.current) {
      const d = fsAnnMoveRef.current;
      const dx = x - d.startX;
      const dy = y - d.startY;
      fsAnnMovePreviewRef.current = translateAnnotation(d.orig, dx, dy);
      renderFsCanvas();
      return;
    }

    if (fsCropAdjustRef.current) {
      const d = fsCropAdjustRef.current;
      const dx = x - d.startX;
      const dy = y - d.startY;
      const raw = applyCropResize(d.mode, d.orig, dx, dy);
      const ir = getFsImageDisplayRect();
      setFsCropPending(ir ? clampCropRect(raw, ir) : raw);
      renderFsCanvas();
      return;
    }

    if (fsCropDragRef.current) {
      fsCropDragRef.current.endX = x;
      fsCropDragRef.current.endY = y;
      renderFsCanvas();
      return;
    }

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
    if (fsIsPanningRef.current) {
      fsIsPanningRef.current = false;
      setIsFsPanning(false);
      releaseFsPanPointerCapture();
      updateFsCanvasCursor();
      return;
    }

    if (!fsIsDrawingRef.current) return;

    if (fsAnnMoveRef.current && fsAnnMovePreviewRef.current) {
      const moved = fsAnnMovePreviewRef.current;
      const currentFs = fsAnnotationsRef.current;
      const newAnnotations = currentFs.map((a) => (a.id === moved.id ? moved : a));
      setFullscreenAnnotations(newAnnotations);
      fsAnnotationsRef.current = newAnnotations;
      fsSaveToHistory(newAnnotations);
      setFullscreenSelectedId(moved.id);
      fsAnnMoveRef.current = null;
      fsAnnMovePreviewRef.current = null;
      fsIsDrawingRef.current = false;
      setIsFsDrawing(false);
      releaseFsAnnPointerCapture();
      renderFsCanvas();
      handleFsAnnotationHover(e);
      return;
    }

    if (fsCropAdjustRef.current) {
      fsCropAdjustRef.current = null;
      fsIsDrawingRef.current = false;
      setIsFsDrawing(false);
      releaseFsCropPointerCapture();
      renderFsCanvas();
      handleFsCropHover(e);
      return;
    }

    if (fsCropDragRef.current) {
      const d = fsCropDragRef.current;
      fsCropDragRef.current = null;
      fsIsDrawingRef.current = false;
      setIsFsDrawing(false);
      releaseFsCropPointerCapture();
      const cx = Math.min(d.x, d.endX);
      const cy = Math.min(d.y, d.endY);
      const cw = Math.abs(d.endX - d.x);
      const ch = Math.abs(d.endY - d.y);
      if (cw > 5 && ch > 5) {
        const ir = getFsImageDisplayRect();
        const next = { x: cx, y: cy, w: cw, h: ch };
        setFsCropPending(ir ? clampCropRect(next, ir) : next);
      }
      renderFsCanvas();
      handleFsCropHover(e);
      return;
    }

    const current = fsTempRef.current;
    const tool = fsToolRef.current;
    if (current) {
      let toAdd: Annotation | null = null;
      if (tool === 'pen') {
        const pts = fsPenPointsRef.current;
        if (pts.length >= 1) {
          toAdd = {
            id: current.id || `fsann-${Date.now()}`,
            type: 'pen',
            x: pts[0].x,
            y: pts[0].y,
            points: [...pts],
            color: fsColorRef.current,
            strokeWidth: fsPenSizeRef.current,
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
        const currentFs = fsAnnotationsRef.current;
        const newAnnotations = [...currentFs, toAdd];
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
    const currentFs = fsAnnotationsRef.current;
    const newAnnotations = currentFs.filter(a => a.id !== id);
    setFullscreenAnnotations(newAnnotations);
    fsAnnotationsRef.current = newAnnotations;
    fsSaveToHistory(newAnnotations);
    if (fullscreenSelectedId === id) setFullscreenSelectedId(undefined);
    renderFsCanvas();
  };

  /** 全屏模式按裁切选区导出为独立图片节点 */
  const confirmFsCrop = () => {
    const fs = fsImageRef.current;
    if (!hasSourceImage || !fsCropPending || !fs) {
      alert('请先框选裁切区域');
      return;
    }
    const { x: cx, y: cy, w: cww, h: chh } = fsCropPending;
    const ix1 = Math.max(cx, fs.x);
    const iy1 = Math.max(cy, fs.y);
    const ix2 = Math.min(cx + cww, fs.x + fs.w);
    const iy2 = Math.min(cy + chh, fs.y + fs.h);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    if (iw < 2 || ih < 2) {
      alert('裁切区域与图片无交集，请重试');
      return;
    }
    const img = fs.img;
    const fsScale = fs.w / img.width;
    const sx = (ix1 - fs.x) / fsScale;
    const sy = (iy1 - fs.y) / fsScale;
    const sw = iw / fsScale;
    const sh = ih / fsScale;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw));
    out.height = Math.max(1, Math.round(sh));
    const octx = out.getContext('2d');
    if (!octx) return;
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const base64 = out.toDataURL('image/jpeg', 0.95).split(',')[1];
    onCreateImageNode([base64], node.x + node.width + 50, node.y);
    setFsCropPending(null);
    fsCropDragRef.current = null;
    renderFsCanvas();
  };

  /** 按裁切选区导出为独立图片节点 */
  const confirmCrop = () => {
    if (!hasSourceImage || !cropPending) {
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
    img.src = resolvedSourceUrlRef.current || `data:image/jpeg;base64,${sourceImage}`;
  };

  const copySourceImageToNewNode = useCallback(() => {
    if (!hasSourceImage) return;
    if (onCopyToImage) {
      onCopyToImage();
      return;
    }
    onCreateImageNode([sourceImage], node.x + node.width + 50, node.y);
  }, [hasSourceImage, onCopyToImage, onCreateImageNode, sourceImage, node.x, node.width, node.y]);

  // 确认标注并创建图片节点
  const confirmAnnotations = () => {
    const currentAnnots = annotationsRef.current;
    if (!hasSourceImage) {
      alert('请先导入图片');
      return;
    }
    if (exportScale === 100 && currentAnnots.length === 0) {
      alert('请先添加标注');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      const scaleRatio = exportScale / 100;
      const outW = Math.round(img.width * scaleRatio);
      const outH = Math.round(img.height * scaleRatio);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outW;
      tempCanvas.height = outH;
      const outCtx = tempCanvas.getContext('2d');
      if (!outCtx) return;

      // 先绘制原图（缩放后）
      outCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, outW, outH);

      // 如果有标注，才转换并绘制标注
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
        x: ((annX - displayX) / displayScale) * scaleRatio,
        y: ((annY - displayY) / displayScale) * scaleRatio
      });

      const boxTypes = ['rect', 'circle', 'fillRect', 'fillCircle'];

      currentAnnots.forEach((ann) => {
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
            strokeWidth: Math.max(1, (ann.strokeWidth || 2) * scaleRatio),
          };
        } else if (ann.type === 'text') {
          const p = toImageCoords(ann.x, ann.y);
          scaledAnn = {
            ...ann,
            x: p.x,
            y: p.y,
            strokeWidth: Math.max(1, (ann.strokeWidth || 16) * scaleRatio),
          };
        } else if (ann.type === 'pen' && ann.points && ann.points.length > 0) {
          const scaledPoints = ann.points.map((pt) => toImageCoords(pt.x, pt.y));
          scaledAnn = {
            ...ann,
          points: scaledPoints,
            x: scaledPoints[0].x,
            y: scaledPoints[0].y,
            strokeWidth: Math.max(1, (ann.strokeWidth || 3) * scaleRatio),
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
            sw = ((ann.width ?? 0) / displayScale) * scaleRatio;
            sh = ((ann.height ?? 0) / displayScale) * scaleRatio;
          }
          scaledAnn = {
            ...ann,
            x: ox,
            y: oy,
            width: sw,
            height: sh,
            strokeWidth: Math.max(1, (ann.strokeWidth || 2) * scaleRatio),
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
    img.src = resolvedSourceUrlRef.current || `data:image/jpeg;base64,${sourceImage}`;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* 链接的参考图信息 */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#252525] border-b border-[#333] shrink-0" style={{ order: 3 }}>
        <span className="text-[10px] text-gray-400">参考图:</span>
        <span className="text-green-400 font-medium">{connectedRefCount} 张</span>
        <div className="flex gap-1 ml-2">
          {incomingEdges.slice(0, 12).map((edge, idx) => {
            const srcNode = sourceNodes[idx];
            if (!srcNode) return null;
            const ref = getNodePrimaryImageRef(srcNode);
            if (!ref) return null;
            return (
              <div key={edge.id} className="relative group">
                <OptimizedImage
                  base64={ref.base64}
                  assetId={ref.assetId}
                  maxSide={80}
                  quality={0.72}
                  alt={`参考图${idx + 1}`}
                  className="w-9 h-9 object-cover rounded border border-[#444]"
                />
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onDeleteEdge?.(edge.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="取消参考"
                >
                  <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white">
                    <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
          {connectedRefCount > 12 && (
            <span className="text-gray-500 flex items-center">+{connectedRefCount - 12}</span>
          )}
        </div>
        <button
          onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
          className={`ml-auto px-2 py-0.5 rounded text-[10px] flex items-center gap-1 text-white ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
          title={eyedropperTargetNodeId === node.id ? '取消吸取' : '吸取图片'}
        >
          <EyedropperIcon size={10} /> 吸管
        </button>
      </div>

      {/* 标注画布：双击图片区域进入全屏标注（需已导入图片）；亦可点下方「全屏标注」 */}
      <div
        ref={containerRef}
        className={`relative flex-1 min-h-[160px] bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden ${!hasSourceImage ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={() => {
          annotationHotRef.current = true;
        }}
      >
        {onEyedropperPickLink ? (
          <button
            type="button"
            className="absolute inset-0 z-[25] cursor-crosshair bg-transparent border-0 p-0"
            title="点击连接上游节点"
            onPointerDown={(e) => {
              e.stopPropagation();
              onEyedropperPickLink();
            }}
          />
        ) : null}
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${hasSourceImage ? 'cursor-crosshair' : ''}`}
          onPointerDown={(e) => {
            if (!hasSourceImage) return; // 无图片时允许拖动窗口
            e.stopPropagation();
            handleMouseDown(e);
          }}
          onPointerMove={(e) => {
            handleCropHover(e);
            handleAnnotationHover(e);
            handleMouseMove(e);
          }}
          onPointerUp={(e) => handleMouseUp(e)}
          onPointerLeave={(e) => handleMouseUp(e)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (hasSourceImage) openFullscreenAnnotation();
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
                  const currentAnnots = annotationsRef.current;
                  const newAnnotations = [...currentAnnots, newAnnotation];
                  saveToHistory(currentAnnots);
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
                const currentAnnots = annotationsRef.current;
                const newAnnotations = [...currentAnnots, newAnnotation];
                saveToHistory(currentAnnots);
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

      {currentTool === 'crop' && hasSourceImage && (
        <p className="text-[10px] text-amber-400/90 px-1 shrink-0">
          {cropPending
            ? '拖动手柄或边缘调整选区，拖内部可移动；选区外拖拽可重新框选'
            : '在图片上按住拖拽框选裁切区域'}
        </p>
      )}
      {cropPending && (
        <div className="flex gap-1 shrink-0 px-1 flex-wrap">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={confirmCrop}
            className="flex-1 min-w-[120px] py-1.5 px-2 rounded text-[10px] bg-amber-600 hover:bg-amber-500 text-white font-medium"
          >
            确认裁切并复制图片节点
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setCropPending(null);
              cropDragRef.current = null;
              cropAdjustRef.current = null;
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
        {(['move', 'rect', 'circle', 'fillRect', 'fillCircle', 'arrow', 'pen', 'text', 'crop'] as const).map((tool) => (
          <button
            key={tool}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCurrentTool(tool)}
            className={`px-1.5 py-0.5 rounded text-[10px] ${currentTool === tool ? 'bg-blue-600 text-white' : 'bg-[#333] text-gray-400 hover:bg-[#444]'}`}
          >
            {tool === 'move' ? '移动' : tool === 'rect' ? '矩形' : tool === 'circle' ? '圆形' : tool === 'fillRect' ? '填矩形' : tool === 'fillCircle' ? '填椭圆' : tool === 'arrow' ? '箭头' : tool === 'pen' ? '画笔' : tool === 'text' ? '文字' : '裁切'}
          </button>
        ))}
      </div>

      {/* 缩放按钮 */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-gray-400">缩放:</span>
        <select
          value={exportScale}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = Number(e.target.value);
            setExportScale(v);
            onUpdate({ exportScale: v });
          }}
          className="rounded border border-[#444] bg-[#333] px-1 py-0.5 text-[10px] text-gray-200 outline-none cursor-pointer"
        >
          <option value="100">100%</option>
          <option value="85">85%</option>
          <option value="70">70%</option>
          <option value="60">60%</option>
          <option value="50">50%</option>
          <option value="40">40%</option>
          <option value="35">35%</option>
          <option value="25">25%</option>
          <option value="10">10%</option>
          <option value="5">5%</option>
          <option value="2">2%</option>
        </select>
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

        {/* 笔刷粗细 (仅画笔工具显示) */}
        {currentTool === 'pen' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">粗细:</span>
            <input
              type="range"
              min={1}
              max={48}
              step={1}
              value={currentPenSize}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setCurrentPenSize(Number(e.target.value))}
              className="w-20 accent-blue-500"
            />
            <span className="text-[10px] text-gray-500 w-5">{currentPenSize}</span>
            <span
              className="rounded-full shrink-0 border border-[#555]"
              style={{
                width: Math.min(currentPenSize, 24),
                height: Math.min(currentPenSize, 24),
                backgroundColor: currentColor,
              }}
              title="笔刷预览"
            />
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
          onClick={() => {
            saveToHistory(annotations);
            onUpdate({ annotations: [] });
            renderCanvas();
          }}
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
          onClick={() => copySourceImageToNewNode()}
          disabled={!hasSourceImage}
          className="py-1 px-2 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          title="复制图片"
        >
          <CopyIcon size={12} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={async () => {
            // 优先用 node 自身的 sourceImage，没有再从链接图取
            let base64: string | undefined = sourceImage || undefined;
            let assetId: string | undefined = (node as AnnotationNode).sourceImageAssetId;
            // offload 后 base64 可能为空但 assetId 还有效；只要二者有其一即可
            if ((!base64 || base64.length <= 80) && !assetId) {
              const firstSrcNode = sourceNodes.find((sn) => getNodePrimaryImageRef(sn) !== null);
              if (firstSrcNode) {
                const ref = getNodePrimaryImageRef(firstSrcNode);
                if (ref) {
                  base64 = ref.base64;
                  assetId = ref.assetId;
                }
              }
            }
            if ((!base64 || base64.length <= 80) && !assetId) {
              alert('请先导入或连接一张图片');
              return;
            }
            try {
              const flipped = await flipAndStoreAsset({
                base64: base64,
                assetId: assetId,
              });
              if (flipped) {
                // 翻转后写回 node.sourceImage（链接图时也"实体化"到 annotation 节点）
                const patch: Partial<AnnotationNode> = { sourceImage: flipped.base64 };
                if (flipped.assetId) patch.sourceImageAssetId = flipped.assetId;
                onUpdate(patch);
              } else {
                console.warn('[annotation flip] 翻转失败，未获取到新图', { base64Len: base64?.length, hasAssetId: !!assetId });
                alert('翻转失败：未读取到原图（assetId 可能已失效）。请重新导入图片后重试。');
              }
            } catch (err) {
              console.warn('[annotation flip] 翻转异常', err);
              alert(`翻转失败：${err instanceof Error ? err.message : '未知错误'}`);
            }
          }}
          disabled={!hasSourceImage && connectedRefCount === 0}
          className="py-1 px-2 rounded text-[10px] bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          title="水平翻转源图片（覆写原图，支持链接图）"
        >
          <FlipHorizontalIcon size={24} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { if (sourceImage && onFullscreenImage) onFullscreenImage(sourceImage); }}
          disabled={!hasSourceImage}
          className="py-1 px-2 rounded text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          title={sourceImage ? '最大化查看图片（仅看图，不含标注工具）' : '请先导入图片'}
        >
          <FullscreenIcon size={20} /> 最大化
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={openFullscreenAnnotation}
          disabled={!hasSourceImage}
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
        disabled={!hasSourceImage || (exportScale === 100 && annotations.length === 0)}
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
            // 全屏文字输入框 / 文本编辑区域里按 Delete/Backspace/Ctrl+Z 让浏览器/输入框自己处理（删字、撤销输入）
            const tag = (e.target as HTMLElement).tagName;
            const inEditable =
              tag === 'INPUT' ||
              tag === 'TEXTAREA' ||
              tag === 'SELECT' ||
              (e.target as HTMLElement).isContentEditable;
            if (e.key === 'Escape') closeFullscreenAnnotation();
            if (inEditable) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
              e.preventDefault();
              fsUndo();
              return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
              if (fullscreenSelectedId) {
                e.preventDefault();
                deleteFsAnnotation(fullscreenSelectedId);
              } else {
                // 仍要 preventDefault 防止事件冒泡到 useCanvasKeyboardShortcuts 把整个图片标注节点删掉
                e.preventDefault();
              }
            }
          }}
          tabIndex={0}
        >
          {/* 全屏工具栏 */}
          <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border-b border-[#333]">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium">全屏标注模式</span>
              <span className="text-gray-400 text-xs">({fullscreenAnnotations.length} 个标注)</span>
              <span className="text-gray-500 text-xs">
                · 滚轮缩放 {fsZoomPercent}% · 空格/中键拖移
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* 工具选择 */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-gray-400 text-xs">工具:</span>
                {(['move', 'rect', 'circle', 'fillRect', 'fillCircle', 'arrow', 'pen', 'text', 'crop'] as const).map((tool) => (
                  <button
                    key={tool}
                    onClick={() => setFullscreenTool(tool)}
                    className={`px-3 py-1.5 rounded text-xs ${fullscreenTool === tool ? 'bg-blue-600 text-white' : 'bg-[#333] text-gray-300 hover:bg-[#444]'}`}
                  >
                    {tool === 'move' ? '移动' : tool === 'rect' ? '矩形' : tool === 'circle' ? '圆形' : tool === 'fillRect' ? '填矩形' : tool === 'fillCircle' ? '填椭圆' : tool === 'arrow' ? '箭头' : tool === 'pen' ? '画笔' : tool === 'text' ? '文字' : '裁切'}
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

              {/* 笔刷粗细 */}
              {fullscreenTool === 'pen' && (
                <div className="flex items-center gap-1 ml-4">
                  <span className="text-gray-400 text-xs">粗细:</span>
                  <input
                    type="range"
                    min={1}
                    max={48}
                    step={1}
                    value={fullscreenPenSize}
                    onChange={(e) => setFullscreenPenSize(Number(e.target.value))}
                    className="w-28 accent-blue-500"
                  />
                  <span className="text-gray-400 text-xs w-6">{fullscreenPenSize}</span>
                  <span
                    className="rounded-full shrink-0 border border-[#555]"
                    style={{
                      width: Math.min(fullscreenPenSize, 28),
                      height: Math.min(fullscreenPenSize, 28),
                      backgroundColor: fullscreenColor,
                    }}
                    title="笔刷预览"
                  />
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
                  fsSaveToHistory(fullscreenAnnotations);
                  setFullscreenAnnotations([]);
                  setFullscreenSelectedId(undefined);
                  fsAnnotationsRef.current = [];
                  renderFsCanvas();
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

          {fullscreenTool === 'crop' && (
            <div className="px-4 py-2 bg-[#141414] border-b border-[#333] flex items-center gap-3 flex-wrap">
              <span className="text-amber-400/90 text-xs">
                {fsCropPending
                  ? '拖动手柄或边缘调整选区，拖内部可移动；选区外拖拽可重新框选'
                  : '在图片上按住拖拽框选裁切区域'}
              </span>
              {fsCropPending && (
                <>
                  <button
                    type="button"
                    onClick={confirmFsCrop}
                    className="px-3 py-1.5 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium"
                  >
                    确认裁切并复制图片节点
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFsCropPending(null);
                      fsCropDragRef.current = null;
                      fsCropAdjustRef.current = null;
                      renderFsCanvas();
                    }}
                    className="px-3 py-1.5 rounded text-xs bg-[#333] hover:bg-[#444] text-gray-300"
                  >
                    取消选区
                  </button>
                </>
              )}
            </div>
          )}

          {/* 全屏画布 */}
          <div
            className="flex-1 relative overflow-hidden"
            onWheel={handleFsWheel}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
          >
            <canvas
              ref={fsCanvasRef}
              className={isFsPanning ? 'cursor-grabbing' : 'cursor-crosshair'}
              style={{ width: '100%', height: '100%' }}
              onWheel={handleFsWheel}
              onPointerDown={handleFsMouseDown}
              onPointerMove={handleFsMouseMove}
              onPointerUp={(e) => handleFsMouseUp(e)}
              onPointerLeave={(e) => handleFsMouseUp(e)}
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
