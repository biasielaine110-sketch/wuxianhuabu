export const thumbnailCache = new Map<string, string>();
export const THUMB_MAX_CACHE = 60;

export function clearCanvasThumbnailCache(): void {
  thumbnailCache.clear();
}
