import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AuditImage, Transform } from './types';
import { AuditMinimap } from './canvas/AuditMinimap';
import { AuditAnnotationToolbar, type AuditAnnotationTool } from './canvas/AuditAnnotationToolbar';
import {
  buildAuditImagesComposite,
  filterAnnotationsInBounds,
  getAuditImagesBounds,
} from './canvas/auditModeComposite';
import { base64ToImageDataUrl, sniffImageMimeFromBase64 } from './canvas/auditImageUtils';
import {
  appendAuditImages,
  bringAuditImagesToFront,
  unpinAuditImages,
} from './canvas/auditImageStack';
import {
  cloneAnnotation,
  getAnnotationBounds,
  getResizeHandles,
  hitTestResizeHandle,
  hitTestTopmostAnnotation,
  resizeAnnotationFromSnapshot,
  translateAnnotation,
  type ResizeHandleId,
} from './canvas/auditAnnotationEdit';
import {
  AuditInpaintPanel,
  AUDIT_INPAINT_PANEL_BASE_WIDTH,
  AUDIT_INPAINT_PANEL_CANVAS_SCALE,
} from './canvas/AuditInpaintPanel';
import {
  cropAuditImageRegion,
  compositePatchOntoAuditImage,
  findBestAuditImageForRegion,
} from './canvas/auditImageCrop';
import {
  clampRegionToImage,
  getInpaintRegionHandles,
  hitTestInpaintHandle,
  moveInpaintRegion,
  normalizeCanvasRect,
  pointInInpaintRegion,
  resizeInpaintRegion,
  type CanvasRect,
  type InpaintHandleId,
} from './canvas/auditInpaintRegion';
import { runAuditInpaintGeneration } from './canvas/auditInpaintGenerate';
import {
  createInpaintSession,
  type AuditInpaintSession,
  type InpaintRegionState,
} from './canvas/auditInpaintSession';
import { saveImageDownload } from './services/downloadPathSettings';

interface AuditModeCanvasProps {
  auditImages: AuditImage[];
  setAuditImages: React.Dispatch<React.SetStateAction<AuditImage[]>>;
  transform: Transform;
  setTransform?: React.Dispatch<React.SetStateAction<Transform>>;
  onWheel?: (e: React.WheelEvent) => void;
  sharedClipboardImageRef: React.MutableRefObject<AuditImage | null>;
  saveCurrentProject?: () => void;
  openBigEditor?: (current: string, onSave: (v: string) => void) => void;
}

type AnnotationTool = AuditAnnotationTool;

interface AuditAnnotation {
  id: string;
  type: Exclude<AnnotationTool, 'select' | 'inpaint'>;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  endX?: number;
  endY?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  points?: { x: number; y: number }[];
  fontSize?: number;
  fillOpacity?: number;
}

