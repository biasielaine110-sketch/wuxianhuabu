import { useState, useCallback, useEffect, type RefObject } from 'react';
import type { CanvasNode } from '../types';
import { resolveCanvasImageSource } from '../services/canvasAssetResolver';

export function useCanvasFullscreenImage(nodesRef: RefObject<CanvasNode[]>) {
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenNodeId, setFullscreenNodeId] = useState<string | null>(null);
  const [fullscreenImageIdx, setFullscreenImageIdx] = useState(0);
  const [fsTransform, setFsTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [fsContextMenu, setFsContextMenu] = useState<{ x: number; y: number } | null>(null);

  const closeFullscreen = useCallback(() => {
    setFullscreenImage(null);
    setFsContextMenu(null);
  }, []);

  const openFullscreenImage = useCallback((nodeId: string, img: string, idx: number) => {
    const node = nodesRef.current?.find((n) => n.id === nodeId);
    const assetId = node?.imageAssetIds?.[idx];
    void resolveCanvasImageSource(img, assetId).then((src) => {
      if (!src) return;
      setFullscreenNodeId(nodeId);
      setFullscreenImage(src);
      setFullscreenImageIdx(idx);
      setFsTransform({ scale: 1, x: 0, y: 0 });
    });
  }, [nodesRef]);

  const openFullscreenFromBase64 = useCallback((base64: string) => {
    void resolveCanvasImageSource(base64, undefined).then((src) => {
      if (!src) return;
      setFullscreenNodeId(null);
      setFullscreenImage(src);
      setFullscreenImageIdx(0);
      setFsTransform({ scale: 1, x: 0, y: 0 });
    });
  }, []);

  const fsNavigate = useCallback(
    (dir: 1 | -1) => {
      const node = nodesRef.current?.find((n) => n.id === fullscreenNodeId);
      if (!node?.images?.length) return;
      const nextIdx = fullscreenImageIdx + dir;
      if (nextIdx < 0 || nextIdx >= node.images.length) return;
      const nextImg = node.images[nextIdx];
      const nextAssetId = node.imageAssetIds?.[nextIdx];
      void resolveCanvasImageSource(nextImg, nextAssetId).then((src) => {
        if (!src) return;
        setFullscreenImageIdx(nextIdx);
        setFullscreenImage(src);
        setFsTransform({ scale: 1, x: 0, y: 0 });
      });
    },
    [nodesRef, fullscreenNodeId, fullscreenImageIdx]
  );

  useEffect(() => {
    if (fullscreenImage) {
      setFsTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [fullscreenImage]);

  const handleFsWheel = useCallback((e: React.WheelEvent) => {
    if (e.cancelable) e.preventDefault();
    const zoomSensitivity = 0.002;
    const delta = -e.deltaY * zoomSensitivity;
    setFsTransform((prev) => {
      const newScale = Math.min(Math.max(0.05, prev.scale * (1 + delta)), 10);
      return { ...prev, scale: newScale };
    });
  }, []);

  const handleFsPointerDown = useCallback(
    (e: React.PointerEvent, activePointerTypeRef: React.MutableRefObject<string | null>, lastFsMousePosRef: React.MutableRefObject<{ x: number; y: number }>) => {
      activePointerTypeRef.current = 'fullscreen';
      lastFsMousePosRef.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  const imageTotal =
    fullscreenNodeId != null
      ? nodesRef.current?.find((n) => n.id === fullscreenNodeId)?.images?.length ?? 0
      : 0;

  return {
    fullscreenImage,
    setFullscreenImage,
    fullscreenNodeId,
    fullscreenImageIdx,
    fsTransform,
    setFsTransform,
    fsContextMenu,
    setFsContextMenu,
    openFullscreenImage,
    openFullscreenFromBase64,
    fsNavigate,
    closeFullscreen,
    handleFsWheel,
    handleFsPointerDown,
    imageTotal,
  };
}
