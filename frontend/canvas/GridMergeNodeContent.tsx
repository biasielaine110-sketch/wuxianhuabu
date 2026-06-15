import React, { useEffect, useRef, useState } from 'react';
import type { CanvasNode, Edge, GridMergeNode } from '../types';
import { EyedropperIcon } from './canvasIcons';
import {
  getConnectedImages,
  getGridLayout,
  loadImageElement,
  resolveImageSrc,
  type ResolvedGridImage,
} from './gridNodeUtils';
import { buildNodeMediaOffloadPatch } from '../services/canvasAssetSync';
import { OptimizedImage } from './OptimizedImage';

export interface GridMergeNodeContentProps {
  node: GridMergeNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<GridMergeNode>) => void;
  onCreateImageNode: (image: string, nodeX: number, nodeY: number, assetId?: string) => void;
  onCopyToImage?: () => void;
  /** 删除一条连线（用于删除宫格中来自链接源的格子） */
  onDeleteEdge?: (edgeId: string) => void;
}

function slotImage(
  inputImages: string[],
  inputImageAssetIds: string[] | undefined,
  connectedImages: ResolvedGridImage[],
  idx: number
): ResolvedGridImage | undefined {
  const base64 = inputImages[idx];
  const assetId = inputImageAssetIds?.[idx];
  if (base64 || assetId) return { base64, assetId };
  return connectedImages[idx];
}

function hasResolvedImage(img?: ResolvedGridImage): boolean {
  return !!(img?.base64 || img?.assetId);
}

