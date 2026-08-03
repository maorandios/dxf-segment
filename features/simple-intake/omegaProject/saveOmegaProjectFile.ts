/**
 * Save the current in-memory session to a downloaded .omega file.
 * No browser storage is touched — only memory + a user-facing file download.
 */

import type { SimpleIntakeSession } from "../types";
import { buildOmegaProjectArchive } from "./buildArchive";
import { createOmegaProjectSnapshot } from "./createSnapshot";
import {
  downloadBlobAsFile,
  trySaveWithFileSystemAccess,
} from "./downloadBlob";
import { getOmegaProjectFileDiagnostics, patchDiagnostics } from "./diagnostics";
import { markProjectExported } from "./dirtyState";
import {
  getParseInvocationCountDuringLoad,
  resetLoadCounters,
} from "./geometryRuntimeCache";
import { buildOmegaProjectFilename } from "./sanitizeFilename";
import { OMEGA_PROJECT_MIME_TYPE, type SaveOmegaProjectResult } from "./types";

export async function saveOmegaProjectFile(
  session: SimpleIntakeSession
): Promise<SaveOmegaProjectResult> {
  const startedAt = Date.now();
  resetLoadCounters();

  try {
    const { snapshot, binaries, derivedJson } =
      await createOmegaProjectSnapshot(session);

    const { blob, uncompressedBytes, entryCount } =
      await buildOmegaProjectArchive({
        session,
        snapshot,
        binaries,
        derivedJson,
      });

    const zipBlob = new Blob([blob], { type: OMEGA_PROJECT_MIME_TYPE });

    const filenameLabel =
      session.finalQuotationDraft?.metadata.quotationNumber?.trim() ||
      session.quoteDetails?.projectName?.trim() ||
      snapshot.quotationId;
    const filename = buildOmegaProjectFilename(filenameLabel);

    const savedWithFileSystemAccess = await trySaveWithFileSystemAccess(
      zipBlob,
      filename
    );
    if (!savedWithFileSystemAccess) {
      downloadBlobAsFile(zipBlob, filename);
    }

    markProjectExported();
    patchDiagnostics({
      saveCount: getOmegaProjectFileDiagnostics().saveCount + 1,
      lastSaveAt: new Date().toISOString(),
      lastSaveDurationMs: Date.now() - startedAt,
      lastSaveEntryCount: entryCount,
      lastSaveUncompressedBytes: uncompressedBytes,
      lastSaveBlobBytes: zipBlob.size,
      lastSaveError: null,
      geometryParseCountDuringLastSave: getParseInvocationCountDuringLoad("parse"),
    });

    return {
      ok: true,
      filename,
      blobSizeBytes: zipBlob.size,
      entryCount,
      quotationId: snapshot.quotationId,
      savedWithFileSystemAccess,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchDiagnostics({
      lastSaveError: message,
      lastSaveDurationMs: Date.now() - startedAt,
    });
    return { ok: false, error: message };
  }
}
