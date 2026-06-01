import type { AuditImage } from '../types';

export function partitionAuditImages(images: AuditImage[]) {
  const unpinned: AuditImage[] = [];
  const pinned: AuditImage[] = [];
  for (const img of images) {
    if (img.pinned) pinned.push(img);
    else unpinned.push(img);
  }
  return { unpinned, pinned };
}

export function appendAuditImages(
  images: AuditImage[],
  toAdd: AuditImage | AuditImage[]
): AuditImage[] {
  const additions = Array.isArray(toAdd) ? toAdd : [toAdd];
  const { unpinned, pinned } = partitionAuditImages(images);
  return [...unpinned, ...additions, ...pinned];
}

/** 将指定图片移到其所在层级（未置顶 / 已置顶）的最上层；可选标记为置顶 */
export function bringAuditImagesToFront(
  images: AuditImage[],
  ids: string[],
  opts?: { pin?: boolean }
): AuditImage[] {
  if (ids.length === 0) return images;

  const idSet = new Set(ids);
  const working = images.map((img) =>
    idSet.has(img.id) && opts?.pin ? { ...img, pinned: true } : img
  );

  const moving = ids
    .map((id) => working.find((i) => i.id === id))
    .filter((i): i is AuditImage => !!i);
  if (moving.length === 0) return working;

  const rest = working.filter((i) => !idSet.has(i.id));
  const { unpinned: unpinnedRest, pinned: pinnedRest } = partitionAuditImages(rest);

  if (opts?.pin) {
    const newlyPinned = moving.map((i) => ({ ...i, pinned: true }));
    return [...unpinnedRest, ...pinnedRest, ...newlyPinned];
  }

  const unpinnedMoving = moving.filter((i) => !i.pinned);
  const pinnedMoving = moving.filter((i) => i.pinned);
  const unpinnedRestFiltered = unpinnedRest.filter(
    (i) => !unpinnedMoving.some((m) => m.id === i.id)
  );
  const pinnedRestFiltered = pinnedRest.filter(
    (i) => !pinnedMoving.some((m) => m.id === i.id)
  );

  return [
    ...unpinnedRestFiltered,
    ...unpinnedMoving,
    ...pinnedRestFiltered,
    ...pinnedMoving,
  ];
}

/** 取消置顶，并移到未置顶层的最上层 */
export function unpinAuditImages(images: AuditImage[], ids: string[]): AuditImage[] {
  if (ids.length === 0) return images;
  const idSet = new Set(ids);
  const updated = images.map((img) =>
    idSet.has(img.id) ? { ...img, pinned: false } : img
  );
  return bringAuditImagesToFront(updated, ids);
}