export default function AuditModeCanvas({
  auditImages,
  setAuditImages,
  transform,
  setTransform,
  onWheel,
  sharedClipboardImageRef,
  saveCurrentProject,
  openBigEditor,
}: AuditModeCanvasProps) {
  /** 看图层可见根节点；勿用被 hidden 的 canvas-container，否则 getBoundingClientRect 为 0 导致标注偏移 */
  const auditRootRef = useRef<HTMLDivElement>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragMouseCanvasStartRef = useRef({ x: 0, y: 0 }); // 拖拽开始时鼠标的画布坐标
  // 框选状态
  const [selectionBox, setSelectionBox] = useState<{left: number; top: number; width: number; height: number} | null>(null);
  const isBoxSelectingRef = useRef(false);
  const boxSelectStartRef = useRef({ x: 0, y: 0 });
  const isResizingRef = useRef(false);

  // 画布平移状态（空格 + 鼠标中键）
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panTransformRef = useRef({ x: 0, y: 0 });
  const isSpaceDownRef = useRef(false);

  // 标注相关状态
  const [currentTool, setCurrentTool] = useState<AnnotationTool>('select');
  const [currentColor, setCurrentColor] = useState('#ff6b6b');
  const [currentFontSize, setCurrentFontSize] = useState(50);
  const [currentPenWidth, setCurrentPenWidth] = useState(24);
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState(24);
  const [auditAnnotations, setAuditAnnotations] = useState<AuditAnnotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempAnnotation, setTempAnnotation] = useState<Partial<AuditAnnotation> | null>(null);
  const [isTextInputMode, setIsTextInputMode] = useState(false);
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 });
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  const penPointsRef = useRef<{ x: number; y: number }[]>([]);

  // 文本图片创建
  const [textImageEditorOpen, setTextImageEditorOpen] = useState(false);
  const [textImageContent, setTextImageContent] = useState('');
  const [textImageFontSize, setTextImageFontSize] = useState(48);
  const [textImageColor, setTextImageColor] = useState('#ffffff');
  const [textImageBgColor, setTextImageBgColor] = useState('#000000');
  const [textImageBgOpacity, setTextImageBgOpacity] = useState(0.7);

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 历史记录（最多保留1步撤销）
  const [annotationHistory, setAnnotationHistory] = useState<AuditAnnotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const annotationHistoryRef = useRef(annotationHistory);
  useEffect(() => {
    annotationHistoryRef.current = annotationHistory;
  }, [annotationHistory]);

  // ref（避免闭包陷阱）
  const currentToolRef = useRef(currentTool);
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  const currentColorRef = useRef(currentColor);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);
  const auditAnnotationsRef = useRef(auditAnnotations);
  useEffect(() => { auditAnnotationsRef.current = auditAnnotations; }, [auditAnnotations]);
  const auditImagesRef = useRef(auditImages);
  useEffect(() => { auditImagesRef.current = auditImages; }, [auditImages]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingStartRef = useRef({ x: 0, y: 0 });
  const clipboardRef = useRef<AuditImage[]>([]);
  const lastMouseCanvasPosRef = useRef({ x: 0, y: 0 });
  // 缩放起始数据 ref（避免每次从 state 读取导致卡顿）
  const resizeStartDataRef = useRef<{ canvasX: number; canvasY: number; startScale: number; startScreenW: number; startScreenH: number; offsetX: number; offsetY: number } | null>(null);
  // 文本图片元数据：imgId -> { content, fontSize, color, bgColor, bgOpacity }
  const textImageMetaRef = useRef<Map<string, { content: string; fontSize: number; color: string; bgColor: string; bgOpacity: number }>>(new Map());
  // 当前正在编辑的文本图片id
  const [editingTextImageId, setEditingTextImageId] = useState<string | null>(null);

  // 局部重绘（支持同图多区域并行）
  const [inpaintSessions, setInpaintSessions] = useState<AuditInpaintSession[]>([]);
  const [activeInpaintSessionId, setActiveInpaintSessionId] = useState<string | null>(null);
  const inpaintSessionsRef = useRef(inpaintSessions);
  useEffect(() => {
    inpaintSessionsRef.current = inpaintSessions;
  }, [inpaintSessions]);
  const isInpaintSelectingRef = useRef(false);
  const inpaintSelectingSessionIdRef = useRef<string | null>(null);
  const inpaintStartRef = useRef({ x: 0, y: 0 });
  const inpaintAbortRefs = useRef<Map<string, AbortController>>(new Map());
  const inpaintRegionEditRef = useRef<{
    sessionId: string;
    mode: 'move' | 'resize';
    handle?: InpaintHandleId;
    startPointer: { x: number; y: number };
    startRegion: InpaintRegionState;
  } | null>(null);

  // 图片的原始尺寸映射
  const imageSizeCacheRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  // 防止 keydown + paste 事件双重触发导致重复粘贴
  const lastPasteTimeRef = useRef(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const selectedImageIdsRef = useRef(selectedImageIds);
  useEffect(() => {
    selectedImageIdsRef.current = selectedImageIds;
  }, [selectedImageIds]);
  const selectedAnnotationIdsRef = useRef(selectedAnnotationIds);
  useEffect(() => {
    selectedAnnotationIdsRef.current = selectedAnnotationIds;
  }, [selectedAnnotationIds]);
  const annotationEditRef = useRef<{
    mode: 'move' | 'resize';
    handle?: ResizeHandleId;
    startPointer: { x: number; y: number };
    snapshots: Map<string, AuditAnnotation>;
    ids: string[];
  } | null>(null);

  useEffect(() => {
    if (!isTextInputMode) return;
    const id = requestAnimationFrame(() => {
      textInputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [isTextInputMode, textInputPos]);

  // 鼠标在画布坐标系中的坐标计算
  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    if (!auditRootRef.current) return { x: 0, y: 0 };
    const rect = auditRootRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, [transform]);

  useEffect(() => {
    const el = auditRootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleMinimapNavigate = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!setTransform || !auditRootRef.current) return;
      const rect = auditRootRef.current.getBoundingClientRect();
      setTransform((prev) => ({
        ...prev,
        x: rect.width / 2 - canvasX * prev.scale,
        y: rect.height / 2 - canvasY * prev.scale,
      }));
    },
    [setTransform]
  );

  /** 将合成图添加为看图画布上的新图片 */
  const addCompositeToCanvas = useCallback(
    async (images: AuditImage[], annotations: AuditAnnotation[], placeAt?: { x: number; y: number }) => {
      const result = await buildAuditImagesComposite(images, annotations);
      if (!result) return;
      const gap = 50;
      const placeX = placeAt?.x ?? result.minX + result.width + gap;
      const placeY = placeAt?.y ?? result.minY;
      const newId = `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newImage: AuditImage = {
        id: newId,
        base64: result.base64,
        x: placeX,
        y: placeY,
        width: result.width,
        height: result.height,
        scale: 1,
      };
      setAuditImages((prev) => appendAuditImages(prev, newImage));
      setSelectedImageIds([newId]);
    },
    [setAuditImages]
  );

  // 渲染标注到 canvas
  const renderAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(transform.scale, 0, 0, transform.scale, transform.x, transform.y);

    const annotationsToDraw = [...auditAnnotationsRef.current];
    if (tempAnnotation) {
      annotationsToDraw.push(tempAnnotation as AuditAnnotation);
    }

    annotationsToDraw.forEach((ann) => {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth || 2;

      switch (ann.type) {
        case 'rect':
          ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
          break;
        case 'fillRect':
          ctx.globalAlpha = ann.fillOpacity ?? 0.45;
          ctx.fillRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
          ctx.strokeRect(ann.x, ann.y, ann.width || 0, ann.height || 0);
          ctx.globalAlpha = 1;
          break;
        case 'circle':
          ctx.beginPath();
          ctx.ellipse(
            ann.x + (ann.width || 0) / 2,
            ann.y + (ann.height || 0) / 2,
            Math.abs(ann.width || 0) / 2,
            Math.abs(ann.height || 0) / 2,
            0, 0, Math.PI * 2
          );
          ctx.stroke();
          break;
        case 'fillCircle':
          ctx.beginPath();
          ctx.ellipse(
            ann.x + (ann.width || 0) / 2,
            ann.y + (ann.height || 0) / 2,
            Math.abs(ann.width || 0) / 2,
            Math.abs(ann.height || 0) / 2,
            0, 0, Math.PI * 2
          );
          ctx.globalAlpha = ann.fillOpacity ?? 0.45;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.stroke();
          break;
        case 'arrow':
          drawArrow(ctx, ann.x, ann.y, ann.endX || 0, ann.endY || 0, ann.color, ann.strokeWidth || 2);
          break;
        case 'pen':
          if (ann.points && ann.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(ann.points[0].x, ann.points[0].y);
            for (let i = 1; i < ann.points.length; i++) {
              ctx.lineTo(ann.points[i].x, ann.points[i].y);
            }
            ctx.stroke();
          }
          break;
        case 'text':
          ctx.font = `${ann.fontSize || 16}px sans-serif`;
          ctx.fillText(ann.text || '', ann.x, ann.y);
          break;
      }
    });

    const handleScreenPx = 8;
    const handleSize = handleScreenPx / transform.scale;
    selectedAnnotationIdsRef.current.forEach((id) => {
      const ann = annotationsToDraw.find((a) => a.id === id);
      if (!ann) return;
      const bounds = getAnnotationBounds(ann);
      if (!bounds) return;
      const w = bounds.maxX - bounds.minX;
      const h = bounds.maxY - bounds.minY;
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5 / transform.scale;
      ctx.setLineDash([6 / transform.scale, 4 / transform.scale]);
      ctx.strokeRect(bounds.minX, bounds.minY, w, h);
      ctx.setLineDash([]);
      if (selectedAnnotationIdsRef.current.length === 1) {
        ctx.fillStyle = '#fbbf24';
        for (const handle of getResizeHandles(ann)) {
          ctx.fillRect(
            handle.x - handleSize / 2,
            handle.y - handleSize / 2,
            handleSize,
            handleSize
          );
        }
      }
      ctx.restore();
    });

    ctx.restore();
  }, [tempAnnotation, transform]);

  // 绘制箭头
  const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  // 重新渲染标注（对外暴露）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = viewportSize.width;
      canvas.height = viewportSize.height;
    }
    renderAnnotations();
  }, [auditAnnotations, tempAnnotation, renderAnnotations, viewportSize, transform, selectedAnnotationIds]);

  // ====== 图片处理 ======

  // 获取图片原始尺寸
  const getImageNaturalSize = (base64: string, mimeType?: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      // 检查缓存
      const cached = imageSizeCacheRef.current.get(base64);
      if (cached) {
        resolve(cached);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const size = { width: img.naturalWidth, height: img.naturalHeight };
        imageSizeCacheRef.current.set(base64, size);
        resolve(size);
      };
      img.onerror = () => resolve({ width: 480, height: 360 }); // fallback
      // 优先使用传入的 MIME 类型，否则根据魔数自动识别
      if (mimeType) {
        img.src = `data:${mimeType};base64,${base64}`;
      } else {
        img.src = base64ToImageDataUrl(base64);
      }
    });
  };

  // 拖入图片
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!auditRootRef.current) return;

    const files = Array.from(e.dataTransfer.files || []);
    const file = files.find(f => f.type.startsWith('image/'));
    if (!file) return;

    const mimeType = file.type || 'image/png';

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const naturalSize = await getImageNaturalSize(base64, mimeType);
      const pos = getCanvasCoords(e.clientX, e.clientY);

      const newImage: AuditImage = {
        id: `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        base64,
        x: pos.x - naturalSize.width / 2,
        y: pos.y - naturalSize.height / 2,
        width: naturalSize.width,
        height: naturalSize.height,
        scale: 1,
      };
      setAuditImages(prev => appendAuditImages(prev, newImage));
      setSelectedImageIds([newImage.id]);
    };
    reader.readAsDataURL(file);
  }, [getCanvasCoords, setAuditImages]);

  // 粘贴图片
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;

    // 防止 keydown 已处理过后的重复触发
    if (Date.now() - lastPasteTimeRef.current < 1000) return;

    const items = e.clipboardData?.items;
    const imageItem = items ? Array.from(items).find(item => item.type.startsWith('image/')) : null;
    if (!imageItem) return;
    e.preventDefault();

    const file = imageItem.getAsFile();
    if (!file) return;

    const mimeType = file.type || 'image/png';

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      const base64 = result.split(',')[1];
      if (!base64) return;

      const naturalSize = await getImageNaturalSize(base64, mimeType);
      // 使用鼠标当前在画布中的位置粘贴（onWindowPointerMove 已转换为画布坐标）
      const pos = lastMouseCanvasPosRef.current;

      const newImage: AuditImage = {
        id: `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        base64,
        x: pos.x - naturalSize.width / 2,
        y: pos.y - naturalSize.height / 2,
        width: naturalSize.width,
        height: naturalSize.height,
        scale: 1,
      };
      setAuditImages(prev => appendAuditImages(prev, newImage));
      setSelectedImageIds([newImage.id]);
    };
    reader.readAsDataURL(file);
  }, [getCanvasCoords, setAuditImages]);

  // 注册/注销粘贴事件 和 快捷键
  useEffect(() => {
    if (!auditRootRef.current) return;

    const onPaste = (e: ClipboardEvent) => {
      handlePaste(e);
    };
    // 在 window 上监听 paste 事件更可靠
    window.addEventListener('paste', onPaste);

    const onKeyDown = (e: KeyboardEvent) => {
      const isInput = !!(e.target as HTMLElement).closest('input, textarea, select');

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        isSpaceDownRef.current = true;
        return;
      }

      // Ctrl+S：保存草稿（同画布模式）
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !isInput) {
        e.preventDefault();
        if (saveCurrentProject) {
          saveCurrentProject();
        }
        return;
      }

      // G 键：重置选中图片的大小为原始尺寸
      if (e.code === 'KeyG' && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setAuditImages(prev => prev.map(img =>
          selectedImageIds.includes(img.id) ? { ...img, scale: 1 } : img
        ));
        return;
      }

      // Ctrl+A：全选看图图片
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !isInput) {
        e.preventDefault();
        const allIds = auditImagesRef.current.map((img) => img.id);
        setSelectedImageIds(allIds);
        return;
      }

      // Alt+Q / Backspace / Delete：删除选中图片
      if (
        (e.altKey && e.code === 'KeyQ') ||
        ((e.code === 'Backspace' || e.code === 'Delete') && !isInput)
      ) {
        const sel = selectedImageIdsRef.current;
        if (sel.length === 0) return;
        const toDelete = new Set(sel);
        setAuditImages((prev) => prev.filter((img) => !toDelete.has(img.id)));
        setSelectedImageIds([]);
        e.preventDefault();
        return;
      }

      // Ctrl+C / Meta+C：复制选中图片到内部剪贴板 + 系统剪贴板 + 共享剪贴板
      // 看图模式下放宽 isInput 限制（不拦截 input 内的 Ctrl+C 以防用户期望复制画布内容）
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !e.target.closest('textarea')) {
        // 阻止浏览器默认复制行为
        e.preventDefault();
        const selected = auditImagesRef.current.filter(img => selectedImageIds.includes(img.id));
        if (selected.length === 0) return;
        clipboardRef.current = selected.map(img => ({ ...img }));
        // 写入共享剪贴板（跨模式互通）
        const firstImg = selected[0];
        sharedClipboardImageRef.current = { ...firstImg };
        // 写入系统剪贴板（base64 图片），让外部应用也能粘贴
        try {
          // 使用 canvas 转 blob 更可靠
          const canvas = document.createElement('canvas');
          canvas.width = firstImg.width;
          canvas.height = firstImg.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const img = new Image();
            img.src = base64ToImageDataUrl(firstImg.base64);
            // canvas 在 drawImage 时要求图片已加载完毕（但如果 base64 是完整 base64，图片可同步解码）
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(async (blob) => {
              if (blob) {
                try {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                } catch (_) {}
              }
            }, 'image/png');
          }
        } catch (_) {
          // 某些浏览器可能不支持 ClipboardItem，静默失败
        }
        return;
      }

      // Ctrl+V / Meta+V：粘贴图片（统一从系统剪贴板读取，清除残留的内部缓存）
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !isInput) {
        e.preventDefault();
        const mousePos = lastMouseCanvasPosRef.current;
        const pos = { x: mousePos.x, y: mousePos.y };
        const now = Date.now();
        lastPasteTimeRef.current = now;

        // 从系统剪贴板读取（内部/外部复制都写入了系统剪贴板）
        if (typeof navigator?.clipboard?.read === 'function') {
          navigator.clipboard.read().then(clipboardItems => {
            if (lastPasteTimeRef.current !== now) return;
            const imageItem = clipboardItems.find(item => item.types.some(t => t.startsWith('image/')));
            if (!imageItem) { fallbackInternal(); return; }
            const targetType = imageItem.types.find(t => t.startsWith('image/')) || 'image/png';
            imageItem.getType(targetType).then(blob => {
              if (lastPasteTimeRef.current !== now) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                if (lastPasteTimeRef.current !== now) return;
                const result = ev.target?.result as string;
                const base64 = result?.split(',')[1];
                if (!base64) return;
                const mimeType = result?.startsWith('data:') ? result.slice(5).split(';')[0] : 'image/png';
                getImageNaturalSize(base64, mimeType).then(naturalSize => {
                  if (lastPasteTimeRef.current !== now) return;
                  const newImage: AuditImage = {
                    id: `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    base64,
                    x: pos.x - naturalSize.width / 2,
                    y: pos.y - naturalSize.height / 2,
                    width: naturalSize.width,
                    height: naturalSize.height,
                    scale: 1,
                  };
                  setAuditImages(prev => appendAuditImages(prev, newImage));
                  setSelectedImageIds([newImage.id]);
                });
              };
              reader.readAsDataURL(blob);
            }).catch(() => fallbackInternal());
          }).catch(() => fallbackInternal());
        } else {
          fallbackInternal();
        }

        function fallbackInternal() {
          if (lastPasteTimeRef.current !== now) return;
          // 系统剪贴板无图片时，回退到共享剪贴板
          if (sharedClipboardImageRef.current) {
            const img = sharedClipboardImageRef.current;
            const newImage: AuditImage = {
              ...img,
              id: `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              x: pos.x - img.width / 2,
              y: pos.y - img.height / 2,
              pinned: false,
            };
            setAuditImages(prev => appendAuditImages(prev, newImage));
            setSelectedImageIds([newImage.id]);
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDownRef.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 全局 pointermove 记录鼠标位置供粘贴使用（不受 canvas div onPointerMove 区域限制）
    const onWindowPointerMove = (e: PointerEvent) => {
      const canvasPos = getCanvasCoords(e.clientX, e.clientY);
      lastMouseCanvasPosRef.current = canvasPos;
    };
    window.addEventListener('pointermove', onWindowPointerMove);

    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onWindowPointerMove);
    };
  }, [handlePaste, selectedImageIds, getCanvasCoords, setAuditImages]);

  // ====== 图片交互 ======

  /** 将指定图片移到叠放顺序最上层（已置顶图片始终在未置顶之上） */
  const bringImagesToFront = useCallback(
    (ids: string[], opts?: { pin?: boolean }) => {
      if (ids.length === 0) return;
      setAuditImages((prev) => bringAuditImagesToFront(prev, ids, opts));
    },
    [setAuditImages]
  );

  const pinSelectedImagesToTop = useCallback(() => {
    const ids = selectedImageIdsRef.current;
    if (ids.length === 0) return;
    bringImagesToFront(ids, { pin: true });
    setContextMenu(null);
  }, [bringImagesToFront]);

  const unpinSelectedImagesFromTop = useCallback(() => {
    const ids = selectedImageIdsRef.current;
    if (ids.length === 0) return;
    setAuditImages((prev) => unpinAuditImages(prev, ids));
    setContextMenu(null);
  }, [setAuditImages]);

  // 选中图片（支持 Ctrl 加选、Alt 减选）
  const handleImagePointerDown = (e: React.PointerEvent, imgId: string) => {
    e.stopPropagation();
    if (currentTool !== 'select') return;
    setSelectedAnnotationIds([]);

    if (e.altKey) {
      // Alt: 减选
      setSelectedImageIds(prev => prev.filter(id => id !== imgId));
      setDraggingImageId(null);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd: 加选（追加到末尾，即置顶）
      setSelectedImageIds((prev) =>
        prev.includes(imgId) ? [...prev.filter((id) => id !== imgId), imgId] : [...prev, imgId]
      );
      bringImagesToFront([imgId]);
      // Ctrl + 拖拽移动
      const img = auditImages.find(i => i.id === imgId);
      if (!img) return;
      const rect = auditRootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const imgScreenX = img.x * transform.scale + transform.x + rect.left;
      const imgScreenY = img.y * transform.scale + transform.y + rect.top;
      dragMouseCanvasStartRef.current = {
        x: (e.clientX - rect.left - transform.x) / transform.scale,
        y: (e.clientY - rect.top - transform.y) / transform.scale,
      };
      setDraggingImageId(imgId);
      dragOffsetRef.current = { x: e.clientX - imgScreenX, y: e.clientY - imgScreenY };
      return;
    }

    // 普通点击：单选，最后点击的置于最上层
    setSelectedImageIds((prev) =>
      prev.includes(imgId) ? [...prev.filter((id) => id !== imgId), imgId] : [imgId]
    );
    bringImagesToFront([imgId]);

    // 检查是否在右下角缩放手柄区域
    const img = auditImages.find(i => i.id === imgId);
    if (!img) return;
    const rect = auditRootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const imgScreenX = img.x * transform.scale + transform.x + rect.left;
    const imgScreenY = img.y * transform.scale + transform.y + rect.top;
    const imgScreenW = img.width * img.scale * transform.scale;
    const imgScreenH = img.height * img.scale * transform.scale;
    const handleSize = 16;
    const isResizeHandle =
      e.clientX >= imgScreenX + imgScreenW - handleSize &&
      e.clientX <= imgScreenX + imgScreenW &&
      e.clientY >= imgScreenY + imgScreenH - handleSize &&
      e.clientY <= imgScreenY + imgScreenH;

    if (isResizeHandle) {
      isResizingRef.current = true;
      dragMouseCanvasStartRef.current = {
        x: (e.clientX - rect.left - transform.x) / transform.scale,
        y: (e.clientY - rect.top - transform.y) / transform.scale,
      };
      setDraggingImageId(imgId);
      dragOffsetRef.current = {
        x: e.clientX - (imgScreenX + imgScreenW),
        y: e.clientY - (imgScreenY + imgScreenH),
      };
      return;
    }

    // 拖拽移动（所有选中图片一起移动）
    isResizingRef.current = false;
    dragMouseCanvasStartRef.current = {
      x: (e.clientX - rect.left - transform.x) / transform.scale,
      y: (e.clientY - rect.top - transform.y) / transform.scale,
    };
    setDraggingImageId(imgId);
    dragOffsetRef.current = {
      x: e.clientX - imgScreenX,
      y: e.clientY - imgScreenY,
    };
  };

  // 注册全局移动/释放事件
  useEffect(() => {
    if (!draggingImageId) return;

    // 检查是否为缩放操作
    const isResize = isResizingRef.current;

    // 记录所有选中图片的起始画布坐标
    const startPositions = new Map<string, {x: number, y: number}>();
    const mouseCanvasStart = { ...dragMouseCanvasStartRef.current };

    // 使用函数式更新一次性捕获所有起始位置
    setAuditImages(prev => {
      prev.forEach(img => {
        if (selectedImageIds.includes(img.id)) {
          startPositions.set(img.id, { x: img.x, y: img.y });
        }
      });
      return prev;
    });

    const handleMove = (e: PointerEvent) => {
      if (!auditRootRef.current || !draggingImageId) return;
      if (!isResize) {
        const rect = auditRootRef.current.getBoundingClientRect();
        // 当前鼠标在画布坐标中的位置
        const mouseCanvas = {
          x: (e.clientX - rect.left - transform.x) / transform.scale,
          y: (e.clientY - rect.top - transform.y) / transform.scale,
        };
        // 从起始到当前的位移
        const dx = mouseCanvas.x - mouseCanvasStart.x;
        const dy = mouseCanvas.y - mouseCanvasStart.y;

        setAuditImages(prev => prev.map(img => {
          if (!selectedImageIds.includes(img.id)) return img;
          const start = startPositions.get(img.id);
          if (!start) return img;
          // 起始位置 + 统一位移 = 保持相对位置
          return {
            ...img,
            x: start.x + dx,
            y: start.y + dy,
          };
        }));
      } else {
        // 缩放操作：只缩放被拖拽的那一张
        const rect = auditRootRef.current.getBoundingClientRect();
        const startData = resizeStartDataRef.current;
        if (!startData) return;
        // 使用 ref 中记录的起始数据计算，避免每次从 prev 读取 img.x/img.y
        const imgScreenX = startData.canvasX * transform.scale + transform.x + rect.left;
        const imgScreenY = startData.canvasY * transform.scale + transform.y + rect.top;
        let newScreenW = e.clientX - imgScreenX - startData.offsetX;
        let newScreenH = e.clientY - imgScreenY - startData.offsetY;
        newScreenW = Math.max(8, newScreenW);
        newScreenH = Math.max(8, newScreenH);
        const ratioW = newScreenW / startData.startScreenW;
        const ratioH = newScreenH / startData.startScreenH;
        const newScale = Math.max(0.02, startData.startScale * Math.min(ratioW, ratioH));
        setAuditImages(prev => prev.map(img =>
          img.id === draggingImageId ? { ...img, scale: newScale } : img
        ));
      }
    };
    const handleUp = () => {
      setDraggingImageId(null);
      startPositions.clear();
      isResizingRef.current = false;
      resizeStartDataRef.current = null;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingImageId, transform, selectedImageIds, setAuditImages]);

  // ====== 标注绘制 ======

  const saveToHistory = (newAnnotations: AuditAnnotation[]) => {
    // 保留最多2步历史（当前 + 1步撤销）
    const newHistory = annotationHistory.slice(0, 1);
    newHistory.push([...newAnnotations]);
    setAnnotationHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const beginAnnotationEdit = (
    mode: 'move' | 'resize',
    handle: ResizeHandleId | undefined,
    pointer: { x: number; y: number },
    ids: string[]
  ) => {
    const snapshots = new Map<string, AuditAnnotation>();
    for (const id of ids) {
      const ann = auditAnnotationsRef.current.find((a) => a.id === id);
      if (ann) snapshots.set(id, cloneAnnotation(ann));
    }
    annotationEditRef.current = { mode, handle, startPointer: pointer, snapshots, ids };
  };

  const applyAnnotationEdit = (pointer: { x: number; y: number }) => {
    const edit = annotationEditRef.current;
    if (!edit) return;
    const dx = pointer.x - edit.startPointer.x;
    const dy = pointer.y - edit.startPointer.y;
    setAuditAnnotations((prev) => {
      const next = prev.map((ann) => {
        if (!edit.ids.includes(ann.id)) return ann;
        const snap = edit.snapshots.get(ann.id);
        if (!snap) return ann;
        if (edit.mode === 'move') {
          return translateAnnotation(snap, dx, dy);
        }
        if (edit.mode === 'resize' && edit.handle) {
          const startBounds = getAnnotationBounds(snap);
          if (!startBounds) return ann;
          return resizeAnnotationFromSnapshot(snap, edit.handle, pointer, startBounds);
        }
        return ann;
      });
      auditAnnotationsRef.current = next;
      return next;
    });
  };

  const finishAnnotationEdit = () => {
    if (!annotationEditRef.current) return;
    saveToHistory(auditAnnotationsRef.current);
    annotationEditRef.current = null;
  };

  const patchInpaintSession = useCallback((sessionId: string, patch: Partial<AuditInpaintSession>) => {
    setInpaintSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s))
    );
  }, []);

  const removeInpaintSession = useCallback((sessionId: string) => {
    inpaintAbortRefs.current.get(sessionId)?.abort();
    inpaintAbortRefs.current.delete(sessionId);
    if (inpaintRegionEditRef.current?.sessionId === sessionId) {
      inpaintRegionEditRef.current = null;
    }
    if (inpaintSelectingSessionIdRef.current === sessionId) {
      isInpaintSelectingRef.current = false;
      inpaintSelectingSessionIdRef.current = null;
    }
    setInpaintSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setActiveInpaintSessionId((prev) => (prev === sessionId ? null : prev));
  }, []);

  const reopenInpaintRegionAdjust = useCallback((sessionId: string) => {
    patchInpaintSession(sessionId, {
      regionConfirmed: false,
      crop: null,
      error: null,
    });
  }, [patchInpaintSession]);

  const beginInpaintRegion = useCallback((sessionId: string, region: CanvasRect) => {
    if (Math.abs(region.width) < 4 && Math.abs(region.height) < 4) {
      removeInpaintSession(sessionId);
      return;
    }
    setInpaintSessions((prev) => {
      const session = prev.find((s) => s.id === sessionId);
      if (!session) return prev;
      const target = findBestAuditImageForRegion(
        auditImagesRef.current,
        region,
        session.sourceImageId || null
      );
      if (!target) {
        window.alert('请在图片上框选需要重绘的区域。');
        return prev.filter((s) => s.id !== sessionId);
      }
      const clamped = clampRegionToImage(region, target);
      return prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              sourceImageId: target.id,
              region: { ...clamped, sourceImageId: target.id },
              regionBox: null,
              regionConfirmed: false,
              crop: null,
              error: null,
            }
          : s
      );
    });
  }, [removeInpaintSession]);

  const confirmInpaintRegion = useCallback(async (sessionId: string) => {
    const session = inpaintSessionsRef.current.find((s) => s.id === sessionId);
    if (!session?.region || session.regionConfirmed) return;
    const source = auditImagesRef.current.find((i) => i.id === session.region!.sourceImageId);
    if (!source) return;
    try {
      const cropped = await cropAuditImageRegion(source, session.region);
      if (!cropped) {
        window.alert('选区过小或无效，请调整选区后重试。');
        return;
      }
      patchInpaintSession(sessionId, {
        crop: { ...cropped, sourceImageId: source.id },
        regionConfirmed: true,
        panelVisible: true,
        error: null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '裁剪选区失败';
      window.alert(msg);
    }
  }, [patchInpaintSession]);

  const applyInpaintRegionEdit = useCallback((pointer: { x: number; y: number }) => {
    const edit = inpaintRegionEditRef.current;
    if (!edit) return;
    const source = auditImagesRef.current.find((i) => i.id === edit.startRegion.sourceImageId);
    if (!source) return;
    const dx = pointer.x - edit.startPointer.x;
    const dy = pointer.y - edit.startPointer.y;
    let next: CanvasRect;
    if (edit.mode === 'move') {
      next = moveInpaintRegion(edit.startRegion, dx, dy, source);
    } else if (edit.handle) {
      next = resizeInpaintRegion(edit.startRegion, edit.handle, pointer, source);
    } else {
      return;
    }
    patchInpaintSession(edit.sessionId, {
      region: { ...next, sourceImageId: edit.startRegion.sourceImageId },
    });
  }, [patchInpaintSession]);

  const finishInpaintRegionEdit = useCallback(() => {
    inpaintRegionEditRef.current = null;
  }, []);

  const cancelInpaintGenerate = useCallback((sessionId: string) => {
    inpaintAbortRefs.current.get(sessionId)?.abort();
    inpaintAbortRefs.current.delete(sessionId);
    patchInpaintSession(sessionId, { isGenerating: false, error: null });
  }, [patchInpaintSession]);

  const handleInpaintGenerate = useCallback(async (sessionId: string) => {
    const session = inpaintSessionsRef.current.find((s) => s.id === sessionId);
    if (!session?.crop || !session.regionConfirmed || !session.prompt.trim()) return;

    inpaintAbortRefs.current.get(sessionId)?.abort();
    const ac = new AbortController();
    inpaintAbortRefs.current.set(sessionId, ac);
    patchInpaintSession(sessionId, { isGenerating: true, error: null });

    const { crop, prompt, model, aspectRatio, resolution, quality } = session;
    try {
      const results = await runAuditInpaintGeneration({
        cropBase64: crop.base64,
        prompt,
        model,
        aspectRatio,
        resolution,
        quality,
        cropWidth: crop.width,
        cropHeight: crop.height,
        signal: ac.signal,
      });
      const resultBase64 = results[0]?.replace(/^data:[^;]+;base64,/, '');
      if (!resultBase64) throw new Error('未收到生成图片');

      const source = auditImagesRef.current.find((i) => i.id === crop.sourceImageId);
      if (!source) throw new Error('原图不存在');

      const mergedBase64 = await compositePatchOntoAuditImage(source, crop, resultBase64);
      if (!mergedBase64) throw new Error('无法将生成结果贴回原图');

      setAuditImages((prev) =>
        prev.map((img) =>
          img.id === source.id ? { ...img, base64: mergedBase64 } : img
        )
      );
      setSelectedImageIds([source.id]);
      saveCurrentProject?.();
      removeInpaintSession(sessionId);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      patchInpaintSession(sessionId, {
        error: err instanceof Error ? err.message : '局部重绘失败',
        isGenerating: false,
      });
    } finally {
      inpaintAbortRefs.current.delete(sessionId);
      setInpaintSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.isGenerating ? { ...s, isGenerating: false } : s
        )
      );
    }
  }, [patchInpaintSession, removeInpaintSession, setAuditImages, saveCurrentProject]);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) setContextMenu(null);

    // 鼠标中键（button === 1）或空格按下时 → 平移画布
    if (e.button === 1 || isSpaceDownRef.current) {
      e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panTransformRef.current = { x: transform.x, y: transform.y };
      return;
    }

    // 局部重绘：调整已有选区，或在空白处新建选区
    if (currentTool === 'inpaint') {
      e.stopPropagation();
      const pos = getCanvasCoords(e.clientX, e.clientY);
      const handleRadius = 10 / transform.scale;

      for (let i = inpaintSessionsRef.current.length - 1; i >= 0; i--) {
        const session = inpaintSessionsRef.current[i];
        if (!session.region) continue;
        setActiveInpaintSessionId(session.id);

        const handle = hitTestInpaintHandle(session.region, pos.x, pos.y, handleRadius);
        if (handle) {
          if (session.regionConfirmed) reopenInpaintRegionAdjust(session.id);
          inpaintRegionEditRef.current = {
            sessionId: session.id,
            mode: 'resize',
            handle,
            startPointer: pos,
            startRegion: { ...session.region },
          };
          return;
        }
        if (pointInInpaintRegion(session.region, pos.x, pos.y)) {
          if (session.regionConfirmed) reopenInpaintRegionAdjust(session.id);
          inpaintRegionEditRef.current = {
            sessionId: session.id,
            mode: 'move',
            startPointer: pos,
            startRegion: { ...session.region },
          };
          return;
        }
      }

      if (auditImagesRef.current.length === 0) {
        window.alert('请先添加图片后再使用局部重绘。');
        return;
      }

      const activeSession = activeInpaintSessionId
        ? inpaintSessionsRef.current.find((s) => s.id === activeInpaintSessionId)
        : null;
      const pendingSession =
        activeSession && !activeSession.region && !activeSession.regionBox
          ? activeSession
          : null;

      let sessionForSelect: AuditInpaintSession;
      if (pendingSession) {
        sessionForSelect = pendingSession;
      } else {
        sessionForSelect = createInpaintSession();
        setInpaintSessions((prev) => [...prev, sessionForSelect]);
        setActiveInpaintSessionId(sessionForSelect.id);
      }

      patchInpaintSession(sessionForSelect.id, {
        regionBox: { x: pos.x, y: pos.y, width: 0, height: 0 },
      });
      isInpaintSelectingRef.current = true;
      inpaintSelectingSessionIdRef.current = sessionForSelect.id;
      inpaintStartRef.current = pos;
      return;
    }

    // 选择工具：编辑标注 / 框选图片
    if (currentTool === 'select') {
      e.stopPropagation();
      const pos = getCanvasCoords(e.clientX, e.clientY);
      const hitTol = 8 / transform.scale;
      const handleRadius = 10 / transform.scale;

      if (selectedAnnotationIds.length === 1) {
        const selectedAnn = auditAnnotationsRef.current.find(
          (a) => a.id === selectedAnnotationIds[0]
        );
        if (selectedAnn) {
          const handle = hitTestResizeHandle(selectedAnn, pos.x, pos.y, handleRadius);
          if (handle) {
            beginAnnotationEdit('resize', handle, pos, [selectedAnn.id]);
            return;
          }
        }
      }

      const hitAnnId = hitTestTopmostAnnotation(
        auditAnnotationsRef.current,
        pos.x,
        pos.y,
        hitTol
      );
      if (hitAnnId) {
        const nextIds =
          e.ctrlKey || e.metaKey
            ? selectedAnnotationIds.includes(hitAnnId)
              ? selectedAnnotationIds.filter((id) => id !== hitAnnId)
              : [...selectedAnnotationIds, hitAnnId]
            : [hitAnnId];
        setSelectedAnnotationIds(nextIds);
        setSelectedImageIds([]);
        if (nextIds.length > 0) {
          beginAnnotationEdit('move', undefined, pos, nextIds);
        }
        return;
      }

      const rect = auditRootRef.current?.getBoundingClientRect();
      const localX = rect ? e.clientX - rect.left : e.clientX;
      const localY = rect ? e.clientY - rect.top : e.clientY;
      isBoxSelectingRef.current = true;
      boxSelectStartRef.current = { x: localX, y: localY };
      setSelectionBox({ left: localX, top: localY, width: 0, height: 0 });
      return;
    }

    e.stopPropagation();

    const pos = getCanvasCoords(e.clientX, e.clientY);

    if (currentTool === 'text') {
      if (isTextInputMode && textInputValue.trim()) {
        confirmTextAnnotation();
      }
      setTextInputPos(pos);
      setTextInputValue('');
      setIsTextInputMode(true);
      setIsDrawing(false);
      return;
    }

    setIsDrawing(true);
    drawingStartRef.current = pos;

    if (currentTool === 'pen') {
      penPointsRef.current = [pos];
      setTempAnnotation({
        type: 'pen',
        points: [pos],
        color: currentColor,
        strokeWidth: currentPenWidth,
      });
    } else if (currentTool === 'arrow') {
      setTempAnnotation({
        type: 'arrow',
        x: pos.x,
        y: pos.y,
        endX: pos.x,
        endY: pos.y,
        color: currentColor,
        strokeWidth: currentStrokeWidth,
      });
    } else {
      setTempAnnotation({
        type: currentTool as any,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        color: currentColor,
        strokeWidth: currentStrokeWidth,
        fillOpacity: 0.45,
      });
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    // 持续记录鼠标在画布坐标中的位置
    const canvasPos = getCanvasCoords(e.clientX, e.clientY);
    lastMouseCanvasPosRef.current = canvasPos;

    // 平移画布
    if (isPanning && setTransform) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setTransform({
        x: panTransformRef.current.x + dx,
        y: panTransformRef.current.y + dy,
        scale: transform.scale,
      });
      return;
    }

    if (annotationEditRef.current) {
      applyAnnotationEdit(canvasPos);
      return;
    }

    if (inpaintRegionEditRef.current) {
      applyInpaintRegionEdit(canvasPos);
      return;
    }

    if (isInpaintSelectingRef.current && inpaintSelectingSessionIdRef.current) {
      const start = inpaintStartRef.current;
      const sessionId = inpaintSelectingSessionIdRef.current;
      patchInpaintSession(sessionId, {
        regionBox: {
          x: start.x,
          y: start.y,
          width: canvasPos.x - start.x,
          height: canvasPos.y - start.y,
        },
      });
      return;
    }

    // 框选
    if (isBoxSelectingRef.current) {
      const rect = auditRootRef.current?.getBoundingClientRect();
      const curX = rect ? e.clientX - rect.left : e.clientX;
      const curY = rect ? e.clientY - rect.top : e.clientY;
      const left = Math.min(boxSelectStartRef.current.x, curX);
      const top = Math.min(boxSelectStartRef.current.y, curY);
      const width = Math.abs(curX - boxSelectStartRef.current.x);
      const height = Math.abs(curY - boxSelectStartRef.current.y);
      setSelectionBox({ left, top, width, height });
      return;
    }

    if (!isDrawing || !tempAnnotation) return;
    e.stopPropagation();

    const pos = getCanvasCoords(e.clientX, e.clientY);
    const start = drawingStartRef.current;

    if (currentTool === 'pen') {
      const newPoints = [...(tempAnnotation.points || []), pos];
      penPointsRef.current = newPoints;
      setTempAnnotation({ ...tempAnnotation, points: newPoints });
    } else if (currentTool === 'arrow') {
      setTempAnnotation({ ...tempAnnotation, endX: pos.x, endY: pos.y });
    } else {
      setTempAnnotation({
        ...tempAnnotation,
        width: pos.x - start.x,
        height: pos.y - start.y,
      });
    }
  };

  const handleCanvasPointerUp = async (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (annotationEditRef.current) {
      finishAnnotationEdit();
      return;
    }

    if (inpaintRegionEditRef.current) {
      finishInpaintRegionEdit();
      return;
    }

    if (isInpaintSelectingRef.current && inpaintSelectingSessionIdRef.current) {
      const sessionId = inpaintSelectingSessionIdRef.current;
      isInpaintSelectingRef.current = false;
      inpaintSelectingSessionIdRef.current = null;
      const end = getCanvasCoords(e.clientX, e.clientY);
      const region = {
        x: inpaintStartRef.current.x,
        y: inpaintStartRef.current.y,
        width: end.x - inpaintStartRef.current.x,
        height: end.y - inpaintStartRef.current.y,
      };
      patchInpaintSession(sessionId, { regionBox: null });
      beginInpaintRegion(sessionId, region);
      return;
    }

    // 框选完成
    if (isBoxSelectingRef.current && selectionBox) {
      isBoxSelectingRef.current = false;
      setSelectionBox(null);

      if (selectionBox.width < 5 && selectionBox.height < 5) {
        // 点击空白区域 — 关闭菜单并取消所有选中
        setContextMenu(null);
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          setSelectedImageIds([]);
          setSelectedAnnotationIds([]);
        }
        return;
      }

      // 计算框选区域的画布坐标（selectionBox 已是看图层本地坐标）
      const boxLeft = (selectionBox.left - transform.x) / transform.scale;
      const boxTop = (selectionBox.top - transform.y) / transform.scale;
      const boxRight = (selectionBox.left + selectionBox.width - transform.x) / transform.scale;
      const boxBottom = (selectionBox.top + selectionBox.height - transform.y) / transform.scale;

      // 找出与框选区域相交的图片
      const hitIds = auditImages.filter(img => {
        const imgRight = img.x + img.width * img.scale;
        const imgBottom = img.y + img.height * img.scale;
        return !(imgRight < boxLeft || img.x > boxRight || imgBottom < boxTop || img.y > boxBottom);
      }).map(img => img.id);

      setSelectedImageIds((prev) => {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl: 追加（新选中的放到末尾 = 置顶）
          const set = new Set(prev);
          const existing = prev.filter((id) => set.has(id) && !hitIds.includes(id));
          const newOnes = hitIds.filter((id) => !set.has(id));
          const next = [...existing, ...newOnes];
          if (newOnes.length > 0) bringImagesToFront(newOnes);
          return next;
        }
        if (e.altKey) {
          // Alt: 减去
          const set = new Set(prev);
          hitIds.forEach((id) => set.delete(id));
          return Array.from(set);
        }
        // 新框选替换旧选择
        bringImagesToFront(hitIds);
        return hitIds;
      });
      setSelectedAnnotationIds([]);
      return;
    }

    if (!isDrawing || !tempAnnotation) return;
    e.stopPropagation();
    setIsDrawing(false);

    if (currentTool === 'pen' && (!tempAnnotation.points || tempAnnotation.points.length < 2)) {
      setTempAnnotation(null);
      return;
    }

    const newAnn: AuditAnnotation = {
      ...tempAnnotation,
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    } as AuditAnnotation;

    const newAnnotations = [...auditAnnotations, newAnn];
    saveToHistory(newAnnotations);
    setAuditAnnotations(newAnnotations);
    setTempAnnotation(null);
  };

  // 文字输入确认
  const confirmTextAnnotation = () => {
    if (!textInputValue.trim()) {
      setIsTextInputMode(false);
      return;
    }
    const newAnn: AuditAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'text',
      x: textInputPos.x,
      y: textInputPos.y,
      text: textInputValue,
      color: currentColor,
      strokeWidth: currentStrokeWidth,
      fontSize: currentFontSize,
    };
    const newAnnotations = [...auditAnnotations, newAnn];
    saveToHistory(newAnnotations);
    setAuditAnnotations(newAnnotations);
    setIsTextInputMode(false);
    setTextInputValue('');
  };

  // 撤销 / 重做（标注历史）
  const undoAnnotation = useCallback(() => {
    setHistoryIndex((idx) => {
      if (idx <= 0) return idx;
      const newIndex = idx - 1;
      setAuditAnnotations([...annotationHistoryRef.current[newIndex]]);
      return newIndex;
    });
  }, []);

  const redoAnnotation = useCallback(() => {
    setHistoryIndex((idx) => {
      const hist = annotationHistoryRef.current;
      if (idx >= hist.length - 1) return idx;
      const newIndex = idx + 1;
      setAuditAnnotations([...hist[newIndex]]);
      return newIndex;
    });
  }, []);

  const undoAnnotationRef = useRef(undoAnnotation);
  const redoAnnotationRef = useRef(redoAnnotation);
  useEffect(() => {
    undoAnnotationRef.current = undoAnnotation;
    redoAnnotationRef.current = redoAnnotation;
  }, [undoAnnotation, redoAnnotation]);

  // 注册标注撤销/重做快捷键
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isInput = !!(e.target as HTMLElement).closest('input, textarea, select');
      if (isInput) return;
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ') return;
      e.preventDefault();
      if (e.shiftKey) redoAnnotationRef.current();
      else undoAnnotationRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 清除所有标注
  const clearAnnotations = () => {
    saveToHistory([]);
    setAuditAnnotations([]);
  };

  // ====== 导出 / 合并到画布 ======
  const exportAsImage = async () => {
    if (auditImages.length === 0) return;
    await addCompositeToCanvas(auditImages, auditAnnotationsRef.current);
  };

  /** 选中图片区域上重叠的标注 */
  const getAnnotationsForImages = useCallback((images: AuditImage[]) => {
    const bounds = getAuditImagesBounds(images);
    if (!bounds) return [];
    return filterAnnotationsInBounds(auditAnnotationsRef.current, bounds);
  }, []);

  const mergeSelectedImages = async () => {
    const idSet = new Set(selectedImageIdsRef.current);
    if (idSet.size < 2) return;
    // 按 auditImages 叠放顺序（后者在上）合成，与画布显示一致
    const selected = auditImagesRef.current.filter((img) => idSet.has(img.id));
    if (selected.length < 2) return;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const img of selected) {
      maxX = Math.max(maxX, img.x + img.width * img.scale);
      minY = Math.min(minY, img.y);
    }
    const anns = getAnnotationsForImages(selected);
    await addCompositeToCanvas(selected, anns, { x: maxX + 50, y: minY });
    setContextMenu(null);
  };

  const downloadSelectedImages = useCallback(async () => {
    const idSet = new Set(selectedImageIdsRef.current);
    if (idSet.size === 0) return;
    const selected = auditImagesRef.current.filter((img) => idSet.has(img.id));
    if (selected.length === 0) return;
    setContextMenu(null);
    try {
      if (selected.length === 1) {
        const raw = selected[0].base64.replace(/^data:[^;]+;base64,/, '');
        const mime = sniffImageMimeFromBase64(raw);
        const r = await saveImageDownload(raw, mime);
        if (!r.ok && r.message) window.alert(r.message);
        return;
      }
      const anns = getAnnotationsForImages(selected);
      const result = await buildAuditImagesComposite(selected, anns);
      if (!result) {
        window.alert('无法合成下载，请重试。');
        return;
      }
      const r = await saveImageDownload(result.base64, 'image/png');
      if (!r.ok && r.message) window.alert(r.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '下载失败';
      window.alert(`${msg}。可尝试右键图片另存为。`);
    }
  }, [getAnnotationsForImages]);

  // 十六进制颜色转 rgba
  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  };

  // 创建或更新文本图片
  const createTextImage = useCallback(() => {
    if (!textImageContent.trim()) return;
    const fontSize = textImageFontSize;
    const padding = 16;
    // 在离屏 canvas 上测量文本真实尺寸
    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return;
    mCtx.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    const metrics = mCtx.measureText(textImageContent);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.4;
    const w = Math.ceil(textWidth + padding * 2);
    const h = Math.ceil(textHeight + padding * 2);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘制背景
    ctx.fillStyle = hexToRgba(textImageBgColor, textImageBgOpacity);
    // 圆角背景
    const radius = 8;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // 绘制文字
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.fillStyle = textImageColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(textImageContent, w / 2, h / 2);

    const base64 = canvas.toDataURL('image/png').split(',')[1];

    if (editingTextImageId) {
      // 更新已有文本图片
      const pos = { ...lastMouseCanvasPosRef.current };
      setAuditImages(prev => prev.map(img =>
        img.id === editingTextImageId
          ? { ...img, base64, width: w, height: h, x: pos.x - w / 2, y: pos.y - h / 2, scale: 1 }
          : img
      ));
      textImageMetaRef.current.set(editingTextImageId, {
        content: textImageContent,
        fontSize,
        color: textImageColor,
        bgColor: textImageBgColor,
        bgOpacity: textImageBgOpacity,
      });
      setEditingTextImageId(null);
    } else {
      // 创建新文本图片
      const pos = { ...lastMouseCanvasPosRef.current };
      const newId = `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newImage: AuditImage = {
        id: newId,
        base64,
        x: pos.x - w / 2,
        y: pos.y - h / 2,
        width: w,
        height: h,
        scale: 1,
      };
      textImageMetaRef.current.set(newId, {
        content: textImageContent,
        fontSize,
        color: textImageColor,
        bgColor: textImageBgColor,
        bgOpacity: textImageBgOpacity,
      });
      setAuditImages(prev => appendAuditImages(prev, newImage));
      setSelectedImageIds([newId]);
    }
    setTextImageEditorOpen(false);
    setTextImageContent('');
  }, [textImageContent, textImageFontSize, textImageColor, textImageBgColor, textImageBgOpacity, editingTextImageId, setAuditImages]);

  // 右键菜单处理（空白区域）
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getCanvasCoords(e.clientX, e.clientY);
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX: pos.x, canvasY: pos.y });
  }, [getCanvasCoords]);

  const handleImageContextMenu = useCallback(
    (e: React.MouseEvent, imgId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getCanvasCoords(e.clientX, e.clientY);
      if (!selectedImageIdsRef.current.includes(imgId)) {
        setSelectedImageIds([imgId]);
        bringImagesToFront([imgId]);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, canvasX: pos.x, canvasY: pos.y });
    },
    [getCanvasCoords, bringImagesToFront]
  );

  // 点击画布/图片等任意处关闭菜单（捕获阶段，避免画布 stopPropagation 拦截）
  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: PointerEvent) => {
      if (e.button === 2) return;
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [contextMenu]);

  return (
    <div
      ref={auditRootRef}
      className="absolute inset-0 z-[45] overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
      onWheel={onWheel}
      onContextMenu={handleContextMenu}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      style={{
        touchAction: 'none',
        cursor: isPanning
          ? 'grabbing'
          : currentTool !== 'select'
            ? 'crosshair'
            : undefined,
      }}
    >
      <AuditAnnotationToolbar
        currentTool={currentTool}
        currentColor={currentColor}
        currentFontSize={currentFontSize}
        currentPenWidth={currentPenWidth}
        currentStrokeWidth={currentStrokeWidth}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < annotationHistory.length - 1}
        onToolChange={(tool) => {
          setCurrentTool(tool);
          if (tool !== 'select') setSelectedAnnotationIds([]);
        }}
        onColorChange={setCurrentColor}
        onFontSizeChange={setCurrentFontSize}
        onPenWidthChange={setCurrentPenWidth}
        onStrokeWidthChange={setCurrentStrokeWidth}
        onUndo={undoAnnotation}
        onRedo={redoAnnotation}
        onClear={clearAnnotations}
      />

      {/* 工具栏 — 右上角 */}
      <div className="absolute top-4 right-4 z-[60] flex flex-col gap-2 items-end">
        <div className="bg-[#1e1e1e]/95 backdrop-blur-md rounded-xl border border-[#333] p-2 shadow-2xl flex flex-col gap-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void exportAsImage()}
            className="w-full py-1.5 px-3 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white flex items-center justify-center gap-1"
            title="将全部图片与标注合成一张图，并添加到看图画布"
          >
            导出合成到画布
          </button>
        </div>
      </div>

      {auditImages.length > 0 && setTransform && (
        <AuditMinimap
          images={auditImages}
          transform={transform}
          viewportSize={viewportSize}
          onNavigate={handleMinimapNavigate}
        />
      )}

      {/* 看图图片层 */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {/* 叠放顺序与 auditImages 数组一致；已置顶图片始终在未置顶之上 */}
        {auditImages.map((img) => (
          <div
            key={img.id}
            className={`absolute ${
              currentTool === 'select' ? 'pointer-events-auto' : 'pointer-events-none'
            } ${
              selectedImageIds.includes(img.id)
                ? 'outline outline-4 outline-amber-300 outline-offset-2 shadow-[0_0_0_6px_rgba(251,191,36,0.35)] ring-2 ring-amber-400/60'
                : ''
            }`}
            style={{
              left: img.x,
              top: img.y,
              width: img.width * img.scale,
              height: img.height * img.scale,
            }}
            onContextMenu={(e) => handleImageContextMenu(e, img.id)}
            onPointerDown={(e) => handleImagePointerDown(e, img.id)}
            onDoubleClick={(e) => {
              // 双击文本图片打开编辑器
              const meta = textImageMetaRef.current.get(img.id);
              if (meta) {
                e.stopPropagation();
                setEditingTextImageId(img.id);
                setTextImageContent(meta.content);
                setTextImageFontSize(meta.fontSize);
                setTextImageColor(meta.color);
                setTextImageBgColor(meta.bgColor);
                setTextImageBgOpacity(meta.bgOpacity);
                setTextImageEditorOpen(true);
              }
            }}
          >
            <img
              src={base64ToImageDataUrl(img.base64)}
              alt="audit"
              className="w-full h-full"
              style={{ objectFit: 'fill', display: 'block' }}
              draggable={false}
            />
            {/* 缩放手柄 — 右下角 */}
            {selectedImageIds.includes(img.id) && (
              <div
                className="absolute bottom-0 right-0 w-5 h-5 bg-amber-400 border-2 border-white rounded-sm cursor-se-resize shadow-lg shadow-amber-600/40"
                style={{ transform: 'translate(50%, 50%)' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (currentTool !== 'select') return;
                  const currentImg = auditImages.find(i => i.id === img.id);
                  if (!currentImg) return;
                  const rect = auditRootRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  isResizingRef.current = true;
                  setDraggingImageId(currentImg.id);
                  const imgScreenX = currentImg.x * transform.scale + transform.x + rect.left;
                  const imgScreenY = currentImg.y * transform.scale + transform.y + rect.top;
                  const imgScreenW = currentImg.width * currentImg.scale * transform.scale;
                  const imgScreenH = currentImg.height * currentImg.scale * transform.scale;
                  const offsetX = e.clientX - (imgScreenX + imgScreenW);
                  const offsetY = e.clientY - (imgScreenY + imgScreenH);
                  // 写入缩放起始数据 ref（handleMove 从中读取，不依赖 state）
                  resizeStartDataRef.current = {
                    canvasX: currentImg.x,
                    canvasY: currentImg.y,
                    startScale: currentImg.scale,
                    startScreenW: imgScreenW,
                    startScreenH: imgScreenH,
                    offsetX,
                    offsetY,
                  };
                  // 保留 dragOffsetRef 给拖拽移动用
                  dragOffsetRef.current = { x: offsetX, y: offsetY };
                }}
              />
            )}
          </div>
        ))}

        {inpaintSessions.map((session) => {
          const rect = session.region ?? session.regionBox;
          if (!rect) return null;
          const { top, right } = normalizeCanvasRect(rect);
          const gap = 4;
          return (
            <div
              key={`${session.id}-actions`}
              className="absolute pointer-events-auto z-[58]"
              style={{
                left: right + gap,
                top,
                transform: `scale(${AUDIT_INPAINT_PANEL_CANVAS_SCALE})`,
                transformOrigin: 'top left',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="bg-[#1e1e1e]/95 backdrop-blur-md rounded-xl border border-purple-500/30 p-2 shadow-2xl flex flex-row gap-1.5 whitespace-nowrap">
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeInpaintSession(session.id)}
                  disabled={session.isGenerating}
                  className="py-1.5 px-3 rounded text-[11px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void confirmInpaintRegion(session.id)}
                  disabled={!session.region || session.regionConfirmed || session.isGenerating}
                  className="py-1.5 px-3 rounded text-[11px] bg-purple-800 hover:bg-purple-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  确认
                </button>
                {session.regionConfirmed && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => reopenInpaintRegionAdjust(session.id)}
                    disabled={session.isGenerating}
                    className="py-1.5 px-3 rounded text-[11px] bg-[#333] hover:bg-[#444] text-purple-200 border border-purple-500/40 disabled:opacity-40"
                  >
                    重新调整
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {inpaintSessions.map((session, sessionIndex) => {
          if (!session.panelVisible || !session.region) return null;
          const { left, top, bottom } = normalizeCanvasRect(session.region);
          const gap = 4;
          return (
            <div
              key={`${session.id}-panel`}
              className="absolute pointer-events-auto origin-top-left"
              style={{
                left,
                top: bottom + gap,
                width: AUDIT_INPAINT_PANEL_BASE_WIDTH,
                minWidth: AUDIT_INPAINT_PANEL_BASE_WIDTH,
                maxWidth: AUDIT_INPAINT_PANEL_BASE_WIDTH,
                transform: `scale(${AUDIT_INPAINT_PANEL_CANVAS_SCALE})`,
                transformOrigin: 'top left',
                zIndex: 57 + sessionIndex,
              }}
            >
              <AuditInpaintPanel
                prompt={session.prompt}
                onPromptChange={(value) => patchInpaintSession(session.id, { prompt: value })}
                onOpenBigEditor={openBigEditor}
                onGenerate={() => void handleInpaintGenerate(session.id)}
                onCancelGenerate={() => cancelInpaintGenerate(session.id)}
                regionConfirmed={session.regionConfirmed}
                model={session.model}
                onModelChange={(value) => patchInpaintSession(session.id, { model: value })}
                aspectRatio={session.aspectRatio}
                onAspectRatioChange={(value) => patchInpaintSession(session.id, { aspectRatio: value })}
                resolution={session.resolution}
                onResolutionChange={(value) => patchInpaintSession(session.id, { resolution: value })}
                quality={session.quality}
                onQualityChange={(value) => patchInpaintSession(session.id, { quality: value })}
                previewBase64={session.crop?.base64}
                cropWidth={session.crop?.width}
                cropHeight={session.crop?.height}
                needsReconfirm={!session.regionConfirmed}
                isGenerating={session.isGenerating}
                error={session.error}
              />
            </div>
          );
        })}
      </div>

      {/* 标注 Canvas 层 */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width={viewportSize.width}
        height={viewportSize.height}
      />

      {/* 框选指示器 */}
      {selectionBox && (
        <div
          className="absolute z-[55] border border-amber-400 bg-amber-400/10 pointer-events-none"
          style={{
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}

      {inpaintSessions.some((s) => s.regionBox && !s.region) && (
        <div
          className="absolute top-0 left-0 origin-top-left pointer-events-none z-[56]"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {inpaintSessions.map((session) => {
            if (!session.regionBox || session.region) return null;
            const box = session.regionBox;
            return (
              <div
                key={`${session.id}-draft`}
                className="absolute border-8 border-dashed border-purple-400 bg-purple-500/10"
                style={{
                  left: Math.min(box.x, box.x + box.width),
                  top: Math.min(box.y, box.y + box.height),
                  width: Math.abs(box.width),
                  height: Math.abs(box.height),
                }}
              />
            );
          })}
        </div>
      )}

      {inpaintSessions.some((s) => s.region) && (
        <div
          className="absolute top-0 left-0 origin-top-left pointer-events-none z-[56]"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {inpaintSessions.map((session) => {
            if (!session.region) return null;
            const { left, top, width, height } = normalizeCanvasRect(session.region);
            const handleSize = 8 / transform.scale;
            const isActive = session.id === activeInpaintSessionId;
            return (
              <React.Fragment key={`${session.id}-overlay`}>
                <div
                  className={`absolute border-8 ${
                    session.regionConfirmed
                      ? 'border-solid border-cyan-400/80 bg-cyan-400/5'
                      : 'border-dashed border-purple-400 bg-purple-500/10'
                  } ${isActive ? 'ring-2 ring-purple-300/40' : ''}`}
                  style={{ left, top, width, height }}
                />
                {!session.regionConfirmed &&
                  getInpaintRegionHandles(session.region).map((handle) => (
                    <div
                      key={`${session.id}-${handle.id}`}
                      className="absolute bg-purple-400 border border-white rounded-sm shadow"
                      style={{
                        left: handle.x - handleSize / 2,
                        top: handle.y - handleSize / 2,
                        width: handleSize,
                        height: handleSize,
                      }}
                    />
                  ))}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* 清空画布按钮（左上角） */}
      <div className="absolute top-4 left-[204px] z-[60]">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setAuditImages([]);
            saveToHistory([]);
            setAuditAnnotations([]);
            setSelectedImageIds([]);
            setSelectedAnnotationIds([]);
          }}
          className="py-1.5 px-3 rounded-lg text-[11px] font-medium bg-red-800 hover:bg-red-700 text-white shadow-lg border border-red-600/50 transition-colors"
        >
          清空画布
        </button>
      </div>

      {/* 文字输入弹窗 */}
      {isTextInputMode && (
        <div
          className="absolute z-[70]"
          style={{
            left: textInputPos.x * transform.scale + transform.x,
            top: textInputPos.y * transform.scale + transform.y,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            ref={textInputRef}
            className="bg-[#222] border border-amber-500 rounded px-2 py-1 text-white outline-none min-w-[120px]"
            style={{ fontSize: currentFontSize }}
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { confirmTextAnnotation(); }
              if (e.key === 'Escape') { setIsTextInputMode(false); setTextInputValue(''); }
            }}
            onBlur={() => confirmTextAnnotation()}
            placeholder="输入标注文字..."
          />
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-[80] bg-[#252525] border border-[#444] rounded-lg shadow-2xl py-1 min-w-[140px] overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {selectedImageIds.length >= 1 && (
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-gray-300 hover:bg-[#333] hover:text-white transition-colors flex items-center gap-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={pinSelectedImagesToTop}
            >
              <span className="text-cyan-400 text-[14px]">↑</span>
              置顶{selectedImageIds.length > 1 ? `（${selectedImageIds.length} 张）` : '图片'}
            </button>
          )}
          {selectedImageIds.length >= 1 &&
            selectedImageIds.some((id) => auditImages.find((i) => i.id === id)?.pinned) && (
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-gray-300 hover:bg-[#333] hover:text-white transition-colors flex items-center gap-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={unpinSelectedImagesFromTop}
            >
              <span className="text-gray-400 text-[14px]">↓</span>
              取消置顶{selectedImageIds.length > 1 ? `（${selectedImageIds.length} 张）` : ''}
            </button>
          )}
          {selectedImageIds.length >= 1 && (
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-gray-300 hover:bg-[#333] hover:text-white transition-colors flex items-center gap-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void downloadSelectedImages()}
            >
              <span className="text-blue-400 text-[14px]">↓</span>
              下载{selectedImageIds.length > 1 ? `（${selectedImageIds.length} 张合成）` : '图片'}
            </button>
          )}
          {selectedImageIds.length >= 2 && (
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-gray-300 hover:bg-[#333] hover:text-white transition-colors flex items-center gap-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void mergeSelectedImages()}
            >
              <span className="text-green-400 text-[14px]">⊞</span>
              合并图片（{selectedImageIds.length} 张）
            </button>
          )}
          {selectedImageIds.length === 1 && (
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] text-gray-300 hover:bg-[#333] hover:text-white transition-colors flex items-center gap-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                const targetId = selectedImageIds[0];
                const session = createInpaintSession(targetId);
                setInpaintSessions((prev) => [...prev, session]);
                setActiveInpaintSessionId(session.id);
                setCurrentTool('inpaint');
                setContextMenu(null);
              }}
            >
              <span className="text-purple-400 text-[14px]">✦</span>
              局部重绘
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-[12px] text-gray-300 hover:bg-[#333] hover:text-white transition-colors flex items-center gap-2"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setTextImageEditorOpen(true);
              setContextMenu(null);
            }}
          >
            <span className="text-amber-400 text-[14px]">T</span>
            创建文本图片
          </button>
        </div>
      )}

      {/* 文本图片编辑器 */}
      {textImageEditorOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setTextImageEditorOpen(false);
          }}
        >
          <div
            className="bg-[#1e1e1e] border border-[#444] rounded-xl shadow-2xl p-6 w-[520px] max-w-[90vw] flex flex-col gap-4"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-medium text-gray-200">{editingTextImageId ? '编辑文本图片' : '创建文本图片'}</div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-gray-500">文本内容</label>
              <textarea
                autoFocus
                className="bg-[#2a2a2a] border border-[#444] rounded px-3 py-2 text-[16px] text-white outline-none focus:border-amber-500 resize-none"
                value={textImageContent}
                onChange={(e) => setTextImageContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) createTextImage();
                  if (e.key === 'Escape') setTextImageEditorOpen(false);
                }}
                placeholder="输入文本..."
                rows={6}
                style={{ minHeight: '120px' }}
              />
              <div className="text-[10px] text-gray-600">按 Ctrl+Enter 确认</div>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-[12px] text-gray-500">字体大小</label>
                <select
                  className="bg-[#2a2a2a] border border-[#444] rounded px-2 py-1.5 text-[14px] text-gray-300 outline-none"
                  value={textImageFontSize}
                  onChange={(e) => setTextImageFontSize(Number(e.target.value))}
                >
                  <option value="24">24px</option>
                  <option value="32">32px</option>
                  <option value="48">48px</option>
                  <option value="64">64px</option>
                  <option value="80">80px</option>
                  <option value="100">100px</option>
                  <option value="120">120px</option>
                  <option value="150">150px</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-[12px] text-gray-500">字体颜色</label>
                <input
                  type="color"
                  value={textImageColor}
                  onChange={(e) => setTextImageColor(e.target.value)}
                  className="w-full h-9 rounded border border-[#444] cursor-pointer bg-transparent"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-[12px] text-gray-500">背景颜色</label>
                <input
                  type="color"
                  value={textImageBgColor}
                  onChange={(e) => setTextImageBgColor(e.target.value)}
                  className="w-full h-9 rounded border border-[#444] cursor-pointer bg-transparent"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-[12px] text-gray-500">背景透明度</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={textImageBgOpacity}
                  onChange={(e) => setTextImageBgOpacity(Number(e.target.value))}
                  className="w-full h-2"
                />
              </div>
            </div>
            <div className="text-[12px] text-gray-500 text-center">
              背景透明度: {Math.round(textImageBgOpacity * 100)}%
            </div>

            {/* 预览 */}
            <div
              className="rounded-lg p-5 flex items-center justify-center min-h-[100px] border border-[#333]"
              style={{
                backgroundColor: hexToRgba(textImageBgColor, textImageBgOpacity),
              }}
            >
              {textImageContent ? (
                <span
                  style={{
                    font: `bold ${Math.min(textImageFontSize, 48)}px "Microsoft YaHei", "PingFang SC", sans-serif`,
                    color: textImageColor,
                    textAlign: 'center',
                    wordBreak: 'break-all',
                  }}
                >
                  {textImageContent}
                </span>
              ) : (
                <span className="text-[13px] text-gray-600">预览</span>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="px-5 py-2 rounded-lg text-[14px] bg-[#333] hover:bg-[#444] text-gray-300 transition-colors"
                onClick={() => setTextImageEditorOpen(false)}
              >
                取消
              </button>
              <button
                className="px-5 py-2 rounded-lg text-[14px] bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                onClick={createTextImage}
              >
                {editingTextImageId ? '确认更新' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
