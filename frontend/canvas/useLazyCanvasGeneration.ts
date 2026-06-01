import { useEffect, useRef, useState, useCallback } from 'react';
import type { UseCanvasGenerationOptions, CanvasGenerationApi } from './canvasGenerationApi';

export type { UseCanvasGenerationOptions } from './canvasGenerationApi';

const noopAsync = async () => {};

/** 进入画布后动态加载生成模块，避免 gemini/jimeng 相关逻辑打入 canvas-app 首包 */
export function useLazyCanvasGeneration(deps: UseCanvasGenerationOptions) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const generationAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationStartedAtRef = useRef<Map<string, number>>(new Map());
  const apiRef = useRef<CanvasGenerationApi | null>(null);
  const [, setReady] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void import('./canvasGenerationApi').then((mod) => {
      if (cancelled) return;
      apiRef.current = mod.createCanvasGenerationApi(
        () => depsRef.current,
        generationAbortControllersRef,
        generationStartedAtRef,
      );
      setReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const call =
    <K extends keyof CanvasGenerationApi>(key: K) =>
    (...args: Parameters<CanvasGenerationApi[K]>) => {
      const fn = apiRef.current?.[key];
      if (typeof fn === 'function') {
        return (fn as (...a: Parameters<CanvasGenerationApi[K]>) => ReturnType<CanvasGenerationApi[K]>)(...args);
      }
      if (key === 'handleCancelGeneration') {
        const nodeId = args[0] as string;
        generationAbortControllersRef.current.get(nodeId)?.abort();
        generationAbortControllersRef.current.delete(nodeId);
        generationStartedAtRef.current.delete(nodeId);
        depsRef.current.setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n)),
        );
        return undefined as ReturnType<CanvasGenerationApi[K]>;
      }
      return noopAsync() as ReturnType<CanvasGenerationApi[K]>;
    };

  const handleGenerate = useCallback(call('handleGenerate'), []);
  const handleGenerateVideo = useCallback(call('handleGenerateVideo'), []);
  const handleSendMessage = useCallback(call('handleSendMessage'), []);
  const handleOptimizePrompt = useCallback(call('handleOptimizePrompt'), []);
  const handleCancelGeneration = useCallback(call('handleCancelGeneration'), []);

  return {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
    generationAbortControllersRef,
    generationStartedAtRef,
  };
}
