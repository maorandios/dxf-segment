/**
 * Assemble a .omega ZIP archive (manifest + state + workflow + ui-state +
 * source files + derived bags) from the pieces built by `createSnapshot.ts`.
 */

import JSZip from "jszip";
import {
  assertArchiveBudgets,
  assertSafeArchivePath,
  assertSafeEntryByteLength,
} from "./archiveSecurity";
import { deriveSavedWorkflowStep } from "./workflowStep";
import { sha256Hex } from "./sha256";
import {
  OMEGA_PROJECT_FORMAT,
  OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION,
  OMEGA_PROJECT_MIME_TYPE,
  OMEGA_PROJECT_PATHS,
  type OmegaProjectFileEntry,
  type OmegaProjectManifestV1,
  type OmegaQuotationProjectSnapshotV1,
} from "./types";
import type { SnapshotBinaryAsset } from "./createSnapshot";
import type { SimpleIntakeSession } from "../types";

export type BuildOmegaProjectArchiveResult = {
  blob: Blob;
  uncompressedBytes: number;
  entryCount: number;
  manifest: OmegaProjectManifestV1;
};

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export async function buildOmegaProjectArchive(args: {
  session: SimpleIntakeSession;
  snapshot: OmegaQuotationProjectSnapshotV1;
  binaries: SnapshotBinaryAsset[];
  derivedJson: Record<string, unknown>;
  appVersion?: string | null;
}): Promise<BuildOmegaProjectArchiveResult> {
  const { session, snapshot, binaries, derivedJson } = args;

  const zip = new JSZip();
  const fileEntries: OmegaProjectFileEntry[] = [];
  let entryCount = 0;
  let uncompressedBytes = 0;

  function addEntry(
    rawPath: string,
    bytes: Uint8Array,
    kind: OmegaProjectFileEntry["kind"],
    opts: {
      assetId: string;
      originalFilename?: string | null;
      mimeType: string;
      sha256: string | null;
      required: boolean;
    }
  ): void {
    const path = assertSafeArchivePath(rawPath);
    assertSafeEntryByteLength(bytes.byteLength);
    zip.file(path, bytes);
    entryCount += 1;
    uncompressedBytes += bytes.byteLength;
    assertArchiveBudgets(entryCount, uncompressedBytes);
    fileEntries.push({
      assetId: opts.assetId,
      archivePath: path,
      kind,
      originalFilename: opts.originalFilename ?? null,
      mimeType: opts.mimeType,
      byteLength: bytes.byteLength,
      sha256: opts.sha256,
      required: opts.required,
    });
  }

  // ── Source binaries (byte-exact) ────────────────────────────────────────
  for (const asset of binaries) {
    const hash = await sha256Hex(asset.bytes);
    const kind = asset.archivePath.startsWith("sources/dxf/")
      ? "SOURCE_DXF"
      : "SOURCE_MATERIAL";
    addEntry(asset.archivePath, asset.bytes, kind, {
      assetId: asset.assetId,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      sha256: hash,
      required: asset.required,
    });
  }

  // ── project/state.json ───────────────────────────────────────────────────
  const stateBytes = jsonBytes(snapshot);
  const stateHash = await sha256Hex(stateBytes);
  addEntry(OMEGA_PROJECT_PATHS.STATE, stateBytes, "STATE", {
    assetId: "state",
    mimeType: "application/json",
    sha256: stateHash,
    required: true,
  });

  // ── project/workflow.json ────────────────────────────────────────────────
  const savedWorkflowStep = deriveSavedWorkflowStep(session);
  const workflowPayload = {
    savedWorkflowStep,
    quoteStage: session.quoteStage,
    status: session.status,
    enteredQuoteStages: session.enteredQuoteStages,
    forcedReviewWorkspaceView: session.forcedReviewWorkspaceView,
  };
  const workflowBytes = jsonBytes(workflowPayload);
  addEntry(OMEGA_PROJECT_PATHS.WORKFLOW, workflowBytes, "WORKFLOW", {
    assetId: "workflow",
    mimeType: "application/json",
    sha256: await sha256Hex(workflowBytes),
    required: true,
  });

  // ── project/ui-state.json ────────────────────────────────────────────────
  const uiStateBytes = jsonBytes(snapshot.durableUiState);
  addEntry(OMEGA_PROJECT_PATHS.UI_STATE, uiStateBytes, "UI_STATE", {
    assetId: "ui-state",
    mimeType: "application/json",
    sha256: await sha256Hex(uiStateBytes),
    required: false,
  });

  // ── derived/*.json ────────────────────────────────────────────────────────
  for (const [path, value] of Object.entries(derivedJson)) {
    const bytes = jsonBytes(value);
    addEntry(path, bytes, "DERIVED", {
      assetId: path,
      mimeType: "application/json",
      sha256: await sha256Hex(bytes),
      required: false,
    });
  }

  const manifest: OmegaProjectManifestV1 = {
    format: OMEGA_PROJECT_FORMAT,
    schemaVersion: OMEGA_PROJECT_MANIFEST_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: args.appVersion ?? null,
    quotationId: snapshot.quotationId,
    projectName: session.quoteDetails?.projectName ?? null,
    customerName: session.quoteDetails?.customerName ?? null,
    savedWorkflowStep,
    quoteStage: session.quoteStage,
    status: session.status,
    fileEntries,
    derivationSignatures: snapshot.derivationSignatures,
  };

  const manifestBytes = jsonBytes(manifest);
  const manifestPath = assertSafeArchivePath(OMEGA_PROJECT_PATHS.MANIFEST);
  zip.file(manifestPath, manifestBytes);
  entryCount += 1;
  uncompressedBytes += manifestBytes.byteLength;
  assertArchiveBudgets(entryCount, uncompressedBytes);

  const raw = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const ab = raw.buffer.slice(
    raw.byteOffset,
    raw.byteOffset + raw.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], {
    type: OMEGA_PROJECT_MIME_TYPE,
  });

  return { blob, uncompressedBytes, entryCount, manifest };
}
