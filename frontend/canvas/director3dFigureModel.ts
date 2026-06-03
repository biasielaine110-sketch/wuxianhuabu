import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 加载用户上传的 .glb / .gltf 作为角色模型。
 * - 走 three.js 内置 GLTFLoader；
 * - 加载失败抛错（catch 后调用方 alert）；
 * - 返回 root Group，caller 负责挂到 scene 和 dispose。
 */
export async function loadFigureModelFromFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<THREE.Group> {
  const arrayBuffer = await file.arrayBuffer();
  return new Promise<THREE.Group>((resolve, reject) => {
    const loader = new GLTFLoader();
    const onLoad = (gltf: { scene?: THREE.Group; scenes?: THREE.Group[] }) => {
      const root = gltf.scene ?? gltf.scenes?.[0];
      if (!root) {
        reject(new Error('GLB/GLTF 文件不包含可用的 scene'));
        return;
      }
      // 归一化：让模型站到 y=0 平面，并按身高约 7 个世界单位 scale
      normalizeFigureModel(root);
      resolve(root);
    };
    const onError = (err: unknown) => reject(err);
    // 不同版本的 three.js GLTFLoader.parse 参数顺序略有差异 —— 用 any 兼容
    const args: unknown[] = [arrayBuffer, '', onLoad, onError];
    if (onProgress) args.push(() => onProgress(1));
    (loader as unknown as { parse: (...a: unknown[]) => void }).parse(...args);
  });
}

/**
 * 归一化模型：放到 y=0、缩放到 ~targetHeight 单位高、center 到原点（XZ）
 *
 * 关键：先 scale（只动 root.scale，不动 position），再重新计算
 * 缩放后世界的 box，最后用世界坐标把 root 平移到 y=0 + xz 居中。
 * 这样无论原模型多大，最终 mesh 的世界 minY 一定 = 0，不会被
 * 推高成「浮空」。
 */
export function normalizeFigureModel(root: THREE.Object3D, targetHeight = 7): void {
  // 1) 先按原始 box 决定 scale
  const box0 = new THREE.Box3().setFromObject(root);
  const size0 = new THREE.Vector3();
  box0.getSize(size0);
  if (size0.y > 0 && Number.isFinite(size0.y)) {
    const s = targetHeight / size0.y;
    root.scale.multiplyScalar(s);
  }
  // 注意：此时 root.position 还没改；box0 也是缩放前算的，下面要重新算

  // 2) 重新算缩放后的世界 box（root 还在原点，scale 已改）
  //    需要先 updateMatrixWorld 才能拿准确的世界 box
  root.updateMatrixWorld(true);
  const box1 = new THREE.Box3().setFromObject(root);
  const minY = box1.min.y;
  const center1 = new THREE.Vector3();
  box1.getCenter(center1);

  // 3) 用世界 box 把 root 平移，让 mesh 的世界 y 起点 = 0、xz 中心 = 0
  root.position.x -= center1.x;
  root.position.y -= minY;
  root.position.z -= center1.z;

  // 4) 启用阴影
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      // 让加载的模型也能被 raycaster 选中（与"内置人偶"一致）
      obj.userData.isFigurePart = true;
    }
  });
}

/**
 * 释放 GLB 加载的模型资源：递归 dispose 所有 geometry / material / texture
 */
export function disposeFigureModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((mm) => disposeMaterialDeep(mm));
      else if (m) disposeMaterialDeep(m);
    } else if (obj instanceof THREE.Sprite) {
      const sm = obj.material as THREE.SpriteMaterial;
      sm.map?.dispose();
      sm.dispose();
    }
  });
}

function disposeMaterialDeep(material: THREE.Material) {
  // 处理常见带贴图的材质
  const anyMat = material as unknown as Record<string, unknown>;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
    const tex = anyMat[key];
    if (tex && tex instanceof THREE.Texture) tex.dispose();
  }
  material.dispose();
}
