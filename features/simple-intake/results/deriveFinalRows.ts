/**
 * Derive FinalIntakeRow[] (canonical FinalTableRow + picker data) from session.
 * One source row → one table row regardless of quantity.
 */

import type {
  SimpleDxfPart,
  SimpleMatchingDiagnostics,
  SimpleResultRow,
  SimpleWorkbookSnapshot,
} from "../types";
import {
  calcCommercialAreaM2,
  calcCommercialTotalWeightKg,
  calcCommercialUnitWeightKg,
  resolvePlateDensityKgPerM3,
} from "./commercialCalculations";
import { normalizeDimensionPair } from "../dxfLink/dimensionMismatch";
import { deriveIssueCodes } from "./deriveIssueCodes";
import { deriveReviewStatus } from "./deriveReviewStatus";
import { issueMessageHe, primaryActionLabelHe } from "./issueMessages";
import { resolvePartDisplayName } from "./resolvePartDisplayName";
import type {
  FinalIntakeRow,
  FinalResultsSummary,
  FinalRowAction,
} from "./types";

function effectiveField<T>(
  edits: SimpleResultRow["edits"],
  key: keyof SimpleResultRow["edits"],
  fallback: T
): T {
  if (Object.prototype.hasOwnProperty.call(edits, key)) {
    return edits[key] as T;
  }
  return fallback;
}

function sourceTextForRow(
  snapshot: SimpleWorkbookSnapshot | null,
  sheetName: string,
  sourceRow: number
): string | null {
  if (!snapshot) return null;
  const sheet = snapshot.sheets.find((s) => s.sheetName === sheetName);
  const row = sheet?.rows.find((r) => r.rowNumber === sourceRow);
  if (!row || row.cells.length === 0) return null;
  return row.cells
    .map((c) => c.text.trim())
    .filter((t) => t !== "")
    .join(" | ");
}

function deriveAvailableActions(args: {
  excluded: boolean;
  issueCodes: FinalIntakeRow["issueCodes"];
}): FinalRowAction[] {
  if (args.excluded) {
    return ["VIEW_DETAILS", "RESTORE"];
  }
  const actions: FinalRowAction[] = ["VIEW_DETAILS", "PICK_DXF", "EXCLUDE"];
  if (args.issueCodes.includes("MANUAL_MATCH_NOT_CONFIRMED")) {
    actions.push("CONFIRM_MANUAL_MATCH");
  }
  if (args.issueCodes.includes("MISSING_MATERIAL")) {
    actions.push("ENTER_MATERIAL");
  }
  if (args.issueCodes.includes("MISSING_THICKNESS")) {
    actions.push("ENTER_THICKNESS");
  }
  if (args.issueCodes.includes("MISSING_QUANTITY")) {
    actions.push("ENTER_QUANTITY");
  }
  if (args.issueCodes.includes("MISSING_REQUIRED_DIMENSIONS")) {
    // Reuse pick-DXF path after dims are entered; details drawer for now.
    actions.push("VIEW_DETAILS");
  }
  return actions;
}

