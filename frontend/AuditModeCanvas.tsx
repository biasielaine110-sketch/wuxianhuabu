import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AuditImage, Transform } from './types';
import { AuditMinimap } from './canvas/AuditMinimap';
import { buildAuditImagesComposite } from './canvas/auditModeComposite';
import { saveImageDownload } from './services/downloadPathSettings';

/** 根据 base64 魔数字节识别真实的图片 MIME 类型 */
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

/** 将纯 base64 转换为带正确 MIME 类型的 data URL */
function base64ToImageDataUrl(raw: string): string {
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '');
  return `data:${sniffImageMimeFromBase64(cleaned)};base64,${cleaned}`;
}

const colors = ['#ffffff', '#000000', '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#ff9ff3', '#54a0ff'];

interface AuditModeCanvasProps {
  auditImages: AuditImage[];
  setAuditImages: React.Dispatch<React.SetStateAction<AuditImage[]>>;
  transform: Transform;
  setTransform?: React.Dispatch<React.SetStateAction<Transform>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onWheel?: (e: React.WheelEvent) => void;
  sharedClipboardImageRef: React.MutableRefObject<AuditImage | null>;
  saveCurrentProject?: () => void;
}

type AnnotationTool = 'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'fillRect' | 'fillCircle' | 'select';

interface AuditAnnotation {
  id: string;
  type: Exclude<AnnotationTool, 'select'>;
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
  containerRef,
  onWheel,
  sharedClipboardImageRef,
  saveCurrentProject,
}: AuditModeCanvasProps) {
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
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
  const [currentFontSize, setCurrentFontSize] = useState(16);
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

  // 图片的原始尺寸映射
  const imageSizeCacheRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  // 防止 keydown + paste 事件双重触发导致重复粘贴
  const lastPasteTimeRef = useRef(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const selectedImageIdsRef = useRef(selectedImageIds);
  useEffect(() => {
    selectedImageIdsRef.current = selectedImageIds;
  }, [selectedImageIds]);

  // 鼠标在画布坐标系中的坐标计算
  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, [transform, containerRef]);

  useEffect(() => {
    const el = containerRef.current;
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
  }, [containerRef]);

  const handleMinimapNavigate = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!setTransform || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setTransform((prev) => ({
        ...prev,
        x: rect.width / 2 - canvasX * prev.scale,
        y: rect.height / 2 - canvasY * prev.scale,
      }));
    },
    [setTransform, containerRef]
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
      setAuditImages((prev) => [...prev, newImage]);
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
  }, [tempAnnotation]);

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
    renderAnnotations();
  }, [auditAnnotations, tempAnnotation, renderAnnotations]);

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
    if (!containerRef.current) return;

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
      setAuditImages(prev => [...prev, newImage]);
      setSelectedImageIds([newImage.id]);
    };
    reader.readAsDataURL(file);
  }, [containerRef, getCanvasCoords, setAuditImages]);

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
      setAuditImages(prev => [...prev, newImage]);
      setSelectedImageIds([newImage.id]);
    };
    reader.readAsDataURL(file);
  }, [getCanvasCoords, setAuditImages]);

  // 注册/注销粘贴事件 和 快捷键
  useEffect(() => {
    if (!containerRef.current) return;

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
                  setAuditImages(prev => [...prev, newImage]);
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
            };
            setAuditImages(prev => [...prev, newImage]);
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
  }, [handlePaste, containerRef, selectedImageIds, getCanvasCoords, setAuditImages]);

  // ====== 图片交互 ======

  /** 将指定图片移到叠放顺序最上层（ids 中越靠后的越在上） */
  const bringImagesToFront = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setAuditImages((prev) => {
        const idSet = new Set(ids);
        const front: AuditImage[] = [];
        for (const id of ids) {
          const img = prev.find((i) => i.id === id);
          if (img) front.push(img);
        }
        const rest = prev.filter((i) => !idSet.has(i.id));
        return [...rest, ...front];
      });
    },
    [setAuditImages]
  );

  const pinSelectedImagesToTop = useCallback(() => {
    const ids = selectedImageIdsRef.current;
    if (ids.length === 0) return;
    bringImagesToFront(ids);
    setContextMenu(null);
  }, [bringImagesToFront]);

  // 判断图片是否被选中
  const isImageSelected = (imgId: string) => selectedImageIds.includes(imgId);

  // 选中图片（支持 Ctrl 加选、Alt 减选）
  const handleImagePointerDown = (e: React.PointerEvent, imgId: string) => {
    e.stopPropagation();
    if (currentTool !== 'select') return;

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
      const rect = containerRef.current?.getBoundingClientRect();
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
    const rect = containerRef.current?.getBoundingClientRect();
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

  // 拖拽移动（所有选中图片一起移动）
  const dragStartPositionsRef = useRef<Map<string, {x: number, y: number}>>(new Map());

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingImageId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // 记录所有选中图片的起始位置（只记一次）
    if (dragStartPositionsRef.current.size === 0) {
      setAuditImages(prev => {
        dragStartPositionsRef.current = new Map();
        prev.forEach(img => {
          if (selectedImageIds.includes(img.id)) {
            dragStartPositionsRef.current.set(img.id, { x: img.x, y: img.y });
          }
        });
        return prev;
      });
    }
    setAuditImages(prev => prev.map(img => {
      if (!selectedImageIds.includes(img.id)) return img;
      const start = dragStartPositionsRef.current.get(img.id);
      if (!start) return img;
      const newScreenX = e.clientX - dragOffsetRef.current.x;
      const newScreenY = e.clientY - dragOffsetRef.current.y;
      const newCanvasX = (newScreenX - rect.left - transform.x) / transform.scale;
      const newCanvasY = (newScreenY - rect.top - transform.y) / transform.scale;
      return { ...img, x: newCanvasX, y: newCanvasY };
    }));
  }, [draggingImageId, containerRef, transform, selectedImageIds, setAuditImages]);

  // 停止拖拽
  const handlePointerUp = useCallback(() => {
    setDraggingImageId(null);
    dragStartPositionsRef.current = new Map();
  }, []);

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
      if (!containerRef.current || !draggingImageId) return;
      if (!isResize) {
        const rect = containerRef.current.getBoundingClientRect();
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
        const rect = containerRef.current.getBoundingClientRect();
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
  }, [draggingImageId, containerRef, transform, selectedImageIds, setAuditImages]);

  // ====== 标注绘制 ======

  const saveToHistory = (newAnnotations: AuditAnnotation[]) => {
    // 保留最多2步历史（当前 + 1步撤销）
    const newHistory = annotationHistory.slice(0, 1);
    newHistory.push([...newAnnotations]);
    setAnnotationHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

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

    // 选择工具下，点击空白处开始框选
    if (currentTool === 'select') {
      e.stopPropagation();
      isBoxSelectingRef.current = true;
      boxSelectStartRef.current = { x: e.clientX, y: e.clientY };
      setSelectionBox({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      return;
    }

    e.stopPropagation();

    const pos = getCanvasCoords(e.clientX, e.clientY);

    if (currentTool === 'text') {
      setIsTextInputMode(true);
      setTextInputPos(pos);
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
        strokeWidth: 3,
      });
    } else if (currentTool === 'arrow') {
      setTempAnnotation({
        type: 'arrow',
        x: pos.x,
        y: pos.y,
        endX: pos.x,
        endY: pos.y,
        color: currentColor,
        strokeWidth: 3,
      });
    } else {
      setTempAnnotation({
        type: currentTool as any,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        color: currentColor,
        strokeWidth: 3,
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

    // 框选
    if (isBoxSelectingRef.current) {
      const left = Math.min(boxSelectStartRef.current.x, e.clientX);
      const top = Math.min(boxSelectStartRef.current.y, e.clientY);
      const width = Math.abs(e.clientX - boxSelectStartRef.current.x);
      const height = Math.abs(e.clientY - boxSelectStartRef.current.y);
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

    // 框选完成
    if (isBoxSelectingRef.current && selectionBox) {
      isBoxSelectingRef.current = false;
      setSelectionBox(null);

      if (selectionBox.width < 5 && selectionBox.height < 5) {
        // 点击空白区域 — 关闭菜单并取消所有选中
        setContextMenu(null);
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          setSelectedImageIds([]);
        }
        return;
      }

      // 计算框选区域的画布坐标
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const boxLeft = (selectionBox.left - rect.left - transform.x) / transform.scale;
      const boxTop = (selectionBox.top - rect.top - transform.y) / transform.scale;
      const boxRight = (selectionBox.left + selectionBox.width - rect.left - transform.x) / transform.scale;
      const boxBottom = (selectionBox.top + selectionBox.height - rect.top - transform.y) / transform.scale;

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
      strokeWidth: 3,
      fontSize: currentFontSize,
    };
    const newAnnotations = [...auditAnnotations, newAnn];
    saveToHistory(newAnnotations);
    setAuditAnnotations(newAnnotations);
    setIsTextInputMode(false);
    setTextInputValue('');
  };

  // 撤销
  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setAuditAnnotations([...annotationHistory[newIndex]]);
    }
  };

  // 重做
  const redo = () => {
    if (historyIndex < annotationHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setAuditAnnotations([...annotationHistory[newIndex]]);
    }
  };

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
    await addCompositeToCanvas(selected, [], { x: maxX + 50, y: minY });
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
      const result = await buildAuditImagesComposite(selected);
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
  }, []);

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
      setAuditImages(prev => [...prev, newImage]);
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
      className="absolute inset-0 z-[45] overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
      onWheel={onWheel}
      onContextMenu={handleContextMenu}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* 工具栏 — 右上角 */}
      <div className="absolute top-4 right-4 z-[60] flex flex-col gap-2">
        {/* 操作按钮（仅保留导出合成图片和右键菜单触发的文本图片创建） */}
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
        {/* 叠放顺序与 auditImages 数组一致；选中时 bringImagesToFront 将图片移到末尾 */}
        {auditImages.map((img) => (
          <div
            key={img.id}
            className={`absolute pointer-events-auto ${
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
                  const rect = containerRef.current?.getBoundingClientRect();
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
      </div>

      {/* 标注 Canvas 层 */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width={window.innerWidth}
        height={window.innerHeight}
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

      {/* 清空画布按钮（左上角） */}
      <div className="absolute top-4 left-[204px] z-[60]">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setAuditImages([]);
            saveToHistory([]);
            setAuditAnnotations([]);
            setSelectedImageIds([]);
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
        >
          <input
            ref={textInputRef}
            autoFocus
            className="bg-[#222] border border-amber-500 rounded px-2 py-1 text-white outline-none min-w-[120px]"
            style={{ fontSize: currentFontSize }}
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
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
