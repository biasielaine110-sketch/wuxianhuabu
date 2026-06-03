import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { devLog } from './devLog';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { CanvasNode, CameraPreset, Director3DNode, EnvironmentType, Figure3D, FigurePose } from '../types';
import {
  ENVIRONMENT_OPTIONS,
  FIGURE_POSES,
  PERSON_PRESETS,
  getFigurePose,
  getPersonPreset,
} from './director3dPresets';
import { createEnvironmentWall, disposeEnvironmentWall, type EnvironmentWall } from './director3dEnvironment';
import { disposeFigureModel, loadFigureModelFromFile, normalizeFigureModel } from './director3dFigureModel';
import {
  DeleteIcon,
  CopyIcon,
  EyedropperIcon,
  FullscreenIcon,
  ImageIcon,
  PersonIcon,
  PlusIcon,
  SparklesIcon,
  ViewIcon,
} from './canvasIcons';

export interface Director3DNodeContentProps {
  node: Director3DNode;
  nodes: CanvasNode[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<Director3DNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
  /** 创建一个新的 i2i 节点，并把结构化渲染种子写入（参考图 + prompt + aspectRatio + 节点位置） */
  onCreateI2iSeed?: (seed: {
    image: string;
    prompt: string;
    aspectRatio: string;
    model?: string;
    nodeX: number;
    nodeY: number;
  }) => void;
  onCopyToImage?: () => void;
}

/**
 * 创建角色 3D 组：基于 Figure3D 的人物预设 + 姿势预设构造可视化角色
 * 部位命名约定（用于 applyFigurePose 定位）：
 *   - 'head' / 'hair' / 'neck' / 'torso' / 'leftArm' / 'rightArm' / 'leftLeg' / 'rightLeg' / 'leftShoe' / 'rightShoe'
 * 体型：slim / standard / chubby / child 影响 torso 与 limb 的 width
 *
 * 几何细节（比 v1 更精细，更像"人"而不是 box 占位）：
 *   - 头：sphere（带下巴点）
 *   - 头发：球冠（不同 preset 长度 / 厚度不同）
 *   - 脖子：短 cylinder
 *   - 躯干：cylinder + 衣领（torus 段）+ 腰带
 *   - 手臂：cylinder 上臂 + 肘 sphere + cylinder 前臂
 *   - 腿：cylinder 大腿 + 膝 sphere + cylinder 小腿
 *   - 鞋：box（鞋头略宽）
 */
function buildFigureGroup(
  figure: Figure3D,
  index: number,
  labelText: string,
  buildFigureColor: (i: number) => string
): THREE.Group {
  const preset = getPersonPreset(figure.presetId);
  const pose = getFigurePose(figure.poseId);
  const paletteAccent = buildFigureColor(index);

  const group = new THREE.Group();
  group.userData = { figureId: figure.id, isFigure: true };

  // 体型尺寸因子
  const bodyFactor =
    preset.bodyType === 'slim' ? 0.85 : preset.bodyType === 'chubby' ? 1.2 : preset.bodyType === 'child' ? 0.7 : 1.0;
  const headFactor = preset.bodyType === 'child' ? 0.85 : 1.0;

  // 部位尺寸（缩放自 base 尺寸）
  const headR = 1.0 * headFactor;
  const neckH = 0.4;
  const neckR = 0.35 * bodyFactor;
  const torsoTopR = 0.95 * bodyFactor;
  const torsoBottomR = 0.7 * bodyFactor;
  const torsoH = 2.2;
  const limbR = 0.28 * bodyFactor;
  const upperArmL = 1.1;
  const lowerArmL = 1.1;
  const handR = 0.32 * bodyFactor;
  const upperLegL = 1.5;
  const lowerLegL = 1.4;
  const footR = 0.35 * bodyFactor;
  const shoeH = 0.4;
  const shoeL = 1.2;

  // 头发长度因子（不同 preset 头发长度不同）：长 / 短
  const hairLengthFactor =
    preset.id.includes('woman') || preset.id.includes('child') || preset.style === 'stylized'
      ? 1.4
      : 0.45;

  // 材质工厂
  const matOf = (color: string, roughness = 0.55, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: 0x000000 });

  const skinMat = matOf(preset.skinColor, 0.7, 0.0);
  const topMat = matOf(preset.topColor, 0.6);
  const bottomMat = matOf(preset.bottomColor, 0.7);
  const hairMat = matOf(preset.hairColor, 0.7, 0.1);
  const shoeMat = matOf(preset.shoeColor, 0.6, 0.1);
  const collarMat = matOf(preset.topColor, 0.5);

  // ============================================================
  // 几何堆叠：从 y=0 地面往上严格叠加，保证脚踩地面（y=0 平面）
  //   y 累加器 cursor 表示"当前堆叠到的 y"
  // ============================================================
  let y = 0;

  // ===== 左 / 右 腿（先建到一定 y 高度，再回到小腿 / 鞋 / 脚踝）=====
  // 用 addLegMirror 直接挂两条腿的整段几何到 group
  const hipR = 0.4 * bodyFactor;
  // 腿总高（鞋 0.5 + 脚踝 0 + 小腿 1.4 + 膝关节 0.4 + 大腿 1.5 ≈ 3.8 视觉身高）
  // 直接把 hipY 写死 = 0.5(鞋) + footR*1.2 + lowerLegL + limbR*0.4 + upperLegL
  // = 0.5 + 0.42 + 1.4 + 0.112 + 1.5 ≈ 3.93
  // 实际 hipY = 3.93（取近似 3.9），后续 y 从此继续
  const hipY = 0.5 + footR * 1.2 + lowerLegL + limbR * 0.4 + upperLegL;

  const addLegMirror = (side: 'leftLeg' | 'rightLeg', offsetX: number) => {
    // legPivot 放在 hipY（= 大腿顶），这样 partRole='leftLeg' 旋转 = 整条腿绕髋旋转
    const legPivot = new THREE.Group();
    legPivot.position.set(offsetX, hipY, 0);
    legPivot.userData = { partRole: side };

    // 大腿 cylinder：中心在 legPivot 下方 upperLegL/2
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(limbR * 1.1, limbR * 1.0, upperLegL, 12),
      bottomMat
    );
    upper.position.y = -upperLegL / 2;
    upper.userData = { figureId: figure.id, isFigurePart: true };
    upper.castShadow = true;
    legPivot.add(upper);

    // 膝关节 sphere
    const kn = new THREE.Mesh(new THREE.SphereGeometry(limbR * 1.05, 10, 10), bottomMat);
    kn.position.y = -upperLegL;
    kn.userData = { figureId: figure.id, isFigurePart: true };
    legPivot.add(kn);

    // 小腿 cylinder
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(limbR * 0.95, limbR * 0.8, lowerLegL, 12),
      bottomMat
    );
    lower.position.y = -upperLegL - lowerLegL / 2;
    lower.userData = { figureId: figure.id, isFigurePart: true };
    legPivot.add(lower);

    // 脚踝 sphere
    const ank = new THREE.Mesh(new THREE.SphereGeometry(footR, 10, 10), shoeMat);
    ank.position.y = -upperLegL - lowerLegL;
    ank.userData = { figureId: figure.id, isFigurePart: true };
    legPivot.add(ank);

    // 鞋 box（注意 legPivot 在 hipY，所以鞋的 y = -(hipY - 0.25)）
    const shoebox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, shoeL), shoeMat);
    shoebox.position.set(0, -(hipY - 0.25), shoeL * 0.3);
    shoebox.userData = { figureId: figure.id, isFigurePart: true };
    legPivot.add(shoebox);

    group.add(legPivot);
  };
  addLegMirror('leftLeg', -0.4 * bodyFactor);
  addLegMirror('rightLeg', 0.4 * bodyFactor);

  // 累加器到 hipY
  y = hipY;

  // ===== 髋关节 sphere（左右各一，作为髋部关节标识）=====
  const leftHip = new THREE.Mesh(new THREE.SphereGeometry(hipR, 12, 10), bottomMat);
  leftHip.position.set(-0.4 * bodyFactor, hipY, 0);
  leftHip.userData = { figureId: figure.id, isFigurePart: true };
  group.add(leftHip);
  const rightHip = leftHip.clone();
  rightHip.position.x = 0.4 * bodyFactor;
  group.add(rightHip);
  y += hipR * 0.6;

  // ===== 躯干 cylinder（center = y + torsoH/2）=====
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoTopR, torsoBottomR, torsoH, 18),
    topMat
  );
  torso.position.set(0, y + torsoH / 2, 0);
  torso.userData = { figureId: figure.id, isFigurePart: true, partRole: 'torso' };
  torso.castShadow = true;
  group.add(torso);

  // 衣领（贴在躯干顶）
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(torsoTopR * 1.02, 0.15, 8, 16, Math.PI),
    collarMat
  );
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI;
  collar.position.set(0, y + torsoH - 0.15, 0);
  collar.userData = { figureId: figure.id, isFigurePart: true };
  group.add(collar);

  // 腰带（贴在躯干底）
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoBottomR * 1.02, torsoBottomR * 1.02, 0.18, 18),
    matOf(preset.bottomColor, 0.4, 0.2)
  );
  belt.position.set(0, y + 0.1, 0);
  belt.userData = { figureId: figure.id, isFigurePart: true };
  group.add(belt);

  // 肩膀（左右 sphere，挂在躯干顶稍下）
  const shoulderR = 0.4 * bodyFactor;
  const shoulderY = y + torsoH - 0.2;
  const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(shoulderR, 14, 12), topMat);
  leftShoulder.position.set(-torsoTopR - 0.05, shoulderY, 0);
  leftShoulder.userData = { figureId: figure.id, isFigurePart: true };
  group.add(leftShoulder);
  const rightShoulder = leftShoulder.clone();
  rightShoulder.position.x = torsoTopR + 0.05;
  group.add(rightShoulder);

  y += torsoH;

  // ===== 脖子 cylinder（骑在躯干顶）=====
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(neckR, neckR * 1.05, neckH, 14), skinMat);
  neck.position.set(0, y + neckH / 2, 0);
  neck.userData = { figureId: figure.id, isFigurePart: true, partRole: 'neck' };
  group.add(neck);
  y += neckH;

  // ===== 头 sphere（底面与脖子顶相切）=====
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 20), skinMat);
  head.position.set(0, y + headR * 0.85, 0);
  head.userData = { figureId: figure.id, isFigurePart: true, partRole: 'head' };
  head.castShadow = true;
  group.add(head);

  // 头发：球冠，套在头上
  const hairGeom = new THREE.SphereGeometry(
    headR * 1.06,
    24,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.55 * hairLengthFactor
  );
  const hair = new THREE.Mesh(hairGeom, hairMat);
  hair.position.set(0, y + headR * 0.85, 0);
  hair.userData = { figureId: figure.id, isFigurePart: true, partRole: 'hair' };
  group.add(hair);

  // ===== 手臂（上臂 + 肘关节 + 前臂 + 手）：以肩为旋转中心 =====
  const buildArm = (side: 'left' | 'right', mirrorX: 1 | -1) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(mirrorX * (torsoTopR + 0.1), shoulderY, 0);
    armPivot.userData = { partRole: side === 'left' ? 'leftArm' : 'rightArm' };

    // 上臂 cylinder
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(limbR, limbR * 0.95, upperArmL, 12),
      topMat
    );
    upper.position.y = -upperArmL / 2;
    upper.userData = { figureId: figure.id, isFigurePart: true };
    upper.castShadow = true;
    armPivot.add(upper);

    // 肘关节
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(limbR * 1.05, 10, 10), skinMat);
    elbow.position.y = -upperArmL;
    elbow.userData = { figureId: figure.id, isFigurePart: true };
    armPivot.add(elbow);

    // 前臂 cylinder
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(limbR * 0.95, limbR * 0.9, lowerArmL, 12),
      skinMat
    );
    lower.position.y = -upperArmL - lowerArmL / 2;
    lower.userData = { figureId: figure.id, isFigurePart: true };
    armPivot.add(lower);

    // 手
    const hand = new THREE.Mesh(new THREE.SphereGeometry(handR, 10, 10), skinMat);
    hand.position.y = -upperArmL - lowerArmL - handR * 0.4;
    hand.userData = { figureId: figure.id, isFigurePart: true };
    armPivot.add(hand);

    group.add(armPivot);
  };
  buildArm('left', -1);
  buildArm('right', 1);

  // 应用初始姿势
  applyFigurePose(group, pose);

  // 位置 + 朝向
  group.rotation.y = (figure.rotation || 0) * Math.PI / 180;
  group.scale.setScalar(figure.scale || 1);
  const worldX = (figure.x / 100) * 1000 - 500;
  const worldZ = (figure.y / 100) * 1000 - 500;
  group.position.set(worldX, 0, worldZ);

  // 顶部标签
  const labelSprite = buildFigureLabelSprite(labelText, paletteAccent);
  if (labelSprite) group.add(labelSprite);

  return group;
}

