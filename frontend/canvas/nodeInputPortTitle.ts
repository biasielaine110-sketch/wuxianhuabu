/** 节点输入端口 hover 提示文案 */
export function getNodeInputPortTitle(type: string): string {
  switch (type) {
    case 'gridSplit':
      return '输入端口 (连接图片节点)';
    case 'gridMerge':
      return '输入端口 (连接图片节点)';
    case 'panorama':
      return '输入端口 (连接图片节点输入全景图)';
    case 'annotation':
      return '输入端口 (连接图片节点)';
    case 'panoramaT2i':
      return '输入端口 (连接图片节点)';
    case 'director3d':
      return '输入端口 (连接图片节点作为背景)';
    case 'chat':
      return '输入端口 (文本 / 图片 / 视频节点作为参考)';
    case 'video':
      return '输入端口 (文本；参考图片或视频节点)';
    default:
      return '输入端口 (连接文本或图片)';
  }
}