export function deriveFinalRows(args: {
  resultRows: SimpleResultRow[];
  dxfParts: SimpleDxfPart[];
  workbookFilename: string | null;
  snapshot: SimpleWorkbookSnapshot | null;
  diagnostics?: SimpleMatchingDiagnostics | null;
  confirmedManualMatchIds?: ReadonlySet<string>;
}): FinalIntakeRow[] {
  const confirmed = args.confirmedManualMatchIds ?? new Set<string>();
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const unmatchedReasons = new Map(
    (args.diagnostics?.unmatchedReasons ?? []).map((u) => [u.rowId, u.reason])
  );

  const usageCount = new Map<string, number>();
  for (const r of args.resultRows) {
    if (r.excluded) continue;
    const id = r.match.matchedDxfId;
    if (!id) continue;
    usageCount.set(id, (usageCount.get(id) ?? 0) + 1);
  }

  const dxfFilesUploaded = args.dxfParts.length > 0;

  return args.resultRows.map((row, index) => {
    const extracted = row.extracted;
    const material = effectiveField(
      row.edits,
      "material",
      extracted.material
    );
    const thicknessMm = effectiveField(
      row.edits,
      "thicknessMm",
      extracted.thicknessMm
    );
    const quantity = effectiveField(
      row.edits,
      "quantity",
      extracted.quantity
    );
    const sourceWidthMm = effectiveField(
      row.edits,
      "widthMm",
      extracted.widthMm
    );
    const sourceLengthMm = effectiveField(
      row.edits,
      "lengthMm",
      extracted.lengthMm
    );
    const sourcePartIdRaw = effectiveField(
      row.edits,
      "partId",
      extracted.partId
    );
    const sourcePartId =
      sourcePartIdRaw == null || String(sourcePartIdRaw).trim() === ""
        ? null
        : String(sourcePartIdRaw).trim();
    const sourceProfile =
      extracted.profile == null || String(extracted.profile).trim() === ""
        ? null
        : String(extracted.profile).trim();

    const dxf =
      row.match.matchedDxfId != null
        ? (dxfById.get(row.match.matchedDxfId) ?? null)
        : null;
    const hasValidMatchedDxf =
      row.match.status === "MATCHED" &&
      dxf != null &&
      dxf.geometryStatus === "VALID";

    const normalizedDxf =
      hasValidMatchedDxf &&
      dxf!.widthMm != null &&
      dxf!.lengthMm != null &&
      dxf!.widthMm > 0 &&
      dxf!.lengthMm > 0
        ? normalizeDimensionPair(dxf!.widthMm, dxf!.lengthMm)
        : null;
    const commercialWidth = normalizedDxf?.widthMm ?? null;
    const commercialLength = normalizedDxf?.lengthMm ?? null;
    const commercialAreaM2 = hasValidMatchedDxf
      ? calcCommercialAreaM2(commercialWidth, commercialLength)
      : null;
    const density = resolvePlateDensityKgPerM3(material);
    const commercialUnitWeightKg = hasValidMatchedDxf
      ? calcCommercialUnitWeightKg({
          areaM2: commercialAreaM2,
          thicknessMm,
          densityKgPerM3: density,
        })
      : null;
    const commercialTotalWeightKg = calcCommercialTotalWeightKg({
      unitWeightKg: commercialUnitWeightKg,
      quantity,
    });

    const { displayName, displayNameSource } = resolvePartDisplayName({
      sourcePartId,
      matchedDxfPartId: dxf?.partId ?? null,
      matchedDxfFilename: dxf?.filename ?? null,
      sourceProfile,
    });

    const isManuallyMatched = row.match.method === "MANUAL";
    const isManualMatchConfirmed =
      isManuallyMatched && confirmed.has(row.resultRowId);
    const manualMatchUnconfirmed =
      isManuallyMatched &&
      row.match.matchedDxfId != null &&
      !confirmed.has(row.resultRowId);

    const duplicateDxf =
      row.match.matchedDxfId != null &&
      (usageCount.get(row.match.matchedDxfId) ?? 0) > 1;

    const unmatchedReason =
      unmatchedReasons.get(extracted.rowId) ??
      unmatchedReasons.get(row.resultRowId) ??
      null;

    const issueCodes = deriveIssueCodes({
      row,
      dxf,
      material,
      thicknessMm,
      quantity,
      sourceWidthMm,
      sourceLengthMm,
      unmatchedReason,
      duplicateDxf,
      manualMatchUnconfirmed,
      dxfFilesUploaded,
    });

    const status = deriveReviewStatus({
      excluded: row.excluded,
      hasValidMatchedDxf,
      issueCodes,
    });

    const materialClean =
      material == null || String(material).trim() === ""
        ? null
        : String(material).trim();

    const primaryLabel = primaryActionLabelHe(issueCodes);
    const primaryMessage =
      issueCodes.length === 0
        ? null
        : issueMessageHe(issueCodes[0]!, {
            sourceWidthMm,
            sourceLengthMm,
            noDxfFilesUploaded: !dxfFilesUploaded,
          });

    void primaryLabel;

    return {
      id: row.resultRowId,
      status,
      reviewStatus: status,
      part: {
        displayName,
        displayNameSource,
        sourcePartId,
        sourceProfile,
        matchedDxfId: dxf?.id ?? null,
        matchedDxfPartId: dxf?.partId ?? null,
        matchedDxfFilename: dxf?.filename ?? null,
      },
      preview: {
        dxfId: hasValidMatchedDxf ? dxf!.id : null,
        geometryAvailable: hasValidMatchedDxf,
      },
      material: materialClean,
      thicknessMm,
      quantity,
      dxfDimensions: {
        widthMm: commercialWidth,
        lengthMm: commercialLength,
      },
      commercial: {
        areaM2: commercialAreaM2,
        unitWeightKg: commercialUnitWeightKg,
        totalWeightKg: commercialTotalWeightKg,
      },
      source: {
        workbookFilename: args.workbookFilename ?? "—",
        sheetName: extracted.sheetName,
        sourceRow: extracted.sourceRow,
        sourceCell: extracted.sourceCell ?? "—",
        sourceText: sourceTextForRow(
          args.snapshot,
          extracted.sheetName,
          extracted.sourceRow
        ),
        sourceWidthMm,
        sourceLengthMm,
        sourceAreaM2: extracted.sourceAreaM2,
        sourceWeightKg: extracted.sourceWeightKg,
      },
      issueCodes,
      primaryMessage,
      availableActions: deriveAvailableActions({
        excluded: row.excluded,
        issueCodes,
      }),
      isManuallyMatched,
      isManualMatchConfirmed,
      isExcluded: row.excluded,
      match: {
        status: row.match.status,
        method: row.match.method,
        candidates: row.match.candidates.map((c) => ({
          dxfId: c.dxfId,
          partId: c.partId,
          filename: c.filename,
          widthMm: c.widthMm,
          lengthMm: c.lengthMm,
          widthDifferenceMm: c.widthDifferenceMm,
          lengthDifferenceMm: c.lengthDifferenceMm,
        })),
        message: row.match.message,
      },
      sourceOrderIndex: index,
    };
  });
}

export function summarizeFinalRows(rows: FinalIntakeRow[]): FinalResultsSummary {
  const totalRowCount = rows.length;
  const activeRows = rows.filter((r) => r.status !== "EXCLUDED");
  const rowsWithMissingQuantity = activeRows.filter(
    (r) => r.quantity == null
  ).length;
  const totalUnitCount = activeRows.reduce(
    (sum, row) => sum + (row.quantity ?? 0),
    0
  );
  const ready = rows.filter((r) => r.status === "READY").length;
  const needsReview = rows.filter((r) => r.status === "NEEDS_REVIEW").length;
  const blocked = rows.filter((r) => r.status === "BLOCKED").length;
  const excluded = rows.filter((r) => r.status === "EXCLUDED").length;

  return {
    total: totalRowCount,
    totalRowCount,
    totalUnitCount,
    rowsWithMissingQuantity,
    isTotalUnitCountComplete: rowsWithMissingQuantity === 0,
    ready,
    needsReview,
    blocked,
    excluded,
    needsAttention: needsReview + blocked,
  };
}
