/**
 * Merge targeted repair results into canonical material-list rows.
 * Merge key: normalized sheetName + exact sourceRow only.
 */

import { deriveApprovalStatus } from "./completeness";
import { isFieldUsable, normalizeSheetName, provenanceKey } from "./qualityGate";
import type {
  MaterialFieldResolution,
  MaterialListFieldResolutions,
  MaterialListRow,
  RepairableMaterialField,
} from "./types";
import type { TargetedMaterialRepairResult } from "./repairSchema";
import { REPAIRABLE_MATERIAL_FIELDS } from "./qualityGateConfig";

export type MergeRepairStats = {
  exactValuesMerged: number;
  unresolvedValues: number;
  missingInSourceValues: number;
  skippedNoMatch: number;
  skippedAmbiguousMatch: number;
  skippedInvalidValue: number;
  skippedWouldOverwriteValid: number;
};

function validateRepairString(value: string | null): string | null {
  if (value == null) return null;
  const t = value.trim();
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

function primaryResolutions(row: MaterialListRow): MaterialListFieldResolutions {
  const fr: MaterialListFieldResolutions = { ...row.fieldResolutions };
  for (const field of REPAIRABLE_MATERIAL_FIELDS) {
    if (fr[field]) continue;
    if (isFieldUsable(field, row)) {
      fr[field] = "EXACT_PRIMARY";
    }
  }
  return fr;
}

export function initializePrimaryFieldResolutions(
  rows: MaterialListRow[]
): MaterialListRow[] {
  return rows.map((row) => ({
    ...row,
    fieldResolutions: primaryResolutions(row),
  }));
}

export function mergeTargetedRepair(args: {
  rows: MaterialListRow[];
  repair: TargetedMaterialRepairResult;
  repairFields: RepairableMaterialField[];
}): { rows: MaterialListRow[]; stats: MergeRepairStats } {
  const stats: MergeRepairStats = {
    exactValuesMerged: 0,
    unresolvedValues: 0,
    missingInSourceValues: 0,
    skippedNoMatch: 0,
    skippedAmbiguousMatch: 0,
    skippedInvalidValue: 0,
    skippedWouldOverwriteValid: 0,
  };

  const byKey = new Map<string, MaterialListRow[]>();
  for (const row of args.rows) {
    const key = provenanceKey(row.sheetName, row.sourceRow);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const updates = new Map<string, MaterialListRow>();

  for (const repaired of args.repair.rows) {
    const key = provenanceKey(repaired.sheetName, repaired.sourceRow);
    if (!key) {
      stats.skippedNoMatch++;
      continue;
    }
    const matches = byKey.get(key) ?? [];
    if (matches.length === 0) {
      stats.skippedNoMatch++;
      continue;
    }
    if (matches.length !== 1) {
      stats.skippedAmbiguousMatch++;
      continue;
    }
    const primary = matches[0]!;

    if (
      repaired.sourceCell &&
      primary.sourceCell &&
      repaired.sourceCell.trim() !== primary.sourceCell.trim()
    ) {
      // Consistency check failed — do not merge this row's fields.
      stats.skippedNoMatch++;
      continue;
    }

    let next: MaterialListRow = {
      ...primary,
      fieldResolutions: { ...primary.fieldResolutions },
    };
    let changed = false;

    for (const field of args.repairFields) {
      const entry = repaired.fields[field];
      if (!entry) continue;

      if (entry.status === "UNRESOLVED") {
        next = {
          ...next,
          fieldResolutions: {
            ...next.fieldResolutions,
            [field]: "UNRESOLVED" as MaterialFieldResolution,
          },
        };
        stats.unresolvedValues++;
        changed = true;
        continue;
      }

      if (entry.status === "MISSING_IN_SOURCE") {
        if (isFieldUsable(field, next)) {
          stats.skippedWouldOverwriteValid++;
          continue;
        }
        next = {
          ...next,
          fieldResolutions: {
            ...next.fieldResolutions,
            [field]: "MISSING_IN_SOURCE",
          },
        };
        stats.missingInSourceValues++;
        changed = true;
        continue;
      }

      // EXACT
      if (field === "material") {
        const v = validateRepairString(
          typeof entry.value === "string" || entry.value == null
            ? entry.value
            : String(entry.value)
        );
        if (v == null) {
          stats.skippedInvalidValue++;
          continue;
        }
        if (isFieldUsable(field, next)) {
          stats.skippedWouldOverwriteValid++;
          continue;
        }
        next = {
          ...next,
          material: v,
          fieldResolutions: {
            ...next.fieldResolutions,
            material: "EXACT_REPAIR",
          },
        };
        stats.exactValuesMerged++;
        changed = true;
        continue;
      }

      const num = validateRepairNumber(
        field,
        typeof entry.value === "number" ? entry.value : null
      );
      if (num == null) {
        stats.skippedInvalidValue++;
        continue;
      }
      if (isFieldUsable(field, next)) {
        stats.skippedWouldOverwriteValid++;
        continue;
      }
      next = {
        ...next,
        [field]: num,
        fieldResolutions: {
          ...next.fieldResolutions,
          [field]: "EXACT_REPAIR",
        },
      };
      stats.exactValuesMerged++;
      changed = true;
    }

    if (changed) {
      next = {
        ...next,
        approvalStatus: deriveApprovalStatus(next),
      };
      updates.set(primary.rowId, next);
    }
  }

  const rows = args.rows.map((r) => updates.get(r.rowId) ?? r);
  return { rows, stats };
}

export function sheetNamesEqual(
  a: string | null,
  b: string | null
): boolean {
  if (a == null || b == null) return a === b;
  return normalizeSheetName(a) === normalizeSheetName(b);
}
