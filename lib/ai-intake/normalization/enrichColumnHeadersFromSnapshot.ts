import { getCell } from "./buildWorkbookSnapshot";
import type {
  AiWorkbookColumnMap,
  AiWorkbookMappingResult,
  AiWorkbookTableMapping,
  WorkbookSnapshot,
} from "./types";

function cellDisplayText(
  formattedText: string | null,
  rawValue: string | number | boolean | null
): string | null {
  if (formattedText != null && formattedText.trim() !== "") {
    return formattedText.trim();
  }
  if (rawValue == null) return null;
  const s = String(rawValue).trim();
  return s.length > 0 ? s : null;
}

/** Extract parenthetical / trailing unit label from header text (not unit normalization). */
export function extractStatedUnitTextFromHeader(
  rawHeaderText: string | null
): string | null {
  if (!rawHeaderText) return null;
  const paren = rawHeaderText.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1]) return paren[1].trim();
  const bracket = rawHeaderText.match(/\[([^\]]+)\]\s*$/);
  if (bracket?.[1]) return bracket[1].trim();
  const spaced = rawHeaderText.match(/\s+(mm2|cm2|m2|mm|cm|m|kg|g|ton|tons)\s*$/i);
  if (spaced?.[1]) return spaced[1];
  return null;
}

function columnLettersFromMap(columns: AiWorkbookColumnMap): string[] {
  const letters = new Set<string>();
  for (const v of Object.values(columns)) {
    if (typeof v === "string" && v.trim()) {
      letters.add(v.trim().toUpperCase());
    }
  }
  return [...letters].sort();
}

function enrichTableHeaders(
  snapshot: WorkbookSnapshot,
  sheetName: string,
  table: AiWorkbookTableMapping
): AiWorkbookTableMapping {
  const headerRows = [...table.headerRowNumbers].sort((a, b) => a - b);
  const letters = new Set<string>([
    ...columnLettersFromMap(table.columns),
    ...table.columnHeaders.map((h) => h.columnLetter.toUpperCase()),
  ]);

  const byLetter = new Map(
    table.columnHeaders.map((h) => [h.columnLetter.toUpperCase(), { ...h }])
  );

  for (const letter of letters) {
    const texts: string[] = [];
    const refs: string[] = [];
    for (const rowNumber of headerRows) {
      const addr = `${letter}${rowNumber}`;
      const cell = getCell(snapshot, sheetName, addr);
      if (!cell) continue;
      const text = cellDisplayText(cell.formattedText, cell.rawValue);
      if (text) {
        texts.push(text);
        refs.push(addr);
      }
    }

    const existing = byLetter.get(letter) ?? {
      columnLetter: letter,
      rawHeaderText: null,
      detectedMeaning: null,
      statedUnitText: null,
    };

    const rawHeaderText =
      texts.length > 0 ? texts.join(" | ") : existing.rawHeaderText;

    const statedUnitText =
      existing.statedUnitText ??
      extractStatedUnitTextFromHeader(rawHeaderText);

    byLetter.set(letter, {
      ...existing,
      columnLetter: letter,
      rawHeaderText,
      statedUnitText,
      headerCellReferences: refs.length > 0 ? refs : existing.headerCellReferences,
    });
  }

  return {
    ...table,
    columnHeaders: [...byLetter.values()].sort((a, b) =>
      a.columnLetter.localeCompare(b.columnLetter)
    ),
  };
}

/**
 * After OpenAI returns table mapping, overwrite rawHeaderText from WorkbookSnapshot cells.
 * Never trusts the model for header cell text.
 */
export function enrichColumnHeadersFromSnapshot(
  snapshot: WorkbookSnapshot,
  mapping: AiWorkbookMappingResult
): AiWorkbookMappingResult {
  return {
    sheets: mapping.sheets.map((sheetMap) => ({
      ...sheetMap,
      tables: sheetMap.tables.map((table) =>
        enrichTableHeaders(snapshot, sheetMap.sheetName, table)
      ),
    })),
  };
}
