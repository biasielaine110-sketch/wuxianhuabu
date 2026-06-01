import React, { memo, type RefObject } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { XIcon } from './canvasIcons';
import type { CanvasProject } from './projectDraftUtils';
import { projectDraftDisplayName, sanitizeDraftStoragePathNote } from './projectDraftUtils';

export type CanvasProjectModalProps = {
  open: boolean;
  onClose: () => void;
  projects: CanvasProject[];
  activeProjectId: string | null;
  draftNameInput: string;
  setDraftNameInput: Dispatch<SetStateAction<string>>;
  draftStoragePathInput: string;
  setDraftStoragePathInput: Dispatch<SetStateAction<string>>;
  autosaveIntervalMin: 0 | 5 | 10 | 20 | 30;
  projectExportMenuOpen: boolean;
  setProjectExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  onApplyDraftTitle: () => void;
  onApplyDraftStoragePath: () => void;
  onAutosaveIntervalChange: (v: 0 | 5 | 10 | 20 | 30) => void;
  onCreateNewProject: (name?: string) => void;
  onSaveCurrentProject: () => void;
  onImportProjectFile: (file: File) => void;
  onExportProjectJson: (project: CanvasProject) => void;
  onExportProjectZip: (project: CanvasProject) => void;
  projectSnapshotForJsonExport: (project: CanvasProject) => CanvasProject;
  onSwitchProject: (id: string) => void;
  onOpenProjectLocationInfo: (project: CanvasProject) => void;
  onRenameProject: (projectId: string, trimmedName: string) => void;
  onDeleteProject: (projectId: string, projectName: string) => void;
};

