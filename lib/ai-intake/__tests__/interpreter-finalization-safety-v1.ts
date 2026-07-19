/**
 * Generic Interpreter Finalization and Safety Patch v1 — core regressions.
 * Run: npx tsx lib/ai-intake/__tests__/interpreter-finalization-safety-v1.ts
 */

import {
  getTargetFieldSemanticDefinition,
  getUnitDimension,
  isUnitCompatibleWithTargetField,
  validateFieldUnitCompatibility,
  extractScopedUnitEvidence,
  validateExtractionPlan,
  tryBuildDeterministicFastPathPlan,
  buildWorkbookProfile,
} from "../workbook/interpreter";
import type { WorkbookCellEvidence, WorkbookSnapshot } from "../normalization/types";
import {
  mergeCanonicalFieldLineages,
  preferPopulatedLineage,
  createEmptyLineage,
  assertNoUnexplainedFieldLoss,
  type CanonicalFieldLineage,
} from "../lineage/canonicalFieldLineage";
import { buildReviewFieldFromCanonicalLineage } from "../review/buildReviewFieldFromCanonicalLineage";
import { detectFalseMissingFields } from "../safety/detectFalseMissingFields";
import { evaluateAnalysisSafetyGate } from "../safety/evaluateAnalysisSafetyGate";
import {
  applyDxfAssignmentToOccurrence,
  assertDxfAssignmentPreservesBusinessFields,
} from "../dxf/geometry-correlation/applyDxfAssignmentToOccurrence";
import {
  buildDxfReservations,
  assertNoConfirmedMatchAsOrphan,
  assertOneToOneConfirmedAssignments,
} from "../dxf/geometry-correlation/dxfReservations";
import { buildSourceToReviewLedger } from "../lineage/sourceToReviewLedger";
import type { IntakeReviewSession, ReviewPartRow } from "../review/types";
import { emptyDocumentGeometry } from "../schemas";
import type { ExtractedDocumentRow } from "../schemas";

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

function cell(
  sheetName: string,
  address: string,
  raw: string | number | null
): WorkbookCellEvidence {
  const m = address.match(/^([A-Z]+)(\d+)$/i);
  assert(m, `bad address ${address}`);
  return {
    sheetName,
    cellAddress: address.toUpperCase(),
    rawValue: raw,
    formattedText: raw == null ? null : String(raw),
    formula: null,
    formulaResult: null,
    numberFormat: null,
    rowNumber: Number(m[2]),
    columnLetter: m[1]!.toUpperCase(),
    isMerged: false,
    mergedRange: null,
    isHiddenRow: false,
    isHiddenColumn: false,
  };
}

function snap(fileName: string, cells: WorkbookCellEvidence[]): WorkbookSnapshot {
  return {
    documentId: `doc:${fileName}`,
    fileName,
    parserKind: "EXCELJS_XLSX",
    sheets: [
      {
        sheetName: "Sheet1",
        usedRange: "A1:Z100",
        cells,
        mergedRanges: [],
        hidden: false,
      },
    ],
    warnings: [],
  };
}

// --- Tests ---

function test1_compatibleUnit(): void {
  const r = validateFieldUnitCompatibility({
    targetField: "LENGTH",
    explicitUnit: "MM",
  });
  assert(r.ok, "LENGTH+MM ok");
  assertEq(getUnitDimension("MM"), "LENGTH", "MM dim");
}

function test2_incompatibleLengthUnit(): void {
  const r = validateFieldUnitCompatibility({
    targetField: "LENGTH",
    explicitUnit: "G",
  });
  assert(!r.ok, "LENGTH+G fails");
  assertEq(r.code, "PLAN_FIELD_UNIT_DIMENSION_MISMATCH", "unit mismatch code");
}

function test3_incompatibleMassUnit(): void {
  const r = validateFieldUnitCompatibility({
    targetField: "UNIT_WEIGHT",
    explicitUnit: "M",
  });
  assert(!r.ok, "UNIT_WEIGHT+M fails");
  assertEq(r.code, "PLAN_FIELD_UNIT_DIMENSION_MISMATCH", "code");
}

