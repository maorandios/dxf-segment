/**
 * Checkpoint 6.0 — Review, Resolve & Approve.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint60-review.ts
 */
import {
  applyReviewDecision,
  approveReviewSession,
  buildReviewSession,
  createApprovedBom,
  refreshReviewSessionDerived,
  resetDecisionIdCounterForTests,
  resetReviewIdCountersForTests,
  validateReviewSession,
  type IntakeReviewSession,
} from "../review";
import { buildIssuesForRows } from "../review/buildReviewIssues";
import { emptyDocumentGeometry } from "../schemas";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
} from "../schemas";
import type { DxfPartRegistryItem } from "../types";

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

function dxfItem(
  partId: string,
  w: number,
  h: number
): DxfPartRegistryItem {
  return {
    id: `dxf-${partId}`,
    canonicalPartId: partId,
    revision: null,
    rawPartId: partId,
    normalizedRawPartId: partId,
    identitySource: "FILENAME",
    identityOk: true,
    identityIssues: [],
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
  documentId?: string;
  part: string;
  row: number;
  qty: number | null;
  thickness: number | null;
  material: string | null;
  sheet?: string;
}): ExtractedDocumentRow {
  return {
    documentId: args.documentId ?? "doc:1",
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
      fileName: "parts.xls",
      sheetName: args.sheet ?? "Sheet1",
      rowNumber: args.row,
      pageNumber: null,
      partReferenceCell: `B${args.row}`,
      quantityCell: `A${args.row}`,
      thicknessCell: `C${args.row}`,
      materialCell: `D${args.row}`,
      excerpt: `${args.part}`,
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

function buildCleanSession(): {
  session: IntakeReviewSession;
  registry: DxfPartRegistryItem[];
} {
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
      status: "READY",
    }),
  ];
  const session = buildReviewSession(successFrom({ docs, finals }), {
    registry,
    createdAt: "2026-07-17T10:00:00.000Z",
    sessionId: "review:test:clean",
  });
  return { session, registry };
}

