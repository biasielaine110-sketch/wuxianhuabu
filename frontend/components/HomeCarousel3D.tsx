import React, { memo, useRef, useState } from 'react';

type HomeCarousel3DProps = {
  images: string[];
  onImagesChange: (images: string[]) => void;
};

export const HomeCarousel3D = memo(function HomeCarousel3D({ images, onImagesChange }: HomeCarousel3DProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const commitEdit = () => {
    if (editingIdx === null) return;
    const v = editInputRef.current?.value.trim();
    if (v) {
      const next = [...images];
      next[editingIdx] = v;
      onImagesChange(next);
    }
    setEditingIdx(null);
  };

  return (
    <>
      <div className="flex items-center justify-center gap-3 -mt-[70px]" style={{ perspective: '1000px' }}>
        {images.map((src, i) => {
          const isCenter = i === 1;
          const isLeft = i === 0;
          const isRight = i === 2;
          return (
            <div
              key={i}
              className="group relative shrink-0 rounded-xl border border-[#484848] overflow-hidden transition-all duration-500"
              style={{
                width: isCenter ? '340px' : '220px',
                height: isCenter ? '210px' : '140px',
                transform: isLeft
                  ? 'rotateY(25deg) translateZ(-30px)'
                  : isRight
                    ? 'rotateY(-25deg) translateZ(-30px)'
                    : 'translateZ(0)',
                opacity: isCenter ? 1 : 0.6,
                zIndex: isCenter ? 2 : 1,
                filter: isCenter ? 'none' : 'brightness(0.5)',
                boxShadow: isCenter ? '0 0 40px rgba(144,64,240,0.15)' : 'none',
              }}
            >
              <img src={src} alt="" className="w-full h-full object-cover" draggable={false} loading="lazy" />
              <button
                onClick={() => setEditingIdx(i)}
                className="absolute top-2 right-2 w-6 h-6 rounded-md bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title="修改图片URL"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      {editingIdx !== null && (
        <div
          className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center"
          onClick={() => setEditingIdx(null)}
        >
          <div
            className="bg-[#2C2C2C] border border-[#202020] rounded-2xl p-6 w-[480px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white mb-3">修改图片 {editingIdx + 1} 的 URL</p>
            <input
              ref={editInputRef}
              autoFocus
              className="w-full bg-[#3A3A3A] border border-[#4A4A4A] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#9040F0]/30 mb-3"
              defaultValue={images[editingIdx]}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingIdx(null)}
                className="px-4 py-2 rounded-xl text-sm text-[#F5F5F5] hover:text-white"
              >
                取消
              </button>
              <button
                onClick={commitEdit}
                className="px-4 py-2 rounded-xl bg-[#9040F0] text-white text-sm font-medium"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
