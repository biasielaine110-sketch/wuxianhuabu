import { toDisplayableImageSrc } from '../services/canvasAssetResolver';

export function fullscreenImageDisplaySrc(src: string): string {
  return toDisplayableImageSrc(src);
}
