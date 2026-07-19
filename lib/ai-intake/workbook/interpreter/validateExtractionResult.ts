/**
 * Deterministic validation of extraction execution results.
 */

import type { WorkbookSnapshot } from "../../normalization/types";
import type {
  WorkbookExtractionExecutionResult,
  WorkbookExtractionPlan,
  WorkbookExtractionValidation,
  WorkbookMappingRequired,
  WorkbookPlanRepairFeedback,
} from "./types";

export function validateWorkbookExtractionResult(args: {
  snapshot: WorkbookSnapshot;
  plan: WorkbookExtractionPlan;
  result: WorkbookExtractionExecutionResult;
}): WorkbookExtractionValidation {
  const errors: WorkbookExtractionValidation["errors"] = [];
  const warnings: WorkbookExtractionValidation["warnings"] = [];
  const metrics: WorkbookExtractionValidation["metrics"] = [];

  const { coverage, occurrences, skippedRows, failedRows } = args.result;

  metrics.push({
    name: "coveragePercent",
    value: coverage.coveragePercent,
  });
  metrics.push({
    name: "dataOccurrences",
    value: coverage.dataOccurrences,
  });
  metrics.push({
    name: "failedRows",
    value: coverage.failedRows,
  });
  metrics.push({
    name: "unexplainedRows",
    value: coverage.unexplainedRows,
  });

  if (coverage.unexplainedRows > 0) {
    errors.push({
      code: "UNEXPLAINED_ROWS",
      severity: "ERROR",
      message: `${coverage.unexplainedRows} rows unclassified`,
    });
  }

  if (coverage.coveragePercent < 95 && coverage.declaredDataRows > 0) {
    warnings.push({
      code: "LOW_COVERAGE",
      severity: "WARNING",
      message: `Coverage ${coverage.coveragePercent}%`,
    });
  }

  const fieldCoverage = computeFieldCoverage(occurrences);
  for (const [name, rate] of Object.entries(fieldCoverage)) {
    metrics.push({ name: `field_${name}`, value: rate });
  }

  // Quantity blocking when we claim PART_LIST / MATERIAL_LIST
  const dataTables = args.plan.tables.filter(
    (t) => t.tableRole === "PART_LIST" || t.tableRole === "MATERIAL_LIST"
  );
  if (dataTables.length > 0 && occurrences.length === 0) {
    errors.push({
      code: "NO_DATA_OCCURRENCES",
      severity: "ERROR",
      message: "Plan declared data tables but extracted zero occurrences",
    });
  }

  if (dataTables.length > 0 && occurrences.length > 0) {
    const qtyRate = fieldCoverage.QUANTITY ?? 0;
    if (qtyRate < 0.5) {
      errors.push({
        code: "LOW_QUANTITY_COVERAGE",
        severity: "ERROR",
        message: `Quantity coverage ${qtyRate}`,
      });
    }
    const idOrProfile =
      (fieldCoverage.EXPLICIT_PART_IDENTIFIER ?? 0) +
      (fieldCoverage.PROFILE ?? 0) +
      (fieldCoverage.SOURCE_DESCRIPTOR ?? 0);
    if (idOrProfile < 0.3) {
      warnings.push({
        code: "LOW_IDENTITY_COVERAGE",
        severity: "WARNING",
        message: "Low part-id/profile/descriptor coverage",
      });
    }

    // Full source line used as material
    for (const occ of occurrences) {
      const mat = occ.fields.find((f) => f.targetField === "MATERIAL");
      if (
        mat?.provenance.originalCellText &&
        mat.textValue &&
        mat.textValue.trim() === mat.provenance.originalCellText.trim() &&
        mat.textValue.length > 40
      ) {
        errors.push({
          code: "FULL_LINE_AS_MATERIAL",
          severity: "ERROR",
          message: `Row ${occ.rowNumber} material equals full cell`,
          tableId: occ.tableId,
          rowNumber: occ.rowNumber,
        });
      }
    }

    // Profile treated as explicit id
    for (const occ of occurrences) {
      if (
        occ.explicitPartIdentifier &&
        occ.profileRaw &&
        occ.explicitPartIdentifier === occ.profileRaw &&
        /^PL\d/i.test(occ.profileRaw)
      ) {
        errors.push({
          code: "PROFILE_AS_IDENTIFIER",
          severity: "ERROR",
          message: `Row ${occ.rowNumber} profile used as part id`,
          rowNumber: occ.rowNumber,
        });
      }
    }
  }

  // Totals not in occurrences
  const totalSkipped = skippedRows.filter(
    (s) =>
      s.classification === "TOTAL" ||
      s.classification === "SUBTOTAL" ||
      s.classification === "FOOTER" ||
      s.classification === "HEADER" ||
      s.classification === "REPEATED_HEADER"
  ).length;
  metrics.push({ name: "structuralSkips", value: totalSkipped });

  if (failedRows.length > coverage.declaredDataRows * 0.2) {
    errors.push({
      code: "HIGH_FAILURE_RATE",
      severity: "ERROR",
      message: `${failedRows.length} failed rows`,
    });
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      coverage.coveragePercent * 0.5 +
        (fieldCoverage.QUANTITY ?? 0) * 25 +
        ((fieldCoverage.MATERIAL ?? 0) +
          (fieldCoverage.PROFILE ?? 0) +
          (fieldCoverage.EXPLICIT_PART_IDENTIFIER ?? 0)) *
          8 -
        errors.length * 12 -
        warnings.length * 3
    )
  );

  const repairFeedback: WorkbookPlanRepairFeedback = {
    planValidationErrors: [],
    extractionErrors: errors.map((e) => e.code),
    failedRowSamples: failedRows.slice(0, 12),
    unexplainedRowSamples: skippedRows
      .filter((s) => s.classification === "INVALID" || s.classification === "FAILED_EXTRACTION")
      .slice(0, 12),
    fieldCoverage,
  };

  let status: WorkbookExtractionValidation["status"] = "PASS";
  if (errors.length > 0 && score < 55) {
    status = score < 35 ? "MAPPING_REQUIRED" : "REPAIR_RECOMMENDED";
  } else if (errors.length > 0) {
    status = "REPAIR_RECOMMENDED";
  } else if (warnings.length > 0) {
    status = "PASS_WITH_WARNINGS";
  }

  // Ambiguous: many sheets, no strong fields
  if (
    args.plan.tables.every((t) => t.confidence < 0.5) &&
    occurrences.length > 0
  ) {
    status = "MAPPING_REQUIRED";
  }

  void args.snapshot;

  return {
    status,
    score,
    metrics,
    errors,
    warnings,
    repairFeedback,
  };
}

