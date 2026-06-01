import React, { memo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DraftDiskModalState } from './draftDiskModalTypes';

export type CanvasDraftDiskModalProps = {
  modal: NonNullable<DraftDiskModalState>;
  setDraftDiskModal: Dispatch<SetStateAction<DraftDiskModalState>>;
  onCancel: () => void;
  onConfirm: () => void;
};

export const CanvasDraftDiskModal = memo(function CanvasDraftDiskModal({
  modal,
  setDraftDiskModal,
  onCancel,
  onConfirm,
}: CanvasDraftDiskModalProps) {
  return (
    <div
      className="fixed inset-0 z-[400] bg-black/75 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-[#1a1a1a] rounded-xl border border-[#444] shadow-2xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-100 mb-1">
          {modal.mode === 'firstSave' ? '首次保存草稿 JSON' : '另存 JSON'}
        </h3>
        <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
          {modal.mode === 'firstSave'
            ? '设置文件名（不含扩展名）；留空则使用当前项目名。确认后将弹出系统文件夹选择器，请选择草稿保存位置。'
            : '设置另存文件名；留空则使用与导出一致的默认名。确认后将弹出文件夹选择器（不改变当前 Ctrl+S 绑定的主草稿）。'}
        </p>
        <label className="block mb-4">
          <span className="text-[10px] text-gray-500 mb-1 block">JSON 文件名（不含 .json）</span>
          <input
            type="text"
            value={modal.basenameDraft}
            onChange={(e) =>
              setDraftDiskModal((m) => (m ? { ...m, basenameDraft: e.target.value } : m))
            }
            className="w-full rounded-md border border-[#444] bg-[#303030] px-2 py-2 text-xs text-gray-100 outline-none focus:border-cyan-600"
            placeholder={
              (modal.mode === 'firstSave'
                ? modal.mergedProjects.find((p) => p.id === modal.pid)?.name
                : modal.snapshot.name) || '项目名'
            }
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-[#444] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#3A3A3A]"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-md bg-cyan-700 hover:bg-cyan-600 px-3 py-1.5 text-xs text-white"
            onClick={() => void onConfirm()}
          >
            {modal.mode === 'firstSave' ? '选择文件夹并保存' : '选择文件夹并另存'}
          </button>
        </div>
      </div>
    </div>
  );
});
