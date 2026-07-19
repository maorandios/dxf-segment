/**
 * Adapter: Quote Workspace → existing AI Intake engine.
 * Does not duplicate DXF/workbook/matching/mass/Review logic.
 * Does not send DXF bytes to OpenAI.
 * Collects observational developer debug bundle (no mutation of engine results).
 */

import { buildSlimRegistryForAi } from "@/lib/ai-intake/slimRegistry";
import { reconcileFinalMapping } from "@/lib/ai-intake/reconcileFinalMapping";
import { buildReviewSession } from "@/lib/ai-intake/review/buildReviewSession";
import { applyGeometryCorrelation } from "@/lib/ai-intake/dxf/geometry-correlation";
import { heldOrReservedRegistryIds } from "@/lib/ai-intake/dxf/geometry-correlation/dxfReservations";
import {
  buildDebugEntityRegistry,
  deepSnapshot,
  validateDebugSnapshots,
} from "@/lib/ai-intake/debug/developer-bundle/debugSnapshots";
import { expandDocumentRowToFacts } from "@/lib/ai-intake/expandExtractionToFacts";
import { evaluateAnalysisSafetyGate } from "@/lib/ai-intake/safety/evaluateAnalysisSafetyGate";
import { detectFalseMissingFields } from "@/lib/ai-intake/safety/detectFalseMissingFields";
import { buildSourceToReviewLedger } from "@/lib/ai-intake/lineage/sourceToReviewLedger";
import { RuntimeAssertions } from "@/lib/ai-intake/safety/runtimeAssertions";
import { buildOccurrenceId } from "@/lib/ai-intake/requestOccurrences";
import type { AiIntakeAnalyzeResponse, AiIntakeAnalyzeSuccess } from "@/lib/ai-intake/schemas";
import type { DxfPartRegistryItem } from "@/lib/ai-intake/types";
import {
  buildOmegaIntakeDeveloperDebug,
  DebugRunCollector,
  type OmegaIntakeDeveloperDebug,
} from "@/lib/ai-intake/debug/developer-bundle";
import {
  runLocalDxfRegistry,
  type LocalDxfRegistryProgress,
} from "@/features/ai-intake-lab/lib/runLocalDxfRegistry";
import type { QuoteSession, QuoteSource } from "../types";
import { quoteSessionActions } from "../quoteSessionStore";

export type QuoteIntakeProgressPhase =
  | "reading_files"
  | "identifying_parts"
  | "matching_dxf"
  | "comparing_sources"
  | "building_table";

const PHASE_LABELS: Record<QuoteIntakeProgressPhase, string> = {
  reading_files: "קורא את הקבצים",
  identifying_parts: "מזהה חלקים",
  matching_dxf: "מתאים קובצי DXF",
  comparing_sources: "משווה בין המקורות",
  building_table: "בונה את טבלת ההצעה",
};

function mapRegistryProgress(
  p: LocalDxfRegistryProgress
): QuoteIntakeProgressPhase {
  if (p.phase === "reading" || p.phase === "geometry") return "reading_files";
  if (p.phase === "building") return "identifying_parts";
  if (p.phase === "duplicates") return "matching_dxf";
  return "identifying_parts";
}

export type RunQuoteIntakeAnalysisResult = {
  ok: true;
  analyze: AiIntakeAnalyzeSuccess;
  reviewSession: ReturnType<typeof buildReviewSession>;
  dxfRegistry: DxfPartRegistryItem[];
  developerDebug: OmegaIntakeDeveloperDebug;
  safetyGate?: import("@/lib/ai-intake/safety/evaluateAnalysisSafetyGate").AnalysisSafetyGateResult;
} | {
  ok: false;
  errorHe: string;
  developerDebug: OmegaIntakeDeveloperDebug;
  safetyGate?: import("@/lib/ai-intake/safety/evaluateAnalysisSafetyGate").AnalysisSafetyGateResult;
};

function sourceManifest(sources: QuoteSource[]) {
  return sources.map((s) => ({
    sourceId: s.sourceId,
    fileName: s.fileName,
    extension: s.extension,
    mimeType: s.mimeType,
    sizeBytes: s.sizeBytes,
    fingerprint: s.fingerprint,
    kind: s.kind,
    status: s.status,
    blockingReason: s.blockingReason,
  }));
}

