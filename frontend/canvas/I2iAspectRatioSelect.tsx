import React from 'react';
import { I2I_ASPECT_RATIO_ORIGINAL } from './i2iAspectRatio';

export type I2iAspectRatioSelectProps = {
  aspectRatio?: string;
  onChange: (aspectRatio: string) => void;
};

/** 图生图节点内画幅选择（原图尺寸 / 1:1 / 16:9 / 9:16 / 21:9 / 4:3 / 3:4） */
export function I2iAspectRatioSelect({ aspectRatio, onChange }: I2iAspectRatioSelectProps) {
  const value = aspectRatio || '16:9';

  return (
    <div
      className="nodemeta-skip-scale flex items-center gap-2 px-2 py-1.5 bg-[#252525] border-b border-[#333] shrink-0"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-gray-500 whitespace-nowrap">画幅</span>
      <select
        className="bg-[#222222] border border-[#444] rounded px-2 py-0.5 text-gray-200 outline-none focus:border-blue-500 min-w-[108px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={I2I_ASPECT_RATIO_ORIGINAL}>原图尺寸</option>
        <option value="1:1">1:1</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="21:9">21:9</option>
        <option value="4:3">4:3</option>
        <option value="3:4">3:4</option>
      </select>
    </div>
  );
}
