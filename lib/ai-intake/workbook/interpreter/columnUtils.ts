/**
 * Deterministic workbook fingerprint + column helpers.
 */

import type { WorkbookSnapshot } from "../../normalization/types";

export function columnLetterToNumber(letter: string): number {
  let n = 0;
  const s = letter.toUpperCase().replace(/[^A-Z]/g, "");
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n;
}

export function columnNumberToLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}

export function fingerprintWorkbookSnapshot(snapshot: WorkbookSnapshot): string {
  const parts: string[] = [
    snapshot.documentId,
    snapshot.fileName,
    snapshot.parserKind,
    String(snapshot.sheets.length),
  ];
  for (const sheet of snapshot.sheets) {
    parts.push(sheet.sheetName);
    parts.push(sheet.usedRange ?? "");
    parts.push(String(sheet.cells.length));
    parts.push(String(sheet.mergedRanges.length));
    // Stable sample of first/last cells for content identity
    const first = sheet.cells[0];
    const last = sheet.cells[sheet.cells.length - 1];
    if (first) {
      parts.push(
        `${first.cellAddress}:${String(first.rawValue ?? "")}:${first.formattedText ?? ""}`
      );
    }
    if (last && last !== first) {
      parts.push(
        `${last.cellAddress}:${String(last.rawValue ?? "")}:${last.formattedText ?? ""}`
      );
    }
  }
  return simpleHash(parts.join("|"));
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `wb_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export function cellText(
  raw: string | number | boolean | null,
  formatted: string | null
): string {
  if (formatted != null && String(formatted).trim() !== "") {
    return String(formatted);
  }
  if (raw == null) return "";
  return String(raw);
}
