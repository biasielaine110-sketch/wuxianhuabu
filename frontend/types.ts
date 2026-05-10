export type NodeType = 'text' | 'image' | 't2i' | 'i2i' | 'panorama' | 'annotation' | 'gridSplit' | 'gridMerge' | 'panoramaT2i' | 'director3d' | 'chat' | 'video';

// 3D导演台节点
export interface Director3DNode extends CanvasNode {
  type: 'director3d';
  backgroundImage?: string; // 背景全景图 base64
  yaw?: number; // 水平视角 (-180 to 180)
  pitch?: number; // 垂直视角 (-90 to 90)
  fov?: number; // 视野角度
  figures?: Figure3D[]; // 3D小人列表
  selectedFigureId?: string; // 当前选中的小人ID
}

export interface Figure3D {
  id: string;
  name: string;
  image: string; // 小人图片 base64
  x: number; // 在场景中的X位置 (0-100百分比)
  y: number; // 在场景中的Y位置 (0-100百分比)
  scale: number; // 缩放比例
  rotation: number; // 旋转角度
}

// 360° 全景图节点
export interface PanoramaNode extends CanvasNode {
  type: 'panorama';
  panoramaImage?: string; // 全景图 base64
  yaw?: number; // 水平视角 (-180 to 180)
  pitch?: number; // 垂直视角 (-90 to 90)
  fov?: number; // 视野角度
  envMode?: 'day' | 'night';
}

// 图片标注节点
export interface AnnotationNode extends CanvasNode {
  type: 'annotation';
  sourceImage?: string; // 源图片 base64
  annotations?: Annotation[];
  isEditing?: boolean;
  selectedAnnotationId?: string;
}

export interface Annotation {
  id: string;
  type: 'rect' | 'circle' | 'arrow' | 'text' | 'pen' | 'fillRect' | 'fillCircle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  endX?: number;
  endY?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  points?: { x: number; y: number }[]; // 用于画笔工具
  fontSize?: number; // 用于文字标注
  /** 填充矩形 / 填充椭圆：不透明度 0–1 */
  fillOpacity?: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number; // 百分比 0-100
  y: number; // 百分比 0-100
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
}

export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string; // Text content or prompt
  images?: string[]; // Array of Base64 image data
  isGenerating?: boolean;
  error?: string;
  aspectRatio?: string; // e.g., '1:1', '16:9'
  resolution?: string; // '1k', '2k', '4k'
  imageCount?: number; // 1, 2, or 4
  model?: string; // t2i/i2i：含 gemini-3.1-flash-image-preview（ToAPIs 异步）等
  viewMode?: 'single' | 'grid'; // Display mode for multiple images
  currentImageIndex?: number; // For pagination in single view
  textOverlays?: TextOverlay[]; // 图片上的文字覆盖
  activePreset?: string; // 当前激活的预设名称（用于显示按钮样式）
  chatInputHeight?: number; // 对话节点输入框高度
  panoramaPromptHeight?: number; // 全景图生成节点提示词高度
  /** 视频生成节点：成品 mp4 等 URL（ToAPIs 返回，24h 内有效） */
  videos?: string[];
  currentVideoIndex?: number;
  /** 视频时长（秒）：grok-video-3 为 5–30 档；sora-2-vvip 仅 4 / 8 / 12；veo3.1-fast 在 ToAPIs 文档为固定 8 秒 */
  videoDuration?: number;
  videoResolution?: '480p' | '720p' | '1080p' | '4k';
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export type Tool = 'select' | 'pan' | 'boxSelect';

// 宫格拆分节点
export interface GridSplitNode extends CanvasNode {
  type: 'gridSplit';
  inputImage?: string;
  gridCount?: 4 | 6 | 9;
  outputImages?: string[];
}

// 宫格合并节点
export interface GridMergeNode extends CanvasNode {
  type: 'gridMerge';
  inputImages?: string[];
  gridCount?: 4 | 6 | 9;
  outputImage?: string;
}

// 全景图生成节点（21:9 画幅）
export interface PanoramaT2iNode extends CanvasNode {
  type: 'panoramaT2i';
  panoramaImage?: string;
  isGenerating?: boolean;
  error?: string;
  aspectRatio?: string;
  resolution?: string;
  imageCount?: number;
  model?: string;
}

// 对话节点
export interface ChatNode extends CanvasNode {
  type: 'chat';
  messages?: ChatMessage[];
  model?: string;
  isGenerating?: boolean;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; // 可选的图片内容（单图；与 images 二选一或并存时优先 images）
  /** 多参考图（用户消息）；展示与历史回放用 */
  images?: string[];
}
