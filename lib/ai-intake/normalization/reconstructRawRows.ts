import { normalizePartId } from "../normalizePartId";
import type { SlimRegistryItem } from "../schemas";
import { getCell } from "./buildWorkbookSnapshot";
import { measurementFromCell, parseStatedUnit } from "./measurementFromCell";
import { resolveRowRoles } from "./resolveRowRoles";
import type {
  AiWorkbookMappingResult,
  AiWorkbookTableMapping,
  DocumentRowRole,
  LengthOrAreaOrMassUnit,
  RawDocumentPartRow,
  WorkbookSnapshot,
} from "./types";

export type ReconstructWorkbookResult = {
  partRows: RawDocumentPartRow[];
  excludedTotalSubtotalRows: RawDocumentPartRow[];
  unknownRows: RawDocumentPartRow[];
  hiddenPartRowsRequiringReview: RawDocumentPartRow[];
  allRows: RawDocumentPartRow[];
  warnings: string[];
};

function headerMeta(
  table: AiWorkbookTableMapping,
  columnLetter: string | null
): { rawHeader: string | null; statedUnit: LengthOrAreaOrMassUnit | null } {
  if (!columnLetter) return { rawHeader: null, statedUnit: null };
  const h = table.columnHeaders.find(
    (c) => c.columnLetter.toUpperCase() === columnLetter.toUpperCase()
  );
  return {
    rawHeader: h?.rawHeaderText ?? null,
    statedUnit: parseStatedUnit(h?.statedUnitText ?? h?.rawHeaderText),
  };
}

function cellAddress(columnLetter: string | null, rowNumber: number): string | null {
  if (!columnLetter) return null;
  return `${columnLetter.toUpperCase()}${rowNumber}`;
}

function scalarText(v: string | number | boolean | null | undefined): string | null {
  if (v == null) return null;
  return String(v).trim() || null;
}

function matchDxf(
  rawPartReference: string | null,
  registry: SlimRegistryItem[]
): string | null {
  if (!rawPartReference) return null;
  const cand = normalizePartId(rawPartReference);
  if (!cand) return null;
  const hit = registry.find((r) => r.canonicalPartId === cand.canonicalPartId);
  return hit?.canonicalPartId ?? null;
}

function buildRow(args: {
  snapshot: WorkbookSnapshot;
  sheetName: string;
  table: AiWorkbookTableMapping;
  rowNumber: number;
  role: DocumentRowRole;
  roleReason: string;
  registry: SlimRegistryItem[];
}): RawDocumentPartRow {
  const { snapshot, sheetName, table, rowNumber, role, roleReason, registry } =
    args;
  const cols = table.columns;
  const issues: string[] = [];

  const pick = (letter: string | null) => {
    const addr = cellAddress(letter, rowNumber);
    if (!addr || !letter) {
      return {
        measurement: null as ReturnType<typeof measurementFromCell> | null,
        addr: null as string | null,
      };
    }
    const meta = headerMeta(table, letter);
    const cell = getCell(snapshot, sheetName, addr);
    return {
      measurement: measurementFromCell({
        cell,
        sourceCell: addr,
        rawHeader: meta.rawHeader,
        statedUnit: meta.statedUnit,
      }),
      addr,
    };
  };

  const partRefAddr = cellAddress(cols.partReference, rowNumber);
  const partRefCell = partRefAddr
    ? getCell(snapshot, sheetName, partRefAddr)
    : null;
  const rawPartReference =
    scalarText(partRefCell?.formattedText) ??
    scalarText(partRefCell?.rawValue) ??
    null;

  const qty = pick(cols.quantity);
  const thickness = pick(cols.thickness);
  const materialAddr = cellAddress(cols.material, rowNumber);
  const materialCell = materialAddr
    ? getCell(snapshot, sheetName, materialAddr)
    : null;
  const material =
    scalarText(materialCell?.formattedText) ??
    scalarText(materialCell?.rawValue) ??
    null;

  const width = pick(cols.width);
  const height = pick(cols.height);
  const area = pick(cols.area);
  const totalArea = pick(cols.totalArea);
  const unitWeight = pick(cols.unitWeight);
  const totalWeight = pick(cols.totalWeight);

  const sheetCells =
    snapshot.sheets.find((s) => s.sheetName === sheetName)?.cells ?? [];
  const isHiddenRow = sheetCells.some(
    (c) => c.rowNumber === rowNumber && c.isHiddenRow
  );

  if (role === "PART" && isHiddenRow) {
    issues.push("HIDDEN_PART_ROW_REQUIRES_REVIEW");
  }
  if (roleReason.includes("conflict")) {
    issues.push("ROW_ROLE_CONFLICT");
  }

  const matchedDxfPartId =
    role === "PART" ? matchDxf(rawPartReference, registry) : null;

  const excerptParts = [
    rawPartReference,
    qty.measurement?.rawText ?? qty.measurement?.rawValue,
    thickness.measurement?.rawText ?? thickness.measurement?.rawValue,
    material,
  ]
    .filter((v) => v != null && String(v).length > 0)
    .map(String);

  return {
    occurrenceId: `${snapshot.documentId}:${sheetName}:${table.tableId}:r${rowNumber}`,
    documentId: snapshot.documentId,
    rowRole: role,
    matchedDxfPartId,
    rawPartReference,
    partReferenceCell: partRefAddr,
    materialCell: materialAddr,
    quantity: qty.measurement,
    thickness: thickness.measurement,
    material,
    width: width.measurement,
    height: height.measurement,
    area: area.measurement,
    totalArea: totalArea.measurement,
    unitWeight: unitWeight.measurement,
    totalWeight: totalWeight.measurement,
    description: null,
    notes: null,
    source: {
      type: "XLSX",
      fileName: snapshot.fileName,
      sheetName,
      rowNumber,
      pageNumber: null,
      excerpt: excerptParts.join(" | ") || null,
      tableId: table.tableId,
    },
    extractionIssues: issues,
    isHiddenRow,
  };
}

