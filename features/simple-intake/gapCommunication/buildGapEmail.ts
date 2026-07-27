/**
 * Deterministic gap-email subject/body from GapCommunicationRow + DXF findings.
 */

import type { DxfFileFinding } from "../dxfFileFindings";
import type { GapCommunicationRow } from "./types";

export type GapEmailDraft = {
  subject: string;
  body: string;
  bodyHtml: string;
};

const SECTION_TITLES = new Set([
  "זיהוי פריטים",
  "נתוני פריטים חסרים",
  "פערי מידות",
  "מצב קובצי DXF",
]);

function formatMm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

function itemLabel(row: GapCommunicationRow): string {
  if (row.sourcePartId) return `פריט ${row.sourcePartId}`;
  if (row.sourceRowNumber != null) {
    return `פריט ללא שם – שורה ${row.sourceRowNumber.toLocaleString("he-IL")}`;
  }
  return "פריט ללא שם";
}

function findingLine(finding: DxfFileFinding): string {
  switch (finding.type) {
    case "UNREFERENCED_DXF":
      return `- נמצא קובץ DXF שאינו מופיע ברשימת החומר: ${finding.description}`;
    case "DUPLICATE_CONTENT":
      return `- נמצאו קבצים עם תוכן כפול: ${finding.description}`;
    case "SAME_IDENTIFIER_DIFFERENT_CONTENT":
      return `- נמצאו קבצים עם אותו מזהה ותוכן שונה: ${finding.description}`;
    case "INVALID_DXF":
      return `- קובץ DXF לא תקין: ${finding.description}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isItemTitleLine(line: string): boolean {
  return /^\d+\.\s+/.test(line.trim());
}

function isSectionTitleLine(line: string): boolean {
  return SECTION_TITLES.has(line.trim());
}

/** Convert plain email body to HTML with bold section/item titles. */
export function formatGapEmailBodyHtml(body: string): string {
  const blocks = body.split("\n").map((line) => {
    const trimmed = line.trimEnd();
    if (trimmed === "") return "<br/>";
    if (isSectionTitleLine(trimmed) || isItemTitleLine(trimmed)) {
      return `<div><strong>${escapeHtml(trimmed)}</strong></div>`;
    }
    return `<div>${escapeHtml(trimmed)}</div>`;
  });
  return `<div dir="rtl" style="font-family:inherit;line-height:1.5">${blocks.join("")}</div>`;
}

/**
 * Build editable email draft from unresolved communication rows + DXF findings.
 */
export function buildGapEmailDraft(args: {
  quotationName: string;
  rows: ReadonlyArray<GapCommunicationRow>;
  dxfFindings?: ReadonlyArray<DxfFileFinding>;
}): GapEmailDraft {
  const project = args.quotationName.trim() || "הצעת מחיר";
  const subject = `${project} - השלמת נתונים לצורך הצעת מחיר`;
  const unresolved = args.rows.filter((r) => r.category !== "READY_FOR_PRICING");

  if (unresolved.length === 0) {
    const findingLines = (args.dxfFindings ?? []).map(findingLine);
    const body = [
      "שלום,",
      "",
      "לא נמצאו פריטי חומר הדורשים השלמה להכנת הצעת המחיר.",
      findingLines.length > 0 ? "" : null,
      findingLines.length > 0 ? "מצב קובצי DXF" : null,
      ...findingLines,
      "",
      "מצורף קובץ Excel עם רשימת הפריטים המלאה.",
      "",
      "תודה.",
    ]
      .filter((line) => line != null)
      .join("\n");
    return { subject, body, bodyHtml: formatGapEmailBodyHtml(body) };
  }

  const identification = unresolved.filter(
    (r) => r.category === "ITEM_IDENTIFICATION"
  );
  const missingData = unresolved.filter(
    (r) => r.category === "MISSING_ITEM_DATA"
  );
  const dimensionReview = unresolved.filter(
    (r) => r.category === "DIMENSION_REVIEW"
  );

  let index = 0;
  const sections: string[] = [];

  function pushSection(
    title: string,
    rows: ReadonlyArray<GapCommunicationRow>,
    render: (row: GapCommunicationRow, n: number) => string
  ): void {
    if (rows.length === 0) return;
    const blocks = rows.map((row) => {
      index += 1;
      return render(row, index);
    });
    sections.push(`${title}\n${blocks.join("\n\n")}`);
  }

  pushSection("זיהוי פריטים", identification, (row, n) => {
    const problem =
      row.customerFacingProblem ?? "נדרש טיפול בזיהוי הפריט.";
    const action =
      row.customerFacingRequiredAction ??
      "יש להשלים שם פריט או לצרף קובץ DXF תואם.";
    return `${n}. ${itemLabel(row)}\n${problem}\nנדרש: ${action}`;
  });

  pushSection("נתוני פריטים חסרים", missingData, (row, n) => {
    const problem =
      row.customerFacingProblem ?? "חסרים נתוני פריט.";
    const action =
      row.customerFacingRequiredAction ?? "יש להשלים את הנתונים החסרים.";
    return `${n}. ${itemLabel(row)}\n${problem}\nנדרש: ${action}`;
  });

  pushSection("פערי מידות", dimensionReview, (row, n) => {
    const src = `${formatMm(row.sourceWidthMm)} × ${formatMm(row.sourceLengthMm)} מ"מ`;
    const dxf = `${formatMm(row.dxfWidthMm)} × ${formatMm(row.dxfLengthMm)} מ"מ`;
    const action =
      row.customerFacingRequiredAction ??
      "יש לתקן את מידות הרשימה. אם מידות ה-DXF מאושרות, יש לעדכן את מידות הרשימה בהתאם.";
    return `${n}. ${itemLabel(row)}\nמידות ברשימה: ${src}\nמידות DXF: ${dxf}\nנדרש: ${action}`;
  });

  const findingLines = (args.dxfFindings ?? []).map(findingLine);
  if (findingLines.length > 0) {
    sections.push(`מצב קובצי DXF\n${findingLines.join("\n")}`);
  }

  const body = [
    "שלום,",
    "",
    "כדי שנוכל להשלים את הכנת הצעת המחיר, נדרשת השלמה עבור הפריטים הבאים:",
    "",
    sections.join("\n\n"),
    "",
    "מצורף קובץ Excel שבו ניתן להשלים את הנתונים החסרים.",
    "",
    "תודה.",
  ].join("\n");

  return { subject, body, bodyHtml: formatGapEmailBodyHtml(body) };
}

/** Clipboard payload from the currently edited subject/body (not regenerated). */
export function formatGapEmailClipboardPayload(
  subject: string,
  body: string
): string {
  return `נושא: ${subject}\n\n${body}`;
}

export function formatGapEmailClipboardHtml(
  subject: string,
  body: string,
  bodyHtml?: string
): string {
  const htmlBody = bodyHtml ?? formatGapEmailBodyHtml(body);
  return `<div dir="rtl"><p><strong>נושא:</strong> ${escapeHtml(subject)}</p>${htmlBody}</div>`;
}
