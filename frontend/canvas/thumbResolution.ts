/** 画布节点预览缩略图分辨率比例（相对基准长边，5–150%） */
let thumbResolutionPercent = 10;

export function getThumbResolutionPercent(): number {
  return thumbResolutionPercent;
}

export function setThumbResolutionPercent(percent: number): void {
  thumbResolutionPercent = Math.max(5, Math.min(150, percent));
}

/** 将基准 maxSide 按当前预览比例缩放，长边至少 32px */
export function scaleThumbMaxSide(baseMaxSide: number): number {
  const base = Math.max(1, baseMaxSide);
  return Math.max(32, Math.round(base * thumbResolutionPercent / 100));
}
