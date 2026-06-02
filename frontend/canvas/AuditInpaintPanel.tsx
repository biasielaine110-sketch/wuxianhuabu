import React from 'react';
import { base64ToImageDataUrl } from './auditImageUtils';
import { MAX_AUDIT_INPAINT_REFERENCES } from './auditInpaintRefs';
import { EyedropperIcon } from './canvasIcons';
import {
  defaultCanvasImageModel,
  isGptImage2CanvasModelId,
  isManxueGptImage2Model,
} from './canvasModelUtils';

export interface AuditInpaintPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  resolution: string;
  onResolutionChange: (value: string) => void;
  quality: string;
  onQualityChange: (value: string) => void;
  previewBase64?: string;
  cropWidth?: number;
  cropHeight?: number;
  needsReconfirm?: boolean;
  isGenerating?: boolean;
  error?: string | null;
  onOpenBigEditor?: (current: string, onSave: (v: string) => void) => void;
  onGenerate?: () => void;
  onCancelGenerate?: () => void;
  regionConfirmed?: boolean;
  referenceImages?: { id: string; base64: string }[];
  refPickActive?: boolean;
  onToggleRefPick?: () => void;
  onRemoveReference?: (imageId: string) => void;
  contentPanelExpanded?: boolean;
  onToggleContentPanel?: () => void;
}

/** 画布坐标系下未 scale 前的面板宽度；与 AuditModeCanvas 中 scale 相乘后约 280px */
export const AUDIT_INPAINT_PANEL_BASE_WIDTH = Math.round(280 / 3);
export const AUDIT_INPAINT_PANEL_CANVAS_SCALE = 3;
/** 面板外壳宽度（未 scale）。scale(3) 后约 960px，刚好容纳 4 列参数 + 描述 textarea */
export const AUDIT_INPAINT_PANEL_SHELL_WIDTH = 320;

