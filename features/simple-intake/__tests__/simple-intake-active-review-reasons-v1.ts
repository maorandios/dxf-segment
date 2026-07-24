/**
 * OMEGA — Canonical Active Review Reasons and Status Count Fix v1
 */
import assert from "node:assert/strict";
import {
  buildUnifiedReviewSummary,
  deriveUnifiedItemStatus,
  getActiveBlockingReasons,
  getActiveReviewReasons,
  reconcileActiveIssueCodes,
} from "../results/activeReviewReasons";
import { comparePlateDimensions } from "../dxfLink/dimensionMismatch";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { filterFinalRows } from "../results/filterFinalRows";
import { resolveMatchLevel } from "../matchWithFilenamePriority";
import { buildIntakeAnalysisSummary } from "../buildIntakeAnalysisSummary";
import type { MaterialListRow } from "../materialList/types";
import type { SimpleDxfPart, SimpleResultRow } from "../types";
import type { FinalIssueCode } from "../results/types";

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function materialRow(partial: {
  rowId: string;
  partId: string;
  widthMm?: number;
  lengthMm?: number;
}): MaterialListRow {
  return {
    rowId: partial.rowId,
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: partial.partId,
    profile: "PL10*100",
    description: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    dxfFileName: `${partial.partId}.dxf`,
    userOverrides: {},
    fieldResolutions: {},
    approvalStatus: "COMPLETE",
  };
}

function dxf(partial: {
  id: string;
  filename: string;
  partId?: string;
  widthMm?: number;
  lengthMm?: number;
}): SimpleDxfPart {
  const partId = partial.partId ?? partial.id;
  return {
    id: partial.id,
    filename: partial.filename,
    partId,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: (partial.widthMm ?? 100) * (partial.lengthMm ?? 200),
    geometryStatus: "VALID",
    error: null,
    fingerprint: `fp:${partial.id}`,
    contentHash: `hash:${partial.id}`,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

function resultRow(args: {
  rowId: string;
  partId: string;
  method: "EXACT_ID" | "EXPLICIT_FILENAME" | "GEOMETRY";
  dxfId: string;
  widthMm?: number;
  lengthMm?: number;
}): SimpleResultRow {
  return {
    resultRowId: args.rowId,
    status: "READY",
    excluded: false,
    extracted: {
      rowId: args.rowId,
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      partId: args.partId,
      profile: null,
      description: null,
      material: "S355",
      thicknessMm: 10,
      quantity: 1,
      widthMm: args.widthMm ?? 100,
      lengthMm: args.lengthMm ?? 200,
      sourceAreaM2: null,
      sourceWeightKg: null,
      note: null,
      dxfFileName: `${args.partId}.dxf`,
      confidence: 1,
      warnings: [],
    },
    edits: {},
    match: {
      status: "MATCHED",
      method: args.method,
      matchedDxfId: args.dxfId,
      candidates: [],
      message: null,
    },
  };
}

console.log("=== Canonical Active Review Reasons v1 ===\n");

{
  assertEq(
    resolveMatchLevel({
      status: "MATCHED",
      method: "EXACT_ID",
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    }),
    "CERTAIN",
    "EXACT_ID is CERTAIN"
  );
  assertEq(
    resolveMatchLevel({
      status: "MATCHED",
      method: "EXPLICIT_FILENAME",
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    }),
    "CERTAIN",
    "filename CERTAIN"
  );
  assertEq(
    resolveMatchLevel({
      status: "MATCHED",
      method: "GEOMETRY",
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    }),
    "SUGGESTED",
    "geometry SUGGESTED"
  );
  console.log("✓ Exact unique identifier assignment is CERTAIN");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 100, lengthMm: 200 },
    { widthMm: 100.24, lengthMm: 200 }
  );
  assert(comparison && !comparison.hasSignificantMismatch, "within tol");
  const codes = reconcileActiveIssueCodes(
    ["PART_ID_DIMENSION_MISMATCH", "HEURISTIC_MATCH_UNCONFIRMED"],
    {
      dimensionComparison: comparison,
      exactIdentifierAssignment: true,
    }
  );
  assert(!codes.includes("PART_ID_DIMENSION_MISMATCH"), "drop mismatch");
  assert(!codes.includes("HEURISTIC_MATCH_UNCONFIRMED"), "drop heuristic");
  const status = deriveUnifiedItemStatus({
    isExcluded: false,
    hasValidMatchedDxf: true,
    issueCodes: codes,
    dimensionComparison: comparison,
    exactIdentifierAssignment: true,
  });
  assertEq(status, "READY", "READY when within tolerance + exact");
  assertEq(
    getActiveReviewReasons(codes, {
      issueCodes: codes,
      dimensionComparison: comparison,
      exactIdentifierAssignment: true,
    }).length,
    0,
    "no active review reasons"
  );
  console.log("✓ Within-tolerance + exact assignment → READY, no review reasons");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 100, lengthMm: 200 },
    { widthMm: 100, lengthMm: 345 }
  );
  assert(comparison?.hasSignificantMismatch, "significant");
  const codes: FinalIssueCode[] = ["PART_ID_DIMENSION_MISMATCH"];
  const status = deriveUnifiedItemStatus({
    isExcluded: false,
    hasValidMatchedDxf: true,
    issueCodes: codes,
    dimensionComparison: comparison,
    exactIdentifierAssignment: true,
  });
  assertEq(status, "NEEDS_REVIEW", "mismatch needs review");
  assert(
    getActiveReviewReasons(codes, {
      issueCodes: codes,
      dimensionComparison: comparison,
    }).includes("PART_ID_DIMENSION_MISMATCH"),
    "active dim mismatch"
  );
  console.log("✓ Significant mismatch remains active NEEDS_REVIEW");
}

