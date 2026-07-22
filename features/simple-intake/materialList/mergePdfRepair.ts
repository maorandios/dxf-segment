/**
 * Merge PDF targeted repair by exact repairTargetId only.
 */

import { deriveApprovalStatus } from "./completeness";
import { isFieldUsable } from "./qualityGate";
import {
  isProfileLikeDesignation,
  isSemanticallyValidMaterial,
  type MaterialExactRejectReason,
} from "./materialValidation";
import { REPAIRABLE_MATERIAL_FIELDS } from "./qualityGateConfig";
import type { PdfTargetedRepairResult } from "./pdfRepairSchema";
import type {
  MaterialListFieldResolutions,
  MaterialListRow,
  RepairableMaterialField,
} from "./types";

export type PdfMergeRepairStats = {
  exactValuesReturned: number;
  exactValuesMerged: number;
  rejectedExactValues: number;
  rejectedReasons: Array<{
    repairTargetId: string;
    field: "material";
    value: string | null;
    reason: MaterialExactRejectReason;
  }>;
  unresolvedValues: number;
  missingInSourceValues: number;
  skippedNoMatch: number;
  skippedWouldOverwriteValid: number;
};

function validateRepairString(value: string | number | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t === "" ? null : t;
}

function validateRepairNumber(
  field: RepairableMaterialField,
  value: number | null
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (field === "quantity") {
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  }
  if (value <= 0) return null;
  return value;
}

function rejectMaterial(
  value: string | null,
  row: MaterialListRow
): MaterialExactRejectReason | null {
  if (value == null || value.trim() === "") return "INVALID_VALUE";
  if (isProfileLikeDesignation(value)) return "INVALID_VALUE";
  if (!isSemanticallyValidMaterial(value, row)) {
    const n = value.trim().toLowerCase();
    if ((row.profile ?? "").trim().toLowerCase() === n) return "EQUALS_PROFILE";
    if ((row.partId ?? "").trim().toLowerCase() === n) return "EQUALS_PART_ID";
    if ((row.description ?? "").trim().toLowerCase() === n)
      return "EQUALS_DESCRIPTION";
    return "INVALID_VALUE";
  }
  return null;
}

export function mergePdfTargetedRepair(args: {
  rows: MaterialListRow[];
  repair: PdfTargetedRepairResult;
  repairFields: Array<RepairableMaterialField | "dxfFileName">;
}): { rows: MaterialListRow[]; stats: PdfMergeRepairStats } {
  const byId = new Map(args.rows.map((r) => [r.rowId, r] as const));
  const stats: PdfMergeRepairStats = {
    exactValuesReturned: 0,
    exactValuesMerged: 0,
    rejectedExactValues: 0,
    rejectedReasons: [],
    unresolvedValues: 0,
    missingInSourceValues: 0,
    skippedNoMatch: 0,
    skippedWouldOverwriteValid: 0,
  };

  const nextRows = args.rows.map((r) => ({ ...r }));
  const indexById = new Map(nextRows.map((r, i) => [r.rowId, i] as const));

  for (const repairRow of args.repair.rows) {
    const id = repairRow.repairTargetId?.trim();
    if (!id || !byId.has(id)) {
      stats.skippedNoMatch++;
      continue;
    }
    const idx = indexById.get(id)!;
    let row = { ...nextRows[idx]! };
    const fr: MaterialListFieldResolutions = { ...row.fieldResolutions };

    for (const field of REPAIRABLE_MATERIAL_FIELDS) {
      if (!args.repairFields.includes(field)) continue;
      const entry = repairRow.fields[field];
      if (entry == null) continue;

      if (entry.status === "MISSING_IN_SOURCE") {
        stats.missingInSourceValues++;
        fr[field] = "MISSING_IN_SOURCE";
        continue;
      }
      if (entry.status === "UNRESOLVED") {
        stats.unresolvedValues++;
        fr[field] = "UNRESOLVED";
        continue;
      }

      stats.exactValuesReturned++;
      if (isFieldUsable(field, row)) {
        stats.skippedWouldOverwriteValid++;
        continue;
      }

      if (field === "material") {
        const value = validateRepairString(entry.value);
        const reason = rejectMaterial(value, row);
        if (reason) {
          stats.rejectedExactValues++;
          stats.rejectedReasons.push({
            repairTargetId: id,
            field: "material",
            value,
            reason,
          });
          fr.material = "UNRESOLVED";
          continue;
        }
        row = { ...row, material: value };
        fr.material = "EXACT_REPAIR";
        stats.exactValuesMerged++;
        continue;
      }

      const num = validateRepairNumber(
        field,
        typeof entry.value === "number" ? entry.value : null
      );
      if (num == null) {
        stats.rejectedExactValues++;
        fr[field] = "UNRESOLVED";
        continue;
      }
      row = { ...row, [field]: num };
      fr[field] = "EXACT_REPAIR";
      stats.exactValuesMerged++;
    }

    if (args.repairFields.includes("dxfFileName")) {
      const entry = repairRow.fields.dxfFileName;
      if (entry?.status === "EXACT") {
        const value = validateRepairString(entry.value);
        if (value && !row.dxfFileName) {
          row = { ...row, dxfFileName: value };
          stats.exactValuesReturned++;
          stats.exactValuesMerged++;
        }
      } else if (entry?.status === "MISSING_IN_SOURCE") {
        stats.missingInSourceValues++;
      } else if (entry?.status === "UNRESOLVED") {
        stats.unresolvedValues++;
      }
    }

    const withFr = { ...row, fieldResolutions: fr };
    nextRows[idx] = {
      ...withFr,
      approvalStatus: deriveApprovalStatus(withFr),
    };
  }

  return { rows: nextRows, stats };
}
