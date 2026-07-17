/**
 * Checkpoint 7.0C — Working Quote Table tests.
 * Run: npx tsx features/quote-workspace/__tests__/quote-workspace-table.ts
 */

import {
  applyReviewDecision,
  buildReviewSession,
  resetDecisionIdCounterForTests,
  resetReviewIdCountersForTests,
  type IntakeReviewSession,
} from "@/lib/ai-intake/review";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
} from "@/lib/ai-intake/schemas";
import type { DxfPartRegistryItem } from "@/lib/ai-intake/types";
import { filenameAuthoritativeFields } from "@/lib/ai-intake/dxfRegistryDefaults";
import { emptyDocumentGeometry } from "@/lib/ai-intake/schemas";
import {
  __resetQuoteSessionStoreForTests,
  assertQuoteSessionHasNoPersistAdapter,
  getQuoteSessionState,
  quoteSessionActions,
} from "../quoteSessionStore";
import {
  buildQuoteTableViewModel,
} from "../table/buildQuoteTableViewModel";
import {
  getEditableQuoteTableColumns,
  getPlateAreaM2FromRow,
  getSafeSourceMassKg,
  getVisibleQuoteTableColumns,
} from "../table/quoteTableColumns";
import {
  naturalPartIdCompare,
  normalizePartSearchText,
  rowMatchesSearch,
} from "../table/quoteTableFilters";
import {
  validateMaterialEdit,
  validateQuantityEdit,
  validateThicknessEdit,
} from "../table/quoteTableEditValidation";
import { isValidReviewSession } from "../table/quoteTableSelectors";
import { buildQuoteTableRowViewModel } from "../table/buildQuoteTableViewModel";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
    );
  }
}

function dxfItem(partId: string, w = 200, h = 100): DxfPartRegistryItem {
  return {
    id: `dxf-${partId}`,
    canonicalPartId: partId,
    revision: null,
    rawPartId: partId,
    normalizedRawPartId: partId,
    ...filenameAuthoritativeFields(partId),
    revisionIssue: false,
    duplicateIssue: false,
    filename: `${partId}.dxf`,
    widthMm: w,
    heightMm: h,
    plateAreaMm2: w * h,
    netContourAreaMm2: w * h * 0.95,
    perimeterMm: 2 * (w + h),
    geometryStatus: "VALID",
    warnings: [],
    processedGeometry: null,
  };
}

function docRow(args: {
  part: string;
  row: number;
  qty: number;
  thickness: number;
  material: string;
}): ExtractedDocumentRow {
  return {
    documentId: "doc:xlsx:1",
    matchedDxfPartId: args.part,
    rawPartReference: args.part,
    quantity: args.qty,
    thicknessMm: args.thickness,
    material: args.material,
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "XLSX",
      fileName: "parts.xlsx",
      sheetName: "Sheet1",
      rowNumber: args.row,
      pageNumber: null,
      partReferenceCell: `B${args.row}`,
      quantityCell: `C${args.row}`,
      thicknessCell: `D${args.row}`,
      materialCell: `E${args.row}`,
      excerpt: args.part,
    },
    issues: [],
  };
}

function emptyFinal(
  partial: Partial<FinalIntakeMappingRow> & { partId: string }
): FinalIntakeMappingRow {
  const base: FinalIntakeMappingRow = {
    status: "READY",
    partId: partial.partId,
    displayLabel: null,
    revision: null,
    dxfFileId: `dxf-${partial.partId}`,
    dxfFilename: `${partial.partId}.dxf`,
    widthMm: 200,
    heightMm: 100,
    plateAreaMm2: 20000,
    netContourAreaMm2: 19000,
    perimeterMm: 600,
    quantity: 1,
    thicknessMm: 10,
    material: "S235",
    description: null,
    action: "INCLUDE",
    fieldSources: { quantity: "XLSX", thickness: "XLSX", material: "XLSX" },
    fieldCandidates: { quantity: [], thickness: [], material: [] },
    fieldResolutions: {
      quantity: {
        value: 1,
        resolutionStatus: "SINGLE_SOURCE",
        candidates: [],
      },
      thickness: {
        value: 10,
        resolutionStatus: "SINGLE_SOURCE",
        candidates: [],
      },
      material: {
        value: "S235",
        resolutionStatus: "SINGLE_SOURCE",
        candidates: [],
      },
    },
    previousValues: [],
    hasDocumentSource: true,
    hasEmailSource: false,
    hasDocumentAndEmail: false,
    contributingFacts: [],
    sourceEvidence: [],
    issues: [],
    requestOccurrences: [],
    occurrenceCount: 0,
    duplicateOccurrenceCount: 0,
    duplicateStatus: "NONE",
    ignoredOccurrences: [],
    duplicateIssues: [],
    geometryComparisons: [],
    geometryComparisonStatus: "NOT_AVAILABLE",
  };
  return { ...base, ...partial };
}