/**
 * Reconstruct RawDocumentPartRow[] from mapping pointers + WorkbookSnapshot cells.
 * TOTAL/SUBTOTAL never enter partRows (BOM). UNKNOWN preserved separately.
 */
export function reconstructRawRows(args: {
  snapshot: WorkbookSnapshot;
  mapping: AiWorkbookMappingResult;
  registry: SlimRegistryItem[];
}): ReconstructWorkbookResult {
  const warnings: string[] = [];
  const partRows: RawDocumentPartRow[] = [];
  const excludedTotalSubtotalRows: RawDocumentPartRow[] = [];
  const unknownRows: RawDocumentPartRow[] = [];
  const hiddenPartRowsRequiringReview: RawDocumentPartRow[] = [];
  const allRows: RawDocumentPartRow[] = [];

  for (const sheetMap of args.mapping.sheets) {
    const sheetSnap = args.snapshot.sheets.find(
      (s) => s.sheetName === sheetMap.sheetName
    );
    if (!sheetSnap) {
      warnings.push(`MAPPING_UNKNOWN_SHEET:${sheetMap.sheetName}`);
      continue;
    }

    for (const table of sheetMap.tables) {
      const resolved = resolveRowRoles({ sheet: sheetSnap, table });
      for (const rr of resolved) {
        if (rr.role === "HEADER" || rr.role === "EMPTY" || rr.role === "NOTE") {
          // Keep NOTE/HEADER out of BOM; optionally retain NOTE in unknown for debug
          if (rr.role === "NOTE") {
            const row = buildRow({
              snapshot: args.snapshot,
              sheetName: sheetMap.sheetName,
              table,
              rowNumber: rr.rowNumber,
              role: rr.role,
              roleReason: rr.reason,
              registry: args.registry,
            });
            unknownRows.push(row);
            allRows.push(row);
          }
          continue;
        }

        const row = buildRow({
          snapshot: args.snapshot,
          sheetName: sheetMap.sheetName,
          table,
          rowNumber: rr.rowNumber,
          role: rr.role,
          roleReason: rr.reason,
          registry: args.registry,
        });
        allRows.push(row);

        if (rr.role === "TOTAL" || rr.role === "SUBTOTAL") {
          excludedTotalSubtotalRows.push(row);
          continue;
        }
        if (rr.role === "UNKNOWN") {
          unknownRows.push(row);
          continue;
        }
        if (rr.role === "PART") {
          if (row.isHiddenRow) {
            hiddenPartRowsRequiringReview.push(row);
            // Preserve occurrence but keep out of READY path via issue flag;
            // still include in partRows so it remains visible and not silently dropped.
            partRows.push(row);
          } else {
            partRows.push(row);
          }
        }
      }
    }

    for (const rowNumber of sheetMap.unmappedNonEmptyRows) {
      warnings.push(
        `UNMAPPED_NONEMPTY_ROW:${sheetMap.sheetName}:${rowNumber}`
      );
    }
    // metadataRowNumbers already reported once by classifyWorkbookMetadataRows
  }

  return {
    partRows,
    excludedTotalSubtotalRows,
    unknownRows,
    hiddenPartRowsRequiringReview,
    allRows,
    warnings,
  };
}