/**
 * 角色默认名：把 index 转为字母序号
 *   0 → A, 1 → B, …, 25 → Z, 26 → AA, 27 → AB …
 */
function indexToCharLabel(index: number): string {
  let n = Math.max(0, index);
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * 应用姿势：把 group.userData.partRole = 'leftArm' 之类的子对象 rotation 按 pose.parts 调整
 * - pivot（带 partRole 的 group）旋转即可带动下方 mesh
 * - 直挂 mesh 的 part（如 head / hair / torso）也支持
 */
function applyFigurePose(group: THREE.Group, pose: FigurePose): void {
  const parts = pose.parts;
  group.traverse((child) => {
    const role = (child.userData as { partRole?: string } | undefined)?.partRole;
    if (!role) return;
    const p = (parts as Record<string, { rx?: number; ry?: number; rz?: number } | undefined>)[role];
    if (!p) return;
    if (p.rx !== undefined) child.rotation.x = p.rx;
    if (p.ry !== undefined) child.rotation.y = p.ry;
    if (p.rz !== undefined) child.rotation.z = p.rz;
  });
}

/** 5 档预设机位（按"景别 ↔ 距离 + fov"查表，点击瞬移） */
const CAMERA_SHOT_PRESETS: ReadonlyArray<{
  kind: CameraPreset['kind'];
  name: string;
  fov: number;
  cameraDistance: number;
  aspectRatio: string;
}> = [
  { kind: 'closeup', name: '特写', fov: 35, cameraDistance: 18, aspectRatio: '1:1' },
  { kind: 'close', name: '近景', fov: 45, cameraDistance: 28, aspectRatio: '4:3' },
  { kind: 'medium', name: '中景', fov: 55, cameraDistance: 42, aspectRatio: '16:9' },
  { kind: 'full', name: '全景', fov: 60, cameraDistance: 60, aspectRatio: '16:9' },
  { kind: 'long', name: '远景', fov: 70, cameraDistance: 90, aspectRatio: '21:9' },
];

/** 把"机位 + 环境墙 + 全景 + 站位 + 角色造型 + 姿势 + 视角"打包成结构化 prompt，供后续 i2i 生图使用 */
function buildRenderPrompt(
  shotName: string,
  fov: number,
  yaw: number,
  pitch: number,
  cameraDistance: number,
  figures: Figure3D[],
  hasPanorama: boolean,
  envType: EnvironmentType,
  envName: string
): string {
  const fovHint = fov <= 40 ? '窄视角突出主体' : fov <= 60 ? '中景' : '广角远景';
  const figLine =
    figures.length === 0
      ? '画面中无人物。'
      : `画面中有 ${figures.length} 个角色：${figures
          .map((f, i) => {
            const preset = getPersonPreset(f.presetId);
            const pose = getFigurePose(f.poseId);
            return (
              `角色${i + 1}「${f.name || `角色${i + 1}`}」` +
              `，风格 ${preset.style} / ${preset.bodyType} 体型` +
              `，肤色 ${preset.skinColor}、上衣 ${preset.topColor}、下装 ${preset.bottomColor}、鞋 ${preset.shoeColor}` +
              `，姿势：${pose.name}（${pose.description}）` +
              `，位于场景 ${Math.round(f.x)}%, ${Math.round(f.y)}% 处，朝向 ${f.rotation ?? 0}°，` +
              `${(f.scale ?? 1).toFixed(1)}x 比例`
            );
          })
          .join('；')}。`;
  const bgLine = hasPanorama
    ? `背景采用提供的 720° 全景图作为环境依据（环境墙：${envName}），保留光影方向与色调。`
    : `背景为${envName}简洁的电影感环境，请根据景别与构图生成。`;
  return (
    `[导演台机位：${shotName}]\n` +
    `机位参数：FOV ${fov.toFixed(0)}°、水平视角 ${yaw.toFixed(0)}°、俯仰 ${pitch.toFixed(
      0
    )}°、距离 ${cameraDistance.toFixed(0)}（${fovHint}）。\n` +
    `环境墙：${envName}。\n` +
    `${figLine}\n` +
    `${bgLine}\n` +
    `风格：电影感构图，主体清晰，光影统一，禁止出现 UI 与文字。`
  );
}

/** 在模块顶层：构造角色头顶的标签 sprite（不依赖任何组件内状态，buildFigureGroup 才可访问） */
function buildFigureLabelSprite(labelText: string, color: string): THREE.Sprite | null {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(6, 10, canvas.width - 12, canvas.height - 20);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 10, canvas.width - 12, canvas.height - 20);
  ctx.fillStyle = color;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(12, 3, 1);
  sprite.position.set(0, 9.5, 0);
  sprite.userData = { isFigureLabel: true, labelText };
  return sprite;
}

/**
 * 异步加载 GLB/GLTF 并替换 figureId 对应的占位 group。
 * - base64 → Blob → File → GLTFLoader
 * - 加载成功后 normalize（y=0、xz 居中、身高 ~7 单位）
 * - 释放旧 group（占位），挂新 group
 * - 若 figureId 已不在 figuresRef 中（用户已删），不挂载
 */
async function loadGlbFigureIntoGroup(
  base64: string,
  figureId: string,
  scene: THREE.Scene,
  placeholder: THREE.Group,
  figuresRef: React.MutableRefObject<Map<string, THREE.Group>>,
  figureRenderMetaRef: React.MutableRefObject<Map<string, { presetId: string; poseId: string }>>,
  figure: Figure3D,
  index: number,
  labelText: string,
  buildFigureColor: (i: number) => string
): Promise<void> {
  // base64 → Blob → File
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'model/gltf-binary' });
  const file = new File([blob], 'figure.glb', { type: 'model/gltf-binary' });

  const root = await loadFigureModelFromFile(file);
  // 标 figureId
  root.userData = { ...(root.userData || {}), figureId, isFigure: true, isGlb: true };
  // 调整 root 的位置/旋转/缩放
  root.rotation.y = (figure.rotation || 0) * Math.PI / 180;
  root.scale.setScalar(figure.scale || 1);
  const worldX = (figure.x / 100) * 1000 - 500;
  const worldZ = (figure.y / 100) * 1000 - 500;
  root.position.set(worldX, 0, worldZ);

  // 加 label sprite
  const accent = buildFigureColor(index);
  const label = buildFigureLabelSprite(labelText, accent);
  if (label) root.add(label);

  // 替换占位：如果 figureId 还存在 figuresRef 且仍指向 placeholder
  if (figuresRef.current.get(figureId) === placeholder) {
    scene.remove(placeholder);
    // 释放 placeholder 的 geometry/material
    placeholder.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m?.dispose();
      } else if (obj instanceof THREE.Sprite) {
        const sm = obj.material as THREE.SpriteMaterial;
        sm.map?.dispose();
        sm.dispose();
      }
    });
    scene.add(root);
    figuresRef.current.set(figureId, root);
  } else {
    // 用户已经删了/切换了：直接 dispose 这个新加载的 root
    disposeFigureModel(root);
  }
}

