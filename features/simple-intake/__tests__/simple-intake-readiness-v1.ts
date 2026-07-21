/**
 * OMEGA Simple Intake — Pre-Table Readiness Review v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-readiness-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { FIXED_TABLE_COLUMN_HEADERS } from "../results/tableContract";
import type { FinalIntakeRow } from "../results/types";
import {
  categorizeReadinessIssues,
  DXF_COVERAGE_CODES,
  DXF_DECISION_CODES,
  MISSING_INFO_CODES,
  STAGE_TWO_HIDDEN_CODES,
  viewForCategory,
} from "../readiness/categorizeReadinessIssues";
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
    dxfFileName: partial.dxfFileName ?? null,
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
  console.log("=== Pre-Table Readiness Review v1 ===\n");

  const part = dxf({ id: "d1", partId: "P1", widthMm: 100, lengthMm: 200 });
  const part2 = dxf({
    id: "d2",
    partId: "P2",
    widthMm: 100.1,
    lengthMm: 200,
  });

  // Ready matched row qty 16 + one DXF = valid coverage (row-based)
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            partId: "P1",
            quantity: 16,
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
      ],
      [part]
    );
    const b = categorizeReadinessIssues(rows);
    assertEq(b.criticalRowCount, 0, "qty 16 + 1 dxf not critical");
    assertEq(b.dxfCoverage.length, 0, "coverage ok");
    assertEq(summarizeFinalRows(rows).totalUnitCount, 16, "units 16");
    console.log("✓ One row qty 16 + one DXF is valid coverage");
  }

  // Coverage compares rows not units
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: "P1", quantity: 50 }),
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
          extracted: extracted({ rowId: "e2", quantity: 50, sourceRow: 3 }),
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
      [part]
    );
    const b = categorizeReadinessIssues(rows);
    assertEq(b.dxfCoverage.length, 1, "one coverage row");
    assertEq(summarizeFinalRows(rows).totalUnitCount, 100, "units sum");
    console.log("✓ DXF coverage compares rows, not total units");
  }

  // Missing fields categorized; part name / area / weight not critical
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            partId: null,
            profile: "PL12",
            material: null,
            thicknessMm: null,
            quantity: null,
            sourceAreaM2: null,
            sourceWeightKg: null,
    dxfFileName: null,
            description: null,
          }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "MISSING_DATA",
        }),
      ],
      [part]
    );
    const codes = rows[0]!.issueCodes;
    assert(codes.includes("MISSING_MATERIAL"), "missing material");
    assert(codes.includes("MISSING_THICKNESS"), "missing thickness");
    assert(codes.includes("MISSING_QUANTITY"), "missing quantity");
    assert(!codes.includes("MISSING_REQUIRED_DIMENSIONS"), "dims ok via DXF");
    const b = categorizeReadinessIssues(rows);
    assertEq(b.missingInfo.length, 1, "in missing info");
    assert(b.criticalRowCount === 1, "one critical row");
    console.log("✓ Missing qty/material/thickness; part/area/weight ignored");
  }

  // Missing dims only when required for matching
  {
    const withDxf = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            partId: "P1",
            widthMm: null,
            lengthMm: null,
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
      ],
      [part]
    );
    assert(
      !withDxf[0]!.issueCodes.includes("MISSING_REQUIRED_DIMENSIONS"),
      "matched DXF → dims not required"
    );

    const noDxf = derive(
      [
        resultRow({
          resultRowId: "r2",
          extracted: extracted({
            rowId: "e2",
            widthMm: null,
            lengthMm: null,
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
      [part]
    );
    assert(
      noDxf[0]!.issueCodes.includes("MISSING_REQUIRED_DIMENSIONS"),
      "unmatched needs dims"
    );
    assert(
      categorizeReadinessIssues(noDxf).missingInfo.length === 1,
      "dims in missing info"
    );
    console.log("✓ Missing dimensions only when required for matching");
  }

  // Stage-two issues hidden from readiness
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            partId: "P1",
            widthMm: 100,
            lengthMm: 210,
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
      ],
      [part]
    );
    assert(
      rows[0]!.issueCodes.includes("PART_ID_DIMENSION_MISMATCH"),
      "mismatch exists"
    );
    const b = categorizeReadinessIssues(rows);
    assertEq(b.criticalRowCount, 1, "significant mismatch is reviewable");
    assertEq(b.dimensionMismatch.length, 1, "dimension mismatch category");
    for (const c of STAGE_TWO_HIDDEN_CODES) {
      assert(
        !MISSING_INFO_CODES.includes(c) &&
          !DXF_COVERAGE_CODES.includes(c) &&
          !DXF_DECISION_CODES.includes(c),
        `${c} not in readiness`
      );
    }
    console.log("✓ Significant source/DXF mismatch is a secondary review issue");
  }

  // Coverage + decision categories
  {
    const noDxf = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1" }),
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
      [part]
    );
    assert(
      categorizeReadinessIssues(noDxf).dxfCoverage.some((r) =>
        r.issueCodes.includes("NO_DXF_FOUND")
      ),
      "NO_DXF coverage"
    );

    const invalid = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: "P1" }),
          match: {
            status: "INVALID_DXF",
            method: "EXACT_ID",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "INVALID_DXF",
        }),
      ],
      [{ ...part, geometryStatus: "INVALID", error: "bad" }]
    );
    assert(
      categorizeReadinessIssues(invalid).dxfCoverage.some((r) =>
        r.issueCodes.includes("DXF_INVALID")
      ),
      "invalid coverage"
    );

    const amb = derive(
      [
        resultRow({
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
                filename: "a.dxf",
                widthMm: 100,
                lengthMm: 200,
                widthDifferenceMm: 0,
                lengthDifferenceMm: 0,
              },
              {
                dxfId: "d2",
                partId: "P2",
                filename: "b.dxf",
                widthMm: 100.1,
                lengthMm: 200,
                widthDifferenceMm: 0.1,
                lengthDifferenceMm: 0,
              },
            ],
            message: null,
          },
          status: "NEEDS_DXF",
        }),
      ],
      [part, part2]
    );
    assert(
      categorizeReadinessIssues(amb).dxfDecision.some((r) =>
        r.issueCodes.includes("MULTIPLE_DXF_CANDIDATES")
      ),
      "decision category"
    );
    console.log("✓ No DXF / invalid / multiple candidates categorized");
  }

  // Inline edit updates canonical row
  {
    const base = resultRow({
      resultRowId: "r1",
      extracted: extracted({
        rowId: "e1",
        partId: "P1",
        material: null,
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
    let rows = derive([base], [part]);
    assert(rows[0]!.issueCodes.includes("MISSING_MATERIAL"), "needs mat");
    rows = derive([{ ...base, edits: { material: "S235" } }], [part]);
    assertEq(rows[0]!.material, "S235", "canonical material");
    assert(!rows[0]!.issueCodes.includes("MISSING_MATERIAL"), "cleared");
    console.log("✓ Inline completion updates canonical row");
  }

  // DXF selection updates canonical row
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
            filename: "a.dxf",
            widthMm: 100,
            lengthMm: 200,
            widthDifferenceMm: 0,
            lengthDifferenceMm: 0,
          },
          {
            dxfId: "d2",
            partId: "P2",
            filename: "b.dxf",
            widthMm: 100.1,
            lengthMm: 200,
            widthDifferenceMm: 0.1,
            lengthDifferenceMm: 0,
          },
        ],
        message: null,
      },
      status: "NEEDS_DXF",
    });
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
    const rows = derive([selected], [part, part2], {
      confirmed: new Set(["r1"]),
    });
    assertEq(rows[0]!.part.matchedDxfId, "d2", "selected");
    assertEq(categorizeReadinessIssues(rows).dxfDecision.length, 0, "cleared");
    console.log("✓ DXF selection updates canonical row");
  }

  // Unused DXF is notice-only (not in critical categories)
  {
    assertEq(viewForCategory("MISSING_INFO"), "LIST_MISSING_INFO", "nav");
    const root = path.resolve(__dirname, "..");
    const summaryUi = fs.readFileSync(
      path.join(root, "readiness/ReadinessSummary.tsx"),
      "utf8"
    );
    assert(
      summaryUi.includes("לא שויכו") && summaryUi.includes("הצג קבצים"),
      "unused notice"
    );
    assert(
      !summaryUi.includes("UNUSED_DXF"),
      "no unused enum in summary UI"
    );
    console.log("✓ Unused DXFs appear only as non-blocking notice");
  }

  // Wiring + continue confirmation + no second AI
  {
    const root = path.resolve(__dirname, "..");
    const ready = fs.readFileSync(
      path.join(root, "components/ReadyStep.tsx"),
      "utf8"
    );
    assert(ready.includes("PostAnalysisWorkflow"), "ReadyStep workflow");

    const workflow = fs.readFileSync(
      path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
      "utf8"
    );
    assert(workflow.includes("ReadinessSummary"), "summary screen");
    assert(workflow.includes("ReadinessIssueList"), "grouped lists");
    assert(workflow.includes("DxfSelectionDialog"), "dxf dialog");
    assert(workflow.includes("ContinueWithIssuesDialog"), "continue confirm");
    assert(workflow.includes("appendDxfFilesAndRematch"), "local dxf add");
    assert(
      workflow.includes("rematchLocallyPreservingEdits"),
      "local rematch"
    );
    assert(!workflow.includes("/api/simple-intake/analyze"), "no re-analyze");
    assert(!workflow.includes("GuidedIssueReview"), "no one-by-one wizard");

    const cont = fs.readFileSync(
      path.join(root, "readiness/ContinueWithIssuesDialog.tsx"),
      "utf8"
    );
    assert(cont.includes("להמשיך עם פריטים שדורשים טיפול"), "confirm title");
    assert(cont.includes("המשך בכל זאת"), "continue anyway");

    const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
    assert(
      store.includes("providerCallCount: session.providerCallCount"),
      "provider preserved"
    );

    const route = fs.readFileSync(
      path.join(root, "../../app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(
      route.includes("providerCallCount: out.providerCallCount"),
      "provider call count from extraction"
    );

    assertEq(FIXED_TABLE_COLUMN_HEADERS.length, 12, "12 cols");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[0], "סטטוס", "status");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[11], "פעולות", "actions");

    const cards = fs.readFileSync(
      path.join(root, "readiness/ReadinessSummary.tsx"),
      "utf8"
    );
    assert(
      cards.includes("בדיקת התאמות") || cards.includes("התאמת DXF הושלמה"),
      "opens summary"
    );
    assert(cards.includes("ReadinessIssueCards"), "issue cards");

    const cat = fs.readFileSync(
      path.join(root, "readiness/categorizeReadinessIssues.ts"),
      "utf8"
    );
    assert(cat.includes("השלם פרטים"), "card action");
    assert(cat.includes("בחר קובץ DXF"), "missing dxf action");
    assert(cat.includes("השווה ובחר"), "decision action");

    console.log("✓ Wiring, continue confirmation, Stage-2 no extra AI");
  }

  console.log("\n=== All Pre-Table Readiness Review v1 tests passed ===");
}

run();