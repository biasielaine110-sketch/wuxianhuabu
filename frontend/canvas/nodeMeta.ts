import type { NodeType } from '../types';

export type NodeDisplayMeta = {
  title: string;
  accentClass: string;
  dotClass: string;
  borderSelected: string;
  borderDefault: string;
};

const META: Record<NodeType, { title: string; accentClass: string; dotClass: string }> = {
  text: { title: '文本节点', accentClass: 'text-gray-400', dotClass: 'bg-gray-400' },
  image: { title: '图片节点', accentClass: 'text-green-400', dotClass: 'bg-green-400' },
  t2i: { title: '文生图', accentClass: 'text-purple-400', dotClass: 'bg-purple-400' },
  i2i: { title: '图生图', accentClass: 'text-blue-400', dotClass: 'bg-blue-400' },
  panorama: { title: '360° 全景图', accentClass: 'text-cyan-400', dotClass: 'bg-cyan-400' },
  annotation: { title: '图片标注', accentClass: 'text-orange-400', dotClass: 'bg-orange-400' },
  gridSplit: { title: '宫格拆分', accentClass: 'text-teal-400', dotClass: 'bg-teal-400' },
  gridMerge: { title: '宫格合并', accentClass: 'text-teal-400', dotClass: 'bg-teal-400' },
  panoramaT2i: { title: '全景图生成', accentClass: 'text-indigo-400', dotClass: 'bg-indigo-400' },
  director3d: { title: '3D导演台', accentClass: 'text-pink-400', dotClass: 'bg-pink-400' },
  video: { title: '视频生成', accentClass: 'text-amber-400', dotClass: 'bg-amber-400' },
  audio: { title: '语音节点', accentClass: 'text-blue-400', dotClass: 'bg-blue-400' },
  chat: { title: 'AI对话', accentClass: 'text-rose-400', dotClass: 'bg-rose-400' },
};

const BORDER: Record<NodeType, { selected: string; default: string }> = {
  text: { selected: 'border-gray-400', default: 'border-[#333]' },
  image: { selected: 'border-green-500', default: 'border-[#333]' },
  t2i: { selected: 'border-purple-500', default: 'border-[#333]' },
  i2i: { selected: 'border-blue-500', default: 'border-[#333]' },
  panorama: { selected: 'border-cyan-500', default: 'border-[#333]' },
  annotation: { selected: 'border-orange-500', default: 'border-[#333]' },
  gridSplit: { selected: 'border-teal-500', default: 'border-[#333]' },
  gridMerge: { selected: 'border-teal-500', default: 'border-[#333]' },
  panoramaT2i: { selected: 'border-indigo-500', default: 'border-[#333]' },
  director3d: { selected: 'border-pink-500', default: 'border-[#333]' },
  video: { selected: 'border-amber-500', default: 'border-[#333]' },
  audio: { selected: 'border-blue-500', default: 'border-[#333]' },
  chat: { selected: 'border-rose-500', default: 'border-[#333]' },
};

export function getNodeDisplayMeta(type: NodeType, isSelected: boolean): NodeDisplayMeta {
  const base = META[type];
  const border = BORDER[type];
  return {
    title: base.title,
    accentClass: base.accentClass,
    dotClass: base.dotClass,
    borderSelected: border.selected,
    borderDefault: border.default,
  };
}

export function getNodeBorderClass(type: NodeType, isSelected: boolean): string {
  return isSelected ? BORDER[type].selected : BORDER[type].default;
}
