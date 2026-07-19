/**
 * Detached DTO for developer debug — transport recovery diagnostics.
 */

import type { CorrectionEligibility } from "./correctionEligibility";
import type { DirectExtractionDiagnostics } from "./extractWorkbookDirect";
import type {
  DirectExtractionVerification,
  DirectWorkbookExtraction,
} from "./types";

export function buildDirectWorkbookExtractionDebugDto(args: {
  diagnostics: DirectExtractionDiagnostics;
  extraction: DirectWorkbookExtraction | null;
  verification: DirectExtractionVerification | null;
  mappingRequired: unknown;
  partRowCount: number;
  legacyComparison?: unknown;
}): Record<string, unknown> {
  const d = args.diagnostics;
  return {
    schemaVersion: "omega-direct-workbook-extraction-debug/v1.1",
    extractionMode: d.mode,
    schemaMode: d.schemaMode,
    model: d.model,
    provider: "openai",
    inputStrategy: d.inputStrategy,
    originalFileIncluded: d.originalFileAttached,
    snapshotSizeChars: d.snapshotChars,
    providerCallCount: d.providerCallCount,
    directExtractionTransport: {
      schemaVersion: d.transport.schemaVersion,
      schemaHash: d.transport.schemaHash,
      schemaPreflight: d.transport.schemaPreflight,
      requestLifecycle: d.transport.requestLifecycle,
      lifecycleTimestamps: d.transport.lifecycleTimestamps,
      requestBuilt: d.transport.requestBuilt,
      requestSent: d.transport.requestSent,
      responseReceived: d.transport.responseReceived,
      providerRequestId: d.transport.providerRequestId,
      providerStatus: d.transport.providerStatus,
      providerError: d.transport.providerError,
      structuredOutputParsed: d.transport.structuredOutputParsed,
      responseSchemaValidated: d.transport.responseSchemaValidated,
      domainConversionCompleted: d.transport.domainConversionCompleted,
      failureStage: d.transport.failureStage,
      retryable: d.transport.retryable,
      failure: d.transport.failure,
    },
    workbookExtractionGate: d.workbookGate,
    dxfPipelineGate: {
      executed: d.dxfPipeline === "EXECUTED",
      skipReason:
        d.dxfPipeline === "SKIPPED"
          ? d.failure
            ? "WORKBOOK_EXTRACTION_FAILED"
            : d.finalStatus === "MAPPING_REQUIRED"
              ? "MAPPING_REQUIRED"
              : "ZERO_CANONICAL_SOURCE_ROWS"
          : null,
    },
    orphanGenerationGate: {
      executed: d.orphanGeneration === "EXECUTED",
      skipReason:
        d.orphanGeneration === "SUPPRESSED"
          ? "WORKBOOK_EXTRACTION_FAILED"
          : null,
      pendingSourceExtractionCount:
        d.orphanGeneration === "SUPPRESSED" ? "ALL_UNMATCHED" : 0,
    },
    finalStatusReasoning: {
      selectedStatus: d.finalStatus,
      selectionDecision: d.selectionDecision,
      requiredConditions: [
        "no_transport_failure",
        "verified_rows_when_candidate_data",
        "canonical_conversion_ok",
      ],
      failedConditions: d.workbookGate?.blockingReasons ?? [],
    },
    initialExtraction: detach(d.initialExtraction),
    initialEvidenceRepair: d.initialEvidenceRepair
      ? {
          repairedFieldCount: d.initialEvidenceRepair.repairedFieldCount,
          unresolvedLocalizationCount:
            d.initialEvidenceRepair.unresolvedLocalizationCount,
          durationMs: d.initialEvidenceRepair.durationMs,
        }
      : null,
    initialVerification: detach(d.initialVerification),
    initialQuality: d.initialQuality,
    correctionEligibility: detachEligibility(d.correctionEligibility),
    correctionTriggers: d.correctionTriggers,
    correctedExtraction: detach(d.correctedExtraction),
    correctedVerification: detach(d.correctedVerification),
    correctedQuality: d.correctedQuality,
    selectionDecision: d.selectionDecision,
    selectedResult: d.selectedResult,
    regressionReasons: d.regressionReasons,
    finalVerification: detach(args.verification),
    coverageMetrics: d.coverageMetrics,
    performance: d.performance,
    canonicalOccurrenceConversion: { partRowCount: args.partRowCount },
    dxfPipeline: d.dxfPipeline,
    orphanGeneration: d.orphanGeneration,
    finalStatus: d.finalStatus,
    mappingRequired: args.mappingRequired,
    legacyComparison: args.legacyComparison ?? null,
    failure: d.failure,
  };
}

function detach(v: unknown): unknown {
  if (v == null) return null;
  return JSON.parse(JSON.stringify(v));
}

function detachEligibility(e: CorrectionEligibility | null): unknown {
  if (!e) return null;
  return {
    eligible: e.eligible,
    triggerCodes: e.triggerCodes,
    triggerCategories: e.triggerCategories,
    reason: e.reason,
    aggregatedFeedback: e.aggregatedFeedback,
  };
}
