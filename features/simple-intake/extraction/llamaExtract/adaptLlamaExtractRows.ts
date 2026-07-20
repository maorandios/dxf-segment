/**
 * Adapt LlamaExtract v2 per_table_row results into Simple Intake AI rows.
 */

import type { SimpleAiRow } from "../../types";
import {
  llamaMaterialRowSchema,
  type LlamaMaterialRow,
} from "./schema";

export type LlamaSourceCoverage = {
  totalRows: number;
  rowsWithSheetName: number;
  rowsWithExactSourceRow: number;
  rowsWithExactSourceCell: number;
  rowsWithCitation: number;
};

export type LlamaAdaptDiagnostics = {
  rawEntityCount: number;
  validatedRowCount: number;
  invalidRowCount: number;
  provenanceFallbackCount: number;
  duplicateConflicts: Array<{
    sheetName: string;
    sourceRow: number;
    reason: string;
  }>;
  exactDuplicatesRemoved: number;
  sourceCoverage: LlamaSourceCoverage;
  rowCitations: Array<{ rowId: string; citations: unknown }>;
  confidenceMappedCount: number;
  confidenceUnknownCount: number;
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

/** Dimensions must be >0 for the shared AI row contract; treat 0/negative as absent. */
function asPositiveMm(v: unknown): number | null {
  const n = asFiniteNumber(v);
  if (n == null || n <= 0) return null;
  return n;
}

function normalizeSheetKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sheet";
}

function extractEntities(result: unknown): unknown[] {
  if (result == null) return [];
  if (Array.isArray(result)) return result;
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    // Some responses wrap rows
    for (const key of ["rows", "items", "entities", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // Single object — treat as one entity only if it looks like a row
    if ("profile" in obj || "quantity" in obj || "sourceRow" in obj) {
      return [obj];
    }
  }
  return [];
}

function pickCitations(
  entity: unknown,
  metadata: unknown,
  index: number
): unknown {
  if (entity && typeof entity === "object") {
    const e = entity as Record<string, unknown>;
    if (e.citations != null) return e.citations;
    if (e.citation != null) return e.citation;
    if (e.sources != null) return e.sources;
  }
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    const fieldMeta = m.field_metadata as
      | { row_metadata?: unknown[] }
      | undefined;
    const rows = fieldMeta?.row_metadata;
    if (Array.isArray(rows) && rows[index] != null) return rows[index];
  }
  return null;
}

function averageConfidence(entity: unknown, metadata: unknown, index: number): {
  value: number | null;
  mapped: boolean;
} {
  if (entity && typeof entity === "object") {
    const e = entity as Record<string, unknown>;
    const c = asFiniteNumber(e.confidence);
    if (c != null && c >= 0 && c <= 1) return { value: c, mapped: true };
    if (c != null && c > 1 && c <= 100) return { value: c / 100, mapped: true };
  }
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    const fieldMeta = m.field_metadata as Record<string, unknown> | undefined;
    const rowMeta = (fieldMeta?.row_metadata as unknown[] | undefined)?.[index];
    if (rowMeta && typeof rowMeta === "object") {
      const scores: number[] = [];
      for (const v of Object.values(rowMeta as Record<string, unknown>)) {
        if (v && typeof v === "object" && "confidence" in v) {
          const c = asFiniteNumber((v as { confidence?: unknown }).confidence);
          if (c != null) scores.push(c > 1 ? c / 100 : c);
        }
      }
      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return { value: Math.min(1, Math.max(0, avg)), mapped: true };
      }
    }
  }
  return { value: null, mapped: false };
}

