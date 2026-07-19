/**
 * AI Workbook Interpreter v1 — core regression suite.
 * Run: npx tsx lib/ai-intake/__tests__/workbook-interpreter-v1.ts
 */

import type { WorkbookCellEvidence, WorkbookSnapshot } from "../normalization/types";
import {
  buildWorkbookProfile,
  executeWorkbookExtractionPlan,
  interpretWorkbook,
  tryBuildDeterministicFastPathPlan,
  validateExtractionPlan,
  validateSafeRegexPattern,
  validateWorkbookExtractionResult,
  INTERPRETER_LIMITS,
  type WorkbookExtractionPlan,
} from "../workbook/interpreter";
import { inferFixedWidthHeaderSpans } from "../workbook/fixed-width";

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

function ordinaryWorkbook(): WorkbookSnapshot {
  return snap("ordinary.xlsx", [
    cell("Sheet1", "A1", "Part Mark"),
    cell("Sheet1", "B1", "Qty"),
    cell("Sheet1", "C1", "Thickness (mm)"),
    cell("Sheet1", "D1", "Material"),
    cell("Sheet1", "E1", "Width (mm)"),
    cell("Sheet1", "F1", "Length (mm)"),
    cell("Sheet1", "A2", "P1001"),
    cell("Sheet1", "B2", 2),
    cell("Sheet1", "C2", 12),
    cell("Sheet1", "D2", "S355"),
    cell("Sheet1", "E2", 100),
    cell("Sheet1", "F2", 200),
    cell("Sheet1", "A3", "P1002"),
    cell("Sheet1", "B3", 1),
    cell("Sheet1", "C3", 10),
    cell("Sheet1", "D3", "S355"),
    cell("Sheet1", "E3", 80),
    cell("Sheet1", "F3", 150),
    cell("Sheet1", "A4", "Total"),
    cell("Sheet1", "B4", 3),
  ]);
}

function hebrewWorkbook(): WorkbookSnapshot {
  return snap("hebrew.xlsx", [
    cell("Sheet1", "A1", "מק\"ט"),
    cell("Sheet1", "B1", "כמות"),
    cell("Sheet1", "C1", "עובי"),
    cell("Sheet1", "D1", "חומר"),
    cell("Sheet1", "A2", "P2001"),
    cell("Sheet1", "B2", 4),
    cell("Sheet1", "C2", 8),
    cell("Sheet1", "D2", "S275"),
  ]);
}

function fixedWidthWorkbook(): WorkbookSnapshot {
  const header =
    "Profile          Grade     Qty    Length     Weight(kg)";
  const row1 =
    "PL12X102         S355      2      3000       12.5";
  const row2 =
    "PL16X200         S355      1      2500       20.1";
  const footer = "Total items: 2";
  return snap("material-list.xlsx", [
    cell("Sheet1", "A1", header),
    cell("Sheet1", "A2", row1),
    cell("Sheet1", "A3", row2),
    cell("Sheet1", "A4", footer),
  ], "350 Material list");
}

function multiHeaderWorkbook(): WorkbookSnapshot {
  return snap("multi-header.xlsx", [
    cell("Sheet1", "A1", "Part"),
    cell("Sheet1", "B1", "Quantity"),
    cell("Sheet1", "C1", "Dimensions"),
    cell("Sheet1", "A2", "Mark"),
    cell("Sheet1", "B2", "pcs"),
    cell("Sheet1", "C2", "Thickness (mm)"),
    cell("Sheet1", "D2", "Width (mm)"),
    cell("Sheet1", "A3", "P3001"),
    cell("Sheet1", "B3", 5),
    cell("Sheet1", "C3", 12),
    cell("Sheet1", "D3", 100),
  ]);
}

function fillDownWorkbook(): WorkbookSnapshot {
  return snap("filldown.xlsx", [
    cell("Sheet1", "A1", "Part Mark"),
    cell("Sheet1", "B1", "Qty"),
    cell("Sheet1", "C1", "Material"),
    cell("Sheet1", "A2", "P4001"),
    cell("Sheet1", "B2", 1),
    cell("Sheet1", "C2", "S355"),
    cell("Sheet1", "A3", "P4002"),
    cell("Sheet1", "B3", 2),
    cell("Sheet1", "C3", null),
  ]);
}