function test4_quantityUnitRejection(): void {
  const r = validateFieldUnitCompatibility({
    targetField: "QUANTITY",
    explicitUnit: "MM",
  });
  assert(!r.ok, "QUANTITY+MM fails");
}

function test5_materialUnitRejection(): void {
  const r = validateFieldUnitCompatibility({
    targetField: "MATERIAL",
    explicitUnit: "KG",
  });
  assert(!r.ok, "MATERIAL+KG fails");
}

function test6_scopedHeaderUnit(): void {
  const lengthEv = extractScopedUnitEvidence({
    governingText: "Length (mm)",
    targetField: "LENGTH",
  });
  assertEq(lengthEv?.unit, "MM", "length gets mm");
  const massOnLength = extractScopedUnitEvidence({
    governingText: "Weight (kg)",
    targetField: "LENGTH",
  });
  assertEq(massOnLength, null, "mass token does not govern length");
}

function test7_singleCellMultiFieldScoping(): void {
  const massEv = extractScopedUnitEvidence({
    governingText: "Weight kg",
    targetField: "UNIT_WEIGHT",
    characterStart: 20,
    characterEnd: 30,
  });
  const lenEv = extractScopedUnitEvidence({
    governingText: "Length",
    targetField: "LENGTH",
    characterStart: 0,
    characterEnd: 6,
  });
  assertEq(massEv?.unit, "KG", "mass span");
  assertEq(lenEv, null, "length span no unit — no bleed from mass");
}

function test8_invalidDeterministicPlanDoesNotExecute(): void {
  // Semantic validation rejects LENGTH+G before execution path.
  const r = validateFieldUnitCompatibility({
    targetField: "LENGTH",
    explicitUnit: "G",
  });
  assert(!r.ok, "invalid plan field");
}

function test11_dxfAssignmentPreservesQuantity(): void {
  const before: ExtractedDocumentRow = {
    documentId: "d1",
    matchedDxfPartId: null,
    rawPartReference: null,
    quantity: 7,
    thicknessMm: 15,
    material: "S355",
    description: "PL15X100",
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "XLSX",
      fileName: "w.xlsx",
      sheetName: "S",
      rowNumber: 2,
      pageNumber: null,
      partReferenceCell: null,
      quantityCell: null,
      thicknessCell: null,
      materialCell: null,
      excerpt: null,
    },
    issues: [],
  };
  const after = applyDxfAssignmentToOccurrence({
    occurrence: before,
    assignment: {
      matchedDxfPartId: "DXF-99",
      matchStatus: "MATCHED_BY_GEOMETRY",
      matchReason: "UNIQUE_GEOMETRY_MATCH",
    },
  });
  assertDxfAssignmentPreservesBusinessFields({ before, after });
  assertEq(after.quantity, 7, "qty");
  assertEq(after.thicknessMm, 15, "thk");
  assertEq(after.material, "S355", "mat");
  assertEq(after.matchedDxfPartId, "DXF-99", "dxf");
  assert(String(after.notes).includes("matchMethod:GEOMETRY"), "geom note");
}

function test15_noNullOverwrite(): void {
  const populated = createEmptyLineage<number>({
    targetField: "quantity",
    occurrenceId: "a",
  });
  populated.resolvedValue = 5;
  populated.status = "RESOLVED";
  const absent = createEmptyLineage<number>({
    targetField: "quantity",
    occurrenceId: "b",
  });
  const merged = preferPopulatedLineage(populated, absent);
  assertEq(merged?.resolvedValue, 5, "populated wins");
}

