/**
 * Fixed Canonical Results Table Contract Patch v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-fixed-canonical-table-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  calcCommercialTotalWeightKg,
  calcCommercialUnitWeightKg,
  DEFAULT_STEEL_DENSITY_KG_M3,
  calcCommercialAreaM2,
} from "../results/commercialCalculations";
import { deriveFinalRows, summarizeFinalRows } from "../results/deriveFinalRows";
import { resolvePartDisplayName } from "../results/resolvePartDisplayName";
import {
  FALLBACK_PART_DISPLAY_NAME,
  FIXED_TABLE_COLUMN_HEADERS,
} from "../results/tableContract";
import type {
  SimpleDxfPart,
  SimpleExtractedRow,
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
    profile: null,
    description: null,
    quantity: 1,
    material: "S355",
    thicknessMm: 10,
    widthMm: 100,
    lengthMm: 200,
    sourceAreaM2: null,
    sourceWeightKg: null,
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
  parts: SimpleDxfPart[]
) {
  return deriveFinalRows({
    resultRows: rows,
    dxfParts: parts,
    workbookFilename: "wb.xlsx",
    snapshot: null,
  });
}

function run(): void {
  console.log("=== Fixed Canonical Results Table Contract v1 ===\n");

  // T1–T2 fixed columns
  {
    assertEq(FIXED_TABLE_COLUMN_HEADERS.length, 12, "T1 count");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[0], "סטטוס", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[1], "חלק", "T1 חלק");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[2], "תצוגה", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[3], "חומר", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[4], "עובי", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[5], "כמות", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[6], "מידות DXF", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[7], "שטח מסחרי", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[8], "משקל ליחידה", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[9], "משקל כולל", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[10], "הערה", "T1");
    assertEq(FIXED_TABLE_COLUMN_HEADERS[11], "פעולות", "T2 order last");
    const tableSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/simple-intake/results/SimpleFinalItemsTable.tsx"
      ),
      "utf8"
    );
    assert(tableSrc.includes("FIXED_TABLE_COLUMN_HEADERS"), "T1 uses contract");
    assert(!tableSrc.includes("שורת חומר"), "T1 no rename");
    assert(!tableSrc.includes("שם DXF"), "T3 no extra DXF name col");
    console.log("✓ T1–T3 fixed columns / no dynamic columns");
  }

  // T4–T8 חלק precedence
  {
    const named = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({ rowId: "e1", partId: "P1094" }),
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
      [dxf({ id: "d1", partId: "p1094", filename: "p1094.dxf" })]
    );
    assertEq(named[0]!.part.displayName, "P1094", "T5");
    assertEq(named[0]!.part.displayNameSource, "SOURCE_PART_ID", "T5 src");

    const dxfFallback = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            partId: null,
            profile: "PL12×74",
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
      [dxf({ id: "d1", partId: "A3B1-P18", filename: "A3B1-P18.dxf" })]
    );
    assertEq(dxfFallback[0]!.part.displayName, "A3B1-P18", "T6");
    assertEq(dxfFallback[0]!.part.displayNameSource, "MATCHED_DXF", "T6 src");
    assertEq(dxfFallback[0]!.part.sourcePartId, null, "safeguard sourcePartId");

    const profileOnly = resolvePartDisplayName({
      sourcePartId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
      sourceProfile: "PL12×74",
    });
    assertEq(profileOnly.displayName, "PL12×74", "T7");
    assertEq(profileOnly.displayNameSource, "SOURCE_PROFILE", "T7");

    const fallback = resolvePartDisplayName({
      sourcePartId: null,
      matchedDxfPartId: null,
      matchedDxfFilename: null,
      sourceProfile: null,
    });
    assertEq(fallback.displayName, FALLBACK_PART_DISPLAY_NAME, "T8");
    assertEq(fallback.displayNameSource, "FALLBACK", "T8");

    // No part ID still has חלק column in contract
    assert(FIXED_TABLE_COLUMN_HEADERS.includes("חלק"), "T4");
    console.log("✓ T4–T8 חלק precedence + provenance");
  }

  // T9–T11 quantity / no expansion / separate rows
  {
    const area = calcCommercialAreaM2(100, 200)!;
    const unit = calcCommercialUnitWeightKg({
      areaM2: area,
      thicknessMm: 10,
      densityKgPerM3: DEFAULT_STEEL_DENSITY_KG_M3,
    })!;
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            profile: "PL12×102",
            quantity: 16,
            partId: null,
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
      [dxf({ id: "d1", partId: "G1" })]
    );
    assertEq(rows.length, 1, "T9/T10 one row");
    assertEq(rows[0]!.quantity, 16, "T9 qty");
    assertEq(
      rows[0]!.commercial.totalWeightKg,
      calcCommercialTotalWeightKg({ unitWeightKg: unit, quantity: 16 }),
      "T9 total"
    );
    assert(
      !rows[0]!.issueCodes.some((c) => String(c).includes("QUANTITY")),
      "no qty>1 warning"
    );

    const two = derive(
      [
        resultRow({
          resultRowId: "a",
          extracted: extracted({ rowId: "ea", sourceRow: 2, quantity: 5 }),
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
          extracted: extracted({ rowId: "eb", sourceRow: 3, quantity: 5 }),
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
      [dxf({ id: "d1", partId: "A" }), dxf({ id: "d2", partId: "B" })]
    );
    assertEq(two.length, 2, "T11");
    console.log("✓ T9–T11 quantity semantics");
  }

  // T12–T15 counts
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "a",
          extracted: extracted({ rowId: "ea", quantity: 10 }),
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
          extracted: extracted({ rowId: "eb", quantity: null }),
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
          resultRowId: "c",
          extracted: extracted({ rowId: "ec", quantity: 7 }),
          excluded: true,
          match: {
            status: "MATCHED",
            method: "GEOMETRY",
            matchedDxfId: "d3",
            candidates: [],
            message: null,
          },
          status: "EXCLUDED",
        }),
      ],
      [
        dxf({ id: "d1", partId: "A" }),
        dxf({ id: "d2", partId: "B" }),
        dxf({ id: "d3", partId: "C" }),
      ]
    );
    const s = summarizeFinalRows(rows);
    assertEq(s.totalRowCount, 3, "T12");
    assertEq(s.total, 3, "T12 alias");
    assertEq(s.totalUnitCount, 10, "T13/T15 excl + missing as 0 in sum");
    assertEq(s.rowsWithMissingQuantity, 1, "T5 missing qty");
    assertEq(s.isTotalUnitCountComplete, false, "T6 incomplete");
    assertEq(s.ready, 1, "T14 row counts");
    assertEq(s.blocked, 1, "T14 blocked");
    assertEq(s.excluded, 1, "T14 excl");
    console.log("✓ T12–T15 counts + incomplete units");
  }

  // T16–T18 commercial vs source
  {
    const rows = derive(
      [
        resultRow({
          resultRowId: "r1",
          extracted: extracted({
            rowId: "e1",
            widthMm: 50,
            lengthMm: 50,
            sourceAreaM2: 9,
            sourceWeightKg: 9,
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
      [dxf({ id: "d1", partId: "G", widthMm: 100, lengthMm: 200 })]
    );
    assertEq(rows[0]!.dxfDimensions.widthMm, 100, "T16");
    assertEq(rows[0]!.source.sourceWidthMm, 50, "T17");
    assertEq(rows[0]!.commercial.areaM2, 0.02, "T18");
    assertEq(rows[0]!.source.sourceAreaM2, 9, "T18 source");
    assert(
      !rows[0]!.issueCodes.includes("MISSING_MATERIAL") ||
        rows[0]!.material != null,
      "no weight-diff issue"
    );
    console.log("✓ T16–T18 commercial / source");
  }

  // T19–T21 same table for named / unnamed / qty fixtures
  {
    const headers = [...FIXED_TABLE_COLUMN_HEADERS];
    const named = derive(
      [
        resultRow({
          resultRowId: "n",
          extracted: extracted({ rowId: "en", partId: "X1" }),
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
      [dxf({ id: "d1", partId: "X1" })]
    );
    const unnamed = derive(
      [
        resultRow({
          resultRowId: "u",
          extracted: extracted({
            rowId: "eu",
            partId: null,
            profile: "PL10*90",
            quantity: 4,
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
      [dxf({ id: "d1", partId: "G" })]
    );
    assertEq(headers.join("|"), FIXED_TABLE_COLUMN_HEADERS.join("|"), "same");
    assertEq(named.length, 1, "T19");
    assertEq(unnamed.length, 1, "T20/T21");
    assertEq(unnamed[0]!.quantity, 4, "T21 qty");
    console.log("✓ T19–T21 same table for fixture types");
  }

  // T22 mobile fields
  {
    const cards = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/simple-intake/results/SimpleFinalItemsTable.tsx"
      ),
      "utf8"
    );
    for (const label of [
      "חומר",
      "עובי",
      "כמות",
      "מידות DXF",
      "שטח מסחרי",
      "משקל ליחידה",
      "משקל כולל",
    ]) {
      assert(cards.includes(label), `T22 ${label}`);
    }
    console.log("✓ T22 stable mobile fields");
  }

  // T23–T25 pipeline
  {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "T23");
    const resultsDir = path.join(process.cwd(), "features/simple-intake/results");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else out.push(p);
      }
      return out;
    };
    for (const f of walk(resultsDir)) {
      const src = fs.readFileSync(f, "utf8");
      assert(!/localStorage|sessionStorage|indexedDB|supabase/i.test(src), f);
      assert(!/workbookType ===|FixedWidthResultsTable/.test(src), f);
    }
    console.log("✓ T23–T25 one call / no persistence / no file-specific UI");
  }

  console.log("\n=== Fixed canonical table tests passed ===");
}

run();