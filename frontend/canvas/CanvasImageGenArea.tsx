import React from 'react';
import type { CanvasNode } from '../types';
import { hasCanvasImagePayload, resolveCanvasImageSource } from '../services/canvasAssetResolver';
import type { CopyToImageOptions } from './copyToImageOptions';
import { GenerationHoloOverlay } from './GenerationHoloOverlay';
import { GenerationTimer } from './GenerationTimer';
import { ResponsiveImagePreview } from './ResponsiveImagePreview';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  EyedropperIcon,
  GridIcon,
  LoaderIcon,
  MaximizeIcon,
  PlusIcon,
  SingleIcon,
  TextIcon,
} from './canvasIcons';

export interface CanvasImageGenAreaProps {
  node: CanvasNode;
  nodeInViewport: boolean;
  images: string[];
  imageAssetIds?: string[];
  hasDisplayableImages: boolean;
  viewMode: 'single' | 'grid';
  currentIndex: number;
  thumbResolutionPct: number;
  generationStartedAt?: number;
  eyedropperTargetNodeId: string | null;
  eyedropperTargetNodeIdRef: React.MutableRefObject<string | null>;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onCopyToImage: (nodeId: string, options?: CopyToImageOptions) => void;
  onCanvasEyedropper: (sourceId: string, targetId: string) => boolean;
  openFullscreenImage: (nodeId: string, img: string, idx: number) => void;
  setEyedropperTargetNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  onImportImage: (nodeId: string) => void;
  /** 与「最大化图片」下载走同一条 saveImageDownload 路径（含固定目录 / 草稿目录 / 另存为 流程） */
  onDownloadImage: (imageSrc: string) => void;
}

