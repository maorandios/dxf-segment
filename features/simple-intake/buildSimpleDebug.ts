/**
 * Minimal debug export for Simple Intake.
 * Minimal source-copy contract — no weight interpretation, no DXF scans.
 */

import {
  buildMissingExplicitFieldDiagnostics,
  buildSourceFieldSummary,
} from "./validateAiResult";
import type {
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleIntakeError,
  SimpleMatchingDiagnostics,
  SimpleResultRow,
  SimpleTiming,
  SimpleWorkbookSnapshot,
  SnapshotSheetCoverage,
} from "./types";

export function buildSimpleIntakeDebug(args: {
  runId: string;
  startedAt: string | null;
  completedAt: string | null;
  timing: SimpleTiming;
  workbookFileName: string | null;
  dxfFileNames: string[];
  snapshot: SimpleWorkbookSnapshot | null;
  providerCallCount: number;
  aiRawResult: unknown;
  validatedRows: SimpleExtractedRow[];
  dxfParts: SimpleDxfPart[];
  resultRows: SimpleResultRow[];
  unmatchedDxfIds: string[];
  diagnostics?: SimpleMatchingDiagnostics | null;
  snapshotCoverage?: SnapshotSheetCoverage[] | null;
  error: SimpleIntakeError | null;
  extractionProviderDebug?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const d = args.diagnostics;
  const source = buildSourceFieldSummary(args.validatedRows);
  const extractedRowCount = Array.isArray(
    (args.aiRawResult as { rows?: unknown })?.rows
  )
    ? ((args.aiRawResult as { rows: unknown[] }).rows.length as number)
    : args.validatedRows.length;

  const missingExplicitFieldDiagnostics =
    args.snapshot != null
      ? buildMissingExplicitFieldDiagnostics(
          args.snapshot,
          args.validatedRows
        )
      : [];

  return {
    schemaVersion: "omega-simple-intake-debug/v1",
    runId: args.runId,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    durationMs: args.timing.totalMs,
    timing: args.timing,
    inputFiles: {
      workbook: args.workbookFileName,
      dxfCount: args.dxfFileNames.length,
      dxfNames: args.dxfFileNames,
    },
    workbookSnapshotSummary: args.snapshot
      ? {
          workbookId: args.snapshot.workbookId,
          filename: args.snapshot.filename,
          sheetCount: args.snapshot.sheets.length,
          sheets: args.snapshot.sheets.map((s) => ({
            sheetName: s.sheetName,
            maxSourceRow: s.maxSourceRow,
            populatedRowCount: s.populatedRowCount,
            lastPopulatedSourceRow: s.lastPopulatedSourceRow,
            rowCount: s.rows.length,
            cellCount: s.rows.reduce((n, r) => n + r.cells.length, 0),
          })),
        }
      : null,
    snapshotCoverage: {
      sheets: args.snapshotCoverage ?? [],
    },
    extractionContract: {
      version: "minimal-source-v1",
      includedDxfData: false,
      includedWeightInterpretation: false,
      includedCalculatedValues: false,
    },
    sourceFieldSummary: {
      rowCount: source.rowCount,
      rowsWithPartId: source.rowsWithPartId,
      rowsWithProfile: source.rowsWithProfile,
      rowsWithMaterial: source.rowsWithMaterial,
      rowsWithQuantity: source.rowsWithQuantity,
      rowsWithLength: source.rowsWithLength,
      rowsWithArea: source.rowsWithArea,
      rowsWithZeroArea: source.rowsWithZeroArea,
      rowsWithSourceWeight: source.rowsWithSourceWeight,
      rowsWithZeroSourceWeight: source.rowsWithZeroSourceWeight,
    },
    missingExplicitFieldDiagnostics,
    rowCounts: {
      extractedRowCount,
      validatedRowCount: args.validatedRows.length,
      source: "rows.length",
    },
    providerCall: {
      count: args.providerCallCount,
      purpose: "SIMPLE_WORKBOOK_EXTRACTION",
      ...(args.extractionProviderDebug &&
      typeof args.extractionProviderDebug.providerCall === "object"
        ? (args.extractionProviderDebug.providerCall as Record<string, unknown>)
        : {}),
    },
    extractionProvider: args.extractionProviderDebug
      ? {
          provider: args.extractionProviderDebug.provider ?? null,
          apiVersion: args.extractionProviderDebug.apiVersion ?? null,
          tier: args.extractionProviderDebug.tier ?? null,
          pinnedVersion: args.extractionProviderDebug.pinnedVersion ?? null,
          extractionTarget:
            args.extractionProviderDebug.extractionTarget ?? null,
          citeSources: args.extractionProviderDebug.citeSources ?? null,
          confidenceScores:
            args.extractionProviderDebug.confidenceScores ?? null,
          timings: args.extractionProviderDebug.timings ?? null,
          llamaJob: args.extractionProviderDebug.llamaJob ?? null,
          usage: args.extractionProviderDebug.usage ?? null,
          adaptDiagnostics:
            args.extractionProviderDebug.adaptDiagnostics ?? null,
          cleanupError: args.extractionProviderDebug.cleanupError ?? null,
          // Full safe debug blob (already redacted server-side when present)
          detail: args.extractionProviderDebug,
        }
      : null,
    aiRawResult: args.aiRawResult,
    validatedRows: args.validatedRows,
    dxfRegistry: args.dxfParts.map((part) => ({
      id: part.id,
      filename: part.filename,
      partId: part.partId,
      widthMm: part.widthMm,
      lengthMm: part.lengthMm,
      geometryStatus: part.geometryStatus,
      error: part.error,
    })),
    matchResults: args.resultRows.map((r) => ({
      resultRowId: r.resultRowId,
      status: r.status,
      match: r.match,
      extractedRowId: r.extracted.rowId,
    })),
    unmatchedDxfIds: args.unmatchedDxfIds,
    candidateEdges: d
      ? d.candidateEdges.map((e) => ({
          extractedRowId: e.extractedRowId,
          dxfId: e.dxfId,
          method: e.method,
          rotated: e.rotated,
          widthDifferenceMm: e.widthDifferenceMm,
          lengthDifferenceMm: e.lengthDifferenceMm,
          totalScore: e.totalScore,
          eligible: e.eligible,
        }))
      : [],
    assignmentOrder: d?.assignmentOrder ?? [],
    matchingPasses: d?.matchingPasses ?? [],
    ambiguousRows: d?.ambiguousRows ?? [],
    finalAmbiguities: d?.finalAmbiguities ?? [],
    unmatchedReasons: d?.unmatchedReasons ?? [],
    dxfAvailability: d?.dxfAvailability ?? [],
    localSummary: d?.localSummary ?? null,
    matchingTiming: d?.timing ?? null,
    error: args.error,
  };
}
