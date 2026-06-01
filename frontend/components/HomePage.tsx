import React, { memo, startTransition } from 'react';
import type { CanvasProjectSnapshot } from '../services/projectPersistence';
import { HomeCarousel3D } from './HomeCarousel3D';
import { loadProjectLibrary, saveProjectLibrary } from '../services/projectPersistence';

export type HomePageProps = {
  homeProjects: CanvasProjectSnapshot[];
  homeImages: string[];
  onHomeImagesChange: (images: string[]) => void;
  homeChatInput: string;
  onHomeChatInputChange: (v: string) => void;
  homeChatMessages: { role: string; content: string }[];
  homeChatLoading: boolean;
  onHomeChatSend: () => void;
  onCreateProject: () => void;
  onOpenProject: (p: CanvasProjectSnapshot) => void;
  showAllProjectsModal: boolean;
  onShowAllProjectsModalChange: (open: boolean) => void;
  allProjectsList: CanvasProjectSnapshot[];
  onAllProjectsListChange: (projects: CanvasProjectSnapshot[]) => void;
  onHomeProjectsChange: (projects: CanvasProjectSnapshot[]) => void;
  onProjectsChange: (projects: CanvasProjectSnapshot[]) => void;
  projectsRef: React.MutableRefObject<CanvasProjectSnapshot[]>;
  renameTarget: CanvasProjectSnapshot | null;
  onRenameTargetChange: (p: CanvasProjectSnapshot | null) => void;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  deleteTarget: CanvasProjectSnapshot | null;
  onDeleteTargetChange: (p: CanvasProjectSnapshot | null) => void;
  settingsModal: React.ReactNode;
};

