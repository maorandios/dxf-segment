/**
 * Checkpoint 6.0 stabilization — no-op edits + safe optional measurements.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint60-stabilization.ts
 */
import {
  applyReviewDecision,
  approveReviewSession,
  assessFieldUnitFromInference,
  buildOptionalMeasurement,
  buildReviewSession,
  createApprovedBom,
  resetDecisionIdCounterForTests,
  resetReviewIdCountersForTests,
  validateReviewSession,
} from "../review";
import { emptyDocumentGeometry } from "../schemas";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
} from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";

import type { TableUnitInferenceLike } from "../review/safeOptionalMeasurements";

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

function dxfItem(partId: string, w: number, h: number): DxfPartRegistryItem {
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
  qty: number | null;
  thickness: number | null;
  material: string | null;
  totalWeightKg?: number | null;
}): ExtractedDocumentRow {
  return {
    documentId: "doc:1",
    matchedDxfPartId: args.part,
    rawPartReference: args.part,
    quantity: args.qty,
    thicknessMm: args.thickness,
    material: args.material,
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: {
      ...emptyDocumentGeometry(),
      totalWeightKg: args.totalWeightKg ?? null,
      totalWeightCell: args.totalWeightKg != null ? `J${args.row}` : null,
    },
    source: {
      type: "XLSX",
      fileName: "parts.xls",
      sheetName: "Sheet1",
      rowNumber: args.row,
      pageNumber: null,
      partReferenceCell: `B${args.row}`,
      quantityCell: `A${args.row}`,
      thicknessCell: `C${args.row}`,
      materialCell: `D${args.row}`,
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
    widthMm: 100,
    heightMm: 100,
    plateAreaMm2: 10000,
    netContourAreaMm2: 9500,
    perimeterMm: 400,
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
    sourceEvidence: [{ type: "XLSX", label: "parts.xls" }],
    issues: [],
    requestOccurrences: [],
    occurrenceCount: 1,
    duplicateOccurrenceCount: 0,
    duplicateStatus: "NONE",
    ignoredOccurrences: [],
    duplicateIssues: [],
    geometryComparisons: [],
    geometryComparisonStatus: "NOT_AVAILABLE",
  };
  return { ...base, ...partial };
}

function tiedMassInference(): TableUnitInferenceLike {
  const base = {
    score: 0.9,
    evidenceGroups: ["DXF_DIMENSIONS"] as string[],
    evidence: ["group:DXF_DIMENSIONS"],
  };
  return {
    status: "RESOLVED",
    resolvedAssignment: {
      width: "MM",
      height: "MM",
      totalWeight: "G",
    },
    candidates: [
      {
        ...base,
        assignment: { width: "MM", height: "MM", totalWeight: "G" },
      },
      {
        ...base,
        assignment: { width: "MM", height: "MM", totalWeight: "KG" },
      },
      {
        ...base,
        assignment: { width: "MM", height: "MM", totalWeight: "TON" },
      },
    ],
    evidence: ["group:DXF_DIMENSIONS"],
  };
}

function successWithEvidence(args: {
  docs: ExtractedDocumentRow[];
  finals: FinalIntakeMappingRow[];
  inference?: TableUnitInferenceLike;
  normRows?: Array<Record<string, unknown>>;
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
      documents: [
        {
          documentId: "doc:1",
          sourceType: "XLSX",
          fileName: "parts.xls",
          rows: args.docs,
          unresolvedItems: [],
          warnings: [],
          status: "SUCCESS",
          errorCode: null,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          durationMs: 1,
          workbookEvidence: {
            parserKind: "SHEETJS_XLS",
            snapshot: {},
            mapping: {},
            coverage: {},
            rawPartRows: [],
            excludedTotalSubtotalRows: [],
            unknownRows: [],
            hiddenPartRowsRequiringReview: [],
            tableUnitInference: args.inference ? [args.inference] : [],
            normalizedMeasurements: args.normRows ?? [],
          },
        },
      ],
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

function cleanSession() {
  resetReviewIdCountersForTests();
  resetDecisionIdCounterForTests();
  const registry = [dxfItem("P100", 200, 100)];
  const docs = [
    docRow({
      part: "P100",
      row: 2,
      qty: 16,
      thickness: 12,
      material: "S235",
    }),
  ];
  const finals = [
    emptyFinal({
      partId: "P100",
      quantity: 16,
      thicknessMm: 12,
      material: "S235",
      widthMm: 200,
      heightMm: 100,
      plateAreaMm2: 20000,
    }),
  ];
  const session = buildReviewSession(successWithEvidence({ docs, finals }), {
    registry,
    createdAt: "2026-07-17T10:00:00.000Z",
    sessionId: "review:stab:clean",
  });
  return session;
}

function main() {
  console.log("\n=== Test 1 — unchanged numeric edit ===");
  {
    const session = cleanSession();
    const next = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "quantity",
      value: "16",
    });
    assert(next === session, "same session reference");
    assertEq(next.decisions.length, 0, "no decision");
    assertEq(next.rows[0]!.quantity.state, "VERIFIED", "state unchanged");
    assertEq(next.rows[0]!.quantity.editedByUser, false, "not edited");
    assertEq(next.updatedAt, session.updatedAt, "updatedAt unchanged");
    assert(
      !next.rows[0]!.quantity.sourceRefs.some((r) => r.sourceType === "USER"),
      "no USER ref"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 2 — numeric representation no-op ===");
  {
    const session = cleanSession();
    const next = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: "12.0",
    });
    assert(next === session, "no-op 12.0");
    assertEq(next.decisions.length, 0, "no decision");
  }
  console.log("PASS");

  console.log("\n=== Test 3 — actual numeric edit ===");
  {
    const session = cleanSession();
    const next = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 14,
    });
    assert(next !== session, "new session");
    assertEq(next.rows[0]!.thicknessMm.currentValue, 14, "14");
    assertEq(next.rows[0]!.thicknessMm.state, "USER_RESOLVED", "resolved");
    assertEq(next.rows[0]!.thicknessMm.editedByUser, true, "edited");
    assertEq(next.decisions.length, 1, "one decision");
    assertEq(next.decisions[0]!.previousValue, 12, "prev 12");
    assertEq(next.decisions[0]!.newValue, 14, "new 14");
  }
  console.log("PASS");

  console.log("\n=== Test 4 — unchanged material ===");
  {
    const session = cleanSession();
    const next = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "material",
      value: " S235 ",
    });
    assert(next === session, "material trim no-op");
    assertEq(next.decisions.length, 0, "no decision");
  }
  console.log("PASS");

  console.log("\n=== Test 5 — tied optional mass units ===");
  {
    const inference = tiedMassInference();
    const assessed = assessFieldUnitFromInference(inference, "totalWeight");
    assertEq(assessed.status, "AMBIGUOUS", "tied mass");
    const m = buildOptionalMeasurement({
      field: "totalWeight",
      rawValue: 52.8,
      normalizedValue: 0.0528,
      normalizedUnit: "KG",
      inference,
    });
    assertEq(m.normalizedValue, null, "no false kg");
    assertEq(m.status, "AMBIGUOUS", "ambiguous");
    assertEq(m.rawValue, 52.8, "raw preserved");
  }
  console.log("PASS");

  console.log("\n=== Test 6 — explicit KG ===");
  {
    const m = buildOptionalMeasurement({
      field: "totalWeight",
      rawValue: 52.8,
      normalizedValue: 52.8,
      normalizedUnit: "KG",
      explicitUnit: "KG",
    });
    assertEq(m.status, "RESOLVED", "resolved");
    assertEq(m.normalizedValue, 52.8, "kg value");
    assertEq(m.normalizedUnit, "KG", "KG");
  }
  console.log("PASS");

  console.log("\n=== Test 7 — unrelated evidence ===");
  {
    const inference = tiedMassInference();
    const w = assessFieldUnitFromInference(inference, "width");
    const h = assessFieldUnitFromInference(inference, "height");
    const tw = assessFieldUnitFromInference(inference, "totalWeight");
    assertEq(w.status, "RESOLVED", "width ok");
    assertEq(w.unit, "MM", "width MM");
    assertEq(h.status, "RESOLVED", "height ok");
    assertEq(tw.status, "AMBIGUOUS", "tw ambiguous");

    // Thickness must not resolve from DXF_DIMENSIONS-only mass-tied table
    // when the field-specific unit is not uniquely evidenced for mass.
    const twOnlyDxf = assessFieldUnitFromInference(
      {
        status: "RESOLVED",
        resolvedAssignment: { totalWeight: "G", width: "MM" },
        candidates: [
          {
            score: 0.9,
            assignment: { totalWeight: "G", width: "MM" },
            evidenceGroups: ["DXF_DIMENSIONS"],
          },
        ],
        evidence: ["group:DXF_DIMENSIONS"],
      },
      "totalWeight"
    );
    assertEq(twOnlyDxf.status, "AMBIGUOUS", "tw not from dxf dims alone");
  }
  console.log("PASS");

  console.log("\n=== Test 8 — optional ambiguity does not block ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P100", 200, 100)];
    const docs = [
      docRow({
        part: "P100",
        row: 2,
        qty: 3,
        thickness: 12,
        material: "S235",
        totalWeightKg: 0.0528,
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P100",
        quantity: 3,
        thicknessMm: 12,
        material: "S235",
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
        geometryComparisons: [
          {
            sourceType: "XLSX",
            sourceLabel: "parts.xls",
            documentWidthMm: 200,
            documentHeightMm: 100,
            documentAreaMm2: null,
            documentPerimeterMm: null,
            documentUnitWeightKg: null,
            documentTotalWeightKg: 0.0528,
            rawWidth: 200,
            rawWidthUnit: "MM",
            rawHeight: 100,
            rawHeightUnit: "MM",
            rawArea: null,
            rawAreaUnit: null,
            areaComparisonNote: null,
            comparisonStatus: "MATCH",
            issues: [],
          },
        ],
        geometryComparisonStatus: "MATCH",
      }),
    ];
    const session = buildReviewSession(
      successWithEvidence({
        docs,
        finals,
        inference: tiedMassInference(),
        normRows: [
          {
            occurrenceId: "occ-will-not-match",
            partId: "P100",
            rowNumber: 2,
            totalWeight: {
              raw: { rawValue: 52.8, rawText: "52.8", statedUnit: null },
              normalizedValue: 0.0528,
              normalizedUnit: "KG",
              resolvedSourceUnit: "G",
              resolutionStatus: "RESOLVED_BY_COLUMN_CONSISTENCY",
              candidateInterpretations: [
                { sourceUnit: "G", score: 0.9 },
                { sourceUnit: "KG", score: 0.9 },
                { sourceUnit: "TON", score: 0.9 },
              ],
            },
          },
        ],
      }),
      { registry }
    );
    const row = session.rows[0]!;
    assertEq(row.status, "READY", "ready despite mass ambiguity");
    assertEq(row.documentComparison.totalWeightKg ?? null, null, "no false kg");
    assertEq(
      row.documentEvidence.totalWeight?.status,
      "AMBIGUOUS",
      "tw ambiguous"
    );
    assertEq(row.documentEvidence.totalWeight?.rawValue, 52.8, "raw 52.8");
    assert(session.summary.readyForApproval, "approvable");
    assertEq(
      session.issues.filter(
        (i) => !i.resolved && i.severity === "BLOCKING"
      ).length,
      0,
      "no blocking"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 9 — P1091 smoke ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1091", 250, 140)];
    const docs = [
      docRow({
        part: "P1091",
        row: 5,
        qty: 1,
        thickness: 10,
        material: "S235",
        totalWeightKg: 0.0528,
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1091",
        quantity: 1,
        thicknessMm: 10,
        material: "S235",
        widthMm: 250,
        heightMm: 140,
        plateAreaMm2: 35000,
        geometryComparisons: [
          {
            sourceType: "XLSX",
            sourceLabel: "parts.xls",
            documentWidthMm: 1000,
            documentHeightMm: 1000,
            documentAreaMm2: null,
            documentPerimeterMm: null,
            documentUnitWeightKg: null,
            documentTotalWeightKg: 0.0528,
            rawWidth: 1000,
            rawWidthUnit: "MM",
            rawHeight: 1000,
            rawHeightUnit: "MM",
            rawArea: null,
            rawAreaUnit: null,
            areaComparisonNote: null,
            comparisonStatus: "MISMATCH",
            issues: ["DOCUMENT_DXF_DIMENSION_MISMATCH"],
          },
        ],
        geometryComparisonStatus: "MISMATCH",
      }),
    ];
    let session = buildReviewSession(
      successWithEvidence({
        docs,
        finals,
        inference: tiedMassInference(),
        normRows: [
          {
            partId: "P1091",
            rowNumber: 5,
            totalWeight: {
              raw: { rawValue: 52.8, rawText: "52.8" },
              normalizedValue: 0.0528,
              normalizedUnit: "KG",
              resolvedSourceUnit: "G",
              resolutionStatus: "RESOLVED_BY_COLUMN_CONSISTENCY",
              candidateInterpretations: [
                { sourceUnit: "G", score: 0.9 },
                { sourceUnit: "KG", score: 0.9 },
                { sourceUnit: "TON", score: 0.9 },
              ],
            },
          },
        ],
      }),
      { registry, createdAt: "2026-07-17T11:00:00.000Z" }
    );
    assertEq(
      session.rows[0]!.documentEvidence.totalWeight?.rawValue,
      52.8,
      "raw tw"
    );
    assertEq(
      session.rows[0]!.documentComparison.totalWeightKg ?? null,
      null,
      "no kg"
    );
    assert(
      session.issues.some(
        (i) =>
          !i.resolved && i.code === "DOCUMENT_DXF_DIMENSION_MISMATCH"
      ),
      "mismatch issue"
    );
    const noop = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "quantity",
      value: "1",
    });
    assert(noop === session, "noop quantity");
    const useDxf = session.actions.find((a) => a.type === "USE_DXF_GEOMETRY");
    assert(useDxf, "use dxf action");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: useDxf!,
    });
    assert(session.rows[0]!.dxfGeometryAcknowledged, "acked");
  }
  console.log("PASS");

  console.log("\n=== Test 10 — P1098 smoke ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1098", 155, 500)];
    const docs = [
      docRow({
        part: "P1098",
        row: 10,
        qty: 2,
        thickness: null,
        material: "S275",
        totalWeightKg: 0.0195,
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1098",
        quantity: 2,
        thicknessMm: null,
        material: "S275",
        widthMm: 155,
        heightMm: 500,
        plateAreaMm2: 77500,
        fieldResolutions: {
          quantity: {
            value: 2,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: {
            value: null,
            resolutionStatus: "MISSING",
            candidates: [],
          },
          material: {
            value: "S275",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    let session = buildReviewSession(
      successWithEvidence({
        docs,
        finals,
        inference: tiedMassInference(),
        normRows: [
          {
            partId: "P1098",
            rowNumber: 10,
            totalWeight: {
              raw: { rawValue: 19.5, rawText: "19.5" },
              normalizedValue: 0.0195,
              normalizedUnit: "KG",
              resolvedSourceUnit: "G",
              resolutionStatus: "RESOLVED_BY_COLUMN_CONSISTENCY",
              candidateInterpretations: [
                { sourceUnit: "G", score: 0.9 },
                { sourceUnit: "KG", score: 0.9 },
                { sourceUnit: "TON", score: 0.9 },
              ],
            },
          },
        ],
      }),
      { registry }
    );
    assertEq(
      session.rows[0]!.documentEvidence.totalWeight?.rawValue,
      19.5,
      "raw 19.5"
    );
    assertEq(session.rows[0]!.thicknessMm.state, "MISSING", "missing thk");
    const focus = session.actions.find(
      (a) => a.type === "FOCUS_FIELD_EDITOR" && a.label === "הזן עובי"
    );
    assert(focus, "הזן עובי action");
    const afterFocus = applyReviewDecision(session, {
      kind: "ACTION",
      action: focus!,
    });
    assert(afterFocus === session, "focus is UI-only");
    assertEq(afterFocus.decisions.length, 0, "no decision from focus");
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 20,
    });
    assertEq(session.decisions.length, 1, "one thickness decision");
    assertEq(session.rows[0]!.status, "READY", "ready after thickness");
  }
  console.log("PASS");

  console.log("\n=== Test 11 — Approved BOM smoke path ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [
      dxfItem("P1091", 250, 140),
      dxfItem("P1098", 155, 500),
      dxfItem("P1095", 600, 600),
    ];
    // Build three parts: mismatch, missing thickness, duplicates
    const docs = [
      docRow({
        part: "P1091",
        row: 5,
        qty: 1,
        thickness: 10,
        material: "S235",
      }),
      docRow({
        part: "P1098",
        row: 10,
        qty: 2,
        thickness: null,
        material: "S275",
      }),
      docRow({
        part: "P1095",
        row: 16,
        qty: 3,
        thickness: 8,
        material: "S235",
      }),
      docRow({
        part: "P1095",
        row: 17,
        qty: 3,
        thickness: 8,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1091",
        quantity: 1,
        thicknessMm: 10,
        material: "S235",
        widthMm: 250,
        heightMm: 140,
        plateAreaMm2: 35000,
        geometryComparisons: [
          {
            sourceType: "XLSX",
            sourceLabel: "xls",
            documentWidthMm: 1000,
            documentHeightMm: 1000,
            documentAreaMm2: null,
            documentPerimeterMm: null,
            documentUnitWeightKg: null,
            documentTotalWeightKg: null,
            rawWidth: 1000,
            rawWidthUnit: "MM",
            rawHeight: 1000,
            rawHeightUnit: "MM",
            rawArea: null,
            rawAreaUnit: null,
            areaComparisonNote: null,
            comparisonStatus: "MISMATCH",
            issues: ["DOCUMENT_DXF_DIMENSION_MISMATCH"],
          },
        ],
        geometryComparisonStatus: "MISMATCH",
      }),
      emptyFinal({
        partId: "P1098",
        quantity: 2,
        thicknessMm: null,
        material: "S275",
        widthMm: 155,
        heightMm: 500,
        plateAreaMm2: 77500,
        fieldResolutions: {
          quantity: {
            value: 2,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: {
            value: null,
            resolutionStatus: "MISSING",
            candidates: [],
          },
          material: {
            value: "S275",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
      emptyFinal({
        partId: "P1095",
        quantity: 3,
        thicknessMm: 8,
        material: "S235",
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
        occurrenceCount: 2,
        duplicateOccurrenceCount: 2,
        duplicateStatus: "IDENTICAL_DUPLICATE",
      }),
    ];
    let session = buildReviewSession(
      successWithEvidence({ docs, finals, inference: tiedMassInference() }),
      { registry }
    );
    assert(session.summary.decisionRows >= 3, "needs decisions");

    const useDxf = session.actions.find(
      (a) =>
        a.type === "USE_DXF_GEOMETRY" &&
        a.appliesToRowIds.some((id) => id.includes("P1091") || true)
    );
    // Find P1091 row action
    const p1091 = session.rows.find((r) => r.displayPartReference === "P1091")!;
    const useDxfP1091 = session.actions.find(
      (a) =>
        a.type === "USE_DXF_GEOMETRY" && a.appliesToRowIds.includes(p1091.rowId)
    );
    assert(useDxfP1091, "P1091 use dxf");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: useDxfP1091!,
    });

    const p1098 = session.rows.find((r) => r.displayPartReference === "P1098")!;
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: p1098.rowId,
      field: "thicknessMm",
      value: 20,
    });

    const keep = session.actions.find((a) => a.type === "KEEP_SEPARATE_ROWS");
    assert(keep, "keep separate");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: keep!,
    });

    const v = validateReviewSession(session);
    assert(v.readyForApproval, "ready for approval");
    assertEq(v.summary.decisionRows, 0, "0 decision rows");
    const bom = createApprovedBom(session);
    assertEq(bom.schemaVersion, "approved-bom/v1", "bom schema");
    assertEq(bom.parts.length, session.summary.readyRows, "parts = ready");
    for (const p of bom.parts) {
      assert(typeof p.quantity === "number" && p.quantity > 0, "qty");
      assert(typeof p.thicknessMm === "number" && p.thicknessMm > 0, "thk");
      assert(p.material.trim().length > 0, "mat");
      assert(p.dxfPartId.length > 0, "dxf");
      assert(!("totalWeightKg" in p), "no mass on bom part");
    }
    const approved = approveReviewSession(session);
    assertEq(approved.status, "APPROVED", "approved status");
    void useDxf;
  }
  console.log("PASS");

  console.log("\n=== Test 12 — openai call count unchanged ===");
  {
    const payload = successWithEvidence({
      docs: [
        docRow({
          part: "P100",
          row: 2,
          qty: 1,
          thickness: 1,
          material: "S235",
        }),
      ],
      finals: [emptyFinal({ partId: "P100" })],
    });
    assertEq(payload.debug.openaiCallCount, 1, "still 1 in analyze payload");
    const before = payload.debug.openaiCallCount;
    buildReviewSession(payload, { registry: [dxfItem("P100", 1, 1)] });
    assertEq(payload.debug.openaiCallCount, before, "review adds no openai");
  }
  console.log("PASS");

  console.log("\nAll Checkpoint 6.0 stabilization tests passed.");
}

main();
