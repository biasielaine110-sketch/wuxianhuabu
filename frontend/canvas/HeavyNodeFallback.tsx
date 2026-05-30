import React from 'react';

type HeavyNodeFallbackProps = {
  label?: string;
};

export function HeavyNodeFallback({ label = '加载 3D 引擎…' }: HeavyNodeFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[120px] bg-[#1a1a1a] text-gray-500 gap-2">
      <div className="w-8 h-8 border-2 border-cyan-500/60 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
