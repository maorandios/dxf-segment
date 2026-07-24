/**
 * Build canonical Stage 2 items from approved material rows + match results.
 */

import { effectiveMaterialFields } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import type {
  SimpleDxfPart,
  SimpleMatchingDiagnostics,
  SimpleResultRow,
} from "../types";
import {
  calcDxfLinkMetrics,
  finalDimsFromDxf,
  formatDimsHe,
} from "./calculations";
import { isSignificantDimensionMismatch } from "./dimensionMismatch";
import type {
  DxfLinkStageDebug,
  DxfLinkStatus,
  DxfLinkedMaterialItem,
  DxfMatchLevel,
  DxfReviewIssue,
  FinalItemStatus,
} from "./types";
import {
  resolveMatchLevel,
} from "../matchWithFilenamePriority";
import { hasExplicitDxfFileName } from "../normalizeDxfFileKey";
import { resolveLinkedItemExplicitFilename } from "../buildUnifiedIntakeSummary";

function issueId(rowId: string, kind: string): string {
  return `${rowId}::${kind}`;
}

export function buildDxfLinkedMaterialItems(args: {
  materialListRows: MaterialListRow[];
  resultRows: SimpleResultRow[];
  dxfParts: SimpleDxfPart[];
  diagnostics?: SimpleMatchingDiagnostics | null;
  deferredIssueIds?: ReadonlySet<string>;
  /** Items marked for customer dim confirmation (stay as review issue). */
  customerConfirmDimMismatchIds?: ReadonlySet<string>;
  /** Items that accepted DXF dims for mismatch (resolved locally). */
  acceptedDxfDimMismatchIds?: ReadonlySet<string>;
}): DxfLinkedMaterialItem[] {
  const deferred = args.deferredIssueIds ?? new Set<string>();
  const customerConfirm =
    args.customerConfirmDimMismatchIds ?? new Set<string>();
  const acceptedDims = args.acceptedDxfDimMismatchIds ?? new Set<string>();

  const resultByExtractedId = new Map(
    args.resultRows.map((r) => [r.extracted.rowId, r])
  );
  const dxfById = new Map(args.dxfParts.map((d) => [d.id, d]));
  const unmatchedReasons = new Map(
    (args.diagnostics?.unmatchedReasons ?? []).map((u) => [u.rowId, u.reason])
  );

  return args.materialListRows.map((materialRow) => {
    const result = resultByExtractedId.get(materialRow.rowId);
    const e = effectiveMaterialFields(materialRow);
    const excluded = result?.excluded === true;
    const effectiveExplicitName = resolveLinkedItemExplicitFilename({
      materialRow,
      resultRow: result ?? null,
    });

    const match = result?.match;
    const matchedDxfId = match?.matchedDxfId ?? null;
    const dxf = matchedDxfId ? (dxfById.get(matchedDxfId) ?? null) : null;
    const candidateDxfIds = (match?.candidates ?? []).map((c) => c.dxfId);

    let dxfStatus: DxfLinkStatus = "MISSING";
    if (excluded) {
      dxfStatus = matchedDxfId ? "MATCHED" : "MISSING";
    } else if (match?.status === "MATCHED" && dxf?.geometryStatus === "VALID") {
      dxfStatus = "MATCHED";
    } else if (match?.status === "AMBIGUOUS") {
      dxfStatus = "AMBIGUOUS";
    } else if (match?.status === "INVALID_DXF" || dxf?.geometryStatus === "INVALID") {
      dxfStatus = "INVALID";
    } else {
      dxfStatus = "MISSING";
    }

    const workbookDimensions = {
      widthMm: e.widthMm,
      lengthMm: e.lengthMm,
    };
    const dxfDimensions = {
      widthMm: dxf?.widthMm ?? null,
      lengthMm: dxf?.lengthMm ?? null,
    };

    const normalizedDxf = finalDimsFromDxf(
      dxfDimensions.widthMm,
      dxfDimensions.lengthMm
    );
    const hasValidDxf = dxfStatus === "MATCHED" && normalizedDxf != null;

    let finalDimensions: DxfLinkedMaterialItem["finalDimensions"];
    if (hasValidDxf && normalizedDxf) {
      finalDimensions = {
        widthMm: normalizedDxf.widthMm,
        lengthMm: normalizedDxf.lengthMm,
        source: "DXF",
      };
    } else if (
      workbookDimensions.widthMm != null &&
      workbookDimensions.lengthMm != null &&
      workbookDimensions.widthMm > 0 &&
      workbookDimensions.lengthMm > 0
    ) {
      finalDimensions = {
        widthMm: workbookDimensions.widthMm,
        lengthMm: workbookDimensions.lengthMm,
        source: "WORKBOOK",
      };
    } else {
      finalDimensions = { widthMm: null, lengthMm: null, source: "NONE" };
    }

    const calculations =
      finalDimensions.source === "DXF"
        ? calcDxfLinkMetrics({
            finalWidthMm: finalDimensions.widthMm,
            finalLengthMm: finalDimensions.lengthMm,
            thicknessMm: e.thicknessMm,
            quantity: e.quantity,
          })
        : {
            unitAreaM2: null,
            totalAreaM2: null,
            unitWeightKg: null,
            totalWeightKg: null,
          };

    const issues: DxfReviewIssue[] = [];
    if (!excluded) {
      if (dxfStatus === "AMBIGUOUS") {
        issues.push({
          id: issueId(materialRow.rowId, "MULTIPLE_DXF"),
          kind: "MULTIPLE_DXF",
          messageHe: "נמצאו כמה קובצי DXF אפשריים לפריט.",
          customerActionable: true,
          deferred: deferred.has(issueId(materialRow.rowId, "MULTIPLE_DXF")),
        });
      } else if (dxfStatus === "INVALID") {
        issues.push({
          id: issueId(materialRow.rowId, "INVALID_DXF"),
          kind: "INVALID_DXF",
          messageHe: "לא ניתן להשתמש בקובץ ה-DXF לצורך חישוב.",
          customerActionable: true,
          deferred: deferred.has(issueId(materialRow.rowId, "INVALID_DXF")),
        });
      } else if (dxfStatus === "MISSING") {
        void unmatchedReasons.get(materialRow.rowId);
        const explicitName = effectiveExplicitName;
        if (hasExplicitDxfFileName(explicitName)) {
          issues.push({
            id: issueId(materialRow.rowId, "MISSING_EXPLICIT_DXF"),
            kind: "MISSING_EXPLICIT_DXF",
            messageHe: `קובץ ה-DXF שצוין ברשימה לא נמצא בקבצים שהועלו. (${explicitName!.trim()})`,
            customerActionable: true,
            deferred: deferred.has(
              issueId(materialRow.rowId, "MISSING_EXPLICIT_DXF")
            ),
          });
        } else {
          issues.push({
            id: issueId(materialRow.rowId, "MISSING_DXF"),
            kind: "MISSING_DXF",
            messageHe: "לא ניתן לשייך DXF באופן אוטומטי",
            customerActionable: true,
            deferred: deferred.has(issueId(materialRow.rowId, "MISSING_DXF")),
          });
        }
      }

      if (
        hasValidDxf &&
        !acceptedDims.has(materialRow.rowId) &&
        isSignificantDimensionMismatch({
          workbookWidthMm: workbookDimensions.widthMm,
          workbookLengthMm: workbookDimensions.lengthMm,
          dxfWidthMm: dxfDimensions.widthMm,
          dxfLengthMm: dxfDimensions.lengthMm,
        })
      ) {
        issues.push({
          id: issueId(materialRow.rowId, "DIMENSION_MISMATCH"),
          kind: "DIMENSION_MISMATCH",
          messageHe:
            "קיים פער משמעותי בין המידות ברשימה למידות בקובץ ה-DXF.",
          customerActionable:
            customerConfirm.has(materialRow.rowId) ||
            deferred.has(issueId(materialRow.rowId, "DIMENSION_MISMATCH")),
          deferred: deferred.has(
            issueId(materialRow.rowId, "DIMENSION_MISMATCH")
          ),
          workbookDimsLabel: formatDimsHe(
            workbookDimensions.widthMm,
            workbookDimensions.lengthMm
          ),
          dxfDimsLabel: formatDimsHe(
            dxfDimensions.widthMm,
            dxfDimensions.lengthMm
          ),
        });
      }

      if (!(e.material && e.material.trim())) {
        issues.push({
          id: issueId(materialRow.rowId, "MISSING_MATERIAL"),
          kind: "MISSING_MATERIAL",
          messageHe: "חסר סוג חומר",
          customerActionable: true,
          deferred: deferred.has(
            issueId(materialRow.rowId, "MISSING_MATERIAL")
          ),
        });
      }
      if (!(e.thicknessMm != null && e.thicknessMm > 0)) {
        issues.push({
          id: issueId(materialRow.rowId, "MISSING_THICKNESS"),
          kind: "MISSING_THICKNESS",
          messageHe: "חסר עובי",
          customerActionable: true,
          deferred: deferred.has(
            issueId(materialRow.rowId, "MISSING_THICKNESS")
          ),
        });
      }
      if (
        !(
          e.quantity != null &&
          Number.isInteger(e.quantity) &&
          e.quantity > 0
        )
      ) {
        issues.push({
          id: issueId(materialRow.rowId, "MISSING_QUANTITY"),
          kind: "MISSING_QUANTITY",
          messageHe: "חסרה כמות",
          customerActionable: true,
          deferred: deferred.has(
            issueId(materialRow.rowId, "MISSING_QUANTITY")
          ),
        });
      }
      if (
        !hasValidDxf &&
        !(
          workbookDimensions.widthMm != null &&
          workbookDimensions.lengthMm != null &&
          workbookDimensions.widthMm > 0 &&
          workbookDimensions.lengthMm > 0
        )
      ) {
        issues.push({
          id: issueId(materialRow.rowId, "MISSING_REQUIRED_DIMENSIONS"),
          kind: "MISSING_REQUIRED_DIMENSIONS",
          messageHe: "חסרות מידות הנדרשות לתמחור",
          customerActionable: true,
          deferred: deferred.has(
            issueId(materialRow.rowId, "MISSING_REQUIRED_DIMENSIONS")
          ),
        });
      }
    }

    const deferredIssueIds = issues
      .filter((i) => i.deferred)
      .map((i) => i.id);

    const finalStatus = deriveFinalItemStatus({
      excluded,
      hasValidDxf,
      issues,
      deferredIssueIds,
      customerConfirmDim: customerConfirm.has(materialRow.rowId),
    });

    const matchLevel: DxfMatchLevel = match
      ? resolveMatchLevel(match)
      : "UNASSIGNED";

    return {
      materialRowId: materialRow.rowId,
      materialRow,
      matchedDxfId,
      candidateDxfIds,
      matchedFilename: dxf?.filename ?? null,
      extractedDxfFileName: effectiveExplicitName,
      matchLevel,
      dxfStatus,
      workbookDimensions,
      dxfDimensions,
      finalDimensions,
      calculations,
      issues,
      deferredIssueIds,
      finalStatus,
    };
  });
}