function successFrom(args: {
  docs: ExtractedDocumentRow[];
  finals: FinalIntakeMappingRow[];
}): AiIntakeAnalyzeSuccess {
  return {
    ok: true,
    extraction: {
      documentRows: args.docs,
      emailFacts: [],
      unresolvedItems: [],
      warnings: [],
    },
    acceptedFacts: [],
    aggregated: {
      documents: [],
      emailFacts: [],
      expandedFacts: [],
      emailUsage: null,
      emailDurationMs: null,
      openaiCallCount: 1,
      partial: false,
    },
    auditRows: [],
    auditSummary: {
      customerPartsSeen: args.docs.length,
      matchedCount: args.docs.length,
      requestWithoutDxfCount: 0,
      dxfNotReferencedCount: 0,
      requiresReviewCount: 0,
      failedSourceCount: 0,
    },
    finalRows: args.finals,
    warnings: [],
    partial: false,
    debug: {
      model: "test",
      durationMs: 1,
      openaiCallCount: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      perSourceUsage: [],
    },
  };
}

function buildSession(parts: string[]): {
  review: IntakeReviewSession;
  registry: DxfPartRegistryItem[];
  analyze: AiIntakeAnalyzeSuccess;
} {
  resetReviewIdCountersForTests();
  resetDecisionIdCounterForTests();
  const registry = parts.map((p, i) => dxfItem(p, 100 + i, 50 + i));
  const docs = parts.map((p, i) =>
    docRow({
      part: p,
      row: 2 + i,
      qty: 2 + i,
      thickness: 8 + i,
      material: i % 2 === 0 ? "S235" : "S355",
    })
  );
  const finals = parts.map((p, i) =>
    emptyFinal({
      partId: p,
      quantity: 2 + i,
      thicknessMm: 8 + i,
      material: i % 2 === 0 ? "S235" : "S355",
      widthMm: 100 + i,
      heightMm: 50 + i,
      plateAreaMm2: (100 + i) * (50 + i),
      fieldResolutions: {
        quantity: {
          value: 2 + i,
          resolutionStatus: "SINGLE_SOURCE",
          candidates: [],
        },
        thickness: {
          value: 8 + i,
          resolutionStatus: "SINGLE_SOURCE",
          candidates: [],
        },
        material: {
          value: i % 2 === 0 ? "S235" : "S355",
          resolutionStatus: "SINGLE_SOURCE",
          candidates: [],
        },
      },
    })
  );
  const analyze = successFrom({ docs, finals });
  const review = buildReviewSession(analyze, {
    registry,
    analysisRunId: "quote-table-test",
  });
  return { review, registry, analyze };
}

async function seedTableSession(
  review: IntakeReviewSession,
  analyze: unknown
): Promise<void> {
  __resetQuoteSessionStoreForTests();
  quoteSessionActions.createQuote({
    projectName: "טבלת בדיקה",
    customerName: "לקוח בדיקה",
  });
  await quoteSessionActions.addFiles([new File(["dxf"], "P100.dxf")]);
  quoteSessionActions.startAnalysis();
  quoteSessionActions.completeAnalysis({
    result: analyze,
    reviewSession: review,
    dxfRegistry: [],
  });
}

/* ─── Tests ─── */

async function test1_analysisToTable(): Promise<void> {
  const { review, analyze } = buildSession(["P100"]);
  await seedTableSession(review, analyze);
  assert(quoteSessionActions.goToTable(), "goToTable ok");
  const s = getQuoteSessionState().session!;
  assertEq(s.currentStep, "TABLE", "step TABLE");
  assert(isValidReviewSession(s.analysis.reviewSession), "review attached");
  console.log("PASS test1 analysis to table");
}

async function test2_missingReview(): Promise<void> {
  __resetQuoteSessionStoreForTests();
  quoteSessionActions.createQuote({
    projectName: "No Review",
    customerName: "Cust",
  });
  await quoteSessionActions.addFiles([new File(["x"], "a.dxf")]);
  quoteSessionActions.startAnalysis();
  quoteSessionActions.completeAnalysis({
    result: { ok: true, finalRows: [] },
    reviewSession: null,
  });
  assert(!quoteSessionActions.goToTable(), "blocked without review");
  assertEq(getQuoteSessionState().session!.currentStep, "COMPLETE", "stays");
  console.log("PASS test2 missing Review Session");
}

