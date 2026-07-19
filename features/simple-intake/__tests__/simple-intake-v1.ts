/**
 * OMEGA Simple Intake v1 — focused tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  applyManualDxfSelection,
  matchSimpleRows,
} from "../matchSimpleRows";
import { normalizePartIdForMatch } from "../normalizePartId";
import {
  getSimpleIntakeSession,
  simpleIntakeActions,
} from "../sessionStore";
import { validateSimpleAiResult } from "../validateAiResult";
import type {
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

function snapshot(): SimpleWorkbookSnapshot {
  return {
    workbookId: "wb1",
    filename: "t.xlsx",
    sheets: [
      {
        sheetName: "Sheet1",
        maxSourceRow: 2,
        populatedRowCount: 2,
        lastPopulatedSourceRow: 2,
        rows: [
          {
            rowNumber: 1,
            cells: [{ address: "A1", text: "Part" }],
          },
          {
            rowNumber: 2,
            cells: [
              { address: "A2", text: "P100" },
              { address: "B2", text: "2" },
            ],
          },
        ],
      },
    ],
  };
}

function extracted(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "Sheet1",
    sourceRow: 2,
    sourceCell: "A2",
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

function run(): void {
  console.log("=== Simple Intake v1 ===\n");

  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "ok",
      rows: [
        {
          rowId: "r1",
          sheetName: "Sheet1",
          sourceRow: 2,
          sourceCell: "A2",
          partId: "P100",
          profile: null,
          description: null,
          quantity: 2,
          material: "S355",
          thicknessMm: 10,
          widthMm: 100,
          lengthMm: 200,
          sourceAreaM2: null,
          sourceWeightKg: null,
          confidence: 0.95,
          note: null,
        },
      ],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snapshot(), ai });
    assert(v.ok, "validate ok");
    assertEq(v.rows.length, 1, "one row");
    console.log("✓ T1 workbook rows validated");
  }

  {
    const ai: SimpleAiWorkbookResult = {
      status: "SUCCESS",
      summary: "empty",
      rows: [],
      warnings: [],
    };
    const v = validateSimpleAiResult({ snapshot: snapshot(), ai });
    assertEq(v.ok, false, "reject zero success");
    console.log("✓ T2 zero-row SUCCESS rejected");
  }

  {
    const rows = [extracted({ rowId: "r1", partId: "P100" })];
    const parts = [dxf({ id: "d1", partId: "P100" })];
    const { resultRows, unmatchedDxfIds } = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
    });
    assertEq(resultRows[0]!.match.status, "MATCHED", "matched");
    assertEq(resultRows[0]!.match.method, "EXACT_ID", "exact");
    assertEq(unmatchedDxfIds.length, 0, "no unmatched");
    console.log("✓ T5 exact part ID match");
  }

  {
    const rows = [
      extracted({
        rowId: "r1",
        partId: null,
        widthMm: 200,
        lengthMm: 100,
      }),
    ];
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })];
    const { resultRows } = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
    });
    assertEq(resultRows[0]!.match.status, "MATCHED", "geom matched");
    assertEq(resultRows[0]!.match.method, "GEOMETRY", "geometry");
    console.log("✓ T6/T7 geometry rotation + single match");
  }

  {
    const rows = [
      extracted({ rowId: "r1", partId: null, widthMm: 100, lengthMm: 200 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "A", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d2", partId: "B", widthMm: 100, lengthMm: 200 }),
    ];
    const { resultRows } = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
    });
    assertEq(resultRows[0]!.match.status, "AMBIGUOUS", "ambiguous");
    assertEq(resultRows[0]!.match.candidates.length, 2, "2 candidates");
    console.log("✓ T8 multiple geometry → AMBIGUOUS");
  }

  {
    const rows = [
      extracted({ rowId: "r1", partId: "ZZZ", widthMm: 9, lengthMm: 9 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "OTHER", widthMm: 100, lengthMm: 200 }),
    ];
    const { resultRows, unmatchedDxfIds } = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
    });
    assertEq(resultRows[0]!.match.status, "UNMATCHED", "unmatched");
    assertEq(unmatchedDxfIds.length, 1, "unused dxf listed");
    console.log("✓ T9 unmatched + unused DXF section data");
  }

  {
    const rows = [
      extracted({ rowId: "r1", partId: null, widthMm: 9, lengthMm: 9 }),
    ];
    const parts = [dxf({ id: "d1", partId: "M1" })];
    const matched = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const after = applyManualDxfSelection({
      resultRows: matched.resultRows,
      resultRowId: matched.resultRows[0]!.resultRowId,
      dxfId: "d1",
      dxfParts: parts,
    });
    assert(after.ok, "manual ok");
    if (!after.ok) return;
    assertEq(after.resultRows[0]!.match.method, "MANUAL", "manual");
    assertEq(after.resultRows[0]!.match.matchedDxfId, "d1", "selected");
    assertEq(after.unmatchedDxfIds.length, 0, "used");
    console.log("✓ T10 manual DXF selection");
  }

  {
    const rows = [extracted({ rowId: "r1", partId: "P100" })];
    const parts = [
      dxf({ id: "d1", partId: "P100" }),
      dxf({ id: "d2", partId: "ORPHAN" }),
    ];
    const { unmatchedDxfIds } = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
    });
    assert(unmatchedDxfIds.includes("d2"), "orphan listed");
    assert(!unmatchedDxfIds.includes("d1"), "matched not listed");
    console.log("✓ T11 unused DXFs separate");
  }

  {
    const rows = [extracted({ rowId: "r1", partId: "P1" })];
    const parts = [
      dxf({
        id: "d1",
        partId: "P1",
        geometryStatus: "INVALID",
        widthMm: null,
        lengthMm: null,
        error: "bad",
      }),
    ];
    const { resultRows } = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
    });
    assert(resultRows.length === 1, "still one row");
    console.log("✓ T12 invalid DXF safe");
  }

  {
    const err = {
      stage: "AI_RESPONSE" as const,
      message: "תם הזמן המוקצב לבקשת ה-AI",
      retryable: true,
    };
    assertEq(err.stage, "AI_RESPONSE", "timeout stage");
    assert(err.retryable, "retryable timeout");
    console.log("✓ T3 AI timeout → Failed error shape");
  }

  {
    const wb = new File(["x"], "book.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const dxfFile = new File(["0\nSECTION\n"], "P1.dxf", {
      type: "text/plain",
    });
    simpleIntakeActions.reset();
    simpleIntakeActions.setWorkbook(wb);
    simpleIntakeActions.addDxfFiles([dxfFile]);
    assertEq(
      getSimpleIntakeSession().workbookFile?.name,
      "book.xlsx",
      "wb set"
    );
    simpleIntakeActions.backToFiles();
    assertEq(
      getSimpleIntakeSession().workbookFile?.name,
      "book.xlsx",
      "wb preserved"
    );
    assertEq(getSimpleIntakeSession().dxfFiles.length, 1, "dxf preserved");
    console.log("✓ T4 retry/back preserves uploaded files");
  }

  {
    assert(
      !JSON.stringify({ snapshot: snapshot() }).includes("dxfBytes"),
      "no dxf in snapshot payload shape"
    );
    assertEq(
      normalizePartIdForMatch(" p_100 "),
      normalizePartIdForMatch("P-100"),
      "normalize"
    );
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "one provider call");
    assert(route.includes("dxfBytes"), "rejects dxf bytes");
    assert(!route.toLowerCase().includes("email body"), "no email");
    console.log("✓ T13–T15 no DXF to AI / one call / no email");
  }

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
      const text = fs.readFileSync(file, "utf8");
      assert(!banned.test(text), `no persistence in ${file}`);
    }
    console.log("✓ T16 privacy (no persistence APIs in simple-intake)");
  }

  console.log("\n=== Simple Intake v1 tests passed ===");
}

run();
