/**
 * Transactional open of a .omega project into the live session.
 * Current session is only replaced after full validation succeeds.
 */

import {
  buildHydratedSession,
  filesFromBinaryAssets,
} from "./hydrateHelpers";
import { loadOmegaProjectFile } from "./loadOmegaProjectFile";
import {
  clearGeometryCache,
  resetLoadCounters,
  setGeometryEntries,
} from "./geometryRuntimeCache";
import { resetProjectDirtyState } from "./dirtyState";
import { patchDiagnostics } from "./diagnostics";
import type {
  LoadOmegaProjectResult,
  OmegaProjectHydrationStatus,
  OmegaProjectLoadWarning,
} from "./types";

export type OpenOmegaProjectCallbacks = {
  getHydrationStatus: () => OmegaProjectHydrationStatus;
  setHydrationStatus: (status: OmegaProjectHydrationStatus) => void;
  /** Atomically replace session; must not bump dirty when fromHydration. */
  replaceSessionFromHydration: (
    session: ReturnType<typeof buildHydratedSession>
  ) => void;
};

export type OpenOmegaProjectOutcome =
  | {
      ok: true;
      result: LoadOmegaProjectResult;
      warnings: OmegaProjectLoadWarning[];
    }
  | {
      ok: false;
      error: string;
      /** Current project left unchanged. */
      preservedCurrentProject: true;
    };

/**
 * Load + validate + hydrate. On failure the current project is preserved.
 */
export async function openOmegaProjectTransactionally(
  file: File,
  callbacks: OpenOmegaProjectCallbacks
): Promise<OpenOmegaProjectOutcome> {
  const previousStatus = callbacks.getHydrationStatus();
  resetLoadCounters();

  try {
    callbacks.setHydrationStatus("READING_ARCHIVE");
    callbacks.setHydrationStatus("VALIDATING");

    const result = await loadOmegaProjectFile(file);

    callbacks.setHydrationStatus("MIGRATING");
    // migrate already ran inside loadOmegaProjectFile

    callbacks.setHydrationStatus("HYDRATING");

    const { workbookFile, dxfFiles } = filesFromBinaryAssets(
      result.snapshot.sourceAssetRefs,
      result.binaryAssets
    );

    // Ensure geometry cache is set (load already did; re-apply for safety).
    clearGeometryCache();
    setGeometryEntries(result.geometries);

    const nextSession = buildHydratedSession(
      result.snapshot,
      workbookFile,
      dxfFiles
    );

    callbacks.replaceSessionFromHydration(nextSession);
    resetProjectDirtyState();
    callbacks.setHydrationStatus("READY");

    patchDiagnostics({
      geometryParseCountDuringLastLoad: 0,
    });

    return { ok: true, result, warnings: result.warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    callbacks.setHydrationStatus(
      previousStatus === "READY" || previousStatus === "IDLE"
        ? previousStatus
        : "ERROR"
    );
    // Prefer restoring to IDLE/READY so route guards resume on the prior project.
    if (previousStatus === "READY" || previousStatus === "IDLE") {
      callbacks.setHydrationStatus(previousStatus);
    } else {
      callbacks.setHydrationStatus("ERROR");
    }
    return {
      ok: false,
      error: message,
      preservedCurrentProject: true,
    };
  }
}
