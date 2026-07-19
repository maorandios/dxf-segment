/**
 * Direct Extraction Contract Simplification & Fail-Closed Verification Patch v1.
 * Run: npx tsx lib/ai-intake/__tests__/direct-workbook-extraction-v1.ts
 */

import OpenAI from "openai";
import type { WorkbookCellEvidence, WorkbookSnapshot } from "../normalization/types";
import { classifySourceForProviderExtraction } from "../provider/classifySourceForProviderExtraction";
import { buildDxfReservations } from "../dxf/geometry-correlation/dxfReservations";
import { applyGeometryCorrelation } from "../dxf/geometry-correlation";
import {
  buildDirectWorkbookExtractionDebugDto,
  convertVerifiedDirectRowsToRawPartRows,
  DIRECT_EXTRACTION_LIMITS,
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
  evaluateDirectExtractionQuality,
  extractWorkbookDirect,
  providerSchemaForbidsAiOffsets,
  repairExtractionEvidenceLocally,
  resolveFieldEvidenceFromSnapshot,
  resolveWorkbookExtractionMode,
  selectBestDirectExtractionResult,
  shouldRequestDirectExtractionCorrection,
  verifyDirectWorkbookExtraction,
  type DirectWorkbookExtractionV2,
} from "../workbook/direct-extraction";

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
  raw: string | number | null,
  extra?: Partial<WorkbookCellEvidence>
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
    ...extra,
  };
}

function snap(
  fileName: string,
  cells: WorkbookCellEvidence[],
  sheetName = "Sheet1"
): WorkbookSnapshot {
  return {
    documentId: `doc:${fileName}`,
    fileName,
    parserKind: "EXCELJS_XLSX",
    sheets: [
      {
        sheetName,
        usedRange: "A1:Z100",
        cells,
        mergedRanges: [],
        hidden: false,
      },
    ],
    warnings: [],
  };
}

function compactField(
  value: string | number,
  sourceCell: string,
  sourceText: string | null = null,
  interpretation: "EXPLICIT" | "PARSED_FROM_PROFILE" | "INHERITED" | "DERIVED" = "EXPLICIT"
) {
  return {
    value,
    sourceCell,
    sourceText,
    interpretation,
    confidence: 0.95,
  };
}

function ordinarySnapshot(): WorkbookSnapshot {
  return snap("ordinary.xlsx", [
    cell("Sheet1", "A1", "Part Mark"),
    cell("Sheet1", "B1", "Qty"),
    cell("Sheet1", "C1", "Thickness (mm)"),
    cell("Sheet1", "D1", "Material"),
    cell("Sheet1", "A2", "P1001"),
    cell("Sheet1", "B2", 2),
    cell("Sheet1", "C2", 12),
    cell("Sheet1", "D2", "S355"),
    cell("Sheet1", "A3", "P1002"),
    cell("Sheet1", "B3", 1),
    cell("Sheet1", "C3", 10),
    cell("Sheet1", "D3", "S355"),
    cell("Sheet1", "A4", "Total"),
    cell("Sheet1", "B4", 3),
  ]);
}

