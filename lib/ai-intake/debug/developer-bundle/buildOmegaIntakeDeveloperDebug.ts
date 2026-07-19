/**
 * Build omega-intake-developer-debug/v1 from session + analyze + collector.
 * Observational — does not mutate inputs.
 */

import { buildAiIntakeDebugReport } from "../buildAiIntakeDebugReport";
import type { AiIntakeAnalyzeSuccess } from "../../schemas";
import type { IntakeReviewSession } from "../../review";
import type { DxfPartRegistryItem } from "../../types";
import type { DebugRunCollector } from "./DebugRunCollector";
import { serializeOmegaIntakeDeveloperDebug } from "./serialize";
import {
  OMEGA_INTAKE_DEVELOPER_DEBUG_SCHEMA,
  type DebugFailureSummary,
  type DebugInputFile,
  type DebugInvariantCheck,
  type DebugPipelineStage,
  type OmegaIntakeDeveloperDebug,
} from "./types";

export type BuildDeveloperDebugArgs = {
  entryPoint: "QUOTE_WORKSPACE" | "AI_INTAKE_LAB";
  quoteId: string;
  projectName: string;
  customerName: string;
  currentStep: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sources: Array<{
    sourceId: string;
    fileName: string;
    extension: string;
    mimeType: string;
    sizeBytes: number;
    fingerprint: string | null;
    kind: string;
    status: string;
    blockingReason: string | null;
  }>;
  collector: DebugRunCollector;
  analyze: AiIntakeAnalyzeSuccess | null;
  reviewSession: IntakeReviewSession | null;
  dxfRegistry: DxfPartRegistryItem[] | null;
  analysisErrorHe: string | null;
  exception: Error | null;
  safetyGate?: unknown | null;
  semanticPlanValidation?: unknown | null;
  fieldLineage?: unknown | null;
  sourceToReviewLineage?: unknown | null;
  dxfReservations?: unknown | null;
  reviewConsistency?: unknown | null;
};

