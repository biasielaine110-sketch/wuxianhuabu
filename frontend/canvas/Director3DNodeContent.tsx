import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { devLog } from './devLog';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { CanvasNode, Director3DNode, Figure3D } from '../types';
import {
  DeleteIcon,
  EyedropperIcon,
  FullscreenIcon,
  ImageIcon,
  PersonIcon,
  PlusIcon,
  ViewIcon,
} from './canvasIcons';

export interface Director3DNodeContentProps {
  node: Director3DNode;
  nodes: CanvasNode[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onUpdate: (updates: Partial<Director3DNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
}
export function Director3DNodeContent({ node, nodes, eyedropperTargetNodeId, onEyedropperSelect, onUpdate, onCreateImageNode }: Director3DNodeContentProps) {
  const figurePalette = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
  const buildFigureColor = (index: number) => figurePalette[index % figurePalette.length];
  const buildFigureLabelSprite = (labelText: string, color: string) => {
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
    sprite.userData = { isFigureLabel: true };
    return sprite;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const groundMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const groundTextureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number>(0);
  const currentImageRef = useRef<string>('');
  const figuresRef = useRef<Map<string, THREE.Group>>(new Map());
  const nodeRef = useRef(node);
  nodeRef.current = node; // 保持 ref 同步
  const [forceUpdateKey, setForceUpdateKey] = useState(0);
  const [displayInfo, setDisplayInfo] = useState({ yaw: 0, pitch: 0, fov: 75 });
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
      camera.position.set(0, 25, 50);
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
      scene.add(gridHelper);
      gridRef.current = gridHelper;

      const axesHelper = new THREE.AxesHelper(50);
      scene.add(axesHelper);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(50, 100, 50);
      scene.add(directionalLight);

      // 720全景图背景（天空穹顶）
      const skyGeometry = new THREE.SphereGeometry(900, 64, 40);
      skyGeometry.scale(-1, 1, 1);
      const skyMaterial = new THREE.MeshBasicMaterial({
        color: 0x2f2f2f,
        side: THREE.BackSide,
      });
      const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
      scene.add(skyMesh);
      sphereRef.current = skyMesh;
      materialRef.current = skyMaterial;

      // 720全景图地面（使用全景图下半部分纹理）
      const groundGeometry = new THREE.CircleGeometry(500, 72);
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b2b2b,
        roughness: 0.95,
        metalness: 0.02,
      });
      const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = -0.05;
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
      let theta = 0.3;
      let phi = 0.8;
      let cameraDistance = 60;
      let cameraTarget = new THREE.Vector3(0, 0, 0);

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
          const panSpeed = 0.1;
          cameraTarget.x -= dx * panSpeed * (cameraDistance / 100);
          cameraTarget.z -= dy * panSpeed * (cameraDistance / 100);
          updateCamera();
        } else if (isDragging) {
          theta -= dx * 0.01;
          phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, phi + dy * 0.01));
          updateCamera();

          const yawDeg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
          const pitchDeg = 90 - (phi * 180 / Math.PI);
          setDisplayInfo({ yaw: yawDeg, pitch: pitchDeg, fov: nodeRef.current.fov ?? 60 });
        }

        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseUp = () => {
        isDragging = false;
        isPanning = false;
        isDraggingFigureRef.current = false;
        draggingFigureIdRef.current = null;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        cameraDistance = Math.max(10, Math.min(200, cameraDistance + e.deltaY * 0.05));
        updateCamera();
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
        setPhi: (p: number) => { phi = p; }
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
      skyTexture.generateMipmaps = false;
      skyTexture.needsUpdate = true;
      textureRef.current = skyTexture;

      skyMaterial.map = skyTexture;
      skyMaterial.color.setHex(0xffffff);
      skyMaterial.needsUpdate = true;
      scene.background = skyTexture;

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

    // 删除不存在的角色
    figuresRef.current.forEach((group, id) => {
      if (!currentFigureIds.has(id)) {
        console.log('删除角色:', id, '原因: 不在currentFigures中');
        scene.remove(group);
        figuresRef.current.delete(id);
      }
    });

    // 添加或更新角色
    currentFigures.forEach((figure, index) => {
      const figureColor = new THREE.Color(buildFigureColor(index));
      const labelText = figure.name || `角色${index + 1}`;
      if (figuresRef.current.has(figure.id)) {
        // 检查是否正被TransformControls控制，如果是则跳过位置更新
        const tc = transformControlsRef.current;
        const controlledGroup = tc?.object as THREE.Group | undefined;
        const isControlled = controlledGroup?.userData?.figureId === figure.id;

        // 更新现有角色（但不在TransformControls控制时更新位置）
        const group = figuresRef.current.get(figure.id)!;
        if (!isControlled) {
          group.rotation.y = (figure.rotation || 0) * Math.PI / 180;
          group.scale.setScalar(figure.scale || 1);

          // 将网格坐标转换为世界坐标
          const worldX = (figure.x / 100) * 1000 - 500;
          const worldZ = (figure.y / 100) * 1000 - 500;
          group.position.set(worldX, 0, worldZ);
        }

        // 更新角色颜色、编号标签和选中状态
        group.traverse((child) => {
          if (child.userData?.isFigureLabel && child instanceof THREE.Sprite) {
            const mat = child.material as THREE.SpriteMaterial;
            mat.map?.dispose();
            mat.dispose();
            group.remove(child);
            return;
          }
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            (child.material as THREE.MeshStandardMaterial).color.copy(figureColor);
            if (selectedFigureId === figure.id) {
              (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x444444);
            } else {
              (child.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            }
          }
        });
        const labelSprite = buildFigureLabelSprite(labelText, `#${figureColor.getHexString()}`);
        if (labelSprite) group.add(labelSprite);
      } else {
        // 创建新角色 - 尺寸更大，有光照效果
        const group = new THREE.Group();
        group.userData = { figureId: figure.id, isFigure: true };

        const material = new THREE.MeshStandardMaterial({
          color: figureColor,
          roughness: 0.5,
          metalness: 0.3,
          emissive: 0x000000
        });

        // 头部 - 放大约3倍
        const headGeometry = new THREE.SphereGeometry(1.5, 24, 24);
        const head = new THREE.Mesh(headGeometry, material.clone());
        head.position.y = 6;
        head.userData = { figureId: figure.id, isFigurePart: true };
        group.add(head);

        // 身体 - 放大约3倍
        const bodyGeometry = new THREE.BoxGeometry(2.5, 4, 1.2);
        const body = new THREE.Mesh(bodyGeometry, material.clone());
        body.position.y = 3;
        body.userData = { figureId: figure.id, isFigurePart: true };
        group.add(body);

        // 左手臂
        const armGeometry = new THREE.BoxGeometry(0.6, 3, 0.6);
        const leftArm = new THREE.Mesh(armGeometry, material.clone());
        leftArm.position.set(-1.8, 3, 0);
        leftArm.userData = { figureId: figure.id, isFigurePart: true };
        group.add(leftArm);

        // 右手臂
        const rightArm = new THREE.Mesh(armGeometry, material.clone());
        rightArm.position.set(1.8, 3, 0);
        rightArm.userData = { figureId: figure.id, isFigurePart: true };
        group.add(rightArm);

        // 左腿
        const legGeometry = new THREE.BoxGeometry(0.8, 3.5, 0.8);
        const leftLeg = new THREE.Mesh(legGeometry, material.clone());
        leftLeg.position.set(-0.6, 0.75, 0);
        leftLeg.userData = { figureId: figure.id, isFigurePart: true };
        group.add(leftLeg);

        // 右腿
        const rightLeg = new THREE.Mesh(legGeometry, material.clone());
        rightLeg.position.set(0.6, 0.75, 0);
        rightLeg.userData = { figureId: figure.id, isFigurePart: true };
        group.add(rightLeg);

        // 设置位置和旋转
        group.rotation.y = (figure.rotation || 0) * Math.PI / 180;
        group.scale.setScalar(figure.scale || 1);

        const worldX = (figure.x / 100) * 1000 - 500;
        const worldZ = (figure.y / 100) * 1000 - 500;
        group.position.set(worldX, 0, worldZ);

        const labelSprite = buildFigureLabelSprite(labelText, `#${figureColor.getHexString()}`);
        if (labelSprite) group.add(labelSprite);

        scene.add(group);
        figuresRef.current.set(figure.id, group);
      }
    });
  }, [figures, selectedFigureId]);

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

    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const base64 = dataURL.split(',')[1];
    setFullscreenCapture({ type: 'single', base64 });
  };

  // 全屏查看
  const openFullscreen = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setFsFullscreenParams({ yaw: displayInfo.yaw, pitch: displayInfo.pitch, fov: displayInfo.fov });
    setIsFullscreen(true);
  };

  // 添加角色 - 直接创建3D模型
  const addFigure = () => {
    const newFigure: Figure3D = {
      id: `figure-${Date.now()}`,
      name: `角色${figures.length + 1}`,
      image: '',
      x: 50, // 场景中心
      y: 50, // 场景中心
      scale: 2, // 默认缩放2倍
      rotation: 0
    };
    onUpdate({ figures: [...figures, newFigure] });
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

  return (
    <div className="flex flex-col h-full min-h-0 gap-2 p-3 overflow-y-auto">
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
              className={`px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'translate' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="移动模式"
            >
              移动
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('rotate'); }}
              className={`px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'rotate' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
              title="旋转模式"
            >
              旋转
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); setTransformMode('scale'); }}
              className={`px-1.5 py-0.5 rounded text-[9px] ${transformMode === 'scale' ? 'bg-pink-600 text-white' : 'bg-[#444] text-gray-300 hover:bg-[#555]'}`}
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
      </div>

      {/* 小人管理区 */}
      <div className="border border-[#333] rounded-lg p-2 bg-[#1a1a1a]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-300 font-medium flex items-center gap-1">
            <PersonIcon size={12} /> 角色管理 ({figures.length})
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={addFigure}
            className="py-1 px-2 rounded text-[10px] bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1"
          >
            <PlusIcon size={10} /> 添加角色
          </button>
        </div>

        {/* 角色列表 */}
        {figures.length > 0 ? (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {figures.map(figure => (
              <div
                key={figure.id}
                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer ${selectedFigureId === figure.id ? 'bg-pink-600/30 border border-pink-500/50' : 'bg-[#252525] hover:bg-[#333]'}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectFigure(figure.id);
                }}
              >
                <div className="w-8 h-8 rounded border border-[#444] bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                  <PersonIcon size={16} className="text-white" />
                </div>
                <span className="flex-1 text-[10px] text-gray-300 truncate">{figure.name}</span>

                {/* 选中角色的控制按钮 */}
                {selectedFigureId === figure.id && (
                  <div className="flex items-center gap-1">
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
                )}
              </div>
            ))}
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