function deriveFinalItemStatus(args: {
  excluded: boolean;
  hasValidDxf: boolean;
  issues: DxfReviewIssue[];
  deferredIssueIds: string[];
  customerConfirmDim: boolean;
}): FinalItemStatus {
  if (args.excluded) return "EXCLUDED";

  const kinds = new Set(args.issues.map((i) => i.kind));
  const blocking =
    kinds.has("MISSING_DXF") ||
    kinds.has("MISSING_EXPLICIT_DXF") ||
    kinds.has("INVALID_DXF") ||
    kinds.has("MISSING_MATERIAL") ||
    kinds.has("MISSING_THICKNESS") ||
    kinds.has("MISSING_QUANTITY") ||
    kinds.has("MISSING_REQUIRED_DIMENSIONS");

  if (blocking) return "BLOCKED";

  if (
    kinds.has("MULTIPLE_DXF") ||
    kinds.has("DIMENSION_MISMATCH") ||
    args.deferredIssueIds.length > 0 ||
    args.customerConfirmDim
  ) {
    return "NEEDS_REVIEW";
  }

  if (args.hasValidDxf) return "READY";
  return "BLOCKED";
}

export function summarizeDxfLinkedItems(items: DxfLinkedMaterialItem[]): {
  totalItems: number;
  knownUnits: number;
  readyItems: number;
  needsCompletion: number;
} {
  let knownUnits = 0;
  let readyItems = 0;
  let needsCompletion = 0;
  for (const item of items) {
    if (item.finalStatus === "EXCLUDED") continue;
    const q = effectiveMaterialFields(item.materialRow).quantity;
    if (typeof q === "number" && q > 0) knownUnits += q;
    if (item.finalStatus === "READY") readyItems++;
    else needsCompletion++;
  }
  return {
    totalItems: items.filter((i) => i.finalStatus !== "EXCLUDED").length,
    knownUnits,
    readyItems,
    needsCompletion,
  };
}

