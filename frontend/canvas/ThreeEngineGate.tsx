import React, { Suspense, useEffect, useState, type ReactNode } from 'react';
import { HeavyNodeFallback } from './HeavyNodeFallback';

/** 首次挂载时再加载 three 模块，避免阻塞首屏 React 渲染 */
export function ThreeEngineGate({
  children,
  label = '加载 3D 引擎…',
}: {
  children: ReactNode;
  label?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import('three').then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <HeavyNodeFallback label={label} />;
  return <Suspense fallback={<HeavyNodeFallback label={label} />}>{children}</Suspense>;
}
