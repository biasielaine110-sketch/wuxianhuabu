import { useEffect, useRef } from 'react';
import type { CanvasKeyboardShortcutDeps } from './useCanvasKeyboardShortcuts';

/** 进入画布后动态加载快捷键模块，避免打入 canvas-app 首包 */
export function useLazyCanvasKeyboardShortcuts(deps: CanvasKeyboardShortcutDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    let detached: (() => void) | undefined;
    let cancelled = false;

    void import('./useCanvasKeyboardShortcuts').then((mod) => {
      if (cancelled) return;
      detached = mod.attachCanvasKeyboardShortcuts(() => depsRef.current);
    });

    return () => {
      cancelled = true;
      detached?.();
    };
  }, []);
}
