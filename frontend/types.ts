export type NodeType = 'text' | 'image' | 't2i' | 'i2i' | 'panorama' | 'annotation' | 'gridSplit' | 'gridMerge' | 'panoramaT2i' | 'director3d' | 'chat' | 'video' | 'audio';

// 3D导演台节点
export interface Director3DNode extends CanvasNode {
  type: 'director3d';
  backgroundImage?: string; // 背景全景图 base64
  backgroundImageAssetId?: string;
  yaw?: number; // 水平视角 (-180 to 180)
  pitch?: number; // 垂直视角 (-90 to 90)
  fov?: number; // 视野角度
  /** 相机距目标点的距离（与 3D 棚机位一致） */
  cameraDistance?: number;
  /** 相机注视目标点（场景坐标） */
  cameraTarget?: { x: number; y: number; z: number };
  /** 全景环境墙的世界坐标位移（用户可拖动） */
  environmentOffset?: { x: number; y: number; z: number };
  figures?: Figure3D[]; // 3D小人列表
  selectedFigureId?: string; // 当前选中的小人ID
  /** 保存的机位预设（特写/近景/中景/全景/远景/自定义） */
  cameras?: CameraPreset[];
  /** 当前选中的机位预设 id（用于高亮） */
  activeCameraId?: string | null;
  /** 构图辅助线叠加：三分法 / 安全区 / 视线 / 轴线 */
  compositionGuides?: CompositionGuides;
  /** AI 渲染提示词模板，生成图片时拼到 prompt 头部 */
  renderPromptTemplate?: string;
  /**
   * 全景环境类型：决定背景几何体形状
   * - sphere: 720° 球形穹顶（默认）
   * - photoWall: 照片墙（前方一面 360° 弧形墙）
   * - sevenWall: 2 面墙（7 字型）
   * - threeWall: 3 面墙（U 字型）
   * - fourWall: 4 面墙（O 字型）
   * - circleWall: 圆圈墙
   */
  environmentType?: EnvironmentType;
}

/** 3D 棚机位预设 */
export interface CameraPreset {
  id: string;
  name: string; // 自定义名，默认"特写/近景/中景/全景/远景"
  kind?: 'closeup' | 'close' | 'medium' | 'full' | 'long' | 'custom';
  yaw: number;
  pitch: number;
  fov: number;
  cameraDistance: number;
  cameraTarget: { x: number; y: number; z: number };
  createdAt: number;
}

/** 构图辅助线开关 */
export interface CompositionGuides {
  /** 三分法 */
  ruleOfThirds?: boolean;
  /** 安全区（5% 内缩进） */
  safeArea?: boolean;
  /**
   * 视线：开启后，从"当前选中角色"的眼睛位置朝"看向的目标点"
   * （默认：相机注视点 cameraTarget，可由其他角色方向推断）画一条线。
   * 仅在已选中角色时生效。
   */
  sightLine?: boolean;
  /**
   * 轴线：开启后，当至少选中两个角色时，画一条穿过两角色头顶的 180° 轴线
   * （与两人连线平行）；用于约束"对话/对视"机位不跨轴。仅在 ≥2 角色时生效。
   */
  axisLine?: boolean;
}

export interface Figure3D {
  id: string;
  name: string;
  image: string; // 小人图片 / GLB 模型 base64
  x: number; // 在场景中的X位置 (网格百分比，允许为负或 >100 以脱出网格)
  y: number; // 在场景中的Y位置 (网格百分比，允许为负或 >100 以脱出网格)
  /** 3D 高度（世界坐标 y 轴）。默认 0 = 站在地面，可拖到负值以"埋到地底" */
  y3d?: number;
  scale: number; // 缩放比例
  rotation: number; // 旋转角度
  /** 人物预设 id（与 PERSON_PRESETS 中某项对应），用于选择人物造型 */
  presetId?: string;
  /** 姿势 id（与 FIGURE_POSES 中某项对应），用于切换 pose */
  poseId?: string;
  /**
   * 模型来源：
   *   - 'preset'（默认）：用 PERSON_PRESETS + FIGURE_POSES 几何构造的人偶
   *   - 'glb'：用户上传的 .glb/.gltf 模型（存到 image 字段）
   */
  modelType?: 'preset' | 'glb';
}