function computeFieldCoverage(
  occurrences: WorkbookExtractionExecutionResult["occurrences"]
): Record<string, number> {
  if (occurrences.length === 0) return {};
  const counts: Record<string, number> = {};
  for (const occ of occurrences) {
    for (const f of occ.fields) {
      if (f.textValue != null && String(f.textValue).trim() !== "") {
        counts[f.targetField] = (counts[f.targetField] ?? 0) + 1;
      } else if (f.numberValue != null) {
        counts[f.targetField] = (counts[f.targetField] ?? 0) + 1;
      }
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    out[k] = Math.round((v / occurrences.length) * 1000) / 1000;
  }
  return out;
}

export function buildMappingRequired(args: {
  workbookId: string;
  plan: WorkbookExtractionPlan;
  validation: WorkbookExtractionValidation;
}): WorkbookMappingRequired {
  const questions = [];
  for (const table of args.plan.tables) {
    for (const field of table.fields) {
      if (field.confidence < 0.55) {
        questions.push({
          questionType: "MAP_SOURCE_FIELD" as const,
          sourceLabel: `${table.sheetName} / ${field.targetField}`,
          sampleValues: field.reasons.slice(0, 3),
          suggestedTarget: field.targetField,
          alternatives: ["IGNORE", "PROFILE", "MATERIAL", "QUANTITY", "THICKNESS"],
        });
      }
    }
    if (table.headerRows.length === 0) {
      questions.push({
        questionType: "CHOOSE_HEADER_ROW" as const,
        sourceLabel: table.sheetName,
        sampleValues: [],
        suggestedTarget: null,
        alternatives: [],
      });
    }
  }

  return {
    status: "MAPPING_REQUIRED",
    workbookId: args.workbookId,
    detectedTables: args.plan.tables.map((t) => ({
      tableId: t.tableId,
      sheetName: t.sheetName,
      reasons: t.reasons,
    })),
    questions,
    proposedMappings: args.plan.tables.flatMap((t) =>
      t.fields.map((f) => ({
        sourceLabel: `${t.sheetName}:${f.targetField}`,
        suggestedTarget: f.targetField,
        confidence: f.confidence,
      }))
    ),
    reasons: [
      ...args.validation.errors.map((e) => e.message),
      ...args.plan.ambiguities.map((a) => a.message),
      `validationStatus=${args.validation.status}`,
    ],
  };
}
