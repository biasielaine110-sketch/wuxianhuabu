import React, { useEffect, useRef, useState, startTransition } from 'react';
import type { CanvasNode } from '../types';
import { HomePage } from './HomePage';
import { AppSettingsModal, type SettingsTab } from './AppSettingsModal';
import { pendingHomeChatRef } from '../canvas/pendingHomeChat';
import { DEFAULT_CANVAS_VIEW_SCALE } from '../stores/canvasStore';
import { DEFAULT_DEEPSEEK_CHAT_MODEL_ID } from '../services/aiSettings';
import {
  loadProjectLibrary,
  saveProjectLibrary,
  type CanvasProjectSnapshot,
} from '../services/projectPersistence';

function nextMsgId(role: 'user' | 'assistant') {
  const timestamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const uuidPart =
    typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : `fallback-${timestamp}`;
  return `msg-${uuidPart}-${role}`;
}

type CanvasProject = CanvasProjectSnapshot;

export type HomeScreenProps = {
  onEnterCanvas: () => void;
};

export function HomeScreen({ onEnterCanvas }: HomeScreenProps) {
  const [homeProjects, setHomeProjects] = useState<CanvasProjectSnapshot[]>([]);
  const [homeImages, setHomeImages] = useState([
    'https://images.unsplash.com/photo-1549490349-8643362247b5?w=400&h=250&fit=crop',
    'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?w=400&h=250&fit=crop',
    'https://images.unsplash.com/photo-1515634928627-2a4e0dae3ddf?w=400&h=250&fit=crop',
  ]);
  const [homeChatInput, setHomeChatInput] = useState('');
  const [homeChatMessages, setHomeChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [homeChatLoading, setHomeChatLoading] = useState(false);
  const [showAllProjectsModal, setShowAllProjectsModal] = useState(false);
  const [allProjectsList, setAllProjectsList] = useState<CanvasProjectSnapshot[]>([]);
  const [renameTarget, setRenameTarget] = useState<CanvasProjectSnapshot | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CanvasProjectSnapshot | null>(null);
  const [projects, setProjects] = useState<CanvasProject[]>([]);
  const projectsRef = useRef<CanvasProjectSnapshot[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('api');

  useEffect(() => {
    loadProjectLibrary().then((lib) => {
      if (lib) {
        startTransition(() => {
          setHomeProjects(lib.projects);
          setProjects(lib.projects);
          projectsRef.current = lib.projects;
        });
      }
    });
  }, []);

  const homeChatSend = async () => {
    const q = homeChatInput.trim();
    if (!q) return;
    setHomeChatInput('');
    setHomeChatLoading(true);
    try {
      const newId = `project-${Date.now()}`;
      const chatNodeId = `chat-${Date.now()}`;
      const userMsg = { id: nextMsgId('user'), role: 'user' as const, content: q };
      const chatNode: CanvasNode = {
        id: chatNodeId,
        type: 'chat',
        x: 200,
        y: 200,
        width: 1560,
        height: 2760,
        prompt: q,
        model: DEFAULT_DEEPSEEK_CHAT_MODEL_ID,
        messages: [userMsg],
        imageAspectRatio: '16:9',
        imageResolution: '2k',
      };
      const newProject: CanvasProject = {
        id: newId,
        name: q.substring(0, 20) || 'AI 对话',
        updatedAt: Date.now(),
        nodes: [chatNode],
        edges: [],
        transform: { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE },
      };
      const lib = await loadProjectLibrary();
      const nextProjects = [newProject, ...(lib?.projects || [])];
      setProjects(nextProjects);
      projectsRef.current = nextProjects;
      await saveProjectLibrary(nextProjects, newId);
      pendingHomeChatRef.current = { nodeId: chatNodeId, prompt: q };
      onEnterCanvas();
    } finally {
      setHomeChatLoading(false);
    }
  };

  const handleCreateProject = async () => {
    const lib = await loadProjectLibrary();
    const existing = lib?.projects || [];
    const newProject: CanvasProject = {
      id: `project-${Date.now()}`,
      name: `项目 ${existing.length + 1}`,
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      transform: { x: 0, y: 0, scale: DEFAULT_CANVAS_VIEW_SCALE },
    };
    const next = [newProject, ...existing];
    setProjects(next);
    projectsRef.current = next;
    await saveProjectLibrary(next, newProject.id);
    onEnterCanvas();
  };

  const handleOpenProject = async (p: CanvasProjectSnapshot) => {
    const lib = await loadProjectLibrary();
    const existing = lib?.projects || [];
    const target = existing.find((x) => x.id === p.id) || p;
    setProjects(existing);
    projectsRef.current = existing;
    await saveProjectLibrary(existing, p.id);
    onEnterCanvas();
  };

  const settingsModal = (
    <AppSettingsModal
      open={showSettingsModal}
      tab={settingsTab}
      onTabChange={setSettingsTab}
      onClose={() => setShowSettingsModal(false)}
    />
  );

  return (
    <HomePage
      homeProjects={homeProjects}
      homeImages={homeImages}
      onHomeImagesChange={setHomeImages}
      homeChatInput={homeChatInput}
      onHomeChatInputChange={setHomeChatInput}
      homeChatMessages={homeChatMessages}
      homeChatLoading={homeChatLoading}
      onHomeChatSend={homeChatSend}
      onCreateProject={handleCreateProject}
      onOpenProject={handleOpenProject}
      showAllProjectsModal={showAllProjectsModal}
      onShowAllProjectsModalChange={setShowAllProjectsModal}
      allProjectsList={allProjectsList}
      onAllProjectsListChange={setAllProjectsList}
      onHomeProjectsChange={setHomeProjects}
      onProjectsChange={setProjects}
      projectsRef={projectsRef}
      renameTarget={renameTarget}
      onRenameTargetChange={setRenameTarget}
      renameDraft={renameDraft}
      onRenameDraftChange={setRenameDraft}
      deleteTarget={deleteTarget}
      onDeleteTargetChange={setDeleteTarget}
      settingsModal={settingsModal}
    />
  );
}