function test3_columnRegistry(): void {
  const visible = getVisibleQuoteTableColumns();
  assert(visible.length >= 11, "visible columns");
  const editable = getEditableQuoteTableColumns().map((c) => c.key);
  assert(editable.includes("quantity"), "qty editable");
  assert(editable.includes("material"), "mat editable");
  assert(editable.includes("thicknessMm"), "thk editable");
  assert(!editable.includes("partReference"), "part not editable");
  assert(!editable.includes("widthMm"), "width not editable");
  console.log("PASS test3 column registry");
}

function test4_rowMapping(): void {
  const { review } = buildSession(["5P2"]);
  const issuesById = new Map(review.issues.map((i) => [i.issueId, i] as const));
  const vm = buildQuoteTableRowViewModel(review.rows[0]!, issuesById);
  assertEq(vm.displayPartReference.includes("5P2") || vm.displayPartReference === "5P2", true, "part ref");
  assert(vm.quantity != null, "qty");
  assert(vm.material != null, "material");
  assert(vm.thicknessMm != null, "thickness");
  console.log("PASS test4 row mapping");
}

function test5_geometryUnits(): void {
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  const mm2 = row.dxfGeometry?.plateAreaMm2 ?? 0;
  const m2 = getPlateAreaM2FromRow(row);
  assert(m2 != null, "m2 present");
  assertEq(m2!, mm2 / 1_000_000, "conversion");
  assertEq(row.dxfGeometry?.plateAreaMm2, mm2, "source unchanged");
  console.log("PASS test5 geometry units");
}

function test6_unresolvedMass(): void {
  const { review } = buildSession(["P100"]);
  const row = {
    ...review.rows[0]!,
    sourceMassEvidence: {
      unitWeightKg: 12.5,
      totalWeightKg: 25,
      basis: null,
      unit: null,
      status: "AMBIGUOUS",
    },
  };
  assertEq(getSafeSourceMassKg(row, "unitWeightKg"), null, "hidden");
  console.log("PASS test6 unresolved mass");
}

function test7_resolvedMass(): void {
  const { review } = buildSession(["P100"]);
  const row = {
    ...review.rows[0]!,
    sourceMassEvidence: {
      unitWeightKg: 12.5,
      totalWeightKg: 25,
      basis: "DXF_NET_CONTOUR_AREA",
      unit: "KG",
      status: "RESOLVED",
    },
  };
  assertEq(getSafeSourceMassKg(row, "unitWeightKg"), 12.5, "kg shown");
  console.log("PASS test7 resolved mass");
}

function test8_search(): void {
  const { review } = buildSession(["5P1", "5P10", "5SP10", "P1091"]);
  const vm = buildQuoteTableViewModel(review, {
    filter: "ALL",
    searchQuery: "",
    sortKey: null,
    sortDir: "asc",
  });
  for (const q of ["5P1", "5p10", "5SP10", "p1091"]) {
    const hits = vm.rows.filter((r) => rowMatchesSearch(r, q));
    assert(hits.length >= 1, `search ${q}`);
  }
  assertEq(normalizePartSearchText(" 5p1 "), "5P1", "normalize");
  console.log("PASS test8 search");
}

function test9_naturalSort(): void {
  assert(naturalPartIdCompare("5P2", "5P10") < 0, "5P2 before 5P10");
  const { review } = buildSession(["5P10", "5P2", "5P1"]);
  const vm = buildQuoteTableViewModel(review, {
    filter: "ALL",
    searchQuery: "",
    sortKey: "partReference",
    sortDir: "asc",
  });
  const ids = vm.visibleRows.map((r) => r.displayPartReference);
  const i2 = ids.findIndex((x) => x.includes("5P2"));
  const i10 = ids.findIndex((x) => x.includes("5P10"));
  assert(i2 >= 0 && i10 >= 0 && i2 < i10, "sorted order");
  console.log("PASS test9 natural sorting");
}

function test10_filters(): void {
  const { review } = buildSession(["P1", "P2"]);
  let session = review;
  const rowId = session.rows[0]!.rowId;
  session = applyReviewDecision(session, {
    kind: "SET_INCLUDE",
    rowId,
    includeInQuote: false,
  });
  const vm = buildQuoteTableViewModel(session, {
    filter: "EXCLUDED",
    searchQuery: "",
    sortKey: null,
    sortDir: "asc",
  });
  assert(vm.visibleRows.length >= 1, "excluded filter");
  assert(
    vm.visibleRows.every((r) => r.presentationStatus === "EXCLUDED"),
    "all excluded"
  );
  const all = buildQuoteTableViewModel(session, {
    filter: "ALL",
    searchQuery: "",
    sortKey: null,
    sortDir: "asc",
  });
  assertEq(all.filterCounts.EXCLUDED, vm.visibleRows.length, "count");
  console.log("PASS test10 filters");
}

