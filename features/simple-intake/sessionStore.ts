/**
 * In-memory Simple Intake session — React tab memory only.
 */

import { buildSimpleWorkbookSnapshot } from "./buildSimpleWorkbookSnapshot";
import { buildSimpleIntakeDebug } from "./buildSimpleDebug";
import {
  applyManualDxfSelection,
  deriveResultRowStatus,
  deriveSimpleDxfAvailability,
  buildSimpleIntakeResultSummary,
  matchSimpleRows,
} from "./matchSimpleRows";
import { normalizePartIdForMatch } from "./normalizePartId";
import { parseSimpleDxfFiles } from "./parseSimpleDxfFiles";
import type {
  SimpleExtractionCoverageIssue,
  SimpleExtractedRow,
  SimpleIntakeError,
  SimpleIntakeSession,
  SimpleMatchResult,
  SimpleResultRow,
  SimpleTiming,
  SnapshotSheetCoverage,
} from "./types";
import { validateSimpleAiResult } from "./validateAiResult";

type Listener = () => void;

function newRunId(): string {
  return `simple_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyTiming(): SimpleTiming {
  return {
    workbookSnapshotMs: null,
    dxfParseMs: null,
    aiCallMs: null,
    coverageCheckMs: null,
    matchingMs: null,
    candidateGenerationMs: null,
    automaticAssignmentMs: null,
    strongAssignmentMs: null,
    propagationMs: null,
    finalClassificationMs: null,
    availabilityDerivationMs: null,
    totalMs: null,
  };
}

function createEmptySession(): SimpleIntakeSession {
  return {
    status: "IDLE",
    runId: null,
    workbookFile: null,
    dxfFiles: [],
    workbookSnapshot: null,
    extractedRows: [],
    dxfParts: [],
    resultRows: [],
    unmatchedDxfIds: [],
    dxfAvailability: [],
    coverageIssues: [],
    exactIdOccurrences: [],
    localSummary: null,
    matchingDiagnostics: null,
    hasCoverageWarnings: false,
    error: null,
    timing: emptyTiming(),
    analyzingLabel: null,
    startedAt: null,
    completedAt: null,
    lastDebug: null,
    providerCallCount: 0,
  };
}

let session: SimpleIntakeSession = createEmptySession();
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function setSession(next: SimpleIntakeSession): void {
  session = next;
  emit();
}

function recomputeReadyStatus(
  workbook: File | null,
  dxfs: File[]
): SimpleIntakeSession["status"] {
  if (workbook && dxfs.length > 0) return "FILES_READY";
  return "IDLE";
}

function refreshAvailability(
  resultRows: SimpleResultRow[],
  dxfParts: SimpleIntakeSession["dxfParts"],
  coverageIssues: SimpleExtractionCoverageIssue[] = session.coverageIssues,
  coverageStats?: {
    exactIdsFoundInWorkbook: number;
    exactIdsPresentInExtractedRows: number;
    exactIdsMissingFromExtraction: number;
  }
) {
  const dxfAvailability = deriveSimpleDxfAvailability({
    dxfParts,
    resultRows,
    coverageIssues,
  });
  const localSummary = buildSimpleIntakeResultSummary({
    extractedRowCount: resultRows.length,
    validatedRows: resultRows.map((r) => r.extracted),
    resultRows,
    dxfAvailability,
    coverageStats: coverageStats ?? {
      exactIdsFoundInWorkbook:
        session.localSummary?.exactIdsFoundInWorkbook ?? 0,
      exactIdsPresentInExtractedRows:
        session.localSummary?.exactIdsPresentInExtractedRows ?? 0,
      exactIdsMissingFromExtraction: coverageIssues.length
        ? new Set(coverageIssues.map((i) => i.normalizedPartId)).size
        : (session.localSummary?.exactIdsMissingFromExtraction ?? 0),
    },
  });
  const unmatchedDxfIds = dxfAvailability
    .filter((d) => d.state === "UNUSED")
    .map((d) => d.dxfId);
  return {
    dxfAvailability,
    localSummary,
    unmatchedDxfIds,
    hasCoverageWarnings: coverageIssues.length > 0,
  };
}

export function getSimpleIntakeSession(): SimpleIntakeSession {
  return session;
}

export function subscribeSimpleIntake(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const simpleIntakeActions = {
  reset(): void {
    setSession(createEmptySession());
  },

  setWorkbook(file: File | null): void {
    const next = {
      ...session,
      workbookFile: file,
      status: recomputeReadyStatus(file, session.dxfFiles),
      error: null,
    };
    if (session.status === "READY" || session.status === "FAILED") {
      next.status = recomputeReadyStatus(file, session.dxfFiles);
      next.resultRows = [];
      next.extractedRows = [];
      next.workbookSnapshot = null;
      next.error = null;
      next.dxfAvailability = [];
      next.localSummary = null;
      next.matchingDiagnostics = null;
      next.coverageIssues = [];
      next.exactIdOccurrences = [];
      next.hasCoverageWarnings = false;
    }
    setSession(next);
  },

  addDxfFiles(files: File[]): void {
    const existingNames = new Set(session.dxfFiles.map((f) => f.name));
    const merged = [...session.dxfFiles];
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith(".dxf")) continue;
      if (existingNames.has(f.name)) continue;
      merged.push(f);
      existingNames.add(f.name);
    }
    setSession({
      ...session,
      dxfFiles: merged,
      status: recomputeReadyStatus(session.workbookFile, merged),
      resultRows: session.status === "READY" ? [] : session.resultRows,
      error: null,
    });
  },

  /**
   * During READY guided review: parse only newly added DXFs and rematch locally.
   * Does not call AI or re-extract the workbook.
   */
  async appendDxfFilesAndRematch(files: File[]): Promise<{ added: number }> {
    if (session.status !== "READY") return { added: 0 };
    const existingNames = new Set(session.dxfFiles.map((f) => f.name));
    const newcomers: File[] = [];
    for (const f of files) {
      if (!f.name.toLowerCase().endsWith(".dxf")) continue;
      if (existingNames.has(f.name)) continue;
      newcomers.push(f);
      existingNames.add(f.name);
    }
    if (newcomers.length === 0) return { added: 0 };

    const mergedFiles = [...session.dxfFiles, ...newcomers];
    const { parts: newParts } = await parseSimpleDxfFiles(newcomers);
    const dxfParts = [...session.dxfParts, ...newParts];
    const extractedRows = session.extractedRows;
    const matched = matchSimpleRows({
      extractedRows,
      dxfParts,
      extractedRowCount: extractedRows.length,
    });
    // Preserve local guided/table edits and exclusions across rematch.
    const prevByExtractedId = new Map(
      session.resultRows.map((r) => [r.extracted.rowId, r] as const)
    );
    const mergedResultRows = matched.resultRows.map((r) => {
      const prev = prevByExtractedId.get(r.extracted.rowId);
      if (!prev) return r;
      const next = {
        ...r,
        edits: { ...prev.edits },
        excluded: prev.excluded,
      };
      return {
        ...next,
        status: next.excluded
          ? ("EXCLUDED" as const)
          : deriveResultRowStatus(next),
      };
    });
    const coverageIssues = session.coverageIssues;
    const refreshed = refreshAvailability(
      mergedResultRows,
      dxfParts,
      coverageIssues
    );
    const coverageStats = {
      exactIdsFoundInWorkbook:
        session.localSummary?.exactIdsFoundInWorkbook ?? 0,
      exactIdsPresentInExtractedRows:
        session.localSummary?.exactIdsPresentInExtractedRows ?? 0,
      exactIdsMissingFromExtraction:
        session.localSummary?.exactIdsMissingFromExtraction ?? 0,
    };
    const localSummary = buildSimpleIntakeResultSummary({
      extractedRowCount: extractedRows.length,
      validatedRows: extractedRows,
      resultRows: mergedResultRows,
      dxfAvailability: refreshed.dxfAvailability,
      coverageStats,
    });
    setSession({
      ...getSimpleIntakeSession(),
      dxfFiles: mergedFiles,
      dxfParts,
      resultRows: mergedResultRows,
      matchingDiagnostics: {
        ...matched.diagnostics,
        dxfAvailability: refreshed.dxfAvailability,
        localSummary,
      },
      ...refreshed,
      localSummary,
      providerCallCount: session.providerCallCount,
    });
    return { added: newcomers.length };
  },

  removeDxf(fileName: string): void {
    const merged = session.dxfFiles.filter((f) => f.name !== fileName);
    setSession({
      ...session,
      dxfFiles: merged,
      status: recomputeReadyStatus(session.workbookFile, merged),
    });
  },

  clearFiles(): void {
    setSession(createEmptySession());
  },

  backToFiles(): void {
    setSession({
      ...session,
      status: recomputeReadyStatus(session.workbookFile, session.dxfFiles),
      error: null,
      analyzingLabel: null,
      resultRows: [],
      extractedRows: [],
      unmatchedDxfIds: [],
      dxfAvailability: [],
      coverageIssues: [],
      exactIdOccurrences: [],
      hasCoverageWarnings: false,
      localSummary: null,
      matchingDiagnostics: null,
      workbookSnapshot: null,
      dxfParts: [],
      lastDebug: null,
      providerCallCount: 0,
    });
  },

  selectDxf(
    resultRowId: string,
    dxfId: string | null,
    opts?: { forceReassign?: boolean }
  ): { conflict: false } | {
    conflict: true;
    occupyingSourceRow: number;
  } {
    if (session.status !== "READY") return { conflict: false };
    const result = applyManualDxfSelection({
      resultRows: session.resultRows,
      resultRowId,
      dxfId,
      dxfParts: session.dxfParts,
      forceReassign: opts?.forceReassign,
    });
    if (!result.ok) {
      return {
        conflict: true,
        occupyingSourceRow: result.occupyingSourceRow,
      };
    }
    const refreshed = refreshAvailability(
      result.resultRows,
      session.dxfParts,
      session.coverageIssues
    );
    setSession({
      ...session,
      resultRows: result.resultRows,
      ...refreshed,
    });
    return { conflict: false };
  },

  excludeRow(resultRowId: string, excluded: boolean): void {
    const resultRows = session.resultRows.map((r) => {
      if (r.resultRowId !== resultRowId) return r;
      return {
        ...r,
        excluded,
        status: excluded
          ? ("EXCLUDED" as const)
          : deriveResultRowStatus({ ...r, excluded }),
      };
    });
    const refreshed = refreshAvailability(
      resultRows,
      session.dxfParts,
      session.coverageIssues
    );
    setSession({ ...session, resultRows, ...refreshed });
  },

  updateRowEdits(
    resultRowId: string,
    edits: SimpleResultRow["edits"]
  ): void {
    const resultRows = session.resultRows.map((r) => {
      if (r.resultRowId !== resultRowId) return r;
      const next = { ...r, edits: { ...r.edits, ...edits } };
      return { ...next, status: deriveResultRowStatus(next) };
    });
    const refreshed = refreshAvailability(
      resultRows,
      session.dxfParts,
      session.coverageIssues
    );
    setSession({ ...session, resultRows, ...refreshed });
  },

  /**
   * Manually add a row from an exact-ID coverage issue (no AI call).
   */
  addManualRowFromCoverage(
    issue: SimpleExtractionCoverageIssue,
    fields: {
      quantity?: number | null;
      material?: string | null;
      thicknessMm?: number | null;
      widthMm?: number | null;
      lengthMm?: number | null;
    } = {}
  ): void {
    if (session.status !== "READY") return;
    const rowId = `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const extracted: SimpleExtractedRow = {
      rowId,
      sheetName: issue.sheetName,
      sourceRow: issue.sourceRow,
      sourceCell: issue.cellAddress,
      partId: issue.originalPartId,
      profile: null,
      description: null,
      quantity: fields.quantity ?? null,
      material: fields.material ?? null,
      thicknessMm: fields.thicknessMm ?? null,
      widthMm: fields.widthMm ?? null,
      lengthMm: fields.lengthMm ?? null,
      sourceAreaM2: null,
      sourceWeightKg: null,
      confidence: 1,
      note: "MANUAL_FROM_COVERAGE",
      warnings: [],
    };

    const norm = issue.normalizedPartId;
    const used = new Set(
      session.resultRows
        .filter((r) => r.match.matchedDxfId && !r.excluded)
        .map((r) => r.match.matchedDxfId!)
    );
    const dxf = session.dxfParts.find(
      (d) =>
        d.geometryStatus === "VALID" &&
        normalizePartIdForMatch(d.partId) === norm &&
        !used.has(d.id)
    );

    let match: SimpleMatchResult;
    if (dxf) {
      match = {
        status: "MATCHED",
        method: "MANUAL",
        matchedDxfId: dxf.id,
        candidates: [
          {
            dxfId: dxf.id,
            partId: dxf.partId,
            filename: dxf.filename,
            widthMm: dxf.widthMm,
            lengthMm: dxf.lengthMm,
            widthDifferenceMm: null,
            lengthDifferenceMm: null,
          },
        ],
        message: null,
      };
    } else {
      match = {
        status: "UNMATCHED",
        method: null,
        matchedDxfId: null,
        candidates: [],
        message: "No available DXF for exact ID",
      };
    }

    const resultRow: SimpleResultRow = {
      resultRowId: `res_${rowId}`,
      extracted,
      match,
      status: "READY",
      excluded: false,
      edits: {},
    };
    resultRow.status = deriveResultRowStatus(resultRow);

    const resultRows = [...session.resultRows, resultRow];
    const extractedRows = [...session.extractedRows, extracted];
    const coverageIssues = session.coverageIssues.filter(
      (i) =>
        !(
          i.normalizedPartId === issue.normalizedPartId &&
          i.sheetName === issue.sheetName &&
          i.sourceRow === issue.sourceRow &&
          i.cellAddress === issue.cellAddress
        )
    );
    const coverageStats = {
      exactIdsFoundInWorkbook:
        session.localSummary?.exactIdsFoundInWorkbook ?? 0,
      exactIdsPresentInExtractedRows:
        (session.localSummary?.exactIdsPresentInExtractedRows ?? 0) + 1,
      exactIdsMissingFromExtraction: new Set(
        coverageIssues.map((i) => i.normalizedPartId)
      ).size,
    };
    const refreshed = refreshAvailability(
      resultRows,
      session.dxfParts,
      coverageIssues,
      coverageStats
    );
    setSession({
      ...session,
      resultRows,
      extractedRows,
      coverageIssues,
      ...refreshed,
    });
  },

  async analyze(): Promise<void> {
    if (!session.workbookFile || session.dxfFiles.length === 0) return;
    if (session.status === "ANALYZING") return;

    const workbookFile = session.workbookFile;
    const dxfFiles = [...session.dxfFiles];
    const runId = newRunId();
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const timing = emptyTiming();

    setSession({
      ...session,
      status: "ANALYZING",
      runId,
      startedAt,
      completedAt: null,
      error: null,
      analyzingLabel: "קורא קובצי DXF",
      resultRows: [],
      extractedRows: [],
      unmatchedDxfIds: [],
      dxfAvailability: [],
      coverageIssues: [],
      exactIdOccurrences: [],
      hasCoverageWarnings: false,
      localSummary: null,
      matchingDiagnostics: null,
      lastDebug: null,
      providerCallCount: 0,
      timing,
    });

    try {
      const tDxf = Date.now();
      const { parts: dxfParts } = await parseSimpleDxfFiles(dxfFiles);
      timing.dxfParseMs = Date.now() - tDxf;

      setSession({
        ...getSimpleIntakeSession(),
        dxfParts,
        analyzingLabel: "קורא את קובץ ה-Excel",
        timing: { ...timing },
      });

      const tWb = Date.now();
      const snapResult = await buildSimpleWorkbookSnapshot({
        file: workbookFile,
        workbookId: `wb_${runId}`,
      });
      timing.workbookSnapshotMs = Date.now() - tWb;
      if (!snapResult.ok) {
        const incomplete = snapResult.message.includes(
          "WORKBOOK_SNAPSHOT_INCOMPLETE"
        );
        const error: SimpleIntakeError = {
          stage: incomplete
            ? "WORKBOOK_SNAPSHOT_INCOMPLETE"
            : "WORKBOOK_READ",
          message: snapResult.message,
          retryable: true,
        };
        timing.totalMs = Date.now() - t0;
        fail(
          error,
          timing,
          runId,
          startedAt,
          dxfParts,
          null,
          null,
          0,
          snapResult.coverage
        );
        return;
      }

      // Source-faithful: do NOT scan workbook text against DXF filenames.
      // Numeric DXF names (1.dxf, 6.dxf, …) must not create extraction hints.
      const exactIdOccurrences: SimpleIntakeSession["exactIdOccurrences"] = [];

      setSession({
        ...getSimpleIntakeSession(),
        workbookSnapshot: snapResult.snapshot,
        exactIdOccurrences,
        analyzingLabel: "מנתח את ה-Excel באמצעות AI",
        timing: { ...timing },
      });

      const tAi = Date.now();
      let aiJson: {
        ok: boolean;
        result?: unknown;
        message?: string;
        stage?: string;
        retryable?: boolean;
        providerCallCount?: number;
        durationMs?: number;
      };
      try {
        const res = await fetch("/api/simple-intake/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Workbook snapshot only — no DXF filenames, IDs, geometry, or hints
          body: JSON.stringify({
            snapshot: snapResult.snapshot,
          }),
        });
        aiJson = (await res.json()) as typeof aiJson;
        timing.aiCallMs = Date.now() - tAi;
        if (!res.ok || !aiJson.ok) {
          const error: SimpleIntakeError = {
            stage:
              (aiJson.stage as SimpleIntakeError["stage"]) || "AI_REQUEST",
            message: aiJson.message || "בקשת ה-AI נכשלה",
            retryable: aiJson.retryable ?? true,
          };
          timing.totalMs = Date.now() - t0;
          fail(
            error,
            timing,
            runId,
            startedAt,
            dxfParts,
            snapResult.snapshot,
            aiJson,
            aiJson.providerCallCount ?? 0,
            snapResult.coverage
          );
          return;
        }
      } catch (err) {
        timing.aiCallMs = Date.now() - tAi;
        const error: SimpleIntakeError = {
          stage: "AI_REQUEST",
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        };
        timing.totalMs = Date.now() - t0;
        fail(
          error,
          timing,
          runId,
          startedAt,
          dxfParts,
          snapResult.snapshot,
          null,
          0,
          snapResult.coverage
        );
        return;
      }

      const providerCallCount = aiJson.providerCallCount ?? 1;
      const aiResult = aiJson.result as Parameters<
        typeof validateSimpleAiResult
      >[0]["ai"];

      setSession({
        ...getSimpleIntakeSession(),
        analyzingLabel: "מתאים בין הנתונים לקובצי DXF",
        providerCallCount,
        timing: { ...timing },
      });

      const validated = validateSimpleAiResult({
        snapshot: snapResult.snapshot,
        ai: aiResult,
      });
      if (!validated.ok) {
        const error: SimpleIntakeError = {
          stage: "VALIDATION",
          message: validated.errorMessage ?? "אימות נכשל",
          retryable: false,
        };
        timing.totalMs = Date.now() - t0;
        fail(
          error,
          timing,
          runId,
          startedAt,
          dxfParts,
          snapResult.snapshot,
          aiResult,
          providerCallCount,
          snapResult.coverage
        );
        return;
      }

      // Counts always from arrays — never from AI summary text
      const extractedRowCount = Array.isArray(aiResult.rows)
        ? aiResult.rows.length
        : validated.rows.length;
      const validatedRowCount = validated.rows.length;

      timing.coverageCheckMs = 0;

      const tMatch = Date.now();
      const matched = matchSimpleRows({
        extractedRows: validated.rows,
        dxfParts,
        extractedRowCount,
      });
      timing.matchingMs = Date.now() - tMatch;
      timing.candidateGenerationMs =
        matched.diagnostics.timing.candidateGenerationMs;
      timing.automaticAssignmentMs =
        matched.diagnostics.timing.automaticAssignmentMs;
      timing.strongAssignmentMs =
        matched.diagnostics.timing.strongAssignmentMs;
      timing.propagationMs = matched.diagnostics.timing.propagationMs;
      timing.finalClassificationMs =
        matched.diagnostics.timing.finalClassificationMs;

      const coverageStats = {
        exactIdsFoundInWorkbook: 0,
        exactIdsPresentInExtractedRows: 0,
        exactIdsMissingFromExtraction: 0,
      };

      const tAvail = Date.now();
      const dxfAvailability = deriveSimpleDxfAvailability({
        dxfParts,
        resultRows: matched.resultRows,
        coverageIssues: [],
      });
      timing.availabilityDerivationMs = Date.now() - tAvail;

      const localSummary = buildSimpleIntakeResultSummary({
        extractedRowCount,
        validatedRows: validated.rows,
        resultRows: matched.resultRows,
        dxfAvailability,
        coverageStats,
      });
      // Ensure displayed counts match arrays (ignore any AI summary claims)
      localSummary.extractedRows = extractedRowCount;
      localSummary.validatedRows = validatedRowCount;

      const unmatchedDxfIds = dxfAvailability
        .filter((d) => d.state === "UNUSED")
        .map((d) => d.dxfId);

      timing.totalMs = Date.now() - t0;
      const completedAt = new Date().toISOString();

      const diagnostics = {
        ...matched.diagnostics,
        dxfAvailability,
        localSummary,
      };

      const debug = buildSimpleIntakeDebug({
        runId,
        startedAt,
        completedAt,
        timing,
        workbookFileName: workbookFile.name,
        dxfFileNames: dxfFiles.map((f) => f.name),
        snapshot: snapResult.snapshot,
        providerCallCount,
        aiRawResult: aiResult,
        validatedRows: validated.rows,
        dxfParts,
        resultRows: matched.resultRows,
        unmatchedDxfIds,
        diagnostics,
        snapshotCoverage: snapResult.coverage,
        error: null,
      });

      setSession({
        ...getSimpleIntakeSession(),
        status: "READY",
        analyzingLabel: null,
        extractedRows: validated.rows,
        dxfParts,
        resultRows: matched.resultRows,
        unmatchedDxfIds,
        dxfAvailability,
        coverageIssues: [],
        exactIdOccurrences: [],
        hasCoverageWarnings: false,
        localSummary,
        matchingDiagnostics: diagnostics,
        workbookSnapshot: snapResult.snapshot,
        timing,
        completedAt,
        lastDebug: debug,
        providerCallCount,
        error: null,
      });
    } catch (err) {
      const error: SimpleIntakeError = {
        stage: "AI_REQUEST",
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
      timing.totalMs = Date.now() - t0;
      fail(error, timing, runId, startedAt, [], null, null, 0);
    }
  },
};

