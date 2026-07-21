/**
 * Complete Workbook Scan and Missing Exact-ID Coverage Patch v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-coverage-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  assertSnapshotCoverageComplete,
} from "../buildSimpleWorkbookSnapshot";
import { checkExactIdExtractionCoverage } from "../checkExactIdExtractionCoverage";
import {
  cellHasExactNormalizedPartId,
  findExactDxfIdsInWorkbookSnapshot,
} from "../findExactDxfIdsInWorkbookSnapshot";
import {
  deriveSimpleDxfAvailability,
  matchSimpleRows,
} from "../matchSimpleRows";
import { normalizePartIdForMatch } from "../normalizePartId";
import type {
  SimpleDxfPart,
  SimpleExtractedRow,
  SimpleWorkbookSnapshot,
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

function makeSnapshot(
  rows: Array<{ rowNumber: number; cells: Array<{ address: string; text: string }> }>
): SimpleWorkbookSnapshot {
  const last = rows.length ? Math.max(...rows.map((r) => r.rowNumber)) : null;
  return {
    workbookId: "wb",
    filename: "t.xlsx",
    sheets: [
      {
        sheetName: "S1",
        maxSourceRow: last ?? 0,
        populatedRowCount: rows.length,
        lastPopulatedSourceRow: last,
        rows,
      },
    ],
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

function run(): void {
  console.log("=== Coverage Patch v1 ===\n");

  // T1–T4 snapshot includes rows after Total / blank / header
  {
    const snap = makeSnapshot([
      { rowNumber: 1, cells: [{ address: "A1", text: "Part" }] },
      { rowNumber: 2, cells: [{ address: "A2", text: "P1" }] },
      { rowNumber: 3, cells: [{ address: "A3", text: "Total" }] },
      { rowNumber: 5, cells: [{ address: "A5", text: "Part" }] }, // blank sep at 4
      { rowNumber: 6, cells: [{ address: "A6", text: "P2" }] },
      { rowNumber: 7, cells: [{ address: "A7", text: "Part" }] }, // repeated header
      { rowNumber: 8, cells: [{ address: "A8", text: "P3" }] },
    ]);
    assertEq(snap.sheets[0]!.lastPopulatedSourceRow, 8, "last row 8");
    assert(
      snap.sheets[0]!.rows.some((r) => r.rowNumber === 6),
      "row after total"
    );
    assert(
      snap.sheets[0]!.rows.some((r) => r.rowNumber === 8),
      "row after header"
    );
    const cov = assertSnapshotCoverageComplete(snap);
    assert(cov.ok, "invariant ok");
    console.log("✓ T1–T5 rows after Total/blank/header + invariant");
  }

  // T6 truncated snapshot fails
  {
    const truncated: SimpleWorkbookSnapshot = {
      workbookId: "wb",
      filename: "t.xlsx",
      sheets: [
        {
          sheetName: "S1",
          maxSourceRow: 20,
          populatedRowCount: 1,
          lastPopulatedSourceRow: 20, // claims last=20
          rows: [
            { rowNumber: 2, cells: [{ address: "A2", text: "P1" }] },
          ], // but only row 2 present → incomplete
        },
      ],
    };
    const cov = assertSnapshotCoverageComplete(truncated);
    assertEq(cov.ok, false, "truncated fails");
    console.log("✓ T6 truncated snapshot fails invariant");
  }

  // T7/T8/T9 exact ID occurrence
  {
    assert(
      cellHasExactNormalizedPartId("p1094", normalizePartIdForMatch("P1094")),
      "case"
    );
    assert(
      !cellHasExactNormalizedPartId(
        "P1094A",
        normalizePartIdForMatch("P1094")
      ),
      "no substring"
    );
    const snap = makeSnapshot([
      { rowNumber: 10, cells: [{ address: "A10", text: "P1094" }] },
      { rowNumber: 11, cells: [{ address: "A11", text: "note P1094A" }] },
    ]);
    const occ = findExactDxfIdsInWorkbookSnapshot({
      snapshot: snap,
      dxfParts: [dxf({ id: "d1", partId: "P1094" })],
    });
    assertEq(occ.length, 1, "one occurrence");
    assertEq(occ[0]!.sourceRow, 10, "row 10");
    console.log("✓ T7–T9 exact ID occurrence / case / substring");
  }

  // T10/T11/T12 missing extraction → MISSING_FROM_EXTRACTION, not UNUSED
  {
    const snap = makeSnapshot([
      { rowNumber: 2, cells: [{ address: "A2", text: "P100" }] },
      { rowNumber: 15, cells: [{ address: "A15", text: "P999" }] },
    ]);
    const parts = [
      dxf({ id: "d1", partId: "P100" }),
      dxf({ id: "d2", partId: "P999" }),
    ];
    const occ = findExactDxfIdsInWorkbookSnapshot({ snapshot: snap, dxfParts: parts });
    const rows = [extracted({ rowId: "r1", partId: "P100", sourceRow: 2 })];
    const coverage = checkExactIdExtractionCoverage({
      exactIdOccurrences: occ,
      validatedRows: rows,
    });
    assert(coverage.issues.length >= 1, "missing issue");
    assertEq(
      coverage.issues[0]!.type,
      "EXACT_ID_PRESENT_BUT_NOT_EXTRACTED",
      "type"
    );
    const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const avail = deriveSimpleDxfAvailability({
      dxfParts: parts,
      resultRows: matched.resultRows,
      coverageIssues: coverage.issues,
    });
    const by = Object.fromEntries(avail.map((a) => [a.dxfId, a.state]));
    assertEq(by.d1, "USED", "used");
    assertEq(by.d2, "MISSING_FROM_EXTRACTION", "missing");
    const unused = avail.filter((a) => a.state === "UNUSED");
    assert(!unused.some((a) => a.dxfId === "d2"), "not unused");
    console.log("✓ T10–T13 missing extraction state + preserve valid rows");
  }

  // T14/T15 manual add simulation (coverage remove + exact match)
  {
    const parts = [dxf({ id: "d2", partId: "P999" })];
    const issue = {
      type: "EXACT_ID_PRESENT_BUT_NOT_EXTRACTED" as const,
      normalizedPartId: normalizePartIdForMatch("P999"),
      originalPartId: "P999",
      sheetName: "S1",
      sourceRow: 15,
      cellAddress: "A15",
      sourceText: "P999",
      message: "msg",
    };
    const manual = extracted({
      rowId: "manual1",
      partId: "P999",
      sourceRow: 15,
      sourceCell: "A15",
    });
    const m = matchSimpleRows({ extractedRows: [manual], dxfParts: parts });
    assertEq(m.resultRows[0]!.match.method, "EXACT_ID", "exact after manual");
    const afterIssues = checkExactIdExtractionCoverage({
      exactIdOccurrences: [
        {
          normalizedPartId: issue.normalizedPartId,
          originalDxfPartId: "P999",
          sheetName: "S1",
          sourceRow: 15,
          cellAddress: "A15",
          sourceText: "P999",
        },
      ],
      validatedRows: [manual],
    });
    assertEq(afterIssues.issues.length, 0, "issue cleared");
    console.log("✓ T14/T15 manual add + exact match");
  }

  // T16 no invention — DXF not in workbook
  {
    const snap = makeSnapshot([
      { rowNumber: 1, cells: [{ address: "A1", text: "hello" }] },
    ]);
    const occ = findExactDxfIdsInWorkbookSnapshot({
      snapshot: snap,
      dxfParts: [dxf({ id: "d1", partId: "ONLY_DXF" })],
    });
    assertEq(occ.length, 0, "no occurrence");
    console.log("✓ T16 no invention from DXF-only ID");
  }

  // T17 repeated rows preserved
  {
    const rows = [
      extracted({ rowId: "a", partId: "P1", sourceRow: 2 }),
      extracted({ rowId: "b", partId: "P1", sourceRow: 9 }),
    ];
    const m = matchSimpleRows({
      extractedRows: rows,
      dxfParts: [dxf({ id: "d1", partId: "P1" })],
    });
    assertEq(m.resultRows.length, 2, "two rows");
    console.log("✓ T17 repeated rows preserved");
  }

  // T18 one AI call
  {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "one call");
    assert(route.includes("lastPopulatedSourceRow"), "prompt bounds");
    console.log("✓ T18 one AI call + prompt coverage");
  }

  // T19 matching regression smoke
  {
    const m = matchSimpleRows({
      extractedRows: [
        extracted({ rowId: "r", widthMm: 100, lengthMm: 200, partId: null }),
      ],
      dxfParts: [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })],
    });
    assertEq(m.resultRows[0]!.match.status, "MATCHED", "geom still works");
    console.log("✓ T19 matching regression");
  }

  // T20 snapshot builder still SheetJS
  {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/simple-intake/buildSimpleWorkbookSnapshot.ts"
      ),
      "utf8"
    );
    assert(src.includes("XLSX.read"), "sheetjs");
    assert(src.includes("lastPopulatedSourceRow"), "metadata");
    console.log("✓ T20 workbook snapshot regression");
  }

  // T21 privacy
  {
    const root = path.join(process.cwd(), "features/simple-intake");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === "__tests__") continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
      }
      return out;
    };
    const banned =
      /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bIndexedDB\b|\bsupabase\b/i;
    for (const file of walk(root)) {
      assert(!banned.test(fs.readFileSync(file, "utf8")), file);
    }
    console.log("✓ T21 privacy");
  }

  console.log("\n=== Coverage Patch v1 passed ===");
}

run();