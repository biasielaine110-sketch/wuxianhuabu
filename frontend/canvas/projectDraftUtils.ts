import { sanitizeFilename } from '../services/projectPersistence';
import type { CanvasProjectSnapshot } from '../services/projectPersistence';

export type CanvasProject = CanvasProjectSnapshot;

export function projectDraftDisplayName(p: CanvasProject): string {
  const s = (p.draftTitle?.trim() || p.name?.trim() || '').trim();
  return s || '未命名草稿';
}

/** 与顶栏展示一致的实际存名字符串（无双击占位文案），用于行内重命名初始值 */
export function projectDraftEditSeed(p: CanvasProject): string {
  return (p.draftTitle?.trim() || p.name?.trim() || '').trim();
}

export function projectExportBasename(p: CanvasProject): string {
  const raw = (p.draftTitle?.trim() || p.name?.trim() || 'project').trim() || 'project';
  return sanitizeFilename(raw);
}

/** 去掉旧版「（系统选择器…」等说明尾缀，仅保留路径展示用主文案 */
export function sanitizeDraftStoragePathNote(raw: string | undefined): string {
  if (!raw?.trim()) return '';
  const s = raw.trim();
  const iFull = s.indexOf('（');
  const iHalf = s.indexOf('(');
  const candidates = [iFull, iHalf].filter((i) => i > 0);
  const cut = candidates.length ? Math.min(...candidates) : -1;
  return cut > 0 ? s.slice(0, cut).trim() : s;
}
