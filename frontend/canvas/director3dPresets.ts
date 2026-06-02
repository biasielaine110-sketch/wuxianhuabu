import type { FigurePose, FigurePreset, EnvironmentType } from '../types';

/**
 * 人物造型预设（参考 q.qaigc.com 的"人物预设"概念）
 * - 用纯几何 + 配色组合出可视化的"角色"
 * - 颜色组合基于 12 色基础肤色 + 24 色服饰常见组合
 */
export const PERSON_PRESETS: ReadonlyArray<FigurePreset> = [
  {
    id: 'preset-man-adult-real',
    name: '成年男性·写实',
    style: 'realistic',
    bodyType: 'standard',
    skinColor: '#e8b896',
    topColor: '#3b82f6', // 蓝色衬衫
    bottomColor: '#1e293b', // 深色长裤
    hairColor: '#1c1917', // 黑色短发
    shoeColor: '#0f172a',
  },
  {
    id: 'preset-woman-adult-real',
    name: '成年女性·写实',
    style: 'realistic',
    bodyType: 'slim',
    skinColor: '#f5d0b0',
    topColor: '#ec4899', // 粉色毛衣
    bottomColor: '#7c3aed', // 紫色长裙
    hairColor: '#3b2417', // 棕色长发
    shoeColor: '#7e22ce',
  },
  {
    id: 'preset-man-cartoon',
    name: '卡通男性',
    style: 'cartoon',
    bodyType: 'standard',
    skinColor: '#fbbf24',
    topColor: '#ef4444', // 红色 T 恤
    bottomColor: '#0ea5e9', // 蓝色牛仔裤
    hairColor: '#451a03',
    shoeColor: '#fbbf24',
  },
  {
    id: 'preset-woman-cartoon',
    name: '卡通女性',
    style: 'cartoon',
    bodyType: 'slim',
    skinColor: '#fed7aa',
    topColor: '#a855f7', // 紫色连衣裙
    bottomColor: '#a855f7',
    hairColor: '#fbbf24', // 金色长发
    shoeColor: '#ec4899',
  },
  {
    id: 'preset-child',
    name: '儿童',
    style: 'cartoon',
    bodyType: 'child',
    skinColor: '#fde68a',
    topColor: '#22c55e', // 绿色背带裤上衣
    bottomColor: '#22c55e',
    hairColor: '#1c1917',
    shoeColor: '#dc2626',
  },
  {
    id: 'preset-elder',
    name: '长者',
    style: 'realistic',
    bodyType: 'chubby',
    skinColor: '#d4a574',
    topColor: '#78716c', // 灰色中山装
    bottomColor: '#44403c',
    hairColor: '#e5e5e5', // 银发
    shoeColor: '#1c1917',
  },
  {
    id: 'preset-stylized-bf',
    name: '风格化·朋克',
    style: 'stylized',
    bodyType: 'slim',
    skinColor: '#fbcfe8',
    topColor: '#0f172a', // 黑色皮夹克
    bottomColor: '#0f172a',
    hairColor: '#dc2626', // 红色莫西干头
    shoeColor: '#facc15',
  },
  {
    id: 'preset-stylized-cyber',
    name: '风格化·赛博',
    style: 'stylized',
    bodyType: 'slim',
    skinColor: '#22d3ee',
    topColor: '#06b6d4', // 青色赛博服
    bottomColor: '#0891b2',
    hairColor: '#a78bfa', // 紫色挑染
    shoeColor: '#0ea5e9',
  },
];

/**
 * 姿势预设（参考 q.qaigc.com 的"随机姿势"）
 * - 用局部旋转/位移表达"站立/举手/跨步/抱胸/坐姿/挥手"
 * - 单位：弧度（与 three.js 一致）
 */
export const FIGURE_POSES: ReadonlyArray<FigurePose> = [
  {
    id: 'pose-stand',
    name: '标准站姿',
    description: '自然站立，双臂下垂',
    parts: {},
  },
  {
    id: 'pose-handsup',
    name: '双手举起',
    description: '双臂高举过头',
    parts: {
      leftArm: { rx: -2.6, rz: 0.1 },
      rightArm: { rx: -2.6, rz: -0.1 },
      head: { rx: 0.2 },
    },
  },
  {
    id: 'pose-walking',
    name: '行走',
    description: '迈步姿势',
    parts: {
      leftLeg: { rx: 0.5 },
      rightLeg: { rx: -0.5 },
      leftArm: { rx: -0.4, rz: 0.15 },
      rightArm: { rx: 0.4, rz: -0.15 },
    },
  },
  {
    id: 'pose-armscrossed',
    name: '抱胸',
    description: '双臂交叉胸前',
    parts: {
      leftArm: { rx: -0.3, rz: 1.3 },
      rightArm: { rx: -0.3, rz: -1.3 },
    },
  },
  {
    id: 'pose-pointing',
    name: '指向前方',
    description: '右手指向前方',
    parts: {
      rightArm: { rx: -1.4, rz: -0.1 },
      leftArm: { rz: 0.1 },
      head: { ry: 0.15 },
    },
  },
  {
    id: 'pose-salute',
    name: '敬礼',
    description: '右手敬礼',
    parts: {
      rightArm: { rx: -0.2, rz: -1.4, ry: -0.1 },
      head: { rx: 0.05 },
    },
  },
];

/** 全景环境类型元数据（用于 UI 渲染） */
export interface EnvironmentMeta {
  id: EnvironmentType;
  name: string;
  description: string;
}

export const ENVIRONMENT_OPTIONS: ReadonlyArray<EnvironmentMeta> = [
  { id: 'sphere', name: '球形墙', description: '720° 球形穹顶' },
  { id: 'photoWall', name: '照片墙', description: '前方一面 360° 弧形墙' },
  { id: 'sevenWall', name: '7 字墙', description: '2 面墙（前后）' },
  { id: 'threeWall', name: 'U 字墙', description: '3 面墙（左前右）' },
  { id: 'fourWall', name: 'O 字墙', description: '4 面墙（围合）' },
  { id: 'circleWall', name: '圆圈墙', description: '圆柱环形墙' },
];

/** 工具：按 id 查人物预设，找不到则返回默认（写实成年男） */
export function getPersonPreset(id?: string): FigurePreset {
  return PERSON_PRESETS.find((p) => p.id === id) ?? PERSON_PRESETS[0];
}

/** 工具：按 id 查姿势，找不到则返回"标准站姿" */
export function getFigurePose(id?: string): FigurePose {
  return FIGURE_POSES.find((p) => p.id === id) ?? FIGURE_POSES[0];
}
