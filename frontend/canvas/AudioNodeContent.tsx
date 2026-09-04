import React from 'react';
import type { CanvasNode } from '../types';
import { UploadIcon } from './canvasIcons';
import {
  DEEPWHITE_AUDIO_SUNO_UI_ID,
  DEEPWHITE_AUDIO_TTS_UI_ID,
  DEEPWHITE_QWEN_TTS_VOICES,
} from '../services/deepwhiteAudio';

export interface AudioNodeContentProps {
  node: CanvasNode;
  onUpdate: (updates: Partial<CanvasNode>) => void;
}

export function AudioNodeContent({ node, onUpdate }: AudioNodeContentProps) {
  const inputId = `audio-upload-${node.id}`;
  const model = (node.model || DEEPWHITE_AUDIO_TTS_UI_ID).trim();
  const isSuno = model === DEEPWHITE_AUDIO_SUNO_UI_ID || model === 'suno-generation';
  const isTts = !isSuno;

  return (
    <div className="flex flex-col gap-2 p-3 bg-[#1a1a1a] shrink-0" onPointerDown={(e) => e.stopPropagation()}>
      <label className="text-[10px] text-gray-500">模型（DeepWhite）</label>
      <select
        className="w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
        value={model}
        onChange={(e) => onUpdate({ model: e.target.value })}
      >
        <option value={DEEPWHITE_AUDIO_TTS_UI_ID}>Qwen3-TTS-Instruct-Flash</option>
        <option value={DEEPWHITE_AUDIO_SUNO_UI_ID}>Suno Generation</option>
      </select>

      {isTts && (
        <>
          <label className="text-[10px] text-gray-500">音色</label>
          <select
            className="w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
            value={node.audioVoice || 'Cherry'}
            onChange={(e) => onUpdate({ audioVoice: e.target.value })}
          >
            {DEEPWHITE_QWEN_TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <label className="text-[10px] text-gray-500">风格说明（instructions，可选）</label>
          <input
            type="text"
            value={node.audioInstructions || ''}
            onChange={(e) => onUpdate({ audioInstructions: e.target.value })}
            placeholder="如：温柔、轻快、播音腔"
            className="w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
          />
        </>
      )}

      {isSuno && (
        <>
          <div className="flex gap-2">
            <label className="flex-1 text-[10px] text-gray-500">
              版本
              <select
                className="mt-0.5 w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
                value={node.sunoVersion || 'v5'}
                onChange={(e) => onUpdate({ sunoVersion: e.target.value })}
              >
                {['v3.5', 'v4', 'v4.5', 'v4.5+', 'v5', 'v5.5'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-[10px] text-gray-400">
            <input
              type="checkbox"
              checked={Boolean(node.sunoCustom)}
              onChange={(e) => onUpdate({ sunoCustom: e.target.checked })}
            />
            自定义歌词模式（custom）
          </label>
          <label className="flex items-center gap-2 text-[10px] text-gray-400">
            <input
              type="checkbox"
              checked={Boolean(node.sunoInstrumental)}
              onChange={(e) => onUpdate({ sunoInstrumental: e.target.checked })}
            />
            纯伴奏（instrumental）
          </label>
          {node.sunoCustom ? (
            <>
              <input
                type="text"
                value={node.sunoTitle || ''}
                onChange={(e) => onUpdate({ sunoTitle: e.target.value })}
                placeholder="曲名 title（可选）"
                className="w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={node.sunoStyle || ''}
                onChange={(e) => onUpdate({ sunoStyle: e.target.value })}
                placeholder="风格 style，如 lo-fi, piano"
                className="w-full bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
              />
            </>
          ) : null}
        </>
      )}

      <label className="text-[10px] text-gray-500">
        {isSuno ? (node.sunoCustom ? '歌词（prompt）' : '灵感提示词（prompt）') : '朗读文本（prompt）'}
      </label>
      <textarea
        value={node.prompt || ''}
        onChange={(e) => onUpdate({ prompt: e.target.value })}
        placeholder={
          isSuno
            ? node.sunoCustom
              ? '[Verse]\n雨夜霓虹灯下的街道…'
              : '深夜城市 lo-fi 钢琴配雨声'
            : '请输入要合成的语音文案'
        }
        rows={4}
        className="w-full resize-y min-h-[72px] bg-[#222] border border-[#444] rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
      />

      {node.error ? <div className="text-[10px] text-red-400 break-words">{node.error}</div> : null}

      {node.audio ? (
        <div className="flex flex-col gap-2">
          <audio src={node.audio} controls className="w-full h-8" />
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span className="truncate">{node.audioName || '音频文件'}</span>
            {node.audioDuration != null && node.audioDuration > 0 && (
              <span>
                {Math.floor(node.audioDuration / 60)}:
                {String(Math.floor(node.audioDuration % 60)).padStart(2, '0')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm('确定要删除音频吗？')) {
                onUpdate({ audio: undefined, audioDuration: undefined, audioName: undefined, audioUrl: undefined });
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-600/30 rounded hover:bg-red-900/20"
          >
            删除音频
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] text-gray-500 text-center py-1">也可上传本地音频作参考，或点下方生成</div>
          <input
            type="file"
            accept="audio/*"
            id={inputId}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const base64 = ev.target?.result as string;
                const audio = new Audio();
                audio.onloadedmetadata = () => {
                  onUpdate({
                    audio: base64,
                    audioDuration: audio.duration,
                    audioName: file.name,
                  });
                };
                audio.src = base64;
              };
              reader.readAsDataURL(file);
            }}
          />
          <label
            htmlFor={inputId}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-[#333] hover:bg-[#444] text-white text-xs rounded cursor-pointer"
          >
            <UploadIcon size={14} />
            上传音频
          </label>
        </div>
      )}
    </div>
  );
}
