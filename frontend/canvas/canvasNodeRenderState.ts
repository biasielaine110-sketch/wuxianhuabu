import type { MutableRefObject, PointerEvent, ReactNode, Dispatch, SetStateAction } from 'react';
import type { CanvasNode, Edge, ChatMessage } from '../types';
import type { CopyToImageLayout, CopyToImageOptions } from './copyToImageOptions';

export type PresetDomainId = 'chat' | 't2i' | 'i2i';
export type I2iPresetCategoryId = 'character' | 'scene' | 'props' | 'storyboard' | 'other';

export type CanvasViewportSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

/** renderNode 运行时从 ref 读取的快照，避免 renderNode 闭包导致 MemoNodeCard 失效 */
export type CanvasNodeRenderState = {
  selectedIdSet: Set<string>;
  visibleNodeIds: Set<string>;
  eyedropperTargetNodeId: string | null;
  editingTextNodeIds: Set<string>;
  promptPresets: Record<string, string>;
  textNodeFontSize: number;
  importTargetNodeId: string | null;
  nodes: CanvasNode[];
  edges: Edge[];
  nodesRef: MutableRefObject<CanvasNode[]>;
  edgesRef: MutableRefObject<Edge[]>;
  edgesKey: string;
  generationStartedAtRef: MutableRefObject<Map<string, number>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  bigEditorLastClickRef: MutableRefObject<number>;
  canReceiveConnection: (node: CanvasNode) => boolean;
  handleUpdateNode: (id: string, updates: Partial<CanvasNode>) => void;
  handleNodePointerDown: (e: PointerEvent, id: string) => void;
  handlePortPointerDown: (e: PointerEvent, nodeId: string) => void;
  handleDeleteEdge: (id: string) => void;
  handleGenerate: (nodeId: string) => void;
  handleGenerateVideo: (nodeId: string) => void;
  handleCancelGeneration: (nodeId: string) => void;
  handleSendMessage: (nodeId: string, opts?: { baseMessages?: ChatMessage[]; promptText?: string }) => void;
  handleOptimizePrompt: (nodeId: string, text: string) => void;
  handleClearPreset: (nodeId: string) => void;
  handleTogglePreset: (nodeId: string, presetKey: string) => void;
  handleCopyToImage: (nodeId: string, layoutOrOptions?: CopyToImageLayout | CopyToImageOptions) => void;
  handleResetNodeSize: (nodeId: string) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleCanvasEyedropper: (sourceId: string, targetId: string) => boolean;
  openBigEditor: (current: string, onSave: (v: string) => void) => void;
  openFullscreenImage: (nodeId: string, img: string, idx: number) => void;
  openFullscreenFromBase64: (base64: string) => void;
  renderNodeErrorPanel: (node: CanvasNode) => ReactNode;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  setEyedropperTargetNodeId: Dispatch<SetStateAction<string | null>>;
  setEditingTextNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setImportTargetNodeId: Dispatch<SetStateAction<string | null>>;
  setTextNodeFontSize: (size: number) => void;
  setShowSettingsModal: Dispatch<SetStateAction<boolean>>;
  setSettingsTab: Dispatch<SetStateAction<'api' | 'presets' | 'downloads' | 'credits' | 'appearance'>>;
  setFullscreenImage: Dispatch<SetStateAction<string | null>>;
  canvasViewportRef: MutableRefObject<CanvasViewportSnapshot>;
  beginNodeResize: (e: PointerEvent, nodeId: string, direction: string) => void;
  eyedropperTargetNodeIdRef: MutableRefObject<string | null>;
  promptPresetDomainOverrides: Record<string, PresetDomainId>;
  promptPresetCategoryOverrides: Record<string, I2iPresetCategoryId>;
  thumbResolutionPct: number;
  downloadVideoFromUrl: (url: string, filename?: string) => void;
  appendNodesWithUndo: (
    newNodes: CanvasNode[],
    options?: { edges?: Edge[]; selectIds?: string[] }
  ) => void;
};

export type CanvasNodeRenderStateRef = MutableRefObject<CanvasNodeRenderState>;
