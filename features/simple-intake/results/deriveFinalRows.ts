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
import { buildCanonicalReviewSummaryFromFinalRows } from "./canonicalMaterialItemId";
import {
  calcCommercialAreaM2,
  calcCommercialTotalWeightKg,
  calcCommercialUnitWeightKg,
  resolvePlateDensityKgPerM3,
} from "./commercialCalculations";
import { comparePlateDimensions } from "../dxfLink/dimensionMismatch";
import { normalizeDimensionPair } from "../dxfLink/dimensionMismatch";
import { reconcileActiveIssueCodes } from "./activeReviewReasons";
import { deriveIssueCodes } from "./deriveIssueCodes";
import {
  deriveMaterialResolutionCategory,
  mapCategoryToReviewStatus,
  type DimensionMismatchResolution,
} from "./primaryResolutionCategory";
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
  /** Per result-row dimension mismatch resolution (USE_DXF_DIMENSIONS | UNRESOLVED). */
  dimensionMismatchResolutions?: ReadonlyMap<string, DimensionMismatchResolution>;
}): FinalIntakeRow[] {
  const confirmed = args.confirmedManualMatchIds ?? new Set<string>();
  const dimResolutions = args.dimensionMismatchResolutions ?? new Map();
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const unmatchedReasons = new Map(
    (args.diagnostics?.unmatchedReasons ?? []).map((u) => [u.rowId, u.reason])
  );

  const usageCount = new Map<string, number>();
  for (const r of args.resultRows) {
    if (r.excluded) continue;
    // Skip geometry suggestions — they are not treated as assignments.
    if (r.match.method === "GEOMETRY") continue;
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

    // In-memory migration: never treat geometry/heuristic suggestions as assigned.
    const strippedGeometry = row.match.method === "GEOMETRY";
    const effectiveMatch = strippedGeometry
      ? {
          ...row.match,
          status: "UNMATCHED" as const,
          method: null,
          matchedDxfId: null,
          candidates: [] as typeof row.match.candidates,
          message: row.match.message,
        }
      : row.match;

    const dxf =
      effectiveMatch.matchedDxfId != null
        ? (dxfById.get(effectiveMatch.matchedDxfId) ?? null)
        : null;
    const hasValidMatchedDxf =
      effectiveMatch.status === "MATCHED" &&
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

    const isManuallyMatched = effectiveMatch.method === "MANUAL";
    const exactIdentifierAssignment =
      effectiveMatch.status === "MATCHED" &&
      (effectiveMatch.method === "EXPLICIT_FILENAME" ||
        effectiveMatch.method === "EXACT_ID" ||
        effectiveMatch.method === "MANUAL");
    const isManualMatchConfirmed =
      isManuallyMatched && confirmed.has(row.resultRowId);

    const duplicateDxf =
      effectiveMatch.matchedDxfId != null &&
      (usageCount.get(effectiveMatch.matchedDxfId) ?? 0) > 1;

    const unmatchedReason =
      unmatchedReasons.get(extracted.rowId) ??
      unmatchedReasons.get(row.resultRowId) ??
      null;

    const rawDxfDimensions = {
      widthMm: hasValidMatchedDxf ? (dxf!.widthMm ?? null) : null,
      lengthMm: hasValidMatchedDxf ? (dxf!.lengthMm ?? null) : null,
    };

    const dimensionComparison = hasValidMatchedDxf
      ? comparePlateDimensions(
          { widthMm: sourceWidthMm, lengthMm: sourceLengthMm },
          rawDxfDimensions
        )
      : null;

    const dimensionMismatchResolution: DimensionMismatchResolution | null =
      dimensionComparison?.hasSignificantMismatch === true
        ? (dimResolutions.get(row.resultRowId) ?? "UNRESOLVED")
        : null;

    const rowForIssues = {
      ...row,
      match: effectiveMatch,
    };

    const rawCodes = deriveIssueCodes({
      row: rowForIssues,
      dxf,
      material,
      thicknessMm,
      quantity,
      sourceWidthMm,
      sourceLengthMm,
      unmatchedReason,
      duplicateDxf,
      manualMatchUnconfirmed: false,
      heuristicMatchUnconfirmed: false,
      dxfFilesUploaded,
      dimensionComparison,
    });

    // Strip stale suggestion / unconfirmed codes; drop mismatch when resolved.
    let issueCodes = reconcileActiveIssueCodes(rawCodes, {
      dimensionComparison,
      exactIdentifierAssignment,
    }).filter(
      (c) =>
        c !== "HEURISTIC_MATCH_UNCONFIRMED" &&
        c !== "MANUAL_MATCH_NOT_CONFIRMED"
    );

    if (dimensionMismatchResolution === "USE_DXF_DIMENSIONS") {
      issueCodes = issueCodes.filter((c) => c !== "PART_ID_DIMENSION_MISMATCH");
    }

    // Build a provisional row for category → status mapping
    const provisional: FinalIntakeRow = {
      id: row.resultRowId,
      materialRowId: extracted.rowId,
      status: "BLOCKED",
      reviewStatus: "BLOCKED",
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
      material:
        material == null || String(material).trim() === ""
          ? null
          : String(material).trim(),
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
        sourceText: null,
        sourceWidthMm,
        sourceLengthMm,
        sourceAreaM2: extracted.sourceAreaM2,
        sourceWeightKg: extracted.sourceWeightKg,
        sourceType: /SOURCE_TYPE:PDF/.test(extracted.note ?? "")
          ? "PDF"
          : "EXCEL",
        sourcePage: (() => {
          const m = (extracted.note ?? "").match(/PDF_PAGE:(\d+)/);
          return m ? Number(m[1]) : null;
        })(),
        sourceAnchorText:
          (extracted.note ?? "").match(/PDF_ANCHOR:([^|]*)/)?.[1]?.trim() ??
          null,
      },
      issueCodes,
      primaryMessage: null,
      availableActions: [],
      isManuallyMatched,
      isManualMatchConfirmed,
      isExcluded: row.excluded,
      dimensionComparison,
      rawDxfDimensions,
      dimensionMismatchResolution,
      match: {
        status: effectiveMatch.status,
        method: effectiveMatch.method,
        candidates: effectiveMatch.candidates.map((c) => ({
          dxfId: c.dxfId,
          partId: c.partId,
          filename: c.filename,
          widthMm: c.widthMm,
          lengthMm: c.lengthMm,
          widthDifferenceMm: c.widthDifferenceMm,
          lengthDifferenceMm: c.lengthDifferenceMm,
        })),
        message: effectiveMatch.message,
      },
      sourceOrderIndex: index,
    };

    const category = deriveMaterialResolutionCategory(provisional);
    const status = mapCategoryToReviewStatus(category, row.excluded);

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
    void exactIdentifierAssignment;

    const sourceText = (() => {
      const note = extracted.note ?? "";
      const anchor = note.match(/PDF_ANCHOR:([^|]*)/)?.[1]?.trim();
      if (anchor) return anchor;
      return sourceTextForRow(
        args.snapshot,
        extracted.sheetName,
        extracted.sourceRow
      );
    })();

    return {
      ...provisional,
      status,
      reviewStatus: status,
      material: materialClean,
      primaryMessage,
      availableActions: deriveAvailableActions({
        excluded: row.excluded,
        issueCodes,
      }),
      source: {
        ...provisional.source,
        sourceText,
      },
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
  const canonical = buildCanonicalReviewSummaryFromFinalRows({
    finalRows: rows,
    findingOccurrenceCount: 0,
    findingCategoryCount: 0,
  });

  return {
    total: totalRowCount,
    totalRowCount,
    totalUnitCount,
    rowsWithMissingQuantity,
    isTotalUnitCountComplete: rowsWithMissingQuantity === 0,
    ready: canonical.readyItemCount,
    needsReview: canonical.reviewItemCount,
    blocked: canonical.blockedItemCount,
    excluded: canonical.excludedItemCount,
    needsAttention: canonical.affectedItemCount,
  };
}
