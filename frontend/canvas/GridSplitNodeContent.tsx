import React, { useRef, useState } from 'react';
import type { CanvasNode, Edge, GridSplitNode } from '../types';
import { EyedropperIcon } from './canvasIcons';
import {
  getFirstConnectedImage,
  getGridLayout,
  loadImageElement,
  resolveImageSrc,
  type ResolvedGridImage,
} from './gridNodeUtils';
import { buildNodeMediaOffloadPatch } from '../services/canvasAssetSync';
import { OptimizedImage } from './OptimizedImage';

export interface GridSplitNodeContentProps {
  node: GridSplitNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<GridSplitNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
  onCopyToImage?: () => void;
}

function hasResolvedImage(img?: ResolvedGridImage): boolean {
  return !!(img?.base64 || img?.assetId);
}

export function GridSplitNodeContent({
  node,
  nodes,
  edges,
  eyedropperTargetNodeId,
  onEyedropperSelect,
  onUpdate,
  onCreateImageNode,
  onCopyToImage,
}: GridSplitNodeContentProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const inputImage = node.inputImage ?? '';
  const inputImageAssetId = node.inputImageAssetId;
  const outputImages = node.outputImages ?? [];
  const gridCount = node.gridCount ?? 4;
  const frameAspectRatio = node.aspectRatio === '9:16' ? '9:16' : '16:9';
  const previewRef = useRef<HTMLDivElement>(null);

  const connectedImage = getFirstConnectedImage(node.id, nodes, edges);
  const displayImage: ResolvedGridImage | undefined = inputImage || inputImageAssetId
    ? { base64: inputImage, assetId: inputImageAssetId }
    : connectedImage;
  const hasDisplayImage = hasResolvedImage(displayImage);

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(',')[1];
          onUpdate({ inputImage: base64, inputImageAssetId: undefined });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleSplit = async () => {
    if (!hasDisplayImage || !displayImage) {
      alert('请先导入或连接一张图片');
      return;
    }

    setIsProcessing(true);

    try {
      const src = await resolveImageSrc(displayImage.base64, displayImage.assetId);
      if (!src) {
        alert('无法读取图片数据');
        return;
      }
      const img = await loadImageElement(src);

      const { cols, rows } = getGridLayout(gridCount);
      const targetRatio = frameAspectRatio === '9:16' ? 9 / 16 : 16 / 9;
      const sourceRatio = img.width / img.height;
      let frameWidth = img.width;
      let frameHeight = img.height;
      let frameX = 0;
      let frameY = 0;

      if (sourceRatio > targetRatio) {
        frameWidth = img.height * targetRatio;
        frameX = (img.width - frameWidth) / 2;
      } else if (sourceRatio < targetRatio) {
        frameHeight = img.width / targetRatio;
        frameY = (img.height - frameHeight) / 2;
      }

      const cellWidth = frameWidth / cols;
      const cellHeight = frameHeight / rows;

      const results: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sourceX = frameX + c * cellWidth;
          const sourceY = frameY + r * cellHeight;
          canvas.width = Math.max(1, Math.round(cellWidth));
          canvas.height = Math.max(1, Math.round(cellHeight));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, sourceX, sourceY, cellWidth, cellHeight, 0, 0, canvas.width, canvas.height);
          results.push(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
        }
      }

      let update: Partial<GridSplitNode> = {
        outputImages: results,
        outputImageAssetIds: undefined,
      };
      const patch = await buildNodeMediaOffloadPatch({ ...node, ...update });
      if (patch) {
        update = { ...update, ...(patch as Partial<GridSplitNode>) };
      }
      onUpdate(update);
    } catch (error) {
      console.error('拆分失败:', error);
      alert('拆分失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (onCopyToImage) {
      onCopyToImage();
      return;
    }
    const assetIds = node.outputImageAssetIds;
    const len = Math.max(outputImages.length, assetIds?.length ?? 0);
    if (len === 0) return;
    const images = Array.from({ length: len }, (_, i) => outputImages[i] ?? '');
    onCreateImageNode(images, node.x + node.width + 50, node.y);
  };

  const { cols, rows } = getGridLayout(gridCount);

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
            {hasDisplayImage && displayImage ? (
              <>
                <OptimizedImage
                  base64={displayImage.base64}
                  assetId={displayImage.assetId}
                  maxSide={1440}
                  quality={0.62}
                  className="w-full h-full object-cover"
                  alt="待拆分图片"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(0,255,255,0.8) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(0,255,255,0.8) 1px, transparent 1px)
                    `,
                    backgroundSize: `${100 / cols}% ${100 / rows}%`,
                  }}
                />
                {Array.from({ length: gridCount }).map((_, idx) => {
                  const c = idx % cols;
                  const r = Math.floor(idx / cols);
                  return (
                    <div
                      key={idx}
                      className="absolute flex items-center justify-center text-xs font-bold text-cyan-400 bg-black/50 rounded"
                      style={{
                        left: `${(c * 100) / cols}%`,
                        top: `${(r * 100) / rows}%`,
                        width: `${100 / cols}%`,
                        height: `${100 / rows}%`,
                      }}
                    >
                      {idx + 1}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs" />
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
            title={count === 3 ? '1×3 横排' : count === 4 ? '2×2' : count === 6 ? '2×3' : '3×3'}
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
          onClick={() => void handleSplit()}
          disabled={isProcessing || !hasDisplayImage}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
        >
          {isProcessing ? '处理中...' : '拆分'}
        </button>
      </div>

      {outputImages.length > 0 || (node.outputImageAssetIds?.some(Boolean)) ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {Array.from({
              length: Math.max(outputImages.length, node.outputImageAssetIds?.length ?? 0),
            }).map((_, idx) => (
              <OptimizedImage
                key={idx}
                base64={outputImages[idx]}
                assetId={node.outputImageAssetIds?.[idx]}
                maxSide={128}
                quality={0.72}
                className="w-8 h-8 object-cover rounded border border-[#444]"
                alt={`格${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleExport}
            className="flex-1 py-1 px-2 rounded text-[10px] bg-green-600 hover:bg-green-500 text-white"
            title="导出到节点"
          >
            导出
          </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default GridSplitNodeContent;
