import React from 'react';
import { GenerationTimer } from './GenerationTimer';

export type NodeGenerateBarVariant = 'image' | 'video' | 'audio';

export interface NodeGenerateBarProps {
  nodeId: string;
  variant: NodeGenerateBarVariant;
  isGenerating: boolean;
  generationStartedAt?: number;
  /** 为 false 时隐藏（视频节点未选中时使用） */
  visible?: boolean;
  onGenerate: (nodeId: string) => void;
  onCancel: (nodeId: string) => void;
}

const IMAGE_ICON = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const VIDEO_ICON = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
    <path
      d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1V5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IMAGE_ORB_ICON = (
  <svg className="w-3 h-3 text-cyan-400" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const VIDEO_ORB_ICON = (
  <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none">
    <path d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const AUDIO_ICON = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
    <path
      d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AUDIO_ORB_ICON = (
  <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none">
    <path
      d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export function NodeGenerateBar({
  nodeId,
  variant,
  isGenerating,
  generationStartedAt,
  visible = true,
  onGenerate,
  onCancel,
}: NodeGenerateBarProps) {
  const isImage = variant === 'image';
  const isAudio = variant === 'audio';
  const accentWait = isImage ? 'text-cyan-400 cursor-wait' : isAudio ? 'text-blue-400 cursor-wait' : 'text-amber-400 cursor-wait';
  const labelIdle = isImage ? '生成图片' : isAudio ? '生成音频' : '生成视频';
  const cancelTitle = isImage
    ? '仅在点击「生成图片」后出现，用于中断轮询'
    : isAudio
      ? '仅在点击「生成音频」后出现，用于中断 DeepWhite 轮询'
      : '仅在点击「生成视频」后出现，用于中断轮询';
  const wrapperClass = `flex gap-2 w-full shrink-0${visible ? '' : ' hidden'}`;
  const coreClass = isImage
    ? isGenerating
      ? 'gen-btn-generating'
      : 'gen-btn-holo'
    : isGenerating
      ? 'gen-btn-generating'
      : 'gen-btn-video-core';

  return (
    <div className={wrapperClass}>
      <div className={`relative flex-1 min-w-0 ${coreClass}`}>
        {isImage && !isGenerating && (
          <>
            <span className="gen-btn-cyber-corner top-left" />
            <span className="gen-btn-cyber-corner top-right" />
            <span className="gen-btn-cyber-corner bottom-left" />
            <span className="gen-btn-cyber-corner bottom-right" />
            <span className="holo-particles" />
          </>
        )}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            onGenerate(nodeId);
          }}
          disabled={isGenerating}
          className={`relative w-full py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition-all
            ${isGenerating ? accentWait : 'text-white hover:brightness-110'}`}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <div className="gen-progress-orb">
                <div
                  className="gen-progress-orb-ring"
                  style={
                    isImage
                      ? undefined
                      : isAudio
                        ? {
                            background: 'conic-gradient(from 0deg, #60a5fa 0deg, #2563eb 180deg, #60a5fa 360deg)',
                            filter: 'drop-shadow(0 0 6px rgba(96, 165, 250, 0.8))',
                          }
                        : {
                            background: 'conic-gradient(from 0deg, #ffaa00 0deg, #ff6600 180deg, #ffaa00 360deg)',
                            filter: 'drop-shadow(0 0 6px rgba(255, 170, 0, 0.8))',
                          }
                  }
                />
                <div
                  className="gen-progress-orb-core"
                  style={
                    isImage
                      ? undefined
                      : isAudio
                        ? {
                            borderColor: 'rgba(96, 165, 250, 0.4)',
                          }
                        : {
                            borderColor: 'rgba(255, 170, 0, 0.4)',
                            animationName: 'corePulseAmber',
                          }
                  }
                >
                  {isImage ? IMAGE_ORB_ICON : isAudio ? AUDIO_ORB_ICON : VIDEO_ORB_ICON}
                </div>
              </div>
              {generationStartedAt != null ? (
                <GenerationTimer
                  startedAt={generationStartedAt}
                  className={`${isImage ? 'gen-text-glitch' : isAudio ? 'text-blue-300' : 'gen-text-glitch-amber'} tabular-nums text-[11px] opacity-90`}
                  showSeconds
                  secondsClassName={`text-[10px] opacity-75 ${isImage ? 'text-cyan-300/70' : isAudio ? 'text-blue-300/70' : 'text-amber-300/70'}`}
                  glitch={isImage ? true : isAudio ? false : 'amber'}
                />
              ) : null}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {isImage ? IMAGE_ICON : isAudio ? AUDIO_ICON : VIDEO_ICON}
              {isImage ? (
                <span className="gen-text-holo">{labelIdle}</span>
              ) : (
                <span
                  style={
                    isAudio
                      ? {
                          background: 'linear-gradient(90deg, #60a5fa 0%, #ffffff 25%, #3b82f6 50%, #ffffff 75%, #60a5fa 100%)',
                          backgroundSize: '200% 100%',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          filter: 'drop-shadow(0 0 8px rgba(96, 165, 250, 0.6))',
                        }
                      : {
                          background: 'linear-gradient(90deg, #ffaa00 0%, #ffffff 25%, #ff6600 50%, #ffffff 75%, #ffaa00 100%)',
                          backgroundSize: '200% 100%',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          filter: 'drop-shadow(0 0 8px rgba(255, 170, 0, 0.6))',
                        }
                  }
                >
                  {labelIdle}
                </span>
              )}
            </span>
          )}
        </button>
      </div>
      {isGenerating && (
        <button
          type="button"
          title={cancelTitle}
          onPointerDown={(e) => {
            e.stopPropagation();
            onCancel(nodeId);
          }}
          className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium gen-btn-cancel ${
            isImage
              ? 'text-cyan-400 hover:text-cyan-300'
              : isAudio
                ? 'text-blue-400 hover:text-blue-300'
                : 'gen-btn-cancel-video text-amber-400 hover:text-amber-300'
          }`}
        >
          取消
        </button>
      )}
    </div>
  );
}
