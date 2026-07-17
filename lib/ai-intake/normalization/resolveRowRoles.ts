import { refineSummaryRowClassification } from "./refineSummaryRowRoles";
import type {
  AiWorkbookTableMapping,
  DocumentRowRole,
  WorkbookCellEvidence,
  WorkbookSheetSnapshot,
} from "./types";

const TOTAL_TEXT =
  /^(total|totals|grand\s*total|סה["״]?כ|סיכום|סך\s*הכל|סך הכל)\b/i;
const GRAND_TOTAL_TEXT =
  /grand\s*total|סה["״]?כ\s*כללי|סך\s*הכל\s*כללי|total\s*general|סיכום\s*כללי/i;
const SUBTOTAL_TEXT = /^(sub\s*-?\s*total|subtotal|סיכום\s*ביניים)\b/i;
const SUM_FORMULA = /\bSUM\s*\(/i;

export type ResolvedRowRole = {
  rowNumber: number;
  role: DocumentRowRole;
  reason: string;
  aiRole: DocumentRowRole | null;
  conflict: boolean;
};

function cellsInRow(
  sheet: WorkbookSheetSnapshot,
  rowNumber: number
): WorkbookCellEvidence[] {
  return sheet.cells.filter((c) => c.rowNumber === rowNumber);
}

function cellText(cell: WorkbookCellEvidence | undefined): string {
  if (!cell) return "";
  if (cell.formattedText) return cell.formattedText.trim();
  if (cell.rawValue != null) return String(cell.rawValue).trim();
  if (cell.formulaResult != null) return String(cell.formulaResult).trim();
  return "";
}

function getCol(
  cells: WorkbookCellEvidence[],
  letter: string | null | undefined
): WorkbookCellEvidence | undefined {
  if (!letter) return undefined;
  const L = letter.toUpperCase();
  return cells.find((c) => c.columnLetter.toUpperCase() === L);
}

function looksLikeTotalText(text: string): boolean {
  return TOTAL_TEXT.test(text.trim());
}

function looksLikeSubtotalText(text: string): boolean {
  return SUBTOTAL_TEXT.test(text.trim());
}

function hasSumFormula(cells: WorkbookCellEvidence[]): boolean {
  return cells.some((c) => c.formula != null && SUM_FORMULA.test(c.formula));
}

function onlyTotalsColumnsFilled(
  table: AiWorkbookTableMapping,
  cells: WorkbookCellEvidence[]
): boolean {
  const part = getCol(cells, table.columns.partReference);
  const qty = getCol(cells, table.columns.quantity);
  const totalArea = getCol(cells, table.columns.totalArea);
  const totalWeight = getCol(cells, table.columns.totalWeight);
  const partEmpty = !part || cellText(part) === "";
  const qtyEmpty = !qty || cellText(qty) === "";
  const hasTotal =
    (totalArea && cellText(totalArea) !== "") ||
    (totalWeight && cellText(totalWeight) !== "");
  return partEmpty && qtyEmpty && Boolean(hasTotal);
}

/**
 * Deterministic row-role resolver. OpenAI role is advisory.
 * Conflicting signals → UNKNOWN (never silently discarded).
 */
export function resolveRowRoles(args: {
  sheet: WorkbookSheetSnapshot;
  table: AiWorkbookTableMapping;
  previousRoleByRow?: Map<number, DocumentRowRole>;
}): ResolvedRowRole[] {
  const { sheet, table } = args;
  const aiByRow = new Map(
    table.rowRoles.map((r) => [r.rowNumber, r] as const)
  );

  const rowNumbers = new Set<number>();
  for (const r of table.rowRoles) rowNumbers.add(r.rowNumber);
  if (table.firstDataRow != null && table.lastDataRow != null) {
    for (let r = table.firstDataRow; r <= table.lastDataRow; r += 1) {
      rowNumbers.add(r);
    }
  }
  for (const h of table.headerRowNumbers) rowNumbers.add(h);

  const sorted = [...rowNumbers].sort((a, b) => a - b);
  const resolved: ResolvedRowRole[] = [];
  let sawPart = false;

  for (const rowNumber of sorted) {
    const cells = cellsInRow(sheet, rowNumber);
    const ai = aiByRow.get(rowNumber) ?? null;
    const signals: DocumentRowRole[] = [];
    const reasons: string[] = [];

    if (table.headerRowNumbers.includes(rowNumber)) {
      signals.push("HEADER");
      reasons.push("headerRowNumbers");
    }

    const joined = cells.map(cellText).filter(Boolean).join(" | ");
    if (GRAND_TOTAL_TEXT.test(joined)) {
      signals.push("TOTAL");
      reasons.push("exactText:GRAND_TOTAL");
    } else if (looksLikeTotalText(joined)) {
      signals.push("TOTAL");
      reasons.push("exactText:TOTAL");
    }
    if (looksLikeSubtotalText(joined)) {
      signals.push("SUBTOTAL");
      reasons.push("exactText:SUBTOTAL");
    }

    if (hasSumFormula(cells)) {
      signals.push("TOTAL");
      reasons.push("formula:SUM");
    }

    const partCell = getCol(cells, table.columns.partReference);
    const partEmpty = !partCell || cellText(partCell) === "";

    if (onlyTotalsColumnsFilled(table, cells)) {
      signals.push("TOTAL");
      reasons.push("totalsColumnsOnly");
    }

    if (sawPart && partEmpty && (hasSumFormula(cells) || looksLikeTotalText(joined))) {
      signals.push("TOTAL");
      reasons.push("afterPartGroup");
    }

    if (ai) {
      signals.push(ai.role);
      reasons.push(`ai:${ai.role}:${ai.reason}`);
    }

    // Empty row
    const nonEmpty = cells.some(
      (c) =>
        c.rawValue != null ||
        c.formula != null ||
        (c.formattedText != null && c.formattedText.trim() !== "")
    );
    if (!nonEmpty) {
      signals.push("EMPTY");
      reasons.push("emptyRow");
    }

    const unique = [...new Set(signals)];
    const strong = unique.filter((r) => r === "TOTAL" || r === "SUBTOTAL");
    const hasPartSignal =
      unique.includes("PART") ||
      (!partEmpty &&
        !unique.includes("HEADER") &&
        !unique.includes("TOTAL") &&
        !unique.includes("SUBTOTAL") &&
        nonEmpty);

    let role: DocumentRowRole;
    let conflict = false;

    if (strong.includes("TOTAL") && strong.includes("SUBTOTAL")) {
      role = "UNKNOWN";
      conflict = true;
      reasons.push("conflict:TOTAL_vs_SUBTOTAL");
    } else if (strong.length === 1 && hasPartSignal && ai?.role === "PART") {
      role = "UNKNOWN";
      conflict = true;
      reasons.push(`conflict:${strong[0]}_vs_PART`);
    } else if (strong.includes("TOTAL")) {
      role = "TOTAL";
    } else if (strong.includes("SUBTOTAL")) {
      role = "SUBTOTAL";
    } else if (unique.includes("HEADER")) {
      role = "HEADER";
    } else if (!nonEmpty) {
      role = "EMPTY";
    } else if (ai && (ai.role === "NOTE" || ai.role === "UNKNOWN")) {
      role = ai.role;
    } else if (!partEmpty && nonEmpty) {
      role = "PART";
      reasons.push("partReferencePresent");
    } else if (ai) {
      role = ai.role;
    } else {
      role = "UNKNOWN";
      reasons.push("noClearSignal");
    }

    // Hidden metadata never auto-include/exclude; role still resolved
    if (cells.some((c) => c.isHiddenRow) && role === "PART") {
      reasons.push("hiddenRow");
    }

    if (role === "PART") sawPart = true;

    resolved.push({
      rowNumber,
      role,
      reason: reasons.join("|"),
      aiRole: ai?.role ?? null,
      conflict,
    });
  }

  return refineSummaryRowClassification(resolved);
}
