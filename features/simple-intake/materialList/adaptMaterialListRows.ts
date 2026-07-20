/**
 * Adapt AI material-list Structured Output into canonical MaterialListRow[].
 */

import { deriveApprovalStatus } from "./completeness";
import { aiMaterialListRowSchema } from "./schema";
import type {
  AiMaterialListRow,
  MaterialListRow,
  MaterialListStageDebug,
} from "./types";

export type MaterialListAdaptDiagnostics = {
  rawEntityCount: number;
  validatedRowCount: number;
  invalidRowCount: number;
  duplicateRowsRemoved: number;
  provenanceFallbackCount: number;
  provenanceConflicts: Array<{
    sheetName: string | null;
    sourceRow: number | null;
    reason: string;
  }>;
  warnings: string[];
};

function trimStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function asFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeSheetKey(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sheet"
  );
}

function fingerprint(row: AiMaterialListRow): string {
  return JSON.stringify({
    sheetName: row.sheetName,
    sourceRow: row.sourceRow,
    partId: row.partId,
    profile: row.profile,
    material: row.material,
    thicknessMm: row.thicknessMm,
    quantity: row.quantity,
    widthMm: row.widthMm,
    lengthMm: row.lengthMm,
  });
}

function extractEntities(result: unknown): unknown[] {
  if (result == null) return [];
  if (Array.isArray(result)) return result;
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows;
  }
  return [];
}

export function adaptMaterialListRows(result: unknown): {
  rows: MaterialListRow[];
  diagnostics: MaterialListAdaptDiagnostics;
} {
  const entities = extractEntities(result);
  const warnings: string[] = [];
  let invalidRowCount = 0;
  const parsed: AiMaterialListRow[] = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const candidate =
      entity && typeof entity === "object"
        ? (entity as Record<string, unknown>)
        : {};
    const shaped = {
      sheetName: trimStr(candidate.sheetName),
      sourceRow: asFiniteNumber(candidate.sourceRow),
      sourceCell: trimStr(candidate.sourceCell),
      partId: trimStr(candidate.partId),
      profile: trimStr(candidate.profile),
      description: trimStr(candidate.description),
      material: trimStr(candidate.material),
      thicknessMm: asFiniteNumber(candidate.thicknessMm),
      quantity: asFiniteNumber(candidate.quantity),
      widthMm: asFiniteNumber(candidate.widthMm),
      lengthMm: asFiniteNumber(candidate.lengthMm),
    };
    const sourceRow =
      shaped.sourceRow != null &&
      Number.isInteger(shaped.sourceRow) &&
      shaped.sourceRow > 0
        ? shaped.sourceRow
        : null;
    const checked = aiMaterialListRowSchema.safeParse({
      ...shaped,
      sourceRow,
    });
    if (!checked.success) {
      invalidRowCount++;
      warnings.push(`INVALID_ENTITY_${i}`);
      continue;
    }
    parsed.push(checked.data);
  }

  const provenanceConflicts: MaterialListAdaptDiagnostics["provenanceConflicts"] =
    [];
  const byProvenance = new Map<string, AiMaterialListRow[]>();
  for (const row of parsed) {
    if (row.sheetName == null || row.sourceRow == null) continue;
    const key = `${row.sheetName}::${row.sourceRow}`;
    const list = byProvenance.get(key) ?? [];
    list.push(row);
    byProvenance.set(key, list);
  }

  const keep = new Set(parsed);
  let duplicateRowsRemoved = 0;
  for (const [key, list] of byProvenance) {
    if (list.length < 2) continue;
    const fps = list.map(fingerprint);
    const unique = new Set(fps);
    if (unique.size === 1) {
      for (let i = 1; i < list.length; i++) {
        keep.delete(list[i]!);
        duplicateRowsRemoved++;
      }
    } else {
      const [sheetName, sourceRowStr] = key.split("::");
      provenanceConflicts.push({
        sheetName: sheetName ?? null,
        sourceRow: Number(sourceRowStr),
        reason: "CONFLICTING_VALUES_SAME_SOURCE_ROW",
      });
    }
  }

  const ordered = parsed.filter((r) => keep.has(r));
  let provenanceFallbackCount = 0;
  const rows: MaterialListRow[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i]!;
    let rowId: string;
    if (r.sheetName != null && r.sourceRow != null) {
      rowId = `${normalizeSheetKey(r.sheetName)}-${r.sourceRow}`;
    } else {
      rowId = `material-row-${i}`;
      provenanceFallbackCount++;
      warnings.push(`PROVENANCE_FALLBACK_${i}`);
    }
    const base: MaterialListRow = {
      rowId,
      sheetName: r.sheetName,
      sourceRow: r.sourceRow,
      sourceCell: r.sourceCell,
      partId: r.partId,
      profile: r.profile,
      description: r.description,
      material: r.material,
      thicknessMm: r.thicknessMm,
      quantity: r.quantity,
      widthMm: r.widthMm,
      lengthMm: r.lengthMm,
      userOverrides: {},
      approvalStatus: "NEEDS_COMPLETION",
    };
    rows.push({
      ...base,
      approvalStatus: deriveApprovalStatus(base),
    });
  }

  return {
    rows,
    diagnostics: {
      rawEntityCount: entities.length,
      validatedRowCount: rows.length,
      invalidRowCount,
      duplicateRowsRemoved,
      provenanceFallbackCount,
      provenanceConflicts,
      warnings,
    },
  };
}

export function buildMaterialListStageDebug(args: {
  model: string;
  rows: MaterialListRow[];
  diagnostics: MaterialListAdaptDiagnostics;
}): MaterialListStageDebug {
  const { rows, diagnostics, model } = args;
  let completeRowCount = 0;
  let incompleteRowCount = 0;
  let rowsWithMaterial = 0;
  let rowsWithThickness = 0;
  let rowsWithQuantity = 0;
  let rowsWithWidth = 0;
  let rowsWithLength = 0;
  let rowsWithExactSourceRow = 0;
  let rowsWithExactSourceCell = 0;
  for (const r of rows) {
    if (r.approvalStatus === "COMPLETE") completeRowCount++;
    else incompleteRowCount++;
    if (r.material) rowsWithMaterial++;
    if (r.thicknessMm != null && r.thicknessMm > 0) rowsWithThickness++;
    if (r.quantity != null && r.quantity > 0) rowsWithQuantity++;
    if (r.widthMm != null && r.widthMm > 0) rowsWithWidth++;
    if (r.lengthMm != null && r.lengthMm > 0) rowsWithLength++;
    if (r.sourceRow != null) rowsWithExactSourceRow++;
    if (r.sourceCell) rowsWithExactSourceCell++;
  }
  return {
    provider: "openai",
    model,
    schemaVersion: "material-list-v1",
    extractedRowCount: diagnostics.rawEntityCount,
    validatedRowCount: diagnostics.validatedRowCount,
    completeRowCount,
    incompleteRowCount,
    rowsWithMaterial,
    rowsWithThickness,
    rowsWithQuantity,
    rowsWithWidth,
    rowsWithLength,
    rowsWithExactSourceRow,
    rowsWithExactSourceCell,
    duplicateRowsRemoved: diagnostics.duplicateRowsRemoved,
    provenanceConflicts: diagnostics.provenanceConflicts,
  };
}