/** 看图模式局部重绘：紧贴选区旁的内联控件（外层 scale 放大） */
export function AuditInpaintPanel({
  prompt,
  onPromptChange,
  model,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  quality,
  onQualityChange,
  previewBase64,
  cropWidth,
  cropHeight,
  needsReconfirm,
  isGenerating,
  error,
  onOpenBigEditor,
  onGenerate,
  onCancelGenerate,
  regionConfirmed,
  referenceImages = [],
  refPickActive = false,
  onToggleRefPick,
  onRemoveReference,
  contentPanelExpanded = true,
  onToggleContentPanel,
}: AuditInpaintPanelProps) {
  const showQuality = isGptImage2CanvasModelId(model) || isManxueGptImage2Model(model);
  const canGenerate = !!regionConfirmed && !needsReconfirm && !!prompt.trim();

  const panelHeaderActions = (
    <div className="flex items-center gap-2 min-w-0 shrink-0">
      {contentPanelExpanded && cropWidth && cropHeight ? (
        <span className="text-[10px] text-gray-500 shrink-0">{cropWidth}×{cropHeight}px</span>
      ) : null}
      {isGenerating ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancelGenerate}
          className="py-1 px-2.5 rounded text-[11px] font-medium bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-700/50 shrink-0"
        >
          取消
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onGenerate}
          disabled={!canGenerate}
          className={`py-1 px-2.5 rounded text-[11px] font-medium shrink-0 transition-all disabled:cursor-not-allowed ${
            canGenerate
              ? 'bg-cyan-700 hover:bg-cyan-600 text-white shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'bg-[#2a2a2a] text-gray-600 opacity-45'
          }`}
          title={canGenerate ? '根据描述与选区重绘' : needsReconfirm ? '请先确认选区' : '请先填写描述'}
        >
          重绘
        </button>
      )}
    </div>
  );

  if (!contentPanelExpanded) {
    return (
      <div
        className="pointer-events-auto bg-[#1a1a1a]/95 border border-purple-500/40 rounded-xl shadow-2xl overflow-hidden flex flex-col w-full min-w-0"
        style={{
          width: AUDIT_INPAINT_PANEL_SHELL_WIDTH,
          minWidth: AUDIT_INPAINT_PANEL_SHELL_WIDTH,
          maxWidth: AUDIT_INPAINT_PANEL_SHELL_WIDTH,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 bg-[#222] flex items-center justify-between gap-2 min-h-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-purple-300 font-medium shrink-0">局部重绘</span>
            {onToggleContentPanel && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onToggleContentPanel}
                className="shrink-0 py-0.5 px-1.5 rounded text-[10px] text-cyan-400 hover:text-cyan-200 hover:bg-[#333] border border-cyan-700/40"
                title="展开局部重绘面板"
              >
                展开
              </button>
            )}
            {isGenerating && (
              <span className="text-[10px] text-purple-300 animate-pulse truncate">生成中…</span>
            )}
            {!isGenerating && error ? (
              <span className="text-[10px] text-red-300 truncate max-w-[120px]" title={error}>
                {error}
              </span>
            ) : null}
          </div>
          {panelHeaderActions}
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto bg-[#1a1a1a]/95 border border-purple-500/40 rounded-xl shadow-2xl overflow-hidden flex flex-col w-full min-w-0"
      style={{
        width: AUDIT_INPAINT_PANEL_SHELL_WIDTH,
        minWidth: AUDIT_INPAINT_PANEL_SHELL_WIDTH,
        maxWidth: AUDIT_INPAINT_PANEL_SHELL_WIDTH,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-2.5 py-1.5 border-b border-[#333] bg-[#222] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <span className="text-[11px] text-purple-300 font-medium shrink-0">局部重绘</span>
          {onToggleContentPanel && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleContentPanel}
              className="shrink-0 py-0.5 px-1.5 rounded text-[10px] text-gray-400 hover:text-gray-200 hover:bg-[#333] border border-[#444]/80"
              title="收起局部重绘面板"
            >
              收起
            </button>
          )}
        </div>
        {panelHeaderActions}
      </div>

      {needsReconfirm ? (
        <div className="px-2.5 py-1.5 border-b border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-200 leading-snug">
          选区已变更或未确认，请拖动调整选区后点击选区旁「确认」，再执行重绘。
        </div>
      ) : previewBase64 ? (
        <div className="px-2.5 py-1.5 flex items-center gap-2 border-b border-[#2a2a2a]">
          <img
            src={base64ToImageDataUrl(previewBase64)}
            alt="选区"
            className="w-7 h-7 object-contain rounded border border-[#444] bg-[#111] shrink-0"
            draggable={false}
          />
          <span className="text-[10px] text-gray-500 leading-snug truncate">
            选区已确认 {cropWidth}×{cropHeight}px，填写描述后点「重绘」
          </span>
        </div>
      ) : null}

      <div className="px-2.5 py-1.5 border-b border-[#2a2a2a] flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-gray-500 shrink-0">参考图</span>
          <span className="text-[10px] text-green-400 font-medium">
            {referenceImages.length}/{MAX_AUDIT_INPAINT_REFERENCES}
          </span>
          {refPickActive ? (
            <span className="text-[10px] text-cyan-300/90 leading-snug">
              吸管已开启，点击画布拾取（X 切换 / Esc 退出）
            </span>
          ) : referenceImages.length === 0 ? (
            <span className="text-[10px] text-gray-600 leading-snug truncate">
              可选：吸管拾取风格/人物参考（即梦仅用选区图）
            </span>
          ) : null}
          {onToggleRefPick && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onToggleRefPick}
              disabled={isGenerating}
              className={`ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-white shrink-0 ${
                refPickActive ? 'bg-cyan-600' : 'bg-cyan-700 hover:bg-cyan-600'
              } disabled:opacity-40`}
              title={
                refPickActive
                  ? '点击画布上的其他图片添加参考（X 切换 / Esc 退出）'
                  : '吸取画布上的图片作为参考（快捷键 X）'
              }
            >
              <EyedropperIcon size={10} />
              吸管
            </button>
          )}
        </div>
        {referenceImages.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {referenceImages.map((ref, idx) => (
              <div key={ref.id} className="relative group">
                <img
                  src={base64ToImageDataUrl(ref.base64)}
                  alt={`参考${idx + 1}`}
                  className="w-7 h-7 object-cover rounded border border-[#444] bg-[#111]"
                  draggable={false}
                />
                <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] bg-black/60 text-gray-300 rounded-b">
                  R{idx + 1}
                </span>
                {onRemoveReference && !isGenerating ? (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onRemoveReference(ref.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除参考"
                  >
                    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5">
                      <path
                        d="M1 1L9 9M9 1L1 9"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-2.5 flex flex-col gap-1.5 min-h-0 overflow-hidden box-border">
        <textarea
          className="w-full bg-[#222222] text-gray-200 px-2 py-1.5 rounded border border-[#444] focus:outline-none focus:border-purple-500 transition-colors resize-none leading-snug text-[12px] cursor-text overflow-y-auto"
          rows={3}
          placeholder="输入重绘描述，例如：将此处改为…（双击放大编辑）"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isGenerating}
          title="双击放大编辑"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (isGenerating || !onOpenBigEditor) return;
            onOpenBigEditor(prompt, onPromptChange);
          }}
        />

        <div className="grid grid-cols-2 gap-1">
          <select
            className="nodemodel-select bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none focus:border-purple-500 min-w-0"
            value={model}
            onChange={(e) => {
              const m = e.target.value;
              onModelChange(m);
              if (isGptImage2CanvasModelId(m) || isManxueGptImage2Model(m)) {
                onResolutionChange('2k');
              }
            }}
            disabled={isGenerating}
          >
            <option value="gpt-image-2-junlan">GPT Image 2（君澜 AI）</option>
            <option value="gpt-image-2-codesonline">GPT Image 2（codesonline）</option>
            <optgroup label="满 e（manxueapi.com）">
              <option value="gemini-3.1-flash-image-preview-2k-manxue">Gemini 3.1 Flash 2K（满 e）</option>
              <option value="gemini-3-pro-image-preview-2k-manxue">Gemini 3 Pro 2K（满 e）</option>
              <option value="gpt-image-2-manxue">GPT Image 2（满 e）</option>
              <option value="gpt-image-2-pro-manxue">GPT Image 2 Pro（满 e）</option>
              <option value="gemini-3-pro-image-preview-4k-manxue">Gemini 3 Pro 4K（满 e）</option>
              <option value="gemini-3.1-flash-image-preview-4k-manxue">Gemini 3.1 Flash 4K（满 e）</option>
            </optgroup>
            <optgroup label="ToAPIs">
              <option value="gpt-image-2">GPT Image 2（ToAPIs）</option>
              <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash（ToAPIs）</option>
              <option value="gemini-3-pro-image-preview">Nano-Banana Pro（ToAPIs）</option>
              <option value="nano-banana-2">Nano-Banana 2（ToAPIs）</option>
              <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
            </optgroup>
            <optgroup label="即梦 (Dreamina)">
              <option value="jimeng-image-5.0">即梦 5.0</option>
              <option value="jimeng-image-4.6">即梦 4.6</option>
              <option value="jimeng-image-4.5">即梦 4.5</option>
              <option value="jimeng-image-4.0">即梦 4.0</option>
            </optgroup>
          </select>

          <select
            className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none focus:border-purple-500 min-w-0"
            value={aspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value)}
            disabled={isGenerating}
          >
            <option value="original">原图</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="21:9">21:9</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
          </select>

          <select
            className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none focus:border-purple-500 min-w-0"
            value={resolution}
            onChange={(e) => onResolutionChange(e.target.value)}
            disabled={isGenerating}
          >
            <option value="4k">4K</option>
            <option value="2k">2K</option>
            <option value="1k">1K</option>
          </select>

          {showQuality ? (
            <select
              className="bg-[#222222] border border-[#444] rounded px-1.5 py-1 text-[11px] text-gray-200 outline-none focus:border-purple-500 min-w-0"
              value={quality}
              onChange={(e) => onQualityChange(e.target.value)}
              disabled={isGenerating}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="auto">auto</option>
            </select>
          ) : (
            <div className="bg-transparent" aria-hidden />
          )}
        </div>
      </div>

      {error ? (
        <div className="mx-2.5 mb-2 shrink-0 max-h-10 overflow-y-auto text-[10px] text-red-300 bg-red-950/40 border border-red-800/50 rounded px-2 py-1 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {isGenerating ? (
        <div className="mx-2.5 mb-2 shrink-0 text-[10px] text-purple-300 animate-pulse">
          正在重绘，请稍候…
        </div>
      ) : null}
    </div>
  );
}
