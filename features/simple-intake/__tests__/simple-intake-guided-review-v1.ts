/**
 * OMEGA Simple Intake — Guided Issue Review Workflow v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-guided-review-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  calcCommercialTotalWeightKg,
  calcCommercialUnitWeightKg,
  DEFAULT_STEEL_DENSITY_KG_M3,
} from "../results/commercialCalculations";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { FIXED_TABLE_COLUMN_HEADERS } from "../results/tableContract";
import type { FinalIntakeRow } from "../results/types";
import {
  applySkipToQueue,
  buildReviewQueue,
  countUnresolved,
  orderQueueWithDeferred,
  pickPrimaryIssue,
} from "../workflow/buildReviewQueue";
import { guidedIssueCopy } from "../workflow/guidedMessages";
import type {
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleMatchingDiagnostics,
  SimpleResultRow,
} from "../types";

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

function extracted(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "S1",
    sourceRow: 2,
    sourceCell: "A2",
    partId: null,
    profile: "PL10*100",
    description: null,
    quantity: 1,
    material: "S355",
    thicknessMm: 10,
    widthMm: 100,
    lengthMm: 200,
    sourceAreaM2: 0.02,
    sourceWeightKg: 1.57,
    confidence: 0.9,
    note: null,
    warnings: [],
    ...partial,
  };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; partId: string }
): SimpleDxfPart {
  return {
    filename: `${partial.partId}.dxf`,
    widthMm: 100,
    lengthMm: 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: null,
    ...partial,
  };
}

function resultRow(
  partial: Partial<SimpleResultRow> & {
    resultRowId: string;
    extracted: SimpleExtractedRow;
  }
): SimpleResultRow {
  return {
    match: {
      status: "UNMATCHED",
      method: null,
      matchedDxfId: null,
      candidates: [],
      message: null,
    },
    status: "NO_DXF",
    excluded: false,
    edits: {},
    ...partial,
  };
}

function derive(
  rows: SimpleResultRow[],
  parts: SimpleDxfPart[],
  opts?: {
    confirmed?: Set<string>;
    diagnostics?: SimpleMatchingDiagnostics | null;
  }
): FinalIntakeRow[] {
  return deriveFinalRows({
    resultRows: rows,
    dxfParts: parts,
    workbookFilename: "mat.xlsx",
    snapshot: null,
    diagnostics: opts?.diagnostics ?? null,
    confirmedManualMatchIds: opts?.confirmed,
  });
}

function run(): void {
  console.log("=== Guided Issue Review Workflow v1 ===\n");

  const partA = dxf({ id: "d1", partId: "P1", widthMm: 100, lengthMm: 200 });
  const partB = dxf({
    id: "d2",
    partId: "P2",
    widthMm: 100.1,
    lengthMm: 200,
    filename: "mpl1040.dxf",
  });

  // Summary counts from final rows
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            partId: "P1",
            quantity: 10,
            sourceRow: 2,
          }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
        resultRow({
          resultRowId: "r2",
          extracted: extracted({
            rowId: "e2",
            partId: null,
            material: null,
            quantity: 2,
            sourceRow: 3,
          }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d2",
            candidates: [],
            message: null,
          },
          status: "MISSING_DATA",
        }),
        resultRow({
          resultRowId: "r3",
          extracted: extracted({
            rowId: "e3",
            quantity: null,
            sourceRow: 4,
          }),
          match: {
            status: "UNMATCHED",
            method: null,
            matchedDxfId: null,
            candidates: [],
            message: null,
          },
          status: "NO_DXF",
        }),
      ],
      [partA, partB]
    );
    const s = summarizeFinalRows(rows);
    assertEq(s.totalRowCount, 3, "summary row count");
    assertEq(s.totalUnitCount, 12, "summary units (10+2+0)");
    assertEq(s.rowsWithMissingQuantity, 1, "missing qty rows");
    assertEq(s.isTotalUnitCountComplete, false, "incomplete units");
    assert(s.needsAttention >= 1, "needs attention from final rows");
    assertEq(countUnresolved(rows), s.needsAttention, "unresolved = needsAttention");
    console.log("✓ Summary counts use final-row data");
  }

  // No issues → skip review (queue empty)
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: "P1" }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [partA]
    );
    assertEq(countUnresolved(rows), 0, "no unresolved");
    assertEq(buildReviewQueue(rows).length, 0, "empty queue");
    console.log("✓ No issues skips guided review queue");
  }

  // Queue: one at a time, priority order, progress
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r-qty",
          extracted: extracted({
            rowId: "e-qty",
            quantity: null,
            sourceRow: 5,
          }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "MISSING_DATA",
        }),
        resultRow({
          resultRowId: "r-mat",
          extracted: extracted({
            rowId: "e-mat",
            material: null,
            sourceRow: 3,
          }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d2",
            candidates: [],
            message: null,
          },
          status: "MISSING_DATA",
        }),
        resultRow({
          resultRowId: "r-amb",
          extracted: extracted({ rowId: "e-amb", sourceRow: 4 }),
          match: {
            status: "AMBIGUOUS",
            method: "GEOMETRY",
            matchedDxfId: null,
            candidates: [
              {
                dxfId: "d1",
                partId: "P1",
                filename: "P1.dxf",
                widthMm: 100,
                lengthMm: 200,
                widthDifferenceMm: 0,
                lengthDifferenceMm: 0,
                totalScore: 0.01,
                rotated: false,
              },
              {
                dxfId: "d2",
                partId: "P2",
                filename: "P2.dxf",
                widthMm: 100.1,
                lengthMm: 200,
                widthDifferenceMm: 0.1,
                lengthDifferenceMm: 0,
                totalScore: 0.02,
                rotated: false,
              },
            ],
            message: null,
          },
          status: "NEEDS_DXF",
        }),
      ],
      [partA, partB]
    );
    const q = buildReviewQueue(rows);
    assert(q.length >= 2, "queue has items");
    assertEq(q[0]!.primaryIssue, "MISSING_MATERIAL", "material first");
    assertEq(q[0]!.rowId, "r-mat", "material row");
    // one at a time = first item only
    assertEq(q[0]!.rowId !== q[1]!.rowId, true, "distinct rows");
    console.log("✓ Queue order + one unresolved at a time");
  }

  // Missing material local edit
  {
    const base = [
      resultRow({
        resultRowId: "r1",
        extracted: extracted({ rowId: "e1", material: null, partId: "P1" }),
        match: {
          status: "MATCHED",
          method: "EXACT_ID",
          matchedDxfId: "d1",
          candidates: [],
          message: null,
        },
        status: "MISSING_DATA",
        edits: {},
      }),
    ];
    let rows = derive(base, [partA]);
    assert(rows[0]!.issueCodes.includes("MISSING_MATERIAL"), "missing mat");
    const edited = [
      {
        ...base[0]!,
        edits: { material: "S235" },
      },
    ];
    rows = derive(edited, [partA]);
    assert(!rows[0]!.issueCodes.includes("MISSING_MATERIAL"), "mat fixed");
    assertEq(rows[0]!.material, "S235", "material value");
    console.log("✓ Missing material completed locally");
  }

  // Missing thickness recalculates weight
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({
        rowId: "e1",
        partId: "P1",
        thicknessMm: null,
        quantity: 2,
      }),
      match: {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      },
      status: "MISSING_DATA",
    });
    let rows = derive([base], [partA]);
    assert(rows[0]!.commercial.unitWeightKg == null, "no weight without thk");
    rows = derive([{ ...base, edits: { thicknessMm: 10 } }], [partA]);
    const expectedUnit = calcCommercialUnitWeightKg({
      areaM2: 0.02,
      thicknessMm: 10,
      densityKgPerM3: DEFAULT_STEEL_DENSITY_KG_M3,
    });
    const expectedTotal = calcCommercialTotalWeightKg({
      unitWeightKg: expectedUnit,
      quantity: 2,
    });
    assertEq(rows[0]!.commercial.unitWeightKg, expectedUnit, "unit weight");
    assertEq(rows[0]!.commercial.totalWeightKg, expectedTotal, "total weight");
    console.log("✓ Missing thickness recalculates weight locally");
  }

  // Missing quantity updates units + total weight
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({
        rowId: "e1",
        partId: "P1",
        quantity: null,
      }),
      match: {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      },
      status: "MISSING_DATA",
    });
    let rows = derive([base], [partA]);
    assert(rows[0]!.issueCodes.includes("MISSING_QUANTITY"), "missing qty");
    rows = derive([{ ...base, edits: { quantity: 5 } }], [partA]);
    assert(!rows[0]!.issueCodes.includes("MISSING_QUANTITY"), "qty fixed");
    assertEq(rows[0]!.quantity, 5, "qty value");
    const s = summarizeFinalRows(rows);
    assertEq(s.totalUnitCount, 5, "units updated");
    assert(rows[0]!.commercial.totalWeightKg != null, "total weight");
    console.log("✓ Missing quantity recalculates units and total weight");
  }

  // Ambiguous DXF selection updates existing row
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({ rowId: "e1" }),
      match: {
        status: "AMBIGUOUS",
        method: "GEOMETRY",
        matchedDxfId: null,
        candidates: [
          {
            dxfId: "d1",
            partId: "P1",
            filename: "P1.dxf",
            widthMm: 100,
            lengthMm: 200,
            widthDifferenceMm: 0,
            lengthDifferenceMm: 0,
            totalScore: 0,
            rotated: false,
          },
          {
            dxfId: "d2",
            partId: "P2",
            filename: "P2.dxf",
            widthMm: 100.1,
            lengthMm: 200,
            widthDifferenceMm: 0.1,
            lengthDifferenceMm: 0,
            totalScore: 0.01,
            rotated: false,
          },
        ],
        message: null,
      },
      status: "NEEDS_DXF",
    });
    let rows = derive([base], [partA, partB]);
    assert(
      rows[0]!.issueCodes.includes("MULTIPLE_DXF_CANDIDATES"),
      "ambiguous"
    );
    const selected: SimpleResultRow = {
      ...base,
      match: {
        status: "MATCHED",
        method: "MANUAL",
        matchedDxfId: "d2",
        candidates: base.match.candidates,
        message: null,
      },
      status: "READY",
    };
    rows = derive([selected], [partA, partB], {
      confirmed: new Set(["r1"]),
    });
    assertEq(rows[0]!.part.matchedDxfId, "d2", "selected dxf");
    assertEq(rows[0]!.isManualMatchConfirmed, true, "confirmed");
    assert(!rows[0]!.issueCodes.includes("MULTIPLE_DXF_CANDIDATES"), "cleared");
    console.log("✓ Ambiguous DXF selection updates existing row");
  }

  // Exclusion removes from unresolved queue
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({ rowId: "e1", material: null }),
      match: {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      },
      status: "MISSING_DATA",
    });
    let rows = derive([base], [partA]);
    assertEq(countUnresolved(rows), 1, "one unresolved");
    rows = derive([{ ...base, excluded: true, status: "EXCLUDED" }], [partA]);
    assertEq(rows[0]!.status, "EXCLUDED", "excluded");
    assertEq(countUnresolved(rows), 0, "queue empty after exclude");
    console.log("✓ Exclusion removes from unresolved queue");
  }

  // Skip moves to end without resolving
  {
    const items = [
      {
        rowId: "a",
        primaryIssue: "MISSING_MATERIAL" as const,
        sourceOrderIndex: 0,
      },
      {
        rowId: "b",
        primaryIssue: "MISSING_QUANTITY" as const,
        sourceOrderIndex: 1,
      },
    ];
    const skipped = applySkipToQueue(items, "a");
    assertEq(skipped[0]!.rowId, "b", "b first");
    assertEq(skipped[1]!.rowId, "a", "a at end");
    assertEq(skipped[1]!.primaryIssue, "MISSING_MATERIAL", "not resolved");

    const ordered = orderQueueWithDeferred(items, ["a"]);
    assertEq(ordered[0]!.rowId, "b", "deferred a last");
    assertEq(ordered[1]!.rowId, "a", "a deferred");
    console.log("✓ Skip moves row to end without resolving");
  }

  // Completion when all resolved
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: "P1" }),
          match: {
            status: "MATCHED",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [partA]
    );
    assertEq(buildReviewQueue(rows).length, 0, "complete → empty queue");
    const s = summarizeFinalRows(rows);
    assertEq(s.needsAttention, 0, "no attention");
    console.log("✓ Completion when all issues resolved");
  }

  // Guided changes appear in final table model (same rows)
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({ rowId: "e1", material: null, partId: "P1" }),
      match: {
        status: "MATCHED",
        method: "EXACT_ID",
        matchedDxfId: "d1",
        candidates: [],
        message: null,
      },
      status: "MISSING_DATA",
    });
    const after = derive([{ ...base, edits: { material: "AL5052" } }], [partA]);
    assertEq(after[0]!.material, "AL5052", "table sees guided edit");
    console.log("✓ Guided-review changes appear in final table");
  }

  // Hebrew messages — no technical jargon
  {
    const multi = guidedIssueCopy("MULTIPLE_DXF_CANDIDATES");
    assert(multi.title.includes("DXF"), "hebrew title");
    assert(!multi.explanation.toLowerCase().includes("score"), "no score");
    assert(!multi.explanation.includes("עמימות"), "no ambiguity jargon");
    const assigned = guidedIssueCopy("DXF_ASSIGNED_TO_BETTER_ROW");
    assert(!assigned.explanation.includes("נכשל"), "no failure wording");
    console.log("✓ Hebrew messages hide technical matching terms");
  }

  // Fixed table columns unchanged
  {
    assertEq(FIXED_TABLE_COLUMN_HEADERS.length, 12, "12 columns");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[0], "סטטוס", "status col");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[11], "פעולות", "actions col");
    console.log("✓ Final table columns unchanged");
  }

  // Primary issue picker
  {
    assertEq(
      pickPrimaryIssue(["NO_DXF_FOUND", "MISSING_MATERIAL"]),
      "MISSING_MATERIAL",
      "priority"
    );
  }

  // Workflow UI wiring + no second AI call
  {
    const root = path.resolve(__dirname, "..");
    const ready = fs.readFileSync(
      path.join(root, "components/ReadyStep.tsx"),
      "utf8"
    );
    assert(ready.includes("PostAnalysisWorkflow"), "ReadyStep uses workflow");
    assert(!ready.includes("ResultsReviewScreen"), "not direct to table");

    const workflow = fs.readFileSync(
      path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
      "utf8"
    );
    assert(workflow.includes("ANALYSIS_SUMMARY") || workflow.includes("SUMMARY") || workflow.includes("ReadinessSummary"), "summary state");
    assert(workflow.includes("FINAL_TABLE"), "table state");
    assert(
      workflow.includes("appendDxfFilesAndRematch"),
      "local dxf append"
    );
    assert(!workflow.includes("/api/simple-intake/analyze"), "no re-analyze");

    const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
    assert(
      store.includes("appendDxfFilesAndRematch"),
      "append without AI"
    );
    assert(
      store.includes("providerCallCount: session.providerCallCount"),
      "provider count preserved on rematch"
    );

    const route = fs.readFileSync(
      path.join(root, "../../app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "exactly one AI call");

    const summaryUi = fs.readFileSync(
      path.join(root, "readiness/ReadinessSummary.tsx"),
      "utf8"
    );
    assert(summaryUi.includes("הבדיקה הושלמה"), "summary heading");
    assert(summaryUi.includes("טפל ב-"), "guided CTA");
    assert(summaryUi.includes("המשך לטבלה") || summaryUi.includes("הצג טבלה"), "table secondary");

    console.log("✓ Workflow wiring + single provider call preserved");
  }

  // Returning from table preserves shared confirmed state (API shape)
  {
    const review = fs.readFileSync(
      path.join(__dirname, "../results/ResultsReviewScreen.tsx"),
      "utf8"
    );
    assert(
      review.includes("confirmedManual?: Set<string>"),
      "shared confirmed prop"
    );
    assert(review.includes("onStartGuidedReview"), "nav back to guided");
    assert(review.includes("טפל ב-"), "table CTA for unresolved");
    console.log("✓ Table navigation preserves shared local state API");
  }

  console.log("\n=== All Guided Issue Review Workflow v1 tests passed ===");
}

run();