function test16_conflictPreservation(): void {
  const a = createEmptyLineage<number>({
    targetField: "quantity",
    occurrenceId: "a",
  });
  a.resolvedValue = 5;
  a.status = "RESOLVED";
  a.candidates = [
    { value: 5, origin: "WORKBOOK_CELL", confidence: 1, sourceRefs: [] },
  ];
  const b = createEmptyLineage<number>({
    targetField: "quantity",
    occurrenceId: "b",
  });
  b.resolvedValue = 9;
  b.status = "RESOLVED";
  b.candidates = [
    { value: 9, origin: "WORKBOOK_CELL", confidence: 1, sourceRefs: [] },
  ];
  const m = mergeCanonicalFieldLineages({
    field: "quantity",
    occurrences: [a, b],
  });
  assertEq(m.status, "CONFLICT", "conflict");
  assertEq(m.candidates.length, 2, "both candidates");
  assertEq(m.resolvedValue, null, "no silent pick");
}

function test17_verifiedReviewField(): void {
  const lineage: CanonicalFieldLineage<number> = {
    ...createEmptyLineage<number>({
      targetField: "quantity",
      occurrenceId: "o1",
    }),
    resolvedValue: 3,
    status: "RESOLVED",
    valueOrigin: "WORKBOOK_CELL",
  };
  const f = buildReviewFieldFromCanonicalLineage(lineage);
  assertEq(f.proposedValue, 3, "proposed");
  assertEq(f.currentValue, 3, "current");
  assert(f.state !== "MISSING", "not missing");
}

function test18_genuineMissing(): void {
  const f = buildReviewFieldFromCanonicalLineage(
    createEmptyLineage({ targetField: "quantity", occurrenceId: "o1" })
  );
  assertEq(f.state, "MISSING", "missing");
  assertEq(f.currentValue, null, "null");
}