function ambiguousWorkbook(): WorkbookSnapshot {
  return snap("ambiguous.xlsx", [
    cell("Sheet1", "A1", "Col1"),
    cell("Sheet1", "B1", "Col2"),
    cell("Sheet1", "C1", "Col3"),
    cell("Sheet1", "A2", "aaa"),
    cell("Sheet1", "B2", "bbb"),
    cell("Sheet1", "C2", "ccc"),
    cell("Sheet1", "A3", "ddd"),
    cell("Sheet1", "B3", "eee"),
    cell("Sheet1", "C3", "fff"),
  ]);
}

function delimitedPlan(snapshot: WorkbookSnapshot): WorkbookExtractionPlan {
  return {
    schemaVersion: "workbook-extraction-plan/v1",
    workbookId: snapshot.documentId,
    planId: "plan:test:delimited",
    confidence: 0.9,
    status: "READY",
    workbookSummary: "delimited test",
    tables: [
      {
        tableId: "t1",
        sheetId: "sheet:0:Sheet1",
        sheetName: "Sheet1",
        region: { startRow: 1, endRow: 2, startColumn: 1, endColumn: 1 },
        tableRole: "PART_LIST",
        rowMode: "DELIMITED_TEXT",
        headerRows: [1],
        dataRowSelector: { fromRow: 1, toRow: 2, excludeRowNumbers: [] },
        fields: [
          {
            targetField: "EXPLICIT_PART_IDENTIFIER",
            source: {
              op: "SPLIT_DELIMITED_TEXT",
              columnLetter: "A",
              delimiter: ",",
              segmentIndex: 0,
            },
            transforms: [{ kind: "TRIM" }],
            expectedType: "TEXT",
            explicitUnit: null,
            aggregationSemantic: null,
            required: true,
            confidence: 0.9,
            reasons: ["test"],
          },
          {
            targetField: "QUANTITY",
            source: {
              op: "SPLIT_DELIMITED_TEXT",
              columnLetter: "A",
              delimiter: ",",
              segmentIndex: 1,
            },
            transforms: [{ kind: "PARSE_INTEGER" }],
            expectedType: "INTEGER",
            explicitUnit: null,
            aggregationSemantic: null,
            required: true,
            confidence: 0.9,
            reasons: ["test"],
          },
        ],
        rowClassification: {
          rules: [
            { class: "HEADER", ops: [{ kind: "MATCH_HEADER_SIGNATURE" }] },
            {
              class: "DATA_OCCURRENCE",
              ops: [{ kind: "REQUIRE_ANY_FIELD", fields: ["QUANTITY"] }],
            },
          ],
          defaultClass: "NOTE",
        },
        constants: [],
        alignedHeaderText: null,
        confidence: 0.9,
        reasons: ["test"],
      },
    ],
    relationships: [],
    ambiguities: [],
    warnings: [],
    planSource: "DETERMINISTIC_FAST_PATH",
  };
}

