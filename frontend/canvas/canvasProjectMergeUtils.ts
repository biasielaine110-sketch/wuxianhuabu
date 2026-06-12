import type { CanvasNode, Edge, Transform, AuditModeData } from '../types';
import { stripImagesFromNodes } from './canvasHistoryUtils';
import type { CanvasProject } from './projectDraftUtils';

/**
 * 旧版会在初始画布 / 清空 / 新建项目时自动放一个 320×560 空白文生图（或 id 为 t2i-initial）。
 * 从本地草稿恢复时不应再显示；右键菜单新建的文生图为 720×840，不会被误判。
 */
export function normalizeLegacyAutoEmptyT2iCanvas(
  nodes: CanvasNode[],
  edges: Edge[]
): { nodes: CanvasNode[]; edges: Edge[]; stripped: boolean } {
  if (nodes.length !== 1) return { nodes, edges, stripped: false };
  const n = nodes[0];
  if (n.type !== 't2i') return { nodes, edges, stripped: false };
  if ((n.prompt || '').trim() !== '') return { nodes, edges, stripped: false };
  if (n.images && n.images.length > 0) return { nodes, edges, stripped: false };
  const legacy =
    n.id === 't2i-initial' || ((n.width ?? 0) === 320 && (n.height ?? 0) === 560);
  if (!legacy) return { nodes, edges, stripped: false };
  return { nodes: [], edges: [], stripped: true };
}

export function normalizeProjectStripLegacyAutoT2i(p: CanvasProject): {
  project: CanvasProject;
  stripped: boolean;
} {
  const norm = normalizeLegacyAutoEmptyT2iCanvas(p.nodes || [], p.edges || []);
  if (!norm.stripped) return { project: p, stripped: false };
  return {
    project: { ...p, nodes: norm.nodes, edges: norm.edges, updatedAt: Date.now() },
    stripped: true,
  };
}

export function normalizeLibraryProjectsStripLegacyAutoT2i(projects: CanvasProject[]): {
  next: CanvasProject[];
  changed: boolean;
} {
  let changed = false;
  const next = projects.map((p) => {
    const { project, stripped } = normalizeProjectStripLegacyAutoT2i(p);
    if (stripped) changed = true;
    return project;
  });
  return { next, changed };
}

export function cloneCanvasForProject(nodes: CanvasNode[], edges: Edge[], transform: Transform) {
  let nodesClone: CanvasNode[];
  let edgesClone: Edge[];
  try {
    nodesClone = structuredClone(nodes);
    edgesClone = structuredClone(edges);
  } catch {
    nodesClone = nodes.map((n) => ({ ...n })) as CanvasNode[];
    edgesClone = edges.map((e) => ({ ...e }));
  }
  return { nodes: nodesClone, edges: edgesClone, transform: { ...transform } };
}

/** 把内存中的当前画布合并进「当前项目」对应的那条记录（仅返回新数组，不写盘） */
export function mergeCurrentCanvasIntoProjectList(
  projects: CanvasProject[],
  activeId: string | null,
  nodes: CanvasNode[],
  edges: Edge[],
  transform: Transform,
  auditModeData?: AuditModeData
): CanvasProject[] {
  if (!activeId) return projects;
  // 持久化时保留 videos[]（远程 https URL 非 base64，应原样保存以供刷新后回放）；
  // 撤销栈调用方仍按默认 strip 行为以防 OOM。
  const nodesForPersist = stripImagesFromNodes(nodes, { keepVideos: true });
  const { nodes: nc, edges: ec, transform: tc } = cloneCanvasForProject(
    nodesForPersist,
    edges,
    transform
  );
  const now = Date.now();
  const idx = projects.findIndex((p) => p.id === activeId);
  if (idx === -1) {
    return [
      {
        id: activeId,
        name: '未命名项目',
        updatedAt: now,
        nodes: nc,
        edges: ec,
        transform: tc,
        auditModeData,
      },
      ...projects,
    ];
  }
  return projects.map((p) =>
    p.id === activeId ? { ...p, nodes: nc, edges: ec, transform: tc, updatedAt: now, auditModeData } : p
  );
}
