import React, { useMemo } from 'react';
import type { CanvasNode, Edge } from '../types';
import { hasCanvasImagePayload } from '../services/canvasAssetResolver';
import { OptimizedImage } from './OptimizedImage';
import { EyedropperIcon } from './canvasIcons';

export interface I2iRefBarProps {
  nodeId: string;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onDeleteEdge: (edgeId: string) => void;
  setEyedropperTargetNodeId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function I2iRefBar({
  nodeId,
  nodes,
  edges,
  eyedropperTargetNodeId,
  onDeleteEdge,
  setEyedropperTargetNodeId,
}: I2iRefBarProps) {
  const incomingEdges = useMemo(
    () => edges.filter((e) => e.targetId === nodeId),
    [edges, nodeId]
  );
  const sourceNodes = useMemo(
    () =>
      incomingEdges
        .map((e) => nodes.find((n) => n.id === e.sourceId))
        .filter(Boolean) as CanvasNode[],
    [incomingEdges, nodes]
  );

  if (incomingEdges.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 bg-[#1e1e1e] border-b border-[#333] text-[10px] shrink-0">
      <span className="text-gray-500">参考:</span>
      <span className="text-green-400 font-medium">{incomingEdges.length}张</span>
      <div className="flex gap-0.5 ml-1 flex-wrap">
        {incomingEdges.slice(0, 12).map((edge, idx) => {
          const srcNode = sourceNodes[idx];
          const img = srcNode?.images?.[0];
          const imgAssetId = srcNode?.imageAssetIds?.[0];
          if (!hasCanvasImagePayload(img, imgAssetId)) return null;
          return (
            <div key={edge.id} className="relative group">
              <OptimizedImage
                base64={img}
                assetId={imgAssetId}
                maxSide={64}
                quality={0.72}
                alt={`R${idx + 1}`}
                className="w-9 h-9 object-cover rounded border border-[#444]"
              />
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(edge.id);
                }}
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
        {incomingEdges.length > 12 && (
          <span className="text-gray-600">+{incomingEdges.length - 12}</span>
        )}
      </div>
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          setEyedropperTargetNodeId(nodeId);
        }}
        className={`ml-auto px-1.5 py-0.5 rounded text-[10px] text-white ${eyedropperTargetNodeId === nodeId ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
        title={eyedropperTargetNodeId === nodeId ? '取消吸取' : '吸取图片'}
      >
        <EyedropperIcon size={10} />
      </button>
    </div>
  );
}
