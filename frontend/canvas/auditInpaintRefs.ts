import type { AuditImage } from '../types';

export const MAX_AUDIT_INPAINT_REFERENCES = 12;

export function stripAuditImageBase64(base64: string): string {
  return base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
}

/** 局部选区 crop 为第一张，其后为吸管拾取的整图参考 */
export function buildAuditInpaintGenerationImages(
  cropBase64: string,
  auditImages: AuditImage[],
  referenceImageIds: string[]
): string[] {
  const images: string[] = [stripAuditImageBase64(cropBase64)];
  const usedIds = new Set<string>();

  for (const id of referenceImageIds) {
    if (usedIds.has(id) || images.length > MAX_AUDIT_INPAINT_REFERENCES) continue;
    const img = auditImages.find((i) => i.id === id);
    if (!img?.base64) continue;
    usedIds.add(id);
    images.push(stripAuditImageBase64(img.base64));
  }

  return images.slice(0, MAX_AUDIT_INPAINT_REFERENCES + 1);
}

export function resolveAuditInpaintReferencePreviews(
  auditImages: AuditImage[],
  referenceImageIds: string[]
): { id: string; base64: string }[] {
  const out: { id: string; base64: string }[] = [];
  const seen = new Set<string>();
  for (const id of referenceImageIds) {
    if (seen.has(id)) continue;
    const img = auditImages.find((i) => i.id === id);
    if (!img?.base64) continue;
    seen.add(id);
    out.push({ id, base64: img.base64 });
    if (out.length >= MAX_AUDIT_INPAINT_REFERENCES) break;
  }
  return out;
}
