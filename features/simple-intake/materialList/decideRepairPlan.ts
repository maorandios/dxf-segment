/**
 * Decide whether to run targeted repair (systematic collapse or selective gaps).
 * At most one repair call per workbook.
 */

import { selectRowsNeedingRepair } from "./buildRepairContext";
import {
  evaluateQualityGate,
  hasExactProvenance,
  isFieldUsable,
} from "./qualityGate";
import { REPAIRABLE_MATERIAL_FIELDS } from "./qualityGateConfig";
import type { MaterialListRow, RepairableMaterialField } from "./types";

export type RepairTriggerType =
  | "NONE"
  | "SYSTEMATIC_COLLAPSE"
  | "SELECTIVE_MISSING_FIELDS";

export type RepairPlan = {
  triggerType: RepairTriggerType;
  repairFields: RepairableMaterialField[];
  /** Rows with exact provenance that need at least one requested field. */
  affectedRows: MaterialListRow[];
  reasons: string[];
};

/**
 * Fields that are missing/unusable on a row and not already classified
 * as MISSING_IN_SOURCE (those are genuine empties after a prior repair).
 */
export function missingRepairableFields(
  row: MaterialListRow
): RepairableMaterialField[] {
  const out: RepairableMaterialField[] = [];
  for (const field of REPAIRABLE_MATERIAL_FIELDS) {
    if (isFieldUsable(field, row)) continue;
    if (row.fieldResolutions?.[field] === "MISSING_IN_SOURCE") continue;
    out.push(field);
  }
  return out;
}

export function decideRepairPlan(rows: MaterialListRow[]): RepairPlan {
  const gate = evaluateQualityGate(rows);

  if (gate.shouldRepair && gate.repairFields.length > 0) {
    const affectedRows = selectRowsNeedingRepair(rows, gate.repairFields);
    return {
      triggerType: "SYSTEMATIC_COLLAPSE",
      repairFields: gate.repairFields,
      affectedRows,
      reasons: gate.triggerReasons,
    };
  }

  // Selective: any provenance-backed row with missing/unresolved required fields.
  const fieldSet = new Set<RepairableMaterialField>();
  const affected: MaterialListRow[] = [];
  for (const row of rows) {
    if (!hasExactProvenance(row)) continue;
    const missing = missingRepairableFields(row);
    if (missing.length === 0) continue;
    affected.push(row);
    for (const f of missing) fieldSet.add(f);
  }

  if (affected.length === 0 || fieldSet.size === 0) {
    return {
      triggerType: "NONE",
      repairFields: [],
      affectedRows: [],
      reasons: [],
    };
  }

  const repairFields = REPAIRABLE_MATERIAL_FIELDS.filter((f) =>
    fieldSet.has(f)
  );
  return {
    triggerType: "SELECTIVE_MISSING_FIELDS",
    repairFields,
    affectedRows: affected,
    reasons: [
      `SELECTIVE_MISSING_FIELDS:rows=${affected.length}:fields=${repairFields.join(",")}`,
    ],
  };
}