export function CanvasImageGenArea({
  node,
  nodeInViewport,
  images,
  imageAssetIds,
  hasDisplayableImages,
  viewMode,
  currentIndex,
  thumbResolutionPct,
  generationStartedAt,
  eyedropperTargetNodeId,
  eyedropperTargetNodeIdRef,
  onUpdateNode,
  onCopyToImage,
  onCanvasEyedropper,
  openFullscreenImage,
  setEyedropperTargetNodeId,
  onImportImage,
  onDownloadImage,
}: CanvasImageGenAreaProps) {
  const isImageNode = node.type === 'image';

  return (
    <div
      className={`w-full bg-[#2a2a2a] relative border-b border-[#333] overflow-hidden group flex flex-col min-h-0 ${
        isImageNode ? 'flex-1 min-h-[320px]' : 'flex-[5] min-h-[240px] basis-0 min-w-0'
      }`}
    >
      {node.isGenerating && <GenerationHoloOverlay />}
      {hasDisplayableImages ? (
        <>
          <div
            className={`absolute top-2 right-2 z-10 flex gap-1 transition-opacity ${
              isImageNode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {(node.type === 'i2i' || node.type === 'image') && (
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setEyedropperTargetNodeId(node.id);
                }}
                className={`p-1.5 rounded text-white backdrop-blur-sm ${
                  eyedropperTargetNodeId === node.id
                    ? 'bg-cyan-600 hover:bg-cyan-500'
                    : 'bg-black/60 hover:bg-black/80'
                }`}
                title={eyedropperTargetNodeId === node.id ? '取消吸取' : '吸取图片'}
              >
                <EyedropperIcon size={25} />
              </button>
            )}
            {viewMode === 'single' && (
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  openFullscreenImage(node.id, images[currentIndex], currentIndex);
                }}
                className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
                title="放大查看"
              >
                <MaximizeIcon size={50} />
              </button>
            )}
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onCopyToImage(node.id, { primaryOnly: true });
              }}
              className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
              title="复制图片 (C)"
            >
              <CopyIcon size={25} />
            </button>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onUpdateNode(node.id, { viewMode: viewMode === 'grid' ? 'single' : 'grid' });
              }}
              className="p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm"
              title="切换视图"
            >
              {viewMode === 'grid' ? <SingleIcon size={25} /> : <GridIcon size={25} />}
            </button>
            {hasDisplayableImages && (
              <div className="relative">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const slotAssetId = imageAssetIds?.[currentIndex];
                    const imgData = images[currentIndex];
                    if (!hasCanvasImagePayload(imgData, slotAssetId)) return;
                    void resolveCanvasImageSource(imgData, slotAssetId).then((src) => {
                      if (src) onDownloadImage(src);
                    });
                  }}
                  className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg text-white backdrop-blur-sm shadow-lg flex items-center justify-center"
                  title="下载图片"
                  style={{ minWidth: '48px', minHeight: '48px' }}
                >
                  <DownloadIcon size={30} />
                </button>
              </div>
            )}
          </div>

          {viewMode === 'grid' ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1 overflow-y-auto p-1 content-start">
              {images.map((img, idx) => {
                const slotAssetId = imageAssetIds?.[idx];
                if (!hasCanvasImagePayload(img, slotAssetId)) return null;
                return (
                  <div key={idx} className="relative w-full group/item" style={{ aspectRatio: '1' }}>
                    <ResponsiveImagePreview
                      key={`thumb-${thumbResolutionPct}-${node._thumbTick ?? 0}-${idx}`}
                      base64={img}
                      assetId={slotAssetId}
                      quality={0.58}
                      fill="contain"
                      className="bg-[#3A3A3A] rounded transition-opacity"
                      isInViewport={nodeInViewport}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (eyedropperTargetNodeId) {
                          onCanvasEyedropper(node.id, eyedropperTargetNodeIdRef.current!);
                        } else {
                          onUpdateNode(node.id, { viewMode: 'single', currentImageIndex: idx });
                        }
                      }}
                      draggable={false}
                      alt={`Generated ${idx}`}
                    />
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        openFullscreenImage(node.id, img, idx);
                      }}
                      className="absolute inset-0 m-auto w-8 h-8 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover/item:opacity-100 transition-opacity"
                      title="放大查看"
                    >
                      <MaximizeIcon size={50} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center group/single">
              <ResponsiveImagePreview
                key={`thumb-${thumbResolutionPct}-${node._thumbTick ?? 0}-single`}
                base64={images[currentIndex]}
                assetId={imageAssetIds?.[currentIndex]}
                quality={0.6}
                fill="contain"
                className={eyedropperTargetNodeId ? 'cursor-cyan-400' : ''}
                isInViewport={nodeInViewport}
                onClick={(e) => {
                  e.stopPropagation();
                  if (eyedropperTargetNodeId) {
                    onCanvasEyedropper(node.id, eyedropperTargetNodeIdRef.current!);
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!eyedropperTargetNodeId) {
                    openFullscreenImage(node.id, images[currentIndex], currentIndex);
                  }
                }}
                draggable={false}
                alt="Generated"
              />

              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  openFullscreenImage(node.id, images[currentIndex], currentIndex);
                }}
                className="absolute inset-0 m-auto w-10 h-10 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover/single:opacity-100 transition-opacity"
                title="放大查看"
              >
                <MaximizeIcon size={50} />
              </button>

              {images.length > 1 && (
                <>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onUpdateNode(node.id, { currentImageIndex: Math.max(0, currentIndex - 1) });
                    }}
                    disabled={currentIndex === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                  >
                    <ChevronLeftIcon size={75} />
                  </button>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onUpdateNode(node.id, {
                        currentImageIndex: Math.min(images.length - 1, currentIndex + 1),
                      });
                    }}
                    disabled={currentIndex === images.length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                  >
                    <ChevronRightIcon size={75} />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/60 rounded-full text-[10px] text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    {currentIndex + 1} / {images.length}
                  </div>
                </>
              )}

              {(node.textOverlays || []).map((overlay) => (
                <div
                  key={overlay.id}
                  className="absolute group/overlay"
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: overlay.fontSize || 16,
                    color: overlay.color || '#ffffff',
                    backgroundColor: overlay.backgroundColor || 'rgba(0,0,0,0.5)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'move',
                    whiteSpace: 'nowrap',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {overlay.text}
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const newOverlays = (node.textOverlays || []).filter((o) => o.id !== overlay.id);
                      onUpdateNode(node.id, { textOverlays: newOverlays });
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover/overlay:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}

              {hasDisplayableImages && (
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const text = prompt('输入要添加的文字:');
                    if (text) {
                      const newOverlay = {
                        id: `text-overlay-${Date.now()}`,
                        text,
                        x: 50,
                        y: 50,
                        fontSize: 24,
                        color: '#ffffff',
                        backgroundColor: 'rgba(0,0,0,0.7)',
                      };
                      onUpdateNode(node.id, {
                        textOverlays: [...(node.textOverlays || []), newOverlay],
                      });
                    }
                  }}
                  className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm opacity-0 group-hover/single:opacity-100 transition-opacity"
                  title="添加文字"
                >
                  <TextIcon size={14} />
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
          {eyedropperTargetNodeId && eyedropperTargetNodeId !== node.id ? (
            <div
              className="absolute inset-0 z-[1] cursor-crosshair bg-transparent"
              title="点击连接上游节点"
              onPointerDown={(e) => {
                e.stopPropagation();
                const t = eyedropperTargetNodeIdRef.current;
                if (t) onCanvasEyedropper(node.id, t);
              }}
            />
          ) : null}
          {node.isGenerating ? (
            <div className="relative z-[2] flex flex-col items-center gap-1.5 text-gray-400">
              <div className="absolute inset-0 noise-overlay pointer-events-none" />
              <LoaderIcon size={24} />
              {generationStartedAt != null ? (
                <GenerationTimer
                  startedAt={generationStartedAt}
                  prefix="已用时"
                  className="text-xs tabular-nums tracking-tight"
                  showSeconds
                  secondsClassName="text-[10px] text-gray-500"
                />
              ) : null}
            </div>
          ) : isImageNode ? (
            <div className="relative z-[2] flex flex-col items-center gap-2">
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onImportImage(node.id);
                }}
                className="w-16 h-16 rounded-full bg-[#333] hover:bg-blue-600 flex items-center justify-center text-white transition-colors shadow-lg"
                title="从本地读取图片"
              >
                <PlusIcon size={32} />
              </button>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setEyedropperTargetNodeId(node.id);
                }}
                className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 ${
                  eyedropperTargetNodeId === node.id
                    ? 'bg-cyan-600 text-white'
                    : 'bg-[#333] hover:bg-[#444] text-gray-300'
                }`}
                title={
                  eyedropperTargetNodeId === node.id
                    ? '取消吸取（快捷键 X）'
                    : '吸取画布内图片（快捷键 X）'
                }
              >
                <EyedropperIcon size={10} /> 吸管
              </button>
            </div>
          ) : (
            <span className="relative z-[2]" />
          )}
        </div>
      )}
    </div>
  );
}
