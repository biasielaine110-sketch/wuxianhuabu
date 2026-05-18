import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AuditImage, Transform } from './types';

const colors = ['#ffffff', '#000000', '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#ff9ff3', '#54a0ff'];

interface AuditModeCanvasProps {
  auditImages: AuditImage[];
  setAuditImages: React.Dispatch<React.SetStateAction<AuditImage[]>>;
  transform: Transform;
  setTransform?: React.Dispatch<React.SetStateAction<Transform>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onWheel?: (e: React.WheelEvent) => void;
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

  // 历史记录
  const [annotationHistory, setAnnotationHistory] = useState<AuditAnnotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // ref（避免闭包陷阱）
  const currentToolRef = useRef(currentTool);
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  const currentColorRef = useRef(currentColor);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);
  const auditAnnotationsRef = useRef(auditAnnotations);
  useEffect(() => { auditAnnotationsRef.current = auditAnnotations; }, [auditAnnotations]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingStartRef = useRef({ x: 0, y: 0 });
  const clipboardRef = useRef<AuditImage[]>([]);

  // 图片的原始尺寸映射
  const imageSizeCacheRef = useRef<Map<string, { w: number; h: number }>>(new Map());

  // 鼠标在画布坐标系中的坐标计算
  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, [transform, containerRef]);

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
  const getImageNaturalSize = (base64: string): Promise<{ width: number; height: number }> => {
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
      img.src = 'data:image/png;base64,' + base64;
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

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const naturalSize = await getImageNaturalSize(base64);
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

    const items = e.clipboardData?.items;
    const imageItem = items ? Array.from(items).find(item => item.type.startsWith('image/')) : null;
    if (!imageItem) return;
    e.preventDefault();

    const file = imageItem.getAsFile();
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      const base64 = result.split(',')[1];
      if (!base64) return;

      const naturalSize = await getImageNaturalSize(base64);
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const pos = getCanvasCoords(centerX, centerY);

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

      // G 键：重置选中图片的大小为原始尺寸
      if (e.code === 'KeyG' && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setAuditImages(prev => prev.map(img =>
          selectedImageIds.includes(img.id) ? { ...img, scale: 1 } : img
        ));
        return;
      }

      // Ctrl+C / Meta+C：复制选中图片的 base64
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !isInput) {
        const selected = auditImagesRef.current.filter(img => selectedImageIds.includes(img.id));
        if (selected.length === 0) return;
        if (selected.length === 1) {
          navigator.clipboard.writeText(`data:image/png;base64,${selected[0].base64}`);
        }
        clipboardRef.current = selected.map(img => ({ ...img }));
        return;
      }

      // Ctrl+V / Meta+V：粘贴图片
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !isInput) {
        if (clipboardRef.current.length > 0) {
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const pos = getCanvasCoords(centerX, centerY);
          const newImages = clipboardRef.current.map((img, i) => ({
            ...img,
            id: `audit-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
            x: pos.x + i * 30,
            y: pos.y + i * 30,
          }));
          setAuditImages(prev => [...prev, ...newImages]);
          setSelectedImageIds(newImages.map(img => img.id));
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

    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handlePaste, containerRef, selectedImageIds, getCanvasCoords, setAuditImages]);

  // ====== 图片交互 ======

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
      setSelectedImageIds(prev =>
        prev.includes(imgId) ? [...prev.filter(id => id !== imgId), imgId] : [...prev, imgId]
      );
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

    // 普通点击：单选，点击的图片置顶（移到数组末尾）
    setSelectedImageIds(prev =>
      prev.includes(imgId) ? [...prev.filter(id => id !== imgId), imgId] : [imgId]
    );

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
        setAuditImages(prev => prev.map(img => {
          if (img.id !== draggingImageId) return img;
          // 拖拽开始时鼠标相对于图片左下角偏移量
          const imgScreenX = img.x * transform.scale + transform.x + rect.left;
          const imgScreenY = img.y * transform.scale + transform.y + rect.top;
          // 新的屏幕宽度 = 鼠标当前x - 图片左边缘x
          const newScreenW = e.clientX - imgScreenX;
          const newScreenH = e.clientY - imgScreenY;
          // 保持宽高比，取比例改变较小的那个值
          const scaleW = newScreenW / (img.width * transform.scale);
          const scaleH = newScreenH / (img.height * transform.scale);
          const newScale = Math.max(0.02, Math.min(scaleW, scaleH));
          return { ...img, scale: newScale };
        }));
      }
    };
    const handleUp = () => {
      setDraggingImageId(null);
      startPositions.clear();
      isResizingRef.current = false;
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
    const newHistory = annotationHistory.slice(0, historyIndex + 1);
    newHistory.push([...newAnnotations]);
    setAnnotationHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
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
        // 点击空白区域 — 取消所有选中
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

      setSelectedImageIds(prev => {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl: 追加（新选中的放到末尾 = 置顶）
          const set = new Set(prev);
          const existing = prev.filter(id => set.has(id) && !hitIds.includes(id));
          const newOnes = hitIds.filter(id => !set.has(id));
          return [...existing, ...newOnes];
        } else if (e.altKey) {
          // Alt: 减去
          const set = new Set(prev);
          hitIds.forEach(id => set.delete(id));
          return Array.from(set);
        } else {
          // 新框选替换旧选择，最新框选的在末尾
          return hitIds;
        }
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

  // ====== 导出功能 ======
  const exportAsImage = async () => {
    if (auditImages.length === 0) return;
    // 计算所有图片的边界
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const img of auditImages) {
      const w = img.width * img.scale;
      const h = img.height * img.scale;
      minX = Math.min(minX, img.x);
      minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + w);
      maxY = Math.max(maxY, img.y + h);
    }

    const exportW = Math.ceil(maxX - minX);
    const exportH = Math.ceil(maxY - minY);
    const canvas = document.createElement('canvas');
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 绘制所有图片
    for (const img of auditImages) {
      const w = img.width * img.scale;
      const h = img.height * img.scale;
      const imgEl = new Image();
      await new Promise<void>((resolve) => {
        imgEl.onload = () => {
          ctx!.drawImage(imgEl, img.x - minX, img.y - minY, w, h);
          resolve();
        };
        imgEl.onerror = () => resolve();
        imgEl.src = 'data:image/png;base64,' + img.base64;
      });
    }

    // 绘制标注
    const anns = auditAnnotationsRef.current;
    if (anns.length > 0) {
      const annCtx = ctx;
      anns.forEach(ann => {
        const adjustedAnn = { ...ann, x: ann.x - minX, y: ann.y - minY };
        if (ann.endX !== undefined) adjustedAnn.endX = ann.endX - minX;
        if (ann.endY !== undefined) adjustedAnn.endY = ann.endY - minY;
        if (ann.points) {
          adjustedAnn.points = ann.points.map(p => ({ x: p.x - minX, y: p.y - minY }));
        }

        annCtx.strokeStyle = ann.color;
        annCtx.fillStyle = ann.color;
        annCtx.lineWidth = ann.strokeWidth || 2;

        switch (ann.type) {
          case 'rect':
            annCtx.strokeRect(adjustedAnn.x, adjustedAnn.y, ann.width || 0, ann.height || 0);
            break;
          case 'fillRect':
            annCtx.globalAlpha = ann.fillOpacity ?? 0.45;
            annCtx.fillRect(adjustedAnn.x, adjustedAnn.y, ann.width || 0, ann.height || 0);
            annCtx.strokeRect(adjustedAnn.x, adjustedAnn.y, ann.width || 0, ann.height || 0);
            annCtx.globalAlpha = 1;
            break;
          case 'circle':
            annCtx.beginPath();
            annCtx.ellipse(
              adjustedAnn.x + (ann.width || 0) / 2,
              adjustedAnn.y + (ann.height || 0) / 2,
              Math.abs(ann.width || 0) / 2, Math.abs(ann.height || 0) / 2,
              0, 0, Math.PI * 2
            );
            annCtx.stroke();
            break;
          case 'fillCircle':
            annCtx.beginPath();
            annCtx.ellipse(
              adjustedAnn.x + (ann.width || 0) / 2,
              adjustedAnn.y + (ann.height || 0) / 2,
              Math.abs(ann.width || 0) / 2, Math.abs(ann.height || 0) / 2,
              0, 0, Math.PI * 2
            );
            annCtx.globalAlpha = ann.fillOpacity ?? 0.45;
            annCtx.fill();
            annCtx.globalAlpha = 1;
            annCtx.stroke();
            break;
          case 'arrow':
            drawArrow(annCtx, adjustedAnn.x, adjustedAnn.y, adjustedAnn.endX || 0, adjustedAnn.endY || 0, ann.color, ann.strokeWidth || 2);
            break;
          case 'pen':
            if (adjustedAnn.points && adjustedAnn.points.length > 1) {
              annCtx.beginPath();
              annCtx.moveTo(adjustedAnn.points[0].x, adjustedAnn.points[0].y);
              for (let i = 1; i < adjustedAnn.points.length; i++) {
                annCtx.lineTo(adjustedAnn.points[i].x, adjustedAnn.points[i].y);
              }
              annCtx.stroke();
            }
            break;
          case 'text':
            annCtx.font = `${ann.fontSize || 16}px sans-serif`;
            annCtx.fillText(ann.text || '', adjustedAnn.x, adjustedAnn.y);
            break;
        }
      });
    }

    const exportedBase64 = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `audit-export-${Date.now()}.png`;
    link.href = exportedBase64;
    link.click();
  };

  return (
    <div
      className="absolute inset-0 z-[45] overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
      onWheel={onWheel}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* 工具栏 — 右上角 */}
      <div className="absolute top-4 right-4 z-[60] flex flex-col gap-2">
        <div className="bg-[#1e1e1e]/95 backdrop-blur-md rounded-xl border border-[#333] p-2 shadow-2xl flex flex-col gap-1.5">
          {/* 工具按钮 */}
          <div className="flex items-center gap-1 flex-wrap max-w-[280px]">
            {(['select', 'rect', 'circle', 'fillRect', 'fillCircle', 'arrow', 'pen', 'text'] as const).map((tool) => (
              <button
                key={tool}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setCurrentTool(tool)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  currentTool === tool
                    ? 'bg-amber-600 text-white'
                    : 'bg-[#333] text-gray-400 hover:bg-[#444] hover:text-white'
                }`}
              >
                {tool === 'select' ? '选择' : tool === 'rect' ? '矩形' : tool === 'circle' ? '圆形' : tool === 'fillRect' ? '填矩形' : tool === 'fillCircle' ? '填椭圆' : tool === 'arrow' ? '箭头' : tool === 'pen' ? '画笔' : '文字'}
              </button>
            ))}
          </div>

          {/* 颜色选择 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 shrink-0">颜色:</span>
            <div className="flex gap-0.5">
              {colors.map((color) => (
                <button
                  key={color}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setCurrentColor(color)}
                  className={`w-4 h-4 rounded border ${currentColor === color ? 'border-white ring-1 ring-white' : color === '#ffffff' ? 'border-gray-500' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <input
              type="color"
              value={currentColor}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setCurrentColor(e.target.value)}
              className="w-6 h-4 rounded border border-[#555] cursor-pointer p-0 bg-transparent"
            />
          </div>

          {/* 字体大小 */}
          {currentTool === 'text' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500">大小:</span>
              <select
                className="bg-[#222] border border-[#444] rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
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
        <div className="bg-[#1e1e1e]/95 backdrop-blur-md rounded-xl border border-[#333] p-2 shadow-2xl flex flex-col gap-1">
          <div className="flex gap-1">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={undo}
              disabled={historyIndex <= 0}
              className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              撤销
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={redo}
              disabled={historyIndex >= annotationHistory.length - 1}
              className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              重做
            </button>
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={clearAnnotations}
            className="w-full py-1 px-2 rounded text-[10px] bg-red-900/50 hover:bg-red-800/50 text-red-300"
          >
            清除标注
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={exportAsImage}
            className="w-full py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white flex items-center justify-center gap-1"
          >
            导出合成图片
          </button>
        </div>
      </div>

      {/* 看图图片层 */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {/* 先渲染未选中的图片，再渲染选中的（且按选中顺序，后选中的在上面） */}
        {(() => {
          const all = [...auditImages];
          const selectedSet = new Set(selectedImageIds);
          const unselected = all.filter(img => !selectedSet.has(img.id));
          const selected = selectedImageIds.map(id => all.find(img => img.id === id)).filter(Boolean) as AuditImage[];
          return [...unselected, ...selected];
        })().map(img => (
          <div
            key={img.id}
            className={`absolute pointer-events-auto ${
              selectedImageIds.includes(img.id)
                ? 'outline outline-3 outline-amber-300 outline-offset-2 shadow-[0_0_0_4px_rgba(251,191,36,0.3)]'
                : ''
            }`}
            style={{
              left: img.x,
              top: img.y,
              width: img.width * img.scale,
              height: img.height * img.scale,
            }}
            onPointerDown={(e) => handleImagePointerDown(e, img.id)}
          >
            <img
              src={'data:image/png;base64,' + img.base64}
              alt="audit"
              className="w-full h-full"
              style={{ objectFit: 'fill', display: 'block' }}
              draggable={false}
            />
            {/* 缩放手柄 — 右下角 */}
            {selectedImageIds.includes(img.id) && (
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-amber-500 border-2 border-white rounded-sm cursor-se-resize"
                style={{ transform: 'translate(50%, 50%)' }}
                onPointerDown={(e) => handleImagePointerDown(e, img.id)}
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
      <div className="absolute top-4 left-4 z-[60]">
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
    </div>
  );
}
