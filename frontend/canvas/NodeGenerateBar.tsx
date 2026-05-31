import React from 'react';
import { GenerationTimer } from './GenerationTimer';

export type NodeGenerateBarVariant = 'image' | 'video';

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
            ${isGenerating ? (isImage ? 'text-cyan-400 cursor-wait' : 'text-amber-400 cursor-wait') : 'text-white hover:brightness-110'}`}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <div className="gen-progress-orb">
                <div
                  className="gen-progress-orb-ring"
                  style={
                    isImage
                      ? undefined
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
                      : {
                          borderColor: 'rgba(255, 170, 0, 0.4)',
                          animationName: 'corePulseAmber',
                        }
                  }
                >
                  {isImage ? IMAGE_ORB_ICON : VIDEO_ORB_ICON}
                </div>
              </div>
              {generationStartedAt != null ? (
                <GenerationTimer
                  startedAt={generationStartedAt}
                  className={`${isImage ? 'gen-text-glitch' : 'gen-text-glitch-amber'} tabular-nums text-[11px] opacity-90`}
                  showSeconds
                  secondsClassName={`text-[10px] opacity-75 ${isImage ? 'text-cyan-300/70' : 'text-amber-300/70'}`}
                  glitch={isImage ? true : 'amber'}
                />
              ) : null}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {isImage ? IMAGE_ICON : VIDEO_ICON}
              {isImage ? (
                <span className="gen-text-holo">生成图片</span>
              ) : (
                <span
                  style={{
                    background: 'linear-gradient(90deg, #ffaa00 0%, #ffffff 25%, #ff6600 50%, #ffffff 75%, #ffaa00 100%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 0 8px rgba(255, 170, 0, 0.6))',
                  }}
                >
                  生成视频
                </span>
              )}
            </span>
          )}
        </button>
      </div>
      {isGenerating && (
        <button
          type="button"
          title={isImage ? '仅在点击「生成图片」后出现，用于中断 ToAPIs 轮询' : '仅在点击「生成视频」后出现，用于中断 ToAPIs 轮询'}
          onPointerDown={(e) => {
            e.stopPropagation();
            onCancel(nodeId);
          }}
          className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium gen-btn-cancel ${isImage ? 'text-cyan-400 hover:text-cyan-300' : 'gen-btn-cancel-video text-amber-400 hover:text-amber-300'}`}
        >
          取消
        </button>
      )}
    </div>
  );
}
