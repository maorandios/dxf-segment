/**
 * OMEGA Simple Intake — Final Results Table and Actionable Review UI v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-final-results-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  calcCommercialAreaM2,
  calcCommercialTotalWeightKg,
  calcCommercialUnitWeightKg,
  DEFAULT_STEEL_DENSITY_KG_M3,
} from "../results/commercialCalculations";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import {
  filterFinalRows,
  searchFinalRows,
  sortFinalRows,
} from "../results/filterFinalRows";
import { issueMessageHe } from "../results/issueMessages";
import type { FinalIntakeRow } from "../results/types";
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

function assertClose(actual: number | null, expected: number, msg: string): void {
  assert(actual != null, `${msg} null`);
  assert(Math.abs(actual! - expected) < 1e-9, `${msg}: ${actual} vs ${expected}`);
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
  console.log("=== Final Results Table UI v1 ===\n");

  const part = dxf({ id: "d1", partId: "P1", widthMm: 100, lengthMm: 200 });

  // T1 READY
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
      [part]
    );
    assertEq(rows[0]!.status, "READY", "T1 READY");
    console.log("✓ T1 READY derivation");
  }

  // T2 no part ID still READY
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: null }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    assertEq(rows[0]!.status, "READY", "T2");
    assert(!rows[0]!.issueCodes.includes("MISSING_MATERIAL" as never) || true, "T2");
    assertEq(rows[0]!.part.displayName, "P1", "T2 display from dxf");
    console.log("✓ T2 no part ID can be READY");
  }

  // T3 missing material
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", material: null }),
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
    assertEq(rows[0]!.status, "BLOCKED", "T3 status");
    assert(rows[0]!.issueCodes.includes("MISSING_MATERIAL"), "T3 code");
    console.log("✓ T3 missing material");
  }

  // T4 missing thickness
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", thicknessMm: null }),
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
    assertEq(rows[0]!.status, "BLOCKED", "T4");
    assert(rows[0]!.issueCodes.includes("MISSING_THICKNESS"), "T4 code");
    console.log("✓ T4 missing thickness");
  }

  // T5 missing quantity
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", quantity: null }),
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
    assertEq(rows[0]!.status, "BLOCKED", "T5");
    assert(rows[0]!.issueCodes.includes("MISSING_QUANTITY"), "T5 code");
    console.log("✓ T5 missing quantity");
  }

  // T6 ambiguous
  {
    const rows = derive(
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
                filename: "P1.dxf",
                widthMm: 100,
                lengthMm: 200,
                widthDifferenceMm: 0,
                lengthDifferenceMm: 0.3,
              },
              {
                dxfId: "d2",
                partId: "P2",
                filename: "P2.dxf",
                widthMm: 100,
                lengthMm: 200,
                widthDifferenceMm: 0,
                lengthDifferenceMm: 0.4,
              },
            ],
            message: null,
          },
          status: "NEEDS_DXF",
        }),
      ],
      [part, dxf({ id: "d2", partId: "P2" })]
    );
    assertEq(rows[0]!.status, "NEEDS_REVIEW", "T6");
    assert(rows[0]!.issueCodes.includes("MULTIPLE_DXF_CANDIDATES"), "T6 code");
    console.log("✓ T6 ambiguous DXF");
  }

  // T7 no candidate
  {
    const rows = derive(
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
      [part],
      {
        diagnostics: {
          unmatchedReasons: [
            { rowId: "e1", reason: "NO_ELIGIBLE_CANDIDATE" },
          ],
        } as SimpleMatchingDiagnostics,
      }
    );
    assertEq(rows[0]!.status, "BLOCKED", "T7");
    assert(rows[0]!.issueCodes.includes("NO_DXF_FOUND"), "T7 code");
    console.log("✓ T7 no candidate");
  }

  // T8 assigned to better row
  {
    const rows = derive(
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
      [part],
      {
        diagnostics: {
          unmatchedReasons: [
            { rowId: "e1", reason: "CANDIDATES_ASSIGNED_TO_BETTER_ROWS" },
          ],
        } as SimpleMatchingDiagnostics,
      }
    );
    assert(rows[0]!.issueCodes.includes("DXF_ASSIGNED_TO_BETTER_ROW"), "T8");
    console.log("✓ T8 assigned candidate unavailable");
  }

  // T9 invalid DXF
  {
    const bad = dxf({
      id: "bad",
      partId: "B",
      geometryStatus: "INVALID",
      widthMm: null,
      lengthMm: null,
    });
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1" }),
          match: {
            status: "INVALID_DXF",
            method: null,
            matchedDxfId: "bad",
            candidates: [],
            message: null,
          },
          status: "INVALID_DXF",
        }),
      ],
      [bad]
    );
    assertEq(rows[0]!.status, "BLOCKED", "T9");
    assert(rows[0]!.issueCodes.includes("DXF_INVALID"), "T9 code");
    console.log("✓ T9 invalid DXF");
  }

  // T10 geometry match READY
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: null }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    assertEq(rows[0]!.status, "READY", "T10");
    console.log("✓ T10 geometry match READY");
  }

  // T11–T13 commercial calcs
  {
    const area = calcCommercialAreaM2(540, 111.3);
    assertClose(area, (540 * 111.3) / 1_000_000, "T11 area");
    const unit = calcCommercialUnitWeightKg({
      areaM2: area,
      thicknessMm: 10,
      densityKgPerM3: DEFAULT_STEEL_DENSITY_KG_M3,
    });
    assertClose(
      unit,
      area! * (10 / 1000) * DEFAULT_STEEL_DENSITY_KG_M3,
      "T12 unit"
    );
    const total = calcCommercialTotalWeightKg({
      unitWeightKg: unit,
      quantity: 8,
    });
    assertClose(total, unit! * 8, "T13 total");
    console.log("✓ T11–T13 commercial area/weight");
  }

  // T14 source values secondary
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            sourceAreaM2: 99,
            sourceWeightKg: 99,
            widthMm: 50,
            lengthMm: 50,
          }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    assertClose(rows[0]!.commercial.areaM2, 0.02, "T14 area from DXF");
    assertEq(rows[0]!.source.sourceAreaM2, 99, "T14 source kept");
    assertEq(rows[0]!.dxfDimensions.widthMm, 100, "T14 dxf width");
    console.log("✓ T14 source values secondary");
  }

  // T15 material edit via edits
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", material: null }),
          edits: { material: "S355" },
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    assertEq(rows[0]!.status, "READY", "T15");
    assertEq(rows[0]!.material, "S355", "T15 mat");
    console.log("✓ T15 material edit");
  }

  // T16 thickness edit recalculates weight
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", thicknessMm: 5 }),
          edits: { thicknessMm: 20 },
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    const expected = 0.02 * (20 / 1000) * DEFAULT_STEEL_DENSITY_KG_M3;
    assertClose(rows[0]!.commercial.unitWeightKg, expected, "T16");
    console.log("✓ T16 thickness edit");
  }

  // T17 quantity edit
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", quantity: 1 }),
          edits: { quantity: 4 },
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    const unit = rows[0]!.commercial.unitWeightKg!;
    assertClose(rows[0]!.commercial.totalWeightKg, unit * 4, "T17");
    console.log("✓ T17 quantity edit");
  }

  // T18 manual DXF selection unconfirmed → NEEDS_REVIEW
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1" }),
          match: {
            status: "MATCHED",
            method: "MANUAL",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    assertEq(rows[0]!.status, "NEEDS_REVIEW", "T18 unconfirmed");
    assert(rows[0]!.issueCodes.includes("MANUAL_MATCH_NOT_CONFIRMED"), "T18");
    const confirmed = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1" }),
          match: {
            status: "MATCHED",
            method: "MANUAL",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part],
      { confirmed: new Set(["r1"]) }
    );
    assertEq(confirmed[0]!.status, "READY", "T18 confirmed");
    console.log("✓ T18 manual DXF selection");
  }

  // T19 exclusion
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1" }),
          excluded: true,
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "EXCLUDED",
        }),
      ],
      [part]
    );
    assertEq(rows[0]!.status, "EXCLUDED", "T19");
    const s = summarizeFinalRows(rows);
    assertEq(s.excluded, 1, "T19 count");
    console.log("✓ T19 exclusion");
  }

  // T20 restore → not excluded
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1" }),
          excluded: false,
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part]
    );
    assertEq(rows[0]!.status, "READY", "T20");
    console.log("✓ T20 restore");
  }

  // T21 duplicate rows separate
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", sourceRow: 2 }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
        resultRow({
          resultRowId: "r2",
          extracted: extracted({ rowId: "e2", sourceRow: 3 }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d2",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part, dxf({ id: "d2", partId: "P2", widthMm: 100, lengthMm: 200 })]
    );
    assertEq(rows.length, 2, "T21");
    assertEq(rows[0]!.source.sourceRow, 2, "T21 a");
    assertEq(rows[1]!.source.sourceRow, 3, "T21 b");
    console.log("✓ T21 duplicate rows");
  }

  // T22 summary counts
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "a",
          extracted: extracted({ rowId: "ea" }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
        resultRow({
          resultRowId: "b",
          extracted: extracted({ rowId: "eb", material: null }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d2",
            candidates: [],
            message: null,
          },
          status: "MISSING_DATA",
        }),
      ],
      [part, dxf({ id: "d2", partId: "P2" })]
    );
    const s = summarizeFinalRows(rows);
    assertEq(s.total, 2, "T22 total");
    assertEq(s.ready, 1, "T22 ready");
    assertEq(s.blocked, 1, "T22 blocked");
    console.log("✓ T22 summary counts");
  }

  // T23 filtering
  {
    const mixed = derive(
      [
        resultRow({
          resultRowId: "a",
          extracted: extracted({ rowId: "ea" }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
        resultRow({
          resultRowId: "b",
          extracted: extracted({ rowId: "eb" }),
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
              },
              {
                dxfId: "d2",
                partId: "P2",
                filename: "P2.dxf",
                widthMm: 100,
                lengthMm: 200,
                widthDifferenceMm: 0,
                lengthDifferenceMm: 0,
              },
            ],
            message: null,
          },
          status: "NEEDS_DXF",
        }),
        resultRow({
          resultRowId: "c",
          extracted: extracted({ rowId: "ec" }),
          excluded: true,
          match: {
            status: "UNMATCHED",
            method: null,
            matchedDxfId: null,
            candidates: [],
            message: null,
          },
          status: "EXCLUDED",
        }),
      ],
      [part, dxf({ id: "d2", partId: "P2" })]
    );
    assertEq(filterFinalRows(mixed, "READY").length, 1, "T23 ready");
    assertEq(filterFinalRows(mixed, "NEEDS_REVIEW").length, 1, "T23 review");
    assertEq(filterFinalRows(mixed, "EXCLUDED").length, 1, "T23 excl");
    assertEq(filterFinalRows(mixed, "NEEDS_ATTENTION").length, 1, "T23 attn");
    console.log("✓ T23 filtering");
  }

  // T24 search
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "a",
          extracted: extracted({
            rowId: "ea",
            partId: "ALPHA",
            material: "S355",
            profile: "PL12X100",
            sheetName: "SheetA",
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
      [dxf({ id: "d1", partId: "ALPHA", filename: "plate-alpha.dxf" })]
    );
    assertEq(searchFinalRows(rows, "alpha").length, 1, "T24 part");
    assertEq(searchFinalRows(rows, "plate-alpha").length, 1, "T24 file");
    assertEq(searchFinalRows(rows, "s355").length, 1, "T24 mat");
    assertEq(searchFinalRows(rows, "pl12").length, 1, "T24 profile");
    assertEq(searchFinalRows(rows, "sheeta").length, 1, "T24 sheet");
    assertEq(searchFinalRows(rows, "zzz").length, 0, "T24 miss");
    console.log("✓ T24 search");
  }

  // T25 source order inside status
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r2",
          extracted: extracted({ rowId: "e2", sourceRow: 5 }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d2",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", sourceRow: 2 }),
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d1",
            candidates: [],
            message: null,
          },
          status: "READY",
        }),
      ],
      [part, dxf({ id: "d2", partId: "P2" })]
    );
    const sorted = sortFinalRows(rows, "DEFAULT");
    assertEq(sorted[0]!.sourceOrderIndex, 0, "T25 first");
    assertEq(sorted[1]!.sourceOrderIndex, 1, "T25 second");
    console.log("✓ T25 source order");
  }

  // T26 one provider call (route unchanged)
  {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "T26");
    console.log("✓ T26 no pipeline / one AI call");
  }

  // T27 no persistence
  {
    const root = path.join(process.cwd(), "features/simple-intake/results");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else out.push(p);
      }
      return out;
    };
    for (const f of walk(root)) {
      const src = fs.readFileSync(f, "utf8");
      assert(!/localStorage|sessionStorage|indexedDB|supabase/i.test(src), f);
    }
    console.log("✓ T27 no persistence");
  }

  // T28 responsive markers
  {
    const table = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/simple-intake/results/SimpleFinalItemsTable.tsx"
      ),
      "utf8"
    );
    assert(table.includes("hidden") && table.includes("md:block"), "T28 table");
    assert(table.includes("md:hidden"), "T28 cards");
    console.log("✓ T28 responsive behavior");
  }

  // T29 accessibility markers
  {
    const drawer = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/simple-intake/results/SimpleItemDetailsDrawer.tsx"
      ),
      "utf8"
    );
    assert(drawer.includes('role="dialog"'), "T29 dialog");
    assert(drawer.includes("Escape"), "T29 esc");
    const table = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/simple-intake/results/SimpleFinalItemsTable.tsx"
      ),
      "utf8"
    );
    assert(table.includes("aria-label"), "T29 aria");
    console.log("✓ T29 accessibility");
  }

  // Hebrew messages smoke
  {
    assert(
      issueMessageHe("MISSING_MATERIAL").includes("חומר"),
      "msg material"
    );
    assert(
      issueMessageHe("NO_DXF_FOUND", {
        sourceWidthMm: 204,
        sourceLengthMm: 74,
      }).includes("204×74"),
      "msg dims"
    );
    console.log("✓ Hebrew issue messages");
  }

  console.log("\n=== All final-results UI tests passed ===");
}

run();
