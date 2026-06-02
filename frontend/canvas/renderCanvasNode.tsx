import React, { lazy, Suspense } from 'react';
import type {
  CanvasNode,
  AnnotationNode,
  PanoramaNode,
  GridSplitNode,
  GridMergeNode,
  Director3DNode,
  ChatNode,
} from '../types';
import { GridSplitNodeContent } from './GridSplitNodeContent';
import { GridMergeNodeContent } from './GridMergeNodeContent';
import { HeavyNodeFallback } from './HeavyNodeFallback';
import { OptimizedImage } from './OptimizedImage';
import { CanvasNodeShell } from './CanvasNodeShell';
import { CanvasNodeFooterActions } from './CanvasNodeFooterActions';
import { ChatNodeContent } from './ChatNodeContent';
import { RefPickBar } from './RefPickBar';
import { I2iRefBar } from './I2iRefBar';
import { NodeGenerateBar } from './NodeGenerateBar';
import { GenerationTimer } from './GenerationTimer';
import { ThreeEngineGate } from './ThreeEngineGate';
import { TextNodeFontSizeSelect } from './TextNodeFontSizeSelect';
import { I2iPresetCategorySelect } from './I2iPresetCategorySelect';
import { I2iAspectRatioSelect } from './I2iAspectRatioSelect';
import { T2iPresetCategorySelect } from './T2iPresetCategorySelect';
import { EyedropperIcon, ImageIcon, CopyIcon, LoaderIcon } from './canvasIcons';
import {
  defaultCanvasImageModel,
  isGptImage2CanvasModelId,
  isManxueGptImage2Model,
} from './canvasModelUtils';
import { buildIncomingRefSlots } from '../referenceSlots';
import { buildStackedImageNodesFromLists } from './spawnImageNodes';
import {
  cloneImageSlotForNewNode,
  countNodeImageSlots,
  hasCanvasImagePayload,
} from '../services/canvasAssetResolver';
import type { CanvasNodeRenderState } from './canvasNodeRenderState';
import { getNodeHeaderMeta } from './nodeHeaderMeta';

const PanoramaNodeContent = lazy(() =>
  import('./PanoramaNodeContent').then((m) => ({ default: m.PanoramaNodeContent }))
);
const Director3DNodeContent = lazy(() =>
  import('./Director3DNodeContent').then((m) => ({ default: m.Director3DNodeContent }))
);
const AnnotationNodeContent = lazy(() =>
  import('./AnnotationNodeContent').then((m) => ({ default: m.AnnotationNodeContent }))
);
const CanvasImageGenArea = lazy(() =>
  import('./CanvasImageGenArea').then((m) => ({ default: m.CanvasImageGenArea }))
);
const VideoNodeContent = lazy(() =>
  import('./VideoNodeContent').then((m) => ({ default: m.VideoNodeContent }))
);
const AudioNodeContent = lazy(() =>
  import('./AudioNodeContent').then((m) => ({ default: m.AudioNodeContent }))
);
const VideoNodeSettingsPanel = lazy(() =>
  import('./VideoNodeSettingsPanel').then((m) => ({ default: m.VideoNodeSettingsPanel }))
);