export function adaptLlamaExtractRows(
  result: unknown,
  metadata: unknown
): {
  rows: SimpleAiRow[];
  diagnostics: LlamaAdaptDiagnostics;
  conflictFatal: boolean;
} {
  const entities = extractEntities(result);
  const warnings: string[] = [];
  const parsedRows: Array<{
    raw: LlamaMaterialRow;
    citations: unknown;
    confidence: number | null;
    confidenceMapped: boolean;
    resultIndex: number;
  }> = [];
  let invalidRowCount = 0;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    // Strip metadata wrapper keys that are not schema fields
    const candidate =
      entity && typeof entity === "object"
        ? Object.fromEntries(
            Object.entries(entity as Record<string, unknown>).filter(
              ([k]) =>
                ![
                  "confidence",
                  "citations",
                  "citation",
                  "sources",
                  "extraction_confidence",
                ].includes(k)
            )
          )
        : entity;
    const parsed = llamaMaterialRowSchema.safeParse({
      sheetName: trimStr((candidate as LlamaMaterialRow)?.sheetName),
      sourceRow: asFiniteNumber((candidate as LlamaMaterialRow)?.sourceRow),
      sourceCell: trimStr((candidate as LlamaMaterialRow)?.sourceCell),
      partId: trimStr((candidate as LlamaMaterialRow)?.partId),
      profile: trimStr((candidate as LlamaMaterialRow)?.profile),
      description: trimStr((candidate as LlamaMaterialRow)?.description),
      quantity: asFiniteNumber((candidate as LlamaMaterialRow)?.quantity),
      material: trimStr((candidate as LlamaMaterialRow)?.material),
      thicknessMm: asPositiveMm((candidate as LlamaMaterialRow)?.thicknessMm),
      widthMm: asPositiveMm((candidate as LlamaMaterialRow)?.widthMm),
      lengthMm: asPositiveMm((candidate as LlamaMaterialRow)?.lengthMm),
      sourceAreaM2: asFiniteNumber((candidate as LlamaMaterialRow)?.sourceAreaM2),
      sourceWeightKg: asFiniteNumber(
        (candidate as LlamaMaterialRow)?.sourceWeightKg
      ),
    });
    if (!parsed.success) {
      invalidRowCount++;
      warnings.push(`INVALID_ENTITY_${i}`);
      continue;
    }
    const conf = averageConfidence(entity, metadata, i);
    parsedRows.push({
      raw: parsed.data,
      citations: pickCitations(entity, metadata, i),
      confidence: conf.value,
      confidenceMapped: conf.mapped,
      resultIndex: i,
    });
  }

  // Exact provenance duplicate / conflict handling
  const byProvenance = new Map<string, typeof parsedRows>();
  const exactDuplicatesRemoved: typeof parsedRows = [];
  const duplicateConflicts: LlamaAdaptDiagnostics["duplicateConflicts"] = [];

  for (const row of parsedRows) {
    const sheet = row.raw.sheetName;
    const src = row.raw.sourceRow;
    if (sheet == null || src == null) continue;
    const key = `${sheet}::${src}`;
    const list = byProvenance.get(key) ?? [];
    list.push(row);
    byProvenance.set(key, list);
  }

  const keep = new Set(parsedRows);
  for (const [key, list] of byProvenance) {
    if (list.length < 2) continue;
    const [sheetName, sourceRowStr] = key.split("::");
    const sourceRow = Number(sourceRowStr);
    const fingerprints = list.map((r) =>
      JSON.stringify({
        partId: r.raw.partId,
        profile: r.raw.profile,
        quantity: r.raw.quantity,
        material: r.raw.material,
        thicknessMm: r.raw.thicknessMm,
        widthMm: r.raw.widthMm,
        lengthMm: r.raw.lengthMm,
        sourceAreaM2: r.raw.sourceAreaM2,
        sourceWeightKg: r.raw.sourceWeightKg,
      })
    );
    const unique = new Set(fingerprints);
    if (unique.size === 1) {
      // literal duplicates — keep first
      for (let i = 1; i < list.length; i++) {
        keep.delete(list[i]!);
        exactDuplicatesRemoved.push(list[i]!);
      }
    } else {
      duplicateConflicts.push({
        sheetName: sheetName!,
        sourceRow,
        reason: "CONFLICTING_VALUES_SAME_SOURCE_ROW",
      });
    }
  }

  const conflictFatal = duplicateConflicts.length > 0;
  let provenanceFallbackCount = 0;
  let confidenceMappedCount = 0;
  let confidenceUnknownCount = 0;
  const rowCitations: LlamaAdaptDiagnostics["rowCitations"] = [];
  const rows: SimpleAiRow[] = [];

  let sheetIndex = 0;
  const sheetIndexByName = new Map<string, number>();

  for (const item of parsedRows) {
    if (!keep.has(item)) continue;
    const r = item.raw;
    const sheetName = r.sheetName ?? "UNKNOWN";
    let sourceRow = r.sourceRow;
    let note: string | null = null;

    if (sourceRow == null) {
      provenanceFallbackCount++;
      if (!sheetIndexByName.has(sheetName)) {
        sheetIndexByName.set(sheetName, sheetIndex++);
      }
      const si = sheetIndexByName.get(sheetName)!;
      sourceRow = item.resultIndex + 1;
      note = `PROVENANCE_FALLBACK:llama-${si}-${item.resultIndex}`;
      warnings.push(note);
    }

    const rowId =
      r.sheetName != null && r.sourceRow != null
        ? `${normalizeSheetKey(r.sheetName)}-${r.sourceRow}`
        : `llama-${sheetIndexByName.get(sheetName) ?? 0}-${item.resultIndex}`;

    let confidence = 0;
    if (item.confidenceMapped && item.confidence != null) {
      confidence = item.confidence;
      confidenceMappedCount++;
    } else {
      confidenceUnknownCount++;
      note = note
        ? `${note};CONFIDENCE_UNKNOWN`
        : "CONFIDENCE_UNKNOWN";
    }

    rows.push({
      rowId,
      sheetName,
      sourceRow,
      sourceCell: r.sourceCell,
      partId: r.partId,
      profile: r.profile,
      description: r.description,
      quantity: r.quantity,
      material: r.material,
      thicknessMm: r.thicknessMm,
      widthMm: r.widthMm,
      lengthMm: r.lengthMm,
      sourceAreaM2: r.sourceAreaM2,
      sourceWeightKg: r.sourceWeightKg,
      confidence,
      note,
    });

    if (item.citations != null) {
      rowCitations.push({ rowId, citations: item.citations });
    }
  }

  const sourceCoverage: LlamaSourceCoverage = {
    totalRows: rows.length,
    rowsWithSheetName: rows.filter((r) => r.sheetName !== "UNKNOWN").length,
    rowsWithExactSourceRow: rows.filter(
      (r) => !(r.note ?? "").includes("PROVENANCE_FALLBACK")
    ).length,
    rowsWithExactSourceCell: rows.filter((r) => r.sourceCell != null).length,
    rowsWithCitation: rowCitations.length,
  };

  return {
    rows,
    conflictFatal,
    diagnostics: {
      rawEntityCount: entities.length,
      validatedRowCount: rows.length,
      invalidRowCount,
      provenanceFallbackCount,
      duplicateConflicts,
      exactDuplicatesRemoved: exactDuplicatesRemoved.length,
      sourceCoverage,
      rowCitations,
      confidenceMappedCount,
      confidenceUnknownCount,
      warnings,
    },
  };
}