/** 人物造型预设：head/torso/limbs/hair 配色 + 体型 + 风格 */
export interface FigurePreset {
  id: string;
  name: string;
  /** 风格标签 */
  style: 'realistic' | 'cartoon' | 'stylized';
  /** 体型 */
  bodyType: 'slim' | 'standard' | 'chubby' | 'child';
  /** 头部色（肤色） */
  skinColor: string;
  /** 上衣色 */
  topColor: string;
  /** 裤子色 */
  bottomColor: string;
  /** 头发色 */
  hairColor: string;
  /** 鞋子色 */
  shoeColor: string;
}

/** 人物姿势预设：身体各部位的相对旋转/位移（与基础站姿相叠加） */
export interface FigurePose {
  id: string;
  name: string;
  /** 描述文本，会写入 prompt */
  description: string;
  /** 各部位姿态：head/leftArm/rightArm/leftLeg/rightLeg 的旋转/位移 */
  parts: {
    head?: { rx?: number; ry?: number; rz?: number };
    leftArm?: { rx?: number; ry?: number; rz?: number };
    rightArm?: { rx?: number; ry?: number; rz?: number };
    leftLeg?: { rx?: number; ry?: number; rz?: number };
    rightLeg?: { rx?: number; ry?: number; rz?: number };
  };
}

/** 全景环境类型 */
export type EnvironmentType =
  | 'sphere'
  | 'photoWall'
  | 'sevenWall'
  | 'threeWall'
  | 'fourWall'
  | 'circleWall';

// 360° 全景图节点
export interface PanoramaNode extends CanvasNode {
  type: 'panorama';
  panoramaImage?: string; // 全景图 base64
  panoramaImageAssetId?: string;
  yaw?: number; // 水平视角 (-180 to 180)
  pitch?: number; // 垂直视角 (-90 to 90)
  fov?: number; // 视野角度
  envMode?: 'day' | 'night';
  /** 是否左右翻转画面（水平镜像） */
  flipped?: boolean;
}

