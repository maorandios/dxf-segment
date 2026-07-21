/**
 * Deterministic quality gate for Stage 1 material-list extraction.
 */

import {
  MATERIAL_LIST_QUALITY_GATE,
  REPAIRABLE_MATERIAL_FIELDS,
} from "./qualityGateConfig";
import type {
  MaterialFieldResolution,
  MaterialListFieldCoverage,
  MaterialListQualityGateResult,
  MaterialListRow,
  RepairableMaterialField,
} from "./types";
import { effectiveMaterialFields } from "./completeness";
import { isSemanticallyValidMaterial } from "./materialValidation";

function isUsablePositiveNumber(v: number | null | undefined): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isUsableQuantity(v: number | null | undefined): boolean {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    Number.isInteger(v) &&
    v > 0
  );
}

export function isFieldUsable(
  field: RepairableMaterialField,
  row: MaterialListRow
): boolean {
  const e = effectiveMaterialFields(row);
  switch (field) {
    case "material":
      return isSemanticallyValidMaterial(e.material, row);
    case "thicknessMm":
      return isUsablePositiveNumber(e.thicknessMm);
    case "quantity":
      return isUsableQuantity(e.quantity);
    case "widthMm":
      return isUsablePositiveNumber(e.widthMm);
    case "lengthMm":
      return isUsablePositiveNumber(e.lengthMm);
  }
}

export function measureFieldCoverage(
  rows: MaterialListRow[]
): MaterialListFieldCoverage {
  const total = rows.length || 1;
  const counts: MaterialListFieldCoverage = {
    material: 0,
    thicknessMm: 0,
    quantity: 0,
    widthMm: 0,
    lengthMm: 0,
  };
  for (const row of rows) {
    for (const field of REPAIRABLE_MATERIAL_FIELDS) {
      if (isFieldUsable(field, row)) counts[field]++;
    }
  }
  return {
    material: counts.material / total,
    thicknessMm: counts.thicknessMm / total,
    quantity: counts.quantity / total,
    widthMm: counts.widthMm / total,
    lengthMm: counts.lengthMm / total,
  };
}

/** Absolute usable counts (for debug). */
export function measureFieldCoverageCounts(rows: MaterialListRow[]): {
  material: number;
  thicknessMm: number;
  quantity: number;
  widthMm: number;
  lengthMm: number;
} {
  const counts = {
    material: 0,
    thicknessMm: 0,
    quantity: 0,
    widthMm: 0,
    lengthMm: 0,
  };
  for (const row of rows) {
    for (const field of REPAIRABLE_MATERIAL_FIELDS) {
      if (isFieldUsable(field, row)) counts[field]++;
    }
  }
  return counts;
}

