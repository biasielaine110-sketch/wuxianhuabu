import type {
  AnnotationNode,
  CanvasNode,
  ChatNode,
  Director3DNode,
  GridMergeNode,
  GridSplitNode,
  PanoramaNode,
  PanoramaT2iNode,
} from '../types';

/**
 * 估算节点内大块 base64 字符串体量（字符数），用于动态限制撤销深度。
 * 多步撤销 = 多份完整克隆，体量会近似「单步 × 步数」。
 */
export function estimateCanvasBase64PayloadChars(nodes: CanvasNode[]): number {
  let w = 0;
  const add = (s: string | undefined) => {
    if (typeof s === 'string') w += s.length;
  };
  for (const n of nodes) {
    if (n.images?.length) for (const im of n.images) add(im);
    add((n as PanoramaNode).panoramaImage);
    add((n as Director3DNode).backgroundImage);
    add((n as AnnotationNode).sourceImage);
    add((n as GridSplitNode).inputImage);
    const splitOuts = (n as GridSplitNode).outputImages;
    if (splitOuts) for (const im of splitOuts) add(im);
    const mergeIns = (n as GridMergeNode).inputImages;
    if (mergeIns) for (const im of mergeIns) add(im);
    add((n as GridMergeNode).outputImage);
    add((n as PanoramaT2iNode).panoramaImage);
    if (n.type === 'chat') {
      const msgs = (n as ChatNode).messages;
      if (msgs) {
        for (const m of msgs) {
          if (m.images?.length) for (const im of m.images) add(im);
          add(m.image);
        }
      }
    }
    if (n.type === 'director3d' && (n as Director3DNode).figures?.length) {
      for (const f of (n as Director3DNode).figures!) add(f.image);
    }
  }
  return w;
}

/** 根据当前画布体量返回撤销栈最大步数（每步一份完整克隆） */
export function canvasHistoryMaxSteps(payloadChars: number): number {
  if (payloadChars > 16_000_000) return 2;
  if (payloadChars > 7_000_000) return 3;
  if (payloadChars > 3_000_000) return 5;
  if (payloadChars > 1_200_000) return 7;
  return 10;
}
