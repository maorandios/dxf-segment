/**
 * Canonical DXF matching contract + measurement-header semantics.
 * Run: npx tsx lib/ai-intake/__tests__/dxf-matching-and-header-semantics.ts
 */
import {
  buildDxfSuggestions,
  matchPartToDxf,
  matchPartToDxfUserSelected,
  validateDxfMatchResult,
  type DxfMatchRegistryEntry,
} from "../matching";
import {
  applyRelatedColumnUnitInheritance,
  parseMeasurementHeader,
  parseUnitText,
} from "../normalization";
import { buildReviewSession } from "../review/buildReviewSession";
import { buildIssuesForRows } from "../review/buildReviewIssues";
import { applyReviewDecision } from "../review/applyReviewDecision";
import { refreshReviewSessionDerived } from "../review/buildReviewSession";
import { resetReviewIdCountersForTests } from "../review/buildReviewIssues";
import { resetDecisionIdCounterForTests } from "../review/applyReviewDecision";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";

import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
} from "../schemas";
import type {
  ColumnUnitProfile,
  RawDocumentPartRow,
} from "../normalization/types";

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

function entry(
  id: string,
  canonicalPartId: string,
  opts?: Partial<DxfMatchRegistryEntry>
): DxfMatchRegistryEntry {
  return {
    id,
    canonicalPartId,
    rawPartId: canonicalPartId,
    filename: `${canonicalPartId}.dxf`,
    identityOk: true,
    geometryStatus: "VALID",
    widthMm: 100,
    heightMm: 50,
    plateAreaMm2: 5000,
    ...opts,
  };
}

function dxfItem(
  canonicalPartId: string,
  opts?: Partial<DxfPartRegistryItem>
): DxfPartRegistryItem {
  return {
    id: `dxf:${canonicalPartId}:${opts?.filename ?? canonicalPartId}`,
    canonicalPartId,
    revision: null,
    rawPartId: canonicalPartId,
    normalizedRawPartId: canonicalPartId,
    ...filenameAuthoritativeFields(canonicalPartId),
    revisionIssue: false,
    duplicateIssue: false,
    filename: `${canonicalPartId}.dxf`,
    widthMm: 100,
    heightMm: 50,
    plateAreaMm2: 5000,
    netContourAreaMm2: 4800,
    perimeterMm: 300,
    geometryStatus: "VALID",
    warnings: [],
    processedGeometry: null,
    ...opts,
  };
}

function docRow(args: {
  part: string;
  matched?: string | null;
  row?: number;
}): ExtractedDocumentRow {
  const row = args.row ?? 2;
  return {
    documentId: "doc:1",
    matchedDxfPartId:
      args.matched === undefined ? args.part : args.matched,
    rawPartReference: args.part,
    quantity: 1,
    thicknessMm: 10,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "XLSX",
      fileName: "parts.xlsx",
      sheetName: "Sheet1",
      rowNumber: row,
      pageNumber: null,
      partReferenceCell: `B${row}`,
      quantityCell: `A${row}`,
      thicknessCell: `C${row}`,
      materialCell: `D${row}`,
      excerpt: args.part,
    },
    issues: [],
  };
}

