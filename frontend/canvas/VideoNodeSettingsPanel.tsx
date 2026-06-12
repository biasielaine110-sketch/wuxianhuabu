import React, { useEffect, useMemo, useState } from 'react';
import type { CanvasNode, Edge } from '../types';
import { buildIncomingRefSlots } from '../referenceSlots';
import { OptimizedImage } from './OptimizedImage';
import { EyedropperIcon } from './canvasIcons';
import {
  getVideoModelSwitchUpdates,
  isJimengVideoModel,
  isManxueGrokImagineVideoModel,
  isVideoDoubaoFamilyModel,
  isVideoDoubaoSeedance2Model,
  isVideoGrokDurationStyleModel,
  isVideoSoraStyleModel,
  isVideoVeoStyleModel,
  MANXUE_GROK_IMAGINE_VIDEO_MODEL,
} from './videoModelUtils';
import { readImageBase64AspectRatio } from '../services/openaiCompatibleService';

export interface VideoNodeSettingsPanelProps {
  node: CanvasNode;
  nodes: CanvasNode[];
  edges: Edge[];
  eyedropperTargetNodeId: string | null;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onDeleteEdge: (edgeId: string) => void;
  setEyedropperTargetNodeId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function VideoNodeSettingsPanel({
  node,
  nodes,
  edges,
  eyedropperTargetNodeId,
  onUpdateNode,
  onDeleteEdge,
  setEyedropperTargetNodeId,
}: VideoNodeSettingsPanelProps) {
  const vm = node.model || '';
  const modelSelectValue = node.model || '';
  const isSora = isVideoSoraStyleModel(vm);
  const isVeo = isVideoVeoStyleModel(vm);
  const isGroDur = isVideoGrokDurationStyleModel(vm);
  const isDoubao = isVideoDoubaoFamilyModel(vm);
  const isSeedance2 = vm === 'seedance-2';
  const isSeedance2Fast = vm === 'seedance-2-fast';
  const isGemini = vm === 'gemini-omni-flash';
  const isDoubaoSeedance2 = isVideoDoubaoSeedance2Model(vm);
  const isManxueGrokImagine = isManxueGrokImagineVideoModel(vm);
  const isToApisGrokVideo15 = vm === 'grok-video-1.5-preview';
  const isAiidGrokImagine = vm === 'grok-imagine-video-1.5-preview-aiid';
  // 任一 grok 视频模型都需要参考图画幅探测提示
  const isGrokWithRefAspectDetect = isManxueGrokImagine || isToApisGrokVideo15 || isAiidGrokImagine;

  const vSlots = useMemo(() => buildIncomingRefSlots(node.id, edges, nodes), [node.id, edges, nodes]);
  const imageSlots = vSlots.filter((s) => s.kind === 'image');
  const videoSlots = vSlots.filter((s) => s.kind === 'video');
  const audioSlots = vSlots.filter((s) => s.kind === 'audio');

  // Grok 视频（满 e 1.5 / ToAPIs 1.5 Preview）：图生视频时画幅由参考图实际比例决定，UI 探测并提示
  const [refAspect, setRefAspect] = useState<{
    canonical: string;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRefAspect(null);
    if (!isGrokWithRefAspectDetect || imageSlots.length === 0) return;
    const firstSlot = imageSlots[0];
    const b64 =
      firstSlot.imageBase64 ||
      (firstSlot.imageBase64s && firstSlot.imageBase64s[0]) ||
      '';
    if (!b64) return;
    const ctrl = new AbortController();
    readImageBase64AspectRatio(b64, ctrl.signal).then((r) => {
      if (cancelled) return;
      if (r) setRefAspect({ canonical: r.canonical, width: r.width, height: r.height });
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [isGrokWithRefAspectDetect, imageSlots]);

  const aspectMismatch =
    isGrokWithRefAspectDetect && refAspect && refAspect.canonical !== 'other' &&
    refAspect.canonical !== (node.aspectRatio || '16:9');

  return (
    <div className="flex flex-col gap-3 p-3 bg-[#252525] border-b border-[#333] text-xs shrink-0">
      <div className="flex items-center gap-3 px-3 py-2 bg-[#1a1a1a] rounded-lg text-xs">
        <span className="text-gray-400 shrink-0 font-medium">参考素材:</span>
        <span className="text-green-400 font-semibold shrink-0">
          {imageSlots.length} 图
          {videoSlots.length > 0 && (
            <span className="text-amber-400"> · {videoSlots.length} 视频</span>
          )}
          {audioSlots.length > 0 && (
            <span className="text-blue-400"> · {audioSlots.length} 语音</span>
          )}
        </span>
        <div className="flex gap-2 ml-2 flex-wrap">
          {vSlots.slice(0, 12).map((slot) => (
            <div key={`${node.id}-vslot-${slot.n}`} className="relative group">
              <div className="absolute -top-1 left-0 z-[1] rounded bg-black/70 px-1 text-[8px] font-bold leading-none text-cyan-300">
                R{slot.n}
              </div>
              {slot.kind === 'image' && slot.imageBase64 ? (
                <OptimizedImage
                  base64={slot.imageBase64}
                  maxSide={80}
                  quality={0.72}
                  alt={slot.label}
                  className="w-9 h-9 rounded border border-[#444] object-cover"
                />
              ) : slot.kind === 'video' && slot.videoUrl ? (
                <video
                  src={slot.videoUrl}
                  className="w-9 h-9 rounded border border-[#444] object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : slot.kind === 'audio' ? (
                <div className="w-9 h-9 rounded border border-[#444] bg-[#333] flex items-center justify-center" title={slot.label}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                </div>
              ) : (
                <div className="w-9 h-9 rounded border border-[#444] bg-[#333]" title={slot.label} />
              )}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(slot.edgeId);
                }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="取消引用"
              >
                <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
          {vSlots.length > 12 && (
            <span className="flex items-center text-gray-500">+{vSlots.length - 12}</span>
          )}
        </div>
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            setEyedropperTargetNodeId(node.id);
          }}
          className={`ml-auto shrink-0 rounded-lg px-3 py-1.5 text-white text-xs font-medium ${eyedropperTargetNodeId === node.id ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'}`}
          title={eyedropperTargetNodeId === node.id ? '取消吸取' : '吸取参考（图片 / 视频 / 语音节点）'}
        >
          <EyedropperIcon size={14} />
        </button>
      </div>
      <div className="text-xs text-gray-500 px-1 leading-relaxed">
        需 OpenAI 兼容 + ToAPIs Base URL。最多 3 张参考图（视频将截取关键帧）{audioSlots.length > 0 && <span className="text-blue-400 font-medium">· 已连接语音参考</span>}。
        {isVeo
          ? ' · Veo：固定 8 秒；画幅 16:9 或 9:16；720p/1080p/4k'
          : isSora
            ? ' · Sora 系：4/8/12 秒、16:9 或 9:16、720p'
            : isGroDur
              ? ' · Grok：多档秒数与画幅'
              : isDoubao
                ? ' · Seedance 2：5-10 秒；画幅 16:9/9:16/1:1'
                : isManxueGrokImagine
                  ? ' · 满 e Grok Imagine：10/15 秒、720p；需满 e API Key'
                  : ''}
      </div>
      {!isSora && !isVeo && isGroDur && (
        <div className="text-[9px] text-amber-600/95 px-1 leading-snug">
          分辨率：Grok 系路径已随请求发送 resolution；若成品仍为 480p，多为上游默认。
        </div>
      )}
      {isGrokWithRefAspectDetect && refAspect && (
        <div
          className={`text-[10px] px-2 py-1.5 rounded leading-snug border ${
            aspectMismatch
              ? 'text-amber-200 bg-amber-950/40 border-amber-700/60'
              : 'text-cyan-200/90 bg-cyan-950/30 border-cyan-800/40'
          }`}
        >
          参考图：{refAspect.width}×{refAspect.height}（{refAspect.canonical}）。
          {aspectMismatch
            ? isAiidGrokImagine
              ? `当前选 ${node.aspectRatio || '16:9'} ≠ 参考图 ${refAspect.canonical}，提交时将按所选 ${node.aspectRatio || '16:9'} 输出（AIID 走异步任务，aspect_ratio 字段会按字面生效）。`
              : isToApisGrokVideo15
                ? `当前选 ${node.aspectRatio || '16:9'} ≠ 参考图 ${refAspect.canonical}，提交时将按所选 ${node.aspectRatio || '16:9'} 拉伸参考图（ToAPIs grok-video-1.5-preview 支持 aspect_ratio override）。`
                : `当前选 ${node.aspectRatio || '16:9'} ≠ 参考图 ${refAspect.canonical}，提交时将按所选 ${node.aspectRatio || '16:9'} 拉伸参考图（满 e chat 路由需 prompt + 字段双管齐下，可能仍被忽略）。`
            : '画幅与参考图一致。'}
        </div>
      )}
      {isAiidGrokImagine && imageSlots.length === 0 && (
        <div className="text-[10px] px-2 py-1.5 rounded leading-snug border text-amber-200 bg-amber-950/40 border-amber-700/60">
          Grok Imagine Video 1.5 Preview **仅支持图生视频**（I2V），请连接至少一张参考图。
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="nodemodel-select bg-[#222222] border border-[#444] rounded-lg px-3 py-2 text-gray-300 outline-none focus:border-amber-500 min-w-[160px] text-sm"
          value={modelSelectValue}
          onChange={(e) => {
            onUpdateNode(node.id, getVideoModelSwitchUpdates(e.target.value, node));
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <optgroup label="ToAPIs">
            <option value="veo3.1-fast">Veo 3.1 Fast</option>
            <option value="grok-video-3">Grok Video 3</option>
            <option value="grok-video-1.5-preview">Grok Video 1.5 Preview</option>
            <option value="sora-2-vvip">Sora2 VVIP</option>
            <option value="doubao-seedance-1-5-pro">Doubao SeeDance 1.5 Pro</option>
            <option value="seedance-2">Seedance 2</option>
            <option value="seedance-2-fast">Seedance 2 Fast</option>
            <option value="gemini-omni-flash">Gemini Omni Flash</option>
          </optgroup>
          <optgroup label="满 e (manxueapi.com)">
            <option value={MANXUE_GROK_IMAGINE_VIDEO_MODEL}>Grok Imagine Video 1.5 Preview（满 e）</option>
          </optgroup>
          <optgroup label="AIID (豆包Seedance2.0)">
            <option value="doubao-seedance-2-0-260128">Doubao Seedance 2.0</option>
            <option value="doubao-seedance-2-0-fast-260128">Doubao Seedance 2.0 Fast</option>
            <option value="grok-imagine-video-1.5-preview-aiid">Grok Imagine Video 1.5 Preview（AIID · 图生视频）</option>
          </optgroup>
          <optgroup label="即梦 (Dreamina)">
            <option value="jimeng-seedance2.0fast">即梦 Seedance 2.0 (Fast)</option>
            <option value="jimeng-seedance2.0">即梦 Seedance 2.0</option>
            <option value="jimeng-seedance2.0fast-vip">即梦 Seedance 2.0 Fast (VIP)</option>
            <option value="jimeng-seedance2.0-vip">即梦 Seedance 2.0 (VIP)</option>
          </optgroup>
        </select>
        {isJimengVideoModel(node.model) && (
          <select
            className="bg-[#222222] border border-[#444] rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none focus:border-blue-500"
            value={node.videoMode || 'image2video'}
            onChange={(e) => onUpdateNode(node.id, { videoMode: e.target.value as CanvasNode['videoMode'] })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="image2video">图生视频</option>
            <option value="frames2video">首尾帧</option>
            <option value="multiframe2video">智能多帧</option>
            <option value="multimodal2video">全能参考</option>
          </select>
        )}
        <div className="nodemeta-skip-scale flex flex-wrap items-center gap-1.5">
          {isVeo ? (
            <span className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-400 text-xs whitespace-nowrap">
              8 秒（固定）
            </span>
          ) : isSora ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[4, 8, 12].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={4}>4 秒 (7毛)</option>
              <option value={8}>8 秒 (1元)</option>
              <option value={12}>12 秒 (1.3元)</option>
            </select>
          ) : isDoubao ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[4, 5, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={4}>4 秒</option>
              <option value={5}>5 秒</option>
              <option value={8}>8 秒</option>
              <option value={10}>10 秒</option>
              <option value={12}>12 秒</option>
              <option value={15}>15 秒</option>
            </select>
          ) : isDoubaoSeedance2 ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[4, 6, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={4}>4 秒</option>
              <option value={6}>6 秒</option>
              <option value={8}>8 秒</option>
              <option value={10}>10 秒</option>
              <option value={12}>12 秒</option>
              <option value={15}>15 秒</option>
            </select>
          ) : isSeedance2 ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[4, 5, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={4}>4 秒</option>
              <option value={5}>5 秒</option>
              <option value={8}>8 秒</option>
              <option value={10}>10 秒</option>
              <option value={12}>12 秒</option>
              <option value={15}>15 秒</option>
            </select>
          ) : isSeedance2Fast ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[4, 5, 8, 10, 12].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={4}>4 秒</option>
              <option value={5}>5 秒</option>
              <option value={8}>8 秒</option>
              <option value={10}>10 秒</option>
              <option value={12}>12 秒</option>
            </select>
          ) : isGemini ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[6, 10].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 6}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={6}>6 秒 (1元)</option>
              <option value={10}>10 秒 (1.4元)</option>
            </select>
          ) : isManxueGrokImagine ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[10, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 10}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={10}>10 秒</option>
              <option value={15}>15 秒</option>
            </select>
          ) : isJimengVideoModel(node.model) ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={[4, 5, 7, 8, 10, 12, 15].includes(node.videoDuration ?? 0) ? (node.videoDuration as number) : 8}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={4}>4 秒</option>
              <option value={5}>5 秒</option>
              <option value={7}>7 秒</option>
              <option value={8}>8 秒</option>
              <option value={10}>10 秒</option>
              <option value={12}>12 秒</option>
              <option value={15}>15 秒</option>
            </select>
          ) : (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.videoDuration ?? 10}
              onChange={(e) => onUpdateNode(node.id, { videoDuration: parseInt(e.target.value, 10) })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value={5}>5 秒（API 提交为 6 秒）</option>
              <option value={10}>10 秒</option>
              <option value={15}>15 秒</option>
              <option value={20}>20 秒</option>
              <option value={25}>25 秒</option>
              <option value={30}>30 秒</option>
            </select>
          )}
          {isVeo ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.aspectRatio || '16:9'}
              onChange={(e) => onUpdateNode(node.id, { aspectRatio: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1（按 16:9 提交）</option>
              <option value="4:3">4:3（按 16:9 提交）</option>
              <option value="3:4">3:4（按 16:9 提交）</option>
              <option value="3:2">3:2（按 16:9 提交）</option>
              <option value="2:3">2:3（按 16:9 提交）</option>
            </select>
          ) : isSora ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.aspectRatio === '9:16' ? '9:16' : '16:9'}
              onChange={(e) => onUpdateNode(node.id, { aspectRatio: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          ) : isDoubao ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.aspectRatio || '16:9'}
              onChange={(e) => onUpdateNode(node.id, { aspectRatio: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
              <option value="21:9">21:9</option>
            </select>
          ) : (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.aspectRatio || '16:9'}
              onChange={(e) => onUpdateNode(node.id, { aspectRatio: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="3:2">3:2</option>
              <option value="2:3">2:3</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
          )}
          {isSora ? (
            <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p</span>
          ) : isVeo ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={
                node.videoResolution === '4k'
                  ? node.videoResolution
                  : '1080p'
              }
              onChange={(e) =>
                onUpdateNode(node.id, {
                  videoResolution: e.target.value as '1080p' | '4k',
                })
              }
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="1080p">1080p (6毛/次)</option>
              <option value="4k">4K (1.5元/次)</option>
            </select>
          ) : isDoubao ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.videoResolution === '480p' || node.videoResolution === '1080p' ? node.videoResolution : '720p'}
              onChange={(e) =>
                onUpdateNode(node.id, { videoResolution: e.target.value as '480p' | '720p' | '1080p' })
              }
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="480p">480p (1.4毛/秒)</option>
              <option value="720p">720p (2.9毛/秒)</option>
              <option value="1080p">1080p (7.5毛/秒)</option>
            </select>
          ) : isSeedance2 ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.videoResolution === '1080p' ? '1080p' : '720p'}
              onChange={(e) =>
                onUpdateNode(node.id, { videoResolution: e.target.value as '720p' | '1080p' })
              }
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="720p">720p (1元/秒)</option>
              <option value="1080p">1080p (2.5元/秒)</option>
            </select>
          ) : isSeedance2Fast ? (
            <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p (8毛/秒)</span>
          ) : isGemini ? (
            <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p</span>
          ) : isManxueGrokImagine ? (
            <span className="text-gray-400 px-1.5 py-1 border border-[#444] rounded bg-[#222222]">720p</span>
          ) : (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-gray-300 outline-none focus:border-amber-500"
              value={node.videoResolution === '480p' ? '480p' : '720p'}
              onChange={(e) => onUpdateNode(node.id, { videoResolution: e.target.value as '480p' | '720p' })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="480p">480p</option>
              <option value="720p">720p</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