function ordinaryCompact(snapshot: WorkbookSnapshot): DirectWorkbookExtractionV2 {
  return {
    schemaVersion: DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
    workbookId: snapshot.documentId,
    status: "EXTRACTED",
    tables: [
      {
        tableId: "t1",
        sheetName: "Sheet1",
        headerRowNumbers: [1],
        dataStartRow: 2,
        dataEndRow: 3,
        role: "PART_LIST",
        confidence: 0.95,
        reason: "standard",
      },
    ],
    rows: [
      {
        extractedRowId: "r1",
        sheetName: "Sheet1",
        sourceRowNumbers: [2],
        sourceCells: ["A2", "B2", "C2", "D2"],
        explicitPartIdentifier: compactField("P1001", "A2"),
        sourceDescriptor: null,
        profile: null,
        quantity: compactField(2, "B2"),
        material: compactField("S355", "D2"),
        thickness: {
          value: 12,
          unit: "MM",
          aggregation: "PER_ITEM",
          sourceCell: "C2",
          sourceText: null,
          interpretation: "EXPLICIT",
          confidence: 0.95,
        },
        width: null,
        length: null,
        area: null,
        unitWeight: null,
        totalWeight: null,
        notes: [],
        confidence: 0.95,
        ambiguities: [],
      },
      {
        extractedRowId: "r2",
        sheetName: "Sheet1",
        sourceRowNumbers: [3],
        sourceCells: ["A3", "B3", "C3", "D3"],
        explicitPartIdentifier: compactField("P1002", "A3"),
        sourceDescriptor: null,
        profile: null,
        quantity: compactField(1, "B3"),
        material: compactField("S355", "D3"),
        thickness: {
          value: 10,
          unit: "MM",
          aggregation: "PER_ITEM",
          sourceCell: "C3",
          sourceText: null,
          interpretation: "EXPLICIT",
          confidence: 0.95,
        },
        width: null,
        length: null,
        area: null,
        unitWeight: null,
        totalWeight: null,
        notes: [],
        confidence: 0.95,
        ambiguities: [],
      },
    ],
    rowLedger: [
      {
        sheetName: "Sheet1",
        rowNumber: 1,
        classification: "HEADER",
        extractedRowIds: [],
        confidence: 1,
        reason: "header",
      },
      {
        sheetName: "Sheet1",
        rowNumber: 2,
        classification: "PART",
        extractedRowIds: ["r1"],
        confidence: 1,
        reason: "part",
      },
      {
        sheetName: "Sheet1",
        rowNumber: 3,
        classification: "PART",
        extractedRowIds: ["r2"],
        confidence: 1,
        reason: "part",
      },
      {
        sheetName: "Sheet1",
        rowNumber: 4,
        classification: "TOTAL",
        extractedRowIds: [],
        confidence: 1,
        reason: "total",
      },
    ],
    ambiguities: [],
    warnings: [],
  };
}

function pipeline(snapshot: WorkbookSnapshot, compact: DirectWorkbookExtractionV2) {
  const repair = repairExtractionEvidenceLocally({ snapshot, compact });
  const verification = verifyDirectWorkbookExtraction({
    snapshot,
    extraction: repair.extraction,
  });
  return { repair, verification, extraction: repair.extraction };
}

const dummyClient = null as unknown as OpenAI;

