/**
 * OMEGA — Canonical Review Item ID and Summary Count Fix v1
 */
import assert from "node:assert/strict";
import {
  buildIntakeAnalysisSummary,
  deriveAffectedMaterialItemIds,
} from "../buildIntakeAnalysisSummary";
import {
  buildCanonicalReviewSummaryFromFinalRows,
  getCanonicalMaterialItemId,
} from "../results/canonicalMaterialItemId";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { filterFinalRows } from "../results/filterFinalRows";
import type { MaterialListRow } from "../materialList/types";
import type { SimpleDxfPart, SimpleResultRow } from "../types";
import type { FinalIntakeRow } from "../results/types";

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
  dxfId: string;
  widthMm?: number;
  lengthMm?: number;
}): SimpleResultRow {
  return {
    resultRowId: `res_${args.rowId}`,
    status: "READY",
    excluded: false,
    extracted: {
      rowId: args.rowId,
      sheetName: "S",
      sourceRow: 1,
      sourceCell: "A1",
      partId: args.partId,
      profile: "PL10*100",
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
    match: {
      status: "MATCHED",
      method: "EXPLICIT_FILENAME",
      matchedDxfId: args.dxfId,
      candidates: [],
      message: null,
    },
    edits: {},
  };
}

console.log("=== Canonical Review Item ID and Summary Count Fix v1 ===\n");

{
  const material = materialRow({ rowId: "row_1", partId: "P1" });
  const finalLike = {
    id: "res_row_1",
    materialRowId: "row_1",
    status: "NEEDS_REVIEW" as const,
    isExcluded: false,
  };
  assertEq(
    getCanonicalMaterialItemId(finalLike),
    "row_1",
    "selector prefers materialRowId"
  );
  assertEq(
    getCanonicalMaterialItemId(material),
    "row_1",
    "selector uses material rowId"
  );
  assertEq(
    getCanonicalMaterialItemId({ id: "res_row_1" }),
    null,
    "presentation id alone is not canonical"
  );
  assertEq(
    getCanonicalMaterialItemId({
      id: "res_row_1",
      partId: "P1",
      matchedDxfFilename: "P1.dxf",
    } as { id: string }),
    null,
    "partId/filename not used"
  );
  console.log("✓ Canonical selector: materialRowId only");
}

{
  // 74 material / 74 final; IDs differ (res_row_N vs row_N); 14 NEEDS_REVIEW
  const materialRows: MaterialListRow[] = [];
  const dxfParts: SimpleDxfPart[] = [];
  const resultRows: SimpleResultRow[] = [];

  for (let i = 1; i <= 74; i++) {
    const rowId = `row_${i}`;
    const partId = `P${String(i).padStart(4, "0")}`;
    const isConflict = i <= 14;
    materialRows.push(
      materialRow({
        rowId,
        partId,
        widthMm: 100,
        lengthMm: 200,
      })
    );
    dxfParts.push(
      dxf({
        id: `d${i}`,
        filename: `${partId}.dxf`,
        partId,
        widthMm: 100,
        lengthMm: isConflict ? 345 : 200.2,
      })
    );
    resultRows.push(
      resultRow({
        rowId,
        partId,
        dxfId: `d${i}`,
        widthMm: 100,
        lengthMm: 200,
      })
    );
  }

  const finalRows = deriveFinalRows({
    resultRows,
    dxfParts,
    workbookFilename: "w.xlsx",
    snapshot: null,
  });

  assertEq(finalRows.length, 74, "74 final rows");
  assertEq(finalRows[0]!.id, "res_row_1", "presentation id");
  assertEq(finalRows[0]!.materialRowId, "row_1", "canonical materialRowId");
  assert(
    finalRows[0]!.id !== finalRows[0]!.materialRowId,
    "ids must differ"
  );

  const reviewRows = finalRows.filter((r) => r.status === "NEEDS_REVIEW");
  assertEq(reviewRows.length, 14, "14 NEEDS_REVIEW");

  const affected = deriveAffectedMaterialItemIds({ finalRows });
  assertEq(affected.size, 14, "affected set 14");
  assert(!affected.has("res_row_1"), "no presentation ids in set");
  assert(affected.has("row_1"), "canonical material ids in set");

  const table = summarizeFinalRows(finalRows);
  assertEq(table.total, 74, "table total");
  assertEq(table.needsReview, 14, "table NEEDS_REVIEW");
  assertEq(table.needsAttention, 14, "table NEEDS_ATTENTION");
  assertEq(
    filterFinalRows(finalRows, "NEEDS_REVIEW").length,
    14,
    "filter NEEDS_REVIEW"
  );
  assertEq(
    filterFinalRows(finalRows, "NEEDS_ATTENTION").length,
    14,
    "filter NEEDS_ATTENTION"
  );

  const intake = buildIntakeAnalysisSummary({
    materialRows,
    dxfParts,
    resultRows,
    finalRows,
    ready: true,
  });

  assertEq(intake.reviewMetric.affectedItemCount, 14, "summary card 14 not 28");
  assertEq(intake.issueCounts.conflictingDataCount, 14, "finding occurrences 14");
  assertEq(intake.reviewMetric.findingCategoryCount, 1, "1 finding category");
  assertEq(intake.findings.length, 1, "1 finding row");
  assertEq(
    intake.canonicalReviewSummary?.affectedItemCount,
    14,
    "canonical affected"
  );
  assertEq(
    intake.canonicalReviewSummary?.reviewItemCount,
    table.needsReview,
    "summary review === table NEEDS_REVIEW"
  );
  assertEq(
    intake.canonicalReviewSummary?.affectedItemCount,
    table.needsAttention,
    "summary affected === table NEEDS_ATTENTION"
  );
  assert(
    intake.reviewMetric.affectedItemCount <=
      intake.material.totalRows,
    "affected ≤ total"
  );
  assert(
    intake.reviewIdentityDiagnostics?.countAgreementPassed === true,
    "count agreement"
  );
  assert(
    (intake.identityMappingSample?.length ?? 0) <= 20,
    "sample ≤ 20"
  );
  console.log("✓ 74/14 res_ vs row_: summary=14, table=14, findings=14/1");
}

{
  // Findings must not inflate when final rows ready
  const finalRows: Array<
    Pick<FinalIntakeRow, "id" | "materialRowId" | "status" | "isExcluded">
  > = [
    {
      id: "res_a",
      materialRowId: "a",
      status: "NEEDS_REVIEW",
      isExcluded: false,
    },
    {
      id: "res_b",
      materialRowId: "b",
      status: "BLOCKED",
      isExcluded: false,
    },
    {
      id: "res_c",
      materialRowId: "c",
      status: "READY",
      isExcluded: false,
    },
  ];
  const canonical = buildCanonicalReviewSummaryFromFinalRows({
    finalRows,
    findingOccurrenceCount: 99,
    findingCategoryCount: 5,
  });
  assertEq(canonical.reviewItemCount, 1, "review once");
  assertEq(canonical.blockedItemCount, 1, "blocked once");
  assertEq(canonical.affectedItemCount, 2, "review+blocked");
  assertEq(canonical.findingOccurrenceCount, 99, "findings separate");
  assertEq(canonical.findingCategoryCount, 5, "categories separate");
  assertEq(
    canonical.readyItemCount +
      canonical.reviewItemCount +
      canonical.blockedItemCount +
      canonical.excludedItemCount,
    3,
    "status totals"
  );
  console.log("✓ Findings separate from affected; status totals");
}

{
  // Before final rows ready — processing / fallback; no doubled transition
  const materialRows = [
    materialRow({ rowId: "row_1", partId: "MISS" }),
    materialRow({ rowId: "row_2", partId: "OK" }),
  ];
  const dxfParts = [dxf({ id: "d1", filename: "OK.dxf", partId: "OK" })];
  const incomplete = buildIntakeAnalysisSummary({
    materialRows,
    dxfParts,
    finalRows: [
      {
        id: "res_row_2",
        materialRowId: "row_2",
        status: "READY",
        reviewStatus: "READY",
        part: {
          displayName: "OK",
          displayNameSource: "SOURCE_PART_ID",
          sourcePartId: "OK",
          sourceProfile: null,
          matchedDxfId: "d1",
          matchedDxfPartId: "OK",
          matchedDxfFilename: "OK.dxf",
        },
        preview: { dxfId: "d1", geometryAvailable: true },
        issueCodes: [],
        isExcluded: false,
        match: {
          status: "MATCHED",
          method: "EXACT_ID",
          candidates: [],
          message: null,
        },
        dimensionComparison: null,
      } as unknown as FinalIntakeRow,
    ],
    ready: false,
  });
  assertEq(incomplete.canonicalReviewSummary, null, "not ready → no canonical");
  assert(
    incomplete.reviewMetric.affectedItemCount >= 1,
    "fallback counts missing via material id"
  );
  assert(
    incomplete.reviewMetric.affectedItemCount <= materialRows.length,
    "fallback ≤ total"
  );
  console.log("✓ Fallback before finalRowsReady; no merge with presentation ids");
}

console.log("\n=== Canonical Review Item ID and Summary Count Fix v1: PASS ===");
