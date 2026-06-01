import type { CroppedAuditRegion } from './auditImageCrop';
import type { CanvasRect } from './auditInpaintRegion';
import { pointInInpaintRegion } from './auditInpaintRegion';
import { defaultCanvasImageModel } from './canvasModelUtils';

export type InpaintRegionState = CanvasRect & { sourceImageId: string };

export type AuditInpaintSession = {
  id: string;
  sourceImageId: string;
  region: InpaintRegionState | null;
  regionBox: CanvasRect | null;
  regionConfirmed: boolean;
  crop: (CroppedAuditRegion & { sourceImageId: string }) | null;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  isGenerating: boolean;
  error: string | null;
  panelVisible: boolean;
};

export function createInpaintSessionId(): string {
  return `inpaint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInpaintSession(sourceImageId = ''): AuditInpaintSession {
  return {
    id: createInpaintSessionId(),
    sourceImageId,
    region: null,
    regionBox: null,
    regionConfirmed: false,
    crop: null,
    prompt: '',
    model: defaultCanvasImageModel(),
    aspectRatio: 'original',
    resolution: '2k',
    quality: 'high',
    isGenerating: false,
    error: null,
    panelVisible: false,
  };
}

/** 从后往前命中选区（后创建的会话优先） */
export function hitTestInpaintSessionRegion(
  sessions: AuditInpaintSession[],
  x: number,
  y: number
): AuditInpaintSession | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    if (session.region && pointInInpaintRegion(session.region, x, y)) {
      return session;
    }
  }
  return null;
}