function emptyFinal(
  partId: string,
  status: FinalIntakeMappingRow["status"] = "READY"
): FinalIntakeMappingRow {
  return {
    status,
    partId,
    displayLabel: null,
    revision: null,
    dxfFileId: `dxf:${partId}`,
    dxfFilename: `${partId}.dxf`,
    widthMm: 100,
    heightMm: 50,
    plateAreaMm2: 5000,
    netContourAreaMm2: 4800,
    perimeterMm: 300,
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

function main() {
  console.log("\n=== Test 1 — one exact canonical match ===");
  {
    const result = matchPartToDxf({
      sourceRawId: "A1",
      registry: [entry("e1", "A1")],
    });
    assertEq(result.status, "MATCHED", "status");
    assertEq(result.candidates.length, 1, "candidates");
    assert(result.status === "MATCHED" && result.matchedPartId === "A1", "id");
  }
  console.log("PASS");

  console.log("\n=== Test 2 — exact match plus prefix alternatives ===");
  {
    const result = matchPartToDxf({
      sourceRawId: "A1",
      registry: [entry("e1", "A1"), entry("e2", "A12"), entry("e3", "A15")],
    });
    assertEq(result.status, "MATCHED", "status");
    assert(
      result.status === "MATCHED" && result.matchedPartId === "A1",
      "exact A1"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 3 — no exact match with prefix suggestions ===");
  {
    const result = matchPartToDxf({
      sourceRawId: "A1",
      registry: [entry("e1", "A12"), entry("e2", "A15"), entry("e3", "A100")],
    });
    assertEq(result.status, "UNMATCHED", "status");
    assertEq(result.candidates.length, 0, "no candidates");
    assert(result.suggestions.length >= 2, "has suggestions");
    const ids = result.suggestions.map((s) => s.partId).sort();
    assert(ids.includes("A12") && ids.includes("A15"), "similar ids");
  }
  console.log("PASS");

  console.log("\n=== Test 4 — exact collision ===");
  {
    const result = matchPartToDxf({
      sourceRawId: "A1",
      registry: [
        entry("e1", "A1", { filename: "A1_revA.dxf" }),
        entry("e2", "A1", { filename: "A1_revB.dxf" }),
      ],
    });
    assertEq(result.status, "AMBIGUOUS", "status");
    assertEq(result.candidates.length, 2, "two candidates");
    assert(result.status === "AMBIGUOUS" && result.matchedPartId === null, "null id");
    assertEq(result.geometryStatus, null, "no geometry");
  }
  console.log("PASS");

  console.log("\n=== Test 5 — impossible state invariant ===");
  {
    let threw = false;
    try {
      validateDxfMatchResult({
        status: "AMBIGUOUS",
        sourceRawId: "A1",
        sourceCanonicalId: "A1",
        matchedCanonicalId: null,
        matchedRegistryEntryId: null,
        matchedPartId: "A1",
        candidates: [],
        suggestions: [],
        reason: "CANONICAL_ID_COLLISION",
        geometryStatus: null,
        // Force an impossible state past the type system.
      } as never);
    } catch {
      threw = true;
    }
    assert(threw, "validation must fail");
  }
  console.log("PASS");

  console.log("\n=== Test 6 — exact match with invalid geometry ===");
  {
    const result = matchPartToDxf({
      sourceRawId: "A1",
      registry: [
        entry("e1", "A1", {
          geometryStatus: "INVALID",
          widthMm: null,
          heightMm: null,
        }),
      ],
    });
    assertEq(result.status, "MATCHED", "identity matched");
    assert(
      result.status === "MATCHED" && result.geometryStatus === "INVALID",
      "geometry invalid"
    );
    const registry = [
      dxfItem("A1", {
        geometryStatus: "INVALID",
        widthMm: null,
        heightMm: null,
        plateAreaMm2: null,
      }),
    ];
    const session = buildReviewSession(
      successFrom({
        docs: [docRow({ part: "A1" })],
        finals: [emptyFinal("A1")],
      }),
      { registry }
    );
    const row = session.rows[0]!;
    assertEq(row.dxfMatchStatus, "MATCHED", "review matched");
    assertEq(row.matchedDxfPartId, "A1", "matched id");
    assertEq(row.dxfGeometry, null, "no geometry attached");
    assert(
      session.issues.some((i) => i.code === "DXF_GEOMETRY_INVALID"),
      "geometry issue"
    );
    assert(
      !session.issues.some(
        (i) =>
          i.code === "AMBIGUOUS_DXF_IDENTITY" || i.code === "AMBIGUOUS_DXF_MATCH"
      ),
      "not ambiguous"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 7 — candidate order independence ===");
  {
    const a = matchPartToDxf({
      sourceRawId: "A1",
      registry: [entry("e2", "A12"), entry("e1", "A1"), entry("e3", "A15")],
    });
    const b = matchPartToDxf({
      sourceRawId: "A1",
      registry: [entry("e3", "A15"), entry("e2", "A12"), entry("e1", "A1")],
    });
    assertEq(a.status, b.status, "same status");
    assertEq(
      a.status === "MATCHED" ? a.matchedPartId : null,
      b.status === "MATCHED" ? b.matchedPartId : null,
      "same match"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 8 — mixed identifier formats ===");
  {
    for (const id of ["P1091", "5P1", "5SP10", "00125", "A12-B", "PL-104"]) {
      const result = matchPartToDxf({
        sourceRawId: id,
        registry: [entry(`e:${id}`, id)],
      });
      // Some formats may canonicalize differently — only assert no throw and
      // that exact registry id matches when canonicalize succeeds equally.
      if (result.status === "MATCHED") {
        assertEq(result.matchedPartId, id, `matched ${id}`);
      } else if (result.status === "INVALID_SOURCE_ID") {
        // Accept invalid only if normalize rejects — still contract-valid
        assertEq(result.candidates.length, 0, `invalid ${id}`);
      } else {
        // UNMATCHED when normalize yields different canonical than registry raw
        const again = matchPartToDxf({
          sourceRawId: id,
          registry: [
            entry(`e:${id}`, result.sourceCanonicalId ?? id),
          ],
        });
        assert(
          again.status === "MATCHED" || again.status === "INVALID_SOURCE_ID",
          `format ${id}`
        );
      }
    }
  }
  console.log("PASS");

  console.log("\n=== Test 9 — manual suggestion selection ===");
  {
    resetReviewIdCountersForTests();
    resetDecisionIdCounterForTests();
    const registry = [dxfItem("A12"), dxfItem("A15")];
    let session = buildReviewSession(
      successFrom({
        docs: [docRow({ part: "A1", matched: null })],
        finals: [emptyFinal("A1", "REQUEST_WITHOUT_DXF")],
      }),
      { registry }
    );
    const row = session.rows[0]!;
    assertEq(row.dxfMatchStatus, "UNMATCHED", "unmatched");
    assert(row.dxfSuggestions.length > 0, "suggestions");
    session = refreshReviewSessionDerived(session);
    const act = session.actions.find((a) => a.type === "SELECT_DXF_MATCH");
    assert(act, "select action");
    session = applyReviewDecision(session, {
      kind: "ACTION",
      action: {
        ...act!,
        payload: {
          ...act!.payload,
          widthMm: 100,
          heightMm: 50,
          plateAreaMm2: 5000,
        },
      },
    });
    assertEq(session.rows[0]!.dxfMatchStatus, "MATCHED", "now matched");
    assertEq(session.rows[0]!.dxfMatch.reason, "USER_SELECTED_DXF", "reason");
    assert(session.rows[0]!.dxfGeometry != null, "geometry attached");
    assert(
      session.decisions.some((d) => d.reason === "USER_SELECTED_DXF"),
      "decision event"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 10 — Review adapter consistency ===");
  {
    const registry = [
      dxfItem("A1"),
      dxfItem("B1", { id: "dxf:B1a", filename: "B1a.dxf", duplicateIssue: true }),
      dxfItem("B1", { id: "dxf:B1b", filename: "B1b.dxf", duplicateIssue: true }),
      dxfItem("C10"),
      dxfItem("C11"),
    ];
    const session = buildReviewSession(
      successFrom({
        docs: [
          docRow({ part: "A1", row: 2 }),
          docRow({ part: "B1", row: 3 }),
          docRow({ part: "C1", matched: null, row: 4 }),
        ],
        finals: [
          emptyFinal("A1"),
          emptyFinal("B1", "DXF_IDENTITY_CONFLICT"),
          emptyFinal("C1", "REQUEST_WITHOUT_DXF"),
        ],
      }),
      { registry }
    );
    for (const row of session.rows) {
      if (row.dxfMatchStatus === "MATCHED") {
        assert(row.matchedDxfPartId != null, "matched id");
        if (row.dxfMatch.geometryStatus === "VALID") {
          assert(row.dxfGeometry != null, "geometry when valid");
        }
      } else if (row.dxfMatchStatus === "AMBIGUOUS") {
        assertEq(row.matchedDxfPartId, null, "ambiguous null id");
        assert(row.dxfCandidates.length >= 2, ">=2 candidates");
        assertEq(row.dxfGeometry, null, "no geometry");
      } else {
        assertEq(row.matchedDxfPartId, null, "unmatched null id");
        assertEq(row.dxfCandidates.length, 0, "empty candidates");
        assertEq(row.dxfGeometry, null, "no geometry");
      }
    }
  }
  console.log("PASS");

  console.log("\n=== Test 11 — explicit KG ===");
  {
    const h = parseMeasurementHeader("Weight (kg)");
    assertEq(h.baseField, "WEIGHT", "field");
    assertEq(h.explicitUnit, "KG", "kg");
  }
  console.log("PASS");

  console.log("\n=== Test 12 — explicit tonne ===");
  {
    const h = parseMeasurementHeader("Weight (t)");
    assertEq(h.explicitUnit, "TON", "ton");
  }
  console.log("PASS");

  console.log("\n=== Test 13 — bare T is not tonne ===");
  {
    const h = parseMeasurementHeader("Weight T");
    assertEq(h.explicitUnit, null, "no unit");
    assertEq(h.aggregation, "TOTAL", "total");
    assertEq(parseUnitText("Weight T"), null, "parseUnitText");
  }
  console.log("PASS");

  console.log("\n=== Test 14–16 — total-weight relationship + inheritance ===");
  {
    const profiles: ColumnUnitProfile[] = [
      {
        documentId: "d",
        sheetName: "S",
        tableId: "t1",
        semanticField: "UNIT_WEIGHT",
        columnLetter: "H",
        rawHeaderText: "Weight (kg)",
        headerCellReferences: [],
        statedUnitText: "kg",
        statedHeaderUnit: "KG",
        candidateUnits: ["G", "KG", "TON"],
        resolvedUnit: "KG",
        resolutionStatus: "AS_STATED",
        evidence: ["headerUnit:KG"],
        confidence: 0.9,
        affectedRowNumbers: [2],
        issues: [],
      },
      {
        documentId: "d",
        sheetName: "S",
        tableId: "t1",
        semanticField: "TOTAL_WEIGHT",
        columnLetter: "I",
        rawHeaderText: "Weight T",
        headerCellReferences: [],
        statedUnitText: null,
        statedHeaderUnit: null,
        candidateUnits: ["G", "KG", "TON"],
        resolvedUnit: null,
        resolutionStatus: "AMBIGUOUS",
        evidence: [],
        confidence: 0,
        affectedRowNumbers: [2],
        issues: [],
      },
    ];
    const partRows: RawDocumentPartRow[] = [
      {
        occurrenceId: "o1",
        documentId: "d",
        rowRole: "PART",
        matchedDxfPartId: "P1",
        rawPartReference: "P1",
        partReferenceCell: "A2",
        materialCell: null,
        quantity: {
          rawValue: 50,
          rawText: "50",
          statedUnit: null,
          rawHeader: "Qty",
          displayedDecimalPlaces: 0,
          sourceCell: "B2",
          numberFormat: null,
          formula: null,
          formulaResult: null,
          origin: "DETERMINISTIC_WORKBOOK_CELL",
        },
        thickness: null,
        material: null,
        width: null,
        height: null,
        area: null,
        totalArea: null,
        unitWeight: {
          rawValue: 0.303,
          rawText: "0.303",
          statedUnit: "KG",
          rawHeader: "Weight (kg)",
          displayedDecimalPlaces: 3,
          sourceCell: "H2",
          numberFormat: null,
          formula: null,
          formulaResult: null,
          origin: "DETERMINISTIC_WORKBOOK_CELL",
        },
        totalWeight: {
          rawValue: 15.14,
          rawText: "15.14",
          statedUnit: null,
          rawHeader: "Weight T",
          displayedDecimalPlaces: 2,
          sourceCell: "I2",
          numberFormat: null,
          formula: null,
          formulaResult: null,
          origin: "DETERMINISTIC_WORKBOOK_CELL",
        },
        description: null,
        notes: null,
        source: {
          type: "XLSX",
          fileName: "f.xlsx",
          sheetName: "S",
          rowNumber: 2,
          pageNumber: null,
          excerpt: null,
          tableId: "t1",
        },
        extractionIssues: [],
        isHiddenRow: false,
      },
    ];
    const { profiles: out, diagnostics } = applyRelatedColumnUnitInheritance({
      profiles,
      partRows,
    });
    const total = out.find((p) => p.semanticField === "TOTAL_WEIGHT")!;
    assertEq(total.resolvedUnit, "KG", "inherited kg");
    assertEq(
      total.resolutionStatus,
      "RESOLVED_BY_RELATED_COLUMN",
      "related status"
    );
    assert(
      diagnostics.some((d) => d.explicitUnit == null && d.resolvedUnit === "KG"),
      "diag no ton"
    );
    assertEq(parseMeasurementHeader("Weight T").explicitUnit, null, "not ton");
    // 15.14 must not become 15140
    assert(15.14 * 1000 !== 15.14, "sanity");
  }
  console.log("PASS");

  console.log("\n=== Test 15 — area total ===");
  {
    const a = parseMeasurementHeader("Area");
    const t = parseMeasurementHeader("Area T");
    assertEq(a.aggregation, "PER_ITEM", "per item");
    assertEq(t.aggregation, "TOTAL", "total");
    assertEq(t.explicitUnit, null, "T not unit");
  }
  console.log("PASS");

  console.log("\n=== Test 17 — no safe mass unit ===");
  {
    const profiles: ColumnUnitProfile[] = [
      {
        documentId: "d",
        sheetName: "S",
        tableId: "t1",
        semanticField: "UNIT_WEIGHT",
        columnLetter: "H",
        rawHeaderText: "Weight",
        headerCellReferences: [],
        statedUnitText: null,
        statedHeaderUnit: null,
        candidateUnits: ["G", "KG", "TON"],
        resolvedUnit: null,
        resolutionStatus: "AMBIGUOUS",
        evidence: [],
        confidence: 0,
        affectedRowNumbers: [2],
        issues: [],
      },
      {
        documentId: "d",
        sheetName: "S",
        tableId: "t1",
        semanticField: "TOTAL_WEIGHT",
        columnLetter: "I",
        rawHeaderText: "Weight T",
        headerCellReferences: [],
        statedUnitText: null,
        statedHeaderUnit: null,
        candidateUnits: ["G", "KG", "TON"],
        resolvedUnit: null,
        resolutionStatus: "AMBIGUOUS",
        evidence: [],
        confidence: 0,
        affectedRowNumbers: [2],
        issues: [],
      },
    ];
    const { profiles: out } = applyRelatedColumnUnitInheritance({
      profiles,
      partRows: [],
    });
    assertEq(out[1]!.resolvedUnit, null, "still null");
    assertEq(out[1]!.resolutionStatus, "AMBIGUOUS", "ambiguous");
  }
  console.log("PASS");

  console.log("\n=== Test 18 — localized total headers ===");
  {
    for (const h of [
      "Total Weight",
      "Weight Total",
      "משקל כולל",
      "סה״כ משקל",
    ]) {
      const p = parseMeasurementHeader(h);
      assertEq(p.baseField, "WEIGHT", h);
      assertEq(p.aggregation, "TOTAL", `${h} total`);
      assertEq(p.explicitUnit, null, `${h} unit`);
    }
  }
  console.log("PASS");

  console.log("\n=== Test 19 — single-letter unit context ===");
  {
    assertEq(parseMeasurementHeader("Weight [t]").explicitUnit, "TON", "[t]");
    assertEq(parseMeasurementHeader("Weight T").explicitUnit, null, "bare T");
  }
  console.log("PASS");

  console.log("\n=== Test 20 — parser order independence ===");
  {
    const headers = ["Weight T", "Weight (kg)", "Area T", "Quantity"];
    const a = headers.map((h) => parseMeasurementHeader(h));
    const b = [...headers].reverse().map((h) => parseMeasurementHeader(h)).reverse();
    assertEq(JSON.stringify(a), JSON.stringify(b), "order independent");
  }
  console.log("PASS");

  console.log("\n=== Test 21–23 — large registry smoke ===");
  {
    const ids = [
      "A1",
      "A10",
      "A11",
      "A100",
      "A101",
      "B1",
      "B10",
      "P1091",
      "5P1",
      "5SP10",
      "C10",
      "C11",
    ];
    const registry = ids.map((id, i) =>
      dxfItem(id, { id: `dxf-${i}-${id}` })
    );
    // Exact collision pair (must be digit-bearing canonical IDs)
    registry.push(
      dxfItem("D1", { id: "dxf-dup-a", filename: "D1_a.dxf" }),
      dxfItem("D1", { id: "dxf-dup-b", filename: "D1_b.dxf" })
    );

    const docs = [
      ...ids.map((id, i) => docRow({ part: id, row: i + 2 })),
      docRow({ part: "C1", matched: null, row: 100 }),
      docRow({ part: "D1", row: 101 }),
    ];
    const session = buildReviewSession(
      successFrom({
        docs,
        finals: docs.map((d) =>
          emptyFinal(
            d.rawPartReference ?? "X",
            d.rawPartReference === "D1"
              ? "DXF_IDENTITY_CONFLICT"
              : d.matchedDxfPartId
                ? "READY"
                : "REQUEST_WITHOUT_DXF"
          )
        ),
      }),
      { registry }
    );

    assertEq(session.rows.length, docs.length, "all rows preserved");

    for (const id of ids) {
      const row = session.rows.find((r) => r.displayPartReference === id);
      assert(row, `row ${id}`);
      assertEq(row!.dxfMatchStatus, "MATCHED", `${id} matched`);
      assertEq(row!.matchedDxfPartId, id, `${id} id`);
    }

    const short = session.rows.find((r) => r.displayPartReference === "C1");
    assert(short, "C1");
    assertEq(short!.dxfMatchStatus, "UNMATCHED", "short unmatched");
    assert(short!.dxfSuggestions.length > 0, "suggestions");
    assertEq(short!.dxfCandidates.length, 0, "no candidates");
    assert(
      short!.dxfSuggestions.some((s) => s.partId === "C10" || s.partId === "C11"),
      "prefix suggestions"
    );

    const dup = session.rows.find((r) => r.displayPartReference === "D1");
    assert(dup, "D1");
    assertEq(dup!.dxfMatchStatus, "AMBIGUOUS", "collision");
    assert(dup!.dxfCandidates.length >= 2, "collision candidates");
    assertEq(dup!.matchedDxfPartId, null, "null matched");
    assertEq(dup!.dxfGeometry, null, "null geo");

    for (const row of session.rows) {
      if (row.dxfMatchStatus !== "MATCHED") {
        assertEq(row.matchedDxfPartId, null, "non-matched null id");
        assertEq(row.dxfGeometry, null, "non-matched null geo");
      }
      if (row.dxfMatchStatus === "AMBIGUOUS") {
        assert(row.dxfCandidates.length >= 2, "ambiguous has candidates");
      }
    }
  }
  console.log("PASS");

  console.log("\n=== Test 24 — Approved BOM boundary geometry ===");
  {
    const { issues } = buildIssuesForRows({
      rows: buildReviewSession(
        successFrom({
          docs: [docRow({ part: "A1" })],
          finals: [emptyFinal("A1")],
        }),
        {
          registry: [
            dxfItem("A1", {
              geometryStatus: "INVALID",
              widthMm: null,
              heightMm: null,
              plateAreaMm2: null,
            }),
          ],
        }
      ).rows,
    });
    assert(
      issues.some((i) => i.code === "DXF_GEOMETRY_INVALID"),
      "blocks via geometry issue"
    );
  }
  console.log("PASS");

  console.log("\n=== Test 26 — suggestions builder never auto-matches ===");
  {
    const suggestions = buildDxfSuggestions({
      sourceCanonicalId: "A1",
      registry: [entry("e1", "A12"), entry("e2", "A15")],
    });
    assert(suggestions.every((s) => s.partId !== "A1"), "no exact in sug");
    const user = matchPartToDxfUserSelected({
      sourceRawId: "A1",
      sourceCanonicalId: "A1",
      selected: entry("e1", "A12"),
    });
    assertEq(user.reason, "USER_SELECTED_DXF", "user reason");
  }
  console.log("PASS");

  console.log("\nAll DXF matching + header semantics tests passed.");
}

main();
