import type { CanvasNode, Edge } from '../types';

export type EdgeBridge = { x: number; y: number; id: string };

type LineSeg = { id: string; x1: number; y1: number; x2: number; y2: number };

function buildLineSegs(edges: Edge[], nodeMap: Map<string, CanvasNode>): LineSeg[] {
  const segs: LineSeg[] = [];
  for (const edge of edges) {
    const s = nodeMap.get(edge.sourceId);
    const t = nodeMap.get(edge.targetId);
    if (!s || !t) continue;
    segs.push({
      id: edge.id,
      x1: s.x + s.width,
      y1: s.y + s.height / 2,
      x2: t.x,
      y2: t.y + t.height / 2,
    });
  }
  return segs;
}

/** 检测连线交叉点；边数 > 40 时跳过以节省计算 */
export function computeEdgeBridges(edges: Edge[], nodeMap: Map<string, CanvasNode>): EdgeBridge[] {
  if (edges.length > 40) return [];

  const lineSegs = buildLineSegs(edges, nodeMap);
  const bridges: EdgeBridge[] = [];

  for (let i = 0; i < lineSegs.length; i++) {
    for (let j = i + 1; j < lineSegs.length; j++) {
      const a = lineSegs[i];
      const b = lineSegs[j];
      const d = (b.y2 - b.y1) * (a.x2 - a.x1) - (b.x2 - b.x1) * (a.y2 - a.y1);
      if (Math.abs(d) < 0.001) continue;
      const t1 = ((b.x2 - b.x1) * (a.y1 - b.y1) - (b.y2 - b.y1) * (a.x1 - b.x1)) / d;
      const t2 = ((a.x2 - a.x1) * (a.y1 - b.y1) - (a.y2 - a.y1) * (a.x1 - b.x1)) / d;
      if (t1 > 0.05 && t1 < 0.95 && t2 > 0.05 && t2 < 0.95) {
        bridges.push({
          x: a.x1 + t1 * (a.x2 - a.x1),
          y: a.y1 + t1 * (a.y2 - a.y1),
          id: `bridge-${a.id}-${b.id}`,
        });
      }
    }
  }
  return bridges;
}

export function nodeLayoutKey(nodes: CanvasNode[]): string {
  return nodes.map((n) => `${n.id}:${n.x}:${n.y}:${n.width}:${n.height}`).join('\n');
}
