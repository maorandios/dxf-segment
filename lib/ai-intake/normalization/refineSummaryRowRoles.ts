import type {
  AiWorkbookMappingResult,
  DocumentRowRole,
  WorkbookSnapshot,
} from "./types";
import { resolveRowRoles, type ResolvedRowRole } from "./resolveRowRoles";

const GRAND_TOTAL_TEXT =
  /grand\s*total|סה["״]?כ\s*כללי|סך\s*הכל\s*כללי|total\s*general|סיכום\s*כללי/i;

/**
 * Deterministic SUBTOTAL vs TOTAL refinement for summary rows.
 *
 * Rules (after AI/deterministic summary detection):
 * - PART rows are never reclassified as summary.
 * - Strong grand-total labels stay TOTAL.
 * - If a PART row exists later in the same table → SUBTOTAL.
 * - The final summary row after the last PART → TOTAL.
 * - Other summaries with no later PART but not the last summary → SUBTOTAL.
 */
export function refineSummaryRowClassification(
  roles: ResolvedRowRole[]
): ResolvedRowRole[] {
  const sorted = [...roles].sort((a, b) => a.rowNumber - b.rowNumber);
  const lastPartRow = sorted
    .filter((r) => r.role === "PART")
    .reduce((max, r) => Math.max(max, r.rowNumber), -Infinity);

  const summaryIndexes = sorted
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) => r.role === "TOTAL" || r.role === "SUBTOTAL"
    );
  if (summaryIndexes.length === 0) return sorted;

  const lastSummaryRow = Math.max(
    ...summaryIndexes.map(({ r }) => r.rowNumber)
  );

  return sorted.map((r) => {
    if (r.role !== "TOTAL" && r.role !== "SUBTOTAL") return r;

    const isGrand =
      GRAND_TOTAL_TEXT.test(r.reason) || r.reason.includes("exactText:GRAND_TOTAL");
    if (isGrand) {
      return {
        ...r,
        role: "TOTAL" as DocumentRowRole,
        reason: `${r.reason}|refine:grandTotal`,
      };
    }

    const hasPartLater =
      Number.isFinite(lastPartRow) && lastPartRow > r.rowNumber;

    let role: DocumentRowRole;
    let tag: string;
    if (hasPartLater) {
      role = "SUBTOTAL";
      tag = "refine:partExistsLater";
    } else if (r.rowNumber === lastSummaryRow) {
      role = "TOTAL";
      tag = "refine:finalSummaryAfterParts";
    } else {
      role = "SUBTOTAL";
      tag = "refine:intermediateSummary";
    }

    if (role === r.role) {
      return { ...r, reason: `${r.reason}|${tag}` };
    }
    return {
      ...r,
      role,
      reason: `${r.reason}|${tag}`,
    };
  });
}

/**
 * Re-resolve all table row roles and write refined SUBTOTAL/TOTAL back into mapping.
 * Used before coverage validation so mappedSubtotalRowCount / mappedTotalRowCount
 * reflect deterministic structure.
 */
export function applyDeterministicRowRolesToMapping(
  snapshot: WorkbookSnapshot,
  mapping: AiWorkbookMappingResult
): AiWorkbookMappingResult {
  return {
    sheets: mapping.sheets.map((sheetMap) => {
      const sheetSnap = snapshot.sheets.find(
        (s) => s.sheetName === sheetMap.sheetName
      );
      if (!sheetSnap) return sheetMap;

      return {
        ...sheetMap,
        tables: sheetMap.tables.map((table) => {
          const resolved = refineSummaryRowClassification(
            resolveRowRoles({ sheet: sheetSnap, table })
          );
          return {
            ...table,
            rowRoles: resolved.map((r) => ({
              rowNumber: r.rowNumber,
              role: r.role,
              reason: r.reason,
            })),
          };
        }),
      };
    }),
  };
}