export function buildDxfLinkStageDebug(args: {
  items: DxfLinkedMaterialItem[];
  dxfParts: SimpleDxfPart[];
  unmatchedDxfCount: number;
  resultRows: SimpleResultRow[];
  filenameMatching?: DxfLinkStageDebug["dxfFilenameMatching"];
}): DxfLinkStageDebug {
  const { items, dxfParts } = args;
  let automaticMatchCount = 0;
  let manualMatchCount = 0;
  for (const r of args.resultRows) {
    if (r.excluded || r.match.status !== "MATCHED") continue;
    if (r.match.method === "MANUAL") manualMatchCount++;
    else automaticMatchCount++;
  }

  return {
    uploadedDxfCount: dxfParts.length,
    usableDxfCount: dxfParts.filter((d) => d.geometryStatus === "VALID").length,
    invalidDxfCount: dxfParts.filter((d) => d.geometryStatus === "INVALID")
      .length,
    unmatchedDxfCount: args.unmatchedDxfCount,
    automaticMatchCount,
    manualMatchCount,
    ambiguousItemCount: items.filter((i) => i.dxfStatus === "AMBIGUOUS").length,
    missingDxfItemCount: items.filter(
      (i) => i.dxfStatus === "MISSING" && i.finalStatus !== "EXCLUDED"
    ).length,
    invalidDxfItemCount: items.filter((i) => i.dxfStatus === "INVALID").length,
    significantDimensionMismatchCount: items.filter((i) =>
      i.issues.some((x) => x.kind === "DIMENSION_MISMATCH")
    ).length,
    readyItemCount: items.filter((i) => i.finalStatus === "READY").length,
    needsReviewItemCount: items.filter((i) => i.finalStatus === "NEEDS_REVIEW")
      .length,
    blockedItemCount: items.filter((i) => i.finalStatus === "BLOCKED").length,
    excludedItemCount: items.filter((i) => i.finalStatus === "EXCLUDED").length,
    aiCallCount: 0,
    dxfFilenameMatching: args.filenameMatching,
  };
}
