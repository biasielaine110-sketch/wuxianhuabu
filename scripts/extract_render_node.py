import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "frontend"
lines = (root / "CanvasApp.tsx").read_text(encoding="utf-8").splitlines()

body_lines = lines[6287:7026]
body = "\n".join(body_lines)
body = re.sub(r"^    ", "", body, flags=re.M)

handlers = [
    "handleNodePointerDown",
    "handlePortPointerDown",
    "beginNodeResize",
    "handleUpdateNode",
    "handleCopyToImage",
    "handleCanvasEyedropper",
    "openFullscreenImage",
    "setEyedropperTargetNodeId",
    "setImportTargetNodeId",
    "handleDeleteEdge",
    "setFullscreenImage",
    "handleSendMessage",
    "setSettingsTab",
    "setShowSettingsModal",
    "openBigEditor",
    "handleCancelGeneration",
    "openFullscreenFromBase64",
    "handleOptimizePrompt",
    "handleResetNodeSize",
    "handleDeleteNode",
    "handleGenerate",
    "handleGenerateVideo",
    "handleClearPreset",
    "handleTogglePreset",
    "renderNodeErrorPanel",
    "downloadVideoFromUrl",
    "setSelectedIds",
    "setEditingTextNodeIds",
    "setTextNodeFontSize",
]
for h in handlers:
    body = re.sub(rf"(?<!s\.)(?<![.\w]){h}(?=\()", f"s.{h}", body)

ref_map = [
    "fileInputRef",
    "eyedropperTargetNodeIdRef",
    "nodesRef",
    "bigEditorLastClickRef",
    "promptPresets",
    "promptPresetDomainOverrides",
    "promptPresetCategoryOverrides",
]
for old in ref_map:
    body = re.sub(rf"(?<!s\.)(?<![.\w]){old}\.", f"s.{old}.", body)

header = """export function renderCanvasNode(node: CanvasNode, s: CanvasNodeRenderState): React.ReactNode {
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

"""

body = re.sub(
    r"^const genStart.*?^  const hasOutputPort = true;\n\n",
    "",
    body,
    count=1,
    flags=re.S | re.M,
)

imports = """import React, { lazy, Suspense } from 'react';
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

"""

out = imports + header + body.rstrip()
if out.endswith("};"):
    out = out[:-2] + "}"
elif not out.endswith("}"):
    out += "\n}"

(root / "canvas" / "renderCanvasNode.tsx").write_text(out + "\n", encoding="utf-8")
print("Wrote renderCanvasNode.tsx", len(out.splitlines()), "lines")
