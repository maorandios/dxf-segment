/**
 * Basic deterministic validation of Simple AI extraction result.
 * Minimal source-copy contract: preserve zero; no weight interpretation; no calculations.
 */

import type {
  SimpleAiWorkbookResult,
  SimpleExtractedRow,
  SimpleWorkbookSnapshot,
} from "./types";

function clampPositive(
  v: number | null | undefined,
  name: string,
  warnings: string[]
): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v) || !(v > 0)) {
    warnings.push(`INVALID_${name}`);
    return null;
  }
  return v;
}

/** Allow zero; reject negatives / non-finite. */
function clampNonnegative(
  v: number | null | undefined,
  name: string,
  warnings: string[]
): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v) || v < 0) {
    warnings.push(`INVALID_${name}`);
    return null;
  }
  return v;
}

export function validateSimpleAiResult(args: {
  snapshot: SimpleWorkbookSnapshot;
  ai: SimpleAiWorkbookResult;
}): {
  ok: boolean;
  rows: SimpleExtractedRow[];
  errorMessage: string | null;
} {
  if (args.ai.status === "NO_RELEVANT_ROWS" || args.ai.status === "UNSUPPORTED") {
    return {
      ok: false,
      rows: [],
      errorMessage:
        args.ai.status === "NO_RELEVANT_ROWS"
          ? "לא נמצאו שורות חומר רלוונטיות בקובץ"
          : "מבנה הקובץ אינו נתמך",
    };
  }

  if (args.ai.status === "SUCCESS" && args.ai.rows.length === 0) {
    return {
      ok: false,
      rows: [],
      errorMessage: "המודל החזיר הצלחה ללא שורות — התוצאה נדחתה",
    };
  }

  const sheetNames = new Set(args.snapshot.sheets.map((s) => s.sheetName));
  const rowKeys = new Set<string>();
  for (const sheet of args.snapshot.sheets) {
    for (const row of sheet.rows) {
      rowKeys.add(`${sheet.sheetName}::${row.rowNumber}`);
    }
  }

  const rows: SimpleExtractedRow[] = [];
  for (const r of args.ai.rows) {
    const warnings: string[] = [];
    if (!sheetNames.has(r.sheetName)) {
      warnings.push("SHEET_NOT_FOUND");
    }
    if (!rowKeys.has(`${r.sheetName}::${r.sourceRow}`)) {
      warnings.push("SOURCE_ROW_NOT_FOUND");
    }

    let quantity = r.quantity;
    if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
      warnings.push("INVALID_QUANTITY");
      quantity = null;
    }

    const sourceAreaM2 = clampNonnegative(
      r.sourceAreaM2 ?? null,
      "SOURCE_AREA",
      warnings
    );
    const sourceWeightKg = clampNonnegative(
      r.sourceWeightKg ?? null,
      "SOURCE_WEIGHT",
      warnings
    );

    let confidence = r.confidence;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      warnings.push("INVALID_CONFIDENCE");
      confidence = Math.min(
        1,
        Math.max(0, Number.isFinite(confidence) ? confidence : 0)
      );
    }

    const material =
      r.material == null
        ? null
        : String(r.material).trim() === ""
          ? null
          : String(r.material).trim();

    rows.push({
      rowId: r.rowId,
      sheetName: r.sheetName,
      sourceRow: r.sourceRow,
      sourceCell: r.sourceCell,
      partId: r.partId == null || String(r.partId).trim() === "" ? null : r.partId,
      profile: r.profile,
      description: r.description,
      quantity,
      material,
      thicknessMm: clampPositive(r.thicknessMm, "THICKNESS", warnings),
      widthMm: clampPositive(r.widthMm, "WIDTH", warnings),
      lengthMm: clampPositive(r.lengthMm, "LENGTH", warnings),
      dxfFileName: null,
      sourceAreaM2,
      sourceWeightKg,
      confidence,
      note: r.note,
      warnings,
    });
  }

  return { ok: true, rows, errorMessage: null };
}

export type MissingExplicitFieldDiagnostic = {
  rowId: string;
  sheetName: string;
  sourceRow: number;
  field: "lengthMm" | "sourceWeightKg" | "sourceAreaM2" | "material" | "quantity";
  sourceText: string;
};

/**
 * Lightweight snapshot text sanity check for debug/testing only.
 * Does not modify extracted values. Does not parse columns as a workbook engine.
 */