function fail(
  error: SimpleIntakeError,
  timing: SimpleTiming,
  runId: string,
  startedAt: string,
  dxfParts: SimpleIntakeSession["dxfParts"],
  snapshot: SimpleIntakeSession["workbookSnapshot"],
  aiRaw: unknown,
  providerCallCount: number,
  snapshotCoverage?: SnapshotSheetCoverage[]
): void {
  const completedAt = new Date().toISOString();
  const cur = getSimpleIntakeSession();
  const debug = buildSimpleIntakeDebug({
    runId,
    startedAt,
    completedAt,
    timing,
    workbookFileName: cur.workbookFile?.name ?? null,
    dxfFileNames: cur.dxfFiles.map((f) => f.name),
    snapshot,
    providerCallCount,
    aiRawResult: aiRaw,
    validatedRows: [],
    dxfParts,
    resultRows: [],
    unmatchedDxfIds: [],
    diagnostics: null,
    snapshotCoverage: snapshotCoverage ?? null,
    error,
  });
  setSession({
    ...cur,
    status: "FAILED",
    error,
    timing,
    completedAt,
    analyzingLabel: null,
    dxfParts,
    workbookSnapshot: snapshot,
    lastDebug: debug,
    providerCallCount,
    resultRows: [],
    extractedRows: [],
    dxfAvailability: [],
    coverageIssues: [],
    exactIdOccurrences: [],
    hasCoverageWarnings: false,
    localSummary: null,
    matchingDiagnostics: null,
  });
}
