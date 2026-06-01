import React, { lazy, Suspense, memo } from 'react';
import type { AuditImage } from '../types';
import { useCanvasStore } from '../stores/canvasStore';
import { HeavyNodeFallback } from './HeavyNodeFallback';

const AuditModeCanvas = lazy(() => import('../AuditModeCanvas'));

type AuditModeCanvasHostProps = {
  auditImages: AuditImage[];
  setAuditImages: React.Dispatch<React.SetStateAction<AuditImage[]>>;
  setTransform: ReturnType<typeof useCanvasStore.getState>['setTransform'];
  onWheel: (e: React.WheelEvent) => void;
  sharedClipboardImageRef: React.MutableRefObject<AuditImage | null>;
  saveCurrentProject: () => void | Promise<void>;
};

/** 看图模式：内部订阅 transform，避免 App 因画布平移重渲染 */
export const AuditModeCanvasHost = memo(function AuditModeCanvasHost(props: AuditModeCanvasHostProps) {
  const transform = useCanvasStore((s) => s.transform);
  return (
    <Suspense fallback={<HeavyNodeFallback label="加载看图模式…" />}>
      <AuditModeCanvas {...props} transform={transform} />
    </Suspense>
  );
});