export function GridMergeNodeContent({
  node,
  nodes,
  edges,
  eyedropperTargetNodeId,
  onEyedropperSelect,
  onUpdate,
  onCreateImageNode,
  onCopyToImage,
  onDeleteEdge,
}: GridMergeNodeContentProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const inputImages = node.inputImages ?? [];
  const inputImageAssetIds = node.inputImageAssetIds;
  const outputImage = node.outputImage ?? '';
  const outputImageAssetId = node.outputImageAssetId;
  const gridCount = node.gridCount ?? 4;
  const frameAspectRatio = node.aspectRatio === '9:16' ? '9:16' : '16:9';
  const previewRef = useRef<HTMLDivElement>(null);
  /** 拖动 swap: dragFromIdx 是按下时的 cell 下标; dragOverIdx 是当前 hover 的 cell 下标 */
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const { cols, rows } = getGridLayout(gridCount);
  const connectedImages = getConnectedImages(node.id, nodes, edges);

  const filledSlotCount = Array.from({ length: gridCount }).filter((_, idx) =>
    hasResolvedImage(slotImage(inputImages, inputImageAssetIds, connectedImages, idx))
  ).length;

  /**
   * 删除单个格子：清空该 idx 的 inputImages/inputImageAssetIds。
   * 如果该格当前显示的图来自 connectedImages (即未实体化)，需要把对应的入边也删掉，
   * 否则空 inputImages[idx] 仍会回退到 connectedImages[idx] 继续显示。
   */
  const handleClearSlot = (idx: number) => {
    const currentInputB64 = inputImages[idx];
    const currentInputAsset = inputImageAssetIds?.[idx];
    const fromInput = !!(currentInputB64 || currentInputAsset);
    // 1) 总是把该 idx 实体化为空（避免后续 swap 把它带回来）
    //    这里以当前 gridCount 为目标长度补齐，保留其它位置的实体化结果
    const newImgs: string[] = Array.from({ length: gridCount }, (_, i) => inputImages[i] ?? '');
    const newIds: string[] = Array.from({ length: gridCount }, (_, i) => inputImageAssetIds?.[i] ?? '');
    newImgs[idx] = '';
    newIds[idx] = '';
    onUpdate({ inputImages: newImgs, inputImageAssetIds: newIds });
    // 2) 如果该格的图来自连接源，删掉对应的入边（connectedImages[idx] ↔ incomingEdges[idx]）
    if (!fromInput) {
      const incomingEdges = edges.filter((e) => e.targetId === node.id);
      const edge = incomingEdges[idx];
      if (edge && onDeleteEdge) onDeleteEdge(edge.id);
    }
  };

  /**
   * 拖动 swap: 把当前显示的 cell 顺序按 from/to 调换, 并把"已显示"的所有 slot 实体化写到 node.inputImages/inputImageAssetIds
   * - 拖动一次后, connectedImages 链接的图也会被"固化"到 inputImages, 之后位置不再受 edges 顺序影响
   * - 空 slot 拖动也允许 (用户可以拖动占位符), 但写回时保持空 (swap 不影响)
   */
  const handleSlotSwap = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    // 1) 把当前显示的 slots 全部解析成数组
    const currentSlots: ResolvedGridImage[] = Array.from({ length: gridCount }, (_, i) =>
      slotImage(inputImages, inputImageAssetIds, connectedImages, i)
    );
    // 2) swap
    const swapped = [...currentSlots];
    [swapped[fromIdx], swapped[toIdx]] = [swapped[toIdx], swapped[fromIdx]];
    // 3) 写回 inputImages / inputImageAssetIds (实体化)
    const newImgs: string[] = swapped.map((s) => s?.base64 ?? '');
    const newIds: string[] = swapped.map((s) => s?.assetId ?? '');
    onUpdate({ inputImages: newImgs, inputImageAssetIds: newIds });
  };

  const onCellPointerDown = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDragFromIdx(idx);
    setDragOverIdx(idx);
  };
  const onCellPointerEnter = (idx: number) => {
    if (dragFromIdx === null) return;
    if (idx !== dragFromIdx) setDragOverIdx(idx);
  };
  const onCellPointerUp = () => {
    if (dragFromIdx !== null && dragOverIdx !== null && dragFromIdx !== dragOverIdx) {
      handleSlotSwap(dragFromIdx, dragOverIdx);
    }
    setDragFromIdx(null);
    setDragOverIdx(null);
  };
  // 全局兜底: 鼠标在节点外释放也算松手
  React.useEffect(() => {
    if (dragFromIdx === null) return;
    const onUp = () => {
      if (dragFromIdx !== null && dragOverIdx !== null && dragFromIdx !== dragOverIdx) {
        handleSlotSwap(dragFromIdx, dragOverIdx);
      }
      setDragFromIdx(null);
      setDragOverIdx(null);
    };
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, [dragFromIdx, dragOverIdx, inputImages, inputImageAssetIds, connectedImages, gridCount]);

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
            onUpdate({ inputImages: results, inputImageAssetIds: undefined });
          }
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  };

  const handleMerge = async () => {
    const slots: ResolvedGridImage[] = [];
    for (let i = 0; i < gridCount; i++) {
      const slot = slotImage(inputImages, inputImageAssetIds, connectedImages, i);
      if (!hasResolvedImage(slot)) {
        alert(`请先导入或连接 ${gridCount} 张图片`);
        return;
      }
      slots.push(slot!);
    }

    setIsProcessing(true);

    try {
      const loadedImages: HTMLImageElement[] = [];
      for (const slot of slots) {
        const src = await resolveImageSrc(slot.base64, slot.assetId);
        if (!src) throw new Error('resolve failed');
        loadedImages.push(await loadImageElement(src));
      }

      // 单格目标画幅 = node.aspectRatio（16:9 或 9:16）
      // 整图 frame 比例 = 单格 × 宫格排布（4/9 宫方阵时 frame 也等于单格比例；
      // 3/6 宫非方阵时 frame 会被拉长，例如 3 宫 1×3 + 16:9 → frame 16:3）
      const cellRatio = frameAspectRatio === '9:16' ? 9 / 16 : 16 / 9;
      // 单格像素：取第一张输入图的实际像素作为基准（保持其分辨率感），
      // 但强制 cellWidth/cellHeight 严格 cellRatio
      const refImg = loadedImages[0];
      let cellWidth: number;
      let cellHeight: number;
      if (cellRatio >= 1) {
        cellWidth = refImg.width;
        cellHeight = Math.round(refImg.width / cellRatio);
      } else {
        cellHeight = refImg.height;
        cellWidth = Math.round(refImg.height * cellRatio);
      }
      const frameWidth = cellWidth * cols;
      const frameHeight = cellHeight * rows;

      const canvas = document.createElement('canvas');
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 每个输入图按"中心裁剪到 cell 比例"再贴入对应 cell
      let idx = 0;
      for (let r = 0; r < rows && idx < gridCount; r++) {
        for (let c = 0; c < cols && idx < gridCount; c++) {
          const img = loadedImages[idx];
          // cover 模式：把 img 缩放填满 cell，溢出部分裁掉
          const imgRatio = img.width / img.height;
          let sx = 0;
          let sy = 0;
          let sw = img.width;
          let sh = img.height;
          if (imgRatio > cellRatio) {
            // img 更宽 → 裁左右
            sw = img.height * cellRatio;
            sx = (img.width - sw) / 2;
          } else {
            // img 更高 → 裁上下
            sh = img.width / cellRatio;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(
            img,
            sx, sy, sw, sh,
            c * cellWidth, r * cellHeight, cellWidth, cellHeight
          );
          idx++;
        }
      }

      // 缩放：默认 100%（与原图同分辨率），用户可在 UI 上下拉调整并触发 rescale
      const scalePercent = (() => {
        const v = node.exportScale;
        return Number.isFinite(v) && v! > 0 ? (v as number) : 100;
      })();
      const scaleRatio = scalePercent / 100;
      const outW = Math.max(1, Math.round(canvas.width * scaleRatio));
      const outH = Math.max(1, Math.round(canvas.height * scaleRatio));
      let result: string;
      if (scaleRatio === 1) {
        result = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      } else {
        const scaled = document.createElement('canvas');
        scaled.width = outW;
        scaled.height = outH;
        const sctx = scaled.getContext('2d')!;
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(canvas, 0, 0, outW, outH);
        result = scaled.toDataURL('image/jpeg', 0.95).split(',')[1];
      }
      let update: Partial<GridMergeNode> = {
        outputImage: result,
        outputImageAssetId: undefined,
      };
      const patch = await buildNodeMediaOffloadPatch({ ...node, ...update });
      if (patch) {
        update = { ...update, ...(patch as Partial<GridMergeNode>) };
      }
      onUpdate(update);
    } catch (error) {
      console.error('合并失败:', error);
      alert('合并失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (onCopyToImage) {
      onCopyToImage();
      return;
    }
    if (outputImage) {
      onCreateImageNode(outputImage, node.x + node.width + 50, node.y);
      return;
    }
    if (outputImageAssetId) {
      onCreateImageNode('', node.x + node.width + 50, node.y, outputImageAssetId);
    }
  };

  /**
   * 把已有的 outputImage（或 outputImageAssetId）按给定比例重新缩放写出。
   * 仅走一遍 canvas decode → drawImage → toDataURL，避开重新跑合并/letterbox 流程。
   * 用于用户调整「缩放」下拉后立即按新比例重写 output。
   */
  const handleRescaleOutput = async (scalePercent: number) => {
    if (!outputImage && !outputImageAssetId) return;
    if (!Number.isFinite(scalePercent) || scalePercent <= 0) return;
    setIsProcessing(true);
    try {
      const src = await resolveImageSrc(outputImage, outputImageAssetId);
      const img = await loadImageElement(src);
      const ratio = scalePercent / 100;
      const outW = Math.max(1, Math.round(img.width * ratio));
      const outH = Math.max(1, Math.round(img.height * ratio));
      const scaled = document.createElement('canvas');
      scaled.width = outW;
      scaled.height = outH;
      const ctx = scaled.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, outW, outH);
      const result = scaled.toDataURL('image/jpeg', 0.95).split(',')[1];
      let update: Partial<GridMergeNode> = {
        exportScale: scalePercent,
        outputImage: result,
        outputImageAssetId: undefined,
      };
      const patch = await buildNodeMediaOffloadPatch({ ...node, ...update });
      if (patch) {
        update = { ...update, ...(patch as Partial<GridMergeNode>) };
      }
      onUpdate(update);
    } catch (error) {
      console.error('缩放失败:', error);
      alert('缩放失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const onChangeExportScale = (v: number) => {
    if (!outputImage && !outputImageAssetId) {
      // 还没有合并结果, 仅持久化用户选择, 等下次合并时生效
      onUpdate({ exportScale: v });
      return;
    }
    void handleRescaleOutput(v);
  };

  const hasPreviewSlots =
    inputImages.some((im, i) => im || inputImageAssetIds?.[i]) || connectedImages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-1 p-2 overflow-y-auto">
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
            {hasPreviewSlots ? (
              <div
                className="absolute inset-0 grid gap-px p-1"
                style={{
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gridTemplateRows: `repeat(${rows}, 1fr)`,
                }}
              >
                {Array.from({ length: gridCount }).map((_, idx) => {
                  const img = slotImage(inputImages, inputImageAssetIds, connectedImages, idx);
                  const isDragging = dragFromIdx === idx;
                  const isDragOver = dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx;
                  return (
                    <div
                      key={idx}
                      onPointerDown={(e) => onCellPointerDown(e, idx)}
                      onPointerEnter={() => onCellPointerEnter(idx)}
                      onPointerUp={onCellPointerUp}
                      className={`group relative bg-[#1a1a1a] rounded overflow-hidden flex items-center justify-center select-none touch-none ${
                        isDragging ? 'cursor-grabbing opacity-60' : 'cursor-grab'
                      } ${isDragOver ? 'ring-2 ring-teal-400 ring-inset' : ''}`}
                    >
                      {hasResolvedImage(img) && img ? (
                        <>
                          <OptimizedImage
                            base64={img.base64}
                            assetId={img.assetId}
                            maxSide={1440}
                            quality={0.62}
                            className="w-full h-full object-cover pointer-events-none"
                            alt={`格${idx + 1}`}
                          />
                          <div className="absolute top-0.5 left-0.5 text-[8px] font-bold text-teal-400 bg-black/60 px-1 rounded pointer-events-none">
                            {idx + 1}
                          </div>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearSlot(idx);
                            }}
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-600/80 hover:bg-red-500 text-white text-[12px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="删除该格图片（取消该图片的链接）"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full bg-[#2a2a2a] border border-dashed border-[#555] rounded flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                          <span className="text-[9px] text-[#888]">已移除</span>
                          <span className="text-[10px] text-[#666]">{idx + 1}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
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
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs" />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        {([3, 4, 6, 9] as const).map((count) => (
          <button
            key={count}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onUpdate({ gridCount: count })}
            className={`flex-1 py-1 px-2 rounded text-[10px] ${
              gridCount === count ? 'bg-teal-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'
            }`}
            title={count === 3 ? '3×1 竖向' : count === 4 ? '2×2' : count === 6 ? '2×3' : '3×3'}
          >
            {count}宫格
          </button>
        ))}
      </div>

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

      <div className="flex gap-1">
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            onEyedropperSelect();
          }}
          className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
          title={eyedropperTargetNodeId === node.id ? '取消吸取' : '吸取图片'}
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
          onClick={() => void handleMerge()}
          disabled={isProcessing || filledSlotCount < gridCount}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
        >
          {isProcessing ? '处理中...' : '合并'}
        </button>
      </div>

      {(outputImage || outputImageAssetId) && (
        <div className="flex items-center gap-2">
          <OptimizedImage
            base64={outputImage}
            assetId={outputImageAssetId}
            maxSide={120}
            quality={0.56}
            className="w-16 h-16 object-cover rounded border border-[#444]"
            alt="合并结果"
          />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-gray-400">缩放:</span>
            <select
              value={node.exportScale ?? 100}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onChangeExportScale(Number(e.target.value))}
              disabled={isProcessing}
              className="rounded border border-[#444] bg-[#333] px-1 py-0.5 text-[10px] text-gray-200 outline-none cursor-pointer disabled:opacity-50"
              title="合并后再次按比例缩放导出（不必重新合并）"
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
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void handleExport()}
            disabled={!outputImage && !outputImageAssetId}
            className="px-2 py-1 rounded text-[10px] bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
            title="导出到节点"
          >
            导出
          </button>
        </div>
      )}
    </div>
  );
}
