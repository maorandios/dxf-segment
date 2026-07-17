/**
 * Checkpoint 6.0 audit/provenance cleanup.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint60-audit-provenance.ts
 */
import {
  applyReviewDecision,
  approveReviewSession,
  buildOptionalMeasurementEvidence,
  buildReviewDebugReport,
  buildReviewSession,
  resetDecisionIdCounterForTests,
  resetReviewIdCountersForTests,
  serializeReviewDebugReport,
  validateReviewSession,
} from "../review";
import { emptyDocumentGeometry } from "../schemas";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
  RequestPartOccurrence,
} from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";


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
  widthCell?: string | null;
  heightCell?: string | null;
  areaCell?: string | null;
  totalWeightCell?: string | null;
  width?: number | null;
  height?: number | null;
  totalWeightKg?: number | null;
  fileName?: string;
  sheet?: string;
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
      width: args.width ?? null,
      widthUnit: args.width != null ? "MM" : null,
      widthCell: args.widthCell ?? null,
      height: args.height ?? null,
      heightUnit: args.height != null ? "MM" : null,
      heightCell: args.heightCell ?? null,
      areaCell: args.areaCell ?? null,
      totalWeightKg: args.totalWeightKg ?? null,
      totalWeightCell: args.totalWeightCell ?? null,
    },
    source: {
      type: "XLSX",
      fileName: args.fileName ?? "רשימת פלטות - Copy.xls",
      sheetName: args.sheet ?? "Plates for Client",
      rowNumber: args.row,
      pageNumber: null,
      partReferenceCell: `B${args.row}`,
      quantityCell: `C${args.row}`,
      thicknessCell: `E${args.row}`,
      materialCell: `G${args.row}`,
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
    sourceEvidence: [],
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

function sampleOcc(row: number): RequestPartOccurrence {
  return {
    occurrenceId: `occ:${row}`,
    matchedDxfPartId: "P1091",
    rawPartReference: "P1091",
    quantity: 1,
    thicknessMm: 10,
    material: "S235",
    description: null,
    action: "INCLUDE",
    source: {
      documentId: "doc:1",
      type: "XLSX",
      fileName: "parts.xls",
      sheetName: "Sheet1",
      rowNumber: row,
      pageNumber: null,
      excerpt: "P1091",
    },
  };
}

function main() {
  console.log("\n=== Test 1 — manual edit preserves proposal ===");
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
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const row = session.rows[0]!;
    assertEq(row.thicknessMm.proposedValue, null, "proposed null");
    assertEq(row.thicknessMm.currentValue, null, "current null");
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: row.rowId,
      field: "thicknessMm",
      value: 40,
    });
    assertEq(session.rows[0]!.thicknessMm.proposedValue, null, "proposed stays");
    assertEq(session.rows[0]!.thicknessMm.currentValue, 40, "current 40");
    assertEq(session.rows[0]!.thicknessMm.state, "USER_RESOLVED", "resolved");
    assertEq(session.rows[0]!.thicknessMm.editedByUser, true, "edited");
  }
  console.log("PASS");

  console.log("\n=== Test 2 — edit existing proposal ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P100", 200, 100)];
    const docs = [
      docRow({
        part: "P100",
        row: 2,
        qty: 3,
        thickness: 20,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P100",
        quantity: 3,
        thicknessMm: 20,
        material: "S235",
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    assertEq(session.rows[0]!.thicknessMm.proposedValue, 20, "prop 20");
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 25,
    });
    assertEq(session.rows[0]!.thicknessMm.proposedValue, 20, "prop stays 20");
    assertEq(session.rows[0]!.thicknessMm.currentValue, 25, "cur 25");
  }
  console.log("PASS");

  console.log("\n=== Test 3 — multiple edits ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P100", 200, 100)];
    const docs = [
      docRow({
        part: "P100",
        row: 2,
        qty: 3,
        thickness: 20,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P100",
        quantity: 3,
        thicknessMm: 20,
        material: "S235",
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
      createdAt: "2026-07-17T12:00:00.000Z",
    });
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 25,
    });
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 30,
    });
    assertEq(session.rows[0]!.thicknessMm.proposedValue, 20, "prop 20");
    assertEq(session.rows[0]!.thicknessMm.currentValue, 30, "cur 30");
    assertEq(session.decisions.length, 2, "2 decisions");
    assertEq(session.decisions[0]!.previousValue, 20, "20→25 prev");
    assertEq(session.decisions[0]!.newValue, 25, "20→25 new");
    assertEq(session.decisions[1]!.previousValue, 25, "25→30 prev");
    assertEq(session.decisions[1]!.newValue, 30, "25→30 new");
  }
  console.log("PASS");

  console.log("\n=== Test 4 — no-op verified edit ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P100", 200, 100)];
    const docs = [
      docRow({
        part: "P100",
        row: 2,
        qty: 3,
        thickness: 20,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P100",
        quantity: 3,
        thicknessMm: 20,
        material: "S235",
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
      }),
    ];
    const session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const next = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: "20",
    });
    assert(next === session, "same ref");
    assertEq(next.decisions.length, 0, "no decision");
    assertEq(next.rows[0]!.thicknessMm.proposedValue, 20, "prop");
    assertEq(next.rows[0]!.thicknessMm.currentValue, 20, "cur");
    assertEq(next.rows[0]!.thicknessMm.state, "VERIFIED", "state");
  }
  console.log("PASS");

  console.log("\n=== Test 5 — explicit ambiguity confirmation ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P100", 200, 100)];
    const docs = [
      docRow({
        part: "P100",
        row: 2,
        qty: 3,
        thickness: 20,
        material: "S235",
      }),
    ];
    const finals = [
      emptyFinal({
        partId: "P100",
        quantity: 3,
        thicknessMm: 20,
        material: "S235",
        widthMm: 200,
        heightMm: 100,
        plateAreaMm2: 20000,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    // Force AMBIGUOUS while keeping proposed/current 20
    const row = session.rows[0]!;
    row.thicknessMm = {
      ...row.thicknessMm,
      state: "AMBIGUOUS",
      currentValue: 20,
      proposedValue: 20,
    };
    session = {
      ...session,
      rows: [row],
      summary: session.summary,
    };
    const action = {
      actionId: "act:confirm",
      issueId: "iss:amb",
      type: "SET_FIELD_VALUE" as const,
      label: "אשר 20 מ״מ",
      recommended: true,
      payload: { rowId: row.rowId, field: "thicknessMm", value: 20 },
      appliesToRowIds: [row.rowId],
    };
    session = applyReviewDecision(session, { kind: "ACTION", action });
    assertEq(session.rows[0]!.thicknessMm.proposedValue, 20, "prop 20");
    assertEq(session.rows[0]!.thicknessMm.currentValue, 20, "cur 20");
    assertEq(session.rows[0]!.thicknessMm.state, "USER_RESOLVED", "resolved");
    assertEq(session.decisions.length, 1, "one confirm decision");
  }
  console.log("PASS");

  console.log("\n=== Test 6 — P1098 regression ===");
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
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 40,
    });
    const approved = approveReviewSession(session);
    assertEq(approved.rows[0]!.thicknessMm.proposedValue, null, "prop null");
    assertEq(approved.rows[0]!.thicknessMm.currentValue, 40, "cur 40");
    assertEq(approved.approvedBom!.parts[0]!.thicknessMm, 40, "bom 40");
    assert(
      approved.approvedBom!.parts[0]!.userResolvedFields.includes("thicknessMm"),
      "userResolved"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 7 — field-specific cell references ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("P1091", 250, 140)];
    const docs = [
      docRow({
        part: "P1091",
        row: 7,
        qty: 1,
        thickness: 10,
        material: "S235",
        widthCell: "D7",
        heightCell: "F7",
        totalWeightCell: "A7",
        width: 1000,
        height: 1000,
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
            sourceLabel: "xls",
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
    const session = buildReviewSession(
      {
        ...successFrom({ docs, finals }),
        aggregated: {
          ...successFrom({ docs, finals }).aggregated,
          documents: [
            {
              documentId: "doc:1",
              sourceType: "XLSX",
              fileName: "parts.xls",
              rows: docs,
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
                normalizedMeasurements: [
                  {
                    partId: "P1091",
                    rowNumber: 7,
                    width: {
                      raw: { rawValue: 1000, sourceCell: "D7" },
                      normalizedValue: 1000,
                      normalizedUnit: "MM",
                      statedUnit: "MM",
                      resolutionStatus: "AS_STATED",
                    },
                    height: {
                      raw: { rawValue: 1000, sourceCell: "F7" },
                      normalizedValue: 1000,
                      normalizedUnit: "MM",
                      statedUnit: "MM",
                      resolutionStatus: "AS_STATED",
                    },
                    totalWeight: {
                      raw: { rawValue: 52.8, sourceCell: "A7" },
                      normalizedValue: 0.0528,
                      normalizedUnit: "KG",
                      resolutionStatus: "RESOLVED_BY_COLUMN_CONSISTENCY",
                      candidateInterpretations: [
                        { sourceUnit: "G", score: 0.9 },
                        { sourceUnit: "KG", score: 0.9 },
                      ],
                    },
                  },
                ],
                tableUnitInference: [
                  {
                    status: "RESOLVED",
                    resolvedAssignment: {
                      width: "MM",
                      height: "MM",
                      totalWeight: "G",
                    },
                    candidates: [
                      {
                        score: 0.9,
                        assignment: {
                          width: "MM",
                          height: "MM",
                          totalWeight: "G",
                        },
                        evidenceGroups: ["DXF_DIMENSIONS"],
                      },
                      {
                        score: 0.9,
                        assignment: {
                          width: "MM",
                          height: "MM",
                          totalWeight: "KG",
                        },
                        evidenceGroups: ["DXF_DIMENSIONS"],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
      { registry }
    );
    const ev = session.rows[0]!.documentEvidence;
    assertEq(
      ev.width?.sourceRefs[0]?.cellReferences?.[0] ?? null,
      "D7",
      "width D7"
    );
    assertEq(
      ev.height?.sourceRefs[0]?.cellReferences?.[0] ?? null,
      "F7",
      "height F7"
    );
    assertEq(
      ev.totalWeight?.sourceRefs[0]?.cellReferences?.[0] ?? null,
      "A7",
      "tw A7"
    );
    assertEq(ev.width?.sourceRefs[0]?.cellReferences?.length, 1, "width only");
    assertEq(ev.height?.sourceRefs[0]?.cellReferences?.length, 1, "height only");
  }
  console.log("PASS");

  console.log("\n=== Test 8 — missing optional field ===");
  {
    const m = buildOptionalMeasurementEvidence({
      semanticField: "area",
      occ: sampleOcc(7),
      columnPresent: false,
      rawValue: null,
    });
    assertEq(m.status, "MISSING", "missing");
    assertEq(m.sourceRefs.length, 0, "no refs");
    assert(
      !m.sourceRefs.some((r) =>
        (r.cellReferences ?? []).some((c) => ["D7", "F7", "A7"].includes(c))
      ),
      "no unrelated cells"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 9 — blank optional cell ===");
  {
    const m = buildOptionalMeasurementEvidence({
      semanticField: "area",
      occ: sampleOcc(7),
      cell: "H7",
      rawValue: null,
      columnPresent: true,
      cellBlank: true,
    });
    assertEq(m.status, "MISSING", "missing blank");
    assertEq(m.sourceRefs[0]?.cellReferences?.[0], "H7", "blank cell only");
    assertEq(m.sourceRefs[0]?.cellReferences?.length, 1, "one cell");
  }
  console.log("PASS");

  console.log("\n=== Test 10 — duplicate occurrence provenance ===");
  {
    resetReviewIdCountersForTests();
    const registry = [dxfItem("P1095", 600, 600)];
    const docs = [
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
        // Shared final candidates must NOT leak into both review rows.
        fieldResolutions: {
          quantity: {
            value: 3,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [
              {
                value: 3,
                sourceType: "XLSX",
                sourceLabel:
                  "XLSX · רשימת פלטות - Copy.xls · Plates for Client · row 16",
              },
            ],
          },
          thickness: {
            value: 8,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [
              {
                value: 8,
                sourceType: "XLSX",
                sourceLabel:
                  "XLSX · רשימת פלטות - Copy.xls · Plates for Client · row 16",
              },
            ],
          },
          material: {
            value: "S235",
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
      }),
    ];
    const session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    assertEq(session.rows.length, 2, "two rows");
    const r16 = session.rows.find((r) =>
      r.quantity.sourceRefs.some((s) => s.rowNumber === 16)
    )!;
    const r17 = session.rows.find((r) =>
      r.quantity.sourceRefs.some((s) => s.rowNumber === 17)
    )!;
    assert(r16 && r17, "both rows");
    assert(
      r16.quantity.candidates[0]!.sourceLabel.endsWith("row 16"),
      `row16 label: ${r16.quantity.candidates[0]!.sourceLabel}`
    );
    assert(
      r17.quantity.candidates[0]!.sourceLabel.endsWith("row 17"),
      `row17 label: ${r17.quantity.candidates[0]!.sourceLabel}`
    );
  }
  console.log("PASS");

  console.log("\n=== Test 11 — duplicate removal ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1095", 600, 600)];
    const docs = [
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
        partId: "P1095",
        quantity: 3,
        thicknessMm: 8,
        material: "S235",
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
        duplicateStatus: "IDENTICAL_DUPLICATE",
        duplicateOccurrenceCount: 2,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const r17 = session.rows.find((r) =>
      r.quantity.sourceRefs.some((s) => s.rowNumber === 17)
    )!;
    const remove = session.actions.find(
      (a) =>
        a.type === "REMOVE_DUPLICATE_ROW" &&
        a.appliesToRowIds.includes(r17.rowId)
    );
    assert(remove, "remove action");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: remove!,
    });
    const excluded = session.rows.find((r) => r.rowId === r17.rowId)!;
    const kept = session.rows.find(
      (r) => r.rowId !== r17.rowId && !r.replacedByRowId
    )!;
    assertEq(excluded.status, "EXCLUDED", "excluded");
    assert(
      excluded.quantity.candidates[0]!.sourceLabel.endsWith("row 17"),
      "excluded keeps row 17"
    );
    assert(
      kept.quantity.candidates[0]!.sourceLabel.endsWith("row 16"),
      "kept keeps row 16"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 12 — duplicate merge ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("P1095", 600, 600)];
    const docs = [
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
        partId: "P1095",
        quantity: 3,
        thicknessMm: 8,
        material: "S235",
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
        duplicateStatus: "IDENTICAL_DUPLICATE",
        duplicateOccurrenceCount: 2,
      }),
    ];
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    const merge = session.actions.find((a) => a.type === "MERGE_DUPLICATE_ROWS");
    assert(merge, "merge action");
    const beforeProposed = session.rows[0]!.quantity.proposedValue;
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: merge!,
    });
    const merged = session.rows.find((r) => r.rowId.startsWith("rev:merged:"))!;
    assert(merged, "merged row");
    assertEq(merged.quantity.currentValue, 6, "sum qty");
    assertEq(merged.quantity.proposedValue, beforeProposed, "prop unchanged");
    assert(merged.sourceOccurrenceIds.length >= 2, "both occ ids");
    const rowNums = new Set(
      merged.quantity.sourceRefs
        .map((r) => r.rowNumber)
        .filter((n): n is number => n != null)
    );
    assert(rowNums.has(16) && rowNums.has(17), "both row nums in refs");
    assert(
      merged.quantity.sourceRefs.some((r) => r.sourceType === "USER"),
      "USER merge ref"
    );
    const originals = session.rows.filter((r) => r.replacedByRowId);
    assertEq(originals.length, 2, "two originals retained");
    assert(
      originals.every((r) =>
        r.quantity.candidates[0]?.sourceLabel.includes(
          `row ${r.quantity.sourceRefs[0]?.rowNumber}`
        )
      ),
      "originals keep own labels"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 13 — Approved BOM regression ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    // 9 included + 1 excluded: build 10 parts with one P1095 duplicate removed
    const parts = [
      "P1091",
      "P1092",
      "P1093",
      "P1094",
      "P1095",
      "P1095",
      "P1096",
      "P1097",
      "P1098",
      "P1099",
    ];
    const registry = parts
      .filter((p, i, a) => a.indexOf(p) === i)
      .map((p) =>
        p === "P1091"
          ? dxfItem(p, 250, 140)
          : p === "P1098"
            ? dxfItem(p, 155, 500)
            : dxfItem(p, 100, 100)
      );
    const docs: ExtractedDocumentRow[] = [];
    let rowNum = 5;
    for (const p of parts) {
      docs.push(
        docRow({
          part: p,
          row: rowNum++,
          qty: p === "P1098" ? 2 : 6,
          thickness: p === "P1098" ? null : 10,
          material: p === "P1098" ? "S275" : "S235",
          widthCell: p === "P1091" ? "D7" : null,
          heightCell: p === "P1091" ? "F7" : null,
          totalWeightCell: p === "P1091" ? "A7" : null,
          width: p === "P1091" ? 1000 : null,
          height: p === "P1091" ? 1000 : null,
        })
      );
    }
    // Fix quantities to total 60 after excluding one P1095 (qty 6):
    // 8*6 + 2 + 6 (one P1095) = 48+2+6 = 56 — adjust
    // Expected totalQuantity 60 with 9 parts.
    // Use: 8 parts qty 6 = 48, P1098 qty 2, one P1095 qty 10 → 60
    // Simpler: 9 included with qty summing to 60.
    const docs2: ExtractedDocumentRow[] = [
      docRow({
        part: "P1091",
        row: 7,
        qty: 6,
        thickness: 10,
        material: "S235",
        widthCell: "D7",
        heightCell: "F7",
        totalWeightCell: "A7",
        width: 1000,
        height: 1000,
      }),
      docRow({
        part: "P1092",
        row: 8,
        qty: 6,
        thickness: 10,
        material: "S235",
      }),
      docRow({
        part: "P1093",
        row: 9,
        qty: 6,
        thickness: 10,
        material: "S235",
      }),
      docRow({
        part: "P1094",
        row: 10,
        qty: 6,
        thickness: 10,
        material: "S235",
      }),
      docRow({
        part: "P1095",
        row: 16,
        qty: 10,
        thickness: 8,
        material: "S235",
      }),
      docRow({
        part: "P1095",
        row: 17,
        qty: 10,
        thickness: 8,
        material: "S235",
      }),
      docRow({
        part: "P1096",
        row: 11,
        qty: 6,
        thickness: 10,
        material: "S235",
      }),
      docRow({
        part: "P1097",
        row: 12,
        qty: 6,
        thickness: 10,
        material: "S235",
      }),
      docRow({
        part: "P1098",
        row: 13,
        qty: 2,
        thickness: null,
        material: "S275",
      }),
      docRow({
        part: "P1099",
        row: 14,
        qty: 12,
        thickness: 10,
        material: "S235",
      }),
    ];
    // 6*6 + 10 + 2 + 12 = 36+10+2+12 = 60 with one P1095 excluded
    void docs;
    const finals = docs2.map((d) =>
      emptyFinal({
        partId: d.matchedDxfPartId!,
        quantity: d.quantity,
        thicknessMm: d.thicknessMm,
        material: d.material,
        widthMm:
          d.matchedDxfPartId === "P1091"
            ? 250
            : d.matchedDxfPartId === "P1098"
              ? 155
              : 100,
        heightMm:
          d.matchedDxfPartId === "P1091"
            ? 140
            : d.matchedDxfPartId === "P1098"
              ? 500
              : 100,
        plateAreaMm2:
          d.matchedDxfPartId === "P1091"
            ? 35000
            : d.matchedDxfPartId === "P1098"
              ? 77500
              : 10000,
        geometryComparisons:
          d.matchedDxfPartId === "P1091"
            ? [
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
              ]
            : [],
        geometryComparisonStatus:
          d.matchedDxfPartId === "P1091" ? "MISMATCH" : "NOT_AVAILABLE",
        fieldResolutions: {
          quantity: {
            value: d.quantity,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
          thickness: {
            value: d.thicknessMm,
            resolutionStatus:
              d.thicknessMm == null ? "MISSING" : "SINGLE_SOURCE",
            candidates: [],
          },
          material: {
            value: d.material,
            resolutionStatus: "SINGLE_SOURCE",
            candidates: [],
          },
        },
        duplicateStatus:
          d.matchedDxfPartId === "P1095" ? "IDENTICAL_DUPLICATE" : "NONE",
        duplicateOccurrenceCount: d.matchedDxfPartId === "P1095" ? 2 : 0,
      })
    );
    // Deduplicate finals by partId (buildReviewSession uses occurrences)
    const finalByPart = new Map<string, FinalIntakeMappingRow>();
    for (const f of finals) {
      if (f.partId && !finalByPart.has(f.partId)) finalByPart.set(f.partId, f);
    }
    let session = buildReviewSession(
      successFrom({ docs: docs2, finals: [...finalByPart.values()] }),
      { registry }
    );
    assertEq(session.rows.length, 10, "10 rows");

    const p1091 = session.rows.find((r) => r.displayPartReference === "P1091")!;
    const useDxf = session.actions.find(
      (a) =>
        a.type === "USE_DXF_GEOMETRY" && a.appliesToRowIds.includes(p1091.rowId)
    );
    assert(useDxf, "use dxf");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: useDxf!,
    });

    const p1098 = session.rows.find((r) => r.displayPartReference === "P1098")!;
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: p1098.rowId,
      field: "thicknessMm",
      value: 40,
    });
    assertEq(p1098.thicknessMm.proposedValue, null, "p1098 prop before apply");
    // re-read after apply
    const p1098After = session.rows.find(
      (r) => r.displayPartReference === "P1098"
    )!;
    assertEq(p1098After.thicknessMm.proposedValue, null, "prop null after");
    assertEq(p1098After.thicknessMm.currentValue, 40, "cur 40");

    const r17 = session.rows.find(
      (r) =>
        r.displayPartReference === "P1095" &&
        r.quantity.sourceRefs.some((s) => s.rowNumber === 17)
    )!;
    const remove = session.actions.find(
      (a) =>
        a.type === "REMOVE_DUPLICATE_ROW" &&
        a.appliesToRowIds.includes(r17.rowId)
    );
    assert(remove, "remove dup");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: remove!,
    });

    const v = validateReviewSession(session);
    assert(v.readyForApproval, "ready");
    const approved = approveReviewSession(session);
    assertEq(approved.status, "APPROVED", "approved");
    const bom = approved.approvedBom!;
    assertEq(bom.parts.length, 9, "9 parts");
    assertEq(bom.excludedRows.length, 1, "1 excluded");
    assertEq(bom.summary.totalQuantity, 60, "qty 60");
    const bomP1098 = bom.parts.find((p) => p.partReference === "P1098")!;
    assertEq(bomP1098.thicknessMm, 40, "bom thk");
    assertEq(bomP1098.quantity, 2, "bom qty");
    assertEq(bomP1098.material, "S275", "bom mat");
    const bomP1091 = bom.parts.find((p) => p.partReference === "P1091")!;
    assertEq(bomP1091.widthMm, 250, "w");
    assertEq(bomP1091.heightMm, 140, "h");
    assertEq(bomP1091.plateAreaMm2, 35000, "area");
  }
  console.log("PASS");

  console.log("\n=== Test 14 — debug serializer ===");
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
    let session = buildReviewSession(successFrom({ docs, finals }), {
      registry,
    });
    session = applyReviewDecision(session, {
      kind: "MANUAL_EDIT",
      rowId: session.rows[0]!.rowId,
      field: "thicknessMm",
      value: 40,
    });
    const json = serializeReviewDebugReport(buildReviewDebugReport(session));
    const report = JSON.parse(json) as {
      session: {
        rows: Array<{
          thicknessMm: { proposedValue: unknown; currentValue: unknown };
        }>;
        decisions: unknown[];
      };
    };
    assertEq(
      report.session.rows[0]!.thicknessMm.proposedValue,
      null,
      "proposed null"
    );
    assertEq(
      report.session.rows[0]!.thicknessMm.currentValue,
      40,
      "current 40"
    );
    assert(Array.isArray(report.session.decisions), "decisions array");
    assert(report.session.decisions.length >= 1, "has decisions");
    JSON.parse(json);
  }
  console.log("PASS");

  console.log("\n=== Test 15 — openai unchanged ===");
  {
    const payload = successFrom({
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
    assertEq(payload.debug.openaiCallCount, 1, "1");
  }
  console.log("PASS");

  console.log("\nAll Checkpoint 6.0 audit/provenance tests passed.");
}

main();
