/**
 * OMEGA — Rotation-Invariant Dimension Comparison and Review Count Fix v1
 */
import assert from "node:assert/strict";
import {
  comparePlateDimensions,
  getComparisonScore,
  isSignificantDimensionMismatch,
  PLATE_DIMENSION_TOLERANCE,
} from "../dxfLink/dimensionMismatch";
import {
  deriveAffectedMaterialItemIds,
  enforceAffectedItemCountInvariant,
} from "../buildIntakeAnalysisSummary";
import { deriveIssueCodes } from "../results/deriveIssueCodes";
import { deriveReviewStatus } from "../results/deriveReviewStatus";
import type { FinalIntakeRow } from "../results/types";
import type { SimpleDxfPart, SimpleResultRow } from "../types";

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: ${String(actual)} !== ${String(expected)}`);
}

function resultRow(
  rowId: string,
  match: SimpleResultRow["match"]
): SimpleResultRow {
  return {
    resultRowId: rowId,
    status: "READY",
    excluded: false,
    extracted: {
      rowId,
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      partId: rowId,
      profile: null,
      description: null,
      material: "S355",
      thicknessMm: 10,
      quantity: 1,
      widthMm: 183,
      lengthMm: 67,
      sourceAreaM2: null,
      sourceWeightKg: null,
      note: null,
      dxfFileName: `${rowId}.dxf`,
      confidence: 1,
      warnings: [],
    },
    edits: {},
    match,
  };
}

function dxfPart(partial: {
  id: string;
  filename: string;
  widthMm: number;
  lengthMm: number;
}): SimpleDxfPart {
  return {
    id: partial.id,
    filename: partial.filename,
    partId: partial.id,
    widthMm: partial.widthMm,
    lengthMm: partial.lengthMm,
    areaMm2: partial.widthMm * partial.lengthMm,
    geometryStatus: "VALID",
    error: null,
    fingerprint: `fp:${partial.id}`,
    contentHash: `hash:${partial.id}`,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

console.log("=== Rotation-Invariant Dimension Comparison v1 ===\n");

{
  // p1012 — swapped axes with rounding
  const comparison = comparePlateDimensions(
    { widthMm: 183, lengthMm: 67 },
    { widthMm: 66.5, lengthMm: 183 }
  );
  assert(comparison, "comparison exists");
  assertEq(comparison!.orientation, "ROTATED", "p1012 orientation");
  assertEq(comparison!.maxAbsoluteDifferenceMm, 0.5, "p1012 max abs");
  assertEq(comparison!.hasSignificantMismatch, false, "p1012 no mismatch");
  assertEq(comparison!.isWithinTolerance, true, "p1012 within tol");
  assert(
    !isSignificantDimensionMismatch({
      workbookWidthMm: 183,
      workbookLengthMm: 67,
      dxfWidthMm: 66.5,
      dxfLengthMm: 183,
    }),
    "p1012 wrapper false"
  );
  console.log("✓ p1012 swapped axes + rounding → ROTATED, within tolerance");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 183, lengthMm: 67 },
    { widthMm: 183, lengthMm: 66.5 }
  );
  assertEq(comparison!.orientation, "DIRECT", "same orient DIRECT");
  assertEq(comparison!.hasSignificantMismatch, false, "rounding ok");
  console.log("✓ Same orientation with rounding → DIRECT, within tolerance");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 183, lengthMm: 67 },
    { widthMm: 67, lengthMm: 183 }
  );
  assertEq(comparison!.orientation, "ROTATED", "exact swap ROTATED");
  assertEq(comparison!.hasSignificantMismatch, false, "exact swap ok");
  assertEq(comparison!.maxAbsoluteDifferenceMm, 0, "exact swap zero diff");
  console.log("✓ Exact swapped dimensions → ROTATED, no mismatch");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 183, lengthMm: 67 },
    { widthMm: 183, lengthMm: 72 }
  );
  assertEq(comparison!.hasSignificantMismatch, true, "real mismatch");
  assert(
    isSignificantDimensionMismatch({
      workbookWidthMm: 183,
      workbookLengthMm: 67,
      dxfWidthMm: 183,
      dxfLengthMm: 72,
    }),
    "wrapper true"
  );
  console.log("✓ Real significant mismatch detected");
}

{
  // Absolute only — 3mm on 2000mm is < 1%
  const comparison = comparePlateDimensions(
    { widthMm: 2000, lengthMm: 1000 },
    { widthMm: 2003, lengthMm: 1000 },
    PLATE_DIMENSION_TOLERANCE
  );
  assertEq(comparison!.hasSignificantMismatch, false, "abs only not enough");
  console.log("✓ Absolute-only threshold does not trigger mismatch");
}

{
  // Relative only — 1.5mm on 100mm = 1.5% > 1%, but abs ≤ 2
  const comparison = comparePlateDimensions(
    { widthMm: 100, lengthMm: 50 },
    { widthMm: 101.5, lengthMm: 50 },
    PLATE_DIMENSION_TOLERANCE
  );
  assertEq(comparison!.hasSignificantMismatch, false, "rel only not enough");
  console.log("✓ Relative-only threshold does not trigger mismatch");
}

{
  // Both exceeded — 5mm on 100mm = 5%
  const comparison = comparePlateDimensions(
    { widthMm: 100, lengthMm: 50 },
    { widthMm: 105, lengthMm: 50 },
    PLATE_DIMENSION_TOLERANCE
  );
  assertEq(comparison!.hasSignificantMismatch, true, "both thresholds");
  console.log("✓ Both thresholds exceeded → mismatch");
}

{
  assert.equal(
    comparePlateDimensions(
      { widthMm: null, lengthMm: 67 },
      { widthMm: 66.5, lengthMm: 183 }
    ),
    null,
    "missing source"
  );
  assert.equal(
    comparePlateDimensions(
      { widthMm: 183, lengthMm: 67 },
      { widthMm: 0, lengthMm: 183 }
    ),
    null,
    "non-positive dxf"
  );
  assert.equal(
    comparePlateDimensions(
      { widthMm: Number.NaN, lengthMm: 67 },
      { widthMm: 66.5, lengthMm: 183 }
    ),
    null,
    "non-finite"
  );
  console.log("✓ Missing / invalid dimensions return null (not mismatch)");
}

{
  const direct = comparePlateDimensions(
    { widthMm: 100, lengthMm: 200 },
    { widthMm: 100, lengthMm: 200 }
  )!;
  const rotated = comparePlateDimensions(
    { widthMm: 100, lengthMm: 200 },
    { widthMm: 200, lengthMm: 100 }
  )!;
  assertEq(direct.orientation, "DIRECT", "tie prefers DIRECT");
  assertEq(rotated.orientation, "ROTATED", "swap selects ROTATED");
  assert(
    getComparisonScore(direct)[4] === 0 && getComparisonScore(rotated)[4] === 1,
    "score tie-break DIRECT preferred"
  );
  console.log("✓ Deterministic orientation selection / DIRECT tie-break");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 183, lengthMm: 67 },
    { widthMm: 66.5, lengthMm: 183 }
  );
  const codes = deriveIssueCodes({
    row: resultRow("p1012", {
      status: "MATCHED",
      method: "EXPLICIT_FILENAME",
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    }),
    dxf: dxfPart({
      id: "d1",
      filename: "p1012.dxf",
      widthMm: 66.5,
      lengthMm: 183,
    }),
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    sourceWidthMm: 183,
    sourceLengthMm: 67,
    unmatchedReason: null,
    duplicateDxf: false,
    manualMatchUnconfirmed: false,
    heuristicMatchUnconfirmed: false,
    dxfFilesUploaded: true,
    dimensionComparison: comparison,
  });
  assert(!codes.includes("PART_ID_DIMENSION_MISMATCH"), "no dim issue");
  const status = deriveReviewStatus({
    excluded: false,
    hasValidMatchedDxf: true,
    issueCodes: codes,
  });
  assertEq(status, "READY", "READY when only rotation/rounding");
  console.log("✓ p1012 → no issue, finalStatus READY");
}

{
  const comparison = comparePlateDimensions(
    { widthMm: 183, lengthMm: 67 },
    { widthMm: 183, lengthMm: 72 }
  );
  const codes = deriveIssueCodes({
    row: resultRow("bad", {
      status: "MATCHED",
      method: "EXPLICIT_FILENAME",
      matchedDxfId: "d1",
      candidates: [],
      message: null,
    }),
    dxf: dxfPart({
      id: "d1",
      filename: "bad.dxf",
      widthMm: 183,
      lengthMm: 72,
    }),
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    sourceWidthMm: 183,
    sourceLengthMm: 67,
    unmatchedReason: null,
    duplicateDxf: false,
    manualMatchUnconfirmed: false,
    dxfFilesUploaded: true,
    dimensionComparison: comparison,
  });
  assert(codes.includes("PART_ID_DIMENSION_MISMATCH"), "mismatch issue");
  const status = deriveReviewStatus({
    excluded: false,
    hasValidMatchedDxf: true,
    issueCodes: codes,
  });
  assertEq(status, "NEEDS_REVIEW", "true mismatch needs review");
  console.log("✓ True mismatch → NEEDS_REVIEW");
}

{
  // Count deduplication: 74 NEEDS_REVIEW rows + inflated occurrence set
  const finalRows: Array<
    Pick<FinalIntakeRow, "id" | "status" | "issueCodes" | "isExcluded">
  > = [];
  for (let i = 0; i < 74; i++) {
    finalRows.push({
      id: `r${i}`,
      status: "NEEDS_REVIEW",
      issueCodes: ["HEURISTIC_MATCH_UNCONFIRMED", "PART_ID_DIMENSION_MISMATCH"],
      isExcluded: false,
    });
  }
  const affected = deriveAffectedMaterialItemIds({ finalRows });
  assertEq(affected.size, 74, "unique affected = 74");
  const inv = enforceAffectedItemCountInvariant({
    affectedItemIds: new Set([...affected, ...Array.from({ length: 14 }, (_, i) => `extra-${i}`)]),
    materialRowIds: new Set(finalRows.map((r) => r.id)),
    materialItemCount: 74,
    finalRows,
  });
  assertEq(inv.affectedItemIds.size, 74, "invariant restores ≤ 74");
  assertEq(inv.affectedCountInvariantPassed, false, "logged failure");
  console.log("✓ Affected count deduplicates; invariant holds ≤ material");
}

{
  const finalRows: Array<
    Pick<FinalIntakeRow, "id" | "status" | "issueCodes" | "isExcluded">
  > = [];
  for (let i = 0; i < 74; i++) {
    let issueCodes: FinalIntakeRow["issueCodes"] = [];
    if (i < 14) {
      // 11 singles + 3 doubles = 17... aim for 25: 3 rows × 3 codes + 11 × 1 = 9+11=20
      // 5 rows × 3 + 9 × 1 = 15+9=24; +1 more = 25
      if (i < 5) {
        issueCodes = [
          "NO_DXF_FOUND",
          "MISSING_QUANTITY",
          "MISSING_THICKNESS",
        ];
      } else if (i === 5) {
        issueCodes = ["NO_DXF_FOUND", "MISSING_QUANTITY"];
      } else {
        issueCodes = ["NO_DXF_FOUND"];
      }
    }
    finalRows.push({
      id: `r${i}`,
      status: i < 14 ? "NEEDS_REVIEW" : "READY",
      issueCodes,
      isExcluded: false,
    });
  }
  const affected = deriveAffectedMaterialItemIds({ finalRows });
  assertEq(affected.size, 14, "14 unique affected");
  let occurrence = 0;
  for (const row of finalRows) occurrence += row.issueCodes.length;
  assertEq(occurrence, 25, "25 issue occurrences");
  console.log("✓ Partial affected rows: unique 14, occurrences 25");
}

console.log("\n=== Rotation-Invariant Dimension Comparison v1 passed ===");
