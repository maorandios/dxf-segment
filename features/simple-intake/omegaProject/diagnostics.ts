/**
 * Mutable, in-memory diagnostics for save/load operations. Never persisted.
 */

import type { OmegaProjectFileDiagnostics } from "./types";

function emptyDiagnostics(): OmegaProjectFileDiagnostics {
  return {
    saveCount: 0,
    loadCount: 0,
    lastSaveAt: null,
    lastLoadAt: null,
    lastSaveDurationMs: null,
    lastLoadDurationMs: null,
    lastSaveEntryCount: null,
    lastSaveUncompressedBytes: null,
    lastSaveBlobBytes: null,
    lastLoadEntryCount: null,
    lastSaveError: null,
    lastLoadError: null,
    lastLoadWarnings: [],
    geometryParseCountDuringLastSave: null,
    geometryParseCountDuringLastLoad: null,
    hashMismatchCountLastLoad: null,
  };
}

let diagnostics: OmegaProjectFileDiagnostics = emptyDiagnostics();

export function resetDiagnostics(): void {
  diagnostics = emptyDiagnostics();
}

export function getOmegaProjectFileDiagnostics(): OmegaProjectFileDiagnostics {
  return { ...diagnostics };
}

export function patchDiagnostics(
  patch: Partial<OmegaProjectFileDiagnostics>
): void {
  diagnostics = { ...diagnostics, ...patch };
}
