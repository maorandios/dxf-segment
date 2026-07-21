/**
 * Combined customer completion-request text + workbook (no AI).
 */

import ExcelJS from "exceljs";
import { displayLabel, effectiveMaterialFields } from "../materialList/completeness";
import { hasExplicitDxfFileName } from "../normalizeDxfFileKey";
import type { MaterialListRow } from "../materialList/types";
import type { DxfLinkedMaterialItem, DxfReviewIssue } from "./types";

const CUSTOMER_KINDS = new Set([
  "MISSING_DXF",
  "MISSING_EXPLICIT_DXF",
  "MULTIPLE_DXF",
  "INVALID_DXF",
  "DIMENSION_MISMATCH",
  "MISSING_MATERIAL",
  "MISSING_THICKNESS",
  "MISSING_QUANTITY",
  "MISSING_REQUIRED_DIMENSIONS",
]);

export function customerActionableIssues(
  item: DxfLinkedMaterialItem
): DxfReviewIssue[] {
  if (item.finalStatus === "EXCLUDED") return [];
  return item.issues.filter(
    (i) => i.customerActionable && CUSTOMER_KINDS.has(i.kind)
  );
}

function dxfCompletionLines(item: DxfLinkedMaterialItem): string[] {
  const lines: string[] = [];
  const hasExplicit = hasExplicitDxfFileName(item.extractedDxfFileName);
  const dxfIssues = item.issues.filter(
    (i) =>
      i.kind === "MISSING_DXF" ||
      i.kind === "MISSING_EXPLICIT_DXF" ||
      i.kind === "MULTIPLE_DXF"
  );

  for (const issue of dxfIssues) {
    if (issue.kind === "MISSING_EXPLICIT_DXF") {
      const name = item.extractedDxfFileName?.trim() ?? "";
      lines.push(
        `• ברשימה צוין הקובץ ${name}, אך הקובץ לא צורף.`
      );
      continue;
    }
    if (issue.kind === "MISSING_DXF") {
      if (!hasExplicit) {
        lines.push("• לא צוין שם קובץ DXF עבור הפריט.");
        lines.push(
          "• לא ניתן היה לשייך קובץ DXF באופן חד-משמעי. נא לציין את שם הקובץ המתאים."
        );
      } else {
        lines.push(
          "• לא ניתן היה לשייך קובץ DXF באופן חד-משמעי. נא לציין את שם הקובץ המתאים."
        );
      }
      continue;
    }
    if (issue.kind === "MULTIPLE_DXF") {
      lines.push(
        "• לא ניתן היה לשייך קובץ DXF באופן חד-משמעי. נא לציין את שם הקובץ המתאים."
      );
    }
  }
  return lines;
}

export function buildCompletionClipboardMessage(
  items: DxfLinkedMaterialItem[],
  selectedMaterialRowIds: ReadonlySet<string>
): string {
  const selected = items.filter(
    (i) =>
      selectedMaterialRowIds.has(i.materialRowId) &&
      customerActionableIssues(i).length > 0
  );

  const blocks: string[] = [];
  selected.forEach((item, index) => {
    const label = displayLabel(item.materialRow);
    const lines = customerActionableIssues(item).flatMap((issue) => {
      if (issue.kind === "DIMENSION_MISMATCH") {
        return [
          `• ברשימה מופיעות מידות ${issue.workbookDimsLabel ?? "—"}`,
          `• בקובץ ה-DXF מופיעות מידות ${issue.dxfDimsLabel ?? "—"}`,
          "• נא לאשר מהן המידות הנכונות",
        ];
      }
      if (
        issue.kind === "MISSING_DXF" ||
        issue.kind === "MISSING_EXPLICIT_DXF" ||
        issue.kind === "MULTIPLE_DXF"
      ) {
        return [];
      }
      if (issue.kind === "INVALID_DXF") {
        return ["• קובץ ה-DXF אינו תקין לחישוב"];
      }
      return [`• ${issue.messageHe}`];
    });
    const dxfLines = dxfCompletionLines(item);
    const all = [...dxfLines, ...lines];
    blocks.push(`${index + 1}. ${label}\n${all.join("\n")}`);
  });

  return [
    "שלום,",
    "",
    "בדקנו את רשימת החומר ואת קובצי ה-DXF שצורפו.",
    "",
    "כדי להשלים את הצעת המחיר נדרשים הפרטים הבאים:",
    "",
    blocks.join("\n\n"),
    "",
    "מצורף קובץ מסודר שבו ניתן להשלים את הנתונים החסרים.",
    "",
    "תודה.",
  ].join("\n");
}

