/**
 * Full workbook interpreter diagnostics for developer debug bundle embedding.
 * Includes plans, profiles, validation, and row ledger (bounded size).
 */

import type { WorkbookInterpreterDiagnostics } from "./types";

const MAX_LEDGER_FULL = 200;
const MAX_OCCURRENCE_SAMPLES = 40;

export function workbookInterpreterDebugSummary(
  d: WorkbookInterpreterDiagnostics
): Record<string, unknown> {
  const ledger = d.execution?.rowLedger ?? [];
  const failedOrSuspicious = ledger.filter(
    (e) =>
      e.classification === "FAILED_EXTRACTION" ||
      e.classification === "INVALID" ||
      e.executionErrors.length > 0 ||
      (e.classification === "DATA_OCCURRENCE" &&
        e.extractedFields.every((f) => f.status === "EMPTY"))
  );
  const compactLedger = ledger.slice(0, MAX_LEDGER_FULL).map((e) => {
    const full =
      failedOrSuspicious.includes(e) ||
      e.classification === "FAILED_EXTRACTION";
    if (full) return e;
    return {
      workbookId: e.workbookId,
      tableId: e.tableId,
      sheetName: e.sheetName,
      rowNumber: e.rowNumber,
      classification: e.classification,
      classificationReasons: e.classificationReasons,
      occurrenceId: e.occurrenceId,
      extractedFieldCount: e.extractedFields.length,
      textPreview: e.textPreview.slice(0, 120),
      detail: "COMPACT",
    };
  });

  return {
    workbookId: d.workbookId,
    fingerprint: d.fingerprint,
    profileVersion: d.profileVersion,
    planSource: d.planSource,
    plannerCallCount: d.plannerCallCount,
    maxPlannerCalls: 2,
    modelName: d.modelName,
    sheetsProfiled: d.sheetsProfiled,
    regionsDetected: d.regionsDetected,
    tablesPlanned: d.tablesPlanned,
    initialPlanValid: d.initialPlanValid,
    repaired: d.repaired,
    finalStatus: d.finalStatus,
    coverage: d.coverage,
    timingMs: d.timingMs,
    planValidationErrors: d.planValidationErrors,
    plannerAttempts: d.plannerAttempts,
    mappingRequired: d.mappingRequired,
    profile: d.profile,
    plan: d.plan,
    validation: d.validation,
    executionCoverage: d.execution?.coverage ?? null,
    rowLedger: compactLedger,
    rowLedgerTotal: ledger.length,
    rowLedgerFullDetailCount: failedOrSuspicious.length,
    occurrenceSamples: (d.execution?.occurrences ?? [])
      .slice(0, MAX_OCCURRENCE_SAMPLES)
      .map((o) => ({
        occurrenceId: o.occurrenceId,
        tableId: o.tableId,
        sheetName: o.sheetName,
        rowNumber: o.rowNumber,
        explicitPartIdentifier: o.explicitPartIdentifier,
        sourceDescriptor: o.sourceDescriptor,
        profileRaw: o.profileRaw,
        fields: o.fields.map((f) => ({
          targetField: f.targetField,
          operation: f.provenance.operation,
          sourceCells: f.provenance.cellAddresses,
          characterSpan:
            f.provenance.characterStart != null
              ? [f.provenance.characterStart, f.provenance.characterEnd]
              : null,
          rawValue: f.rawValue,
          textValue: f.textValue,
          numberValue: f.numberValue,
          unit: f.unit,
          confidence: f.confidence,
        })),
      })),
    skippedRowsByClass: summarizeSkipped(d.execution?.skippedRows ?? []),
    failedRows: d.execution?.failedRows ?? [],
  };
}

function summarizeSkipped(
  skipped: Array<{ classification: string }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of skipped) {
    out[s.classification] = (out[s.classification] ?? 0) + 1;
  }
  return out;
}