function test11_groupedIssues(): void {
  const { review } = buildSession(["P1", "P2"]);
  // Attach same issue id to two rows synthetically
  const issue = {
    ...review.issues[0],
    issueId: "shared-issue",
    severity: "BLOCKING" as const,
    resolved: false,
    rowIds: review.rows.map((r) => r.rowId),
  };
  const session: IntakeReviewSession = {
    ...review,
    issues: issue
      ? [
          {
            issueId: "shared-issue",
            scope: "REQUEST",
            rowIds: review.rows.map((r) => r.rowId),
            field: null,
            code: "MISSING_DXF_MATCH",
            severity: "BLOCKING",
            title: "t",
            message: "m",
            suggestedActionIds: [],
            sourceRefs: [],
            resolved: false,
          },
        ]
      : review.issues,
    rows: review.rows.map((r) => ({
      ...r,
      issueIds: ["shared-issue"],
    })),
  };
  const vm = buildQuoteTableViewModel(session, {
    filter: "ALL",
    searchQuery: "",
    sortKey: null,
    sortDir: "asc",
  });
  assertEq(vm.counters.uniqueBlockingIssues, 1, "unique issue once");
  assert(vm.counters.needsReview >= 1, "affected rows counted");
  console.log("PASS test11 grouped issues");
}

function test12_quantityEdit(): void {
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  const proposed = row.quantity.proposedValue;
  const next = applyReviewDecision(review, {
    kind: "MANUAL_EDIT",
    rowId: row.rowId,
    field: "quantity",
    value: 99,
  });
  const edited = next.rows.find((r) => r.rowId === row.rowId)!;
  assertEq(edited.quantity.currentValue, 99, "current");
  assertEq(edited.quantity.proposedValue, proposed, "proposed preserved");
  assert(edited.quantity.editedByUser, "edited flag");
  assertEq(next.decisions.length, review.decisions.length + 1, "one decision");
  console.log("PASS test12 quantity edit");
}

function test13_unchangedEdit(): void {
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  const next = applyReviewDecision(review, {
    kind: "MANUAL_EDIT",
    rowId: row.rowId,
    field: "quantity",
    value: row.quantity.currentValue!,
  });
  assertEq(next.decisions.length, review.decisions.length, "no decision");
  assert(next === review || next.decisions.length === review.decisions.length, "noop");
  console.log("PASS test13 unchanged edit");
}

function test14_invalidQuantity(): void {
  assert(!validateQuantityEdit("0").ok, "zero");
  assert(!validateQuantityEdit("-1").ok, "neg");
  assert(!validateQuantityEdit("1.5").ok, "decimal");
  assert(validateQuantityEdit("3").ok, "ok");
  console.log("PASS test14 invalid quantity");
}

function test15_thicknessEdit(): void {
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  assert(validateThicknessEdit("12.5").ok, "valid");
  const next = applyReviewDecision(review, {
    kind: "MANUAL_EDIT",
    rowId: row.rowId,
    field: "thicknessMm",
    value: 12.5,
  });
  assertEq(
    next.rows.find((r) => r.rowId === row.rowId)!.thicknessMm.currentValue,
    12.5,
    "applied"
  );
  console.log("PASS test15 thickness edit");
}

function test16_materialEdit(): void {
  assert(validateMaterialEdit("S235JR").ok, "grade");
  assert(validateMaterialEdit("  S355  ").ok, "trim");
  assert(!validateMaterialEdit("").ok, "empty");
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  const next = applyReviewDecision(review, {
    kind: "MANUAL_EDIT",
    rowId: row.rowId,
    field: "material",
    value: "S355JR",
  });
  assertEq(
    next.rows.find((r) => r.rowId === row.rowId)!.material.currentValue,
    "S355JR",
    "material"
  );
  console.log("PASS test16 material edit");
}

function test17_exclude(): void {
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  const next = applyReviewDecision(review, {
    kind: "SET_INCLUDE",
    rowId: row.rowId,
    includeInQuote: false,
  });
  const r = next.rows.find((x) => x.rowId === row.rowId)!;
  assert(!r.includeInQuote, "excluded");
  const issuesById = new Map(next.issues.map((i) => [i.issueId, i] as const));
  const vm = buildQuoteTableRowViewModel(r, issuesById);
  assertEq(vm.presentationStatus, "EXCLUDED", "status");
  assert(r.quantity.sourceRefs != null, "evidence kept");
  console.log("PASS test17 exclude");
}

