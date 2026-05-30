import type { Dispatch, SetStateAction } from 'react';
import type { CanvasNode, Edge } from '../types';

export type MoveNodesCommand = {
  type: 'moveNodes';
  deltas: { id: string; fromX: number; fromY: number; toX: number; toY: number }[];
};

export type AddEdgeCommand = {
  type: 'addEdge';
  edge: Edge;
};

export type DeleteEdgeCommand = {
  type: 'deleteEdge';
  edge: Edge;
};

export type CanvasCommand = MoveNodesCommand | AddEdgeCommand | DeleteEdgeCommand;

/** 命令栈最大深度，防止连续拖拽/连线占用过多内存 */
export const CANVAS_COMMAND_STACK_MAX = 64;

export function buildMoveNodesCommand(
  fromMap: Map<string, { x: number; y: number }>,
  nodes: CanvasNode[]
): MoveNodesCommand | null {
  const deltas: MoveNodesCommand['deltas'] = [];
  for (const [id, from] of fromMap) {
    const n = nodes.find((x) => x.id === id);
    if (!n) continue;
    if (Math.round(n.x) === Math.round(from.x) && Math.round(n.y) === Math.round(from.y)) continue;
    deltas.push({ id, fromX: from.x, fromY: from.y, toX: n.x, toY: n.y });
  }
  return deltas.length ? { type: 'moveNodes', deltas } : null;
}

type SetNodes = Dispatch<SetStateAction<CanvasNode[]>>;
type SetEdges = Dispatch<SetStateAction<Edge[]>>;

/** 撤销单条命令（就地反向执行） */
export function reverseCanvasCommand(
  cmd: CanvasCommand,
  setNodes: SetNodes,
  setEdges: SetEdges
): void {
  switch (cmd.type) {
    case 'moveNodes':
      setNodes((prev) =>
        prev.map((n) => {
          const d = cmd.deltas.find((x) => x.id === n.id);
          if (!d) return n;
          return { ...n, x: d.fromX, y: d.fromY };
        })
      );
      break;
    case 'addEdge':
      setEdges((prev) => prev.filter((e) => e.id !== cmd.edge.id));
      break;
    case 'deleteEdge':
      setEdges((prev) => {
        if (prev.some((e) => e.id === cmd.edge.id)) return prev;
        return [...prev, cmd.edge];
      });
      break;
  }
}
