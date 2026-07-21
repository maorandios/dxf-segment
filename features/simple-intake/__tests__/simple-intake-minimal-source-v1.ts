/**
 * OMEGA Simple Intake — Minimal Source Extraction Contract Patch v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-minimal-source-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import { SIMPLE_INTAKE_SYSTEM_PROMPT, simpleAiRowSchema } from "../aiSchema";
import {
  analyzeTextContainsDxfData,
  buildSimpleAnalyzeRequestBody,
  buildSimpleAnalyzeUserText,
} from "../buildAnalyzeRequest";
import { buildSimpleIntakeDebug } from "../buildSimpleDebug";
import { matchSimpleRows } from "../matchSimpleRows";
import {
  buildMissingExplicitFieldDiagnostics,
  buildSourceFieldSummary,
  validateSimpleAiResult,
} from "../validateAiResult";
import type {
  SimpleAiRow,
  SimpleAiWorkbookResult,
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

function snapshot(extraRows?: SimpleWorkbookSnapshot["sheets"][0]["rows"]): SimpleWorkbookSnapshot {
  const rows = extraRows ?? [
    {
      rowNumber: 1,
      cells: [
        { address: "A1", text: "Profile" },
        { address: "B1", text: "Qty" },
        { address: "C1", text: "Material" },
        { address: "D1", text: "Length" },
        { address: "E1", text: "Area" },
        { address: "F1", text: "Weight" },
      ],
    },
    {
      rowNumber: 2,
      cells: [
        { address: "A2", text: "PL31*540" },
        { address: "B2", text: "1" },
        { address: "C2", text: "S355" },
        { address: "D2", text: "540" },
        { address: "E2", text: "1" },
        { address: "F2", text: "0" },
      ],
    },
    {
      rowNumber: 3,
      cells: [
        { address: "A3", text: "PL30*540" },
        { address: "B3", text: "7" },
        { address: "C3", text: "S355" },
        { address: "D3", text: "540" },
        { address: "E3", text: "1" },
        { address: "F3", text: "0" },
      ],
    },
    {
      rowNumber: 4,
      cells: [
        { address: "A4", text: "PL25*535" },
        { address: "B4", text: "4" },
        { address: "C4", text: "S235" },
        { address: "D4", text: "535" },
        { address: "E4", text: "0" },
        { address: "F4", text: "1" },
      ],
    },
    {
      rowNumber: 5,
      cells: [{ address: "A5", text: "Total" }],
    },
    {
      rowNumber: 10,
      cells: [
        { address: "A10", text: "PL10*100" },
        { address: "B10", text: "1" },
        { address: "C10", text: "" },
        { address: "D10", text: "100" },
        { address: "E10", text: "" },
        { address: "F10", text: "" },
      ],
    },
  ];
  const last = Math.max(...rows.map((r) => r.rowNumber));
  return {
    workbookId: "wb",
    filename: "materials.xlsx",
    sheets: [
      {
        sheetName: "S1",
        maxSourceRow: last,
        populatedRowCount: rows.length,
        lastPopulatedSourceRow: last,
        rows,
      },
    ],
  };
}

function baseAiRow(
  partial: Partial<SimpleAiRow> & { rowId: string; sourceRow: number }
): SimpleAiRow {
  return {
    sheetName: "S1",
    sourceCell: `A${partial.sourceRow}`,
    partId: null,
    profile: null,
    description: null,
    quantity: 1,
    material: null,
    thicknessMm: null,
    widthMm: null,
    lengthMm: null,
    sourceAreaM2: null,
    sourceWeightKg: null,
    dxfFileName: null,
    confidence: 0.9,
    note: null,
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
    material: null,
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

function emptyTiming() {
  return {
    workbookSnapshotMs: null,
    dxfParseMs: null,
    aiCallMs: null,
    matchingMs: null,
    candidateGenerationMs: null,
    automaticAssignmentMs: null,
    strongAssignmentMs: null,
    propagationMs: null,
    finalClassificationMs: null,
    availabilityDerivationMs: null,
    coverageCheckMs: null,
    totalMs: null,
  };
}

function run(): void {
  console.log("=== Minimal Source Extraction Contract Patch v1 ===\n");
  const snap = snapshot();

  // T1 — explicit Length + area + zero weight
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r1",
          sourceRow: 2,
          profile: "PL31*540",
          quantity: 1,
          material: "S355",
          thicknessMm: 31,
          widthMm: 540,
          lengthMm: 540,
          sourceAreaM2: 1,
          sourceWeightKg: 0,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.lengthMm, 540, "T1 length");
    assertEq(v.rows[0]!.sourceAreaM2, 1, "T1 area");
    assertEq(v.rows[0]!.sourceWeightKg, 0, "T1 weight zero");
    console.log("✓ T1 explicit Length preservation");
  }

  // T2 — another explicit Length
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r2",
          sourceRow: 3,
          profile: "PL30*540",
          quantity: 7,
          lengthMm: 540,
          sourceAreaM2: 1,
          sourceWeightKg: 0,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.lengthMm, 540, "T2 length");
    console.log("✓ T2 another explicit Length");
  }

  // T3 — profile width is not Length; explicit Length preserved
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r3",
          sourceRow: 4,
          profile: "PL25*535",
          quantity: 4,
          thicknessMm: 25,
          widthMm: 535,
          lengthMm: 535,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.thicknessMm, 25, "T3 thickness");
    assertEq(v.rows[0]!.widthMm, 535, "T3 width");
    assertEq(v.rows[0]!.lengthMm, 535, "T3 length");
    console.log("✓ T3 profile width is not Length");
  }

  // T4 — explicit material
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r4",
          sourceRow: 2,
          material: "S355",
          lengthMm: 540,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.material, "S355", "T4 material");
    console.log("✓ T4 explicit material");
  }

  // T5 — explicit weight 1
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r5",
          sourceRow: 4,
          sourceWeightKg: 1,
          lengthMm: 535,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.sourceWeightKg, 1, "T5 weight");
    console.log("✓ T5 explicit weight");
  }

  // T6 — zero weight
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r6",
          sourceRow: 2,
          sourceWeightKg: 0,
          lengthMm: 540,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.sourceWeightKg, 0, "T6 zero weight");
    console.log("✓ T6 zero weight");
  }

  // T7 — zero area
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r7",
          sourceRow: 4,
          sourceAreaM2: 0,
          lengthMm: 535,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.sourceAreaM2, 0, "T7 zero area");
    console.log("✓ T7 zero area");
  }

  // T8 — missing → null
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({
          rowId: "r8",
          sourceRow: 10,
          material: null,
          sourceAreaM2: null,
          sourceWeightKg: null,
    dxfFileName: null,
          lengthMm: 100,
        }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows[0]!.material, null, "T8 material null");
    assertEq(v.rows[0]!.sourceAreaM2, null, "T8 area null");
    assertEq(v.rows[0]!.sourceWeightKg, null, "T8 weight null");
    console.log("✓ T8 missing value → null");
  }

  // T9 — no weight interpretation fields in schema
  {
    const shape = simpleAiRowSchema.shape;
    assert(!("sourceWeightMeaning" in shape), "T9 no meaning");
    assert(!("unitWeightKg" in shape), "T9 no unit");
    assert(!("totalWeightKg" in shape), "T9 no total");
    assert("sourceWeightKg" in shape, "T9 has sourceWeight");
    assert("sourceAreaM2" in shape, "T9 has area");
    assert(
      !SIMPLE_INTAKE_SYSTEM_PROMPT.includes("sourceWeightMeaning"),
      "T9 prompt"
    );
    assert(!SIMPLE_INTAKE_SYSTEM_PROMPT.includes("unitWeightKg"), "T9 prompt2");
    console.log("✓ T9 no weight interpretation fields");
  }

  // T10 — no calculations in extraction layer
  {
    const src = fs.readFileSync(
      path.join(process.cwd(), "features/simple-intake/validateAiResult.ts"),
      "utf8"
    );
    assert(!/sourceWeightMeaning|unitWeightKg|totalWeightKg/.test(src), "T10");
    assert(!/\*\s*quantity|\/\s*quantity/.test(src), "T10 no qty math");
    console.log("✓ T10 no calculations");
  }

  // T11 — full-sheet scan (rows after Total still considered)
  {
    assertEq(snap.sheets[0]!.lastPopulatedSourceRow, 10, "T11 last");
    assert(
      SIMPLE_INTAKE_SYSTEM_PROMPT.includes("Total row does not end"),
      "T11 prompt"
    );
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        baseAiRow({ rowId: "a", sourceRow: 2, lengthMm: 540 }),
        baseAiRow({ rowId: "b", sourceRow: 10, lengthMm: 100 }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows.length, 2, "T11 after total");
    console.log("✓ T11 full-sheet scan");
  }

  // T12 — no DXF data
  {
    const body = buildSimpleAnalyzeRequestBody(snap);
    const text = buildSimpleAnalyzeUserText(snap);
    assertEq(Object.keys(body).join(","), "snapshot", "T12 keys");
    assert(!analyzeTextContainsDxfData(text), "T12 clean");
    console.log("✓ T12 no DXF data");
  }

  // T13 — numeric DXF filenames do not influence extraction request
  {
    const text = buildSimpleAnalyzeUserText(snap);
    assert(!/1\.dxf|2\.dxf|6\.dxf|53\.dxf/i.test(text), "T13");
    console.log("✓ T13 numeric DXF filenames");
  }

  // T14 — no part ID valid
  {
    const m = matchSimpleRows({
      extractedRows: [
        extracted({ rowId: "r", partId: null, widthMm: 100, lengthMm: 200 }),
      ],
      dxfParts: [dxf({ id: "d1", partId: "X" })],
    });
    assertEq(m.resultRows.length, 1, "T14");
    console.log("✓ T14 no part ID");
  }

  // T15 — repeated rows
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "1",
      rows: [
        baseAiRow({ rowId: "r1", sourceRow: 2, lengthMm: 540 }),
        baseAiRow({ rowId: "r2", sourceRow: 3, lengthMm: 540 }),
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(v.rows.length, 2, "T15");
    console.log("✓ T15 repeated rows");
  }

  // T16 — local counts
  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "Found 99 rows",
      rows: [
        baseAiRow({ rowId: "r1", sourceRow: 2, lengthMm: 540 }),
        baseAiRow({ rowId: "r2", sourceRow: 3, lengthMm: 540 }),
      ],
      warnings: [],
    };
    const extractedRowCount = ai.rows.length;
    const v = validateSimpleAiResult({ snapshot: snap, ai });
    assertEq(extractedRowCount, 2, "T16 extracted");
    assertEq(v.rows.length, 2, "T16 validated");
    const debug = buildSimpleIntakeDebug({
      runId: "t",
      startedAt: null,
      completedAt: null,
      timing: emptyTiming(),
      workbookFileName: null,
      dxfFileNames: [],
      snapshot: snap,
      providerCallCount: 1,
      aiRawResult: ai,
      validatedRows: v.rows,
      dxfParts: [],
      resultRows: [],
      unmatchedDxfIds: [],
      error: null,
    });
    assertEq(
      (debug.rowCounts as { extractedRowCount: number }).extractedRowCount,
      2,
      "T16 debug"
    );
    assertEq(
      (debug.extractionContract as { version: string }).version,
      "minimal-source-v1",
      "T16 contract"
    );
    assertEq(
      (debug.extractionContract as { includedWeightInterpretation: boolean })
        .includedWeightInterpretation,
      false,
      "T16 no weight interp"
    );
    console.log("✓ T16 local counts");
  }

  // T17 — one AI call
  {
    const debug = buildSimpleIntakeDebug({
      runId: "t",
      startedAt: null,
      completedAt: null,
      timing: emptyTiming(),
      workbookFileName: null,
      dxfFileNames: [],
      snapshot: null,
      providerCallCount: 1,
      aiRawResult: { rows: [] },
      validatedRows: [],
      dxfParts: [],
      resultRows: [],
      unmatchedDxfIds: [],
      error: null,
    });
    assertEq((debug.providerCall as { count: number }).count, 1, "T17");
    console.log("✓ T17 one AI call");
  }

  // T18 — matching regression
  {
    const exact = matchSimpleRows({
      extractedRows: [
        extracted({ rowId: "a", partId: "A100", widthMm: 50, lengthMm: 50 }),
      ],
      dxfParts: [dxf({ id: "dx", partId: "A100", widthMm: 50, lengthMm: 50 })],
    });
    assertEq(exact.resultRows[0]!.match.method, "EXACT_ID", "T18 exact");
    const geom = matchSimpleRows({
      extractedRows: [
        extracted({
          rowId: "b",
          partId: null,
          widthMm: 100,
          lengthMm: 200,
        }),
      ],
      dxfParts: [
        dxf({ id: "g1", partId: "OTHER", widthMm: 100, lengthMm: 200 }),
      ],
    });
    assertEq(geom.resultRows[0]!.match.method, "GEOMETRY", "T18 geom");
    console.log("✓ T18 matching regression");
  }

  // Diagnostics + summary smoke
  {
    const rows = [
      extracted({
        rowId: "d1",
        sourceRow: 2,
        lengthMm: null,
        sourceWeightKg: null,
    dxfFileName: null,
        material: null,
      }),
    ];
    const diag = buildMissingExplicitFieldDiagnostics(snap, rows);
    assert(
      diag.some((d) => d.field === "lengthMm" && d.sourceText === "540"),
      "diag length"
    );
    const s = buildSourceFieldSummary([
      extracted({
        rowId: "z",
        lengthMm: 540,
        sourceAreaM2: 0,
        sourceWeightKg: 0,
        material: "S355",
        quantity: 1,
      }),
    ]);
    assertEq(s.rowsWithLength, 1, "summary length");
    assertEq(s.rowsWithZeroArea, 1, "summary zero area");
    assertEq(s.rowsWithZeroSourceWeight, 1, "summary zero wt");
    console.log("✓ diagnostics + source summary");
  }

  console.log("\n=== All minimal-source contract tests passed ===");
}

run();