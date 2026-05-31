import React from 'react';
import type { CanvasNode } from '../types';
import { UploadIcon } from './canvasIcons';

export interface AudioNodeContentProps {
  node: CanvasNode;
  onUpdate: (updates: Partial<CanvasNode>) => void;
}

export function AudioNodeContent({ node, onUpdate }: AudioNodeContentProps) {
  const inputId = `audio-upload-${node.id}`;

  return (
    <div className="flex flex-col gap-2 p-3 bg-[#1a1a1a] shrink-0">
      {node.audio ? (
        <div className="flex flex-col gap-2">
          <audio src={node.audio} controls className="w-full h-8" />
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>{node.audioName || '音频文件'}</span>
            {node.audioDuration != null && node.audioDuration > 0 && (
              <span>
                {Math.floor(node.audioDuration / 60)}:
                {String(Math.floor(node.audioDuration % 60)).padStart(2, '0')}
              </span>
            )}
          </div>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (confirm('确定要删除音频吗？')) {
                onUpdate({ audio: undefined, audioDuration: undefined, audioName: undefined });
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-600/30 rounded hover:bg-red-900/20"
          >
            删除音频
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] text-gray-500 text-center py-2">
            上传或录制音频作为视频生成的语音参考
          </div>
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
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded cursor-pointer"
          >
            <UploadIcon size={14} />
            上传音频
          </label>
        </div>
      )}
    </div>
  );
}