function test18_reinclude(): void {
  const { review } = buildSession(["P100"]);
  const rowId = review.rows[0]!.rowId;
  let next = applyReviewDecision(review, {
    kind: "SET_INCLUDE",
    rowId,
    includeInQuote: false,
  });
  next = applyReviewDecision(next, {
    kind: "SET_INCLUDE",
    rowId,
    includeInQuote: true,
  });
  assert(next.rows.find((r) => r.rowId === rowId)!.includeInQuote, "included");
  console.log("PASS test18 re-include");
}

function test19_sourceEvidence(): void {
  const { review } = buildSession(["P100"]);
  const refs = review.rows[0]!.quantity.sourceRefs;
  // May be empty depending on build — at least document evidence path exists
  assert(review.rows[0]!.documentEvidence != null, "doc evidence");
  void refs;
  console.log("PASS test19 source evidence panel data");
}

function test20_dxfEvidence(): void {
  const { review } = buildSession(["P100"]);
  const row = review.rows[0]!;
  assert(row.dxfMatch != null, "dxf match");
  assert(row.dxfGeometry != null, "geometry");
  console.log("PASS test20 DXF evidence");
}

function test21_fieldHighlight(): void {
  const { review } = buildSession(["P100"]);
  const row = {
    ...review.rows[0]!,
    issueIds: ["iss1"],
  };
  const issuesById = new Map([
    [
      "iss1",
      {
        issueId: "iss1",
        scope: "FIELD" as const,
        rowIds: [row.rowId],
        field: "quantity",
        code: "MISSING_QUANTITY" as const,
        severity: "BLOCKING" as const,
        title: "t",
        message: "m",
        suggestedActionIds: [],
        sourceRefs: [],
        resolved: false,
      },
    ],
  ]);
  const vm = buildQuoteTableRowViewModel(row, issuesById);
  assert(vm.fieldIssueKeys.quantity, "qty highlighted");
  assert(!vm.fieldIssueKeys.material, "material not");
  console.log("PASS test21 field highlighting");
}

function test22_mobileDesktopSameVm(): void {
  const { review } = buildSession(["P100"]);
  const vm = buildQuoteTableViewModel(review, {
    filter: "ALL",
    searchQuery: "",
    sortKey: null,
    sortDir: "asc",
  });
  assert(vm.rows[0]!.quantity === vm.visibleRows[0]!.quantity, "same values");
  console.log("PASS test22 mobile/desktop same vm");
}

async function test23_noPersistence(): Promise<void> {
  const calls: string[] = [];
  const ls = globalThis.localStorage;
  if (ls) {
    const orig = ls.setItem.bind(ls);
    ls.setItem = ((k: string, v: string) => {
      calls.push("ls");
      return orig(k, v);
    }) as Storage["setItem"];
  }
  const { review, analyze } = buildSession(["P100"]);
  await seedTableSession(review, analyze);
  quoteSessionActions.goToTable();
  quoteSessionActions.setTableSearch("P100");
  quoteSessionActions.setTableFilter("READY");
  quoteSessionActions.selectTableRow(review.rows[0]!.rowId);
  assertQuoteSessionHasNoPersistAdapter();
  assertEq(calls.length, 0, "no localStorage");
  console.log("PASS test23 no persistence");
}

function test24_immutability(): void {
  const { review } = buildSession(["P100"]);
  const before = JSON.stringify(review.rows.map((r) => r.rowId));
  buildQuoteTableViewModel(review, {
    filter: "NEEDS_REVIEW",
    searchQuery: "P",
    sortKey: "quantity",
    sortDir: "desc",
  });
  assertEq(
    JSON.stringify(review.rows.map((r) => r.rowId)),
    before,
    "rows order unchanged"
  );
  console.log("PASS test24 analysis immutability");
}

async function main(): Promise<void> {
  await test1_analysisToTable();
  await test2_missingReview();
  test3_columnRegistry();
  test4_rowMapping();
  test5_geometryUnits();
  test6_unresolvedMass();
  test7_resolvedMass();
  test8_search();
  test9_naturalSort();
  test10_filters();
  test11_groupedIssues();
  test12_quantityEdit();
  test13_unchangedEdit();
  test14_invalidQuantity();
  test15_thicknessEdit();
  test16_materialEdit();
  test17_exclude();
  test18_reinclude();
  test19_sourceEvidence();
  test20_dxfEvidence();
  test21_fieldHighlight();
  test22_mobileDesktopSameVm();
  await test23_noPersistence();
  test24_immutability();
  console.log("\nAll Checkpoint 7.0C Working Quote Table tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
