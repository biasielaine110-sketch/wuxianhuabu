import type { NodeType } from '../types';

export const INPUT_NODE_TYPES: NodeType[] = [
  't2i',
  'i2i',
  'image',
  'panorama',
  'annotation',
  'gridSplit',
  'gridMerge',
  'panoramaT2i',
  'director3d',
  'chat',
  'video',
  'audio',
];

/** 单份画布 base64 总字符量超过此值时不再压入撤销栈（避免 structuredClone 直接 OOM） */
export const CANVAS_HISTORY_SKIP_PAYLOAD_CHARS = 22_000_000;
