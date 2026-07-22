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
} from "./matchSimpleRows";
import { matchWithFilenamePriority } from "./matchWithFilenamePriority";
import {
  effectiveMaterialFields,
  refreshRowCompleteness,
  summarizeMaterialList,
} from "./materialList/completeness";
import {
  detectMaterialSourceTypeFromName,
} from "./materialList/materialSourceTypes";
import { materialListToExtractedRows } from "./materialList/toExtractedRows";
import {
  buildDxfLinkedMaterialItems,
  buildDxfLinkStageDebug,
} from "./dxfLink";
import type {
  MaterialListRow,
  MaterialListUserOverrides,
} from "./materialList/types";
import { normalizePartIdForMatch } from "./normalizePartId";
import { parseSimpleDxfFiles } from "./parseSimpleDxfFiles";
import type {
  OmegaQuoteStage,
  QuoteWorkspaceDetails,
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

const QUOTE_STAGE_ORDER: OmegaQuoteStage[] = [
  "MATERIAL_LIST",
  "DXF_MATCHING",
  "DATA_APPROVAL",
  "QUOTE_PRICING",
  "COMPLETED",
];

function markEntered(
  prev: OmegaQuoteStage[],
  stage: OmegaQuoteStage
): OmegaQuoteStage[] {
  if (stage === "QUOTE_SETUP") return prev;
  if (prev.includes(stage)) return prev;
  return [...prev, stage];
}

function stageIndex(stage: OmegaQuoteStage): number {
  return QUOTE_STAGE_ORDER.indexOf(stage);
}

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
    quoteDetails: null,
    quoteStage: "QUOTE_SETUP",
    enteredQuoteStages: [],
    runId: null,
    workbookFile: null,
    dxfFiles: [],
    workbookSnapshot: null,
    materialListRows: [],
    materialListApproved: false,
    materialListShowUnresolvedOnly: false,
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
  workbook: File | null
): SimpleIntakeSession["status"] {
  if (workbook) return "FILES_READY";
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

  createQuote(details: {
    projectName: string;
    customerName: string;
  }): boolean {
    const projectName = details.projectName.trim();
    const customerName = details.customerName.trim();
    if (!projectName || !customerName) return false;
    const quoteDetails: QuoteWorkspaceDetails = {
      projectName,
      customerName,
      createdAt: new Date().toISOString(),
    };
    setSession({
      ...session,
      quoteDetails,
      quoteStage: "MATERIAL_LIST",
      enteredQuoteStages: markEntered([], "MATERIAL_LIST"),
    });
    return true;
  },

  updateQuoteDetails(details: {
    projectName: string;
    customerName: string;
  }): boolean {
    if (!session.quoteDetails) return false;
    const projectName = details.projectName.trim();
    const customerName = details.customerName.trim();
    if (!projectName || !customerName) return false;
    setSession({
      ...session,
      quoteDetails: {
        ...session.quoteDetails,
        projectName,
        customerName,
      },
    });
    return true;
  },

  /**
   * Navigate to an already-entered quote stage without wiping workflow data.
   */
  goToQuoteStage(stage: OmegaQuoteStage): void {
    if (!session.quoteDetails) return;
    if (stage === "QUOTE_SETUP") return;
    const currentIdx = stageIndex(session.quoteStage);
    const targetIdx = stageIndex(stage);
    if (targetIdx < 0) return;

    const entered = session.enteredQuoteStages.includes(stage);
    if (targetIdx > currentIdx && !entered) return;
    if (targetIdx < currentIdx && !entered) return;

    let status = session.status;
    if (stage === "MATERIAL_LIST") {
      status =
        session.materialListRows.length > 0
          ? "MATERIAL_LIST_REVIEW"
          : recomputeReadyStatus(session.workbookFile);
    } else if (stage === "DXF_MATCHING") {
      if (session.resultRows.length > 0) status = "DXF_REVIEW";
      else if (session.materialListApproved) status = "DXF_UPLOAD";
    } else if (stage === "DATA_APPROVAL") {
      status = "FINAL_PRICING_TABLE";
    } else if (stage === "QUOTE_PRICING" || stage === "COMPLETED") {
      status = "FINAL_PRICING_TABLE";
    }

    setSession({
      ...session,
      status,
      quoteStage: stage,
      enteredQuoteStages: markEntered(session.enteredQuoteStages, stage),
    });
  },

  advanceToPricing(): void {
    if (
      session.quoteStage !== "DATA_APPROVAL" &&
      session.status !== "FINAL_PRICING_TABLE" &&
      session.status !== "DXF_REVIEW" &&
      session.status !== "READY"
    ) {
      return;
    }
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "QUOTE_PRICING",
      enteredQuoteStages: markEntered(session.enteredQuoteStages, "QUOTE_PRICING"),
    });
  },

  setWorkbook(file: File | null): void {
    const next = {
      ...session,
      workbookFile: file,
      status: recomputeReadyStatus(file),
      error: null,
    };
    if (
      session.status === "READY" ||
      session.status === "FAILED" ||
      session.status === "MATERIAL_LIST_REVIEW" ||
      session.status === "DXF_UPLOAD"
    ) {
      next.status = recomputeReadyStatus(file);
      next.resultRows = [];
      next.extractedRows = [];
      next.materialListRows = [];
      next.materialListApproved = false;
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
    const status =
      session.status === "DXF_UPLOAD" ||
      session.status === "READY" ||
      session.status === "MATERIAL_LIST_REVIEW"
        ? session.status
        : recomputeReadyStatus(session.workbookFile);
    setSession({
      ...session,
      dxfFiles: merged,
      status,
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
    const matched = matchWithFilenamePriority({
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

  /**
   * Re-run local matching using edited source dimensions (and other edits).
   * Does not call AI or re-extract the workbook.
   */
  rematchLocallyPreservingEdits(): void {
    if (session.status !== "READY") return;
    const extractedRows = session.resultRows.map((r) => {
      const e = { ...r.extracted };
      if (Object.prototype.hasOwnProperty.call(r.edits, "widthMm")) {
        e.widthMm = r.edits.widthMm ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(r.edits, "lengthMm")) {
        e.lengthMm = r.edits.lengthMm ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(r.edits, "partId")) {
        e.partId = r.edits.partId ?? null;
      }
      return e;
    });
    const matched = matchWithFilenamePriority({
      extractedRows,
      dxfParts: session.dxfParts,
      extractedRowCount: extractedRows.length,
    });
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
        // Keep extracted identity/source cells from original extraction,
        // but use rematched geometry dims already applied via extractedRows copy.
        extracted: {
          ...prev.extracted,
          widthMm: r.extracted.widthMm,
          lengthMm: r.extracted.lengthMm,
          partId: r.extracted.partId,
        },
      };
      return {
        ...next,
        status: next.excluded
          ? ("EXCLUDED" as const)
          : deriveResultRowStatus(next),
      };
    });
    const refreshed = refreshAvailability(
      mergedResultRows,
      session.dxfParts,
      session.coverageIssues
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
      extractedRowCount: session.extractedRows.length,
      validatedRows: session.extractedRows,
      resultRows: mergedResultRows,
      dxfAvailability: refreshed.dxfAvailability,
      coverageStats,
    });
    setSession({
      ...session,
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
  },

  removeDxf(fileName: string): void {
    const merged = session.dxfFiles.filter((f) => f.name !== fileName);
    const status =
      session.status === "DXF_UPLOAD" ||
      session.status === "READY" ||
      session.status === "MATERIAL_LIST_REVIEW"
        ? session.status
        : recomputeReadyStatus(session.workbookFile);
    setSession({
      ...session,
      dxfFiles: merged,
      status,
    });
  },

  clearFiles(): void {
    setSession(createEmptySession());
  },

  backToFiles(): void {
    setSession({
      ...session,
      status: recomputeReadyStatus(session.workbookFile),
      quoteStage: session.quoteDetails ? "MATERIAL_LIST" : "QUOTE_SETUP",
      enteredQuoteStages: session.quoteDetails
        ? markEntered(session.enteredQuoteStages, "MATERIAL_LIST")
        : [],
      error: null,
      analyzingLabel: null,
      resultRows: [],
      extractedRows: [],
      materialListRows: [],
      materialListApproved: false,
      materialListShowUnresolvedOnly: false,
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

  updateMaterialListOverrides(
    rowId: string,
    patch: MaterialListUserOverrides
  ): void {
    if (
      session.status !== "MATERIAL_LIST_REVIEW" &&
      session.status !== "DXF_UPLOAD" &&
      session.status !== "READY"
    ) {
      return;
    }
    const materialListRows = session.materialListRows.map((r) => {
      if (r.rowId !== rowId) return r;
      const fieldResolutions = { ...r.fieldResolutions };
      for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
        if (
          key === "material" ||
          key === "thicknessMm" ||
          key === "quantity" ||
          key === "widthMm" ||
          key === "lengthMm"
        ) {
          const v = patch[key];
          if (v != null && v !== "") {
            fieldResolutions[key] = "EXACT_PRIMARY";
          }
        }
      }
      const next: MaterialListRow = {
        ...r,
        userOverrides: { ...r.userOverrides, ...patch },
        fieldResolutions,
      };
      return refreshRowCompleteness(next, {
        keepApprovedWithMissing: session.materialListApproved,
      });
    });
    setSession({ ...session, materialListRows });
  },

  duplicateMaterialListRow(rowId: string): void {
    if (
      session.status !== "MATERIAL_LIST_REVIEW" &&
      session.status !== "MATERIAL_LIST_QUALITY_FAILED"
    ) {
      return;
    }
    const idx = session.materialListRows.findIndex((r) => r.rowId === rowId);
    if (idx < 0) return;
    const source = session.materialListRows[idx]!;
    const e = effectiveMaterialFields(source);
    const newRowId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `material-row-${crypto.randomUUID()}`
        : `material-row-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const draft: MaterialListRow = {
      rowId: newRowId,
      sheetName: source.sheetName,
      sourceRow: null,
      sourceCell: null,
      partId: null,
      profile: null,
      description: null,
      material: null,
      thicknessMm: null,
      quantity: null,
      widthMm: null,
      lengthMm: null,
      dxfFileName: source.dxfFileName,
      userOverrides: {
        partId: e.partId,
        profile: e.profile,
        description: e.description,
        material: e.material,
        thicknessMm: e.thicknessMm,
        quantity: e.quantity,
        widthMm: e.widthMm,
        lengthMm: e.lengthMm,
      },
      fieldResolutions: { ...source.fieldResolutions },
      approvalStatus: "NEEDS_COMPLETION",
    };
    const duplicated = refreshRowCompleteness(draft);
    const materialListRows = [
      ...session.materialListRows.slice(0, idx + 1),
      duplicated,
      ...session.materialListRows.slice(idx + 1),
    ];
    setSession({ ...session, materialListRows });
  },

  deleteMaterialListRow(rowId: string): void {
    if (
      session.status !== "MATERIAL_LIST_REVIEW" &&
      session.status !== "MATERIAL_LIST_QUALITY_FAILED"
    ) {
      return;
    }
    const materialListRows = session.materialListRows.filter(
      (r) => r.rowId !== rowId
    );
    if (materialListRows.length === session.materialListRows.length) return;
    setSession({ ...session, materialListRows });
  },

  showUnresolvedMaterialItems(): void {
    if (session.status !== "MATERIAL_LIST_QUALITY_FAILED") return;
    setSession({
      ...session,
      status: "MATERIAL_LIST_REVIEW",
      materialListShowUnresolvedOnly: true,
    });
  },

  approveMaterialList(opts: { allowMissing: boolean }): void {
    if (session.status !== "MATERIAL_LIST_REVIEW") return;
    const summary = summarizeMaterialList(session.materialListRows);
    if (!opts.allowMissing && summary.incompleteRows > 0) return;

    const materialListRows = session.materialListRows.map((r) => {
      if (r.approvalStatus === "COMPLETE") return r;
      if (opts.allowMissing) {
        return { ...r, approvalStatus: "APPROVED_WITH_MISSING_DATA" as const };
      }
      return r;
    });

    setSession({
      ...session,
      materialListRows,
      materialListApproved: true,
      status: "DXF_UPLOAD",
      quoteStage: "DXF_MATCHING",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "DXF_MATCHING"
      ),
      extractedRows: materialListToExtractedRows(materialListRows),
    });
  },

  backToMaterialList(): void {
    if (
      session.status !== "DXF_UPLOAD" &&
      session.status !== "DXF_REVIEW" &&
      session.status !== "FINAL_PRICING_TABLE" &&
      session.status !== "READY" &&
      session.status !== "MATERIAL_LIST_REVIEW"
    ) {
      return;
    }
    setSession({
      ...session,
      status: "MATERIAL_LIST_REVIEW",
      quoteStage: "MATERIAL_LIST",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "MATERIAL_LIST"
      ),
      // Keep DXF files and prior match results for back-nav preservation.
    });
  },

  async runDxfStageFromApprovedList(): Promise<void> {
    if (!session.materialListApproved) return;
    if (session.dxfFiles.length === 0) return;
    if (
      session.status !== "DXF_UPLOAD" &&
      session.status !== "DXF_REVIEW" &&
      session.status !== "FINAL_PRICING_TABLE" &&
      session.status !== "READY"
    ) {
      return;
    }

    const dxfFiles = [...session.dxfFiles];
    const materialListRows = session.materialListRows;
    const extractedRows = materialListToExtractedRows(materialListRows);
    const runId = session.runId ?? newRunId();
    const startedAt = session.startedAt ?? new Date().toISOString();
    const t0 = Date.now();
    const timing = { ...session.timing };

    setSession({
      ...session,
      status: "DXF_PROCESSING",
      analyzingLabel: "קורא קובצי DXF",
      extractedRows,
    });

    try {
      const tDxf = Date.now();
      const { parts: dxfParts } = await parseSimpleDxfFiles(dxfFiles);
      timing.dxfParseMs = Date.now() - tDxf;

      setSession({
        ...getSimpleIntakeSession(),
        dxfParts,
        analyzingLabel: "מתאים בין הנתונים לקובצי DXF",
        timing: { ...timing },
      });

      const tMatch = Date.now();
      const matched = matchWithFilenamePriority({
        extractedRows,
        dxfParts,
        extractedRowCount: extractedRows.length,
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

      const tAvail = Date.now();
      const dxfAvailability = deriveSimpleDxfAvailability({
        dxfParts,
        resultRows: matched.resultRows,
        coverageIssues: [],
      });
      timing.availabilityDerivationMs = Date.now() - tAvail;

      const localSummary = buildSimpleIntakeResultSummary({
        extractedRowCount: extractedRows.length,
        validatedRows: extractedRows,
        resultRows: matched.resultRows,
        dxfAvailability,
        coverageStats: {
          exactIdsFoundInWorkbook: 0,
          exactIdsPresentInExtractedRows: 0,
          exactIdsMissingFromExtraction: 0,
        },
      });
      localSummary.extractedRows = extractedRows.length;
      localSummary.validatedRows = extractedRows.length;

      const unmatchedDxfIds = dxfAvailability
        .filter((d) => d.state === "UNUSED")
        .map((d) => d.dxfId);

      timing.totalMs = (session.timing.totalMs ?? 0) + (Date.now() - t0);
      const completedAt = new Date().toISOString();
      const diagnostics = {
        ...matched.diagnostics,
        dxfAvailability,
        localSummary,
      };

      const prevDebug = session.lastDebug ?? {};
      const debug = buildSimpleIntakeDebug({
        runId,
        startedAt,
        completedAt,
        timing,
        workbookFileName: session.workbookFile?.name ?? null,
        dxfFileNames: dxfFiles.map((f) => f.name),
        snapshot: session.workbookSnapshot,
        providerCallCount: session.providerCallCount,
        aiRawResult: {
          ...(typeof prevDebug.aiRawResult === "object" &&
          prevDebug.aiRawResult
            ? prevDebug.aiRawResult
            : {}),
          stage2: "DXF_MATCH_ONLY_NO_AI",
        },
        validatedRows: extractedRows,
        dxfParts,
        resultRows: matched.resultRows,
        unmatchedDxfIds,
        diagnostics,
        snapshotCoverage: null,
        error: null,
        extractionProviderDebug:
          (prevDebug.extractionProvider as Record<string, unknown>) ??
          (prevDebug.extractionProviderDebug as Record<string, unknown>) ??
          null,
      });

      // Preserve materialListStage from Stage 1 debug when present.
      if (
        prevDebug.materialListStage &&
        typeof prevDebug.materialListStage === "object"
      ) {
        (debug as Record<string, unknown>).materialListStage =
          prevDebug.materialListStage;
      }

      const linkedItems = buildDxfLinkedMaterialItems({
        materialListRows,
        resultRows: matched.resultRows,
        dxfParts,
        diagnostics,
      });
      (debug as Record<string, unknown>).dxfLinkStage = buildDxfLinkStageDebug({
        items: linkedItems,
        dxfParts,
        unmatchedDxfCount: unmatchedDxfIds.length,
        resultRows: matched.resultRows,
        filenameMatching: matched.filenameMatchingDebug,
      });
      (debug as Record<string, unknown>).dxfFilenameMatching =
        matched.filenameMatchingDebug;
      (debug as Record<string, unknown>).itemFilenameMatchDebug =
        matched.itemFilenameDebug;
      (debug as Record<string, unknown>).aiCallCountStage2 = 0;

      setSession({
        ...getSimpleIntakeSession(),
        status: "DXF_REVIEW",
        quoteStage: "DXF_MATCHING",
        enteredQuoteStages: markEntered(
          getSimpleIntakeSession().enteredQuoteStages,
          "DXF_MATCHING"
        ),
        analyzingLabel: null,
        materialListRows,
        materialListApproved: true,
        extractedRows,
        dxfParts,
        resultRows: matched.resultRows,
        unmatchedDxfIds,
        dxfAvailability,
        coverageIssues: [],
        hasCoverageWarnings: false,
        localSummary,
        matchingDiagnostics: diagnostics,
        timing,
        completedAt,
        lastDebug: debug,
        error: null,
        providerCallCount: session.providerCallCount,
      });
    } catch (err) {
      const error: SimpleIntakeError = {
        stage: "DXF_READ",
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
      setSession({
        ...getSimpleIntakeSession(),
        status: "DXF_UPLOAD",
        analyzingLabel: null,
        error,
      });
    }
  },

  enterFinalPricingTable(): void {
    if (
      session.status !== "DXF_REVIEW" &&
      session.status !== "READY" &&
      session.status !== "FINAL_PRICING_TABLE"
    ) {
      return;
    }
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "DATA_APPROVAL",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "DATA_APPROVAL"
      ),
    });
  },

  async analyze(): Promise<void> {
    if (!session.workbookFile) return;
    if (session.status === "ANALYZING") return;

    const workbookFile = session.workbookFile;
    const sourceType =
      detectMaterialSourceTypeFromName(workbookFile.name) ?? "EXCEL";
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
      analyzingLabel:
        sourceType === "PDF"
          ? "קוראים את מסמך ה-PDF..."
          : "קוראים את קובץ האקסל...",
      resultRows: [],
      extractedRows: [],
      materialListRows: [],
      materialListApproved: false,
      materialListShowUnresolvedOnly: false,
      unmatchedDxfIds: [],
      dxfAvailability: [],
      coverageIssues: [],
      exactIdOccurrences: [],
      hasCoverageWarnings: false,
      localSummary: null,
      matchingDiagnostics: null,
      lastDebug: null,
      providerCallCount: 0,
      dxfParts: [],
      timing,
    });

    try {
      const tWb = Date.now();
      let snapResult: Awaited<
        ReturnType<typeof buildSimpleWorkbookSnapshot>
      > | null = null;

      if (sourceType === "EXCEL") {
        snapResult = await buildSimpleWorkbookSnapshot({
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
            [],
            null,
            null,
            0,
            snapResult.coverage
          );
          return;
        }

        setSession({
          ...getSimpleIntakeSession(),
          workbookSnapshot: snapResult.snapshot,
          analyzingLabel: "מארגנים את הנתונים לטבלה אחידה...",
          timing: { ...timing },
        });
      } else {
        timing.workbookSnapshotMs = 0;
        setSession({
          ...getSimpleIntakeSession(),
          workbookSnapshot: null,
          analyzingLabel: "סורקים את כל העמודים...",
          timing: { ...timing },
        });
      }

      const tAi = Date.now();
      let aiJson: {
        ok: boolean;
        result?: unknown;
        materialListRows?: MaterialListRow[];
        message?: string;
        stage?: string;
        retryable?: boolean;
        providerCallCount?: number;
        durationMs?: number;
        model?: string;
        usage?: Record<string, unknown>;
        materialListStage?: Record<string, unknown>;
        qualityGatePassed?: boolean;
        qualityGate?: Record<string, unknown>;
        targetedRepair?: Record<string, unknown>;
        costs?: Record<string, unknown>;
        extractionProviderDebug?: Record<string, unknown>;
        extractionProvider?: string;
        sourceDocument?: Record<string, unknown>;
        pdfExtraction?: Record<string, unknown>;
      };
      try {
        const form = new FormData();
        form.append("sourceType", sourceType);
        form.append(
          "source",
          workbookFile,
          workbookFile.name || (sourceType === "PDF" ? "source.pdf" : "workbook.xlsx")
        );
        if (sourceType === "EXCEL" && snapResult?.ok) {
          form.append("snapshot", JSON.stringify(snapResult.snapshot));
          form.append(
            "workbook",
            workbookFile,
            workbookFile.name || snapResult.snapshot.filename
          );
        }
        const res = await fetch("/api/simple-intake/analyze", {
          method: "POST",
          body: form,
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
            [],
            snapResult && snapResult.ok ? snapResult.snapshot : null,
            {
              ...aiJson,
              extractionProviderDebug: aiJson.extractionProviderDebug,
            },
            aiJson.providerCallCount ?? 0,
            snapResult && snapResult.ok ? snapResult.coverage : undefined
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
          [],
          snapResult && snapResult.ok ? snapResult.snapshot : null,
          null,
          0,
          snapResult && snapResult.ok ? snapResult.coverage : undefined
        );
        return;
      }

      const providerCallCount = aiJson.providerCallCount ?? 1;
      const materialListRows = Array.isArray(aiJson.materialListRows)
        ? aiJson.materialListRows
        : [];

      if (materialListRows.length === 0) {
        // Legacy OpenAI / Llama path: adapt via validateSimpleAiResult
        if (!snapResult?.ok) {
          const error: SimpleIntakeError = {
            stage: "VALIDATION",
            message:
              sourceType === "PDF"
                ? "הקובץ נקלט, אך לא ניתן היה לפענח ממנו רשימת חומר בצורה אמינה."
                : "לא נמצאו שורות חומר בקובץ",
            retryable: false,
          };
          timing.totalMs = Date.now() - t0;
          fail(
            error,
            timing,
            runId,
            startedAt,
            [],
            null,
            aiJson,
            providerCallCount,
            undefined
          );
          return;
        }
        const aiResult = aiJson.result as Parameters<
          typeof validateSimpleAiResult
        >[0]["ai"];
        const validated = validateSimpleAiResult({
          snapshot: snapResult.snapshot,
          ai: aiResult,
        });
        if (!validated.ok || validated.rows.length === 0) {
          const error: SimpleIntakeError = {
            stage: "VALIDATION",
            message: validated.ok
              ? "לא נמצאו שורות חומר בקובץ"
              : (validated.errorMessage ?? "אימות נכשל"),
            retryable: false,
          };
          timing.totalMs = Date.now() - t0;
          fail(
            error,
            timing,
            runId,
            startedAt,
            [],
            snapResult.snapshot,
            aiResult,
            providerCallCount,
            snapResult.coverage
          );
          return;
        }
        // Should not happen on default OpenAI material-list path
        timing.totalMs = Date.now() - t0;
        fail(
          {
            stage: "VALIDATION",
            message: "תשובת השרת אינה בפורמט רשימת חומר",
            retryable: true,
          },
          timing,
          runId,
          startedAt,
          [],
          snapResult.snapshot,
          aiResult,
          providerCallCount,
          snapResult.coverage
        );
        return;
      }

      timing.totalMs = Date.now() - t0;
      const completedAt = new Date().toISOString();
      const mlSummary = summarizeMaterialList(materialListRows);
      const qualityGatePassed = aiJson.qualityGatePassed !== false;
      const snapshot = snapResult && snapResult.ok ? snapResult.snapshot : null;
      const coverage =
        snapResult && snapResult.ok ? snapResult.coverage : null;

      const debug = buildSimpleIntakeDebug({
        runId,
        startedAt,
        completedAt,
        timing,
        workbookFileName: workbookFile.name,
        dxfFileNames: [],
        snapshot,
        providerCallCount,
        aiRawResult: {
          ok: true,
          materialListRowCount: materialListRows.length,
          usage: aiJson.usage ?? null,
          model: aiJson.model ?? null,
          costs: aiJson.costs ?? null,
          sourceType,
        },
        validatedRows: materialListToExtractedRows(materialListRows),
        dxfParts: [],
        resultRows: [],
        unmatchedDxfIds: [],
        diagnostics: null,
        snapshotCoverage: coverage,
        error: qualityGatePassed
          ? null
          : {
              stage: "VALIDATION",
              message:
                "חלק מהנתונים קיימים בקובץ אך לא פוענחו בצורה אמינה.",
              retryable: true,
            },
        extractionProviderDebug: aiJson.extractionProviderDebug ?? null,
      });
      (debug as Record<string, unknown>).materialListStage =
        aiJson.materialListStage ?? {
          provider: "openai",
          model: aiJson.model ?? null,
          schemaVersion: "material-list-v1",
          extractedRowCount: materialListRows.length,
          validatedRowCount: materialListRows.length,
          completeRowCount: mlSummary.completeRows,
          incompleteRowCount: mlSummary.incompleteRows,
        };
      (debug as Record<string, unknown>).qualityGate =
        aiJson.qualityGate ?? null;
      (debug as Record<string, unknown>).targetedRepair =
        aiJson.targetedRepair ?? null;
      (debug as Record<string, unknown>).costs = aiJson.costs ?? null;
      (debug as Record<string, unknown>).sourceDocument =
        aiJson.sourceDocument ?? {
          sourceType,
          fileName: workbookFile.name,
          mimeType: workbookFile.type,
          fileSizeBytes: workbookFile.size,
          excelSheetCount: snapshot?.sheets.length ?? null,
          pdfPageCount: null,
          pdfDetail: null,
        };
      if (aiJson.pdfExtraction) {
        (debug as Record<string, unknown>).pdfExtraction = aiJson.pdfExtraction;
      }
      (debug as Record<string, unknown>).providerCall = {
        provider: "openai",
        count: providerCallCount,
        purpose:
          providerCallCount > 1
            ? "MATERIAL_LIST_EXTRACTION_PLUS_REPAIR"
            : "MATERIAL_LIST_EXTRACTION",
      };

      setSession({
        ...getSimpleIntakeSession(),
        status: qualityGatePassed
          ? "MATERIAL_LIST_REVIEW"
          : "MATERIAL_LIST_QUALITY_FAILED",
        analyzingLabel: null,
        materialListRows,
        materialListApproved: false,
        materialListShowUnresolvedOnly: false,
        extractedRows: materialListToExtractedRows(materialListRows),
        dxfParts: [],
        resultRows: [],
        unmatchedDxfIds: [],
        dxfAvailability: [],
        coverageIssues: [],
        exactIdOccurrences: [],
        hasCoverageWarnings: false,
        localSummary: null,
        matchingDiagnostics: null,
        workbookSnapshot: snapshot,
        timing,
        completedAt,
        lastDebug: debug,
        providerCallCount,
        error: qualityGatePassed
          ? null
          : {
              stage: "VALIDATION",
              message:
                "חלק מהנתונים קיימים בקובץ אך לא פוענחו בצורה אמינה.",
              retryable: true,
            },
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
    // Keep Stage 1 canonical list in sync with table/readiness edits.
    const touched = resultRows.find((r) => r.resultRowId === resultRowId);
    let materialListRows = session.materialListRows;
    if (touched) {
      materialListRows = session.materialListRows.map((ml) => {
        if (ml.rowId !== touched.extracted.rowId) return ml;
        const patch: MaterialListUserOverrides = {};
        if (Object.prototype.hasOwnProperty.call(edits, "material")) {
          patch.material = edits.material ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(edits, "thicknessMm")) {
          patch.thicknessMm = edits.thicknessMm ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(edits, "quantity")) {
          patch.quantity = edits.quantity ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(edits, "widthMm")) {
          patch.widthMm = edits.widthMm ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(edits, "lengthMm")) {
          patch.lengthMm = edits.lengthMm ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(edits, "partId")) {
          patch.partId = edits.partId ?? null;
        }
        const next = {
          ...ml,
          userOverrides: { ...ml.userOverrides, ...patch },
        };
        return refreshRowCompleteness(next, {
          keepApprovedWithMissing: session.materialListApproved,
        });
      });
    }
    setSession({ ...session, resultRows, materialListRows, ...refreshed });
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
      dxfFileName: null,
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
  const extractionProviderDebug =
    aiRaw &&
    typeof aiRaw === "object" &&
    aiRaw !== null &&
    "extractionProviderDebug" in aiRaw
      ? ((aiRaw as { extractionProviderDebug?: Record<string, unknown> })
          .extractionProviderDebug ?? null)
      : null;
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
    extractionProviderDebug,
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
