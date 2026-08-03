/**
 * Runtime-only "unsaved changes" tracking for the portable project.
 * Nothing here touches browser storage — it is a plain in-memory counter
 * bumped by the parent app whenever a meaningful session edit happens.
 */

import type { ProjectDirtyState } from "./types";

let currentRevision = 0;
let lastExportedRevision: number | null = null;

export function bumpProjectRevision(): void {
  currentRevision += 1;
}

export function markProjectExported(): void {
  lastExportedRevision = currentRevision;
}

export function resetProjectDirtyState(): void {
  currentRevision = 0;
  lastExportedRevision = null;
}

export function hasUnsavedProjectChanges(): boolean {
  if (lastExportedRevision === null) return currentRevision > 0;
  return currentRevision > lastExportedRevision;
}

export function getProjectDirtyState(): ProjectDirtyState {
  return {
    currentRevision,
    lastExportedRevision,
    hasUnsavedChanges: hasUnsavedProjectChanges(),
  };
}