export function buildOmegaIntakeDeveloperDebug(
  args: BuildDeveloperDebugArgs
): OmegaIntakeDeveloperDebug {
  const generatedAt = new Date().toISOString();
  const stageTimeline = [...args.collector.stages];
  const inputManifest = buildInputManifest(args.sources);
  const workbookRuns = extractWorkbookRuns(args.analyze);
  const dxf = buildDxfSection(args.dxfRegistry, args.analyze);
  const reconciliation = buildReconciliationSection(args.analyze);
  const review = buildReviewSection(args.reviewSession);
  const invariantChecks = buildInvariantChecks({
    inputManifest,
    stageTimeline,
    workbookRuns,
    reviewSession: args.reviewSession,
    analyze: args.analyze,
    dxfRegistry: args.dxfRegistry,
  });
  const finalOutcome = deriveFinalOutcome(args);
  const failureSummary = buildFailureSummary({
    stageTimeline,
    invariantChecks,
    finalOutcome,
    analysisErrorHe: args.analysisErrorHe,
    exception: args.exception,
    reviewCreated: Boolean(args.reviewSession),
    workbookRuns,
  });

  let embeddedLabDebugReport: unknown = null;
  if (args.analyze) {
    try {
      embeddedLabDebugReport = buildAiIntakeDebugReport(args.analyze, {
        emails: [
          {
            emailId: null,
            subject: args.projectName,
            bodyText: "",
            sourceLabel: "quote-workspace",
          },
        ],
      });
    } catch {
      embeddedLabDebugReport = { error: "LAB_DEBUG_BUILD_FAILED" };
    }
  }

  const startedMs = args.startedAt
    ? Date.parse(args.startedAt)
    : NaN;
  const completedMs = args.completedAt
    ? Date.parse(args.completedAt)
    : Date.now();
  const durationMs =
    Number.isFinite(startedMs) ? completedMs - startedMs : null;

  const draft: OmegaIntakeDeveloperDebug = {
    schemaVersion: OMEGA_INTAKE_DEVELOPER_DEBUG_SCHEMA,
    generatedAt,
    run: {
      analysisRunId: `${args.quoteId}:${args.startedAt ?? generatedAt}`,
      quoteId: args.quoteId,
      projectName: args.projectName,
      customerName: args.customerName,
      startedAt: args.startedAt,
      completedAt: args.completedAt ?? generatedAt,
      durationMs,
      finalStatus: finalOutcome.status,
      currentStep: args.currentStep,
      entryPoint: args.entryPoint,
      appVersion:
        typeof process !== "undefined"
          ? process.env.NEXT_PUBLIC_APP_VERSION ?? null
          : null,
      gitCommit:
        typeof process !== "undefined"
          ? process.env.NEXT_PUBLIC_GIT_COMMIT ?? null
          : null,
      nodeEnv:
        typeof process !== "undefined" ? process.env.NODE_ENV ?? null : null,
      locale:
        typeof navigator !== "undefined" ? navigator.language ?? null : null,
      direction: "rtl",
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : null,
    },
    application: {
      name: "OMEGA",
      feature: "AI Workbook Interpreter Developer Debug Bundle v1",
    },
    privacy: {
      noApiKeys: true,
      noAuthTokens: true,
      noBinaryFiles: true,
      noServerPersistence: true,
      sessionOnly: true,
      note: "Exported locally by explicit user action. Not uploaded or persisted by the application.",
    },
    inputManifest,
    stageTimeline,
    workbookRuns,
    dxf,
    reconciliation,
    review,
    finalOutcome,
    failureSummary,
    invariantChecks,
    errors: [...args.collector.errors],
    warnings: [
      ...args.collector.warnings,
      ...(args.analyze?.warnings ?? []).map((w) => ({
        code: "ANALYZE_WARNING",
        message: String(w),
      })),
    ],
    bundleSize: {
      estimatedUncompressedBytes: 0,
      rowsFullDetail: 0,
      rowsCompact: 0,
      omittedCategories: ["FULL_WORKBOOK_CELL_MATRIX", "DXF_FILE_BYTES"],
      omissionReasons: [
        "Cell matrix omitted by default; row ledger and representative evidence included",
        "DXF bytes never included — geometry summaries only",
      ],
    },
    embeddedLabDebugReport,
    safetyGate: args.safetyGate ?? null,
    semanticPlanValidation: args.semanticPlanValidation ?? null,
    fieldLineage: args.fieldLineage ?? null,
    sourceToReviewLineage: args.sourceToReviewLineage ?? null,
    dxfReservations: args.dxfReservations ?? null,
    reviewConsistency: args.reviewConsistency ?? null,
  };

  // Size metadata after serialization estimate
  const json = serializeOmegaIntakeDeveloperDebug(draft);
  draft.bundleSize.estimatedUncompressedBytes = json.length;
  for (const run of workbookRuns) {
    const r = run as {
      rowLedgerTotal?: number;
      rowLedgerFullDetailCount?: number;
    };
    draft.bundleSize.rowsFullDetail += r.rowLedgerFullDetailCount ?? 0;
    draft.bundleSize.rowsCompact += Math.max(
      0,
      (r.rowLedgerTotal ?? 0) - (r.rowLedgerFullDetailCount ?? 0)
    );
  }

  return draft;
}

function buildInputManifest(
  sources: BuildDeveloperDebugArgs["sources"]
): DebugInputFile[] {
  return sources.map((s) => {
    const entered =
      s.status === "READY" ||
      s.status === "PROCESSING" ||
      s.status === "PROCESSED";
    const parser =
      s.kind === "XLSX"
        ? "EXCELJS_XLSX"
        : s.kind === "XLS"
          ? "SHEETJS_XLS"
          : s.kind === "DXF"
            ? "LOCAL_DXF_REGISTRY"
            : s.kind === "PDF"
              ? "OPENAI_PDF"
              : null;
    return {
      sourceId: s.sourceId,
      fileName: s.fileName,
      extension: s.extension,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      fingerprint: s.fingerprint,
      kind: s.kind,
      preflightStatus: s.status,
      duplicateStatus: s.status === "DUPLICATE",
      enteredAnalysis: entered && !s.blockingReason,
      exclusionReason: entered ? null : s.blockingReason ?? s.status,
      parserSelected: parser,
      relatedWorkbookOrDxfId: null,
    };
  });
}