export function renderCanvasNode(node: CanvasNode, s: CanvasNodeRenderState): React.ReactNode {
  const genStart = s.generationStartedAtRef.current.get(node.id);
  const vp = s.canvasViewportRef.current;
  const nodeInViewport = (() => {
    const t = { x: vp.x, y: vp.y, scale: vp.scale };
    const screenLeft = node.x * t.scale + t.x;
    const screenTop = node.y * t.scale + t.y;
    const screenRight = screenLeft + node.width * t.scale;
    const screenBottom = screenTop + node.height * t.scale;
    const margin = 300;
    return !(screenRight < -margin || screenLeft > vp.width + margin || screenBottom < -margin || screenTop > vp.height + margin);
  })();
  const isSelected = s.selectedIdSet.has(node.id);
  const eyedropperId = s.eyedropperTargetNodeId;
  const thumbPct = s.thumbResolutionPct;
  const editingTextNodeIds = s.editingTextNodeIds;
  const textNodeFontSizeLocal = s.textNodeFontSize;
  const addNodes = s.appendNodesWithUndo;
  const canvasNodes = s.nodes;
  const canvasEdges = s.edges;
  const hasInputPort = s.canReceiveConnection(node);
  const hasOutputPort = true;

  const { headerIcon, headerTitle, borderColor, shadowColor } = getNodeHeaderMeta(node.type, isSelected);

const images = node.images || [];
const imageAssetIds = node.imageAssetIds;
const hasDisplayableImages = countNodeImageSlots(images, imageAssetIds) > 0;
const viewMode = node.viewMode || 'single';
const currentIndex = node.currentImageIndex || 0;
const videoUrls = node.videos || [];
const currentVideoIdx = node.currentVideoIndex ?? 0;

return (
  <CanvasNodeShell
    node={node}
    isSelected={isSelected}
    borderColor={borderColor}
    shadowColor={shadowColor}
    headerIcon={headerIcon}
    headerTitle={headerTitle}
    hasInputPort={hasInputPort}
    hasOutputPort={hasOutputPort}
    eyedropperTargetNodeId={eyedropperId}
    onPointerDown={(e) => s.handleNodePointerDown(e, node.id)}
    onDoubleClick={() => {
      if (!isSelected && (node.type === 'chat' || node.type === 'text')) {
        s.setSelectedIds([node.id]);
      }
      if (node.type === 'text') {
        s.setEditingTextNodeIds((prev) => {
          const next = new Set(prev);
          next.add(node.id);
          return next;
        });
      }
    }}
    onPortPointerDown={s.handlePortPointerDown}
    onBeginResize={s.beginNodeResize}
  >
      {/* Image Area */}
      {(node.type === 't2i' || node.type === 'i2i' || node.type === 'image' || node.type === 'panoramaT2i') && (
        <Suspense fallback={<HeavyNodeFallback label="加载图片区…" />}>
          <CanvasImageGenArea
            node={node}
            nodeInViewport={nodeInViewport}
            images={images}
            imageAssetIds={imageAssetIds}
            hasDisplayableImages={hasDisplayableImages}
            viewMode={viewMode}
            currentIndex={currentIndex}
            thumbResolutionPct={thumbPct}
            generationStartedAt={node.isGenerating ? genStart : undefined}
            eyedropperTargetNodeId={eyedropperId}
            eyedropperTargetNodeIdRef={s.eyedropperTargetNodeIdRef}
            onUpdateNode={s.handleUpdateNode}
            onCopyToImage={s.handleCopyToImage}
            onCanvasEyedropper={s.handleCanvasEyedropper}
            openFullscreenImage={s.openFullscreenImage}
            setEyedropperTargetNodeId={s.setEyedropperTargetNodeId}
            onImportImage={(nodeId) => {
              s.setImportTargetNodeId(nodeId);
              s.fileInputRef.current?.click();
            }}
          />
        </Suspense>
      )}

      {node.type === 'video' && (
        <Suspense fallback={<HeavyNodeFallback label="加载视频预览…" />}>
          <VideoNodeContent
            node={node}
            isSelected={isSelected}
            videoUrls={videoUrls}
            currentVideoIdx={currentVideoIdx}
            generationStartedAt={node.isGenerating ? genStart : undefined}
            eyedropperTargetNodeId={eyedropperId}
            eyedropperTargetNodeIdRef={s.eyedropperTargetNodeIdRef}
            nodesRef={s.nodesRef}
            onUpdateNode={s.handleUpdateNode}
            onCanvasEyedropper={s.handleCanvasEyedropper}
            onDownloadVideo={s.downloadVideoFromUrl}
          />
        </Suspense>
      )}

      {/* 语音节点内容 */}
      {node.type === 'audio' && (
        <Suspense fallback={<HeavyNodeFallback label="加载语音节点…" />}>
          <AudioNodeContent
            node={node}
            onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          />
        </Suspense>
      )}

      {/* 360° 全景图节点内容 */}
      {node.type === 'panorama' && (
        <ThreeEngineGate label="加载全景引擎…">
        <PanoramaNodeContent 
          node={node as PanoramaNode} 
          nodes={canvasNodes}
          eyedropperTargetNodeId={eyedropperId}
          onEyedropperSelect={() => s.setEyedropperTargetNodeId(node.id)}
          onEyedropperPickLink={
            eyedropperId && eyedropperId !== node.id
              ? () => {
                  const t = s.eyedropperTargetNodeIdRef.current;
                  if (t) s.handleCanvasEyedropper(node.id, t);
                }
              : undefined
          }
          onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          onCreateImageNode={(images, x, y) => {
            const newNode: CanvasNode = {
              id: `image-${Date.now()}`,
              type: 'image',
              x,
              y,
              width: 480,
              height: 528,
              prompt: '',
              images,
              viewMode: 'single',
              currentImageIndex: 0
            };
            addNodes([newNode]);
          }}
          onCopyToImage={() => s.handleCopyToImage(node.id)}
        />
        </ThreeEngineGate>
      )}

      {/* 3D导演台节点内容 */}
      {node.type === 'director3d' && (
        <ThreeEngineGate label="加载 3D 引擎…">
        <Director3DNodeContent
          node={node as Director3DNode}
          nodes={canvasNodes}
          eyedropperTargetNodeId={eyedropperId}
          onEyedropperSelect={() => s.setEyedropperTargetNodeId(node.id)}
          onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          onCreateImageNode={(images, x, y) => {
            const newNode: CanvasNode = {
              id: `image-${Date.now()}`,
              type: 'image',
              x,
              y,
              width: 480,
              height: 528,
              prompt: '',
              images,
              viewMode: 'single',
              currentImageIndex: 0
            };
            addNodes([newNode]);
          }}
          onCopyToImage={() => s.handleCopyToImage(node.id)}
        />
        </ThreeEngineGate>
      )}

      {/* 图片标注节点内容 */}
      {node.type === 'annotation' && (
        <Suspense fallback={<HeavyNodeFallback label="加载标注工具…" />}>
        <AnnotationNodeContent
          node={node as AnnotationNode}
          nodes={canvasNodes}
          edges={canvasEdges}
          eyedropperTargetNodeId={eyedropperId}
          onEyedropperSelect={() => s.setEyedropperTargetNodeId(node.id)}
          onEyedropperPickLink={
            eyedropperId && eyedropperId !== node.id
              ? () => {
                  const t = s.eyedropperTargetNodeIdRef.current;
                  if (t) s.handleCanvasEyedropper(node.id, t);
                }
              : undefined
          }
          onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          onCreateImageNode={(images, x, y) => {
            const newNode: CanvasNode = {
              id: `image-${Date.now()}`,
              type: 'image',
              x,
              y,
              width: 480,
              height: 528,
              prompt: '',
              images,
              viewMode: 'single',
              currentImageIndex: 0
            };
            addNodes([newNode]);
          }}
          onCopyToImage={() => s.handleCopyToImage(node.id)}
          onFullscreenImage={(base64) => s.setFullscreenImage(base64)}
          onDeleteEdge={s.handleDeleteEdge}
        />
        </Suspense>
      )}

      {/* 宫格拆分节点内容 */}
      {node.type === 'gridSplit' && (
        <GridSplitNodeContent
          node={node as GridSplitNode}
          nodes={canvasNodes}
          edges={canvasEdges}
          eyedropperTargetNodeId={eyedropperId}
          onEyedropperSelect={() => s.setEyedropperTargetNodeId(node.id)}
          onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          onCreateImageNode={(images, x, y) => {
            const gsNode = node as GridSplitNode;
            const newNodes = buildStackedImageNodesFromLists(
              images,
              x,
              y,
              gsNode.outputImageAssetIds
            );
            if (newNodes.length === 0) return;
            addNodes(newNodes);
          }}
          onCopyToImage={() => s.handleCopyToImage(node.id, 'stacked')}
        />
      )}

      {/* 宫格合并节点内容 */}
      {node.type === 'gridMerge' && (
        <GridMergeNodeContent
          node={node as GridMergeNode}
          nodes={canvasNodes}
          edges={canvasEdges}
          eyedropperTargetNodeId={eyedropperId}
          onEyedropperSelect={() => s.setEyedropperTargetNodeId(node.id)}
          onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          onCreateImageNode={(image, x, y, assetId) => {
            const payload = cloneImageSlotForNewNode(image, assetId);
            if (!payload) return;
            const newNode: CanvasNode = {
              id: `image-${Date.now()}`,
              type: 'image',
              x,
              y,
              width: 480,
              height: 528,
              prompt: '',
              ...payload,
              viewMode: 'single',
              currentImageIndex: 0,
            };
            addNodes([newNode]);
          }}
          onCopyToImage={() => s.handleCopyToImage(node.id, { primaryOnly: true })}
        />
      )}

      {/* 对话节点内容 */}
      {node.type === 'chat' && (
        <ChatNodeContent
          node={node as ChatNode}
          nodes={canvasNodes}
          edges={canvasEdges}
          isSelected={isSelected}
          eyedropperTargetNodeId={eyedropperId}
          onEyedropperSelect={() => s.setEyedropperTargetNodeId(node.id)}
          onDeleteEdge={s.handleDeleteEdge}
          onUpdate={(updates) => s.handleUpdateNode(node.id, updates)}
          onSendMessage={() => void s.handleSendMessage(node.id)}
          onResendWithHistory={(base, prompt) => void s.handleSendMessage(node.id, { baseMessages: base, promptText: prompt })}
          onOpenApiSettings={() => {
            s.setSettingsTab('api');
            s.setShowSettingsModal(true);
          }}
          promptPresets={s.promptPresets}
          generationStartedAt={node.isGenerating ? genStart : undefined}
          onOpenBigEditor={s.openBigEditor}
          onActivate={() => s.setSelectedIds([node.id])}
          onCreateImageNode={(images, x, y) => {
            const newNode: CanvasNode = {
              id: `image-${Date.now()}`,
              type: 'image',
              x,
              y,
              width: 480,
              height: 528,
              prompt: '',
              images,
              viewMode: 'single',
              currentImageIndex: 0
            };
            addNodes([newNode], { selectIds: [newNode.id] });
          }}
          onOpenFullscreen={(base64) => void s.openFullscreenFromBase64(base64)}
          onCancelGeneration={s.handleCancelGeneration}
        />
      )}

      {/* Header */}
    <div className="min-h-8 py-1.5 bg-[#252525] border-b border-[#333] flex items-center justify-between px-3 cursor-grab active:cursor-grabbing shrink-0">
      <div className="flex items-center gap-2">
        {headerIcon}
        {node.type === 'text' && (
          <>
            <button
              onPointerDown={(e) => { e.stopPropagation(); s.setEyedropperTargetNodeId(node.id); }}
              className={`ml-1 px-1.5 py-0.5 rounded text-[10px] text-white ${eyedropperId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
              title={eyedropperId === node.id ? "取消吸取" : "吸取文本"}
            >
              <EyedropperIcon size={10} />
            </button>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                const text = node.prompt?.trim();
                if (!text) {
                  alert('请先在文本节点输入要优化的提示词内容');
                  return;
                }
                s.handleOptimizePrompt(node.id, text);
              }}
              className="ml-1 px-1.5 py-0.5 rounded text-[30px] text-white bg-purple-600 hover:bg-purple-500"
              title="AI优化提示词（生成Seedance 2.0提示词）"
            >
              优化提示词
            </button>
            <TextNodeFontSizeSelect />
          </>
        )}
      </div>
      {isSelected && (node.type === 't2i' || node.type === 'i2i' || node.type === 'panoramaT2i') && (
        <>
          <select className="nodemodel-select bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500 flex-1 min-w-[90px]" value={node.model || defaultCanvasImageModel()} onChange={(e) => { const m = e.target.value; const patch: Partial<CanvasNode> = { model: m }; if (isGptImage2CanvasModelId(m) || isManxueGptImage2Model(m)) patch.resolution = '2k'; s.handleUpdateNode(node.id, patch); }} onPointerDown={e => e.stopPropagation()}>
            {(node.type === 't2i' || node.type === 'panoramaT2i') ? (<><option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option><option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option><optgroup label="满 e（manxueapi.com）"><option value="gemini-3.1-flash-image-preview-2k-manxue">Gemini 3.1 Flash Image 2K（满 e）</option><option value="gemini-3-pro-image-preview-2k-manxue">Gemini 3 Pro Image 2K（满 e）</option><option value="gpt-image-2-manxue">GPT Image 2（满 e）</option><option value="gpt-image-2-pro-manxue">GPT Image 2 Pro（满 e）</option><option value="gemini-3-pro-image-preview-4k-manxue">Gemini 3 Pro Image 4K（满 e）</option><option value="gemini-3.1-flash-image-preview-4k-manxue">Gemini 3.1 Flash Image 4K（满 e）</option></optgroup><optgroup label="ToAPIs"><option value="gpt-image-2">GPT Image 2（ToAPIs）</option><option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option><option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option><option value="nano-banana-2">Nano-Banana 2（ToAPIs）</option><option value="imagen-4">Imagen 4</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option></optgroup><optgroup label="即梦 (Dreamina)"><option value="jimeng-image-5.0">即梦 5.0</option><option value="jimeng-image-4.6">即梦 4.6</option><option value="jimeng-image-4.5">即梦 4.5</option><option value="jimeng-image-4.0">即梦 4.0</option></optgroup></>) : (<><option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option><option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option><optgroup label="满 e（manxueapi.com）"><option value="gemini-3.1-flash-image-preview-2k-manxue">Gemini 3.1 Flash Image 2K（满 e）</option><option value="gemini-3-pro-image-preview-2k-manxue">Gemini 3 Pro Image 2K（满 e）</option><option value="gpt-image-2-manxue">GPT Image 2（满 e）</option><option value="gpt-image-2-pro-manxue">GPT Image 2 Pro（满 e）</option><option value="gemini-3-pro-image-preview-4k-manxue">Gemini 3 Pro Image 4K（满 e）</option><option value="gemini-3.1-flash-image-preview-4k-manxue">Gemini 3.1 Flash Image 4K（满 e）</option></optgroup><optgroup label="ToAPIs"><option value="gpt-image-2">GPT Image 2（ToAPIs）</option><option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image（ToAPIs）</option><option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option><option value="nano-banana-2">Nano-Banana 2（ToAPIs）</option><option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option></optgroup><optgroup label="即梦 (Dreamina)"><option value="jimeng-image-5.0">即梦 5.0</option><option value="jimeng-image-4.6">即梦 4.6</option><option value="jimeng-image-4.5">即梦 4.5</option><option value="jimeng-image-4.0">即梦 4.0</option></optgroup></>)}
          </select>
          <div className="nodemeta-skip-scale flex items-center gap-0.5">
            {node.type !== 'i2i' && (
            <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.aspectRatio || (node.type === 'panoramaT2i' ? '2:1' : '16:9')} onChange={(e) => s.handleUpdateNode(node.id, { aspectRatio: e.target.value })} onPointerDown={e => e.stopPropagation()}>
              {node.type === 'panoramaT2i' ? (<><option value="2:1">2:1</option><option value="21:9">21:9</option></>) : (<><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="21:9">21:9</option><option value="4:3">4:3</option><option value="3:4">3:4</option></>)}
            </select>
            )}
            <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.resolution || '2k'} onChange={(e) => s.handleUpdateNode(node.id, { resolution: e.target.value })} onPointerDown={e => e.stopPropagation()}><option value="4k">4K</option><option value="2k">2K</option><option value="1k">1K</option></select>
            <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.imageCount || 1} onChange={(e) => s.handleUpdateNode(node.id, { imageCount: parseInt(e.target.value) })} onPointerDown={e => e.stopPropagation()}><option value={1}>1</option><option value={2}>2</option><option value={4}>4</option></select>
            {isGptImage2CanvasModelId(node.model || defaultCanvasImageModel()) || isManxueGptImage2Model(node.model || defaultCanvasImageModel()) && (
              <select className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500" value={node.quality || 'high'} onChange={(e) => s.handleUpdateNode(node.id, { quality: e.target.value })} onPointerDown={e => e.stopPropagation()}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="auto">auto</option>
              </select>
            )}
          </div>
        </>
      )}
      <CanvasNodeFooterActions
        node={node}
        onResetSize={s.handleResetNodeSize}
        onDelete={s.handleDeleteNode}
      />
    </div>

    {node.type === 'video' && (
      <Suspense fallback={<HeavyNodeFallback label="加载视频参数…" />}>
        <VideoNodeSettingsPanel
          node={node}
          nodes={canvasNodes}
          edges={canvasEdges}
          eyedropperTargetNodeId={eyedropperId}
          onUpdateNode={s.handleUpdateNode}
          onDeleteEdge={s.handleDeleteEdge}
          setEyedropperTargetNodeId={s.setEyedropperTargetNodeId}
        />
      </Suspense>
    )}

    {(node.type === 'i2i' || node.type === 'panoramaT2i') && (
      <I2iRefBar
        nodeId={node.id}
        nodes={canvasNodes}
        edges={canvasEdges}
        eyedropperTargetNodeId={eyedropperId}
        onDeleteEdge={s.handleDeleteEdge}
        setEyedropperTargetNodeId={s.setEyedropperTargetNodeId}
      />
    )}
      {/* Text Area - panoramaT2i 使用内置提示词，不显示输入框；视频节点未选中且有视频时隐藏 */}
      {(node.type === 't2i' || node.type === 'i2i' || node.type === 'text' || (node.type === 'video' && isSelected)) && (
        <div
          className={`flex flex-col min-h-0 overflow-hidden ${
            node.type === 't2i' || node.type === 'i2i' ? 'flex-[3] basis-0' : 'flex-1'
          }`}
          style={node.type === 'text' ? {} : undefined}
        >
          {/* 预设按钮区域 - i2i节点 */}
          {node.type === 'i2i' && (
            <>
            <I2iAspectRatioSelect
              aspectRatio={node.aspectRatio}
              onChange={(aspectRatio) => s.handleUpdateNode(node.id, { aspectRatio })}
            />
            <I2iPresetCategorySelect
              nodeId={node.id}
              activePresets={node.activePresets}
              promptPresets={s.promptPresets}
              presetDomainOverrides={s.promptPresetDomainOverrides}
              presetCategoryOverrides={s.promptPresetCategoryOverrides}
              onTogglePreset={s.handleTogglePreset}
              onClearPreset={s.handleClearPreset}
            />
            </>
          )}
          {/* 预设按钮区域 - t2i节点 */}
          {node.type === 't2i' && (
            <T2iPresetCategorySelect
              nodeId={node.id}
              activePresets={node.activePresets}
              promptPresets={s.promptPresets}
              presetDomainOverrides={s.promptPresetDomainOverrides}
              onTogglePreset={s.handleTogglePreset}
              onClearPreset={s.handleClearPreset}
            />
          )}
          <div className="relative flex flex-col flex-1 min-h-0">
            {(node.type === 'i2i' || node.type === 'video') && (
              <RefPickBar
                slots={buildIncomingRefSlots(node.id, canvasEdges, canvasNodes)}
                disabled={node.isGenerating}
                onInsert={(tok) => {
                  // 获取当前 prompt 和光标位置
                  const curPrompt = node.prompt || '';
                  const inputEl = document.querySelector(`[data-node-prompt="${node.id}"]`) as HTMLTextAreaElement | null;
                  let insertPos = curPrompt.length;
                  if (inputEl) {
                    const sel = inputEl.selectionStart;
                    if (sel !== null) {
                      insertPos = sel;
                    }
                  }
                  const next = curPrompt.slice(0, insertPos) + tok + curPrompt.slice(insertPos);
                  s.handleUpdateNode(node.id, { prompt: next });
                  requestAnimationFrame(() => {
                    if (inputEl) {
                      inputEl.focus();
                      inputEl.selectionStart = inputEl.selectionEnd = insertPos + tok.length;
                    }
                  });
                }}
              />
            )}
            {node.type === 'text' && !(isSelected && editingTextNodeIds.has(node.id)) ? (
              <div
                className="w-full h-full bg-[#222222] text-gray-200 p-3 rounded-lg border border-[#444] overflow-y-auto leading-relaxed whitespace-pre-wrap break-words text-node-content relative cursor-grab active:cursor-grabbing"
                style={{ fontSize: textNodeFontSizeLocal + 'px', minHeight: '120px' }}
                onDoubleClick={(e) => {
                  if (!isSelected) {
                    e.stopPropagation();
                    s.setSelectedIds([node.id]);
                    s.setEditingTextNodeIds(prev => { const next = new Set(prev); next.add(node.id); return next; });
                  }
                }}
              >
                {node.isGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#222222]/90 rounded-lg z-10">
                    <div className="gen-progress-orb mb-3" style={{ transform: 'scale(3)' }}>
                      <div className="gen-progress-orb-ring" />
                      <div className="gen-progress-orb-core">
                        <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    {genStart != null ? (
                      <GenerationTimer
                        startedAt={genStart}
                        className="gen-text-glitch tabular-nums text-purple-400 mt-5 text-[20px]"
                        showSeconds
                        secondsClassName="text-gray-500 mt-1 text-[14px]"
                        glitch
                      />
                    ) : null}
                  </div>
                ) : null}
                {node.prompt || <span className="text-gray-500">双击编辑文本</span>}
                <style>{`
                  .text-node-content::-webkit-scrollbar { width: 72px; }
                  .text-node-content::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 4px; }
                  .text-node-content::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; border: 4px solid transparent; background-clip: content-box; }
                  .text-node-content::-webkit-scrollbar-thumb:hover { background: #666; border: 4px solid transparent; background-clip: content-box; }
                  .text-node-textarea::-webkit-scrollbar { width: 72px; }
                  .text-node-textarea::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 4px; }
                  .text-node-textarea::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; border: 4px solid transparent; background-clip: content-box; }
                  .text-node-textarea::-webkit-scrollbar-thumb:hover { background: #666; border: 4px solid transparent; background-clip: content-box; }
                `}</style>
              </div>
            ) : (
            <textarea
              data-node-prompt={node.id}
              className="w-full h-full bg-[#222222] text-gray-200 p-3 rounded-lg border border-[#444] focus:outline-none focus:border-blue-500 transition-colors resize-none leading-relaxed text-node-textarea" style={{ fontSize: textNodeFontSizeLocal + 'px', minHeight: node.type === 'i2i' ? '80px' : '120px' }}
              value={node.prompt}
              onChange={(e) => s.handleUpdateNode(node.id, { prompt: e.target.value })}
              placeholder=""
              readOnly={node.type === 'text' && !(isSelected && editingTextNodeIds.has(node.id))}
              onPointerDown={(e) => {
                // 吸管模式激活时，允许事件冒泡触发吸管连线
                if (eyedropperId) return;
                e.stopPropagation();
                // 双击检测：基于时间戳
                const now = Date.now();
                if (now - s.bigEditorLastClickRef.current < 320) {
                  s.bigEditorLastClickRef.current = 0;
                  s.openBigEditor(node.prompt || '', (v) => s.handleUpdateNode(node.id, { prompt: v }));
                } else {
                  s.bigEditorLastClickRef.current = now;
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                s.openBigEditor(node.prompt || '', (v) => s.handleUpdateNode(node.id, { prompt: v }));
              }}
            />
            )}
          </div>
          {(node.type === 't2i' || node.type === 'i2i') && (
            <NodeGenerateBar
              nodeId={node.id}
              variant="image"
              isGenerating={!!node.isGenerating}
              generationStartedAt={node.isGenerating ? genStart : undefined}
              onGenerate={s.handleGenerate}
              onCancel={s.handleCancelGeneration}
            />
          )}
          {node.type === 'video' && (
            <NodeGenerateBar
              nodeId={node.id}
              variant="video"
              isGenerating={!!node.isGenerating}
              generationStartedAt={node.isGenerating ? genStart : undefined}
              visible={isSelected}
              onGenerate={s.handleGenerateVideo}
              onCancel={s.handleCancelGeneration}
            />
          )}
          
          {s.renderNodeErrorPanel(node)}
        </div>
      )}
      {/* 全景图生成节点 - 预设按钮 + 提示词可修改 */}
      {node.type === 'panoramaT2i' && (
        <div className="flex flex-col flex-[3] basis-0 min-h-0 overflow-hidden">
          {/* 工具栏 */}
          <div className="flex items-center gap-1 p-2 bg-[#252525] border-b border-[#333] shrink-0">
            <button
              onPointerDown={(e) => { e.stopPropagation(); s.setEyedropperTargetNodeId(node.id); }}
              className={`py-1 px-2 rounded text-[10px] flex items-center gap-1 ${eyedropperId === node.id ? 'bg-cyan-600 text-white' : 'bg-cyan-700 hover:bg-cyan-600 text-white'}`}
              title={eyedropperId === node.id ? "取消吸取" : "吸取图片"}
            >
              <EyedropperIcon size={10} /> 吸管
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const base64 = (evt.target?.result as string).split(',')[1];
                    s.handleUpdateNode(node.id, { images: [base64] });
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }}
              className="py-1 px-2 rounded text-[10px] bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-1"
              title="导入图片"
            >
              <ImageIcon size={10} /> 导入
            </button>
            <button
              onPointerDown={(e) => { e.stopPropagation(); s.handleCopyToImage(node.id); }}
              className="py-1 px-2 rounded text-[10px] bg-green-700 hover:bg-green-600 text-white flex items-center gap-1"
              title="复制视口到图片节点"
            >
              <CopyIcon size={10} /> 复制
            </button>
          </div>
          {/* 内容区域 */}
          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            {/* 图片预览 */}
            {countNodeImageSlots(node.images, node.imageAssetIds) > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                <div className="text-[10px] text-gray-400">生成: {node.images?.length ?? 0}张</div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {node.images?.map((img, idx) => {
                    const slotAssetId = node.imageAssetIds?.[idx];
                    if (!hasCanvasImagePayload(img, slotAssetId)) return null;
                    return (
                    <div key={idx} className="relative shrink-0 w-14 h-14 rounded overflow-hidden border border-[#444]">
                      <OptimizedImage
                        base64={img}
                        assetId={slotAssetId}
                        maxSide={160}
                        quality={0.72}
                        alt={`图${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); s.handleCopyToImage(node.id); }}
                        className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center text-white text-xs"
                        title="复制"
                      >
                        复制
                      </button>
                    </div>
                  );})}
                </div>
              </div>
            )}
            {/* 当前激活的预设显示 */}
            {node.activePresets && node.activePresets.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 rounded border border-indigo-600/50 mb-2">
                <span className="text-[10px] text-indigo-400">预设:</span>
                <span className="text-xs text-white font-bold">{node.activePresets.join(', ')}</span>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); s.handleClearPreset(node.id); }}
                  className="ml-auto text-[10px] text-gray-400 hover:text-white px-1 py-0.5 rounded hover:bg-white/10"
                >
                  清除
                </button>
              </div>
            )}
            {/* 预设按钮 */}
            <button
              onPointerDown={(e) => { e.stopPropagation(); s.handleTogglePreset(node.id, '全景图生成'); }}
              className={`w-full px-2 py-1 text-[10px] rounded transition-all mb-2 ${
                (node.activePresets ?? []).includes('全景图生成') 
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white ring-1 ring-indigo-400' 
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white'
              }`}
            >
              全景图生成
            </button>
          </div>
          <div className="relative flex flex-col shrink-0 p-2 border-t border-[#333] bg-[#252525]">
            <textarea
              className="w-full bg-[#222222] text-gray-200 text-xs p-2 rounded border border-[#333] focus:outline-none focus:border-indigo-500 transition-colors resize-y"
              value={node.prompt}
              onChange={(e) => s.handleUpdateNode(node.id, { prompt: e.target.value })}
              placeholder="补充描述..."
              onPointerDown={(e) => {
                e.stopPropagation();
                // 双击检测：基于时间戳
                const now = Date.now();
                if (now - s.bigEditorLastClickRef.current < 320) {
                  s.bigEditorLastClickRef.current = 0;
                  s.openBigEditor(node.prompt || '', (v) => s.handleUpdateNode(node.id, { prompt: v }));
                } else {
                  s.bigEditorLastClickRef.current = now;
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                s.openBigEditor(node.prompt || '', (v) => s.handleUpdateNode(node.id, { prompt: v }));
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                const nextHeight = Math.max(64, Math.round((e.currentTarget as HTMLTextAreaElement).offsetHeight));
                if (nextHeight !== (node.panoramaPromptHeight || 72)) {
                  s.handleUpdateNode(node.id, { panoramaPromptHeight: nextHeight });
                }
              }}
              style={{ height: node.panoramaPromptHeight || 72 }}
            />
          </div>
          <div className="flex gap-2 w-full shrink-0 px-2 pb-2">
          <button
              type="button"
            onPointerDown={(e) => { e.stopPropagation(); s.handleGenerate(node.id); }}
            disabled={node.isGenerating}
              className={`flex-1 min-w-0 py-2 rounded text-sm font-bold flex justify-center items-center gap-2 transition-all
              ${node.isGenerating ? 'bg-[#333] text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
              {node.isGenerating ? (
                <span className="flex items-center gap-2">
                  <LoaderIcon size={14} />
                  {genStart != null ? (
                    <GenerationTimer
                      startedAt={genStart}
                      className="tabular-nums text-[11px] opacity-90"
                      showSeconds
                    />
                  ) : null}
                </span>
              ) : (
                '生成全景图'
              )}
          </button>
            {node.isGenerating && (
              <button
                type="button"
                title="仅在点击「生成全景图」后出现，用于中断 ToAPIs 轮询"
                onPointerDown={(e) => { e.stopPropagation(); s.handleCancelGeneration(node.id); }}
                className="shrink-0 px-3 py-2 rounded text-sm font-medium bg-[#444] hover:bg-[#555] text-gray-200 border border-[#555]"
              >
                取消生成
              </button>
            )}
          </div>
          {node.error && (
            <div className="relative">
              {s.renderNodeErrorPanel(node)}
            </div>
          )}
        </div>
      )}
  </CanvasNodeShell>
);
}
