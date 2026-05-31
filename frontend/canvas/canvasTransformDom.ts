import type { Transform } from '../types';

export type CanvasBgStyle = 'dots' | 'grid' | 'none';

/** 平移/缩放过程中直接写 DOM，避免每帧 setTransform 触发整树重渲染 */
export function applyCanvasTransformDom(
  tf: Transform,
  layerEl: HTMLElement | null,
  bgEl: HTMLElement | null,
  bgStyle: CanvasBgStyle,
): void {
  if (layerEl) {
    layerEl.style.transform = `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`;
  }
  if (bgEl) {
    if (bgStyle === 'grid') {
      const g = 32 * tf.scale;
      bgEl.style.backgroundSize = `${g}px ${g}px`;
    } else if (bgStyle === 'dots') {
      const g = 48 * tf.scale;
      bgEl.style.backgroundSize = `${g}px ${g}px`;
    }
    bgEl.style.backgroundPosition = `${tf.x}px ${tf.y}px`;
  }
}

/** 同步 canvasViewportRef，供 renderNode 离屏判断在 DOM 直写期间仍准确 */
export function patchCanvasViewportRef(
  viewportRef: { current: { x: number; y: number; width: number; height: number; scale: number } },
  tf: Transform,
): void {
  viewportRef.current.x = tf.x;
  viewportRef.current.y = tf.y;
  viewportRef.current.scale = tf.scale;
}