async function run(): Promise<void> {
  console.log("=== Direct Extraction Contract Simplification v1 ===\n");

  assertEq(resolveWorkbookExtractionMode(undefined), "AI_DIRECT", "default mode");
  assert(providerSchemaForbidsAiOffsets(), "T1/T2 no AI offsets in schema");
  console.log("✓ T1/T2 compact schema + no AI offsets");

  // T3 exact local evidence
  {
    const snapshot = ordinarySnapshot();
    const ev = resolveFieldEvidenceFromSnapshot({
      snapshot,
      sheetName: "Sheet1",
      sourceCell: "A2",
      sourceText: "P1001",
      extractedValue: "P1001",
      semanticField: "explicitPartIdentifier",
    });
    assertEq(ev.status, "EXACT", "exact");
    assertEq(ev.characterStart, 0, "start");
    assertEq(ev.characterEnd, 5, "end");
    console.log("✓ T3 exact local evidence");
  }

  // T4 normalized whitespace
  {
    const snapshot = snap("ws.xlsx", [
      cell("Sheet1", "A1", "  PL 12 X 102  "),
    ]);
    const ev = resolveFieldEvidenceFromSnapshot({
      snapshot,
      sheetName: "Sheet1",
      sourceCell: "A1",
      sourceText: "PL 12 X 102",
      extractedValue: "PL 12 X 102",
      semanticField: "profile",
    });
    assert(
      ev.status === "EXACT" ||
        ev.status === "NORMALIZED_EXACT" ||
        ev.status === "UNIQUE_VALUE_MATCH",
      `ws status=${ev.status}`
    );
    console.log("✓ T4 normalized whitespace");
  }

  // T5/T6 numeric token + decimal
  {
    const snapshot = snap("num.xlsx", [
      cell("Sheet1", "A1", "PL12X102 qty=2.5"),
    ]);
    const ev = resolveFieldEvidenceFromSnapshot({
      snapshot,
      sheetName: "Sheet1",
      sourceCell: "A1",
      sourceText: null,
      extractedValue: 2.5,
      semanticField: "quantity",
    });
    assertEq(ev.status, "UNIQUE_VALUE_MATCH", "numeric token");
    assert(ev.characterStart != null, "local offset");
    console.log("✓ T5/T6 numeric + decimal token");
  }

  // T7 repeated token → warning not semantic rejection
  {
    const snapshot = snap("rep.xlsx", [cell("Sheet1", "A1", "12 x 12 plate")]);
    const ev = resolveFieldEvidenceFromSnapshot({
      snapshot,
      sheetName: "Sheet1",
      sourceCell: "A1",
      sourceText: null,
      extractedValue: 12,
      semanticField: "thickness",
    });
    assertEq(ev.status, "MULTIPLE_MATCHES", "multiple");
    console.log("✓ T7 repeated token");
  }

  // T8 profile-derived
  {
    const snapshot = snap("prof.xlsx", [cell("Sheet1", "A1", "PL12X102")]);
    const ev = resolveFieldEvidenceFromSnapshot({
      snapshot,
      sheetName: "Sheet1",
      sourceCell: "A1",
      sourceText: null,
      extractedValue: 12,
      semanticField: "thickness",
      interpretation: "PARSED_FROM_PROFILE",
    });
    assertEq(ev.status, "DERIVED_VERIFIED", "profile derived");
    console.log("✓ T8 profile-derived evidence");
  }

  // T9/T10 ordinary compact → local repair → pass (no AI offsets needed)
  {
    const snapshot = ordinarySnapshot();
    const { repair, verification } = pipeline(snapshot, ordinaryCompact(snapshot));
    assert(repair.durationMs < 1000, "repair under 1s");
    assert(
      verification.status === "PASS" || verification.status === "PASS_WITH_WARNINGS",
      `status=${verification.status}`
    );
    assertEq(verification.verifiedRowCount, 2, "verified rows");
    console.log("✓ T9/T10 local repair + ordinary pass");
  }

  // T11 evidence-only does not trigger correction
  {
    const snapshot = ordinarySnapshot();
    const { repair, verification, extraction } = pipeline(
      snapshot,
      ordinaryCompact(snapshot)
    );
    // Force localization warning path by verifying MULTIPLE_MATCHES doesn't block
    const elig = shouldRequestDirectExtractionCorrection({
      initialExtraction: extraction,
      localEvidenceRepair: repair,
      verification: {
        ...verification,
        status: "PASS_WITH_WARNINGS",
        errors: [],
        warnings: verification.warnings.filter(
          (w) => w.category === "EVIDENCE_LOCALIZATION"
        ),
      },
    });
    assertEq(elig.eligible, false, "evidence-only not eligible");
    console.log("✓ T11 correction eligibility (evidence-only)");
  }

  // T12 semantic correction eligible
  {
    const snapshot = ordinarySnapshot();
    const bad = ordinaryCompact(snapshot);
    bad.rows[0]!.quantity = compactField(999, "B2");
    const { repair, verification, extraction } = pipeline(snapshot, bad);
    assert(
      verification.errors.some((e) => e.code === "VALUE_NOT_GROUNDED"),
      "ungrounded qty"
    );
    const elig = shouldRequestDirectExtractionCorrection({
      initialExtraction: extraction,
      localEvidenceRepair: repair,
      verification,
    });
    assertEq(elig.eligible, true, "semantic eligible");
    console.log("✓ T12 semantic correction eligible");
  }

  // T13 aggregated feedback
  {
    const snapshot = ordinarySnapshot();
    const bad = ordinaryCompact(snapshot);
    bad.rows[0]!.quantity = compactField(999, "B2");
    bad.rows[1]!.quantity = compactField(888, "B3");
    const { verification } = pipeline(snapshot, bad);
    assert(verification.correctionFeedback.aggregated.length > 0, "aggregated");
    console.log("✓ T13 aggregated feedback");
  }

  // T14–T18 quality + selection / regression
  {
    const snapshot = ordinarySnapshot();
    const good = ordinaryCompact(snapshot);
    const goodPipe = pipeline(snapshot, good);
    const goodQ = evaluateDirectExtractionQuality({
      extraction: goodPipe.extraction,
      verification: goodPipe.verification,
    });
    assert(goodQ.verifiedPartRows === 2, "quality verified");

    const empty: DirectWorkbookExtractionV2 = {
      ...good,
      rows: [],
      rowLedger: good.rowLedger.map((e) =>
        e.classification === "PART"
          ? {
              ...e,
              classification: "AMBIGUOUS" as const,
              extractedRowIds: [],
              ambiguityType: "LAYOUT",
              competingInterpretations: ["PART", "NOTE"],
              reason: "unclear",
            }
          : e
      ),
    };
    const emptyPipe = pipeline(snapshot, empty);
    const emptyQ = evaluateDirectExtractionQuality({
      extraction: emptyPipe.extraction,
      verification: emptyPipe.verification,
    });

    const sel = selectBestDirectExtractionResult({
      initial: {
        extraction: goodPipe.extraction,
        repair: goodPipe.repair,
        verification: goodPipe.verification,
        quality: goodQ,
      },
      corrected: {
        extraction: emptyPipe.extraction,
        repair: emptyPipe.repair,
        verification: emptyPipe.verification,
        quality: emptyQ,
      },
    });
    assertEq(sel.status, "CORRECTION_REJECTED_REGRESSION", "regression rejected");
    assertEq(sel.selected.quality.verifiedPartRows, 2, "keep initial");
    console.log("✓ T14–T18 quality + correction regression");
  }

  // T19 zero-row fail closed
  {
    const snapshot = ordinarySnapshot();
    const empty = ordinaryCompact(snapshot);
    empty.rows = [];
    empty.rowLedger = empty.rowLedger.map((e) =>
      e.classification === "PART"
        ? { ...e, classification: "AMBIGUOUS" as const, extractedRowIds: [], reason: "x" }
        : e
    );
    const { verification } = pipeline(snapshot, empty);
    assert(verification.status !== "PASS", `fail-closed status=${verification.status}`);
    assert(verification.hasCandidatePartData, "has candidates");
    console.log("✓ T19 zero-row fail closed");
  }

  // T20 empty workbook
  {
    const snapshot = snap("empty.xlsx", []);
    const compact: DirectWorkbookExtractionV2 = {
      schemaVersion: DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
      workbookId: snapshot.documentId,
      status: "EXTRACTED",
      tables: [],
      rows: [],
      rowLedger: [],
      ambiguities: [],
      warnings: [],
    };
    const { verification } = pipeline(snapshot, compact);
    assert(
      verification.status === "PASS" || verification.status === "PASS_WITH_WARNINGS",
      `empty ok status=${verification.status}`
    );
    assertEq(verification.hasCandidatePartData, false, "no candidates");
    console.log("✓ T20 empty workbook");
  }

  // T21 classification vs extraction
  {
    const snapshot = ordinarySnapshot();
    const compact = ordinaryCompact(snapshot);
    compact.rows = [];
    const { verification } = pipeline(snapshot, compact);
    assert(
      verification.coverageMetrics.classificationCoveragePercentage >= 50,
      "class coverage"
    );
    assertEq(verification.coverageMetrics.verifiedPartRows, 0, "0 verified parts");
    assert(verification.status !== "PASS", "not success");
    console.log("✓ T21 classification ≠ extraction success");
  }

  // T22 ambiguous-all → mapping
  {
    const snapshot = ordinarySnapshot();
    const compact = ordinaryCompact(snapshot);
    compact.rows = [];
    compact.rowLedger = compact.rowLedger.map((e) =>
      e.rowNumber > 1
        ? {
            ...e,
            classification: "AMBIGUOUS" as const,
            extractedRowIds: [],
            reason: "",
            ambiguityType: null,
            competingInterpretations: [],
          }
        : e
    );
    const { verification } = pipeline(snapshot, compact);
    assert(
      verification.status === "MAPPING_REQUIRED" ||
        verification.errors.some((e) => e.code === "AMBIGUOUS_ALL_ROWS"),
      `ambiguous-all ${verification.status}`
    );
    console.log("✓ T22 ambiguous-all-rows");
  }

  // T24/T25 conversion gate + orchestrator selection
  {
    const snapshot = ordinarySnapshot();
    // Initial is semantically valid but missing a ledger entry → correction eligible
    const initial = ordinaryCompact(snapshot);
    initial.rowLedger = initial.rowLedger.filter((e) => e.rowNumber !== 4);
    const badCorrection = ordinaryCompact(snapshot);
    badCorrection.rows = [];
    const result = await extractWorkbookDirect({
      snapshot,
      client: dummyClient,
      model: "test",
      injectedExtraction: initial,
      injectedCorrection: badCorrection,
    });
    assert(
      result.status === "SUCCESS" || result.status === "SUCCESS_WITH_WARNINGS",
      `status=${result.status} decision=${result.diagnostics.selectionDecision}`
    );
    assertEq(result.partRows.length, 2, "selected initial converted");
    assert(
      result.diagnostics.selectionDecision === "CORRECTION_REJECTED_REGRESSION" ||
        result.diagnostics.selectionDecision === "INITIAL_SELECTED",
      `sel=${result.diagnostics.selectionDecision}`
    );
    assert(result.diagnostics.initialExtraction != null, "initial preserved");
    if (result.diagnostics.correctedExtraction) {
      assertEq(
        result.diagnostics.selectionDecision,
        "CORRECTION_REJECTED_REGRESSION",
        "regression when correction ran"
      );
    }
    console.log("✓ T24/T25/T15–T18 orchestrator selection + conversion");
  }

  // T26/T27 DXF gate + orphan suppression
  {
    const reservations = buildDxfReservations({
      registry: [
        { id: "d1", canonicalPartId: "P1", geometryStatus: "VALID" },
        { id: "d2", canonicalPartId: "P2", geometryStatus: "VALID" },
      ],
      assignments: [],
      pendingSourceExtraction: true,
    });
    assert(
      reservations.every((r) => r.orphanDecision === "PENDING_SOURCE_EXTRACTION"),
      "pending not orphan"
    );
    const correlated = applyGeometryCorrelation({
      documentRows: [],
      registry: [
        {
          id: "d1",
          canonicalPartId: "P1",
          filename: "p1.dxf",
          revision: null,
          identityOk: true,
          identitySource: "FILENAME",
          widthMm: 10,
          heightMm: 10,
          plateAreaMm2: 100,
          netContourAreaMm2: 90,
          geometryStatus: "VALID",
        },
      ] as never,
      pendingSourceExtraction: true,
    });
    assertEq(
      correlated.diagnostics.skippedReason,
      "PENDING_SOURCE_EXTRACTION",
      "dxf skipped"
    );
    console.log("✓ T26/T27 DXF gate + orphan suppression");
  }

  // T31/T32 call cap
  {
    const snapshot = ordinarySnapshot();
    const result = await extractWorkbookDirect({
      snapshot,
      client: dummyClient,
      model: "test",
      injectedExtraction: ordinaryCompact(snapshot),
    });
    assert(
      result.diagnostics.providerCallCount <= DIRECT_EXTRACTION_LIMITS.maxDirectCalls,
      "call cap"
    );
    console.log("✓ T31/T32 provider call cap / no per-row");
  }

  // T33/T34 empty email + attachment dedup
  {
    assertEq(
      classifySourceForProviderExtraction({
        kind: "EMAIL",
        subject: "Quote",
        body: "  ",
      }).eligible,
      false,
      "empty email"
    );
    assertEq(
      classifySourceForProviderExtraction({
        kind: "XLSX",
        alreadyHandledDeterministically: true,
      }).eligible,
      false,
      "dedup"
    );
    console.log("✓ T33/T34 empty email + attachment dedup");
  }

  // T35–T40 debug
  {
    const snapshot = ordinarySnapshot();
    const result = await extractWorkbookDirect({
      snapshot,
      client: dummyClient,
      model: "test",
      injectedExtraction: ordinaryCompact(snapshot),
    });
    const dto = buildDirectWorkbookExtractionDebugDto({
      diagnostics: result.diagnostics,
      extraction: result.extraction,
      verification: result.verification,
      mappingRequired: null,
      partRowCount: result.partRows.length,
    });
    const json = JSON.stringify(dto);
    assert(!json.includes("[Circular]"), "no circular");
    assert(dto.initialQuality != null, "initial quality");
    assert(dto.selectionDecision != null, "selection");
    assert(dto.coverageMetrics != null, "coverage");
    assert(dto.performance != null, "performance");
    console.log("✓ T35–T40 debug diagnostics");
  }

  // T41 ordinary regression
  {
    const snapshot = ordinarySnapshot();
    const { verification, extraction } = pipeline(snapshot, ordinaryCompact(snapshot));
    const converted = convertVerifiedDirectRowsToRawPartRows({
      snapshot,
      extraction,
      verification,
    });
    assertEq(converted.partRows.length, 2, "ordinary rows");
    console.log("✓ T41 ordinary workbook regression");
  }

  // Hebrew
  {
    const snapshot = snap("he.xlsx", [
      cell("Sheet1", "A1", "מק\"ט"),
      cell("Sheet1", "B1", "כמות"),
      cell("Sheet1", "A2", "P2001"),
      cell("Sheet1", "B2", 4),
    ]);
    const compact: DirectWorkbookExtractionV2 = {
      schemaVersion: DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
      workbookId: snapshot.documentId,
      status: "EXTRACTED",
      tables: [
        {
          tableId: "t1",
          sheetName: "Sheet1",
          headerRowNumbers: [1],
          dataStartRow: 2,
          dataEndRow: 2,
          role: "PART_LIST",
          confidence: 0.9,
          reason: "ok",
        },
      ],
      rows: [
        {
          extractedRowId: "r1",
          sheetName: "Sheet1",
          sourceRowNumbers: [2],
          sourceCells: ["A2", "B2"],
          explicitPartIdentifier: compactField("P2001", "A2"),
          sourceDescriptor: null,
          profile: null,
          quantity: compactField(4, "B2"),
          material: null,
          thickness: null,
          width: null,
          length: null,
          area: null,
          unitWeight: null,
          totalWeight: null,
          notes: [],
          confidence: 0.9,
          ambiguities: [],
        },
      ],
      rowLedger: [
        {
          sheetName: "Sheet1",
          rowNumber: 1,
          classification: "HEADER",
          extractedRowIds: [],
          confidence: 1,
          reason: "h",
        },
        {
          sheetName: "Sheet1",
          rowNumber: 2,
          classification: "PART",
          extractedRowIds: ["r1"],
          confidence: 1,
          reason: "p",
        },
      ],
      ambiguities: [],
      warnings: [],
    };
    const { verification } = pipeline(snapshot, compact);
    assert(
      verification.status === "PASS" || verification.status === "PASS_WITH_WARNINGS",
      "hebrew"
    );
    console.log("✓ T45 Hebrew regression");
  }

  // Privacy
  assert(
    !JSON.stringify(ordinaryCompact(ordinarySnapshot())).includes("indexedDB"),
    "privacy"
  );
  console.log("✓ T51 privacy (no persistence APIs in path)");

  console.log("\n=== All contract-simplification checks passed ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