function finalizeDebug(args: {
  quoteSession: QuoteSession;
  sources: QuoteSource[];
  collector: DebugRunCollector;
  analyze: AiIntakeAnalyzeSuccess | null;
  reviewSession: ReturnType<typeof buildReviewSession> | null;
  dxfRegistry: DxfPartRegistryItem[] | null;
  analysisErrorHe: string | null;
  exception: Error | null;
  startedAt: string;
  safetyGate?: import("@/lib/ai-intake/safety/evaluateAnalysisSafetyGate").AnalysisSafetyGateResult | null;
  sourceToReviewLineage?: unknown;
  dxfReservations?: unknown;
  semanticPlanValidation?: unknown;
  fieldLineage?: unknown;
  reviewConsistency?: unknown;
}): OmegaIntakeDeveloperDebug {
  args.collector.begin("BUNDLE_FINALIZE");
  const bundle = buildOmegaIntakeDeveloperDebug({
    entryPoint: "QUOTE_WORKSPACE",
    quoteId: args.quoteSession.quoteId,
    projectName: args.quoteSession.details.projectName,
    customerName: args.quoteSession.details.customerName,
    currentStep: args.quoteSession.currentStep,
    startedAt: args.startedAt,
    completedAt: new Date().toISOString(),
    sources: sourceManifest(args.sources),
    collector: args.collector,
    analyze: args.analyze,
    reviewSession: args.reviewSession,
    dxfRegistry: args.dxfRegistry,
    analysisErrorHe: args.analysisErrorHe,
    exception: args.exception,
    safetyGate: args.safetyGate ?? null,
    sourceToReviewLineage: args.sourceToReviewLineage ?? null,
    dxfReservations: args.dxfReservations ?? null,
    semanticPlanValidation: args.semanticPlanValidation ?? null,
    fieldLineage: args.fieldLineage ?? null,
    reviewConsistency: args.reviewConsistency ?? null,
  });
  args.collector.end("BUNDLE_FINALIZE", "SUCCEEDED", {
    outputSummary: {
      schemaVersion: bundle.schemaVersion,
      bytes: bundle.bundleSize.estimatedUncompressedBytes,
    },
  });
  // Re-build once so BUNDLE_FINALIZE is in the timeline
  return buildOmegaIntakeDeveloperDebug({
    entryPoint: "QUOTE_WORKSPACE",
    quoteId: args.quoteSession.quoteId,
    projectName: args.quoteSession.details.projectName,
    customerName: args.quoteSession.details.customerName,
    currentStep: args.quoteSession.currentStep,
    startedAt: args.startedAt,
    completedAt: new Date().toISOString(),
    sources: sourceManifest(args.sources),
    collector: args.collector,
    analyze: args.analyze,
    reviewSession: args.reviewSession,
    dxfRegistry: args.dxfRegistry,
    analysisErrorHe: args.analysisErrorHe,
    exception: args.exception,
    safetyGate: args.safetyGate ?? null,
    sourceToReviewLineage: args.sourceToReviewLineage ?? null,
    dxfReservations: args.dxfReservations ?? null,
    semanticPlanValidation: args.semanticPlanValidation ?? null,
    fieldLineage: args.fieldLineage ?? null,
    reviewConsistency: args.reviewConsistency ?? null,
  });
}

/**
 * Run the existing intake pipeline once for the quote session sources.
 */