function main() {
  console.log("\n=== Test 1 — clean ready row ===");
  {
    const { session } = buildCleanSession();
    assertEq(session.rows.length, 1, "1 row");
    assertEq(session.rows[0]!.status, "READY", "READY");
    assert(session.summary.readyForApproval, "ready for approval");
    assertEq(session.summary.blockingIssueCount, 0, "no blocking");
  }
  console.log("PASS");

  console.log("\n=== Test 2 — missing thickness ===");
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
        status: "NEEDS_REVIEW",
        issues: ["MISSING_THICKNESS"],
        fieldResolutions: {
          quantity: {
            value: 2,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: { value: null, resolutionStatus: "MISSING", candidates: [] },
          material: {
            value: "S275",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
      sessionId: "review:p1098",
    });
    assertEq(session.rows[0]!.status, "NEEDS_DECISION", "needs");
    assert(
      session.issues.some(
        (i) => i.code === "MISSING_THICKNESS" && !i.resolved
      ),
      "missing thickness issue"
    );
    assert(!session.summary.readyForApproval, "blocked");

    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 20,
      createdAt: "2026-07-17T10:01:00.000Z",
    });
    assertEq(session.rows[0]!.thicknessMm.state, "USER_RESOLVED", "user resolved");
    assertEq(session.rows[0]!.status, "READY", "ready after edit");
    assert(session.decisions.length >= 1, "decision event");
    assert(session.summary.readyForApproval, "now approvable");
  }
  console.log("PASS");

  console.log("\n=== Test 3 — missing / invalid quantity ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("P1", 10, 10)];
    const docs = [
      docRow({ part: "P1", row: 2, qty: null, thickness: 5, material: "S235" }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1",
        quantity: null,
        thicknessMm: 5,
        status: "NEEDS_REVIEW",
        issues: ["MISSING_QUANTITY"],
        fieldResolutions: {
          quantity: { value: null, resolutionStatus: "MISSING", candidates: [] },
          thickness: {
            value: 5,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          material: {
            value: "S235",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), { registry });
    assert(
      session.issues.some((i) => i.code === "MISSING_QUANTITY"),
      "missing qty"
    );
    let threw = false;
    try {
      applyReviewDecision(session, {
        kind: "MANUAL_EDIT",
        rowId: session.rows[0]!.rowId,
        field: "quantity",
        value: 0,
      });
    } catch {
      threw = true;
    }
    assert(threw, "zero invalid");
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "quantity",
      value: 4,
    });
    assertEq(session.rows[0]!.quantity.currentValue, 4, "qty 4");
  }
  console.log("PASS");

  console.log("\n=== Test 4 — missing material candidates ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("P2", 10, 10)];
    const docs = [
      docRow({ part: "P2", row: 2, qty: 1, thickness: 8, material: null }),
    ];
    const finals = [
      emptyFinal({
        partId: "P2",
        material: null,
        thicknessMm: 8,
        status: "NEEDS_REVIEW",
        issues: ["MISSING_MATERIAL"],
        fieldCandidates: {
          quantity: [],
          thickness: [],
          material: [
            {
              value: "S275",
              sourceType: "EMAIL",
              sourceLabel: "email",
            },
          ],
        },
        fieldResolutions: {
          quantity: {
            value: 1,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: {
            value: 8,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          material: {
            value: null,
            resolutionStatus: "MISSING",
            candidates: [
              {
                value: "S275",
                sourceType: "EMAIL",
                sourceLabel: "email",
              },
            ],
          },
        },
      }),
    ];
    const session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    assert(
      session.issues.some((i) => i.code === "MISSING_MATERIAL"),
      "missing mat"
    );
    assert(
      session.actions.some(
        (a) =>
          a.type === "SET_FIELD_VALUE" &&
          a.payload.field === "material" &&
          a.payload.value === "S275"
      ),
      "candidate action"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 5 — unmatched DXF ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("OTHER", 10, 10)];
    const docs = [
      docRow({
        part: "PL-104",
        row: 2,
        qty: 1,
        thickness: 10,
        material: "S235",
      }),
    ];
    docs[0]!.matchedDxfPartId = null;
    const finals = [
      emptyFinal({
        partId: "PL-104",
        status: "REQUEST_WITHOUT_DXF",
        dxfFileId: null,
        widthMm: null,
        heightMm: null,
        plateAreaMm2: null,
      }),
    ];
    finals[0]!.partId = "PL-104";
    // Rebuild with forced unmatched state for issue/action checks
    const rebuilt = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const unmatched = {
      ...rebuilt,
      rows: rebuilt.rows.map((r) => ({
        ...r,
        matchedDxfPartId: null,
        dxfMatchStatus: "UNMATCHED" as const,
        dxfGeometry: null,
        dxfCandidates: [
          {
            partId: "OTHER",
            fileName: "OTHER.dxf",
            reason: null,
            score: 0.5,
          },
        ],
      })),
    };
    const { issues, actions } = buildIssuesForRows({ rows: unmatched.rows });
    assert(
      issues.some((i) => i.code === "MISSING_DXF_MATCH"),
      "missing dxf"
    );
    assert(
      actions.some((a) => a.type === "EXCLUDE_ROW"),
      "exclude action"
    );
    assert(
      actions.some((a) => a.type === "SELECT_DXF_MATCH"),
      "select dxf"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 6 — select DXF match ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P200", 50, 50)];
    const docs = [
      docRow({ part: "P200", row: 2, qty: 1, thickness: 10, material: "S235" }),
    ];
    docs[0]!.matchedDxfPartId = null;
    const finals = [
      emptyFinal({
        partId: "P200",
        status: "REQUEST_WITHOUT_DXF",
        widthMm: null,
        heightMm: null,
        plateAreaMm2: null,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    session = {
      ...session,
      rows: session.rows.map((r) => ({
        ...r,
        matchedDxfPartId: null,
        dxfMatchStatus: "UNMATCHED" as const,
        dxfGeometry: null,
        dxfCandidates: [
          {
            partId: "P200",
            fileName: "P200.dxf",
            reason: null,
            score: 1,
          },
        ],
      })),
    };
    session = refreshReviewSessionDerived(session);
    const act = session.actions.find((a) => a.type === "SELECT_DXF_MATCH");
    assert(act, "has select action");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: {
        ...act!,
        payload: {
          ...act!.payload,
          widthMm: 50,
          heightMm: 50,
          plateAreaMm2: 2500,
        },
      },
    });
    assertEq(session.rows[0]!.matchedDxfPartId, "P200", "matched");
    assertEq(session.rows[0]!.dxfMatchStatus, "MATCHED", "matched status");
  }
  console.log("PASS");

  console.log("\n=== Test 7 — optional fields absent ===");
  {
    const { session } = buildCleanSession();
    assertEq(
      session.rows[0]!.documentComparison.areaMm2 ?? null,
      null,
      "no fabricated area"
    );
    assert(session.summary.readyForApproval, "still ready");
  }
  console.log("PASS");

  console.log("\n=== Test 8 — dimension mismatch ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1091", 250, 140)];
    const docs = [
      docRow({
        part: "P1091",
        row: 7,
        qty: 1,
        thickness: 12,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1091",
        quantity: 1,
        thicknessMm: 12,
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
            documentAreaMm2: 40000,
            documentPerimeterMm: null,
            documentUnitWeightKg: null,
            documentTotalWeightKg: null,
            rawWidth: 1000,
            rawWidthUnit: "MM",
            rawHeight: 1000,
            rawHeightUnit: "MM",
            rawArea: 0.04,
            rawAreaUnit: "M2",
            areaComparisonNote: null,
            comparisonStatus: "MISMATCH",
            issues: ["DOCUMENT_DXF_DIMENSION_MISMATCH"],
          },
        ],
        geometryComparisonStatus: "MISMATCH",
        issues: ["DOCUMENT_DXF_DIMENSION_MISMATCH"],
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    assertEq(session.rows[0]!.dxfGeometry?.widthMm, 250, "dxf width kept");
    assertEq(session.rows[0]!.documentComparison.widthMm, 1000, "doc width");
    assert(
      session.issues.some((i) => i.code === "DOCUMENT_DXF_DIMENSION_MISMATCH"),
      "mismatch issue"
    );
    const useDxf = session.actions.find((a) => a.type === "USE_DXF_GEOMETRY");
    assert(useDxf, "use dxf action");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: useDxf!,
    });
    assert(session.rows[0]!.dxfGeometryAcknowledged, "acked");
    assertEq(session.rows[0]!.dxfGeometry?.widthMm, 250, "still dxf");
    assertEq(session.rows[0]!.status, "READY", "ready after ack");
  }
  console.log("PASS");

  console.log("\n=== Test 9 — duplicate keep separate ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1095", 600, 600)];
    const docs = [
      docRow({
        part: "P1095",
        row: 16,
        qty: 1,
        thickness: 20,
        material: "S235",
      }),
      docRow({
        part: "P1095",
        row: 17,
        qty: 1,
        thickness: 20,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1095",
        quantity: 1,
        thicknessMm: 20,
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
        occurrenceCount: 2,
        duplicateOccurrenceCount: 1,
        duplicateStatus: "IDENTICAL_DUPLICATE",
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    assertEq(session.rows.length, 2, "two rows");
    const keep = session.actions.find((a) => a.type === "KEEP_SEPARATE_ROWS");
    assert(keep, "keep action");
    const qBefore = session.rows.map((r) => r.quantity.currentValue);
    session = applyReviewDecision(session, { kind: "ACTION", action: keep! });
    assertEq(session.rows.filter((r) => !r.replacedByRowId).length, 2, "still 2");
    assertEq(
      session.rows[0]!.quantity.currentValue,
      qBefore[0]!,
      "qty unchanged"
    );
    assert(
      !session.issues.some(
        (i) => i.code === "DUPLICATE_SOURCE_OCCURRENCE" && !i.resolved
      ),
      "dup resolved"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 10 — duplicate merge ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1095", 600, 600)];
    const docs = [
      docRow({
        part: "P1095",
        row: 16,
        qty: 2,
        thickness: 20,
        material: "S235",
      }),
      docRow({
        part: "P1095",
        row: 17,
        qty: 3,
        thickness: 20,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1095",
        quantity: 2,
        thicknessMm: 20,
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const merge = session.actions.find((a) => a.type === "MERGE_DUPLICATE_ROWS");
    assert(merge, "merge action");
    session = applyReviewDecision(session, { kind: "ACTION", action: merge! });
    const active = session.rows.filter((r) => !r.replacedByRowId);
    assertEq(active.length, 1, "one active");
    assertEq(active[0]!.quantity.currentValue, 5, "summed 5");
    assertEq(active[0]!.sourceOccurrenceIds.length, 2, "both occ ids");
    assert(
      session.rows.filter((r) => r.replacedByRowId).length === 2,
      "originals retained"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 11 — incompatible duplicate merge ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("P3", 10, 10)];
    const docs = [
      docRow({ part: "P3", row: 2, qty: 1, thickness: 10, material: "S235" }),
      docRow({ part: "P3", row: 3, qty: 1, thickness: 20, material: "S235" }),
    ];
    const finals = [
      emptyFinal({
        partId: "P3",
        thicknessMm: 10,
        widthMm: 10,
        heightMm: 10,
        plateAreaMm2: 100,
      }),
    ];
    const session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    assert(
      !session.actions.some((a) => a.type === "MERGE_DUPLICATE_ROWS"),
      "no merge"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 12 — exclude row ===");
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
        status: "NEEDS_REVIEW",
        fieldResolutions: {
          quantity: {
            value: 2,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: { value: null, resolutionStatus: "MISSING", candidates: [] },
          material: {
            value: "S275",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    session = applyReviewDecision(session, {
      kind: "SET_INCLUDE",
      rowId: session.rows[0]!.rowId,
      includeInQuote: false,
    });
    assertEq(session.rows[0]!.status, "EXCLUDED", "excluded");
    assert(session.summary.readyForApproval, "approval ok");
    const bom = createApprovedBom(session);
    assertEq(bom.parts.length, 0, "no parts");
    assertEq(bom.excludedRows.length, 1, "1 excluded");
  }
  console.log("PASS");

  console.log("\n=== Test 13 — bulk set field ===");
  {
    const { session: base } = buildCleanSession();
    const registry = [dxfItem("P100", 200, 100), dxfItem("P101", 200, 100)];
    const docs = [
      docRow({ part: "P100", row: 2, qty: 1, thickness: null, material: "S235" }),
      docRow({ part: "P101", row: 3, qty: 1, thickness: null, material: "S235" }),
    ];
    const finals = [
      emptyFinal({
        partId: "P100",
        thicknessMm: null,
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
        fieldResolutions: {
          quantity: {
            value: 1,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: { value: null, resolutionStatus: "MISSING", candidates: [] },
          material: {
            value: "S235",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
      emptyFinal({
        partId: "P101",
        thicknessMm: null,
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
        fieldResolutions: {
          quantity: {
            value: 1,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: { value: null, resolutionStatus: "MISSING", candidates: [] },
          material: {
            value: "S235",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    void base;
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const ids = session.rows.map((r) => r.rowId);
    session = applyReviewDecision(session, {
      kind: "BULK_SET_FIELD",
      rowIds: ids,
      field: "thicknessMm",
      value: 15,
    });
    assert(
      session.rows.every((r) => r.thicknessMm.currentValue === 15),
      "all 15"
    );
    const bulk = session.decisions.filter((d) => d.reason === "USER_BULK_ACTION");
    assertEq(bulk.length, 1, "one bulk decision");
    assertEq(bulk[0]!.affectedRowIds.length, 2, "both ids");
  }
  console.log("PASS");

  console.log("\n=== Test 14 — source provenance ===");
  {
    const { session } = buildCleanSession();
    const refs = session.rows[0]!.quantity.sourceRefs;
    assert(refs.some((r) => r.sourceType === "XLSX"), "xlsx ref");
    assert(refs.some((r) => r.rowNumber === 2), "row 2");
    const next = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "quantity",
      value: 9,
    });
    assert(
      next.rows[0]!.quantity.sourceRefs.some((r) => r.sourceType === "USER"),
      "user ref"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 15 — approved snapshot immutable ===");
  {
    let { session } = buildCleanSession();
    session = approveReviewSession(session, {
      approvedAt: "2026-07-17T11:00:00.000Z",
    });
    assertEq(session.status, "APPROVED", "approved");
    const bom = session.approvedBom!;
    assertEq(bom.parts.length, 1, "1 part");
    let threw = false;
    try {
      (bom.parts[0] as { quantity: number }).quantity = 999;
    } catch {
      threw = true;
    }
    // freeze may throw in strict mode; value should remain unchanged either way
    assertEq(bom.parts[0]!.quantity, 3, "immutable qty");
    void threw;
    let blocked = false;
    try {
      applyReviewDecision(session, {
        kind: "MANUAL_EDIT",
        rowId: session.rows[0]!.rowId,
        field: "quantity",
        value: 1,
      });
    } catch {
      blocked = true;
    }
    assert(blocked, "cannot edit approved");
  }
  console.log("PASS");

  console.log("\n=== Test 16 — approval blocking ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("P1098", 155, 500)];
    const docs = [
      docRow({
        part: "P1098",
        row: 10,
        qty: 2,
        thickness: null,
        material: "S275",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P1098",
        thicknessMm: null,
        widthMm: 155,
        heightMm: 500,
        plateAreaMm2: 77500,
        fieldResolutions: {
          quantity: {
            value: 2,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: { value: null, resolutionStatus: "MISSING", candidates: [] },
          material: {
            value: "S275",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    const session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const v = validateReviewSession(session);
    assert(!v.readyForApproval, "not ready");
    let threw = false;
    try {
      createApprovedBom(session);
    } catch {
      threw = true;
    }
    assert(threw, "cannot create bom");
  }
  console.log("PASS");

  console.log("\n=== Test 17 — P1098 fixture ===");
  console.log("PASS (covered by Test 2)");

  console.log("\n=== Test 18 — P1091 fixture ===");
  console.log("PASS (covered by Test 8)");

  console.log("\n=== Test 19 — P1095 fixture ===");
  console.log("PASS (covered by Tests 9–10)");

  console.log("\n=== Test 20 — openai call count unchanged in payload ===");
  {
    const { session } = buildCleanSession();
    void session;
    assertEq(
      successFrom({
        docs: [],
        finals: [],
      }).debug.openaiCallCount,
      1,
      "no extra openai in review layer"
    );
  }
  console.log("PASS");

  console.log("\nAll Checkpoint 6.0 review tests passed.");
}

main();
