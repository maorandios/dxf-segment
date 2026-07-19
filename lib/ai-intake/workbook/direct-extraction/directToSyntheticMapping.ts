/**
 * Synthetic AiWorkbookMappingResult from direct extraction tables
 * so Unit Profile / mass normalization can run unchanged.
 */

import type { AiWorkbookMappingResult } from "../../normalization/types";
import type { DirectWorkbookExtraction } from "./types";

export function directExtractionToSyntheticMapping(
  extraction: DirectWorkbookExtraction
): AiWorkbookMappingResult {
  const bySheet = new Map<string, typeof extraction.tables>();
  for (const t of extraction.tables) {
    const list = bySheet.get(t.sheetName) ?? [];
    list.push(t);
    bySheet.set(t.sheetName, list);
  }

  // Ensure every sheet that has part rows appears even without table metadata
  for (const row of extraction.rows) {
    if (!bySheet.has(row.sheetName)) {
      bySheet.set(row.sheetName, []);
    }
  }

  return {
    sheets: [...bySheet.entries()].map(([sheetName, tables]) => {
      const sheetRows = extraction.rows.filter((r) => r.sheetName === sheetName);
      const effectiveTables =
        tables.length > 0
          ? tables
          : [
              {
                tableId: `direct:${sheetName}:auto`,
                sheetName,
                headerRowNumbers: [],
                dataStartRow: sheetRows[0]?.sourceRowNumbers[0] ?? 1,
                dataEndRow: null,
                role: "PART_LIST" as const,
                confidence: 0.5,
                reason: "AUTO_FROM_DIRECT_ROWS",
              },
            ];

      return {
        sheetName,
        tables: effectiveTables.map((t) => ({
          tableId: t.tableId,
          tableRange: null,
          headerRowNumbers: t.headerRowNumbers,
          firstDataRow: t.dataStartRow,
          lastDataRow: t.dataEndRow,
          columns: {
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
          },
          columnHeaders: [],
          rowRoles: extraction.sourceRowLedger
            .filter((e) => e.sheetName === sheetName)
            .map((e) => ({
              rowNumber: e.rowNumber,
              role: (e.classification === "PART"
                ? "PART"
                : e.classification === "HEADER" ||
                    e.classification === "REPEATED_HEADER"
                  ? "HEADER"
                  : e.classification === "TOTAL"
                    ? "TOTAL"
                    : e.classification === "SUBTOTAL"
                      ? "SUBTOTAL"
                      : e.classification === "NOTE" ||
                          e.classification === "FOOTER"
                        ? "NOTE"
                        : e.classification === "BLANK"
                          ? "EMPTY"
                          : "UNKNOWN") as
                | "PART"
                | "HEADER"
                | "TOTAL"
                | "SUBTOTAL"
                | "NOTE"
                | "EMPTY"
                | "UNKNOWN",
              reason: e.reason,
            })),
          warnings: [`DIRECT_EXTRACTION:${t.role}`],
        })),
        unmappedNonEmptyRows: extraction.sourceRowLedger
          .filter(
            (e) =>
              e.sheetName === sheetName &&
              (e.classification === "UNPROCESSED" ||
                e.classification === "AMBIGUOUS")
          )
          .map((e) => e.rowNumber),
      };
    }),
  };
}
