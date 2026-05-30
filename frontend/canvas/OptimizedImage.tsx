import React, { useEffect, useRef, useState } from 'react';
import { THUMB_MAX_CACHE, thumbnailCache } from './thumbnailCache';

function sniffMimeFromBase64(raw: string): string {
  const cleaned = raw.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!cleaned || cleaned.length < 8) return 'image/jpeg';
  try {
    const dec = atob(cleaned.slice(0, 48));
    const a = dec.charCodeAt(0);
    const b = dec.charCodeAt(1);
    if (a === 0xff && b === 0xd8) return 'image/jpeg';
    if (a === 0x89 && b === 0x50) return 'image/png';
    if (a === 0x47 && b === 0x49) return 'image/gif';
    if (a === 0x52 && b === 0x49 && dec.startsWith('RIFF')) return 'image/webp';
  } catch {
    /* ignore */
  }
  return 'image/jpeg';
}

export function OptimizedImage({
  base64,
  assetId,
  className,
  alt,
  maxSide = 640,
  quality = 0.62,
  onClick,
  onDoubleClick,
  draggable = false,
  containerRef,
}: {
  base64?: string;
  assetId?: string;
  className?: string;
  alt?: string;
  maxSide?: number;
  quality?: number;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  draggable?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [src, setSrc] = useState('');
  const [dynamicMaxSide, setDynamicMaxSide] = useState(maxSide);
  const maxSideRef = useRef(maxSide);
  maxSideRef.current = maxSide;
  void containerRef;

  useEffect(() => {
    setDynamicMaxSide(maxSide);
  }, [maxSide]);

  useEffect(() => {
    let cancelled = false;
    const hasInline = !!base64 && base64.length > 80;
    if (!hasInline && !assetId) {
      setSrc('');
      return;
    }

    void import('../services/canvasAssetResolver').then(({ resolveCanvasImageSource }) =>
      resolveCanvasImageSource(base64, assetId).then((resolved) => {
        if (cancelled || !resolved) {
          if (!cancelled) setSrc('');
          return;
        }

        const currentMaxSide = Math.max(32, dynamicMaxSide);
        const cachedKey = `${resolved.slice(0, 48)}|${resolved.slice(-48)}|${resolved.length}|${currentMaxSide}|${quality}|${assetId ?? ''}`;
        const cached = thumbnailCache.get(cachedKey);
        if (cached) {
          setSrc(cached);
          return;
        }

        const finish = (displaySrc: string) => {
          if (!cancelled && displaySrc) setSrc(displaySrc);
        };

        const img = new Image();
        const needsCrossOrigin =
          resolved.startsWith('http://') || resolved.startsWith('https://');
        if (needsCrossOrigin) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          if (cancelled) return;
          const maxEdge = Math.max(img.width, img.height);
          if (maxEdge <= currentMaxSide) {
            thumbnailCache.set(cachedKey, resolved);
            finish(resolved);
            return;
          }
          const scale = currentMaxSide / maxEdge;
          const targetW = Math.max(1, Math.round(img.width * scale));
          const targetH = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(resolved);
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          try {
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const thumbSrc = canvas.toDataURL('image/jpeg', quality);
            thumbnailCache.set(cachedKey, thumbSrc);
            if (thumbnailCache.size > THUMB_MAX_CACHE) {
              const firstKey = thumbnailCache.keys().next().value;
              if (firstKey) thumbnailCache.delete(firstKey);
            }
            finish(thumbSrc);
          } catch {
            finish(resolved);
          }
        };

        img.onerror = () => {
          if (cancelled) return;
          // 跨域缩略图失败时，尝试 fetch 同源代理后转 blob URL
          if (needsCrossOrigin) {
            void fetch(resolved, { mode: 'cors', credentials: 'omit' })
              .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch failed'))))
              .then((blob) => {
                if (cancelled) return;
                const blobUrl = URL.createObjectURL(blob);
                finish(blobUrl);
              })
              .catch(() => finish(resolved));
            return;
          }
          // 裸 base64 再试 data URL
          if (base64 && base64.length > 80 && !base64.startsWith('http') && !base64.startsWith('data:')) {
            finish(`data:${sniffMimeFromBase64(base64)};base64,${base64.replace(/\s/g, '')}`);
            return;
          }
          finish(resolved);
        };

        img.src = resolved.startsWith('http')
          ? resolved
          : resolved.startsWith('data:') || resolved.startsWith('blob:')
            ? resolved
            : `data:${sniffMimeFromBase64(resolved)};base64,${resolved.replace(/\s/g, '')}`;
      })
    );

    return () => {
      cancelled = true;
    };
  }, [base64, assetId, dynamicMaxSide, quality]);

  if (!src) {
    return (
      <div
        className={`bg-[#2a2a2a] animate-pulse ${className ?? ''}`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      className={className}
      alt={alt}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      loading="lazy"
    />
  );
}