export function buildMissingExplicitFieldDiagnostics(
  snapshot: SimpleWorkbookSnapshot,
  rows: SimpleExtractedRow[]
): MissingExplicitFieldDiagnostic[] {
  const out: MissingExplicitFieldDiagnostic[] = [];

  for (const row of rows) {
    const sheet = snapshot.sheets.find((s) => s.sheetName === row.sheetName);
    if (!sheet) continue;
    const sourceRow = sheet.rows.find((r) => r.rowNumber === row.sourceRow);
    if (!sourceRow) continue;

    const headerCandidates = sheet.rows.filter(
      (r) => r.rowNumber < row.sourceRow && r.rowNumber >= row.sourceRow - 5
    );

    const colLetter = (address: string): string =>
      address.replace(/[0-9]+$/g, "").toUpperCase();

    const labeledCols = new Map<string, string>();
    for (const hr of headerCandidates) {
      for (const cell of hr.cells) {
        const t = cell.text.trim().toLowerCase();
        const col = colLetter(cell.address);
        if (/^length$|^len$|אורך/.test(t)) labeledCols.set(col, "lengthMm");
        else if (/^weight$|^wt$|משקל/.test(t))
          labeledCols.set(col, "sourceWeightKg");
        else if (/^area$|שטח/.test(t)) labeledCols.set(col, "sourceAreaM2");
        else if (/^qty$|^quantity$|כמות/.test(t))
          labeledCols.set(col, "quantity");
        else if (/^material$|^grade$|חומר|פלדה/.test(t))
          labeledCols.set(col, "material");
      }
    }

    for (const cell of sourceRow.cells) {
      const field = labeledCols.get(colLetter(cell.address));
      if (!field) continue;
      const text = cell.text.trim();
      if (text === "") continue;

      if (field === "lengthMm" && row.lengthMm == null) {
        const n = Number(text.replace(",", "."));
        if (Number.isFinite(n) && n > 0) {
          out.push({
            rowId: row.rowId,
            sheetName: row.sheetName,
            sourceRow: row.sourceRow,
            field: "lengthMm",
            sourceText: text,
          });
        }
      } else if (field === "sourceWeightKg" && row.sourceWeightKg == null) {
        const n = Number(text.replace(",", "."));
        if (Number.isFinite(n) && n >= 0) {
          out.push({
            rowId: row.rowId,
            sheetName: row.sheetName,
            sourceRow: row.sourceRow,
            field: "sourceWeightKg",
            sourceText: text,
          });
        }
      } else if (field === "sourceAreaM2" && row.sourceAreaM2 == null) {
        const n = Number(text.replace(",", "."));
        if (Number.isFinite(n) && n >= 0) {
          out.push({
            rowId: row.rowId,
            sheetName: row.sheetName,
            sourceRow: row.sourceRow,
            field: "sourceAreaM2",
            sourceText: text,
          });
        }
      } else if (field === "quantity" && row.quantity == null) {
        const n = Number(text.replace(",", "."));
        if (Number.isFinite(n) && n > 0) {
          out.push({
            rowId: row.rowId,
            sheetName: row.sheetName,
            sourceRow: row.sourceRow,
            field: "quantity",
            sourceText: text,
          });
        }
      } else if (field === "material" && row.material == null) {
        out.push({
          rowId: row.rowId,
          sheetName: row.sheetName,
          sourceRow: row.sourceRow,
          field: "material",
          sourceText: text,
        });
      }
    }
  }

  return out;
}

/** Build source-field fidelity summary for debug (from validated rows). */
export function buildSourceFieldSummary(rows: SimpleExtractedRow[]): {
  rowCount: number;
  rowsWithPartId: number;
  rowsWithProfile: number;
  rowsWithMaterial: number;
  rowsWithQuantity: number;
  rowsWithLength: number;
  rowsWithArea: number;
  rowsWithZeroArea: number;
  rowsWithSourceWeight: number;
  rowsWithZeroSourceWeight: number;
} {
  return {
    rowCount: rows.length,
    rowsWithPartId: rows.filter((r) => r.partId != null).length,
    rowsWithProfile: rows.filter((r) => r.profile != null).length,
    rowsWithMaterial: rows.filter((r) => r.material != null).length,
    rowsWithQuantity: rows.filter((r) => r.quantity != null).length,
    rowsWithLength: rows.filter((r) => r.lengthMm != null).length,
    rowsWithArea: rows.filter((r) => r.sourceAreaM2 != null).length,
    rowsWithZeroArea: rows.filter((r) => r.sourceAreaM2 === 0).length,
    rowsWithSourceWeight: rows.filter((r) => r.sourceWeightKg != null).length,
    rowsWithZeroSourceWeight: rows.filter((r) => r.sourceWeightKg === 0)
      .length,
  };
}