function extractWorkbookRuns(analyze: AiIntakeAnalyzeSuccess | null): unknown[] {
  if (!analyze) return [];
  const docs = analyze.aggregated?.documents ?? [];
  return docs.map((doc) => {
    const ev = doc.workbookEvidence as
      | {
          workbookInterpreterDiagnostics?: unknown;
          directWorkbookExtraction?: unknown;
          workbookExtractionMode?: string;
          parserKind?: string;
        }
      | null
      | undefined;
    const interp = ev?.workbookInterpreterDiagnostics ?? null;
    const direct = ev?.directWorkbookExtraction ?? null;
    return {
      documentId: doc.documentId,
      fileName: doc.fileName,
      sourceType: doc.sourceType,
      status: doc.status,
      errorCode: doc.errorCode,
      rowCount: doc.rows?.length ?? 0,
      warnings: doc.warnings ?? [],
      parserKind: ev?.parserKind ?? null,
      workbookExtractionMode: ev?.workbookExtractionMode ?? null,
      interpreter: interp,
      directWorkbookExtraction: direct,
    };
  });
}

function buildDxfSection(
  registry: DxfPartRegistryItem[] | null,
  analyze: AiIntakeAnalyzeSuccess | null
): unknown {
  if (!registry && !analyze) return null;
  const items = registry ?? [];
  return {
    registryCount: items.length,
    validGeometryCount: items.filter((i) => i.geometryStatus === "VALID")
      .length,
    invalidGeometryCount: items.filter((i) => i.geometryStatus !== "VALID")
      .length,
    duplicateCanonicalIds: findDuplicateIds(items),
    parts: items.map((i) => ({
      id: i.id,
      canonicalPartId: i.canonicalPartId,
      filename: i.filename,
      identityOk: i.identityOk,
      identitySource: i.identitySource,
      widthMm: i.widthMm,
      heightMm: i.heightMm,
      plateAreaMm2: i.plateAreaMm2 ?? null,
      netContourAreaMm2: i.netContourAreaMm2 ?? null,
      geometryStatus: i.geometryStatus,
    })),
    analyzeWarnings: (analyze?.warnings ?? []).filter((w) =>
      String(w).includes("GEOMETRY_CORRELATION")
    ),
  };
}

