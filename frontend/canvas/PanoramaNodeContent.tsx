import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { devLog } from './devLog';
import type { CanvasNode, PanoramaNode } from '../types';
import {
  CopyIcon,
  EyedropperIcon,
  FullscreenIcon,
  ImageIcon,
  PanoramaIcon,
} from './canvasIcons';

export interface PanoramaNodeContentProps {
  node: PanoramaNode;
  nodes: CanvasNode[];
  eyedropperTargetNodeId: string | null;
  onEyedropperSelect: () => void;
  onEyedropperPickLink?: () => void;
  onUpdate: (updates: Partial<PanoramaNode>) => void;
  onCreateImageNode: (images: string[], nodeX: number, nodeY: number) => void;
  onCopyToImage?: () => void;
}
export function PanoramaNodeContent({
  node,
  nodes,
  eyedropperTargetNodeId,
  onEyedropperSelect,
  onEyedropperPickLink,
  onUpdate,
  onCreateImageNode,
  onCopyToImage,
}: PanoramaNodeContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number>(0);
  const currentImageRef = useRef<string>(''); // 跟踪当前加载的图片
  const [forceUpdateKey, setForceUpdateKey] = useState(0); // 强制更新key

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [displayInfo, setDisplayInfo] = useState({ yaw: 0, pitch: 0, fov: 75 });
  const [fullscreenCapture, setFullscreenCapture] = useState<{type: 'single' | 'grid', base64: string} | null>(null);
  // 720全景图模式（上下360度，即垂直720度）
  const [is720Mode, setIs720Mode] = useState((node as any).is720Mode ?? false);
  const [forceTextureReload, setForceTextureReload] = useState(0);
  // 左右翻转画面（水平镜像纹理）
  const isFlipped = node.flipped ?? false;

  const panoramaImage = node.panoramaImage ?? '';
  const panoramaImageAssetId = node.panoramaImageAssetId;
  const hasPanoramaMedia = !!(panoramaImage || panoramaImageAssetId);

  useEffect(() => {
    currentImageRef.current = '';
  }, [panoramaImage, panoramaImageAssetId]);

  // 同步720模式从节点属性
  useEffect(() => {
    const newMode = (node as any).is720Mode ?? false;
    if (newMode !== is720Mode) {
      setIs720Mode(newMode);
      setForceTextureReload(prev => prev + 1);
    }
  }, [(node as any).is720Mode]);

  // 处理全屏截图 - 传递给父组件创建节点
  useEffect(() => {
    if (fullscreenCapture && fullscreenCapture.base64) {
      onCreateImageNode([fullscreenCapture.base64], node.x + node.width + 50, node.y);
      setFullscreenCapture(null);
    }
  }, [fullscreenCapture, node.x, node.width, node.y, onCreateImageNode]);

  // 初始化 Three.js 场景 - 只在首次挂载时执行
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('360全景图: 容器不存在');
      return;
    }

    let isInitialized = false;
    let cleanupFn: (() => void) | null = null;
    let retryCount = 0;
    const maxRetries = 20;

    const initScene = () => {
      try {
        const rect = container.getBoundingClientRect();
        console.log('360全景图初始化尝试:', retryCount, '尺寸:', rect.width, 'x', rect.height);

        if (rect.width === 0 || rect.height === 0) {
          if (retryCount < maxRetries) {
            retryCount++;
            requestAnimationFrame(initScene);
          }
          return;
        }

        if (isInitialized) {
          console.log('360全景图: 已初始化，跳过');
          return;
        }
        isInitialized = true;

      const width = rect.width;
      const height = rect.height;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 0, 0.1);
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
      renderer.setClearColor(0x1a1a1a, 1);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      console.log('360全景图: canvas已添加', renderer.domElement.width, renderer.domElement.height);

      const sphereRadius = 500;
      const horizontalSegments = 60;
      const verticalSegments = 80; // 统一使用80分段以支持720模式
      const geometry = new THREE.SphereGeometry(sphereRadius, horizontalSegments, verticalSegments);
      geometry.scale(-1, 1, 1);

      const material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      materialRef.current = material;

      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
      sphereRef.current = sphere;

      let isDragging = false;
      let lastX = 0;
      let lastY = 0;
      let theta = 0;
      let phi = Math.PI / 2;

      const updateCamera = () => {
        const fov = node.fov ?? 75;
        camera.fov = fov;
        camera.updateProjectionMatrix();
        const x = 500 * Math.sin(phi) * Math.sin(theta);
        const y = 500 * Math.cos(phi);
        const z = 500 * Math.sin(phi) * Math.cos(theta);
        camera.lookAt(x, y, z);
      };

      const onMouseDown = (e: MouseEvent) => {
        e.stopPropagation();
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };

      const onMouseMove = (e: MouseEvent) => {
        e.stopPropagation();
        if (!isDragging) return;
        theta -= (e.clientX - lastX) * 0.005;
        // 720模式下 phi 范围更广
        const phiMin = is720Mode ? 0.01 : 0.1;
        const phiMax = is720Mode ? Math.PI - 0.01 : Math.PI - 0.1;
        phi = Math.max(phiMin, Math.min(phiMax, phi + (e.clientY - lastY) * 0.005));
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
        setDisplayInfo({ yaw: ((theta * 180 / Math.PI) % 360 + 360) % 360, pitch: 90 - (phi * 180 / Math.PI), fov: node.fov ?? 75 });
      };

      const onMouseUp = () => { isDragging = false; };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        onUpdate({ fov: Math.max(30, Math.min(120, (node.fov ?? 75) + e.deltaY * 0.05)) });
      };

      container.addEventListener('mousedown', onMouseDown);
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('mouseup', onMouseUp);
      container.addEventListener('mouseleave', onMouseUp);
      container.addEventListener('wheel', onWheel, { passive: false });

      controlsRef.current = {
        dispose: () => {
          container.removeEventListener('mousedown', onMouseDown);
          container.removeEventListener('mousemove', onMouseMove);
          container.removeEventListener('mouseup', onMouseUp);
          container.removeEventListener('mouseleave', onMouseUp);
          container.removeEventListener('wheel', onWheel);
        },
        update: updateCamera,
        setTheta: (t: number) => { theta = t; },
        setPhi: (p: number) => { phi = p; }
      };

      let animLoopActive = false;
      const animate = () => {
        if (!animLoopActive) return;
        animationFrameRef.current = requestAnimationFrame(animate);
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
        // 完整清理 GPU 资源，防止内存泄漏
        if (textureRef.current) { textureRef.current.dispose(); textureRef.current = null; }
        if (materialRef.current) { materialRef.current.dispose(); materialRef.current = null; }
        if (sphereRef.current) {
          const geom = sphereRef.current.geometry;
          if (geom) geom.dispose();
          sphereRef.current = null;
        }
        if (sceneRef.current) { sceneRef.current.clear(); }
        renderer.dispose();
        renderer.forceContextLoss();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
      } catch (error) {
        console.error('360全景图初始化失败:', error);
        isInitialized = false;
      }
    };

    initScene();

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []); // 只在首次挂载时初始化

  // 节点尺寸变化时同步更新渲染器尺寸，避免预览区域出现半黑屏
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

  // 720模式变化时强制重新加载纹理
  useEffect(() => {
    if (hasPanoramaMedia) {
      setForceTextureReload(prev => prev + 1);
    }
  }, [is720Mode, hasPanoramaMedia]);

  // 720模式切换时动态调整视角
  useEffect(() => {
    const controls = controlsRef.current;
    if (controls && controls.setPhi) {
      // 720模式下向上偏移，360模式下居中
      const newPhi = is720Mode ? Math.PI / 2 + 0.5 : Math.PI / 2;
      controls.setPhi(newPhi);
      controls.update();
    }
  }, [is720Mode]);

  // 加载全景图片（支持 IDB assetId）
  useEffect(() => {
    let cancelled = false;

    const applyTextureFromSrc = (src: string, cacheKey: string, flipped: boolean) => {
      const material = materialRef.current;
      if (!material || cancelled) return;

      currentImageRef.current = '';
      console.log('开始加载纹理');

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        console.log('Image onload 触发, 尺寸:', img.width, img.height);

        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        // 水平翻转：repeat.x = -1 后需要 offset.x = 1 才能看到图像
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.set(flipped ? -1 : 1, 1);
        texture.offset.set(flipped ? 1 : 0, 0);
        texture.needsUpdate = true;

        if (textureRef.current) {
          textureRef.current.dispose();
        }
        textureRef.current = texture;

        material.map = texture;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
        currentImageRef.current = cacheKey;

        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
        console.log('材质已更新，纹理设置完成');
      };

      img.onerror = () => {
        if (cancelled) return;
        console.error('纹理加载失败', src.slice(0, 80));
      };

      img.src = src;
    };

    const loadTexture = async () => {
      console.log('=== 纹理加载检查 ===');
      console.log(
        'panoramaImage 存在:',
        !!panoramaImage,
        '长度:',
        panoramaImage?.length,
        'assetId:',
        panoramaImageAssetId
      );

      if (!panoramaImage && !panoramaImageAssetId) {
        console.log('没有图片数据，跳过');
        return;
      }

      if (!materialRef.current) {
        console.log('等待 material 准备好...');
        setTimeout(loadTexture, 100);
        return;
      }

      const cacheKey = panoramaImage || panoramaImageAssetId || '';
      if (currentImageRef.current === cacheKey) return;

      const { resolveCanvasImageSource } = await import('../services/canvasAssetResolver');
      const src = await resolveCanvasImageSource(panoramaImage, panoramaImageAssetId);
      if (cancelled || !src) return;
      applyTextureFromSrc(src, cacheKey, isFlipped);
    };

    void loadTexture();
    return () => {
      cancelled = true;
    };
  }, [panoramaImage, panoramaImageAssetId, is720Mode, forceTextureReload]);

  // 左右翻转：仅更新现有纹理的 repeat/offset，避免重新加载图片
  useEffect(() => {
    const texture = textureRef.current;
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(isFlipped ? -1 : 1, 1);
    texture.offset.set(isFlipped ? 1 : 0, 0);
    texture.needsUpdate = true;
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [isFlipped]);

  // 监听 WebGL 上下文丢失/恢复
  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL 上下文丢失');
    };

    const handleContextRestored = () => {
      console.log('WebGL 上下文恢复');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, []);

  // 强制刷新渲染
  const forceRefresh = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
      console.log('手动刷新渲染');
    }
    // 强制重新加载纹理
    currentImageRef.current = '';
    setForceUpdateKey(k => k + 1);
  };

  // 重置相机
  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.setTheta(0);
      controlsRef.current.setPhi(Math.PI / 2);
      controlsRef.current.update();
    }
    onUpdate({ yaw: 0, pitch: 0, fov: 75 });
    setDisplayInfo({ yaw: 0, pitch: 0, fov: 75 });
    // 强制重新加载纹理
    currentImageRef.current = '';
    setForceUpdateKey(k => k + 1);
  };

  // 截图功能
  const captureCurrentView = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !hasPanoramaMedia) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!container) return;

    // 立即截图当前视图
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.95);
    const base64 = dataURL.split(',')[1];
    setFullscreenCapture({ type: 'single', base64 });
  };

  // 四宫格截图
  const captureGrid = (cols: number, rows: number) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !hasPanoramaMedia) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    // 创建离屏 Canvas
    const canvasObj = document.createElement('canvas');
    const cellWidth = 960;
    const cellHeight = 540;
    canvasObj.width = cellWidth * cols;
    canvasObj.height = cellHeight * rows;
    const ctx = canvasObj.getContext('2d');
    if (!ctx) return;

    // 设置渲染器为单格尺寸
    renderer.setSize(cellWidth, cellHeight);
    camera.aspect = cellWidth / cellHeight;
    camera.updateProjectionMatrix();

    let captured = 0;
    const total = cols * rows;

    // 生成方向列表 - 始终在地平线上截图
    // 720模式切换只影响界面上的视角范围，不影响截图
    const directions: { theta: number; phi: number }[] = [];
    const fixedPhi = Math.PI / 2;  // 固定在地平线
    const angleStep = (2 * Math.PI) / total;

    for (let i = 0; i < total; i++) {
      const theta = -Math.PI + i * angleStep;
      directions.push({ theta, phi: fixedPhi });
    }

    const captureNext = () => {
      if (captured >= total) {
        // 绘制白色分割线
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        for (let i = 1; i < cols; i++) {
          ctx.beginPath();
          ctx.moveTo(i * cellWidth, 0);
          ctx.lineTo(i * cellWidth, canvasObj.height);
          ctx.stroke();
        }
        for (let i = 1; i < rows; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * cellHeight);
          ctx.lineTo(canvasObj.width, i * cellHeight);
          ctx.stroke();
        }

        // 恢复原始尺寸
        const container = containerRef.current;
        if (container) {
          renderer.setSize(container.clientWidth, container.clientHeight);
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
        }
        renderer.render(scene, camera);

        const base64 = canvasObj.toDataURL('image/jpeg', 0.95).split(',')[1];
        onCreateImageNode([base64], node.x + node.width + 50, node.y);
        return;
      }

      const col = captured % cols;
      const row = Math.floor(captured / cols);
      const dir = directions[captured];

      if (controlsRef.current) {
        controlsRef.current.setTheta(dir.theta);
        controlsRef.current.setPhi(dir.phi);
        controlsRef.current.update();
      }

      renderer.render(scene, camera);

      // 使用 requestAnimationFrame 确保渲染完成后再截图
      requestAnimationFrame(() => {
        const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.95);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
          captured++;
          captureNext();
        };
        img.onerror = () => {
          // 如果加载失败，填充黑色
          ctx.fillStyle = '#000';
          ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
          captured++;
          captureNext();
        };
        img.src = dataURL;
      });
    };

    captureNext();
  };

  // 全屏查看（独立 Three 场景，不依赖节点内预览是否已初始化）
  const openFullscreen = () => {
    if (!hasPanoramaMedia) return;
    setFsFullscreenParams({ yaw: displayInfo.yaw, pitch: displayInfo.pitch, fov: displayInfo.fov });
    setIsFullscreen(true);
  };

  // 全屏模式下的渲染参数
  const [fsFullscreenParams, setFsFullscreenParams] = useState({ yaw: 0, pitch: 0, fov: 75 });

  // 全屏模式下的渲染
  useEffect(() => {
    if (!isFullscreen) return;

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#000;cursor:grab;';
    document.body.appendChild(container);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1);

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let theta = fsFullscreenParams.yaw * Math.PI / 180;
    let phi = (90 - fsFullscreenParams.pitch) * Math.PI / 180;
    let fov = fsFullscreenParams.fov;
    let textureLoaded = false;

    const updateCamera = () => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
      const x = 500 * Math.sin(phi) * Math.sin(theta);
      const y = 500 * Math.cos(phi);
      const z = 500 * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(x, y, z);
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      container.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      theta -= dx * 0.005;
      phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + dy * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    };

    const onMouseUp = () => {
      isDragging = false;
      container.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      fov = Math.max(30, Math.min(120, fov + e.deltaY * 0.05));
      updateCamera();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };

    const animate = () => {
      if (!isFullscreen) return;
      animFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    let animFrameId: number;

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    updateCamera();

    // 加载纹理并等待完成后开始渲染（支持 assetId）
    let cancelled = false;
    void (async () => {
      const { resolveCanvasImageSource } = await import('../services/canvasAssetResolver');
      const src = await resolveCanvasImageSource(panoramaImage, panoramaImageAssetId);
      if (cancelled || !src) {
        if (!textureLoaded) animate();
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        textureLoaded = true;
        animate();
      };
      img.onerror = (err) => {
        console.error('全景图加载失败:', err);
        if (!textureLoaded) animate();
      };
      img.src = src;
    })();

    // 如果纹理加载超时（5秒），也开始渲染
    setTimeout(() => {
      if (!textureLoaded) {
        animate();
      }
    }, 5000);

    // 截图功能 - 创建图片节点
    const captureScreenshot = () => {
      // 检查场景中是否有球体（纹理是否已加载）
      let meshInScene = false;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshInScene = true;
      });

      if (!meshInScene) {
        alert('请等待全景图加载完成后再截图');
        return;
      }

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      // 创建图片节点
      setFullscreenCapture({ type: 'single', base64 });
    };

    // 宫格截图功能 - 创建图片节点
    const captureGrid = (cols: number, rows: number) => {
      // 检查场景中是否有球体（纹理是否已加载）
      let meshInScene = false;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) meshInScene = true;
      });

      if (!meshInScene) {
        alert('请等待全景图加载完成后再截图');
        return;
      }

      const cellWidth = Math.floor(window.innerWidth / cols);
      const cellHeight = Math.floor(window.innerHeight / rows);
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth * cols;
      canvas.height = cellHeight * rows;
      const ctx = canvas.getContext('2d')!;

      // 临时停止动画循环
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = 0;
      }

      // 覆盖整个球面的视角网格
      // 水平方向：从 -180° 到 180°，垂直方向：从 -90° 到 90°
      const hFovRad = fov * Math.PI / 180;
      const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / (window.innerWidth / window.innerHeight));

      let captured = 0;
      const total = cols * rows;

      // 预计算所有格子的中心视角（每个角度间隔 360/总数 度）
      const directions: { theta: number; phi: number }[] = [];
      const fixedPhi = Math.PI / 2;  // 固定在地平线
      const angleStep = (2 * Math.PI) / total;

      for (let i = 0; i < total; i++) {
        const col = i % cols;
        const theta = -Math.PI + col * angleStep;
        directions.push({ theta, phi: fixedPhi });
      }

      const captureNext = () => {
        if (captured >= total) {
          // 创建图片节点
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          setFullscreenCapture({ type: 'grid', base64 });

          // 恢复原始相机角度
          theta = fsFullscreenParams.yaw * Math.PI / 180;
          phi = (90 - fsFullscreenParams.pitch) * Math.PI / 180;
          fov = fsFullscreenParams.fov;
          updateCamera();
          // 立即渲染恢复后的画面
          renderer.render(scene, camera);

          // 重新开始动画循环
          animate();
          return;
        }

        const col = captured % cols;
        const row = Math.floor(captured / cols);
        const dir = directions[captured];

        // 设置相机朝向
        theta = dir.theta;
        phi = dir.phi;
        updateCamera();

        // 等待渲染完成后再截图
        setTimeout(() => {
          renderer.render(scene, camera);
          // 使用 toDataURL 确保持久化渲染内容
          const dataUrl = renderer.domElement.toDataURL('image/png');
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
            captured++;
            captureNext();
          };
          img.onerror = () => {
            // 如果加载失败，尝试直接绘制 canvas
            ctx.fillStyle = '#000';
            ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
            captured++;
            captureNext();
          };
          img.src = dataUrl;
        }, 100);
      };

      captureNext();
    };

    const cleanup = () => {
      setIsFullscreen(false);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('mouseleave', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      renderer.dispose();
      geometry.dispose();
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    };

    // ESC 按钮
    const escBtn = document.createElement('button');
    escBtn.textContent = '× 退出';
    escBtn.style.cssText = 'position:fixed;top:20px;right:20px;width:40px;height:40px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:white;font-size:20px;cursor:pointer;z-index:1001;backdrop-filter:blur(10px);transition:all 0.2s;display:flex;align-items:center;justify-content:center;';
    escBtn.onclick = cleanup;
    document.body.appendChild(escBtn);

    // 截图和宫格按钮
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'position:fixed;top:20px;left:20px;display:flex;gap:8px;z-index:1001;';
    
    const captureBtn = document.createElement('button');
    captureBtn.textContent = '📷 截图';
    captureBtn.style.cssText = 'padding:10px 16px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:white;font-size:13px;cursor:pointer;backdrop-filter:blur(10px);transition:all 0.2s;';
    captureBtn.onclick = captureScreenshot;
    btnContainer.appendChild(captureBtn);
    
    [2, 4, 6, 9].forEach(n => {
      const cols = n === 6 ? 3 : n === 9 ? 3 : n === 4 ? 2 : 1;
      const rows = n === 6 ? 2 : n === 9 ? 3 : n === 4 ? 2 : n;
      const gridBtn = document.createElement('button');
      gridBtn.textContent = `${rows}×${cols}`;
      gridBtn.style.cssText = 'padding:10px 14px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:8px;color:white;font-size:13px;cursor:pointer;backdrop-filter:blur(10px);transition:all 0.2s;';
      gridBtn.onclick = () => captureGrid(cols, rows);
      btnContainer.appendChild(gridBtn);
    });
    
    document.body.appendChild(btnContainer);

    // 视角信息提示
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 20px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:13px;z-index:1001;backdrop-filter:blur(10px);font-family:monospace;white-space:nowrap;';
    const updateInfo = () => {
      const yawDeg = ((theta * 180 / Math.PI) % 360 + 360) % 360;
      const pitchDeg = 90 - (phi * 180 / Math.PI);
      infoDiv.textContent = `YAW: ${yawDeg.toFixed(0)}°  PITCH: ${pitchDeg.toFixed(0)}°  FOV: ${fov.toFixed(0)}°  |  拖动旋转 | 滚轮缩放 | ESC退出`;
    };
    updateInfo();
    document.body.appendChild(infoDiv);

    // 添加鼠标移动更新信息
    const onMouseMoveUpdateInfo = () => { updateInfo(); };
    container.addEventListener('mousemove', onMouseMoveUpdateInfo);

    return () => {
      cancelled = true;
      cleanup();
      if (document.body.contains(escBtn)) document.body.removeChild(escBtn);
      if (document.body.contains(infoDiv)) document.body.removeChild(infoDiv);
      if (document.body.contains(btnContainer)) document.body.removeChild(btnContainer);
      container.removeEventListener('mousemove', onMouseMoveUpdateInfo);
    };
  }, [isFullscreen, panoramaImage, panoramaImageAssetId, is720Mode, fsFullscreenParams]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-1 p-2 overflow-y-auto">
      {/* 预览区域 */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[200px] rounded-lg border border-[#333] overflow-hidden bg-[#2a2a2a]"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {onEyedropperPickLink ? (
          <button
            type="button"
            className="absolute inset-0 z-[15] cursor-crosshair bg-transparent border-0 p-0"
            title="点击连接上游节点"
            onPointerDown={(e) => {
              e.stopPropagation();
              onEyedropperPickLink();
            }}
          />
        ) : null}
        {!hasPanoramaMedia && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 pointer-events-none">
            <PanoramaIcon size={36} />
            <span className="text-gray-300 text-xs text-center px-4">
              点击下方&quot;导入&quot;加载图片<br />或从其他节点连线获取图片
            </span>
          </div>
        )}

        {/* 视角指示器 */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white backdrop-blur-sm z-20">
          Y: {displayInfo.yaw.toFixed(0)}° P: {displayInfo.pitch.toFixed(0)}° FOV: {displayInfo.fov.toFixed(0)}°
        </div>

        {/* 全屏按钮 */}
        {hasPanoramaMedia && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={openFullscreen}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded text-white backdrop-blur-sm z-20"
            title="全屏查看"
          >
            <FullscreenIcon size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 shrink-0">
        {/* 图片导入按钮和吸管 */}
        <div className="flex gap-1">
          <button
            onPointerDown={(e) => { e.stopPropagation(); onEyedropperSelect(); }}
            className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
            title={eyedropperTargetNodeId === node.id ? "取消吸取" : "吸取图片"}
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
                    onUpdate({ panoramaImage: base64 });
                  };
                  reader.readAsDataURL(file);
                }
              };
              input.click();
            }}
            className="flex-1 py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 flex items-center justify-center gap-1"
          >
            <ImageIcon size={10} /> 导入
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
            onClick={openFullscreen}
            disabled={!hasPanoramaMedia}
            className="py-1 px-2 rounded text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            title={hasPanoramaMedia ? '全屏查看全景' : '请先导入或连线图片'}
          >
            <FullscreenIcon size={12} /> 最大化
          </button>
        </div>

        {/* 截图功能 */}
        <div className="flex flex-wrap gap-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={captureCurrentView}
            disabled={!hasPanoramaMedia}
            className="flex-1 py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            截图
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (onCopyToImage) {
                onCopyToImage();
                return;
              }
              if (!hasPanoramaMedia) return;
              if (panoramaImage) {
                onCreateImageNode([panoramaImage], node.x + node.width + 50, node.y);
              }
            }}
            disabled={!hasPanoramaMedia}
            className="py-1 px-2 rounded text-[10px] bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="复制当前图片"
          >
            <CopyIcon size={12} />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => captureGrid(2, 2)}
            disabled={!hasPanoramaMedia}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="4宫格截图"
          >
            4宫格
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => captureGrid(3, 2)}
            disabled={!hasPanoramaMedia}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="6宫格截图"
          >
            6宫格
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => captureGrid(3, 3)}
            disabled={!hasPanoramaMedia}
            className="py-1 px-2 rounded text-[10px] bg-[#333] hover:bg-[#444] text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="9宫格截图"
          >
            9宫格
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onUpdate({ is720Mode: !is720Mode } as any); }}
            className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${is720Mode ? 'bg-orange-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'}`}
            title={is720Mode ? "当前: 720°全景图模式" : "切换到720°全景图模式"}
          >
            {is720Mode ? '720°' : '360°'}
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onUpdate({ flipped: !isFlipped }); }}
            className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${isFlipped ? 'bg-purple-600 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'}`}
            title={isFlipped ? '当前: 画面已左右翻转（点击恢复正常）' : '左右翻转画面（水平镜像）'}
          >
            左右翻转
          </button>
        </div>
      </div>
    </div>
  );
}