export const HomePage = memo(function HomePage({
  homeProjects,
  homeImages,
  onHomeImagesChange,
  homeChatInput,
  onHomeChatInputChange,
  homeChatMessages,
  homeChatLoading,
  onHomeChatSend,
  onCreateProject,
  onOpenProject,
  showAllProjectsModal,
  onShowAllProjectsModalChange,
  allProjectsList,
  onAllProjectsListChange,
  onHomeProjectsChange,
  onProjectsChange,
  projectsRef,
  renameTarget,
  onRenameTargetChange,
  renameDraft,
  onRenameDraftChange,
  deleteTarget,
  onDeleteTargetChange,
  settingsModal,
}: HomePageProps) {
  return (
    <div
      className="w-screen h-screen bg-black text-white select-none font-sans flex flex-col relative overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute top-[5%] left-[10%] w-[60px] h-[60px] rounded-full animate-[breathe_8s_ease-in-out_infinite]"
          style={{ background: 'radial-gradient(circle, rgba(180,80,255,0.10) 0%, transparent 97%)' }}
        />
      <div
        className="absolute top-[8%] left-[45%] w-[300px] h-[300px] rounded-full pointer-events-none animate-[breathe_10s_ease-in-out_2s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(100,60,220,0.16) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[15%] right-[8%] w-[40px] h-[40px] rounded-full pointer-events-none animate-[breathe_6s_ease-in-out_1s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(0,200,220,0.08) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[25%] left-[30%] w-[175px] h-[175px] rounded-full pointer-events-none animate-[breathe_12s_ease-in-out_3s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(140,80,240,0.13) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[30%] right-[20%] w-[90px] h-[90px] rounded-full pointer-events-none animate-[breathe_7s_ease-in-out_5s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(220,120,160,0.09) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[40%] left-[5%] w-[125px] h-[125px] rounded-full pointer-events-none animate-[breathe_9s_ease-in-out_4s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(80,180,240,0.12) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[45%] left-[55%] w-[210px] h-[210px] rounded-full pointer-events-none animate-[breathe_11s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(160,100,240,0.14) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[55%] right-[5%] w-[50px] h-[50px] rounded-full pointer-events-none animate-[breathe_5s_ease-in-out_2s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(255,160,60,0.08) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[60%] left-[15%] w-[250px] h-[250px] rounded-full pointer-events-none animate-[breathe_13s_ease-in-out_6s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(100,140,240,0.13) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[65%] left-[60%] w-[75px] h-[75px] rounded-full pointer-events-none animate-[breathe_8s_ease-in-out_3s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(200,80,180,0.09) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[70%] right-[15%] w-[150px] h-[150px] rounded-full pointer-events-none animate-[breathe_10s_ease-in-out_5s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(60,200,200,0.10) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[75%] left-[40%] w-[30px] h-[30px] rounded-full pointer-events-none animate-[breathe_6s_ease-in-out_1s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(180,220,100,0.07) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[80%] left-[8%] w-[100px] h-[100px] rounded-full pointer-events-none animate-[breathe_9s_ease-in-out_4s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(240,140,100,0.09) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[85%] left-[50%] w-[275px] h-[275px] rounded-full pointer-events-none animate-[breathe_14s_ease-in-out_7s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(130,70,230,0.13) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[88%] right-[25%] w-[45px] h-[45px] rounded-full pointer-events-none animate-[breathe_7s_ease-in-out_2s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(100,220,180,0.08) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[15%] left-[65%] w-[140px] h-[140px] rounded-full pointer-events-none animate-[breathe_11s_ease-in-out_5s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(200,150,220,0.10) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[50%] left-[75%] w-[35px] h-[35px] rounded-full pointer-events-none animate-[breathe_5s_ease-in-out_3s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(255,200,80,0.07) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[35%] left-[20%] w-[225px] h-[225px] rounded-full pointer-events-none animate-[breathe_12s_ease-in-out_8s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(90,160,240,0.12) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[10%] left-[80%] w-[70px] h-[70px] rounded-full pointer-events-none animate-[breathe_8s_ease-in-out_6s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(220,100,160,0.09) 0%, transparent 97%)' }}
      />
      <div
        className="absolute top-[68%] left-[70%] w-[160px] h-[160px] rounded-full pointer-events-none animate-[breathe_10s_ease-in-out_4s_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(140,120,240,0.12) 0%, transparent 97%)' }}
      />
      </div>
      <style>{`@keyframes breathe { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.08); } }`}</style>

      <div className="relative z-10 flex items-center justify-between px-8 pt-[50px] pb-5 shrink-0 border-b border-white/[0.04] bg-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9040F0] to-[#6020E0] flex items-center justify-center shadow-lg shadow-[#9040F0]/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C7 2 3 5 2 10c-1 5 1 10 4 12l1-2c1 1 2 2 5 2s4-1 5-2l1 2c3-2 5-7 4-12C21 5 17 2 12 2z" fill="url(#snakeGrad)" stroke="white" />
              <defs>
                <linearGradient id="snakeGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="white" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="white" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              <ellipse cx="8.5" cy="9" rx="2" ry="2.5" fill="white" stroke="none" />
              <ellipse cx="15.5" cy="9" rx="2" ry="2.5" fill="white" stroke="none" />
              <circle cx="8.5" cy="8.5" r="1" fill="#6020E0" />
              <circle cx="15.5" cy="8.5" r="1" fill="#6020E0" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">NwwWoW</span>
        </div>
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-8 gap-8 overflow-y-auto py-6">
        <div className="w-full max-w-[640px] rounded-3xl border border-[#484848] bg-[#1E1E1E]/80 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full bg-[#9040F0]" />
            <span className="text-xs text-[#D0D0D0] font-medium">AI 助手 · DeepSeek</span>
          </div>
          {homeChatMessages.length > 0 && (
            <div className="max-h-[320px] overflow-y-auto mb-3 space-y-2 px-1">
              {homeChatMessages.map((m, i) => (
                <div key={i} className="text-xs leading-relaxed text-[#F5F5F5]">
                  <span className="text-[10px] text-[#F5F5F5] mr-1">{m.role === 'user' ? 'You' : 'AI'}</span>
                  {m.content}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={homeChatInput}
              onChange={(e) => onHomeChatInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onHomeChatSend()}
              placeholder=""
              disabled={homeChatLoading}
              className="flex-1 bg-[#2C2C2C] border border-[#4A4A4A] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#404040] outline-none focus:border-[#9040F0]/30 transition-colors"
            />
            <button
              onClick={onHomeChatSend}
              disabled={homeChatLoading}
              className="px-4 py-2.5 rounded-xl bg-[#9040F0] hover:bg-[#A050F0] text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              {homeChatLoading ? '...' : '发送'}
            </button>
          </div>
        </div>

        {homeProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 w-14 h-14 rounded-2xl bg-[#9040F0]/20 blur-xl" />
              <div className="relative w-14 h-14 rounded-2xl bg-[#2C2C2C] border border-[#4A4A4A] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9040F0" strokeWidth="1.2">
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
            </div>
            <p className="text-[#D0D0D0] text-sm">在无限画布上探索 AI 驱动的视觉叙事</p>
            <button
              onClick={onCreateProject}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#9040F0] to-[#7020D0] hover:from-[#A050F0] hover:to-[#8030E0] text-white text-sm font-semibold transition-all duration-300 shadow-lg shadow-[#9040F0]/20"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          <div className="w-full max-w-[960px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">最近的项目</h3>
              <button
                onClick={async () => {
                  const lib = await loadProjectLibrary();
                  if (lib) startTransition(() => onAllProjectsListChange(lib.projects));
                  onShowAllProjectsModalChange(true);
                }}
                className="text-xs text-[#B0B0B0] hover:text-white transition-colors"
              >
                查看全部项目 →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div
                onClick={onCreateProject}
                className="group cursor-pointer rounded-2xl border border-dashed border-[#4A4A4A] bg-transparent hover:border-[#9040F0]/30 hover:bg-[#222222] transition-all duration-300 p-6 flex flex-col items-center justify-center gap-4 min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#2C2C2C] border border-[#4A4A4A] group-hover:border-[#9040F0]/30 group-hover:bg-[#3A3A3A] flex items-center justify-center transition-all duration-300 group-hover:scale-110">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="1.8" className="group-hover:stroke-[#9040F0] transition-colors">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span className="text-sm text-[#F5F5F5] group-hover:text-[#B0B0B0] transition-colors font-medium">新建项目</span>
              </div>
              {homeProjects.map((p) => (
                <div
                  key={p.id}
                  className="group relative cursor-pointer rounded-2xl border border-[#505050] bg-[#303030] hover:border-[#9040F0]/25 hover:bg-[#282828] transition-all duration-300 p-5 flex flex-col gap-4 min-h-[220px] hover:shadow-lg hover:shadow-[#9040F0]/5"
                >
                  <div className="absolute inset-0 rounded-2xl bg-[#9040F0]/0 group-hover:bg-[#9040F0]/3 transition-colors duration-500 pointer-events-none" />
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        onRenameTargetChange(p);
                        onRenameDraftChange(p.name);
                      }}
                      className="w-7 h-7 rounded-lg bg-black/80 backdrop-blur-sm hover:bg-[#1a1a1a] border border-[#4A4A4A] flex items-center justify-center transition-all"
                      title="重命名"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="2">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteTargetChange(p)}
                      className="w-7 h-7 rounded-lg bg-black/80 backdrop-blur-sm hover:bg-[#2a1111] border border-[#4A4A4A] flex items-center justify-center transition-all"
                      title="删除"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CC4444" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div
                    className="relative w-full aspect-video rounded-xl bg-[#282828] border border-[#3A3A3A] group-hover:border-[#484848] overflow-hidden transition-all"
                    onClick={() => onOpenProject(p)}
                  >
                    {(() => {
                      const firstImg = (p.nodes || []).reduce<string | null>(
                        (found, n) => found || ((n.images?.length || 0) > 0 ? n.images![0] : null),
                        null,
                      );
                      return firstImg ? (
                        <img src={`data:image/jpeg;base64,${firstImg}`} alt="" className="w-full h-full object-cover" draggable={false} />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#2E2E2E] via-[#2C2C2C] to-[#222222] flex items-center justify-center">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5a5a5a" strokeWidth="1.2" className="group-hover:stroke-[#6a6a6a] transition-colors">
                            <rect x="3" y="3" width="18" height="18" rx="3" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                          </svg>
                        </div>
                      );
                    })()}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#9040F0]/0 group-hover:via-[#9040F0]/30 to-transparent transition-all duration-500" />
                  </div>
                  <div className="flex flex-col gap-1" onClick={() => onOpenProject(p)}>
                    <p className="text-sm text-[#b0b0b0] group-hover:text-white truncate font-medium">{p.name}</p>
                    <p className="text-[11px] text-[#B0B0B0]">
                      {new Date(p.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 shrink-0 border-t border-white/[0.02] py-6 px-8">
        <HomeCarousel3D images={homeImages} onImagesChange={onHomeImagesChange} />
      </div>

      <div className="relative z-10 text-center py-3 text-[10px] text-[#808080] shrink-0 tracking-[0.2em]">NwwWoW · STORYBOARD</div>

      {showAllProjectsModal && (
        <div className="fixed inset-0 z-[500] bg-black/85 flex items-center justify-center" onClick={() => onShowAllProjectsModalChange(false)}>
          <div className="bg-[#1E1E1E] border border-[#444] rounded-2xl w-[700px] max-h-[75vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] shrink-0">
              <h3 className="text-base font-bold text-white">全部项目</h3>
              <button onClick={() => onShowAllProjectsModalChange(false)} className="text-[#808080] hover:text-white text-lg leading-none">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {allProjectsList.length === 0 ? (
                <p className="text-sm text-[#808080] text-center py-8">暂无项目</p>
              ) : (
                <div className="space-y-2">
                  {allProjectsList.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#333] bg-[#181818] hover:bg-[#222] hover:border-[#9040F0]/30 transition-all group"
                    >
                      <div
                        className="flex flex-col gap-0.5 cursor-pointer flex-1 min-w-0 mr-4"
                        onClick={() => {
                          onOpenProject(p);
                          onShowAllProjectsModalChange(false);
                        }}
                      >
                        <span className="text-sm text-white font-medium group-hover:text-[#C0A0F0] transition-colors truncate">{p.name}</span>
                        <span className="text-[11px] text-[#707070]">
                          {new Date(p.updatedAt).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {p.nodes?.length || 0} 节点
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            onRenameTargetChange(p);
                            onRenameDraftChange(p.name);
                          }}
                          className="px-2 py-1 rounded-md text-xs text-[#808080] hover:text-white hover:bg-[#333] transition-colors"
                        >
                          重命名
                        </button>
                        <button
                          onClick={() => onDeleteTargetChange(p)}
                          className="px-2 py-1 rounded-md text-xs text-[#CC4444] hover:text-white hover:bg-[#441111] transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center" onClick={() => onDeleteTargetChange(null)}>
          <div className="bg-[#1E1E1E] border border-[#444] rounded-2xl p-6 w-[380px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-2">删除项目</h3>
            <p className="text-sm text-[#909090] mb-4">确定要删除「{deleteTarget.name}」？此操作不可撤销。</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => onDeleteTargetChange(null)} className="px-4 py-2 rounded-xl text-sm text-[#909090] hover:text-white">
                取消
              </button>
              <button
                onClick={async () => {
                  const p = deleteTarget;
                  onDeleteTargetChange(null);
                  const lib = await loadProjectLibrary();
                  if (!lib) return;
                  const projects = lib.projects.filter((x) => x.id !== p.id);
                  const activeId = projects.find((x) => x.id === lib.activeProjectId) ? lib.activeProjectId : projects[0]?.id || '';
                  onHomeProjectsChange(projects);
                  onAllProjectsListChange(projects);
                  onProjectsChange(projects);
                  projectsRef.current = projects;
                  if (projects.length > 0) await saveProjectLibrary(projects, activeId);
                }}
                className="px-4 py-2 rounded-xl bg-[#CC3333] hover:bg-[#DD4444] text-white text-sm font-medium"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center" onClick={() => onRenameTargetChange(null)}>
          <div className="bg-[#1E1E1E] border border-[#444] rounded-2xl p-6 w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-4">重命名项目</h3>
            <input
              autoFocus
              className="w-full bg-[#222] border border-[#444] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#9040F0] mb-4"
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const name = renameDraft.trim();
                  if (name && renameTarget) {
                    void loadProjectLibrary().then((l) => {
                      if (!l) return;
                      const prj = l.projects.map((x) =>
                        x.id === renameTarget.id ? { ...x, name, updatedAt: Date.now() } : x,
                      );
                      const aid = prj.find((x) => x.id === l.activeProjectId) ? l.activeProjectId : prj[0]?.id || '';
                      onAllProjectsListChange(prj);
                      onHomeProjectsChange(prj);
                      onProjectsChange(prj);
                      projectsRef.current = prj;
                      void saveProjectLibrary(prj, aid);
                    });
                  }
                  onRenameTargetChange(null);
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => onRenameTargetChange(null)} className="px-4 py-2 rounded-xl text-sm text-[#909090] hover:text-white">
                取消
              </button>
              <button
                onClick={() => {
                  const name = renameDraft.trim();
                  if (name && renameTarget) {
                    void loadProjectLibrary().then((l) => {
                      if (!l) return;
                      const prj = l.projects.map((x) =>
                        x.id === renameTarget.id ? { ...x, name, updatedAt: Date.now() } : x,
                      );
                      const aid = prj.find((x) => x.id === l.activeProjectId) ? l.activeProjectId : prj[0]?.id || '';
                      onAllProjectsListChange(prj);
                      onHomeProjectsChange(prj);
                      onProjectsChange(prj);
                      projectsRef.current = prj;
                      void saveProjectLibrary(prj, aid);
                    });
                  }
                  onRenameTargetChange(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#9040F0] text-white text-sm font-medium"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsModal}
    </div>
  );
});
