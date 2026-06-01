import { useEffect, useRef, useState, useCallback, type MutableRefObject, type ReactNode } from 'react';
import type { CanvasNode } from '../types';
import type { CanvasNodeRenderState } from './canvasNodeRenderState';

/** 动态加载 renderCanvasNode，避免节点渲染逻辑与重型子模块打入 canvas-app 首包 */
export function useLazyRenderCanvasNode(stateRef: MutableRefObject<CanvasNodeRenderState>) {
  const renderFnRef = useRef<(node: CanvasNode) => ReactNode>(() => null);
  const [, setReady] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void import('./renderCanvasNode').then((mod) => {
      if (cancelled) return;
      renderFnRef.current = (node: CanvasNode) => mod.renderCanvasNode(node, stateRef.current);
      setReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [stateRef]);

  return useCallback((node: CanvasNode) => renderFnRef.current(node), []);
}