function whatIsNeededHe(item: DxfLinkedMaterialItem): string {
  const issues = customerActionableIssues(item);
  const parts: string[] = [];
  const dxfLines = dxfCompletionLines(item).map((l) => l.replace(/^•\s*/, ""));
  parts.push(...dxfLines);
  for (const i of issues) {
    if (
      i.kind === "MISSING_DXF" ||
      i.kind === "MISSING_EXPLICIT_DXF" ||
      i.kind === "MULTIPLE_DXF"
    ) {
      continue;
    }
    if (i.kind === "DIMENSION_MISMATCH") {
      parts.push(
        `פער מידות: ברשימה ${i.workbookDimsLabel ?? "—"} / ב-DXF ${i.dxfDimsLabel ?? "—"}`
      );
      continue;
    }
    parts.push(i.messageHe);
  }
  return parts.join("; ");
}

export async function buildCompletionWorkbook(args: {
  items: DxfLinkedMaterialItem[];
  selectedMaterialRowIds: ReadonlySet<string>;
  allMaterialRows: MaterialListRow[];
  originalFilename: string;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OMEGA";
  workbook.created = new Date();

  const selected = args.items.filter(
    (i) =>
      args.selectedMaterialRowIds.has(i.materialRowId) &&
      customerActionableIssues(i).length > 0
  );

  const sheet1 = workbook.addWorksheet("להשלמה", {
    views: [{ rightToLeft: true }],
  });
  const headers1 = [
    "מספר",
    "חלק / פרופיל",
    "סוג חומר",
    "עובי",
    "כמות",
    "רוחב ברשימה",
    "אורך ברשימה",
    "שם קובץ DXF",
    "קובץ DXF ששויך",
    "רוחב DXF",
    "אורך DXF",
    "מה נדרש להשלים",
    "תשובת הלקוח",
  ];
  sheet1.addRow(headers1);
  sheet1.getRow(1).font = { bold: true };

  selected.forEach((item, i) => {
    const e = effectiveMaterialFields(item.materialRow);
    const row = sheet1.addRow([
      i + 1,
      displayLabel(item.materialRow),
      e.material ?? "",
      e.thicknessMm ?? "",
      e.quantity ?? "",
      item.workbookDimensions.widthMm ?? "",
      item.workbookDimensions.lengthMm ?? "",
      item.extractedDxfFileName ?? "",
      item.matchedFilename ?? "",
      item.dxfDimensions.widthMm ?? "",
      item.dxfDimensions.lengthMm ?? "",
      whatIsNeededHe(item),
      "",
    ]);
    // Highlight editable/missing cells (material, thickness, qty, dxf name when missing, customer reply).
    const highlightCols = [3, 4, 5, 13];
    if (!hasExplicitDxfFileName(item.extractedDxfFileName)) {
      highlightCols.push(8);
    }
    for (const col of highlightCols) {
      const cell = row.getCell(col);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
    }
  });

  sheet1.columns.forEach((col) => {
    col.width = 16;
  });

  const sheet2 = workbook.addWorksheet("רשימת חומר מסודרת", {
    views: [{ rightToLeft: true }],
  });
  sheet2.addRow([
    "מספר",
    "חלק / פרופיל",
    "סוג חומר",
    "עובי",
    "כמות",
    "רוחב",
    "אורך",
    "סטטוס סופי",
    "שם קובץ DXF",
    "קובץ DXF ששויך",
  ]).font = { bold: true };

  const byId = new Map(args.items.map((i) => [i.materialRowId, i]));
  args.allMaterialRows.forEach((row, i) => {
    const linked = byId.get(row.rowId);
    const e = effectiveMaterialFields(row);
    sheet2.addRow([
      i + 1,
      displayLabel(row),
      e.material ?? "",
      e.thicknessMm ?? "",
      e.quantity ?? "",
      e.widthMm ?? "",
      e.lengthMm ?? "",
      linked?.finalStatus ?? "",
      linked?.extractedDxfFileName ?? row.dxfFileName ?? "",
      linked?.matchedFilename ?? "",
    ]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const base =
    args.originalFilename.replace(/\.[^.]+$/, "") || "workbook";
  const filename = `OMEGA-completion-request-${base}.xlsx`;
  return { filename, bytes };
}

export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
