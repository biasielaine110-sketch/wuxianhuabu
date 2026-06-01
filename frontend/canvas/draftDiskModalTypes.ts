import type { CanvasProject } from './projectDraftUtils';

export type DraftDiskModalState =
  | null
  | {
      mode: 'firstSave';
      mergedProjects: CanvasProject[];
      pid: string;
      basenameDraft: string;
    }
  | {
      mode: 'saveAs';
      snapshot: CanvasProject;
      basenameDraft: string;
    };
