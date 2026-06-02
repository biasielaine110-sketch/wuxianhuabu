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
 * 归一化模型：放到 y=0、缩放到 ~7 单位高、center 到原点（XZ）
 * - 拿到 bounding box 后调整 position + scale
 */
export function normalizeFigureModel(root: THREE.Object3D, targetHeight = 7): void {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // 先把 root 摆到 y=0 平面（最小 y = 0）
  const minY = box.min.y;
  // 再把 xz 中心移到 (0, 0, 0)
  const cx = center.x;
  const cz = center.z;
  root.position.x -= cx;
  root.position.y -= minY;
  root.position.z -= cz;

  // 缩放到目标身高
  if (size.y > 0 && Number.isFinite(size.y)) {
    const s = targetHeight / size.y;
    root.scale.multiplyScalar(s);
  }

  // 启用阴影
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
