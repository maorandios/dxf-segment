/**
 * Build a synthetic AiWorkbookMappingResult from an extraction plan
 * so existing unit/mass normalization can run unchanged.
 */

import type { AiWorkbookMappingResult, AiWorkbookColumnMap } from "../../normalization/types";
import type { WorkbookExtractionPlan } from "./types";

function emptyColumns(): AiWorkbookColumnMap {
  return {
    partReference: null,
    quantity: null,
    thickness: null,
    material: null,
    width: null,
    height: null,
    area: null,
    totalArea: null,
    unitWeight: null,
    totalWeight: null,
  };
}

export function planToSyntheticMapping(
  plan: WorkbookExtractionPlan
): AiWorkbookMappingResult {
  const bySheet = new Map<string, typeof plan.tables>();
  for (const t of plan.tables) {
    const list = bySheet.get(t.sheetName) ?? [];
    list.push(t);
    bySheet.set(t.sheetName, list);
  }

  return {
    sheets: [...bySheet.entries()].map(([sheetName, tables]) => ({
      sheetName,
      tables: tables.map((t) => {
        const columns = emptyColumns();
        for (const f of t.fields) {
          const col =
            f.source.op === "READ_COLUMN_CELL" ||
            f.source.op === "READ_HEADER_RELATIVE_CELL" ||
            f.source.op === "SPLIT_ALIGNED_TEXT" ||
            f.source.op === "EXTRACT_BY_HEADER_SPAN" ||
            f.source.op === "SPLIT_DELIMITED_TEXT" ||
            f.source.op === "REGEX_CAPTURE"
              ? f.source.columnLetter
              : null;
          switch (f.targetField) {
            case "EXPLICIT_PART_IDENTIFIER":
              columns.partReference = col;
              break;
            case "QUANTITY":
              columns.quantity = col;
              break;
            case "THICKNESS":
              columns.thickness = col;
              break;
            case "MATERIAL":
              columns.material = col;
              break;
            case "WIDTH":
              columns.width = col;
              break;
            case "LENGTH":
              columns.height = col;
              break;
            case "AREA":
              columns.area = col;
              break;
            case "UNIT_WEIGHT":
              columns.unitWeight = col;
              break;
            case "TOTAL_WEIGHT":
              columns.totalWeight = col;
              break;
            default:
              break;
          }
        }
        return {
          tableId: t.tableId,
          tableRange: null,
          headerRowNumbers: t.headerRows,
          firstDataRow: t.dataRowSelector.fromRow,
          lastDataRow: t.dataRowSelector.toRow,
          columns,
          columnHeaders: t.fields.map((f) => ({
            columnLetter:
              "columnLetter" in f.source
                ? String(
                    (f.source as { columnLetter?: string }).columnLetter ?? ""
                  )
                : "",
            rawHeaderText: f.reasons[0] ?? f.targetField,
            detectedMeaning: f.targetField,
            statedUnitText: f.explicitUnit,
          })),
          rowRoles: [],
          warnings: [`INTERPRETER:${t.rowMode}`],
        };
      }),
      unmappedNonEmptyRows: [],
    })),
  };
}