// 图片标注节点
export interface AnnotationNode extends CanvasNode {
  type: 'annotation';
  sourceImage?: string; // 源图片 base64
  sourceImageAssetId?: string;
  annotations?: Annotation[];
  isEditing?: boolean;
  selectedAnnotationId?: string;
  /** 导出缩放比例（100/70/50），脱离视野/失焦后保留 */
  exportScale?: number;
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
  /** 与 images[] 对齐；offload 后 images[i] 可为空，显示时从 IDB 读取 */
  imageAssetIds?: string[];
  isGenerating?: boolean;
  error?: string;
  aspectRatio?: string; // e.g., '1:1', '16:9', 'original'（图生图：按第一张参考图画幅）
  resolution?: string; // '1k', '2k', '4k'
  quality?: string; // 'low', 'medium', 'high', 'auto' — GPT Image 2 等模型画质
  imageCount?: number; // 1, 2, or 4
  model?: string; // t2i/i2i：含 gemini-3.1-flash-image-preview（ToAPIs 异步）等
  viewMode?: 'single' | 'grid'; // Display mode for multiple images
  currentImageIndex?: number; // For pagination in single view
  textOverlays?: TextOverlay[]; // 图片上的文字覆盖
  activePresets?: string[]; // 当前激活的预设名称列表（用于多选预设）
  chatInputHeight?: number; // 对话节点输入框高度
  panoramaPromptHeight?: number; // 全景图生成节点提示词高度
  /** 视频生成节点：成品 mp4 等 URL（ToAPIs 返回，24h 内有效） */
  videos?: string[];
  currentVideoIndex?: number;
  /** 视频时长（秒）：grok-video-3 为 5–30 档；sora-2-vvip 仅 4 / 8 / 12；veo3.1-fast 在 ToAPIs 文档为固定 8 秒 */
  videoDuration?: number;
  videoResolution?: '480p' | '720p' | '1080p' | '4k';
  /** 语音参考：音频 base64 数据 */
  audio?: string;
  /** 语音参考：音频 URL（上传后获得） */
  audioUrl?: string;
  /** 语音参考：音频时长（秒） */
  audioDuration?: number;
  /** 即梦视频模式: 'image2video'(图生视频), 'frames2video'(首尾帧), 'multiframe2video'(智能多帧), 'multimodal2video'(全能参考) */
  videoMode?: 'image2video' | 'frames2video' | 'multiframe2video' | 'multimodal2video';
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

export type CanvasMode = 'canvas' | 'audit';

export interface AuditImage {
  id: string;
  base64: string;
  x: number;    // 画布坐标
  y: number;    // 画布坐标
  width: number;  // 原始宽度（像素）
  height: number; // 原始高度（像素）
  scale: number;   // 缩放比例（初始为 1）
  /** 置顶后始终叠放在未置顶图片之上，直至取消置顶 */
  pinned?: boolean;
}

export interface AuditModeData {
  images: AuditImage[];
}

// 宫格拆分节点
export interface GridSplitNode extends CanvasNode {
  type: 'gridSplit';
  inputImage?: string;
  inputImageAssetId?: string;
  gridCount?: 3 | 4 | 6 | 9;
  /**
   * 单格目标画幅：决定 cellWidth/cellHeight 比例。
   * - 4/9 宫（方阵）：整图比例 = 单格比例（16:9 → 16:9）
   * - 3 宫（1×3 竖向）：整图比例 = 16:3
   * - 6 宫（3×2 横排）：整图比例 = 8:3
   * 拆分时按此比例裁剪输入图到 frame，再切 cell（cell 严格按此比例）。
   */
  aspectRatio?: '16:9' | '9:16';
  outputImages?: string[];
  outputImageAssetIds?: string[];
}

// 宫格合并节点
export interface GridMergeNode extends CanvasNode {
  type: 'gridMerge';
  inputImages?: string[];
  inputImageAssetIds?: string[];
  gridCount?: 3 | 4 | 6 | 9;
  /**
   * 单格目标画幅：决定合并时每个 cell 的目标比例。
   * 输入图若与目标比例不一致，先按"中心裁剪+letterbox"统一到目标比例。
   * - 4/9 宫（方阵）：整图比例 = 单格比例
   * - 3/6 宫（非方阵）：整图比例 ≠ 单格比例
   */
  aspectRatio?: '16:9' | '9:16';
  outputImage?: string;
  outputImageAssetId?: string;
  /**
   * 合并结果导出时的缩放比例（与「图片标注节点」的 exportScale 字段语义一致）。
   * 用户可在合并后再调整此值，节点会用新比例重新缩放 outputImage 写出，
   * 无需重新执行合并。
   */
  exportScale?: number;
}

// 全景图生成节点（21:9 画幅）
export interface PanoramaT2iNode extends CanvasNode {
  type: 'panoramaT2i';
  panoramaImage?: string;
  panoramaImageAssetId?: string;
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
  /** 对话内生图模式时的图片比例 */
  imageAspectRatio?: string;
  /** 对话内生图模式时的图片分辨率 */
  imageResolution?: string;
  /** 对话内生图模式使用的图片模型 */
  imageModel?: string;
  /** 消息列表滚动位置（持久化，节点被视口卸载后再挂载可恢复） */
  chatScrollTop?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; // 可选的图片内容（单图；与 images 二选一或并存时优先 images）
  /** 多参考图（用户消息）；展示与历史回放用 */
  images?: string[];
}

// 语音/音频节点
export interface AudioNode extends CanvasNode {
  type: 'audio';
  /** 音频 base64 数据 */
  audio?: string;
  /** 音频时长（秒） */
  audioDuration?: number;
  /** 音频名称（文件名） */
  audioName?: string;
}
