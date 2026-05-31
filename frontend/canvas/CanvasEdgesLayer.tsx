import React, { memo } from 'react';
import type { CanvasNode, Edge } from '../types';
import { EdgePath } from './EdgePath';

type CanvasEdgesLayerProps = {
  edges: Edge[];
  nodeMap: Map<string, CanvasNode>;
  edgeRenderNodeIds: Set<string>;
  selectedIdSet: Set<string>;
  onDeleteEdge: (id: string) => void;
};

function CanvasEdgesLayerInner({
  edges,
  nodeMap,
  edgeRenderNodeIds,
  selectedIdSet,
  onDeleteEdge,
}: CanvasEdgesLayerProps) {
  return (
    <>
      {edges.map((edge) => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;
        if (!edgeRenderNodeIds.has(source.id) || !edgeRenderNodeIds.has(target.id)) return null;

        const startX = source.x + source.width;
        const startY = source.y + source.height / 2;
        const endX = target.x;
        const endY = target.y + target.height / 2;

        const dist = Math.abs(endX - startX);
        const controlOffset = Math.max(dist / 2, 60);

        const cp1X = startX + controlOffset;
        const cp1Y = startY;
        const cp2X = endX - controlOffset;
        const cp2Y = endY;

        const isActive = selectedIdSet.has(source.id) || selectedIdSet.has(target.id);

        return (
          <g key={edge.id} className="group/edge">
            <EdgePath
              edgeId={edge.id}
              startX={startX}
              startY={startY}
              cp1X={cp1X}
              cp1Y={cp1Y}
              cp2X={cp2X}
              cp2Y={cp2Y}
              endX={endX}
              endY={endY}
              isActive={isActive}
              onDelete={onDeleteEdge}
            />
            <g
              transform={`translate(${(startX + cp2X) / 2}, ${(startY + cp2Y) / 2})`}
              className="opacity-0 group-hover/edge:opacity-100 transition-opacity cursor-pointer"
              onClick={() => onDeleteEdge(edge.id)}
            >
              <circle r="10" fill="#ef4444" stroke="#fff" strokeWidth="1" />
              <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fff" strokeWidth="2" />
              <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fff" strokeWidth="2" />
            </g>
          </g>
        );
      })}
    </>
  );
}

export const CanvasEdgesLayer = memo(CanvasEdgesLayerInner);
