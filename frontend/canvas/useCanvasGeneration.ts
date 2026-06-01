import { useRef, useMemo } from 'react';
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
