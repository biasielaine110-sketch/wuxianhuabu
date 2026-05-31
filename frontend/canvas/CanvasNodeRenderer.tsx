import React, { createContext, memo, useContext } from 'react';
import type { CanvasNode } from '../types';
import type { CanvasNodeRenderStateRef } from './canvasNodeRenderState';

const CanvasNodeRenderStateContext = createContext<CanvasNodeRenderStateRef | null>(null);

export function CanvasNodeRenderStateProvider(props: {
  stateRef: CanvasNodeRenderStateRef;
  children: React.ReactNode;
}) {
  return (
    <CanvasNodeRenderStateContext.Provider value={props.stateRef}>
      {props.children}
    </CanvasNodeRenderStateContext.Provider>
  );
}

/** 供后续 renderNode 拆分：子组件从 ref 读取最新快照，避免闭包导致 memo 失效 */
export function useCanvasNodeRenderStateRef(): CanvasNodeRenderStateRef {
  const ref = useContext(CanvasNodeRenderStateContext);
  if (!ref) {
    throw new Error('useCanvasNodeRenderStateRef must be used inside CanvasNodeRenderStateProvider');
  }
  return ref;
}

type CanvasNodeRendererProps = {
  node: CanvasNode;
  render: (node: CanvasNode) => React.ReactNode;
};

/** memo 包装：render 回调稳定时单节点更新不扩散 */
export const CanvasNodeRenderer = memo(function CanvasNodeRenderer({ node, render }: CanvasNodeRendererProps) {
  return <>{render(node)}</>;
});