export function countDuplicateSourceRows(rows: MaterialListRow[]): number {
  const seen = new Map<string, number>();
  let dupes = 0;
  for (const row of rows) {
    if (row.sheetName == null || row.sourceRow == null || row.sourceRow <= 0) {
      continue;
    }
    const key = `${normalizeSheetName(row.sheetName)}::${row.sourceRow}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 2) dupes++;
  }
  return dupes;
}

export function countMissingProvenance(rows: MaterialListRow[]): number {
  return rows.filter(
    (r) =>
      r.sheetName == null ||
      r.sourceRow == null ||
      !Number.isInteger(r.sourceRow) ||
      r.sourceRow <= 0
  ).length;
}

export function countInvalidNumericValues(rows: MaterialListRow[]): number {
  let n = 0;
  for (const row of rows) {
    const e = effectiveMaterialFields(row);
    for (const v of [e.thicknessMm, e.quantity, e.widthMm, e.lengthMm]) {
      if (v != null && Number.isFinite(v) && v < 0) n++;
      if (v === 0) n++; // explicit zero treated as invalid for required dims/qty gate
    }
  }
  return n;
}

export function normalizeSheetName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function provenanceKey(
  sheetName: string | null,
  sourceRow: number | null
): string | null {
  if (sheetName == null || sourceRow == null || sourceRow <= 0) return null;
  return `${normalizeSheetName(sheetName)}::${sourceRow}`;
}

function detectCollapsedFields(
  coverage: MaterialListFieldCoverage,
  itemCount: number
): { fields: RepairableMaterialField[]; reasons: string[] } {
  const cfg = MATERIAL_LIST_QUALITY_GATE;
  const fields: RepairableMaterialField[] = [];
  const reasons: string[] = [];

  if (itemCount < cfg.minItemsForSystematicCheck) {
    return { fields, reasons };
  }

  for (const field of REPAIRABLE_MATERIAL_FIELDS) {
    const ratio = coverage[field];
    if (ratio >= cfg.maxUsableCoverageRatioForCollapse) continue;

    const peers = REPAIRABLE_MATERIAL_FIELDS.filter((f) => f !== field);
    const peerAvg =
      peers.reduce((sum, f) => sum + coverage[f], 0) / peers.length;
    const healthyPeers = peers.filter(
      (f) => coverage[f] >= cfg.peerHealthyRatio
    ).length;

    if (
      peerAvg >= cfg.minPeerAverageCoverageRatio &&
      healthyPeers >= cfg.minHealthyPeerFields
    ) {
      fields.push(field);
      reasons.push(
        `SYSTEMATIC_COLLAPSE:${field}:coverage=${ratio.toFixed(3)}:peerAvg=${peerAvg.toFixed(3)}:healthyPeers=${healthyPeers}:items=${itemCount}`
      );
    }
  }

  return { fields, reasons };
}

export function evaluateQualityGate(
  rows: MaterialListRow[]
): MaterialListQualityGateResult {
  const coverage = measureFieldCoverage(rows);
  const coverageCounts = measureFieldCoverageCounts(rows);
  const { fields, reasons } = detectCollapsedFields(coverage, rows.length);
  const duplicateSourceRows = countDuplicateSourceRows(rows);
  const missingProvenance = countMissingProvenance(rows);
  const invalidNumeric = countInvalidNumericValues(rows);

  if (duplicateSourceRows > 0) {
    reasons.push(`DUPLICATE_SOURCE_ROWS:${duplicateSourceRows}`);
  }
  if (missingProvenance > 0) {
    reasons.push(`MISSING_PROVENANCE:${missingProvenance}`);
  }

  const shouldRepair = fields.length > 0;
  const passed = !shouldRepair;

  return {
    passed,
    shouldRepair,
    repairFields: fields,
    triggerReasons: reasons,
    fieldCoverage: coverage,
    fieldCoverageCounts: coverageCounts,
    itemCount: rows.length,
    exactSourceRowCount: rows.filter(
      (r) => r.sourceRow != null && r.sourceRow > 0
    ).length,
    duplicateSourceRows,
    missingProvenance,
    invalidNumeric,
  };
}

/**
 * Final gate after optional repair: no remaining systematic collapse.
 * Individual MISSING_IN_SOURCE rows are allowed; unresolved required fields
 * block "valid" classification but only fail the gate when systematic.
 */
export function evaluateFinalValidationGate(rows: MaterialListRow[]): {
  passed: boolean;
  reasons: string[];
  unresolvedFieldCount: number;
  missingInSourceFieldCount: number;
} {
  const gate = evaluateQualityGate(rows);
  const unresolvedFieldCount = countResolutionStatus(rows, "UNRESOLVED");
  const missingInSourceFieldCount = countResolutionStatus(
    rows,
    "MISSING_IN_SOURCE"
  );
  const reasons = [...gate.triggerReasons];
  if (gate.shouldRepair) {
    reasons.push("SYSTEMATIC_COLLAPSE_REMAINS_AFTER_REPAIR");
  }
  return {
    passed: !gate.shouldRepair,
    reasons,
    unresolvedFieldCount,
    missingInSourceFieldCount,
  };
}

export function countResolutionStatus(
  rows: MaterialListRow[],
  status: MaterialFieldResolution
): number {
  let n = 0;
  for (const row of rows) {
    const fr = row.fieldResolutions;
    if (!fr) continue;
    for (const field of REPAIRABLE_MATERIAL_FIELDS) {
      if (fr[field] === status) n++;
    }
  }
  return n;
}

export function rowHasUnresolvedRequired(row: MaterialListRow): boolean {
  const fr = row.fieldResolutions;
  if (!fr) return false;
  return REPAIRABLE_MATERIAL_FIELDS.some((f) => fr[f] === "UNRESOLVED");
}