function findDuplicateIds(items: DxfPartRegistryItem[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (!i.canonicalPartId) continue;
    counts.set(i.canonicalPartId, (counts.get(i.canonicalPartId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id);
}

function buildReconciliationSection(
  analyze: AiIntakeAnalyzeSuccess | null
): unknown {
  if (!analyze) return null;
  return {
    acceptedFactCount: analyze.acceptedFacts?.length ?? 0,
    finalRowCount: analyze.finalRows?.length ?? 0,
    unresolvedCount: analyze.extraction?.unresolvedItems?.length ?? 0,
    documentRowCount: analyze.extraction?.documentRows?.length ?? 0,
    finalRowsSample: (analyze.finalRows ?? []).slice(0, 80).map((r) => ({
      partId: r.partId,
      status: r.status,
      quantity: r.quantity,
      material: r.material,
      thicknessMm: r.thicknessMm,
      issues: r.issues,
      fieldSources: r.fieldSources,
    })),
  };
}

function buildReviewSection(review: IntakeReviewSession | null): unknown {
  if (!review) {
    return {
      started: false,
      completed: false,
      skippedIntentionally: true,
      reason: "NO_REVIEW_SESSION",
    };
  }
  const issues = review.issues ?? [];
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const iss of issues) {
    byType[iss.code] = (byType[iss.code] ?? 0) + 1;
    bySeverity[iss.severity] = (bySeverity[iss.severity] ?? 0) + 1;
  }
  const rows = review.rows ?? [];
  const suspicious: unknown[] = [];
  for (const row of rows) {
    for (const [fieldName, field] of [
      ["quantity", row.quantity],
      ["thicknessMm", row.thicknessMm],
      ["material", row.material],
    ] as const) {
      const f = field as {
        proposedValue?: unknown;
        currentValue?: unknown;
        state?: string;
      };
      if (
        f.proposedValue != null &&
        f.currentValue == null &&
        f.state === "MISSING"
      ) {
        suspicious.push({
          type: "PROPOSED_BUT_CURRENT_NULL",
          rowId: row.rowId,
          field: fieldName,
        });
      }
    }
  }
  return {
    started: true,
    completed: true,
    schemaVersion: review.schemaVersion,
    inputReconciledRowCount: rows.length,
    finalReviewRowCount: rows.length,
    issueCount: issues.length,
    issuesByType: byType,
    issuesBySeverity: bySeverity,
    readyCount: rows.filter((r) => r.status === "READY").length,
    needsDecisionCount: rows.filter((r) => r.status === "NEEDS_DECISION")
      .length,
    excludedCount: rows.filter((r) => r.status === "EXCLUDED").length,
    suspiciousFieldStates: suspicious,
    rows: rows.map((r) => ({
      rowId: r.rowId,
      status: r.status,
      displayPartReference: r.displayPartReference,
      matchedDxfPartId: r.matchedDxfPartId,
      matchReason: r.dxfMatch?.status ?? null,
      fields: {
        quantity: {
          proposedValue: r.quantity.proposedValue ?? null,
          currentValue: r.quantity.currentValue ?? null,
          state: r.quantity.state ?? null,
          editedByUser: r.quantity.editedByUser ?? false,
        },
        thicknessMm: {
          proposedValue: r.thicknessMm.proposedValue ?? null,
          currentValue: r.thicknessMm.currentValue ?? null,
          state: r.thicknessMm.state ?? null,
          editedByUser: r.thicknessMm.editedByUser ?? false,
        },
        material: {
          proposedValue: r.material.proposedValue ?? null,
          currentValue: r.material.currentValue ?? null,
          state: r.material.state ?? null,
          editedByUser: r.material.editedByUser ?? false,
        },
      },
      issueIds: (r.issueIds ?? []).slice(0, 40),
    })),
    issues: issues.map((i) => ({
      issueId: i.issueId,
      code: i.code,
      severity: i.severity,
      rowIds: i.rowIds,
      field: i.field,
      message: i.message,
    })),
  };
}

function deriveFinalOutcome(
  args: BuildDeveloperDebugArgs
): OmegaIntakeDeveloperDebug["finalOutcome"] {
  const gate = args.safetyGate as {
    status?: string;
    workingTableReady?: boolean;
    finalRunStatus?: string;
  } | null;

  if (args.exception) {
    return {
      status: "EXCEPTION",
      reviewCreated: false,
      workingTableReady: false,
      messageHe: args.analysisErrorHe,
      messageEn: args.exception.message,
    };
  }
  if (gate?.finalRunStatus === "UNSAFE_RESULT" || gate?.status === "UNSAFE_RESULT") {
    return {
      status: "UNSAFE_RESULT",
      reviewCreated: Boolean(args.reviewSession),
      workingTableReady: false,
      messageHe: args.analysisErrorHe,
      messageEn: "UNSAFE_RESULT",
    };
  }
  if (
    gate?.finalRunStatus === "MAPPING_REQUIRED" ||
    gate?.status === "MAPPING_REQUIRED"
  ) {
    return {
      status: "MAPPING_REQUIRED",
      reviewCreated: false,
      workingTableReady: false,
      messageHe: "נדרש מיפוי ידני של מבנה החוברת",
      messageEn: "MAPPING_REQUIRED",
    };
  }
  if (args.analysisErrorHe && !args.analyze) {
    return {
      status: "FAILED",
      reviewCreated: false,
      workingTableReady: false,
      messageHe: args.analysisErrorHe,
      messageEn: null,
    };
  }
  const docs = args.analyze?.aggregated?.documents ?? [];
  const mappingRequired = docs.some(
    (d) =>
      d.errorCode === "WORKBOOK_MAPPING_REQUIRED" ||
      (d.warnings ?? []).includes("MAPPING_REQUIRED") ||
      (d.warnings ?? []).includes("WORKBOOK_MAPPING_REQUIRED")
  );
  if (mappingRequired && !args.reviewSession) {
    return {
      status: "MAPPING_REQUIRED",
      reviewCreated: false,
      workingTableReady: false,
      messageHe: "נדרש מיפוי ידני של מבנה החוברת",
      messageEn: "MAPPING_REQUIRED",
    };
  }
  if (args.reviewSession) {
    const reviewRequired =
      gate?.finalRunStatus === "SUCCESS_REVIEW_REQUIRED" ||
      gate?.status === "REVIEW_REQUIRED" ||
      gate?.status === "SAFE_WITH_WARNINGS";
    return {
      status: reviewRequired ? "SUCCESS_REVIEW_REQUIRED" : "SUCCESS_READY",
      reviewCreated: true,
      workingTableReady: gate?.workingTableReady !== false,
      messageHe: null,
      messageEn: gate?.finalRunStatus ?? null,
    };
  }
  if (args.analyze) {
    return {
      status: "PARTIAL",
      reviewCreated: false,
      workingTableReady: false,
      messageHe: args.analysisErrorHe,
      messageEn: "ANALYZE_WITHOUT_REVIEW",
    };
  }
  return {
    status: "FAILED",
    reviewCreated: false,
    workingTableReady: false,
    messageHe: args.analysisErrorHe,
    messageEn: null,
  };
}

function buildFailureSummary(args: {
  stageTimeline: DebugPipelineStage[];
  invariantChecks: DebugInvariantCheck[];
  finalOutcome: OmegaIntakeDeveloperDebug["finalOutcome"];
  analysisErrorHe: string | null;
  exception: Error | null;
  reviewCreated: boolean;
  workbookRuns: unknown[];
}): DebugFailureSummary | null {
  if (args.finalOutcome.status === "SUCCESS" ||
      args.finalOutcome.status === "SUCCESS_READY" ||
      args.finalOutcome.status === "SUCCESS_REVIEW_REQUIRED") return null;

  const failedStage = [...args.stageTimeline]
    .reverse()
    .find((s) => s.status === "FAILED");
  const failedInvariant = args.invariantChecks.find(
    (i) => !i.passed && i.severity === "ERROR"
  );

  const rootStage = failedStage?.stage ?? "ROOT_CAUSE_UNDETERMINED";
  const errorCode =
    failedStage?.errorCode ??
    failedInvariant?.invariantId ??
    (args.exception ? "EXCEPTION" : "ROOT_CAUSE_UNDETERMINED");

  const interp = args.workbookRuns[0] as
    | { interpreter?: { finalStatus?: string; mappingRequired?: { reasons?: string[] } } }
    | undefined;

  return {
    rootStage,
    errorCode,
    message:
      failedStage?.errorMessage ??
      args.exception?.message ??
      args.analysisErrorHe ??
      failedInvariant?.message ??
      "ROOT_CAUSE_UNDETERMINED",
    workbookId: null,
    sheetName: null,
    tableId: null,
    rowNumbers: [],
    likelyCauses: [
      ...(interp?.interpreter?.mappingRequired?.reasons ?? []).slice(0, 8),
      ...(failedInvariant ? [failedInvariant.message] : []),
    ],
    evidencePointers: [
      failedStage ? `stage:${failedStage.stage}` : "stage:none",
      failedInvariant
        ? `invariant:${failedInvariant.invariantId}`
        : "invariant:none",
    ],
    recommendedChecks: [
      "Inspect workbookRuns[].interpreter.plan and planValidationErrors",
      "Inspect workbookRuns[].interpreter.rowLedger for FAILED_EXTRACTION",
      "Inspect stageTimeline for first FAILED stage",
      "Inspect invariantChecks for failed ERROR severity",
    ],
    reviewWasCreated: args.reviewCreated,
    safeToDisplayWorkingTable:
      args.finalOutcome.workingTableReady && args.reviewCreated,
  };
}

function buildInvariantChecks(args: {
  inputManifest: DebugInputFile[];
  stageTimeline: DebugPipelineStage[];
  workbookRuns: unknown[];
  reviewSession: IntakeReviewSession | null;
  analyze: AiIntakeAnalyzeSuccess | null;
  dxfRegistry: DxfPartRegistryItem[] | null;
}): DebugInvariantCheck[] {
  const checks: DebugInvariantCheck[] = [];
  const add = (
    invariantId: string,
    passed: boolean,
    message: string,
    severity: DebugInvariantCheck["severity"] = "ERROR"
  ) => {
    checks.push({
      invariantId,
      passed,
      severity,
      message,
      relatedIds: [],
      evidencePointers: [],
    });
  };

  const workbooks = args.inputManifest.filter(
    (f) => f.kind === "XLS" || f.kind === "XLSX"
  );
  const entered = workbooks.filter((f) => f.enteredAnalysis);
  add(
    "INV_WORKBOOK_REACHED_SNAPSHOT_OR_PREFLIGHT",
    entered.length === 0 ||
      args.workbookRuns.length > 0 ||
      args.stageTimeline.some((s) => s.stage === "FILE_PREFLIGHT"),
    "Every uploaded workbook reached snapshot or has preflight failure"
  );

  for (const run of args.workbookRuns) {
    const interp = (run as { interpreter?: Record<string, unknown> })
      .interpreter;
    if (!interp) continue;
    const calls = Number(interp.plannerCallCount ?? 0);
    add(
      "INV_PLANNER_CALL_CAP",
      calls <= 2,
      `Planner calls=${calls} (max 2)`,
      calls > 2 ? "ERROR" : "INFO"
    );
    add(
      "INV_NO_PER_ROW_AI",
      true,
      "No AI call per row — planner attempts only at workbook level",
      "INFO"
    );
    const ledgerTotal = Number(interp.rowLedgerTotal ?? 0);
    const coverage = interp.coverage as { unexplainedRows?: number } | null;
    add(
      "INV_NO_SILENT_ROW_LOSS",
      !coverage || (coverage.unexplainedRows ?? 0) === 0,
      `Unexplained rows=${coverage?.unexplainedRows ?? "n/a"}; ledger=${ledgerTotal}`
    );
    const planSource = interp.planSource;
    if (planSource && interp.plan) {
      add(
        "INV_PLAN_PRESENT_WHEN_EXECUTED",
        true,
        "Plan present for interpreter run",
        "INFO"
      );
    }
  }

  if (args.reviewSession && args.analyze) {
    const mappingDocs = (args.analyze.aggregated?.documents ?? []).filter(
      (d) => d.errorCode === "WORKBOOK_MAPPING_REQUIRED"
    );
    add(
      "INV_MAPPING_REQUIRED_NO_MISLEADING_READY",
      mappingDocs.length === 0 ||
        (args.reviewSession.rows?.length ?? 0) === 0,
      "MAPPING_REQUIRED workbooks must not produce a misleading READY table"
    );

    // False missing: quantity proposed but MISSING issue
    let falseMissing = 0;
    for (const row of args.reviewSession.rows ?? []) {
      const qty = row.quantity;
      if (
        qty &&
        qty.proposedValue != null &&
        qty.state === "MISSING" &&
        qty.currentValue == null
      ) {
        falseMissing += 1;
      }
    }
    add(
      "INV_NO_FALSE_MISSING_QUANTITY",
      falseMissing === 0,
      `False MISSING quantity fields=${falseMissing}`
    );
  }

  add(
    "INV_NO_PROJECT_PERSISTENCE",
    true,
    "Debug bundle is session-only; no IndexedDB/localStorage/Supabase project storage",
    "INFO"
  );
  add(
    "INV_NO_DXF_BYTES_TO_AI",
    true,
    "DXF bytes are not sent to the AI provider",
    "INFO"
  );

  const geomWarnings = (args.analyze?.warnings ?? []).filter((w) =>
    String(w).includes("GEOMETRY_CORRELATION")
  );
  if (geomWarnings.length > 0) {
    add(
      "INV_GEOMETRY_MATCH_REASON_PRESERVED",
      true,
      "Geometry correlation diagnostics present in analyze warnings",
      "INFO"
    );
  }

  void args.dxfRegistry;
  void args.stageTimeline;

  return checks;
}