export async function runQuoteIntakeAnalysis(args: {
  quoteSession: QuoteSession;
  sources: QuoteSource[];
  onProgress?: (phase: QuoteIntakeProgressPhase, label: string) => void;
}): Promise<RunQuoteIntakeAnalysisResult> {
  const startedAt =
    args.quoteSession.analysis.startedAt ?? new Date().toISOString();
  const collector = new DebugRunCollector();

  const report = (phase: QuoteIntakeProgressPhase): void => {
    const label = PHASE_LABELS[phase];
    args.onProgress?.(phase, label);
    quoteSessionActions.setAnalysisProgress(label);
  };

  const ready = args.sources.filter(
    (s) => s.status === "READY" || s.status === "PROCESSING"
  );
  const dxfFiles = ready.filter((s) => s.kind === "DXF").map((s) => s.file);
  const docFiles = ready
    .filter((s) => s.kind === "XLS" || s.kind === "XLSX" || s.kind === "PDF")
    .map((s) => s.file);

  collector.begin("FILE_PREFLIGHT", {
    sourceCount: args.sources.length,
    readyCount: ready.length,
    dxfCount: dxfFiles.length,
    docCount: docFiles.length,
  });
  collector.end("FILE_PREFLIGHT", "SUCCEEDED", {
    outputSummary: {
      entered: ready.map((s) => s.fileName),
    },
  });

  report("reading_files");

  let dxfRegistry: DxfPartRegistryItem[] = [];
  try {
    collector.begin("DXF_REGISTRY", { fileCount: dxfFiles.length });
    if (dxfFiles.length > 0) {
      const { items } = await runLocalDxfRegistry(dxfFiles, (p) => {
        const phase = mapRegistryProgress(p);
        report(phase);
      });
      dxfRegistry = items;
    }

    report("matching_dxf");
    const slim = buildSlimRegistryForAi(dxfRegistry);

    if (slim.length === 0) {
      const errorHe =
        "לא נמצאו קובצי DXF תקינים לזיהוי חלקים. הוסיפו לפחות קובץ DXF אחד תקין ונסו שוב.";
      collector.end("DXF_REGISTRY", "FAILED", {
        errorCode: "EMPTY_SLIM_REGISTRY",
        errorMessage: errorHe,
        outputSummary: { registryCount: dxfRegistry.length },
      });
      return {
        ok: false,
        errorHe,
        developerDebug: finalizeDebug({
          quoteSession: args.quoteSession,
          sources: args.sources,
          collector,
          analyze: null,
          reviewSession: null,
          dxfRegistry,
          analysisErrorHe: errorHe,
          exception: null,
          startedAt,
        }),
      };
    }

    collector.end("DXF_REGISTRY", "SUCCEEDED", {
      outputSummary: { registryCount: dxfRegistry.length },
      relatedIds: dxfRegistry.map((i) => i.canonicalPartId).filter(Boolean),
    });

    report("comparing_sources");
    collector.begin("ANALYZE_API", {
      documentCount: docFiles.length,
      slimRegistryCount: slim.length,
    });

    const form = new FormData();
    form.set(
      "sender",
      `quote-workspace@${args.quoteSession.quoteId}.local`
    );
    form.set(
      "subject",
      `הצעת מחיר: ${args.quoteSession.details.projectName}`
    );
    form.set(
      "body",
      [
        `פרויקט: ${args.quoteSession.details.projectName}`,
        `לקוח: ${args.quoteSession.details.customerName}`,
        "",
        "ניתוח חומר דרך סביבת הצעת המחיר.",
      ].join("\n")
    );
    form.set("registryJson", JSON.stringify(slim));
    for (const file of docFiles) {
      form.append("documents", file, file.name);
    }

    const res = await fetch("/api/ai-intake/analyze", {
      method: "POST",
      body: form,
    });

    report("building_table");

    const data = (await res.json()) as AiIntakeAnalyzeResponse;
    if (!data.ok) {
      collector.end("ANALYZE_API", "FAILED", {
        errorCode: data.code,
        errorMessage: data.messageHe,
      });
      return {
        ok: false,
        errorHe: data.messageHe || "לא הצלחנו להשלים את ניתוח החומר",
        developerDebug: finalizeDebug({
          quoteSession: args.quoteSession,
          sources: args.sources,
          collector,
          analyze: null,
          reviewSession: null,
          dxfRegistry,
          analysisErrorHe: data.messageHe,
          exception: null,
          startedAt,
        }),
      };
    }

    collector.end("ANALYZE_API", "SUCCEEDED", {
      outputSummary: {
        openaiCallCount: data.debug?.openaiCallCount ?? null,
        documentCount: data.aggregated?.documents?.length ?? 0,
        partial: data.partial,
      },
    });

    // Derive interpreter-related stages from server diagnostics (observational)
    for (const doc of data.aggregated?.documents ?? []) {
      const interp = (
        doc.workbookEvidence as {
          workbookInterpreterDiagnostics?: {
            planSource?: string;
            plannerCallCount?: number;
            finalStatus?: string;
            repaired?: boolean;
            planValidationErrors?: string[];
            coverage?: unknown;
          };
        } | null
      )?.workbookInterpreterDiagnostics;
      if (!interp) {
        collector.skip(
          "WORKBOOK_SNAPSHOT",
          `No interpreter diagnostics for ${doc.fileName}`
        );
        continue;
      }
      collector.begin("WORKBOOK_SNAPSHOT", { fileName: doc.fileName });
      collector.end("WORKBOOK_SNAPSHOT", "SUCCEEDED", {
        relatedIds: [doc.documentId],
      });
      collector.begin("WORKBOOK_PROFILE");
      collector.end("WORKBOOK_PROFILE", "SUCCEEDED");
      if ((interp.plannerCallCount ?? 0) > 0) {
        collector.begin("AI_INITIAL_PLAN");
        collector.end(
          "AI_INITIAL_PLAN",
          interp.finalStatus === "FAIL" ? "FAILED" : "SUCCEEDED",
          {
            outputSummary: {
              planSource: interp.planSource,
              plannerCallCount: interp.plannerCallCount,
            },
          }
        );
      } else {
        collector.skip("AI_INITIAL_PLAN", "DETERMINISTIC_FAST_PATH_OR_NONE");
      }
      collector.begin("INITIAL_PLAN_VALIDATION");
      collector.end(
        "INITIAL_PLAN_VALIDATION",
        (interp.planValidationErrors?.length ?? 0) > 0
          ? "FAILED"
          : "SUCCEEDED",
        {
          outputSummary: {
            errors: interp.planValidationErrors ?? [],
          },
        }
      );
      collector.begin("INITIAL_PLAN_EXECUTION");
      collector.end("INITIAL_PLAN_EXECUTION", "SUCCEEDED", {
        outputSummary: { coverage: interp.coverage ?? null },
      });
      collector.begin("INITIAL_EXTRACTION_VALIDATION");
      collector.end(
        "INITIAL_EXTRACTION_VALIDATION",
        interp.finalStatus === "PASS" ||
          interp.finalStatus === "PASS_WITH_WARNINGS"
          ? "SUCCEEDED"
          : interp.finalStatus === "MAPPING_REQUIRED"
            ? "FAILED"
            : "SUCCEEDED_WITH_WARNINGS",
        { outputSummary: { finalStatus: interp.finalStatus } }
      );
      if (interp.repaired) {
        collector.begin("AI_PLAN_REPAIR");
        collector.end("AI_PLAN_REPAIR", "SUCCEEDED");
      } else {
        collector.skip("AI_PLAN_REPAIR", "NOT_NEEDED");
      }
      if (doc.status === "SUCCESS") {
        collector.begin("WORKBOOK_NORMALIZATION");
        collector.end("WORKBOOK_NORMALIZATION", "SUCCEEDED");
      }
    }

    const analyze = data as AiIntakeAnalyzeSuccess;

    const workbookDocs = analyze.aggregated?.documents ?? [];
    const pendingSourceExtraction = workbookDocs.some((d) => {
      const ev = d.workbookEvidence as {
        skipDxfMatching?: boolean;
        suppressDxfOrphans?: boolean;
        directWorkbookExtraction?: { finalStatus?: string };
      } | null;
      if (!ev) return false;
      if (ev.skipDxfMatching || ev.suppressDxfOrphans) return true;
      const st = ev.directWorkbookExtraction?.finalStatus;
      return (
        st === "MAPPING_REQUIRED" ||
        st === "FAIL" ||
        st === "TOO_LARGE" ||
        st === "TIMEOUT"
      );
    });
    const hasWorkbookSource = workbookDocs.some((d) => d.sourceType === "XLSX");
    const sourceOccurrenceCount = analyze.extraction.documentRows.length;
    const shouldPending =
      hasWorkbookSource &&
      (pendingSourceExtraction ||
        (sourceOccurrenceCount === 0 &&
          workbookDocs.some(
            (d) =>
              d.errorCode === "WORKBOOK_MAPPING_REQUIRED" ||
              d.errorCode === "WORKBOOK_DIRECT_EXTRACTION_FAILED" ||
              d.errorCode === "WORKBOOK_DIRECT_PROVIDER_TIMEOUT"
          )));

    collector.begin("GEOMETRY_CORRELATION");
    const correlated = applyGeometryCorrelation({
      documentRows: analyze.extraction.documentRows,
      registry: dxfRegistry,
      tableId:
        args.quoteSession.analysis.analysisRunId ??
        args.quoteSession.quoteId,
      pendingSourceExtraction: shouldPending,
    });
    collector.end("GEOMETRY_CORRELATION", shouldPending ? "SKIPPED" : "SUCCEEDED", {
      outputSummary: correlated.diagnostics as unknown as Record<
        string,
        unknown
      >,
    });

    // Re-expand document facts AFTER geometry so commercial fields stay keyed
    // to the final matched identity. Email facts keep precedence via instructionType.
    const emailFacts = analyze.acceptedFacts.filter(
      (f) => f.source.type === "EMAIL"
    );
    const refreshedDocumentFacts = correlated.documentRows.flatMap(
      expandDocumentRowToFacts
    );
    const refreshedAcceptedFacts = [
      ...refreshedDocumentFacts,
      ...emailFacts,
    ];

    collector.begin("CROSS_SOURCE_RECONCILIATION");
    const { rows: finalRows } = reconcileFinalMapping({
      registry: dxfRegistry,
      acceptedFacts: refreshedAcceptedFacts,
      unresolvedItems: analyze.extraction.unresolvedItems,
      documentRows: correlated.documentRows,
      suppressOrphanRegistryEntryIds: heldOrReservedRegistryIds(
        correlated.diagnostics.reservations ?? []
      ),
    });
    collector.end("CROSS_SOURCE_RECONCILIATION", "SUCCEEDED", {
      outputSummary: { finalRowCount: finalRows.length },
    });

    const withFinals: AiIntakeAnalyzeSuccess = {
      ...analyze,
      acceptedFacts: refreshedAcceptedFacts,
      extraction: {
        ...analyze.extraction,
        documentRows: correlated.documentRows,
      },
      finalRows,
      warnings: [
        ...analyze.warnings,
        `GEOMETRY_CORRELATION:exact=${correlated.diagnostics.exactMatchCount}`,
        `GEOMETRY_CORRELATION:geometry=${correlated.diagnostics.geometryFallbackCount}`,
        `GEOMETRY_CORRELATION:ambiguous=${correlated.diagnostics.ambiguousCount}`,
      ],
    };

    // Skip Review intentionally only recorded in debug — production path unchanged.
    const hasMappingRequiredDocs = (
      withFinals.aggregated?.documents ?? []
    ).some((d) => d.errorCode === "WORKBOOK_MAPPING_REQUIRED");
    if (hasMappingRequiredDocs) {
      collector.warn(
        "MAPPING_REQUIRED_DOC",
        "One or more workbooks returned WORKBOOK_MAPPING_REQUIRED"
      );
    }

    collector.begin("REVIEW_SESSION_BUILD");
    const reviewSession = buildReviewSession(withFinals, {
      registry: dxfRegistry,
      analysisRunId: args.quoteSession.analysis.analysisRunId ?? args.quoteSession.quoteId,
    });
    collector.end("REVIEW_SESSION_BUILD", "SUCCEEDED", {
      outputSummary: {
        rowCount: reviewSession.rows?.length ?? 0,
        issueCount: reviewSession.issues?.length ?? 0,
        mappingRequiredDocs: hasMappingRequiredDocs,
      },
    });
    collector.begin("REVIEW_ISSUE_BUILD");
    collector.end("REVIEW_ISSUE_BUILD", "SUCCEEDED", {
      outputSummary: { issueCount: reviewSession.issues?.length ?? 0 },
    });

    const safety = evaluateAnalysisSafetyGate({
      analyze: withFinals,
      reviewSession,
      analysisErrorHe: null,
      exception: null,
      mappingRequired: hasMappingRequiredDocs && reviewSession.rows.length === 0,
    });

    const sourceOccurrenceIds = correlated.documentRows.map((row) =>
      buildOccurrenceId(row)
    );
    const sourceToReviewLineage = buildSourceToReviewLedger({
      sourceOccurrenceIds,
      reviewRows: reviewSession.rows.map((r) => ({
        rowId: r.rowId,
        sourceOccurrenceIds: r.sourceOccurrenceIds,
        includeInQuote: r.includeInQuote,
        status: r.status,
        dxfMatchStatus: r.dxfMatchStatus,
        matchedDxfPartId: r.matchedDxfPartId,
      })),
      // Geometry assignment IDs use a different key format — informational only.
      geometryAssignments: correlated.diagnostics.assignments.map((a) => ({
        sourceOccurrenceId: a.sourceOccurrenceId,
        status: a.status,
        matchedRegistryEntryId: a.matchedRegistryEntryId,
      })),
    });

    // Lineage accounting: accidental splits are ERROR; disappeared rows are warnings
    // (duplicates / ignored extras may intentionally omit Review rows).
    if (!sourceToReviewLineage.balanced) {
      const hardFailures = sourceToReviewLineage.failures.filter((f) =>
        f.startsWith("ACCIDENTAL_SPLIT:")
      );
      for (const f of hardFailures) {
        safety.failedInvariantIds.push(`INV_LINEAGE_${f.split(":")[0]}`);
        safety.blockingReasons.push({
          code: "SOURCE_TO_REVIEW_ACCOUNTING",
          message: f,
          relatedIds: [],
        });
      }
      for (const f of sourceToReviewLineage.failures) {
        if (hardFailures.includes(f)) continue;
        safety.warnings.push({
          code: "SOURCE_TO_REVIEW_ACCOUNTING_WARN",
          message: f,
          relatedIds: [],
        });
      }
      if (
        hardFailures.length > 0 &&
        safety.status !== "MAPPING_REQUIRED" &&
        safety.status !== "FAILED"
      ) {
        safety.status = "UNSAFE_RESULT";
        safety.workingTableReady = false;
        safety.safeForUserReview = false;
        safety.safeForApproval = false;
        safety.finalRunStatus = "UNSAFE_RESULT";
      }
    }

    const falseMissing = detectFalseMissingFields({ reviewSession });
    const reviewConsistency = {
      resolvedCanonicalButNullCurrent: falseMissing.filter((f) =>
        f.code.includes("PROPOSED_WITHOUT_CURRENT")
      ).length,
      validCandidateButMissingState: falseMissing.filter(
        (f) => f.code === "FALSE_MISSING_STATE"
      ).length,
      falseMissingIssue: falseMissing.filter(
        (f) => f.code === "FALSE_MISSING_ISSUE"
      ).length,
      findings: falseMissing,
      geometryReasonChanged: reviewSession.rows.filter(
        (r) =>
          r.dxfMatch?.reason === "EXACT_CANONICAL_MATCH" &&
          r.dxfMatchDiagnostics?.sourceRawId == null &&
          r.matchedDxfPartId
      ).length,
      matchedOrphanDuplication: 0,
      duplicateConfirmedDxfAssignment: 0,
    };

    RuntimeAssertions.workingTableBlockedOnErrorInvariant({
      failedErrorInvariants: safety.failedInvariantIds,
      workingTableReady: safety.workingTableReady,
    });
    RuntimeAssertions.unsafeNotReportedAsSuccess({
      safetyStatus: safety.status,
      finalRunStatus: safety.finalRunStatus,
    });

    collector.begin("WORKING_TABLE_PREPARATION");
    collector.end(
      "WORKING_TABLE_PREPARATION",
      safety.workingTableReady ? "SUCCEEDED" : "FAILED",
      {
        outputSummary: {
          safetyStatus: safety.status,
          finalRunStatus: safety.finalRunStatus,
          workingTableReady: safety.workingTableReady,
          failedInvariants: safety.failedInvariantIds,
        },
        errorCode: safety.workingTableReady ? null : safety.status,
        errorMessage: safety.workingTableReady
          ? null
          : safety.blockingReasons.map((r) => r.message).join("; "),
      }
    );

    const unsafeHe =
      "זוהתה אי־עקביות פנימית במהלך עיבוד הנתונים. הקבצים נשמרו בסשן הנוכחי וניתן לנסות שוב או להוריד JSON מפתחים לצורך אבחון.";

    const developerDebug = finalizeDebug({
      quoteSession: args.quoteSession,
      sources: args.sources,
      collector,
      analyze: withFinals,
      reviewSession,
      dxfRegistry,
      analysisErrorHe: safety.workingTableReady ? null : unsafeHe,
      exception: null,
      startedAt,
      safetyGate: safety,
      sourceToReviewLineage,
      dxfReservations: deepSnapshot(correlated.diagnostics.reservations ?? []),
      reviewConsistency,
      semanticPlanValidation: (
        withFinals.aggregated?.documents ?? []
      ).map((d) => ({
        documentId: d.documentId,
        interpreter: (
          d.workbookEvidence as {
            workbookInterpreterDiagnostics?: unknown;
          } | null
        )?.workbookInterpreterDiagnostics ?? null,
      })),
      fieldLineage: null,
    });

    // Observational: attach cycle-free entity registry + ambiguity groups
    const debugEntities = buildDebugEntityRegistry({
      reservations: (correlated.diagnostics.reservations ?? []).map((r) => ({
        ...r,
      })),
      ambiguityGroups: (correlated.diagnostics.ambiguityGroups ?? []).map(
        (g) => ({ ...g })
      ),
      sourceOccurrences: sourceToReviewLineage.entries.map((e) => ({
        ...e,
      })),
      reviewRows: reviewSession.rows.map((r) => ({
        rowId: r.rowId,
        dxfMatchStatus: r.dxfMatchStatus,
        matchReason: r.dxfMatch?.reason ?? null,
        candidateCount: r.dxfCandidates?.length ?? 0,
        quantity: r.quantity.currentValue,
        material: r.material.currentValue,
        thicknessMm: r.thicknessMm.currentValue,
      })),
    });
    const snapValidation = validateDebugSnapshots({
      sections: {
        safetyGate: safety,
        dxfReservations: developerDebug.dxfReservations,
        sourceToReviewLineage,
        ambiguityGroups: correlated.diagnostics.ambiguityGroups ?? [],
      },
      entities: debugEntities,
    });
    (developerDebug as { debugEntities?: unknown; debugValidation?: unknown }).debugEntities =
      debugEntities;
    (developerDebug as { debugValidation?: unknown }).debugValidation =
      snapValidation;
    (developerDebug as { ambiguityGroups?: unknown }).ambiguityGroups =
      deepSnapshot(correlated.diagnostics.ambiguityGroups ?? []);

    if (!snapValidation.ok && typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.warn(
        "[ai-intake] debug snapshot validation",
        snapValidation.failures
      );
    }

    if (!safety.workingTableReady) {
      return {
        ok: false,
        errorHe:
          safety.status === "MAPPING_REQUIRED"
            ? "לא הצלחנו לפרש את מבנה קובץ האקסל אוטומטית. הורידו JSON מפתחים לאבחון."
            : safety.status === "UNSAFE_RESULT"
              ? `UNSAFE_RESULT:${unsafeHe}`
              : "לא הצלחנו להשלים את ניתוח החומר בבטחה.",
        developerDebug,
        safetyGate: safety,
      };
    }

    return {
      ok: true,
      analyze: withFinals,
      reviewSession,
      dxfRegistry,
      developerDebug,
      safetyGate: safety,
    };
  } catch (err) {
    console.error("[quote-workspace] analysis failed", err);
    const error =
      err instanceof Error ? err : new Error(String(err));
    collector.errors.push({
      code: "EXCEPTION",
      message: error.message,
    });
    return {
      ok: false,
      errorHe: "לא הצלחנו להשלים את ניתוח החומר. נסו שוב או בדקו את הקבצים.",
      developerDebug: finalizeDebug({
        quoteSession: args.quoteSession,
        sources: args.sources,
        collector,
        analyze: null,
        reviewSession: null,
        dxfRegistry,
        analysisErrorHe:
          "לא הצלחנו להשלים את ניתוח החומר. נסו שוב או בדקו את הקבצים.",
        exception: error,
        startedAt,
      }),
    };
  }
}