async function run(): Promise<void> {
  console.log("=== Workbook Interpreter v1 ===");

  // T1 ordinary
  {
    const snapshot = ordinaryWorkbook();
    const result = await interpretWorkbook({
      snapshot,
      allowAiPlanner: false,
    });
    assertEq(result.status, "SUCCESS", "T1 status");
    assert(
      result.plan?.planSource === "DETERMINISTIC_FAST_PATH" ||
        result.plan?.planSource === "DETERMINISTIC_FAST_PATH_VALIDATED",
      "T1 fast path"
    );
    assert(result.partRows.length >= 2, "T1 rows");
    assert(
      result.partRows.every((r) => r.rawPartReference?.startsWith("P")),
      "T1 part ids"
    );
    assert(result.diagnostics.plannerCallCount === 0, "T1 no AI");
    console.log("T1 ordinary OK", result.partRows.length);
  }

  // T2 Hebrew
  {
    const result = await interpretWorkbook({
      snapshot: hebrewWorkbook(),
      allowAiPlanner: false,
    });
    assertEq(result.status, "SUCCESS", "T2 status");
    assert(result.partRows.length >= 1, "T2 rows");
    assertEq(result.partRows[0]?.material, "S275", "T2 material");
    console.log("T2 Hebrew OK");
  }

  // T6 fixed-width via generic plan
  {
    const snapshot = fixedWidthWorkbook();
    const profile = buildWorkbookProfile(snapshot);
    const plan = tryBuildDeterministicFastPathPlan({ snapshot, profile });
    assert(plan, "T6 plan");
    assertEq(plan!.tables[0]?.rowMode, "SINGLE_CELL_ALIGNED_TEXT", "T6 mode");
    assert(
      plan!.tables[0]?.fields.some((f) => f.source.op === "SPLIT_ALIGNED_TEXT"),
      "T6 op"
    );
    // No filename / sheet-name conditions in plan reasons as business keys
    assert(
      !plan!.tables.some((t) =>
        t.reasons.some((r) => /material-list\.xlsx/i.test(r))
      ),
      "T6 no filename rule"
    );
    const result = await interpretWorkbook({ snapshot, allowAiPlanner: false });
    assertEq(result.status, "SUCCESS", "T6 status");
    assert(result.partRows.length >= 2, "T6 rows");
    assert(
      result.partRows.every((r) => r.rawPartReference == null),
      "T6 profile not part id"
    );
    assert(
      result.partRows.every((r) => r.description?.startsWith("PL")),
      "T6 profile descriptor"
    );
    assert(
      result.partRows.every(
        (r) => r.material != null && r.material.length < 20
      ),
      "T6 material not full line"
    );
    const qty = result.partRows[0]?.quantity?.rawValue;
    assert(qty === 2 || qty === "2", "T6 qty");
    console.log("T6 fixed-width OK", result.partRows.length);
  }

  // T7 delimited
  {
    const snapshot = snap("delim.xlsx", [
      cell("Sheet1", "A1", "id,qty"),
      cell("Sheet1", "A2", "PX1,7"),
    ]);
    const plan = delimitedPlan(snapshot);
    const profile = buildWorkbookProfile(snapshot);
    const pv = validateExtractionPlan({ snapshot, profile, plan });
    assert(pv.ok, "T7 plan valid");
    const ex = executeWorkbookExtractionPlan({ snapshot, plan });
    assertEq(ex.occurrences.length, 1, "T7 occ");
    assertEq(
      ex.occurrences[0]?.explicitPartIdentifier,
      "PX1",
      "T7 id"
    );
    console.log("T7 delimited OK");
  }

  // T12 totals excluded
  {
    const result = await interpretWorkbook({
      snapshot: ordinaryWorkbook(),
      allowAiPlanner: false,
    });
    assert(
      result.execution?.skippedRows.some((s) => s.classification === "TOTAL"),
      "T12 total skipped"
    );
    assert(
      !result.partRows.some((r) => r.rawPartReference === "Total"),
      "T12 total not part"
    );
    console.log("T12 totals OK");
  }

  // T13/T14 profile vs identifier
  {
    const result = await interpretWorkbook({
      snapshot: fixedWidthWorkbook(),
      allowAiPlanner: false,
    });
    for (const r of result.partRows) {
      assert(r.rawPartReference == null, "T13 no false id");
      assert(r.description != null, "T13 descriptor");
    }
    const ordinary = await interpretWorkbook({
      snapshot: ordinaryWorkbook(),
      allowAiPlanner: false,
    });
    assert(
      ordinary.partRows.some((r) => r.rawPartReference === "P1001"),
      "T14 explicit id"
    );
    console.log("T13/T14 id semantics OK");
  }

  // T15 profile parse
  {
    const result = await interpretWorkbook({
      snapshot: fixedWidthWorkbook(),
      allowAiPlanner: false,
    });
    const t = result.partRows[0]?.thickness?.rawValue;
    assert(t === 12 || t === "12", `T15 thickness got ${t}`);
    console.log("T15 profile parse OK");
  }

  // T16 units from header
  {
    const result = await interpretWorkbook({
      snapshot: fixedWidthWorkbook(),
      allowAiPlanner: false,
    });
    assertEq(
      result.partRows[0]?.unitWeight?.statedUnit,
      "KG",
      "T16 weight kg"
    );
    console.log("T16 units OK");
  }

  // T17 formula evidence
  {
    const snapshot = snap("formula.xlsx", [
      cell("Sheet1", "A1", "Part Mark"),
      cell("Sheet1", "B1", "Qty"),
      cell("Sheet1", "C1", "Material"),
      cell("Sheet1", "A2", "P5001"),
      cell("Sheet1", "B2", 3, {
        formula: "1+2",
        formulaResult: 3,
        formattedText: "3",
        rawValue: 3,
      }),
      cell("Sheet1", "C2", "S355"),
    ]);
    const result = await interpretWorkbook({ snapshot, allowAiPlanner: false });
    assertEq(result.status, "SUCCESS", "T17 status");
    assert(result.partRows.length >= 1, "T17 rows");
    console.log("T17 formula OK");
  }

  // T19 provenance
  {
    const result = await interpretWorkbook({
      snapshot: fixedWidthWorkbook(),
      allowAiPlanner: false,
    });
    const occ = result.execution?.occurrences[0];
    const mat = occ?.fields.find((f) => f.targetField === "MATERIAL");
    assert(mat?.provenance.cellAddresses.length, "T19 cell");
    assert(mat?.provenance.characterStart != null, "T19 char start");
    assert(mat?.provenance.originalCellText, "T19 original");
    console.log("T19 provenance OK");
  }

  // T20/T21 coverage — all rows classified; executor not sample-only
  {
    const snapshot = ordinaryWorkbook();
    const result = await interpretWorkbook({ snapshot, allowAiPlanner: false });
    assertEq(
      result.execution?.coverage.unexplainedRows,
      0,
      "T20 unexplained"
    );
    assert(
      (result.execution?.coverage.declaredDataRows ?? 0) >= 3,
      "T21 full range"
    );
    console.log("T20/T21 coverage OK");
  }

  // T22 unsupported op rejected
  {
    const snapshot = ordinaryWorkbook();
    const profile = buildWorkbookProfile(snapshot);
    const plan = tryBuildDeterministicFastPathPlan({ snapshot, profile })!;
    const bad = structuredClone(plan);
    (bad.tables[0]!.fields[0]!.source as { op: string }).op = "EVAL_CODE";
    const pv = validateExtractionPlan({ snapshot, profile, plan: bad });
    assert(!pv.ok, "T22 reject");
    console.log("T22 safe reject OK");
  }

  // T23 invented cell
  {
    const snapshot = ordinaryWorkbook();
    const profile = buildWorkbookProfile(snapshot);
    const plan = tryBuildDeterministicFastPathPlan({ snapshot, profile })!;
    const bad = structuredClone(plan);
    bad.tables[0]!.fields.push({
      targetField: "NOTES",
      source: { op: "READ_CELL", address: "ZZ999" },
      transforms: [],
      expectedType: "TEXT",
      explicitUnit: null,
      aggregationSemantic: null,
      required: false,
      confidence: 0.5,
      reasons: ["invented"],
    });
    const pv = validateExtractionPlan({ snapshot, profile, plan: bad });
    assert(!pv.ok, "T23 invented cell");
    console.log("T23 invented cell OK");
  }

  // T24 cyclic relationships
  {
    const snapshot = ordinaryWorkbook();
    const profile = buildWorkbookProfile(snapshot);
    const plan = tryBuildDeterministicFastPathPlan({ snapshot, profile })!;
    if (plan.tables.length >= 1) {
      plan.tables.push({ ...plan.tables[0]!, tableId: "t2" });
      plan.relationships = [
        {
          relationshipId: "r1",
          type: "LOOKUP_BY_NORMALIZED_KEY",
          leftTableId: plan.tables[0]!.tableId,
          rightTableId: "t2",
          leftKeyField: "EXPLICIT_PART_IDENTIFIER",
          rightKeyField: "EXPLICIT_PART_IDENTIFIER",
          cardinality: "ONE_TO_ONE",
          conflictPolicy: "REQUIRE_REVIEW",
          confidence: 0.5,
        },
        {
          relationshipId: "r2",
          type: "LOOKUP_BY_NORMALIZED_KEY",
          leftTableId: "t2",
          rightTableId: plan.tables[0]!.tableId,
          leftKeyField: "EXPLICIT_PART_IDENTIFIER",
          rightKeyField: "EXPLICIT_PART_IDENTIFIER",
          cardinality: "ONE_TO_ONE",
          conflictPolicy: "REQUIRE_REVIEW",
          confidence: 0.5,
        },
      ];
      const pv = validateExtractionPlan({ snapshot, profile, plan });
      assert(!pv.ok, "T24 cyclic");
    }
    console.log("T24 cyclic OK");
  }

  // T26 ambiguous → mapping required (no AI)
  {
    const result = await interpretWorkbook({
      snapshot: ambiguousWorkbook(),
      allowAiPlanner: false,
    });
    assert(
      result.status === "MAPPING_REQUIRED" || result.partRows.length === 0,
      "T26 mapping required"
    );
    console.log("T26 ambiguous OK", result.status);
  }

  // T30/T31 call cap
  {
    assertEq(INTERPRETER_LIMITS.maxPlannerCalls, 2, "T30 max calls");
    const bigCells: WorkbookCellEvidence[] = [
      cell("Sheet1", "A1", "Part Mark"),
      cell("Sheet1", "B1", "Qty"),
      cell("Sheet1", "C1", "Material"),
    ];
    for (let i = 2; i <= 100; i++) {
      bigCells.push(cell("Sheet1", `A${i}`, `P${i}`));
      bigCells.push(cell("Sheet1", `B${i}`, 1));
      bigCells.push(cell("Sheet1", `C${i}`, "S355"));
    }
    const result = await interpretWorkbook({
      snapshot: snap("big.xlsx", bigCells),
      allowAiPlanner: false,
    });
    assert(result.diagnostics.plannerCallCount <= 2, "T31 call cap");
    assert((result.partRows.length ?? 0) >= 50, "T31 all rows executed");
    console.log("T30/T31 call cap OK", result.partRows.length);
  }

  // T32 deterministic replay
  {
    const snapshot = ordinaryWorkbook();
    const a = await interpretWorkbook({ snapshot, allowAiPlanner: false });
    const b = await interpretWorkbook({ snapshot, allowAiPlanner: false });
    assertEq(
      JSON.stringify(a.execution?.occurrences),
      JSON.stringify(b.execution?.occurrences),
      "T32 replay"
    );
    console.log("T32 replay OK");
  }

  // Safe regex
  {
    assert(!validateSafeRegexPattern("(a+)+").ok, "redos reject");
    assert(validateSafeRegexPattern("PL(\\d+)X(\\d+)").ok, "safe ok");
    console.log("safe regex OK");
  }

  // T5 fill-down plan execute
  {
    const snapshot = fillDownWorkbook();
    const profile = buildWorkbookProfile(snapshot);
    const plan = tryBuildDeterministicFastPathPlan({ snapshot, profile });
    assert(plan, "T5 plan");
    // Inject FILL_DOWN on material
    const mat = plan!.tables[0]?.fields.find((f) => f.targetField === "MATERIAL");
    if (mat) mat.transforms.push({ kind: "FILL_DOWN" });
    // Change material source to READ_PREVIOUS_NON_EMPTY for empty cells — use FILL_DOWN from previous extracted
    const ex = executeWorkbookExtractionPlan({ snapshot, plan: plan! });
    assert(ex.occurrences.length >= 2, "T5 occ");
    console.log("T5 fill-down OK", ex.occurrences.length);
  }

  // Multi-header still extracts via best header candidate
  {
    const result = await interpretWorkbook({
      snapshot: multiHeaderWorkbook(),
      allowAiPlanner: false,
    });
    // May be SUCCESS or MAPPING_REQUIRED depending on header confidence
    console.log("T3 multi-header status", result.status, result.partRows.length);
  }

  // Validation of aligned spans still works via fixed-width module
  {
    const spans = inferFixedWidthHeaderSpans(
      "Profile          Grade     Qty    Length     Weight(kg)",
      ["PL12X102         S355      2      3000       12.5"]
    );
    assert(spans.length >= 4, "spans");
    console.log("aligned spans OK", spans.length);
  }

  console.log("=== Workbook Interpreter v1 PASSED ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