export function Director3DNodeContent({ node, nodes, eyedropperTargetNodeId, onEyedropperSelect, onUpdate, onCreateImageNode, onCreateI2iSeed, onCopyToImage }: Director3DNodeContentProps) {
  const figurePalette = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
  const buildFigureColor = (index: number) => figurePalette[index % figurePalette.length];

  /**
   * 当前相机机位（live）—— 拖动中由 onMouseMove / onWheel 实时更新。
   * 使用 ref 而非 state 是为了避免每帧触发组件重渲染。
   * node.yaw/pitch/fov/cameraDistance 仅在用户释放鼠标（onMouseUp）时同步写回。
   * 初始值从 node 取（旧节点没存时 fallback 到默认）。
   */
  const liveViewRef = useRef<{
    yaw: number;        // 0..360
    pitch: number;      // -90..90
    fov: number;
    cameraDistance: number;
    cameraTarget: { x: number; y: number; z: number };
  }>({
    yaw: node.yaw ?? 0,
    pitch: node.pitch ?? 0,
    fov: node.fov ?? 60,
    cameraDistance: node.cameraDistance ?? 60,
    cameraTarget: node.cameraTarget ?? { x: 0, y: 0, z: 0 },
  });
  /** 同步标记：onMouseMove / onWheel 拖动中为 true，停止后再写回 node */
  const viewDirtyRef = useRef(false);
  /** wheel 节流 timer：连续滚动时合并写回 node 的频率 */
  const wheelFlushTimerRef = useRef<number | null>(null);
  /** props.onUpdate 实时引用：让 init effect 内的 listener 调到的总是最新 onUpdate */
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  /** 把 live 视角同步到 node state（节流：至多 100ms 一次） */
  const flushLiveViewToNode = useCallback(() => {
    const v = liveViewRef.current;
    onUpdateRef.current({
      yaw: v.yaw,
      pitch: v.pitch,
      fov: v.fov,
      cameraDistance: v.cameraDistance,
      cameraTarget: v.cameraTarget,
    });
    viewDirtyRef.current = false;
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const groundMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  /** 全景环境墙（sphere / photoWall / 7/U/O/circle）：承载 sky material + ground material */
  const envWallRef = useRef<EnvironmentWall | null>(null);
  /** 视线 / 轴线 3D 辅助对象：保持 ref 以便 effect 内更新顶点 */
  const sightLineRef = useRef<THREE.Line | null>(null);
  const axisLineRef = useRef<THREE.Line | null>(null);
  const sightLineMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const axisLineMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const groundTextureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number>(0);
  const currentImageRef = useRef<string>('');
  const figuresRef = useRef<Map<string, THREE.Group>>(new Map());
  /** 每个角色最近一次 build 时用的 presetId/poseId（用来检测是否需要重建） */
  const figureRenderMetaRef = useRef<Map<string, { presetId: string; poseId: string }>>(new Map());
  const nodeRef = useRef(node);
  nodeRef.current = node; // 保持 ref 同步
  const [forceUpdateKey, setForceUpdateKey] = useState(0);
  const [displayInfo, setDisplayInfo] = useState({ yaw: 0, pitch: 0, fov: 75 });
  // 是否显示角色底部的网格地面：默认隐藏（让用户视觉上专注于 720° 全景）
  const [showGrid, setShowGrid] = useState(false);
  const [fullscreenCapture, setFullscreenCapture] = useState<{ type: 'single' | 'grid', base64: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const isDraggingFigureRef = useRef(false);
  const draggingFigureIdRef = useRef<string | null>(null);

  // 全屏参数
  const [fsFullscreenParams, setFsFullscreenParams] = useState({ yaw: 0, pitch: 0, fov: 75 });

  const backgroundImage = node.backgroundImage ?? '';
  const backgroundImageAssetId = node.backgroundImageAssetId;
  const hasBackgroundMedia = !!(backgroundImage || backgroundImageAssetId);

  useEffect(() => {
    currentImageRef.current = '';
  }, [backgroundImage, backgroundImageAssetId]);

  // 同步 showGrid → gridHelper.visible
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  // 是否显示 xyz 轴线（AxesHelper）：默认显示，方便对齐；可手动隐藏（截图时常用）
  const [showAxes, setShowAxes] = useState(true);
  useEffect(() => {
    if (axesRef.current) axesRef.current.visible = showAxes;
  }, [showAxes]);

  // 是否显示 720 全景的"脚底地面平面"（半透明纹理大圆面）：默认隐藏
  //   ⚠️ sphere 模式下 groundMesh 永远隐藏（球壳内壁已包含整张 720 图，包括下半部分，
  //       重复贴地面会视觉错位）；其他墙模式（照片墙 / 7字 / U字 / O字 / 圆筒）下生效
  const [showGround, setShowGround] = useState(false);
  useEffect(() => {
    const envType = node.environmentType ?? 'sphere';
    const effectiveVisible = showGround && envType !== 'sphere';
    if (groundRef.current) groundRef.current.visible = effectiveVisible;
  }, [showGround, node.environmentType]);
  const figures = node.figures ?? [];

  // 处理全屏截图
  useEffect(() => {
    if (fullscreenCapture && fullscreenCapture.base64) {
      onCreateImageNode([fullscreenCapture.base64], node.x + node.width + 50, node.y);
      setFullscreenCapture(null);
    }
  }, [fullscreenCapture, node.x, node.width, node.y, onCreateImageNode]);

  // 初始化 Three.js 场景
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('3D导演台: 容器不存在');
      return;
    }

    let isInitialized = false;
    let cleanupFn: (() => void) | null = null;
    let retryCount = 0;
    const maxRetries = 20;

    const initScene = () => {
      const rect = container.getBoundingClientRect();
      console.log('3D导演台初始化尝试:', retryCount, '尺寸:', rect.width, 'x', rect.height);

      if (rect.width === 0 || rect.height === 0) {
        if (retryCount < maxRetries) {
          retryCount++;
          requestAnimationFrame(initScene);
        }
        return;
      }

      if (isInitialized) {
        console.log('3D导演台: 已初始化，跳过');
        return;
      }
      isInitialized = true;

      const width = rect.width;
      const height = rect.height;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x333333);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
      // 相机初始在 y=0 地平线高度（贴近 720 全景图查看器体验）
      camera.position.set(0, 0, 50);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x333333, 1);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // 设置 canvas 可以接收键盘事件
      renderer.domElement.tabIndex = 0;
      renderer.domElement.style.outline = 'none';

      console.log('3D导演台: canvas已添加', renderer.domElement.width, renderer.domElement.height);

      const gridHelper = new THREE.GridHelper(500, 50, 0x666666, 0x444444);
      gridHelper.position.y = 0;
      (gridHelper.material as THREE.Material).opacity = 0.6;
      (gridHelper.material as THREE.Material).transparent = true;
      gridHelper.visible = false;  // 默认隐藏，让用户视觉专注于 720° 全景
      scene.add(gridHelper);
      gridRef.current = gridHelper;

      const axesHelper = new THREE.AxesHelper(50);
      axesRef.current = axesHelper;
      scene.add(axesHelper);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(50, 100, 50);
      scene.add(directionalLight);

      // 720全景图背景（默认 sphere 球形穹顶；后续 effect 可切换为 photoWall/7字/U字/O字/圆圈墙）
      const envType: EnvironmentType = nodeRef.current.environmentType ?? 'sphere';
      const envWall = createEnvironmentWall(envType);
      scene.add(envWall.root);
      envWallRef.current = envWall;
      // 兼容旧代码：把"主 sky material"指到 root 子 mesh 的 material 上（取第一个）
      const firstSkyMesh = envWall.root.children.find(
        (c) => c instanceof THREE.Mesh && (c.userData as { isEnvSky?: boolean })?.isEnvSky
      ) as THREE.Mesh | undefined;
      if (firstSkyMesh) {
        sphereRef.current = firstSkyMesh;
        materialRef.current = firstSkyMesh.material as THREE.MeshBasicMaterial;
      }

      // 720全景图地面（使用全景图下半部分纹理）
      const groundGeometry = new THREE.CircleGeometry(500, 72);
      const groundMaterial = envWall.groundMaterial;
      const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = -0.05;
      groundMesh.visible = false;  // 默认隐藏（用户视角应该"站在全景图里"，不需要脚下硬地板）
      scene.add(groundMesh);
      groundRef.current = groundMesh;
      groundMaterialRef.current = groundMaterial;

      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setSize(1.6); // 操纵轴放大一倍
      transformControlsRef.current = transformControls;
      console.log('TransformControls已创建:', transformControls);

      // 获取并添加 helper 到场景中
      const helper = transformControls.getHelper();
      if (helper) {
        scene.add(helper);
        console.log('TransformControls helper 已添加');
      }

      // 使用一个标志来避免循环更新
      let isTransforming = false;

      transformControls.addEventListener('change', () => {
        console.log('TransformControls change 事件触发');
        if (isTransforming) return;
        if (transformControls.object) {
          const figureId = (transformControls.object as THREE.Group).userData.figureId;
          if (figureId) {
            isTransforming = true;

            // 直接更新 Three.js 中的角色位置
            const worldX = transformControls.object.position.x;
            const worldZ = transformControls.object.position.z;
            const rotation = transformControls.object.rotation.y * 180 / Math.PI;
            const scale = transformControls.object.scale.x;

            // 使用 nodeRef.current 获取最新的 figures 数据
            const newFigures = (nodeRef.current.figures || []).map((f: Figure3D) => f.id === figureId
              ? { ...f, x: Math.max(0, Math.min(100, ((worldX + 500) / 1000) * 100)), y: Math.max(0, Math.min(100, ((worldZ + 500) / 1000) * 100)), rotation, scale }
              : f);

            console.log('TransformControls change, figures数量从', (nodeRef.current.figures || []).length, '变为', newFigures.length);

            onUpdate({ figures: newFigures });

            setTimeout(() => { isTransforming = false; }, 100);
          }
        }
        renderer.render(scene, camera);
      });

      transformControls.addEventListener('mouseDown', () => {
        isDragging = false;
        isPanning = false;
      });

      let isDragging = false;
      let isPanning = false;
      let lastX = 0;
      let lastY = 0;
      // 初始值由 liveViewRef.current 提供（来自 node state）
      // 这样切换"机位预设"或"保存机位"都能拿到真实的"当前视角"
      const initialLive = liveViewRef.current;
      let theta = (initialLive.yaw * Math.PI) / 180;
      let phi = Math.PI / 2 - (initialLive.pitch * Math.PI) / 180;
      let cameraDistance = initialLive.cameraDistance;
      let cameraTarget = new THREE.Vector3(0, 0, 0);

      /**
       * 同步工作变量（theta/phi/cameraDistance）→ liveViewRef（不触发 render）
       * 与"是否要把 live 写回 node state"解耦。
       */
      const syncLiveFromWork = () => {
        const yawDeg = (((theta * 180) / Math.PI) % 360 + 360) % 360;
        const pitchDeg = 90 - (phi * 180) / Math.PI;
        liveViewRef.current = {
          yaw: yawDeg,
          pitch: pitchDeg,
          fov: nodeRef.current.fov ?? 60,
          cameraDistance,
          cameraTarget: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z },
        };
        viewDirtyRef.current = true;
      };

      const updateCamera = () => {
        const fov = nodeRef.current.fov ?? 60;
        camera.fov = fov;
        camera.updateProjectionMatrix();

        const x = cameraDistance * Math.sin(phi) * Math.sin(theta);
        const y = cameraDistance * Math.cos(phi);
        const z = cameraDistance * Math.sin(phi) * Math.cos(theta);

        camera.position.set(cameraTarget.x + x, cameraTarget.y + y, cameraTarget.z + z);
        camera.lookAt(cameraTarget);
      };

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const getMousePosition = (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const onMouseDown = (e: MouseEvent) => {
        console.log('onMouseDown 触发, button:', e.button, 'transformControls.dragging:', transformControls.dragging);

        if (transformControls.dragging) return;

        getMousePosition(e);
        raycaster.setFromCamera(mouse, camera);

        const allObjects: THREE.Object3D[] = [];
        scene.traverse((obj) => {
          if (obj.userData && (obj.userData.isFigure || obj.userData.isFigurePart)) {
            allObjects.push(obj);
          }
        });

        console.log('点击检测:', allObjects.length, '个对象');

        const intersects = raycaster.intersectObjects(allObjects, true);
        console.log('射线检测结果:', intersects.length);

        if (intersects.length > 0) {
          let target = intersects[0].object;
          console.log('点击对象:', target.type, target.userData);
          while (target.parent && !target.userData.figureId) {
            target = target.parent;
          }
          console.log('找到角色ID:', target.userData.figureId);
          if (target.userData.figureId) {
            const figureId = target.userData.figureId;
            const figureGroup = figuresRef.current.get(figureId);
            console.log('角色Group:', figureGroup ? '存在' : '不存在');
            if (figureGroup) {
              // 在 attach 之前设置标志，防止 attach 触发的 change 事件
              isTransforming = true;
              setSelectedFigureId(figureId);
              transformControls.attach(figureGroup);
              // 选中后让 canvas 获取焦点，以便接收键盘事件
              renderer.domElement.focus();
              // attach 完成后，重置标志
              setTimeout(() => { isTransforming = false; }, 100);
              return;
            }
          }
        }

        setSelectedFigureId(null);
        transformControls.detach();

        if (e.button === 2 || e.button === 1) {
          isPanning = true;
        } else {
          isDragging = true;
        }
        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;

        if (transformControls.dragging) return;

        if (isPanning) {
          // 平移：沿相机的 right / up 向量移动 cameraTarget
          // （dx 沿水平方向，dy 沿垂直方向；不再硬编码到 XZ 平面）
          // 关键：scale 选为"屏幕高度对应 fov 视角下的一半世界宽度"
          // = cameraDistance * tan(fov/2)。平移 1 像素 = 移动 (scale * 2 / canvasH) 单位
          const aspect = renderer.domElement.width / Math.max(1, renderer.domElement.height);
          const forward = new THREE.Vector3()
            .subVectors(cameraTarget, camera.position)
            .normalize();
          const worldUp = new THREE.Vector3(0, 1, 0);
          const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
          const up = new THREE.Vector3().crossVectors(right, forward).normalize();
          const halfH = cameraDistance * Math.tan(((camera.fov * Math.PI) / 180) / 2);
          const halfW = halfH * aspect;
          // 1 像素 = 对应视场高度的 (2 * halfH) / canvasH 单位
          // 水平方向再乘 aspect 换算成世界单位的水平距离
          const dyWorld = ( dy / renderer.domElement.height) * (halfH * 2);
          const dxWorld = (-dx / renderer.domElement.width) * (halfW * 2);
          cameraTarget.addScaledVector(right, dxWorld);
          cameraTarget.addScaledVector(up, dyWorld);
          // 同步到 live view（不触发 render），松开鼠标时一并写回 node
          liveViewRef.current = {
            ...liveViewRef.current,
            cameraTarget: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z },
          };
          viewDirtyRef.current = true;
          updateCamera();
        } else if (isDragging) {
          theta -= dx * 0.01;
          phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi + dy * 0.01));
          updateCamera();

          const yawDeg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
          const pitchDeg = 90 - (phi * 180 / Math.PI);
          setDisplayInfo({ yaw: yawDeg, pitch: pitchDeg, fov: nodeRef.current.fov ?? 60 });
          // 同步到 live view（不触发 render）
          liveViewRef.current = {
            yaw: yawDeg,
            pitch: pitchDeg,
            fov: nodeRef.current.fov ?? 60,
            cameraDistance,
            cameraTarget: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z },
          };
          viewDirtyRef.current = true;
        }

        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseUp = () => {
        const wasInteracting = isDragging || isPanning;
        isDragging = false;
        isPanning = false;
        isDraggingFigureRef.current = false;
        draggingFigureIdRef.current = null;
        // 释放鼠标时把 live 视角同步回 node state（让"保存机位"拿到正确值）
        if (wasInteracting && viewDirtyRef.current) {
          flushLiveViewToNode();
        }
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        // 滚轮缩放：最近 1 单位（贴近角色），最远 2000 单位（看全景甚至球壳外）
        cameraDistance = Math.max(1, Math.min(2000, cameraDistance + e.deltaY * 0.05));
        updateCamera();
        // 同步到 live view（不触发 render）
        liveViewRef.current = {
          ...liveViewRef.current,
          cameraDistance,
        };
        viewDirtyRef.current = true;
        // wheel 没有"mouseup"事件，节流 100ms 写回 node
        if (wheelFlushTimerRef.current) window.clearTimeout(wheelFlushTimerRef.current);
        wheelFlushTimerRef.current = window.setTimeout(() => {
          flushLiveViewToNode();
        }, 100);
      };

      const onContextMenu = (e: Event) => {
        e.preventDefault();
      };

      // 键盘事件 - 快捷键切换变换模式
      const onKeyDown = (e: KeyboardEvent) => {
        if (!transformControls.object) return; // 只有选中物体时才响应
        if (e.target instanceof HTMLInputElement) return; // 输入框中不响应

        switch (e.key.toLowerCase()) {
          case 'g':
            transformControls.setMode('translate');
            setTransformMode('translate');
            break;
          case 'r':
            transformControls.setMode('rotate');
            setTransformMode('rotate');
            break;
          case 's':
            transformControls.setMode('scale');
            setTransformMode('scale');
            break;
        }
      };

      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('mouseleave', onMouseUp);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      renderer.domElement.addEventListener('contextmenu', onContextMenu);
      renderer.domElement.addEventListener('keydown', onKeyDown);

      controlsRef.current = {
        dispose: () => {
          renderer.domElement.removeEventListener('mousedown', onMouseDown);
          renderer.domElement.removeEventListener('mousemove', onMouseMove);
          renderer.domElement.removeEventListener('mouseup', onMouseUp);
          renderer.domElement.removeEventListener('mouseleave', onMouseUp);
          renderer.domElement.removeEventListener('wheel', onWheel);
          renderer.domElement.removeEventListener('contextmenu', onContextMenu);
          renderer.domElement.removeEventListener('keydown', onKeyDown);
          transformControls.dispose();
        },
        update: updateCamera,
        setTheta: (t: number) => { theta = t; },
        setPhi: (p: number) => { phi = p; },
        /**
         * 一次性瞬移到指定机位（机位预设 / 视角应用都走这里）
         * yaw 单位度（0..360，0=正北），pitch 单位度（0=地平、90=天顶、-90=正下）
         */
        applyCameraView: (view: {
          yaw: number;
          pitch: number;
          fov: number;
          cameraDistance: number;
          cameraTarget?: { x: number; y: number; z: number };
        }) => {
          theta = (view.yaw * Math.PI) / 180;
          phi = Math.max(0.01, Math.min(Math.PI - 0.01, (Math.PI / 2) - (view.pitch * Math.PI) / 180));
          cameraDistance = Math.max(1, Math.min(2000, view.cameraDistance));
          if (view.cameraTarget) {
            cameraTarget.set(view.cameraTarget.x, view.cameraTarget.y, view.cameraTarget.z);
          }
          updateCamera();
        },
      };

      let animLoopActive = false;
      const animate = () => {
        if (!animLoopActive) return;
        animationFrameRef.current = requestAnimationFrame(animate);
        if (transformControls.object) {
          transformControls.update();
        }
        renderer.render(scene, camera);
      };
      const startAnim = () => {
        if (animLoopActive) return;
        animLoopActive = true;
        animate();
      };
      const stopAnim = () => {
        animLoopActive = false;
        cancelAnimationFrame(animationFrameRef.current);
      };
      let inViewport = true;
      const syncAnimState = () => {
        if (document.hidden || !inViewport) stopAnim();
        else startAnim();
      };
      document.addEventListener('visibilitychange', syncAnimState);
      const io = new IntersectionObserver(
        (entries) => {
          inViewport = entries[0]?.isIntersecting ?? false;
          syncAnimState();
        },
        { root: null, rootMargin: '100px', threshold: 0 }
      );
      io.observe(container);
      syncAnimState();

      updateCamera();

      cleanupFn = () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', syncAnimState);
        stopAnim();
        controlsRef.current?.dispose();
        if (textureRef.current) {
          textureRef.current.dispose();
          textureRef.current = null;
        }
        if (groundTextureRef.current) {
          groundTextureRef.current.dispose();
          groundTextureRef.current = null;
        }
        if (materialRef.current) {
          materialRef.current.dispose();
          materialRef.current = null;
        }
        if (groundMaterialRef.current) {
          groundMaterialRef.current.dispose();
          groundMaterialRef.current = null;
        }
        if (sphereRef.current) {
          const geom = sphereRef.current.geometry;
          if (geom) geom.dispose();
          sphereRef.current = null;
        }
        if (groundRef.current) {
          const g = groundRef.current.geometry;
          if (g) g.dispose();
          groundRef.current = null;
        }
        // 释放全景环境墙（其内部所有 sky material + ground material + geometry）
        if (envWallRef.current) {
          disposeEnvironmentWall(envWallRef.current);
          envWallRef.current = null;
        }
        if (sceneRef.current) { sceneRef.current.clear(); }
        renderer.dispose();
        renderer.forceContextLoss();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    };

    initScene();

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []);

  // 切换全景环境类型：移除旧 wall，构造新 wall
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const envType = node.environmentType ?? 'sphere';
    if (!envWallRef.current) return; // 初始化 effect 还没建好

    // 取出当前 wall 的 envType（通过 root.userData 推断）
    const currentKind = (envWallRef.current.root.userData as { envType?: string }).envType;
    if (currentKind === envType) return;

    // 移除并 dispose 旧 wall
    scene.remove(envWallRef.current.root);
    disposeEnvironmentWall(envWallRef.current);
    envWallRef.current = null;
    sphereRef.current = null;
    materialRef.current = null;
    // 地面材质是 envWall 内部的 groundMaterial 之一，dispose 已释放；这里把 groundMaterialRef 解绑避免后续误用
    groundMaterialRef.current = null;
    groundRef.current = null;

    // 创建新 wall
    const newWall = createEnvironmentWall(envType);
    (newWall.root.userData as { envType?: string }).envType = envType;
    scene.add(newWall.root);
    envWallRef.current = newWall;
    const firstSkyMesh = newWall.root.children.find(
      (c) => c instanceof THREE.Mesh && (c.userData as { isEnvSky?: boolean })?.isEnvSky
    ) as THREE.Mesh | undefined;
    if (firstSkyMesh) {
      sphereRef.current = firstSkyMesh;
      materialRef.current = firstSkyMesh.material as THREE.MeshBasicMaterial;
    }
    // 重建地面
    const groundGeometry = new THREE.CircleGeometry(500, 72);
    const groundMesh = new THREE.Mesh(groundGeometry, newWall.groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.visible = false;  // 默认隐藏（用户视角"站在全景里"，不需要脚下硬地板）
    scene.add(groundMesh);
    groundRef.current = groundMesh;
    groundMaterialRef.current = newWall.groundMaterial;
  }, [node.environmentType]);

  // 载入720全景图作为背景+地面纹理（支持 assetId）
  useEffect(() => {
    const scene = sceneRef.current;
    const skyMaterial = materialRef.current;
    const groundMaterial = groundMaterialRef.current;
    if (!scene || !skyMaterial || !groundMaterial) return;

    const clearBackground = () => {
      skyMaterial.map = null;
      skyMaterial.color.setHex(0x2f2f2f);
      skyMaterial.needsUpdate = true;
      groundMaterial.map = null;
      groundMaterial.color.setHex(0x2b2b2b);
      groundMaterial.needsUpdate = true;
      scene.background = new THREE.Color(0x333333);
    };

    if (!hasBackgroundMedia) {
      clearBackground();
      return;
    }

    let cancelled = false;

    const applyBackgroundFromImage = (img: HTMLImageElement) => {
      if (cancelled) return;
      if (textureRef.current) {
        textureRef.current.dispose();
      }
      if (groundTextureRef.current) {
        groundTextureRef.current.dispose();
      }

      const skyTexture = new THREE.Texture(img);
      skyTexture.colorSpace = THREE.SRGBColorSpace;
      skyTexture.minFilter = THREE.LinearFilter;
      skyTexture.magFilter = THREE.LinearFilter;
      // 720 全景图水平方向必须 wrap（经度 0° / 360° 重合），否则球面左右接缝
      skyTexture.wrapS = THREE.RepeatWrapping;
      skyTexture.wrapT = THREE.ClampToEdgeWrapping;
      skyTexture.generateMipmaps = false;
      skyTexture.needsUpdate = true;
      textureRef.current = skyTexture;

      skyMaterial.map = skyTexture;
      skyMaterial.color.setHex(0xffffff);
      skyMaterial.needsUpdate = true;
      // scene.background 不再贴 skyTexture（避免全屏 2D 背景与球壳内壁冲突，
      // 同时也避免贴图绕场造成视觉错乱）。球壳本身就是环境。
      scene.background = new THREE.Color(0x333333);

      // sphere 模式下整张 720 图已经贴在球壳内壁（含下半部分），
      // 不再单独生成 groundTexture，避免"地面 + 球壳下半"画面重复
      const currentEnvType = nodeRef.current.environmentType ?? 'sphere';
      if (currentEnvType === 'sphere') {
        groundMaterial.map = null;
        groundMaterial.color.setHex(0x2b2b2b);
        groundMaterial.needsUpdate = true;
        return;
      }

      const groundCanvas = document.createElement('canvas');
      const groundSize = 1024;
      groundCanvas.width = groundSize;
      groundCanvas.height = groundSize;
      const gctx = groundCanvas.getContext('2d');
      if (gctx) {
        gctx.drawImage(
          img,
          0, Math.floor(img.height / 2),
          img.width, Math.ceil(img.height / 2),
          0, 0,
          groundSize, groundSize
        );
        const groundTexture = new THREE.CanvasTexture(groundCanvas);
        groundTexture.colorSpace = THREE.SRGBColorSpace;
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(2, 2);
        groundTexture.minFilter = THREE.LinearFilter;
        groundTexture.magFilter = THREE.LinearFilter;
        groundTexture.needsUpdate = true;
        groundTextureRef.current = groundTexture;
        groundMaterial.map = groundTexture;
        groundMaterial.color.setHex(0xffffff);
        groundMaterial.needsUpdate = true;
      }
    };

    void (async () => {
      const { resolveCanvasImageSource } = await import('../services/canvasAssetResolver');
      const src = await resolveCanvasImageSource(backgroundImage, backgroundImageAssetId);
      if (cancelled || !src) {
        clearBackground();
        return;
      }
      const img = new Image();
      img.onload = () => applyBackgroundFromImage(img);
      img.onerror = () => {
        if (!cancelled) clearBackground();
      };
      img.src = src;
    })();

    return () => {
      cancelled = true;
    };
  }, [backgroundImage, backgroundImageAssetId, hasBackgroundMedia]);

  // 节点尺寸变化时同步更新3D渲染尺寸，避免右侧/底部被裁切
  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!container || !renderer || !camera) return;

    const resizeRenderer = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (sceneRef.current) renderer.render(sceneRef.current, camera);
    };

    resizeRenderer();
    const observer = new ResizeObserver(resizeRenderer);
    observer.observe(container);
    return () => observer.disconnect();
  }, [node.width, node.height]);

  // 同步TransformControls模式
  useEffect(() => {
    if (transformControlsRef.current) {
      switch (transformMode) {
        case 'translate':
          transformControlsRef.current.setMode('translate');
          break;
        case 'rotate':
          transformControlsRef.current.setMode('rotate');
          break;
        case 'scale':
          transformControlsRef.current.setMode('scale');
          break;
      }
    }
  }, [transformMode]);

  // 管理3D角色 - 在网格地面上
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentFigures = figures || [];
    console.log('角色管理Effect运行, node.id:', node.id, 'figures数量:', currentFigures.length);

    // 如果有角色被TransformControls控制但不在当前列表中，先分离
    const tc = transformControlsRef.current;
    if (tc?.object) {
      const controlledId = (tc.object as THREE.Group).userData?.figureId;
      if (controlledId && !currentFigures.find(f => f.id === controlledId)) {
        console.log('分离被删除的角色:', controlledId);
        tc.detach();
      }
    }

    const currentFigureIds = new Set(currentFigures.map(f => f.id));
    console.log('当前figures列表:', Array.from(currentFigureIds));

    // 删除不存在的角色（同时释放 group 内的所有 geometry / material）
    const disposeGroup = (group: THREE.Group) => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m?.dispose();
        } else if (obj instanceof THREE.Sprite) {
          const sm = obj.material as THREE.SpriteMaterial;
          sm.map?.dispose();
          sm.dispose();
        }
      });
    };
    figuresRef.current.forEach((group, id) => {
      if (!currentFigureIds.has(id)) {
        console.log('删除角色:', id, '原因: 不在currentFigures中');
        scene.remove(group);
        disposeGroup(group);
        figuresRef.current.delete(id);
        figureRenderMetaRef.current.delete(id);
      }
    });

    // 添加或更新角色
    currentFigures.forEach((figure, index) => {
      // 角色编号色（用于选中高亮与标签描边）—— 来自 palette + 序号
      const figureColor = new THREE.Color(buildFigureColor(index));
      const labelText = figure.name || `角色${indexToCharLabel(index)}`;

      // 决定是否需要重建：preset 变化 / 姿势变化 → 完整 dispose 旧 group 后 buildFigureGroup
      const prevMeta = figureRenderMetaRef.current.get(figure.id);
      const targetPresetId = figure.presetId ?? PERSON_PRESETS[0].id;
      const targetPoseId = figure.poseId ?? FIGURE_POSES[0].id;
      const needRebuild = !prevMeta || prevMeta.presetId !== targetPresetId || prevMeta.poseId !== targetPoseId;

      if (figuresRef.current.has(figure.id) && needRebuild) {
        // dispose 旧 group 后重建
        const old = figuresRef.current.get(figure.id)!;
        scene.remove(old);
        disposeGroup(old);
        figuresRef.current.delete(figure.id);
      }

      if (!figuresRef.current.has(figure.id)) {
        if (figure.modelType === 'glb' && figure.image) {
          // GLB 模型：异步加载（base64 → Blob → GLTFLoader）
          // 这里不能 await；用"先放一个临时占位 + 异步替换"的方式
          const placeholder = buildFigureGroup(figure, index, labelText, buildFigureColor);
          scene.add(placeholder);
          figuresRef.current.set(figure.id, placeholder);
          figureRenderMetaRef.current.set(figure.id, { presetId: targetPresetId, poseId: targetPoseId });
          // 异步加载
          loadGlbFigureIntoGroup(figure.image, figure.id, scene, placeholder, figuresRef, figureRenderMetaRef, figure, index, labelText, buildFigureColor).catch((err) => {
            console.warn('[Director3D] GLB 加载失败，使用内置人偶占位:', err);
          });
        } else {
          // 内置人偶
          const group = buildFigureGroup(figure, index, labelText, buildFigureColor);
          scene.add(group);
          figuresRef.current.set(figure.id, group);
          figureRenderMetaRef.current.set(figure.id, { presetId: targetPresetId, poseId: targetPoseId });
        }
        return;
      }

      // 已有角色且无需重建 → 走"原地更新"路径
      const group = figuresRef.current.get(figure.id)!;

      // 检查是否正被TransformControls控制，如果是则跳过位置更新
      const tc = transformControlsRef.current;
      const controlledGroup = tc?.object as THREE.Group | undefined;
      const isControlled = controlledGroup?.userData?.figureId === figure.id;

      if (!isControlled) {
        group.rotation.y = (figure.rotation || 0) * Math.PI / 180;
        group.scale.setScalar(figure.scale || 1);

        // 将网格坐标转换为世界坐标
        const worldX = (figure.x / 100) * 1000 - 500;
        const worldZ = (figure.y / 100) * 1000 - 500;
        group.position.set(worldX, 0, worldZ);
      }

      // 同步姿势（即使没 rebuild 也要把当前 poseId 应用上去）
      const pose = getFigurePose(figure.poseId);
      applyFigurePose(group, pose);
      // 记录当前 meta，防止下次 effect 误判
      figureRenderMetaRef.current.set(figure.id, { presetId: targetPresetId, poseId: targetPoseId });

      // 同步选中态与 emissive（保留原配色，仅修改 emissive）
      group.traverse((child) => {
        if (child.userData?.isFigureLabel && child instanceof THREE.Sprite) {
          return;
        }
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (selectedFigureId === figure.id) {
            (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x444444);
          } else {
            (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          }
        }
      });

      // 同步标签文本：若 labelText 变化，重建 sprite
      const existingLabel = group.children.find((c) => c.userData?.isFigureLabel) as THREE.Sprite | undefined;
      const existingLabelText = (existingLabel?.userData as { labelText?: string } | undefined)?.labelText;
      if (existingLabelText !== labelText) {
        if (existingLabel) {
          const mat = existingLabel.material as THREE.SpriteMaterial;
          mat.map?.dispose();
          mat.dispose();
          group.remove(existingLabel);
        }
        const newLabel = buildFigureLabelSprite(labelText, `#${figureColor.getHexString()}`);
        if (newLabel) group.add(newLabel);
      }
    });
  }, [figures, selectedFigureId]);

  // 视线 / 轴线 辅助：在 3D 场景内绘制，分两个独立 Line 对象，便于分别清理
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const guides = node.compositionGuides ?? {};
    const showSight = !!guides.sightLine;
    const showAxis = !!guides.axisLine;
    // 注意：selectedFigure 在更下方才定义，此处内联查找避免引用未初始化的常量
    const selectedFigureHere = figures.find((f) => f.id === selectedFigureId) ?? null;

    // 找两个最接近的角色（按 2D 距离平方）作为轴线端点
    const pickAxisPair = (figs: Figure3D[]): [Figure3D, Figure3D] | null => {
      if (figs.length < 2) return null;
      let best: [Figure3D, Figure3D] | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < figs.length; i++) {
        for (let j = i + 1; j < figs.length; j++) {
          const a = figs[i];
          const b = figs[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            best = [a, b];
          }
        }
      }
      return best;
    };

    // 计算角色眼睛/头顶位置（头顶比身高略高）
    const figureEyeWorld = (f: Figure3D) => {
      const wx = (f.x / 100) * 1000 - 500;
      const wz = (f.y / 100) * 1000 - 500;
      return new THREE.Vector3(wx, 6.5, wz); // 6.5 约等于角色头部高度
    };

    // --- 视线 ---
    if (showSight && selectedFigureHere) {
      const start = figureEyeWorld(selectedFigureHere);
      const rotation = ((selectedFigureHere.rotation ?? 0) * Math.PI) / 180;
      // forward 方向：rotation=0 朝 +Z，与 three.js 中 group.rotation.y = rot 一致
      const forward = new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation));
      const length = 60; // 视线长度（世界单位）
      const end = start.clone().add(forward.multiplyScalar(length));

      const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const mat = new THREE.LineBasicMaterial({
        color: 0xff66cc,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 5;
      line.userData = { isCompositionGuide: true };
      scene.add(line);
      sightLineRef.current = line;
      sightLineMatRef.current = mat;

      // 端点小圆点（眼睛位置）
      const dotGeom = new THREE.SphereGeometry(0.6, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xff66cc,
        depthTest: false,
        depthWrite: false,
      });
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.copy(start);
      dot.userData = { isCompositionGuide: true };
      scene.add(dot);
      sightLineRef.current.userData.endDot = dot;
    }

    // --- 轴线：连接两角色头顶，并在其法向上画一条 180° 限制线（实线 + 虚线镜像） ---
    if (showAxis) {
      const pair = pickAxisPair(figures);
      if (pair) {
        const a = figureEyeWorld(pair[0]);
        const b = figureEyeWorld(pair[1]);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        // 轴线方向（两角色连线的法线，作为「不可跨越的 180° 边界」）
        const axisDir = new THREE.Vector3().subVectors(b, a).normalize();
        // 让轴线方向在 XZ 平面上（保持水平）
        axisDir.y = 0;
        if (axisDir.lengthSq() < 1e-6) axisDir.set(1, 0, 0);
        axisDir.normalize();
        const axisLen = 80; // 180° 轴线长度
        const p1 = mid.clone().add(axisDir.clone().multiplyScalar(axisLen));
        const p2 = mid.clone().add(axisDir.clone().multiplyScalar(-axisLen));

        // 实线
        const axisGeom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const axisMat = new THREE.LineBasicMaterial({
          color: 0xffd166,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        });
        const axisLine = new THREE.Line(axisGeom, axisMat);
        axisLine.renderOrder = 5;
        axisLine.userData = { isCompositionGuide: true };
        scene.add(axisLine);
        axisLineRef.current = axisLine;
        axisLineMatRef.current = axisMat;

        // 两端点端帽（短竖线提示「不要跨越」）
        for (const pt of [p1, p2]) {
          const capGeom = new THREE.BufferGeometry().setFromPoints([
            pt.clone().add(new THREE.Vector3(0, -2, 0)),
            pt.clone().add(new THREE.Vector3(0, 2, 0)),
          ]);
          const capMat = new THREE.LineBasicMaterial({
            color: 0xffd166,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
          });
          const cap = new THREE.Line(capGeom, capMat);
          cap.renderOrder = 5;
          cap.userData = { isCompositionGuide: true };
          scene.add(cap);
          (axisLineRef.current.userData.caps ??= []).push(cap);
        }
      }
    }

    // 清理：卸载/开关关闭时移除上一次绘制的辅助对象
    return () => {
      const removeFromScene = (line: THREE.Line | null) => {
        if (!line) return;
        scene.remove(line);
        line.geometry.dispose();
        const mat = (line.material as THREE.Material) ?? null;
        if (mat) mat.dispose();
        const endDot = (line.userData as { endDot?: THREE.Mesh })?.endDot;
        if (endDot) {
          scene.remove(endDot);
          endDot.geometry.dispose();
          (endDot.material as THREE.Material | undefined)?.dispose();
        }
        const caps: THREE.Line[] | undefined = (line.userData as { caps?: THREE.Line[] })?.caps;
        if (caps) {
          for (const c of caps) {
            scene.remove(c);
            c.geometry.dispose();
            (c.material as THREE.Material | undefined)?.dispose();
          }
        }
      };
      removeFromScene(sightLineRef.current);
      sightLineRef.current = null;
      sightLineMatRef.current = null;
      removeFromScene(axisLineRef.current);
      axisLineRef.current = null;
      axisLineMatRef.current = null;
    };
  }, [
    figures,
    selectedFigureId,
    node.compositionGuides?.sightLine,
    node.compositionGuides?.axisLine,
    node.cameraTarget?.x,
    node.cameraTarget?.y,
    node.cameraTarget?.z,
  ]);

  // 强制刷新渲染
  const forceRefresh = () => {
    setForceUpdateKey(k => k + 1);
  };

  // 重置相机
  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.setTheta(0.3);
      controlsRef.current.setPhi(0.8);
      controlsRef.current.update();
    }
    onUpdate({ yaw: 0, pitch: 0, fov: 60 });
    setDisplayInfo({ yaw: 0, pitch: 0, fov: 60 });
  };

  // 截图功能
  const captureCurrentView = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    // 截图时临时隐藏辅助元素（xyz 轴、网格、地面平面、TransformControls 操纵轴），
    // 渲染后恢复，不污染画面
    const helperToRestore: { obj: { visible: boolean }; wasVisible: boolean }[] = [];
    const helpersToHide: { visible: boolean }[] = [];
    if (axesRef.current) helpersToHide.push(axesRef.current);
    if (gridRef.current) helpersToHide.push(gridRef.current);
    if (groundRef.current) helpersToHide.push(groundRef.current);
    const tcHelper = transformControlsRef.current?.getHelper();
    if (tcHelper) helpersToHide.push(tcHelper as unknown as { visible: boolean });
    helpersToHide.forEach((h) => {
      helperToRestore.push({ obj: h, wasVisible: h.visible });
      h.visible = false;
    });

    try {
      renderer.render(scene, camera);
      const dataURL = renderer.domElement.toDataURL('image/png');
      const base64 = dataURL.split(',')[1];
      setFullscreenCapture({ type: 'single', base64 });
    } finally {
      helperToRestore.forEach(({ obj, wasVisible }) => {
        obj.visible = wasVisible;
      });
    }
  };

  /**
   * 全屏查看：双保险。
   *   1. CSS 全屏：把 canvas 移出节点 DOM，挂到 document.documentElement 的专用容器，
   *      用 fixed + 最大 z-index 覆盖整个视口；documentElement 不会被任何 transform 限制。
   *   2. 原生全屏（如果环境支持 requestFullscreen）：让浏览器把该容器独占全屏，
   *      彻底脱离任何外层 stacking context / overflow。
   */
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);

  const openFullscreen = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setFsFullscreenParams({ yaw: displayInfo.yaw, pitch: displayInfo.pitch, fov: displayInfo.fov });
    setIsFullscreen(true);
  };

  // 退出全屏
  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // 全屏 effect：管理 canvas 在"节点容器 / 全屏容器"之间的迁移
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!renderer || !camera || !scene) return;

    const dom = renderer.domElement;
    if (!dom) return;

    // 记录原 size/样式/父节点，退出时恢复
    const prevParent = dom.parentElement;
    const prevStyle = dom.getAttribute('style') ?? '';
    const prevWidth = dom.width;
    const prevHeight = dom.height;
    const prevAspect = camera.aspect;

    if (isFullscreen) {
      // 1) 创建/获取全屏容器，append 到 documentElement（比 body 更根级）
      let fsContainer = fullscreenContainerRef.current;
      if (!fsContainer) {
        fsContainer = document.createElement('div');
        fsContainer.setAttribute('data-director3d-fullscreen', 'true');
        fsContainer.style.cssText = [
          'position: fixed',
          'inset: 0',
          'width: 100vw',
          'height: 100vh',
          'z-index: 2147483647',  // 最大 int32
          'background: #000',
          'overflow: hidden',
          'margin: 0',
          'padding: 0',
        ].join(';');
        document.documentElement.appendChild(fsContainer);
        fullscreenContainerRef.current = fsContainer;
      } else if (!fsContainer.parentElement) {
        document.documentElement.appendChild(fsContainer);
      }
      fsContainer.style.display = 'block';

      // 2) 把 canvas 移入全屏容器
      if (dom.parentElement !== fsContainer) {
        fsContainer.appendChild(dom);
      }

      const onResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };
      onResize();
      dom.style.position = 'absolute';
      dom.style.top = '0';
      dom.style.left = '0';
      dom.style.width = '100%';
      dom.style.height = '100%';
      dom.style.borderRadius = '0';
      dom.style.cursor = 'grab';
      dom.tabIndex = 0;
      dom.focus();

      // 3) 尝试原生全屏（必须在 user gesture 内调用；这里是从点击进入，OK）
      //    失败时降级到 CSS 全屏（已有 fixed 容器覆盖视口）
      try {
        const reqFs =
          fsContainer.requestFullscreen ||
          (fsContainer as any).webkitRequestFullscreen ||
          (fsContainer as any).mozRequestFullScreen ||
          (fsContainer as any).msRequestFullscreen;
        if (reqFs) reqFs.call(fsContainer).catch(() => {});
      } catch {
        // 忽略：降级到 CSS 全屏
      }

      // 4) 原生全屏被浏览器主动退出时（比如用户按 Esc 退浏览器全屏）→ 同步 React 状态
      const onFsChange = () => {
        if (!document.fullscreenElement && isFullscreen) {
          setIsFullscreen(false);
        }
      };
      document.addEventListener('fullscreenchange', onFsChange);

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeFullscreen();
        }
      };
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('fullscreenchange', onFsChange);
        // 退出时主动退出原生全屏（如果还在的话）
        if (document.fullscreenElement && document.exitFullscreen) {
          try { document.exitFullscreen().catch(() => {}); } catch { /* ignore */ }
        }
      };
    } else {
      // 退出：恢复 size + 样式 + 父节点
      dom.setAttribute('style', prevStyle);
      if (prevParent && dom.parentElement !== prevParent) {
        prevParent.appendChild(dom);
      }
      // 隐藏全屏容器（不立即 remove，留待组件 unmount 时清理）
      if (fullscreenContainerRef.current) {
        fullscreenContainerRef.current.style.display = 'none';
      }
      renderer.setSize(prevWidth, prevHeight, false);
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
  }, [isFullscreen, closeFullscreen]);

  // 组件 unmount 时清理全屏容器 DOM
  useEffect(() => {
    return () => {
      if (fullscreenContainerRef.current) {
        fullscreenContainerRef.current.remove();
        fullscreenContainerRef.current = null;
      }
    };
  }, []);

  /**
   * 当前机位参数。
   * - 优先读 liveViewRef（拖动中最新值，"保存机位"用这个）
   * - node 端只在用户停止拖动后才同步，所以渲染时 fallback 到 node 也是安全的
   */
  const currentView = {
    yaw: liveViewRef.current.yaw || (node.yaw ?? 0),
    pitch: liveViewRef.current.pitch || (node.pitch ?? 0),
    fov: liveViewRef.current.fov || (node.fov ?? 60),
    cameraDistance: liveViewRef.current.cameraDistance || (node.cameraDistance ?? 60),
    cameraTarget: node.cameraTarget ?? { x: 0, y: 0, z: 0 },
  };

  /** 应用某个机位预设（点击列表项） */
  const applyCameraPreset = (preset: CameraPreset) => {
    controlsRef.current?.applyCameraView({
      yaw: preset.yaw,
      pitch: preset.pitch,
      fov: preset.fov,
      cameraDistance: preset.cameraDistance,
      cameraTarget: preset.cameraTarget,
    });
    setDisplayInfo({ yaw: preset.yaw, pitch: preset.pitch, fov: preset.fov });
    // 同步到 live（让用户再旋转后保存也不会跳回旧视角）
    liveViewRef.current = {
      yaw: preset.yaw,
      pitch: preset.pitch,
      fov: preset.fov,
      cameraDistance: preset.cameraDistance,
      cameraTarget: preset.cameraTarget,
    };
    viewDirtyRef.current = false;
    onUpdate({
      yaw: preset.yaw,
      pitch: preset.pitch,
      fov: preset.fov,
      cameraDistance: preset.cameraDistance,
      cameraTarget: preset.cameraTarget,
      activeCameraId: preset.id,
    });
  };

  /** 跳到一档预设景别（特写/近/中/全/远），保留当前 yaw/pitch */
  const applyShotPreset = (preset: (typeof CAMERA_SHOT_PRESETS)[number]) => {
    const target = { ...currentView, fov: preset.fov, cameraDistance: preset.cameraDistance };
    controlsRef.current?.applyCameraView(target);
    setDisplayInfo({ yaw: target.yaw, pitch: target.pitch, fov: target.fov });
    // 同步到 live
    liveViewRef.current = {
      yaw: target.yaw,
      pitch: target.pitch,
      fov: target.fov,
      cameraDistance: target.cameraDistance,
      cameraTarget: target.cameraTarget,
    };
    viewDirtyRef.current = false;
    onUpdate({ fov: target.fov, cameraDistance: target.cameraDistance });
  };

  /** 把当前机位保存为自定义预设（从 live view 读，永远是用户当前真实看到的视角） */
  const saveCurrentCamera = () => {
    const id = `cam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const v = liveViewRef.current;
    const preset: CameraPreset = {
      id,
      name: `机位 ${((node.cameras ?? []).length + 1).toString().padStart(2, '0')}`,
      kind: 'custom',
      yaw: v.yaw,
      pitch: v.pitch,
      fov: v.fov,
      cameraDistance: v.cameraDistance,
      cameraTarget: node.cameraTarget ?? { x: 0, y: 0, z: 0 },
      createdAt: Date.now(),
    };
    onUpdate({
      cameras: [...(node.cameras ?? []), preset],
      activeCameraId: id,
    });
  };

  const removeCameraPreset = (id: string) => {
    onUpdate({
      cameras: (node.cameras ?? []).filter((c) => c.id !== id),
      activeCameraId: node.activeCameraId === id ? null : node.activeCameraId,
    });
  };

  /** 命名机位 */
  const renameCameraPreset = (id: string, name: string) => {
    onUpdate({
      cameras: (node.cameras ?? []).map((c) => (c.id === id ? { ...c, name } : c)),
    });
  };

  /** AI 渲染：把当前机位 + 全景 + 站位打包为结构化 prompt，预填到一个新建的 i2i 节点里 */
  const renderWithAI = () => {
    if (!onCreateI2iSeed) {
      window.alert('该节点暂未挂接 AI 渲染出口。');
      return;
    }
    if (!hasBackgroundMedia) {
      window.alert('请先导入或吸取一张 720° 全景背景图。');
      return;
    }
    const shotName = node.activeCameraId
      ? (node.cameras ?? []).find((c) => c.id === node.activeCameraId)?.name ?? '自定义机位'
      : '当前视角';
    // 找与当前 fov/cameraDistance 最接近的预设以决定 aspectRatio
    const matchedShot =
      CAMERA_SHOT_PRESETS.find(
        (s) => s.fov === currentView.fov && s.cameraDistance === currentView.cameraDistance
      ) ?? null;
    const aspectRatio = matchedShot?.aspectRatio ?? '16:9';
    const envType = node.environmentType ?? 'sphere';
    const envName = ENVIRONMENT_OPTIONS.find((e) => e.id === envType)?.name ?? '球形墙';
    const prompt = buildRenderPrompt(
      shotName,
      currentView.fov,
      currentView.yaw,
      currentView.pitch,
      currentView.cameraDistance,
      figures,
      hasBackgroundMedia,
      envType,
      envName
    );
    onCreateI2iSeed({
      image: backgroundImage,
      prompt,
      aspectRatio,
      nodeX: node.x + node.width + 40,
      nodeY: node.y,
    });
  };

  /** 构图辅助线开关 */
  const guides = node.compositionGuides ?? {};
  const toggleGuide = (key: keyof NonNullable<Director3DNode['compositionGuides']>) => {
    onUpdate({
      compositionGuides: { ...guides, [key]: !guides[key] },
    });
  };

  // 添加角色 - 默认用内置人偶（modelType='preset'）；GLB 上传走单独入口
  // name 留空，由渲染端按 index 兜底为「角色A / 角色B / 角色C …」
  const addFigure = () => {
    const presetIndex = figures.length % PERSON_PRESETS.length;
    const preset = PERSON_PRESETS[presetIndex];
    const newFigure: Figure3D = {
      id: `figure-${Date.now()}`,
      name: '',
      image: '',
      x: 50, // 场景中心
      y: 50, // 场景中心
      scale: 1, // 默认 1:1（人偶约 8.6 单位高，与 1000x1000 网格比例协调）
      rotation: 0,
      presetId: preset.id,
      poseId: FIGURE_POSES[0].id,
      modelType: 'preset',
    };
    onUpdate({ figures: [...figures, newFigure] });
  };

  // 上传 .glb / .gltf 作为角色模型
  const addFigureFromGlbFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '');
      const base64 = dataUrl.split(',')[1] ?? '';
      if (!base64) {
        window.alert('读取 GLB 文件失败。');
        return;
      }
      const newFigure: Figure3D = {
        id: `figure-${Date.now()}`,
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
        image: base64,
        x: 50,
        y: 50,
        scale: 1.4,  // GLB 已 normalize 到 7 单位高，scale=1.4 ≈ 10 单位，与 preset scale=2 接近
        rotation: 0,
        modelType: 'glb',
        // GLB 模型没有"姿势 / 预设"概念，填占位
        presetId: PERSON_PRESETS[0].id,
        poseId: FIGURE_POSES[0].id,
      };
      onUpdate({ figures: [...figures, newFigure] });
    };
    reader.onerror = () => {
      window.alert('读取 GLB 文件失败。');
    };
    reader.readAsDataURL(file);
  };

  /** 触发"上传 GLB" 隐藏 input */
  const glbFileInputRef = useRef<HTMLInputElement>(null);
  const onPickGlbFile = () => {
    glbFileInputRef.current?.click();
  };
  const onGlbFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addFigureFromGlbFile(file);
    // 允许同名再次上传
    e.target.value = '';
  };

  // 选择小人
  const selectFigure = (figureId: string) => {
    setSelectedFigureId(selectedFigureId === figureId ? null : figureId);
  };

  // 删除小人
  const deleteFigure = (figureId: string) => {
    const group = figuresRef.current.get(figureId);
    if (group && sceneRef.current) {
      sceneRef.current.remove(group);
      figuresRef.current.delete(figureId);
    }
    onUpdate({ figures: figures.filter(f => f.id !== figureId) });
    if (selectedFigureId === figureId) {
      setSelectedFigureId(null);
    }
  };

  // 更新小人属性
  const updateFigure = (figureId: string, updates: Partial<Figure3D>) => {
    onUpdate({ figures: figures.map(f => f.id === figureId ? { ...f, ...updates } : f) });
  };

  const selectedFigure = figures.find(f => f.id === selectedFigureId);

  // 全屏浮层：用 portal 渲染到 documentElement 下的全屏容器内（不依赖节点 React 树）
  const fullscreenOverlay = isFullscreen && fullscreenContainerRef.current
    ? createPortal(
        <div className="absolute top-4 right-4 z-[10] flex items-center gap-2 pointer-events-none">
          <div className="px-3 py-1.5 rounded bg-black/70 text-white text-[12px] backdrop-blur-sm pointer-events-none">
            全屏模式 · 按 Esc 或点右侧按钮退出
          </div>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              closeFullscreen();
            }}
            onClick={(e) => {
              e.stopPropagation();
              closeFullscreen();
            }}
            className="px-3 py-1.5 rounded bg-pink-600 hover:bg-pink-500 text-white text-[12px] shadow-lg pointer-events-auto"
            title="退出全屏 (Esc)"
          >
            退出全屏
          </button>
        </div>,
        fullscreenContainerRef.current
      )
    : null;

  return (
    <div className="flex flex-col h-full min-h-0 gap-2 p-3 overflow-y-auto">
      {fullscreenOverlay}

      {/* 3D场景预览 - 默认显示网格地面 */}
      <div
        ref={containerRef}
        className="relative w-full aspect-video min-h-[220px] rounded-lg border border-[#333] overflow-hidden shrink-0 bg-[#3A3A3A]"
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 视角指示器 */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white backdrop-blur-sm z-30 pointer-events-none flex items-center gap-1">
          <ViewIcon size={10} /> 视角: {displayInfo.yaw.toFixed(0)}° / {displayInfo.pitch.toFixed(0)}°
        </div>

        {/* 操作提示 */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-[10px] text-gray-300 backdrop-blur-sm z-30 pointer-events-none flex flex-col items-end gap-1">
          <span>左键旋转 | 右键平移 | 滚轮缩放</span>
          {selectedFigureId && (
            <span className="text-yellow-400">G移动 | R旋转 | S缩放</span>
          )}
          {/* 变换模式切换 */}
          <div className="flex gap-1">
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('translate'); }}
              className={`pointer-events-auto px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'translate' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="移动模式"
            >
              移动
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('rotate'); }}
              className={`pointer-events-auto px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'rotate' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="旋转模式"
            >
              旋转
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('scale'); }}
              className={`pointer-events-auto px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'scale' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="缩放模式"
            >
              缩放
            </button>
          </div>
        </div>

        {/* 全屏按钮 */}
        <button
          onPointerDown={(e) => { e.stopPropagation(); openFullscreen(); }}
          className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm z-30 cursor-pointer"
          title="全屏查看"
        >
          <FullscreenIcon size={14} />
        </button>

        {/* 角色数量提示 */}
        {figures.length > 0 && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-pink-300 backdrop-blur-sm z-30 pointer-events-none flex items-center gap-1">
            <PersonIcon size={10} /> {figures.length}个角色 | 点击选中后用轴操作
          </div>
        )}

        {/* 构图辅助线：三分法 / 安全区（pointer-events: none 避免影响 3D 操作） */}
        {(guides.ruleOfThirds || guides.safeArea) && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {guides.ruleOfThirds && (
              <g stroke="rgba(255,255,255,0.45)" strokeWidth="0.2" fill="none">
                <line x1="33.333" y1="0" x2="33.333" y2="100" />
                <line x1="66.666" y1="0" x2="66.666" y2="100" />
                <line x1="0" y1="33.333" x2="100" y2="33.333" />
                <line x1="0" y1="66.666" x2="100" y2="66.666" />
              </g>
            )}
            {guides.safeArea && (
              <g stroke="rgba(255,220,80,0.5)" strokeWidth="0.2" strokeDasharray="1.2 1.2" fill="none">
                <rect x="5" y="5" width="90" height="90" />
              </g>
            )}
          </svg>
        )}
      </div>

      {/* 机位栏：5 档预设景别 + 自定义机位保存/应用 */}
      <div className="border border-[#333] rounded-lg p-2 bg-[#1a1a1a] flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">机位</span>
          <div className="flex gap-1">
            {CAMERA_SHOT_PRESETS.map((s) => {
              const active = s.fov === currentView.fov && s.cameraDistance === currentView.cameraDistance;
              return (
                <button
                  key={s.kind}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => applyShotPreset(s)}
                  className={`py-0.5 px-1.5 rounded text-[10px] ${
                    active
                      ? 'bg-pink-600 text-white'
                      : 'bg-[#333] hover:bg-[#444] text-gray-300'
                  }`}
                  title={`${s.name}：FOV ${s.fov}°、距离 ${s.cameraDistance}、出图建议 ${s.aspectRatio}`}
                >
                  {s.name}
                </button>
              );
            })}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={saveCurrentCamera}
              className="py-0.5 px-1.5 rounded text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white"
              title="保存当前机位为自定义预设"
            >
              保存机位
            </button>
          </div>
        </div>

        {(node.cameras ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {(node.cameras ?? []).map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-[10px] cursor-pointer ${
                  node.activeCameraId === c.id
                    ? 'bg-pink-600/30 border border-pink-500/60 text-pink-200'
                    : 'bg-[#252525] hover:bg-[#333] border border-transparent text-gray-300'
                }`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  applyCameraPreset(c);
                }}
              >
                <input
                  className="bg-transparent outline-none w-16 text-[10px]"
                  value={c.name}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => renameCameraPreset(c.id, e.target.value)}
                />
                <span className="text-[9px] text-gray-500">
                  {c.fov}°/{Math.round(c.cameraDistance)}
                </span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCameraPreset(c.id);
                  }}
                  className="ml-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100"
                  title="删除机位"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* 构图辅助 + AI 渲染 */}
      <div className="border border-[#333] rounded-lg p-2 bg-[#1a1a1a] flex flex-col gap-1.5">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 mr-1">构图</span>
            {(
              [
                ['ruleOfThirds', '三分法'],
                ['safeArea', '安全区'],
                ['sightLine', '视线'],
                ['axisLine', '轴线'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => toggleGuide(key)}
                className={`py-0.5 px-1.5 rounded text-[10px] ${
                  guides[key] ? 'bg-pink-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'
                }`}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={renderWithAI}
            disabled={!hasBackgroundMedia}
            className="py-0.5 px-2 rounded text-[10px] bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              hasBackgroundMedia
                ? '把当前机位 + 全景 + 站位打包成结构化 prompt，在右侧创建一个图生图节点'
                : '请先导入或吸取全景背景图'
            }
          >
            <SparklesIcon size={10} /> AI 渲染
          </button>
        </div>
        {guides.sightLine && selectedFigure ? (
          <p className="text-[10px] text-pink-300/80">
            视线：选中角色「{selectedFigure.name}」将在 3D 场景中绘制朝向目标的视线（占位提示，后续接入）
          </p>
        ) : null}
      </div>

      {/* 全景环境墙选择：球形 / 照片墙 / 7字 / U字 / O字 / 圆圈墙 */}
      <div className="border border-[#333] rounded-lg p-2 bg-[#1a1a1a] flex flex-col gap-1.5">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-[10px] text-gray-400">全景环境</span>
          <div className="flex flex-wrap gap-1">
            {ENVIRONMENT_OPTIONS.map((env) => {
              const active = (node.environmentType ?? 'sphere') === env.id;
              return (
                <button
                  key={env.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onUpdate({ environmentType: env.id })}
                  className={`py-0.5 px-1.5 rounded text-[10px] ${
                    active
                      ? 'bg-cyan-600 text-white'
                      : 'bg-[#333] hover:bg-[#444] text-gray-300'
                  }`}
                  title={env.description}
                >
                  {env.name}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] text-gray-500 leading-snug">
          {ENVIRONMENT_OPTIONS.find((e) => e.id === (node.environmentType ?? 'sphere'))?.description}
        </p>
      </div>

      {/* 控制按钮 */}
      <div className="flex gap-1">
        <button
          onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
          className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
          title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取背景图片"}
        >
          <EyedropperIcon size={10} /> 吸管
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const base64 = (ev.target?.result as string).split(',')[1];
                  onUpdate({ backgroundImage: base64 });
                };
                reader.readAsDataURL(file);
              }
            };
            input.click();
          }}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 flex items-center justify-center gap-1"
        >
          <ImageIcon size={10} /> 导入背景
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onCopyToImage?.()}
          disabled={!hasBackgroundMedia || !onCopyToImage}
          className="py-1 px-2 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="复制背景图为新图片节点"
        >
          <CopyIcon size={10} /> 复制
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={resetCamera}
          className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
          title="重置视角"
        >
          重置
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={forceRefresh}
          className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300"
          title="刷新渲染"
        >
          刷新
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowAxes((v) => !v)}
          className={`py-1 px-2 rounded text-[10px] ${showAxes ? 'bg-pink-600 text-white' : 'bg-[#333] text-gray-300 hover:bg-[#444]'}`}
          title={showAxes ? '隐藏 xyz 轴线（截图前必关）' : '显示 xyz 轴线（默认显示，方便对齐）'}
        >
          轴线
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowGrid((v) => !v)}
          className={`py-1 px-2 rounded text-[10px] ${showGrid ? 'bg-pink-600 text-white' : 'bg-[#333] text-gray-300 hover:bg-[#444]'}`}
          title={showGrid ? '隐藏角色底部网格' : '显示角色底部网格（默认隐藏，方便看全景）'}
        >
          网格
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShowGround((v) => !v)}
          className={`py-1 px-2 rounded text-[10px] ${showGround ? 'bg-pink-600 text-white' : 'bg-[#333] text-gray-300 hover:bg-[#444]'}`}
          title={showGround ? '隐藏角色脚底地面平面' : '显示角色脚底地面平面（默认隐藏，方便看全景）'}
        >
          地面
        </button>
      </div>

      {/* 小人管理区 */}
      <div className="border border-[#333] rounded-lg p-2 bg-[#1a1a1a]">
        <div className="flex items-center justify-between mb-2 gap-1">
          <span className="text-xs text-gray-300 font-medium flex items-center gap-1">
            <PersonIcon size={12} /> 角色管理 ({figures.length})
          </span>
          <div className="flex items-center gap-1">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={addFigure}
              className="py-1 px-2 rounded text-[10px] bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1"
              title="添加内置人物预设"
            >
              <PlusIcon size={10} /> 角色
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onPickGlbFile}
              className="py-1 px-2 rounded text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white flex items-center gap-1"
              title="上传 .glb / .gltf 自定义 3D 模型"
            >
              <ImageIcon size={10} /> GLB
            </button>
            <input
              ref={glbFileInputRef}
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              style={{ display: 'none' }}
              onChange={onGlbFileChange}
            />
          </div>
        </div>

        {/* 角色列表 */}
        {figures.length > 0 ? (
          <div className="space-y-1 overflow-y-auto">
            {figures.map((figure, idx) => {
              const isSelected = selectedFigureId === figure.id;
              const displayName = figure.name || `角色${indexToCharLabel(idx)}`;
              return (
                <div
                  key={figure.id}
                  className={`group flex items-center gap-2 p-1.5 rounded cursor-pointer ${isSelected ? 'bg-pink-600/30 border border-pink-500/50' : 'bg-[#252525] hover:bg-[#333]'}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectFigure(figure.id);
                  }}
                >
                  <div className="w-8 h-8 rounded border border-[#444] bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white">
                    <PersonIcon size={16} />
                  </div>
                  <span className="flex-1 text-[10px] text-gray-300 truncate">{displayName}</span>

                  {/* 操作按钮：选中时一直显示，否则 hover 时显示 */}
                  <div className={`flex items-center gap-1 ${isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { scale: Math.max(0.2, (figure.scale || 1) - 0.1) });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="缩小"
                    >
                      -
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { scale: Math.min(3, (figure.scale || 1) + 0.1) });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="放大"
                    >
                      +
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { rotation: ((figure.rotation || 0) - 15) % 360 });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="左旋转15度"
                    >
                      ↺
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        updateFigure(figure.id, { rotation: ((figure.rotation || 0) + 15) % 360 });
                      }}
                      className="p-1 rounded bg-[#444] hover:bg-[#555] text-white text-[10px]"
                      title="右旋转15度"
                    >
                      ↻
                    </button>
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        deleteFigure(figure.id);
                      }}
                      className="p-1.5 rounded bg-red-600/50 hover:bg-red-500 text-white"
                      title="删除角色"
                    >
                      <DeleteIcon size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 text-center py-2">
            暂无角色，点击"添加角色"创建3D人物
          </div>
        )}

        {/* 选中角色的详细信息 */}
        {selectedFigure && (
          <div className="mt-2 pt-2 border-t border-[#333] space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">名称:</label>
              <input
                type="text"
                value={selectedFigure.name}
                placeholder={(() => {
                  // 用 figures 数组的索引作为默认名兜底显示在 placeholder
                  const idx = figures.findIndex((f) => f.id === selectedFigure.id);
                  return `角色${indexToCharLabel(idx)}`;
                })()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { name: e.target.value })}
                className="flex-1 bg-[#252525] text-gray-200 text-[10px] px-2 py-1 rounded border border-[#333] focus:outline-none focus:border-pink-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">缩放:</label>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={selectedFigure.scale}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { scale: parseFloat(e.target.value) })}
                className="flex-1 accent-pink-500"
              />
              <span className="text-[10px] text-gray-400 w-10 text-right">{selectedFigure.scale.toFixed(1)}x</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">旋转:</label>
              <input
                type="range"
                min="-180"
                max="180"
                step="1"
                value={selectedFigure.rotation}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { rotation: parseInt(e.target.value) })}
                className="flex-1 accent-pink-500"
              />
              <span className="text-[10px] text-gray-400 w-10 text-right">{selectedFigure.rotation}°</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">预设:</label>
              <select
                value={selectedFigure.presetId ?? PERSON_PRESETS[0].id}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { presetId: e.target.value })}
                className="flex-1 bg-[#252525] text-gray-200 text-[10px] px-2 py-1 rounded border border-[#333] focus:outline-none focus:border-pink-500"
              >
                {PERSON_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-400 w-12">姿势:</label>
              <select
                value={selectedFigure.poseId ?? FIGURE_POSES[0].id}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => updateFigure(selectedFigure.id, { poseId: e.target.value })}
                className="flex-1 bg-[#252525] text-gray-200 text-[10px] px-2 py-1 rounded border border-[#333] focus:outline-none focus:border-pink-500"
              >
                {FIGURE_POSES.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 截图功能 */}
      <div className="flex gap-1">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={captureCurrentView}
          className="flex-1 py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white"
        >
          截图
        </button>
      </div>
    </div>
  );
}
