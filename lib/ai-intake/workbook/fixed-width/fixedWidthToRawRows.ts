/**
 * Convert reconstructed fixed-width rows into RawDocumentPartRow[] for the
 * existing normalize → ExtractedDocumentRow path.
 */

import type { SlimRegistryItem } from "../../schemas";
import type { RawDocumentPartRow, RawMeasurement, WorkbookSnapshot } from "../../normalization/types";
import type { FixedWidthReconstructedRow, FixedWidthTableResult } from "./types";

function rawMeas(args: {
  value: number | string | null;
  unit: RawMeasurement["statedUnit"];
  header: string | null;
  cell: string;
  decimals?: number | null;
}): RawMeasurement | null {
  if (args.value == null || args.value === "") return null;
  const rawText = String(args.value);
  const num =
    typeof args.value === "number"
      ? args.value
      : Number.parseFloat(rawText.replace(/,/g, ""));
  return {
    rawValue: Number.isFinite(num) ? num : rawText,
    rawText,
    statedUnit: args.unit,
    rawHeader: args.header,
    displayedDecimalPlaces: args.decimals ?? null,
    sourceCell: args.cell,
    numberFormat: null,
    formula: null,
    formulaResult: null,
    origin: "DETERMINISTIC_WORKBOOK_CELL",
  };
}

function decimalsOf(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const s = String(n);
  const i = s.indexOf(".");
  return i >= 0 ? s.length - i - 1 : 0;
}

export function fixedWidthRowsToRawDocumentPartRows(args: {
  snapshot: WorkbookSnapshot;
  table: FixedWidthTableResult;
  documentId: string;
  registry: SlimRegistryItem[];
}): RawDocumentPartRow[] {
  const { snapshot, table, documentId } = args;
  const sourceType =
    snapshot.parserKind === "EXCELJS_XLSX" ? ("XLSX" as const) : ("XLSX" as const);
  // RawDocumentPartRow source.type only allows XLSX | PDF — map XLS → XLSX label in source
  void sourceType;

  const rows: RawDocumentPartRow[] = [];
  for (const r of table.reconstructedRows) {
    rows.push(toRawRow(documentId, snapshot, table, r));
  }
  return rows;
}

function toRawRow(
  documentId: string,
  snapshot: WorkbookSnapshot,
  table: FixedWidthTableResult,
  r: FixedWidthReconstructedRow
): RawDocumentPartRow {
  const fileName = snapshot.fileName;
  const sheetName = table.detection.sheetName;
  const cell = r.cellReference;
  const profileHeader =
    r.fields.find((f) => f.semantic === "PROFILE_OR_SIZE")?.evidence.headerRaw ??
    null;
  const qtyHeader =
    r.fields.find((f) => f.semantic === "QUANTITY")?.evidence.headerRaw ?? null;
  const lenHeader =
    r.fields.find((f) => f.semantic === "LENGTH")?.evidence.headerRaw ?? null;
  const wHeader =
    r.fields.find((f) => f.semantic === "WEIGHT")?.evidence.headerRaw ?? null;
  const matCell =
    r.fields.find((f) => f.semantic === "MATERIAL")?.evidence.cellReference ??
    cell;

  // Identifier distinction: never use profile as part reference
  const rawPartReference = r.explicitPartIdentifier;

  const thickness =
    r.profile?.thicknessMm != null &&
    (r.profile.status === "PARSED_EXPLICIT_PROFILE" ||
      r.profile.status === "PARSED_WITH_NORMALIZED_SEPARATOR")
      ? rawMeas({
          value: r.profile.thicknessMm,
          unit: "MM",
          header: profileHeader,
          cell,
          decimals: decimalsOf(r.profile.thicknessMm),
        })
      : null;

  const width =
    r.profile?.widthMm != null &&
    (r.profile.status === "PARSED_EXPLICIT_PROFILE" ||
      r.profile.status === "PARSED_WITH_NORMALIZED_SEPARATOR")
      ? rawMeas({
          value: r.profile.widthMm,
          unit: "MM",
          header: profileHeader,
          cell,
          decimals: decimalsOf(r.profile.widthMm),
        })
      : null;

  const height =
    r.lengthRaw != null
      ? rawMeas({
          value: r.lengthRaw,
          unit: "MM",
          header: lenHeader,
          cell,
          decimals: decimalsOf(r.lengthRaw),
        })
      : null;

  const unitWeight =
    r.weightRaw != null
      ? rawMeas({
          value: r.weightRaw,
          unit: r.weightUnit === "KG" ? "KG" : null,
          header: wHeader,
          cell,
          decimals: decimalsOf(r.weightRaw),
        })
      : null;

  // Runtime assertion: material must not be the full line
  let material = r.material;
  if (material && material.trim() === r.originalCellText.trim()) {
    material = null;
  }

  return {
    occurrenceId: `doc:${documentId}:${sheetName}:fw:${r.rowNumber}`,
    documentId,
    rowRole: "PART",
    matchedDxfPartId: null,
    rawPartReference,
    partReferenceCell: rawPartReference ? cell : null,
    materialCell: material ? matCell : null,
    quantity: rawMeas({
      value: r.quantity,
      unit: null,
      header: qtyHeader,
      cell,
      decimals: 0,
    }),
    thickness,
    material,
    width,
    height,
    area: null,
    totalArea: null,
    unitWeight,
    totalWeight: null,
    description: r.sourceDescriptor,
    notes: r.sourceDescriptor
      ? `sourceProfile:${r.sourceDescriptor}`
      : null,
    source: {
      type: "XLSX",
      fileName,
      sheetName,
      rowNumber: r.rowNumber,
      pageNumber: null,
      excerpt: r.originalCellText.slice(0, 120),
      tableId: `fw:${sheetName}:${table.detection.headerRowNumber}`,
    },
    extractionIssues: [],
    isHiddenRow: false,
  };
}