{
  // 74/14 regression fixture via deriveFinalRows
  const resultRows: SimpleResultRow[] = [];
  const dxfParts: SimpleDxfPart[] = [];
  const materialRows: MaterialListRow[] = [];

  for (let i = 0; i < 74; i++) {
    const id = `P${String(i).padStart(4, "0")}`;
    const isConflict = i < 14;
    const sourceW = 100;
    const sourceL = 200;
    const dxfL = isConflict ? 345 : 200.2;
    materialRows.push(
      materialRow({
        rowId: `r${i}`,
        partId: id,
        widthMm: sourceW,
        lengthMm: sourceL,
      })
    );
    dxfParts.push(
      dxf({
        id: `d${i}`,
        filename: `${id}.dxf`,
        partId: id,
        widthMm: sourceW,
        lengthMm: dxfL,
      })
    );
    resultRows.push(
      resultRow({
        rowId: `r${i}`,
        partId: id,
        method: "EXPLICIT_FILENAME",
        dxfId: `d${i}`,
        widthMm: sourceW,
        lengthMm: sourceL,
      })
    );
  }

  const finalRows = deriveFinalRows({
    resultRows,
    dxfParts,
    workbookFilename: "w.xlsx",
    snapshot: null,
  });
  const summaryCounts = summarizeFinalRows(finalRows);
  assertEq(finalRows.length, 74, "74 rows");
  assertEq(summaryCounts.ready, 60, "60 ready");
  assertEq(summaryCounts.needsReview, 14, "14 review");
  assertEq(summaryCounts.blocked, 0, "0 blocked");
  assertEq(filterFinalRows(finalRows, "READY").length, 60, "filter ready");
  assertEq(
    filterFinalRows(finalRows, "NEEDS_REVIEW").length,
    14,
    "filter review"
  );

  const intake = buildIntakeAnalysisSummary({
    materialRows,
    dxfParts,
    resultRows,
    finalRows,
    ready: true,
  });
  assertEq(intake.reviewMetric.affectedItemCount, 14, "summary card 14");
  assertEq(intake.issueCounts.conflictingDataCount, 14, "findings 14");
  assertEq(intake.findings.length, 1, "one finding category");
  assertEq(
    intake.activeReviewDiagnostics.readyItemCount,
    60,
    "diag ready 60"
  );
  assertEq(
    intake.activeReviewDiagnostics.reviewItemCount,
    14,
    "diag review 14"
  );
  assert(
    intake.activeReviewDiagnostics.statusCountInvariantPassed,
    "status invariant"
  );
  console.log("✓ 74/14 fixture: card=14, ready=60, findings agree, filters agree");
}

{
  const blocking = getActiveBlockingReasons([
    "MISSING_QUANTITY",
    "PART_ID_DIMENSION_MISMATCH",
  ]);
  assertEq(blocking.length, 1, "one blocking");
  assertEq(blocking[0], "MISSING_QUANTITY", "qty");
  const status = deriveUnifiedItemStatus({
    isExcluded: false,
    hasValidMatchedDxf: true,
    issueCodes: ["MISSING_QUANTITY"],
  });
  assertEq(status, "BLOCKED", "blocked");
  console.log("✓ Blocking reasons force BLOCKED");
}

{
  const items = Array.from({ length: 10 }, (_, i) => ({
    id: `r${i}`,
    isExcluded: false,
    status: (i < 3 ? "NEEDS_REVIEW" : "READY") as "NEEDS_REVIEW" | "READY",
    issueCodes: (i < 3
      ? (["PART_ID_DIMENSION_MISMATCH"] as FinalIssueCode[])
      : ([] as FinalIssueCode[])),
    hasValidMatchedDxf: true,
    exactIdentifierAssignment: true,
  }));
  const s = buildUnifiedReviewSummary(items);
  assertEq(s.totalItemCount, 10, "total");
  assertEq(s.reviewItemCount, 3, "review");
  assertEq(s.readyItemCount, 7, "ready");
  assert(
    s.readyItemCount + s.reviewItemCount + s.blockedItemCount + s.excludedItemCount ===
      s.totalItemCount,
    "sum invariant"
  );
  console.log("✓ Canonical count selector invariants");
}

console.log("\n=== Canonical Active Review Reasons v1 passed ===");