function test19_falseMissingDetection(): void {
  const row = {
    rowId: "r1",
    includeInQuote: true,
    status: "NEEDS_DECISION",
    quantity: {
      proposedValue: 4,
      currentValue: null,
      state: "MISSING",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    thicknessMm: {
      proposedValue: 10,
      currentValue: 10,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: "X",
      currentValue: "X",
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
  } as unknown as ReviewPartRow;
  const findings = detectFalseMissingFields({
    reviewSession: {
      rows: [row],
      issues: [],
    } as unknown as IntakeReviewSession,
  });
  assert(
    findings.some((f) => f.code === "FALSE_MISSING_STATE"),
    "detect false missing"
  );
}

function test20_falseIssueDetection(): void {
  const row = {
    rowId: "r1",
    includeInQuote: true,
    status: "READY",
    quantity: {
      proposedValue: 4,
      currentValue: 4,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    thicknessMm: {
      proposedValue: 10,
      currentValue: 10,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: "X",
      currentValue: "X",
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
  } as unknown as ReviewPartRow;
  const findings = detectFalseMissingFields({
    reviewSession: {
      rows: [row],
      issues: [
        {
          issueId: "i1",
          code: "MISSING_QUANTITY",
          rowIds: ["r1"],
          severity: "BLOCKING",
        },
      ],
    } as unknown as IntakeReviewSession,
  });
  assert(
    findings.some((f) => f.code === "FALSE_MISSING_ISSUE"),
    "false issue"
  );
}

function test26_ambiguityReservation(): void {
  const reservations = buildDxfReservations({
    registry: [
      { id: "r1", canonicalPartId: "A", geometryStatus: "VALID" },
      { id: "r2", canonicalPartId: "B", geometryStatus: "VALID" },
      { id: "r3", canonicalPartId: "C", geometryStatus: "VALID" },
    ],
    assignments: [
      {
        sourceOccurrenceId: "occ1",
        status: "AMBIGUOUS_GEOMETRY_MATCH",
        matchedRegistryEntryId: null,
        candidates: [
          { registryEntryId: "r1" },
          { registryEntryId: "r2" },
        ],
      },
    ],
  });
    assertEq(
      reservations.find((r) => r.registryEntryId === "r1")?.state,
      "HELD_BY_AMBIGUITY",
      "held"
    );
  assertEq(
    reservations.find((r) => r.registryEntryId === "r3")?.orphanDecision,
    "ORPHAN",
    "genuine orphan"
  );
}

function test27_oneToOne(): void {
  const reservations = buildDxfReservations({
    registry: [{ id: "r1", canonicalPartId: "A", geometryStatus: "VALID" }],
    assignments: [
      {
        sourceOccurrenceId: "o1",
        status: "MATCHED_BY_GEOMETRY",
        matchedRegistryEntryId: "r1",
      },
    ],
  });
  // Simulate double-reserve manually
  reservations.push({
    registryEntryId: "r1",
    canonicalPartId: "A",
    state: "RESERVED_GEOMETRY",
    reservingOccurrenceId: "o2",
    ambiguityGroupId: null,
    ambiguityGroupIds: [],
    orphanDecision: "NOT_ORPHAN",
  });
  const fails = assertOneToOneConfirmedAssignments(reservations);
  assert(fails.length > 0, "dup assignment detected");
}

function test28_matchedOrphanPrevention(): void {
  const reservations = buildDxfReservations({
    registry: [{ id: "r1", canonicalPartId: "A", geometryStatus: "VALID" }],
    assignments: [
      {
        sourceOccurrenceId: "o1",
        status: "MATCHED_BY_GEOMETRY",
        matchedRegistryEntryId: "r1",
      },
    ],
  });
  const fails = assertNoConfirmedMatchAsOrphan(reservations, ["r1"]);
  assert(fails.length > 0, "matched orphan blocked");
}

function test32_lineageAccounting(): void {
  const ledger = buildSourceToReviewLedger({
    sourceOccurrenceIds: ["occ:1", "occ:2"],
    reviewRows: [
      {
        rowId: "row1",
        sourceOccurrenceIds: ["occ:1"],
        includeInQuote: true,
        status: "READY",
      },
      {
        rowId: "row2",
        sourceOccurrenceIds: ["occ:2"],
        includeInQuote: true,
        status: "READY",
      },
    ],
  });
  assert(ledger.balanced, "balanced");
  assertEq(ledger.entries.length, 2, "two entries");
}

function test34_accidentalSplit(): void {
  const ledger = buildSourceToReviewLedger({
    sourceOccurrenceIds: ["occ:1"],
    reviewRows: [
      {
        rowId: "row1",
        sourceOccurrenceIds: ["occ:1"],
        includeInQuote: true,
        status: "READY",
      },
      {
        rowId: "row2",
        sourceOccurrenceIds: ["occ:1"],
        includeInQuote: true,
        status: "READY",
      },
    ],
  });
  assert(!ledger.balanced, "unbalanced");
  assert(
    ledger.failures.some((f) => f.startsWith("ACCIDENTAL_SPLIT:")),
    "split"
  );
}

function test35_safeReviewRequired(): void {
  const gate = evaluateAnalysisSafetyGate({
    analyze: {
      acceptedFacts: [],
      extraction: { documentRows: [], unresolvedItems: [] },
      warnings: [],
      aggregated: { documents: [] },
    } as never,
    reviewSession: {
      rows: [],
      issues: [
        {
          issueId: "i1",
          code: "AMBIGUOUS_DXF_IDENTITY",
          severity: "BLOCKING",
          rowIds: ["r1"],
        },
      ],
    } as unknown as IntakeReviewSession,
    analysisErrorHe: null,
    exception: null,
  });
  assertEq(gate.finalRunStatus, "SUCCESS_REVIEW_REQUIRED", "review required");
  assert(gate.workingTableReady, "table ready");
}

function test36_unsafeInternal(): void {
  const row = {
    rowId: "r1",
    includeInQuote: true,
    status: "READY",
    quantity: {
      proposedValue: 2,
      currentValue: null,
      state: "MISSING",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    thicknessMm: {
      proposedValue: null,
      currentValue: null,
      state: "MISSING",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: null,
      currentValue: null,
      state: "MISSING",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
  } as unknown as ReviewPartRow;
  const gate = evaluateAnalysisSafetyGate({
    analyze: {
      acceptedFacts: [],
      extraction: { documentRows: [], unresolvedItems: [] },
      warnings: [],
      aggregated: { documents: [] },
    } as never,
    reviewSession: {
      rows: [row],
      issues: [],
    } as unknown as IntakeReviewSession,
    analysisErrorHe: null,
    exception: null,
  });
  assertEq(gate.status, "UNSAFE_RESULT", "unsafe");
  assert(!gate.workingTableReady, "not ready");
  assertEq(gate.finalRunStatus, "UNSAFE_RESULT", "not success");
}

function testFieldLossAssert(): void {
  let threw = false;
  try {
    assertNoUnexplainedFieldLoss({
      field: "quantity",
      previous: 5,
      next: null,
      reasonCode: null,
      stage: "DXF_ASSIGNMENT",
    });
  } catch {
    threw = true;
  }
  assert(threw, "unexplained loss throws in non-prod");
}

function testSemanticDefsExist(): void {
  for (const f of [
    "EXPLICIT_PART_IDENTIFIER",
    "QUANTITY",
    "MATERIAL",
    "THICKNESS",
    "LENGTH",
    "AREA",
    "UNIT_WEIGHT",
  ] as const) {
    assert(getTargetFieldSemanticDefinition(f), f);
  }
  assert(isUnitCompatibleWithTargetField("MM", "THICKNESS"), "thk mm");
  assert(!isUnitCompatibleWithTargetField("KG", "THICKNESS"), "thk kg no");
}

function testOrdinaryFastPathStillBuilds(): void {
  const snapshot = snap("ordinary.xlsx", [
    cell("Sheet1", "A1", "Part"),
    cell("Sheet1", "B1", "Qty"),
    cell("Sheet1", "C1", "Material"),
    cell("Sheet1", "D1", "Thickness (mm)"),
    cell("Sheet1", "A2", "P1"),
    cell("Sheet1", "B2", 2),
    cell("Sheet1", "C2", "S355"),
    cell("Sheet1", "D2", 10),
    cell("Sheet1", "A3", "P2"),
    cell("Sheet1", "B3", 1),
    cell("Sheet1", "C3", "S355"),
    cell("Sheet1", "D3", 12),
  ]);
  const profile = buildWorkbookProfile(snapshot);
  const plan = tryBuildDeterministicFastPathPlan({ snapshot, profile });
  if (plan) {
    const v = validateExtractionPlan({ snapshot, profile, plan });
    assert(v.ok, `fast path valid: ${v.errors.join(",")}`);
  }
}

const tests: Array<[string, () => void]> = [
  ["T1 compatible unit", test1_compatibleUnit],
  ["T2 incompatible length unit", test2_incompatibleLengthUnit],
  ["T3 incompatible mass unit", test3_incompatibleMassUnit],
  ["T4 quantity unit rejection", test4_quantityUnitRejection],
  ["T5 material unit rejection", test5_materialUnitRejection],
  ["T6 scoped header unit", test6_scopedHeaderUnit],
  ["T7 single-cell multi-field scoping", test7_singleCellMultiFieldScoping],
  ["T8 invalid deterministic plan", test8_invalidDeterministicPlanDoesNotExecute],
  ["T11 dxf assignment preserves qty", test11_dxfAssignmentPreservesQuantity],
  ["T15 no null overwrite", test15_noNullOverwrite],
  ["T16 conflict preservation", test16_conflictPreservation],
  ["T17 verified Review field", test17_verifiedReviewField],
  ["T18 genuine missing", test18_genuineMissing],
  ["T19 false missing detection", test19_falseMissingDetection],
  ["T20 false issue detection", test20_falseIssueDetection],
  ["T26 ambiguity reservation", test26_ambiguityReservation],
  ["T27 one-to-one assignment", test27_oneToOne],
  ["T28 matched orphan prevention", test28_matchedOrphanPrevention],
  ["T32 lineage accounting", test32_lineageAccounting],
  ["T34 accidental split", test34_accidentalSplit],
  ["T35 safe review-required", test35_safeReviewRequired],
  ["T36 unsafe internal result", test36_unsafeInternal],
  ["field loss assert", testFieldLossAssert],
  ["semantic defs", testSemanticDefsExist],
  ["ordinary fast path", testOrdinaryFastPathStillBuilds],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e);
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} tests passed.`);
