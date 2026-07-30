/**
 * In-memory Simple Intake session — React tab memory only.
 */

import { buildSimpleWorkbookSnapshot } from "./buildSimpleWorkbookSnapshot";
import {
  isOmegaRoundTripWorkbook,
  parseOmegaRoundTripWorkbookWithMeta,
} from "./gapCommunication";
import { buildSimpleIntakeDebug } from "./buildSimpleDebug";
import {
  applyManualDxfSelection,
  deriveResultRowStatus,
  deriveSimpleDxfAvailability,
  buildSimpleIntakeResultSummary,
} from "./matchSimpleRows";
import { matchWithFilenamePriority } from "./matchWithFilenamePriority";
import {
  buildDxfFilenameCoverageDiagnostics,
  buildDxfFilenameMappingDiagnostics,
} from "./getExplicitDxfFileName";
import {
  buildUnifiedIntakeSummary,
  buildSummaryDiagnosticsV2,
  buildFilenameProvenanceSample,
} from "./buildUnifiedIntakeSummary";
import {
  buildFilenameFlowDiagnostics,
  buildFilenameFlowSample,
  buildInitialIntakeSummary,
} from "./buildInitialIntakeSummary";
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
import {
  hydrateQuoteItemCommercialOptions,
  normalizeQuoteItemFinish,
  type QuoteItemFinish,
} from "./quoteItemCommercialOptions";
import {
  buildFinalQuoteListMembership,
  type FinalQuoteListMembership,
} from "./finalQuoteListMembership";
import type { UnifiedQuoteItem } from "./missingRequiredItemFields";
import {
  createEmptyWeightPricingDraft,
  type WeightPricingDraft,
  type WeightPricingSummaryPayload,
} from "./weightPricing/types";
import {
  assertUserResolutionInvariants,
  buildUserResolutionDiagnostics,
  fromDimensionMismatchResolution,
  getMaterialRowUserResolution,
  setDimensionDecisionOnResolution,
  upsertFieldOverride,
  validateMaterialOverride,
  type MaterialRowFieldOverrides,
} from "./materialRowUserResolution";
import { parseSimpleDxfFiles } from "./parseSimpleDxfFiles";
import type { DimensionMismatchResolution } from "./results/types";
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
import { workbookActivityMinDurationMs } from "./ui/deriveWorkflowPresentation";
import { buildWorkflowDebug } from "./quoteWorkflow/quoteStageModel";

type Listener = () => void;