export const CanvasProjectModal = memo(function CanvasProjectModal({
  open,
  onClose,
  projects,
  activeProjectId,
  draftNameInput,
  setDraftNameInput,
  draftStoragePathInput,
  setDraftStoragePathInput,
  autosaveIntervalMin,
  projectExportMenuOpen,
  setProjectExportMenuOpen,
  projectImportInputRef,
  onApplyDraftTitle,
  onApplyDraftStoragePath,
  onAutosaveIntervalChange,
  onCreateNewProject,
  onSaveCurrentProject,
  onImportProjectFile,
  onExportProjectJson,
  onExportProjectZip,
  projectSnapshotForJsonExport,
  onSwitchProject,
  onOpenProjectLocationInfo,
  onRenameProject,
  onDeleteProject,
}: CanvasProjectModalProps) {
  if (!open) return null;

  const close = () => {
    onClose();
    setProjectExportMenuOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/80 flex items-center justify-center"
      onClick={close}
    >
      <div
        className="bg-[#1e1e1e] rounded-2xl p-6 w-[640px] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-[#333]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">项目管理</h2>
          <button onClick={close} className="text-gray-400 hover:text-white transition-colors">
            <XIcon size={20} />
          </button>
        </div>
        <div className="mb-3 rounded-lg border border-[#333] bg-[#141414] p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[200px]">
              <span className="block text-[10px] text-gray-500 mb-0.5">
                草稿名称（留空或与项目名相同则自动跟项目名）
              </span>
              <input
                type="text"
                value={draftNameInput}
                onChange={(e) => setDraftNameInput(e.target.value)}
                className="w-full rounded-md border border-[#444] bg-[#303030] px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-blue-600"
                placeholder={projects.find((p) => p.id === activeProjectId)?.name || '未命名项目'}
              />
            </label>
            <button
              type="button"
              onClick={onApplyDraftTitle}
              className="shrink-0 rounded-md bg-[#333] px-2.5 py-1.5 text-[11px] text-gray-100 hover:bg-[#444]"
            >
              应用草稿名
            </button>
            <button
              type="button"
              onClick={() => {
                const n = projects.find((p) => p.id === activeProjectId)?.name || '';
                setDraftNameInput(n);
              }}
              className="shrink-0 rounded-md border border-[#444] px-2.5 py-1.5 text-[11px] text-gray-400 hover:bg-[#3A3A3A]"
            >
              填入项目名
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[200px]">
              <span className="block text-[10px] text-gray-500 mb-0.5">草稿存储位置</span>
              <input
                type="text"
                value={draftStoragePathInput}
                onChange={(e) => setDraftStoragePathInput(e.target.value)}
                className="w-full rounded-md border border-[#444] bg-[#303030] px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-cyan-600"
                placeholder="例如 D:\备份\无限画布草稿"
              />
            </label>
            <button
              type="button"
              onClick={() => void onApplyDraftStoragePath()}
              className="shrink-0 rounded-md bg-cyan-900/60 px-2.5 py-1.5 text-[11px] text-cyan-50 hover:bg-cyan-800/70"
              title="支持时弹出系统「选择文件夹」窗口；不支持时改为手动输入路径"
            >
              应用存储位置
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-gray-500 shrink-0">定时自动保存草稿</span>
            <select
              value={autosaveIntervalMin}
              onChange={(e) => onAutosaveIntervalChange(Number(e.target.value) as 0 | 5 | 10 | 20 | 30)}
              className="rounded-md border border-[#444] bg-[#303030] px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-blue-600"
            >
              <option value={0}>关闭</option>
              <option value={5}>每 5 分钟</option>
              <option value={10}>每 10 分钟</option>
              <option value={20}>每 20 分钟</option>
              <option value={30}>每 30 分钟</option>
            </select>
            <span className="text-[10px] text-gray-600 leading-snug max-w-[260px]">
              已绑定本地草稿 JSON 的项目打开时默认每 5 分钟；会写入 IndexedDB 并覆盖绑定 JSON。
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              const name = prompt('新项目名称:');
              onCreateNewProject(name || undefined);
            }}
            className="px-3 py-2.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            新建项目
          </button>
          <button
            type="button"
            onClick={() => void onSaveCurrentProject()}
            className="px-3 py-2.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium"
            title="合并画布写入 IndexedDB；未绑定本地草稿时会先填写文件名并选择文件夹。Ctrl+S / ⌘+S 保存；Ctrl+Alt+S 另存 JSON。"
          >
            保存当前画布
          </button>
          <button
            type="button"
            onClick={() => projectImportInputRef.current?.click()}
            className="px-3 py-2.5 text-xs rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-medium"
            title="支持 .json 与 .wxcanvas.zip / .zip"
          >
            导入 JSON / ZIP
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectExportMenuOpen((o) => !o)}
              className="w-full px-3 py-2.5 text-xs rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-medium"
              title="下载到本机"
            >
              导出 JSON / ZIP ▾
            </button>
            {projectExportMenuOpen ? (
              <div
                className="absolute right-0 z-[300] mt-1 min-w-[160px] rounded-lg border border-[#444] bg-[#1a1a1a] py-1 shadow-xl"
                onClick={(ev) => ev.stopPropagation()}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs text-gray-100 hover:bg-[#2a2a2a]"
                  onClick={() => {
                    const current = projects.find((p) => p.id === activeProjectId);
                    if (current) void onExportProjectJson(projectSnapshotForJsonExport(current));
                    setProjectExportMenuOpen(false);
                  }}
                >
                  导出 JSON…
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs text-gray-100 hover:bg-[#2a2a2a]"
                  onClick={() => {
                    const current = projects.find((p) => p.id === activeProjectId);
                    if (current) void onExportProjectZip(projectSnapshotForJsonExport(current));
                    setProjectExportMenuOpen(false);
                  }}
                >
                  导出 ZIP…
                </button>
              </div>
            ) : null}
          </div>
          <input
            ref={projectImportInputRef}
            type="file"
            accept=".json,.zip,.wxcanvas.zip,application/json,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportProjectFile(file);
              e.currentTarget.value = '';
            }}
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {projects
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((project) => {
              const draftLocDisplay = sanitizeDraftStoragePathNote(project.draftStoragePathNote);
              return (
                <div
                  key={project.id}
                  className={`p-3 rounded-lg border ${project.id === activeProjectId ? 'border-blue-500 bg-blue-900/20' : 'border-[#333] bg-[#222222]'}`}
                >
                  <div className="flex items-center gap-2">
                    <button onClick={() => onSwitchProject(project.id)} className="text-left flex-1">
                      <div className="text-sm text-gray-100">{projectDraftDisplayName(project)}</div>
                      {draftLocDisplay ? (
                        <div className="text-[10px] text-cyan-500/95 mt-0.5 leading-snug">
                          草稿位置：{draftLocDisplay}
                        </div>
                      ) : null}
                      {project.draftTitle?.trim() && project.draftTitle.trim() !== (project.name || '').trim() ? (
                        <div className="text-[10px] text-gray-600">项目名：{project.name}</div>
                      ) : null}
                      <div className="text-[10px] text-gray-500">
                        节点 {project.nodes.length} | 连线 {project.edges.length} | 更新时间{' '}
                        {new Date(project.updatedAt).toLocaleString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProjectLocationInfo(project)}
                      className="shrink-0 px-2 py-1 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-gray-100"
                      title="需已填写「草稿存储位置」或已另存为 JSON；点击查看 IndexedDB 与本机参考路径"
                    >
                      打开位置
                    </button>
                    <button
                      onClick={() => {
                        const nextName = prompt('重命名项目:', project.name);
                        const trimmed = nextName?.trim();
                        if (!trimmed) return;
                        onRenameProject(project.id, trimmed);
                      }}
                      className="px-2 py-1 text-[10px] rounded bg-[#333] hover:bg-[#444] text-gray-200"
                    >
                      重命名
                    </button>
                    <button
                      disabled={projects.length <= 1}
                      onClick={() => {
                        if (confirm(`确定删除项目 "${project.name}" 吗？`)) {
                          onDeleteProject(project.id, project.name);
                        }
                      }}
                      className="px-2 py-1 text-[10px] rounded bg-red-800 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      删除
                    </button>
                    <button
                      onClick={() => onExportProjectJson(projectSnapshotForJsonExport(project))}
                      className="px-2 py-1 text-[10px] rounded bg-indigo-800 hover:bg-indigo-700 text-white"
                    >
                      导出
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
});
