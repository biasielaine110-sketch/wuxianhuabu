import React, { useRef, useState } from 'react';
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
}: GridMergeNodeContentProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const inputImages = node.inputImages ?? [];
  const inputImageAssetIds = node.inputImageAssetIds;
  const outputImage = node.outputImage ?? '';
  const outputImageAssetId = node.outputImageAssetId;
  const gridCount = node.gridCount ?? 4;
  const frameAspectRatio = node.aspectRatio === '9:16' ? '9:16' : '16:9';
  const previewRef = useRef<HTMLDivElement>(null);

  const { cols, rows } = getGridLayout(gridCount);
  const connectedImages = getConnectedImages(node.id, nodes, edges);

  const filledSlotCount = Array.from({ length: gridCount }).filter((_, idx) =>
    hasResolvedImage(slotImage(inputImages, inputImageAssetIds, connectedImages, idx))
  ).length;

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
                  return (
                    <div
                      key={idx}
                      className="relative bg-[#1a1a1a] rounded overflow-hidden flex items-center justify-center"
                    >
                      {hasResolvedImage(img) && img ? (
                        <>
                          <OptimizedImage
                            base64={img.base64}
                            assetId={img.assetId}
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
