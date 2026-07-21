/**
 * Merge targeted repair results into canonical material-list rows.
 * Merge key: normalized sheetName + exact sourceRow only.
 */

import { deriveApprovalStatus } from "./completeness";
import { isFieldUsable, normalizeSheetName, provenanceKey } from "./qualityGate";
import {
  isSemanticallyValidMaterial,
  validateExactMaterialRepair,
  type MaterialExactRejectReason,
  type MaterialRepairSourceContext,
} from "./materialValidation";
import type {
  MaterialFieldResolution,
  MaterialListFieldResolutions,
  MaterialListRow,
  RepairableMaterialField,
} from "./types";
import type { TargetedMaterialRepairResult } from "./repairSchema";
import { REPAIRABLE_MATERIAL_FIELDS } from "./qualityGateConfig";

export type MaterialRejectReasonDebug = {
  sheetName: string;
  sourceRow: number;
  field: "material";
  value: string | null;
  reason: MaterialExactRejectReason;
};

export type MergeRepairStats = {
  exactValuesReturned: number;
  exactValuesMerged: number;
  rejectedExactValues: number;
  rejectedReasons: MaterialRejectReasonDebug[];
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

/**
 * Clear semantically invalid primary materials (e.g. profile copies) so they
 * do not count as complete grades. Does not invent replacements.
 */
export function initializePrimaryFieldResolutions(
  rows: MaterialListRow[]
): MaterialListRow[] {
  return rows.map((row) => {
    let next = row;
    if (
      row.material != null &&
      row.material.trim() !== "" &&
      !isSemanticallyValidMaterial(row.material, row)
    ) {
      next = { ...row, material: null };
    }
    const withResolutions = {
      ...next,
      fieldResolutions: primaryResolutions(next),
    };
    return {
      ...withResolutions,
      approvalStatus: deriveApprovalStatus(withResolutions),
    };
  });
}

function sourceContextKey(
  sheetName: string | null,
  sourceRow: number
): string | null {
  return provenanceKey(sheetName, sourceRow);
}

export function mergeTargetedRepair(args: {
  rows: MaterialListRow[];
  repair: TargetedMaterialRepairResult;
  repairFields: RepairableMaterialField[];
  sourceContexts?: MaterialRepairSourceContext[];
}): { rows: MaterialListRow[]; stats: MergeRepairStats } {
  const stats: MergeRepairStats = {
    exactValuesReturned: 0,
    exactValuesMerged: 0,
    rejectedExactValues: 0,
    rejectedReasons: [],
    unresolvedValues: 0,
    missingInSourceValues: 0,
    skippedNoMatch: 0,
    skippedAmbiguousMatch: 0,
    skippedInvalidValue: 0,
    skippedWouldOverwriteValid: 0,
  };

  const contextByKey = new Map<string, MaterialRepairSourceContext>();
  for (const ctx of args.sourceContexts ?? []) {
    const key = sourceContextKey(ctx.sheetName, ctx.sourceRow);
    if (key) contextByKey.set(key, ctx);
  }

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
    const sourceContext = contextByKey.get(key) ?? null;

    if (
      repaired.sourceCell &&
      primary.sourceCell &&
      repaired.sourceCell.trim() !== primary.sourceCell.trim()
    ) {
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
      if (entry == null) continue;

      if (entry.status === "EXACT") {
        stats.exactValuesReturned++;
      }

      if (entry.status === "UNRESOLVED") {
        next = {
          ...next,
          ...(field === "material" ? { material: null } : {}),
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
          ...(field === "material" ? { material: null } : {}),
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
        const materialEntry = entry as {
          value: string | null;
          status: "EXACT";
          evidenceText: string | null;
          evidenceSourceRow: number | null;
        };
        const rejectReason = validateExactMaterialRepair({
          value: materialEntry.value,
          evidenceText: materialEntry.evidenceText,
          evidenceSourceRow: materialEntry.evidenceSourceRow,
          row: next,
          sourceContext,
        });
        if (rejectReason) {
          stats.rejectedExactValues++;
          stats.rejectedReasons.push({
            sheetName: next.sheetName ?? "",
            sourceRow: next.sourceRow ?? repaired.sourceRow,
            field: "material",
            value: materialEntry.value,
            reason: rejectReason,
          });
          if (isFieldUsable("material", next)) {
            stats.skippedWouldOverwriteValid++;
            continue;
          }
          // Blank own-row with rejected EXACT → genuine missing, not unresolved guess.
          const ownText = sourceContext?.sourceRowText ?? "";
          const treatAsMissing =
            !/\b(S\d{2,4}[A-Z]?|A\d{2,3}|ST\d+|Q\d+)\b/i.test(ownText);
          const resolution: MaterialFieldResolution = treatAsMissing
            ? "MISSING_IN_SOURCE"
            : "UNRESOLVED";
          next = {
            ...next,
            material: null,
            fieldResolutions: {
              ...next.fieldResolutions,
              material: resolution,
            },
          };
          if (treatAsMissing) stats.missingInSourceValues++;
          else stats.unresolvedValues++;
          changed = true;
          continue;
        }

        const v = validateRepairString(materialEntry.value);
        if (v == null || !isSemanticallyValidMaterial(v, next)) {
          stats.rejectedExactValues++;
          stats.rejectedReasons.push({
            sheetName: next.sheetName ?? "",
            sourceRow: next.sourceRow ?? repaired.sourceRow,
            field: "material",
            value: materialEntry.value,
            reason: "INVALID_VALUE",
          });
          const ownText = sourceContext?.sourceRowText ?? "";
          const treatAsMissing =
            !/\b(S\d{2,4}[A-Z]?|A\d{2,3}|ST\d+|Q\d+)\b/i.test(ownText);
          const resolution: MaterialFieldResolution = treatAsMissing
            ? "MISSING_IN_SOURCE"
            : "UNRESOLVED";
          next = {
            ...next,
            material: null,
            fieldResolutions: {
              ...next.fieldResolutions,
              material: resolution,
            },
          };
          if (treatAsMissing) stats.missingInSourceValues++;
          else stats.unresolvedValues++;
          changed = true;
          continue;
        }
        if (isFieldUsable("material", next)) {
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
