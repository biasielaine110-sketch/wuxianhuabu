import type { CanvasNode, Edge } from '../types';

export const HISTORY_DEBOUNCE_STRUCTURAL_MS = 400;
export const HISTORY_DEBOUNCE_PROMPT_MS = 1200;

/** 不含 prompt 与 selectedIds，用于区分结构变更 vs 纯文本编辑 */
export function buildStructuralHistoryKey(
  nodes: CanvasNode[],
  layoutKey: string,
  edgesKey: string
): string {
  const meta = nodes
    .map(
      (n) =>
        `${n.id}:${n.type}:${n.images?.length ?? 0}:${n.videos?.length ?? 0}:${n.model ?? ''}:${n.aspectRatio ?? ''}:${n.isGenerating ? 1 : 0}`
    )
    .join(';');
  return `${layoutKey}|${edgesKey}|${meta}`;
}

export function buildPromptHistoryKey(nodes: CanvasNode[]): string {
  return nodes.map((n) => `${n.id}:${n.prompt ?? ''}`).join('\n');
}

export function buildImmediateHistorySnapshot(
  nodes: CanvasNode[],
  edges: Edge[],
  selectedIds: string[]
) {
  return { nodes, edges, selectedIds };
}
