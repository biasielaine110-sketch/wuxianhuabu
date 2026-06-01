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

export type DeleteNodeCommand = {
  type: 'deleteNode';
  node: CanvasNode;
  edges: Edge[];
};

export type AddNodesCommand = {
  type: 'addNodes';
  nodes: CanvasNode[];
  edges: Edge[];
  previousSelectedIds: string[];
};

export type CanvasCommand =
  | MoveNodesCommand
  | AddEdgeCommand
  | DeleteEdgeCommand
  | DeleteNodeCommand
  | AddNodesCommand;

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
type SetSelectedIds = Dispatch<SetStateAction<string[]>>;

/** 撤销单条命令（就地反向执行） */
export function reverseCanvasCommand(
  cmd: CanvasCommand,
  setNodes: SetNodes,
  setEdges: SetEdges,
  setSelectedIds?: SetSelectedIds,
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
    case 'deleteNode':
      setNodes((prev) => {
        if (prev.some((n) => n.id === cmd.node.id)) return prev;
        return [...prev, cmd.node];
      });
      setEdges((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const restored = cmd.edges.filter((e) => !existing.has(e.id));
        return restored.length ? [...prev, ...restored] : prev;
      });
      break;
    case 'addNodes': {
      const nodeIds = new Set(cmd.nodes.map((n) => n.id));
      const edgeIds = new Set(cmd.edges.map((e) => e.id));
      setNodes((prev) => prev.filter((n) => !nodeIds.has(n.id)));
      setEdges((prev) => prev.filter((e) => !edgeIds.has(e.id)));
      setSelectedIds?.(cmd.previousSelectedIds);
      break;
    }
  }
}