const QUOTE_STAGE_ORDER: OmegaQuoteStage[] = [
  "DXF_INTAKE",
  "MATERIAL_INTAKE",
  "UNIFIED_REVIEW",
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
    frozenMaterialRows: {},
    quoteItemCommercialOptions: {},
    finalQuoteListMembership: null,
    weightPricingDraft: null,
    weightPricingSummaryPayload: null,
    finalQuotationDraft: null,
    forcedReviewWorkspaceView: null,
    materialRowUserResolutions: {},
    confirmedManualMatchIds: [],
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

  /** Developer diagnostics merge — does not change workflow state. */
  patchLastDebug(patch: Record<string, unknown>): void {
    setSession({
      ...session,
      lastDebug: {
        ...(session.lastDebug ?? {}),
        ...patch,
      },
    });
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
      quoteStage: "DXF_INTAKE",
      status: "DXF_UPLOAD",
      enteredQuoteStages: markEntered([], "DXF_INTAKE"),
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
    if (stage === "DXF_INTAKE") {
      status = "DXF_UPLOAD";
    } else if (stage === "MATERIAL_INTAKE") {
      status =
        session.materialListRows.length > 0 &&
        session.status === "MATERIAL_LIST_QUALITY_FAILED"
          ? "MATERIAL_LIST_QUALITY_FAILED"
          : session.materialListRows.length > 0 &&
              session.resultRows.length === 0
            ? "MATERIAL_LIST_REVIEW"
            : recomputeReadyStatus(session.workbookFile);
    } else if (stage === "UNIFIED_REVIEW") {
      status =
        session.resultRows.length > 0
          ? session.status === "FINAL_PRICING_TABLE"
            ? "FINAL_PRICING_TABLE"
            : "DXF_REVIEW"
          : session.materialListRows.length > 0
            ? "MATERIAL_LIST_REVIEW"
            : "DXF_UPLOAD";
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

  /**
   * Approve the final quote list: refresh membership snapshot and open pricing.
   * Preserves any existing weightPricingDraft values for surviving group keys.
   */
  advanceToPricing(rows?: ReadonlyArray<UnifiedQuoteItem>): void {
    if (
      session.quoteStage !== "UNIFIED_REVIEW" &&
      session.status !== "FINAL_PRICING_TABLE" &&
      session.status !== "DXF_REVIEW" &&
      session.status !== "READY"
    ) {
      return;
    }
    const membership = rows
      ? buildFinalQuoteListMembership(rows)
      : session.finalQuoteListMembership;
    if (!membership || membership.includedMaterialRowIds.length === 0) {
      return;
    }
    const quotationId = session.runId ?? "local";
    const draft =
      session.weightPricingDraft ??
      createEmptyWeightPricingDraft(quotationId);
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "QUOTE_PRICING",
      enteredQuoteStages: markEntered(session.enteredQuoteStages, "QUOTE_PRICING"),
      finalQuoteListMembership: membership,
      weightPricingDraft: {
        ...draft,
        quotationId,
        updatedAt: new Date().toISOString(),
      },
    });
  },

  setWeightPricingDraft(draft: WeightPricingDraft | null): void {
    setSession({
      ...session,
      weightPricingDraft: draft,
    });
  },

  backToFinalQuoteList(): void {
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "UNIFIED_REVIEW",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "UNIFIED_REVIEW"
      ),
      forcedReviewWorkspaceView: "FINAL_TABLE",
    });
  },

  clearForcedReviewWorkspaceView(): void {
    if (session.forcedReviewWorkspaceView == null) return;
    setSession({
      ...session,
      forcedReviewWorkspaceView: null,
    });
  },

  advanceToQuotationSummary(payload: WeightPricingSummaryPayload): void {
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "COMPLETED",
      enteredQuoteStages: markEntered(session.enteredQuoteStages, "COMPLETED"),
      weightPricingSummaryPayload: payload,
    });
  },

  /** Return from סיכום הצעת מחיר to תמחור הצעת מחיר — preserve drafts. */
  backToWeightPricing(): void {
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "QUOTE_PRICING",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "QUOTE_PRICING"
      ),
    });
  },

  setFinalQuotationDraft(
    draft: import("./finalQuotation/types").FinalQuotationDraft | null
  ): void {
    setSession({
      ...session,
      finalQuotationDraft: draft,
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
      next.materialRowUserResolutions = {};
      next.confirmedManualMatchIds = [];
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

  /** Clears selected DXF uploads only — does not reset the quote session. */
  clearDxfFiles(): void {
    const status =
      session.status === "DXF_UPLOAD" ||
      session.status === "READY" ||
      session.status === "MATERIAL_LIST_REVIEW"
        ? session.status
        : recomputeReadyStatus(session.workbookFile);
    setSession({
      ...session,
      dxfFiles: [],
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
      quoteStage: session.quoteDetails ? "MATERIAL_INTAKE" : "QUOTE_SETUP",
      enteredQuoteStages: session.quoteDetails
        ? markEntered(session.enteredQuoteStages, "MATERIAL_INTAKE")
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
      // Keep dxfFiles + dxfParts registry for DXF-first reuse.
      lastDebug: null,
      providerCallCount: 0,
      frozenMaterialRows: {},
      quoteItemCommercialOptions: {},
      finalQuoteListMembership: null,
      weightPricingDraft: null,
      weightPricingSummaryPayload: null,
      finalQuotationDraft: null,
      forcedReviewWorkspaceView: null,
      materialRowUserResolutions: {},
      confirmedManualMatchIds: [],
      timing: emptyTiming(),
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
    if (
      session.status !== "MATERIAL_LIST_REVIEW" &&
      session.status !== "MATERIAL_LIST_QUALITY_FAILED"
    ) {
      return;
    }
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
      extractedRows: materialListToExtractedRows(materialListRows),
    });

    // Continue into local DXF matching → unified review (no separate DXF upload step).
    void simpleIntakeActions.runDxfStageFromApprovedList();
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
      status: recomputeReadyStatus(session.workbookFile),
      quoteStage: "MATERIAL_INTAKE",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "MATERIAL_INTAKE"
      ),
      // Keep DXF registry and prior match results for back-nav preservation.
    });
  },

  backToDxfIntake(): void {
    setSession({
      ...session,
      status: "DXF_UPLOAD",
      quoteStage: "DXF_INTAKE",
      enteredQuoteStages: markEntered(session.enteredQuoteStages, "DXF_INTAKE"),
      analyzingLabel: null,
      error: null,
    });
  },

  /**
   * Stage 1 complete: parse DXFs locally into the registry, then open material intake.
   * Does not run matching (no material rows yet) and does not call AI.
   */
  async completeDxfIntake(): Promise<void> {
    if (session.dxfFiles.length === 0) return;
    if (
      session.status !== "DXF_UPLOAD" &&
      session.quoteStage !== "DXF_INTAKE"
    ) {
      return;
    }

    const dxfFiles = [...session.dxfFiles];
    const existingParts = session.dxfParts;
    const reused =
      existingParts.length > 0 &&
      existingParts.every((p) =>
        dxfFiles.some((f) => f.name === p.filename || f.name === p.partId)
      );

    try {
      let dxfParts = existingParts;
      if (!reused || existingParts.length !== dxfFiles.length) {
        const parsed = await parseSimpleDxfFiles(dxfFiles);
        dxfParts = parsed.parts;
      }

      setSession({
        ...getSimpleIntakeSession(),
        status: recomputeReadyStatus(getSimpleIntakeSession().workbookFile),
        quoteStage: "MATERIAL_INTAKE",
        enteredQuoteStages: markEntered(
          markEntered(getSimpleIntakeSession().enteredQuoteStages, "DXF_INTAKE"),
          "MATERIAL_INTAKE"
        ),
        dxfParts,
        dxfFiles,
        analyzingLabel: null,
        error: null,
        lastDebug: {
          ...(getSimpleIntakeSession().lastDebug ?? {}),
          workflow: buildWorkflowDebug({
            activeStage: "MATERIAL_INTAKE",
            dxfParsedBeforeMaterialExtraction: true,
            reusedExistingDxfRegistry: reused,
            materialExtractionCompleted: false,
            dxfMatchingCompleted: false,
            unifiedReviewCreated: false,
          }),
        },
      });
    } catch (err) {
      setSession({
        ...getSimpleIntakeSession(),
        status: "DXF_UPLOAD",
        quoteStage: "DXF_INTAKE",
        analyzingLabel: null,
        error: {
          stage: "DXF_READ",
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
      });
    }
  },

  async runDxfStageFromApprovedList(): Promise<void> {
    if (session.materialListRows.length === 0) return;

    if (session.dxfFiles.length === 0) {
      // Unified review without DXF files.
      const materialListRows = session.materialListRows;
      const extractedRows = materialListToExtractedRows(materialListRows);
      setSession({
        ...session,
        materialListApproved: true,
        extractedRows,
        status: "DXF_REVIEW",
        quoteStage: "UNIFIED_REVIEW",
        enteredQuoteStages: markEntered(
          session.enteredQuoteStages,
          "UNIFIED_REVIEW"
        ),
        resultRows: [],
        unmatchedDxfIds: [],
        dxfAvailability: [],
        lastDebug: {
          ...(session.lastDebug ?? {}),
          workflow: buildWorkflowDebug({
            activeStage: "UNIFIED_REVIEW",
            dxfParsedBeforeMaterialExtraction: session.dxfParts.length > 0,
            reusedExistingDxfRegistry: session.dxfParts.length > 0,
            materialExtractionCompleted: true,
            dxfMatchingCompleted: false,
            unifiedReviewCreated: true,
          }),
        },
      });
      return;
    }

    const dxfFiles = [...session.dxfFiles];
    const materialListRows = session.materialListRows;
    const extractedRows = materialListToExtractedRows(materialListRows);
    const runId = session.runId ?? newRunId();
    const startedAt = session.startedAt ?? new Date().toISOString();
    const t0 = Date.now();
    const timing = { ...session.timing };
    const reusedExistingDxfRegistry = session.dxfParts.length > 0;

    setSession({
      ...session,
      status: "DXF_PROCESSING",
      analyzingLabel: "מתאים בין הנתונים לקובצי DXF",
      materialListApproved: true,
      extractedRows,
    });

    try {
      const tDxf = Date.now();
      let dxfParts = session.dxfParts;
      const namesMatch =
        dxfParts.length === dxfFiles.length &&
        dxfFiles.every((f) =>
          dxfParts.some((p) => p.filename === f.name || p.partId === f.name)
        );
      if (!namesMatch) {
        const parsed = await parseSimpleDxfFiles(dxfFiles);
        dxfParts = parsed.parts;
      }
      timing.dxfParseMs = (timing.dxfParseMs ?? 0) + (Date.now() - tDxf);

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
      (debug as Record<string, unknown>).dxfFilenameCoverage =
        buildDxfFilenameCoverageDiagnostics({
          materialListRows,
          dxfParts,
          resultRows: matched.resultRows,
        });
      (debug as Record<string, unknown>).dxfFilenameMapping =
        buildDxfFilenameMappingDiagnostics({
          materialListRows,
          extractedRows,
          unifiedItems: linkedItems,
        });
      {
        const intakeSummary = buildUnifiedIntakeSummary({
          materialRows: materialListRows,
          dxfParts,
          resultRows: matched.resultRows,
          summaryReady: materialListRows.length > 0,
        });
        (debug as Record<string, unknown>).summarySourceOfTruth =
          buildSummaryDiagnosticsV2({
            summary: intakeSummary,
            materialRows: materialListRows,
            unifiedItemCount: linkedItems.length,
          });
        (debug as Record<string, unknown>).summaryDiagnostics =
          (debug as Record<string, unknown>).summarySourceOfTruth;
        (debug as Record<string, unknown>).filenameProvenanceSample =
          buildFilenameProvenanceSample({
            materialRows: materialListRows,
            dxfParts,
            resultRows: matched.resultRows,
            limit: 10,
          });
        const initialSummary = buildInitialIntakeSummary({
          unifiedItems: linkedItems,
          dxfParts,
          ready: linkedItems.length > 0,
        });
        (debug as Record<string, unknown>).filenameFlowDiagnostics =
          buildFilenameFlowDiagnostics({
            summary: initialSummary,
            canonicalRows: materialListRows,
            unifiedItems: linkedItems,
            rawExtractionRows: extractedRows,
          });
        (debug as Record<string, unknown>).filenameFlowSample =
          buildFilenameFlowSample({
            unifiedItems: linkedItems,
            limit: 10,
          });
      }
      (debug as Record<string, unknown>).aiCallCountStage2 = 0;
      (debug as Record<string, unknown>).workflow = buildWorkflowDebug({
        activeStage: "UNIFIED_REVIEW",
        dxfParsedBeforeMaterialExtraction: true,
        reusedExistingDxfRegistry,
        materialExtractionCompleted: true,
        dxfMatchingCompleted: true,
        unifiedReviewCreated: true,
      });

      setSession({
        ...getSimpleIntakeSession(),
        status: "DXF_REVIEW",
        quoteStage: "UNIFIED_REVIEW",
        enteredQuoteStages: markEntered(
          getSimpleIntakeSession().enteredQuoteStages,
          "UNIFIED_REVIEW"
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
        status: "MATERIAL_LIST_REVIEW",
        quoteStage: "MATERIAL_INTAKE",
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
      quoteStage: "UNIFIED_REVIEW",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "UNIFIED_REVIEW"
      ),
    });
  },

  clearFinalQuoteListMembership(): void {
    if (session.finalQuoteListMembership == null) return;
    setSession({
      ...session,
      finalQuoteListMembership: null,
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
      quoteStage: "MATERIAL_INTAKE",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "MATERIAL_INTAKE"
      ),
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
      finalQuoteListMembership: null,
      weightPricingDraft: null,
      weightPricingSummaryPayload: null,
      finalQuotationDraft: null,
      forcedReviewWorkspaceView: null,
      materialRowUserResolutions: {},
      confirmedManualMatchIds: [],
      // Preserve DXF registry parsed in stage 1.
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

        // OMEGA round-trip workbook → deterministic parse, no AI call.
        if (isOmegaRoundTripWorkbook(snapResult.snapshot)) {
          const parsed = parseOmegaRoundTripWorkbookWithMeta(
            snapResult.snapshot,
            { sourceFileName: workbookFile.name }
          );
          const materialListRows = parsed.rows;
          if (materialListRows.length === 0) {
            const error: SimpleIntakeError = {
              stage: "VALIDATION",
              message: "לא נמצאו שורות חומר בקובץ OMEGA",
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
              {
                ok: true,
                roundTripWorkbookDetected: true,
                roundTripRowsParsed: 0,
              },
              0,
              snapResult.coverage
            );
            return;
          }

          timing.aiCallMs = 0;
          timing.totalMs = Date.now() - t0;
          const completedAt = new Date().toISOString();
          const snapshot = snapResult.snapshot;
          const coverage = snapResult.coverage;
          const debug = buildSimpleIntakeDebug({
            runId,
            startedAt,
            completedAt,
            timing,
            workbookFileName: workbookFile.name,
            dxfFileNames: [],
            snapshot,
            providerCallCount: 0,
            aiRawResult: {
              ok: true,
              materialListRowCount: materialListRows.length,
              roundTripWorkbookDetected: true,
              roundTripRowsParsed: materialListRows.length,
              ignoredInformationalDxfDimensionCells:
                parsed.ignoredInformationalDxfDimensionCells,
              ignoredNotesCells: parsed.ignoredNotesCells,
              usage: null,
              model: null,
              costs: null,
              sourceType,
            },
            validatedRows: materialListToExtractedRows(materialListRows),
            dxfParts: [],
            resultRows: [],
            unmatchedDxfIds: [],
            diagnostics: null,
            snapshotCoverage: coverage,
            error: null,
            extractionProviderDebug: {
              provider: "omega-round-trip",
              purpose: "ROUND_TRIP_DETERMINISTIC_PARSE",
            },
          });
          (debug as Record<string, unknown>).materialListStage = {
            provider: "omega-round-trip",
            model: null,
            schemaVersion: "omega-round-trip-v1",
            extractedRowCount: materialListRows.length,
            validatedRowCount: materialListRows.length,
            completeRowCount: summarizeMaterialList(materialListRows)
              .completeRows,
            incompleteRowCount: summarizeMaterialList(materialListRows)
              .incompleteRows,
          };
          (debug as Record<string, unknown>).providerCall = {
            provider: "omega-round-trip",
            count: 0,
            purpose: "ROUND_TRIP_DETERMINISTIC_PARSE",
          };

          const phaseCount =
            getSimpleIntakeSession().dxfParts.length > 0 ||
            getSimpleIntakeSession().dxfFiles.length > 0
              ? 6
              : 5;
          const minMs = workbookActivityMinDurationMs(phaseCount);
          const remaining = minMs - (Date.now() - t0);
          if (remaining > 0) {
            await new Promise((r) => setTimeout(r, remaining));
          }

          setSession({
            ...getSimpleIntakeSession(),
            analyzingLabel: null,
            materialListRows,
            materialListApproved: true,
            materialListShowUnresolvedOnly: false,
            extractedRows: materialListToExtractedRows(materialListRows),
            workbookSnapshot: snapshot,
            timing,
            completedAt,
            lastDebug: debug,
            providerCallCount: 0,
            error: null,
            quoteStage: "MATERIAL_INTAKE",
            enteredQuoteStages: markEntered(
              getSimpleIntakeSession().enteredQuoteStages,
              "MATERIAL_INTAKE"
            ),
          });

          await simpleIntakeActions.runDxfStageFromApprovedList();
          return;
        }
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

      // Keep ANALYZING visible long enough for each timeline phase (≥2s).
      const phaseCount =
        getSimpleIntakeSession().dxfParts.length > 0 ||
        getSimpleIntakeSession().dxfFiles.length > 0
          ? 6
          : 5;
      const minMs = workbookActivityMinDurationMs(phaseCount);
      const remaining = minMs - (Date.now() - t0);
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }

      if (!qualityGatePassed) {
        setSession({
          ...getSimpleIntakeSession(),
          status: "MATERIAL_LIST_QUALITY_FAILED",
          quoteStage: "MATERIAL_INTAKE",
          analyzingLabel: null,
          materialListRows,
          materialListApproved: false,
          materialListShowUnresolvedOnly: false,
          extractedRows: materialListToExtractedRows(materialListRows),
          // Keep dxfParts from stage 1.
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
          lastDebug: {
            ...debug,
            workflow: buildWorkflowDebug({
              activeStage: "MATERIAL_INTAKE",
              dxfParsedBeforeMaterialExtraction:
                getSimpleIntakeSession().dxfParts.length > 0,
              reusedExistingDxfRegistry:
                getSimpleIntakeSession().dxfParts.length > 0,
              materialExtractionCompleted: true,
              dxfMatchingCompleted: false,
              unifiedReviewCreated: false,
            }),
          },
          providerCallCount,
          error: {
            stage: "VALIDATION",
            message:
              "חלק מהנתונים קיימים בקובץ אך לא פוענחו בצורה אמינה.",
            retryable: true,
          },
        });
        return;
      }

      // Successful extraction → auto local DXF matching → unified review.
      setSession({
        ...getSimpleIntakeSession(),
        analyzingLabel: null,
        materialListRows,
        materialListApproved: true,
        materialListShowUnresolvedOnly: false,
        extractedRows: materialListToExtractedRows(materialListRows),
        workbookSnapshot: snapshot,
        timing,
        completedAt,
        lastDebug: debug,
        providerCallCount,
        error: null,
        quoteStage: "MATERIAL_INTAKE",
        enteredQuoteStages: markEntered(
          getSimpleIntakeSession().enteredQuoteStages,
          "MATERIAL_INTAKE"
        ),
      });

      await simpleIntakeActions.runDxfStageFromApprovedList();
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
    opts?: {
      forceReassign?: boolean;
      asSuggestion?: boolean;
      candidates?: import("./types").SimpleMatchCandidate[];
    }
  ): { conflict: false } | {
    conflict: true;
    occupyingSourceRow: number;
  } {
    if (
      session.status !== "READY" &&
      session.status !== "DXF_REVIEW" &&
      session.status !== "FINAL_PRICING_TABLE"
    ) {
      return { conflict: false };
    }
    const result = applyManualDxfSelection({
      resultRows: session.resultRows,
      resultRowId,
      dxfId,
      dxfParts: session.dxfParts,
      forceReassign: opts?.forceReassign,
      asSuggestion: opts?.asSuggestion,
      candidates: opts?.candidates,
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

  /**
   * Freeze / restore quotation scope by canonical materialRowId.
   * Does not clear DXF assignments, edits, or rematch.
   */
  freezeQuoteItem(materialRowId: string): void {
    const id = materialRowId.trim();
    if (!id) return;
    setSession({
      ...session,
      frozenMaterialRows: {
        ...session.frozenMaterialRows,
        [id]: new Date().toISOString(),
      },
    });
  },

  restoreQuoteItem(materialRowId: string): void {
    const id = materialRowId.trim();
    if (!id) return;
    if (!(id in session.frozenMaterialRows)) return;
    const next = { ...session.frozenMaterialRows };
    delete next[id];
    setSession({ ...session, frozenMaterialRows: next });
  },

  toggleQuoteItemFreeze(materialRowId: string): void {
    const id = materialRowId.trim();
    if (!id) return;
    if (id in session.frozenMaterialRows) {
      this.restoreQuoteItem(id);
    } else {
      this.freezeQuoteItem(id);
    }
  },

  setQuoteItemFinish(materialRowId: string, finish: QuoteItemFinish): void {
    const id = materialRowId.trim();
    if (!id) return;
    const prev = hydrateQuoteItemCommercialOptions(
      session.quoteItemCommercialOptions[id]
    );
    setSession({
      ...session,
      quoteItemCommercialOptions: {
        ...session.quoteItemCommercialOptions,
        [id]: {
          ...prev,
          finish: normalizeQuoteItemFinish(finish),
        },
      },
    });
  },

  /** @deprecated use setQuoteItemFinish */
  setQuoteItemFinishes(
    materialRowId: string,
    finishes: QuoteItemFinish | QuoteItemFinish[]
  ): void {
    this.setQuoteItemFinish(materialRowId, normalizeQuoteItemFinish(finishes));
  },

  setQuoteItemCheckeredPlate(
    materialRowId: string,
    isCheckeredPlate: boolean
  ): void {
    const id = materialRowId.trim();
    if (!id) return;
    const prev = hydrateQuoteItemCommercialOptions(
      session.quoteItemCommercialOptions[id]
    );
    setSession({
      ...session,
      quoteItemCommercialOptions: {
        ...session.quoteItemCommercialOptions,
        [id]: {
          ...prev,
          isCheckeredPlate: Boolean(isCheckeredPlate),
        },
      },
    });
  },

  setFinalQuoteListMembership(
    membership: FinalQuoteListMembership | null
  ): void {
    setSession({
      ...session,
      finalQuoteListMembership: membership,
    });
  },

  enterFinalQuoteList(rows: ReadonlyArray<UnifiedQuoteItem>): void {
    const membership = buildFinalQuoteListMembership(rows);
    if (
      session.status !== "DXF_REVIEW" &&
      session.status !== "READY" &&
      session.status !== "FINAL_PRICING_TABLE"
    ) {
      setSession({
        ...session,
        finalQuoteListMembership: membership,
      });
      return;
    }
    setSession({
      ...session,
      status: "FINAL_PRICING_TABLE",
      quoteStage: "UNIFIED_REVIEW",
      enteredQuoteStages: markEntered(
        session.enteredQuoteStages,
        "UNIFIED_REVIEW"
      ),
      finalQuoteListMembership: membership,
    });
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
    const materialRowUserResolutions = { ...session.materialRowUserResolutions };
    if (touched) {
      const materialRowId = touched.extracted.rowId;
      materialListRows = session.materialListRows.map((ml) => {
        if (ml.rowId !== materialRowId) return ml;
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

      // Persist canonical MaterialRowUserResolution overrides (do not mutate source).
      let res = getMaterialRowUserResolution(
        materialRowUserResolutions,
        materialRowId
      );
      const runId = session.runId;
      const fieldMap: Array<{
        editKey: keyof SimpleResultRow["edits"];
        resKey: keyof MaterialRowFieldOverrides;
      }> = [
        { editKey: "partId", resKey: "partId" },
        { editKey: "material", resKey: "material" },
        { editKey: "thicknessMm", resKey: "thicknessMm" },
        { editKey: "quantity", resKey: "quantity" },
        { editKey: "widthMm", resKey: "widthMm" },
        { editKey: "lengthMm", resKey: "lengthMm" },
      ];
      for (const { editKey, resKey } of fieldMap) {
        if (!Object.prototype.hasOwnProperty.call(edits, editKey)) continue;
        const raw = edits[editKey];
        if (raw == null) continue;
        const err = validateMaterialOverride(resKey, raw);
        if (err) continue;
        res = upsertFieldOverride(
          res,
          materialRowId,
          runId,
          resKey,
          raw as string | number,
          "MANUAL_ENTRY"
        );
      }
      // Manual width+length → dimension decision when both present.
      if (res) {
        const w = res.overrides.widthMm?.value;
        const l = res.overrides.lengthMm?.value;
        if (
          typeof w === "number" &&
          w > 0 &&
          typeof l === "number" &&
          l > 0 &&
          (Object.prototype.hasOwnProperty.call(edits, "widthMm") ||
            Object.prototype.hasOwnProperty.call(edits, "lengthMm"))
        ) {
          res = setDimensionDecisionOnResolution(
            res,
            materialRowId,
            runId,
            "USE_MANUAL_DIMENSIONS",
            null
          );
        }
        materialRowUserResolutions[materialRowId] = res;
      }
    }
    setSession({
      ...session,
      resultRows,
      materialListRows,
      materialRowUserResolutions,
      ...refreshed,
    });
  },

  /**
   * Persist dimension mismatch resolution by canonical materialRowId.
   */
  setMaterialRowDimensionResolution(
    materialRowId: string,
    resolution: DimensionMismatchResolution,
    resolvedDxfId: string | null = null
  ): void {
    if (!materialRowId) return;
    const decision = fromDimensionMismatchResolution(resolution);
    const current = getMaterialRowUserResolution(
      session.materialRowUserResolutions,
      materialRowId
    );
    const next = setDimensionDecisionOnResolution(
      current,
      materialRowId,
      session.runId,
      decision,
      resolvedDxfId
    );
    setSession({
      ...session,
      materialRowUserResolutions: {
        ...session.materialRowUserResolutions,
        [materialRowId]: next,
      },
    });
  },

  /** Persist USE_DXF_DIMENSIONS using a result-row id (resolves materialRowId). */
  resolveMaterialRowWithDxfDimensions(resultRowId: string): void {
    const row = session.resultRows.find((r) => r.resultRowId === resultRowId);
    if (!row) return;
    const materialRowId = row.extracted.rowId;
    const dxfId = row.match.matchedDxfId;
    this.setMaterialRowDimensionResolution(
      materialRowId,
      "USE_DXF_DIMENSIONS",
      dxfId
    );
  },

  clearMaterialRowDimensionResolution(materialRowId: string): void {
    this.setMaterialRowDimensionResolution(materialRowId, "UNRESOLVED", null);
  },

  confirmManualMatch(resultRowId: string): void {
    if (session.confirmedManualMatchIds.includes(resultRowId)) return;
    setSession({
      ...session,
      confirmedManualMatchIds: [
        ...session.confirmedManualMatchIds,
        resultRowId,
      ],
    });
  },

  /** Dev diagnostics for persisted user resolutions. */
  patchUserResolutionDiagnostics(extra?: {
    totalMaterialRows?: number;
  }): void {
    const diagnostics = buildUserResolutionDiagnostics({
      quotationId: session.runId ?? "local",
      analysisRunId: session.runId ?? "local",
      totalMaterialRows:
        extra?.totalMaterialRows ?? session.materialListRows.length,
      resolutions: session.materialRowUserResolutions,
    });
    assertUserResolutionInvariants(diagnostics);
    setSession({
      ...session,
      lastDebug: {
        ...(session.lastDebug ?? {}),
        userResolutionDiagnostics: diagnostics,
      },
    });
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
