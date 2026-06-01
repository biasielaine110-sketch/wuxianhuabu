"""Split useCanvasGeneration into canvasGenerationApi + lazy wrapper."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend" / "canvas"
src = (root / "useCanvasGeneration.ts").read_text(encoding="utf-8")

api = src.replace(
    "import { useRef, useCallback, type RefObject, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';",
    "import type { RefObject, MutableRefObject, Dispatch, SetStateAction } from 'react';",
)
api = api.replace(
    """export function useCanvasGeneration({
  setNodes,
  nodesRef,
  edgesRef,
  promptPresets,
  ensureJimengReady,
  openLoginRef,
  handleUpdateNode,
  appendNodesWithUndo,
  setEditingTextNodeIds,
}: UseCanvasGenerationOptions) {
  const generationAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationStartedAtRef = useRef<Map<string, number>>(new Map());

  const handleCancelGeneration = useCallback((nodeId: string) => {
    generationAbortControllersRef.current.get(nodeId)?.abort();
    generationAbortControllersRef.current.delete(nodeId);
    generationStartedAtRef.current.delete(nodeId);
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
    );
  }, [setNodes]);""",
    """export type CanvasGenerationApi = {
  handleGenerate: (nodeId: string) => Promise<void>;
  handleGenerateVideo: (nodeId: string) => Promise<void>;
  handleSendMessage: (nodeId: string, opts?: { baseMessages?: import('../types').ChatMessage[]; promptText?: string }) => Promise<void>;
  handleOptimizePrompt: (nodeId: string, text: string) => Promise<void>;
  handleCancelGeneration: (nodeId: string) => void;
};

export function createCanvasGenerationApi(
  getDeps: () => UseCanvasGenerationOptions,
  generationAbortControllersRef: MutableRefObject<Map<string, AbortController>>,
  generationStartedAtRef: MutableRefObject<Map<string, number>>,
): CanvasGenerationApi {
  const handleCancelGeneration = (nodeId: string) => {
    const { setNodes } = getDeps();
    generationAbortControllersRef.current.get(nodeId)?.abort();
    generationAbortControllersRef.current.delete(nodeId);
    generationStartedAtRef.current.delete(nodeId);
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
    );
  };""",
)

handlers = [
    "const handleGenerate = async (nodeId: string) => {",
    "const handleSendMessage = async (",
    "const handleOptimizePrompt = async (nodeId: string, text: string) => {",
    "const handleGenerateVideo = async (nodeId: string) => {",
]
inject = """    const {
      setNodes,
      nodesRef,
      edgesRef,
      promptPresets,
      ensureJimengReady,
      openLoginRef,
      handleUpdateNode,
      appendNodesWithUndo,
      setEditingTextNodeIds,
    } = getDeps();
"""
for h in handlers:
    api = api.replace(h + "\n", h + "\n" + inject, 1)

api = api.replace(
    """  return {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
    generationAbortControllersRef,
    generationStartedAtRef,
  };
}""",
    """  return {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
  };
}""",
)

(root / "canvasGenerationApi.ts").write_text(api, encoding="utf-8")

hook = '''import { useRef, useMemo } from 'react';
import {
  createCanvasGenerationApi,
  type UseCanvasGenerationOptions,
} from './canvasGenerationApi';

export type { UseCanvasGenerationOptions, CanvasGenerationApi } from './canvasGenerationApi';

export function useCanvasGeneration(deps: UseCanvasGenerationOptions) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const generationAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationStartedAtRef = useRef<Map<string, number>>(new Map());

  const api = useMemo(
    () =>
      createCanvasGenerationApi(
        () => depsRef.current,
        generationAbortControllersRef,
        generationStartedAtRef,
      ),
    [],
  );

  return {
    ...api,
    generationAbortControllersRef,
    generationStartedAtRef,
  };
}
'''
(root / "useCanvasGeneration.ts").write_text(hook, encoding="utf-8")

lazy = '''import { useEffect, useRef, useState, useCallback } from 'react';
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
'''
(root / "useLazyCanvasGeneration.ts").write_text(lazy, encoding="utf-8")
print("done")
