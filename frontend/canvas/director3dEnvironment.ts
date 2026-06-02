import * as THREE from 'three';
import type { EnvironmentType } from '../types';

/**
 * 环境墙的几何抽象
 *  - root: 容器 Group，添加到 scene 上统一清理
 *  - skyMaterial / groundMaterial: 复用同一组材质，便于切换纹理
 */
export interface EnvironmentWall {
  root: THREE.Group;
  skyMaterial: THREE.MeshBasicMaterial;
  groundMaterial: THREE.MeshStandardMaterial;
}

const ENV_RADIUS = 900; // 球形墙的远端半径
const WALL_HEIGHT = 320; // 平面墙的高度（场景单位）
const WALL_RADIUS = 220; // 圆圈墙的半径

/**
 * 按类型构造全景环境墙
 * - sphere: 720° 球形穹顶
 * - photoWall: 前方一面 360° 弧形墙
 * - sevenWall: 7 字墙 = 前 1 + 后 1 两面墙
 * - threeWall: U 字墙 = 前、左、右 3 面墙
 * - fourWall: O 字墙 = 前、后、左、右 4 面墙
 * - circleWall: 圆筒墙 = 360° 圆柱侧
 */
export function createEnvironmentWall(envType: EnvironmentType): EnvironmentWall {
  const root = new THREE.Group();
  root.userData = { isEnvironmentWall: true };

  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0x2f2f2f,
    side: THREE.DoubleSide,
  });
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2b2b,
    roughness: 0.95,
    metalness: 0.02,
  });

  switch (envType) {
    case 'sphere':
      addSphereDome(root, skyMaterial);
      break;
    case 'photoWall':
      addArcWall(root, skyMaterial, 0, 360, WALL_RADIUS, WALL_HEIGHT);
      break;
    case 'sevenWall':
      // 7 字 = 前 1（+Z 向）+ 后 1（-Z 向）
      addPlaneWall(root, skyMaterial, 0, WALL_RADIUS, WALL_HEIGHT, 'front');
      addPlaneWall(root, skyMaterial, Math.PI, WALL_RADIUS, WALL_HEIGHT, 'back');
      break;
    case 'threeWall':
      // U 字 = 左 + 前 + 右
      addPlaneWall(root, skyMaterial, -Math.PI / 2, WALL_RADIUS, WALL_HEIGHT, 'left');
      addPlaneWall(root, skyMaterial, 0, WALL_RADIUS, WALL_HEIGHT, 'front');
      addPlaneWall(root, skyMaterial, Math.PI / 2, WALL_RADIUS, WALL_HEIGHT, 'right');
      break;
    case 'fourWall':
      // O 字 = 前 + 后 + 左 + 右
      addPlaneWall(root, skyMaterial, 0, WALL_RADIUS, WALL_HEIGHT, 'front');
      addPlaneWall(root, skyMaterial, Math.PI, WALL_RADIUS, WALL_HEIGHT, 'back');
      addPlaneWall(root, skyMaterial, -Math.PI / 2, WALL_RADIUS, WALL_HEIGHT, 'left');
      addPlaneWall(root, skyMaterial, Math.PI / 2, WALL_RADIUS, WALL_HEIGHT, 'right');
      break;
    case 'circleWall':
      addCylinderWall(root, skyMaterial, WALL_RADIUS, WALL_HEIGHT);
      break;
  }

  return { root, skyMaterial, groundMaterial };
}

/** 球形穹顶：贴图时 backSide，让相机在内部可见 */
function addSphereDome(root: THREE.Group, skyMaterial: THREE.MeshBasicMaterial) {
  const geom = new THREE.SphereGeometry(ENV_RADIUS, 64, 40);
  geom.scale(-1, 1, 1); // 翻转法线 → 内部观察
  // 球壳单独用 BackSide
  const mat = skyMaterial.clone();
  mat.side = THREE.BackSide;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData = { isEnvSky: true };
  root.add(mesh);
}

/** 360° 弧形墙（照片墙） */
function addArcWall(
  root: THREE.Group,
  skyMaterial: THREE.MeshBasicMaterial,
  startAngle: number,
  arcDeg: number,
  radius: number,
  height: number
) {
  const arcRad = (arcDeg * Math.PI) / 180;
  const segments = Math.max(24, Math.floor(arcDeg / 6));
  const width = 2 * radius * Math.sin(arcRad / 2);
  const geom = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    segments,
    1,
    true,
    startAngle,
    arcRad
  );
  // 双面，可见内外
  const mat = skyMaterial.clone();
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = height / 2;
  mesh.userData = { isEnvSky: true, wallKind: 'arc' };
  root.add(mesh);
}

/** 单面平面墙：rotateY 决定朝向 */
function addPlaneWall(
  root: THREE.Group,
  skyMaterial: THREE.MeshBasicMaterial,
  rotateY: number,
  distance: number,
  height: number,
  kind: 'front' | 'back' | 'left' | 'right'
) {
  const width = 2 * distance * 0.95; // 让墙宽接近直径
  const geom = new THREE.PlaneGeometry(width, height);
  const mat = skyMaterial.clone();
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.y = rotateY;
  // 把墙放在距中心 distance 处，朝向中心
  mesh.position.set(0, height / 2, -distance);
  mesh.userData = { isEnvSky: true, wallKind: kind };
  root.add(mesh);
}

/** 圆柱侧（圆圈墙） */
function addCylinderWall(root: THREE.Group, skyMaterial: THREE.MeshBasicMaterial, radius: number, height: number) {
  const geom = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
  const mat = skyMaterial.clone();
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = height / 2;
  mesh.userData = { isEnvSky: true, wallKind: 'cylinder' };
  root.add(mesh);
}

/** 清理一个环境墙（释放其内部所有 geometry/material） */
export function disposeEnvironmentWall(wall: EnvironmentWall | null) {
  if (!wall) return;
  wall.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m?.dispose();
    }
  });
  // 主 material（groundMaterial）也要 dispose
  wall.groundMaterial.dispose();
}
