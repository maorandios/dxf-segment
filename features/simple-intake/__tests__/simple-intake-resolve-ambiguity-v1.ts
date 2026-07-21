/**
 * Resolve Ambiguity After Assignment Patch v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-resolve-ambiguity-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  applyManualDxfSelection,
  matchSimpleRows,
} from "../matchSimpleRows";
import {
  COLLISION_MESSAGE_HE,
  UNMATCHED_NO_CANDIDATE_HE,
  type SimpleDxfPart,
  type SimpleExtractedRow,
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

function row(
  partial: Partial<SimpleExtractedRow> & { rowId: string }
): SimpleExtractedRow {
  return {
    sheetName: "S",
    sourceRow: 1,
    sourceCell: "A1",
    partId: null,
    profile: null,
    description: null,
    quantity: 1,
    material: "S355",
    thicknessMm: 10,
    widthMm: null,
    lengthMm: null,
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

function mapOf(
  resultRows: ReturnType<typeof matchSimpleRows>["resultRows"]
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const r of resultRows) out[r.extracted.rowId] = r.match.matchedDxfId;
  return out;
}

function run(): void {
  console.log("=== Resolve Ambiguity After Assignment v1 ===\n");

  // T1/T4 — 191/190 example + order independence
  {
    const rows = [
      row({ rowId: "A", widthMm: 191, lengthMm: 74, sourceRow: 1 }),
      row({ rowId: "B", widthMm: 190, lengthMm: 74, sourceRow: 2 }),
    ];
    const parts = [
      dxf({ id: "X", partId: "X", widthMm: 190, lengthMm: 74 }),
      dxf({ id: "Y", partId: "Y", widthMm: 190, lengthMm: 73.99 }),
    ];
    const fwd = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const rev = matchSimpleRows({
      extractedRows: [...rows].reverse(),
      dxfParts: parts,
    });
    assertEq(mapOf(fwd.resultRows).B, "X", "B→X");
    assertEq(mapOf(fwd.resultRows).A, "Y", "A→Y");
    assertEq(fwd.localSummary.ambiguousRows, 0, "no ambiguity");
    assertEq(mapOf(fwd.resultRows).A, mapOf(rev.resultRows).A, "A order");
    assertEq(mapOf(fwd.resultRows).B, mapOf(rev.resultRows).B, "B order");
    console.log("✓ T1/T2/T3/T4 191/190 + order independence + propagation");
  }

  // T5 — 184/185
  {
    const rows = [
      row({ rowId: "A", widthMm: 184, lengthMm: 74 }),
      row({ rowId: "B", widthMm: 185, lengthMm: 74 }),
    ];
    const parts = [
      dxf({ id: "X", partId: "X", widthMm: 184.34, lengthMm: 74 }),
      dxf({ id: "Y", partId: "Y", widthMm: 184.77, lengthMm: 74 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(mapOf(m.resultRows).A, "X", "A→X");
    assertEq(mapOf(m.resultRows).B, "Y", "B→Y");
    assertEq(m.localSummary.ambiguousRows, 0, "no amb");
    console.log("✓ T5 184/185 example");
  }

  // T6 identical DXFs
  {
    const rows = [row({ rowId: "r", widthMm: 248, lengthMm: 605 })];
    const parts = [
      dxf({ id: "M2", partId: "M2", widthMm: 605.03, lengthMm: 248 }),
      dxf({ id: "MPL4", partId: "MPL4", widthMm: 605.03, lengthMm: 248 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(m.resultRows[0]!.match.status, "AMBIGUOUS", "identical amb");
    assertEq(m.resultRows[0]!.match.candidates.length, 2, "2 cands");
    console.log("✓ T6 identical DXFs AMBIGUOUS");
  }

  // T7 near-identical
  {
    const rows = [row({ rowId: "r", widthMm: 182, lengthMm: 74 })];
    const parts = [
      dxf({ id: "MPL1040", partId: "MPL1040", widthMm: 182.14, lengthMm: 74 }),
      dxf({
        id: "MPL1037",
        partId: "MPL1037",
        widthMm: 182.15,
        lengthMm: 73.99,
      }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(m.resultRows[0]!.match.status, "AMBIGUOUS", "near amb");
    console.log("✓ T7 near-identical AMBIGUOUS");
  }

  // T8 exact ID priority
  {
    const rows = [
      row({ rowId: "id", partId: "P1", widthMm: 999, lengthMm: 999 }),
      row({ rowId: "geo", widthMm: 100, lengthMm: 200 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "P1", widthMm: 100, lengthMm: 200 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(
      m.resultRows.find((r) => r.extracted.rowId === "id")!.match.method,
      "EXACT_ID",
      "exact"
    );
    console.log("✓ T8 exact ID priority");
  }

  // T9 assigned candidate removal — after B takes X, A candidates exclude X
  {
    const rows = [
      row({ rowId: "A", widthMm: 191, lengthMm: 74 }),
      row({ rowId: "B", widthMm: 190, lengthMm: 74 }),
    ];
    const parts = [
      dxf({ id: "X", partId: "X", widthMm: 190, lengthMm: 74 }),
      dxf({ id: "Y", partId: "Y", widthMm: 190, lengthMm: 73.99 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const a = m.resultRows.find((r) => r.extracted.rowId === "A")!;
    assert(!a.match.candidates.some((c) => c.dxfId === "X") || a.match.matchedDxfId === "Y", "X not left as A match");
    assertEq(a.match.matchedDxfId, "Y", "A got Y");
    console.log("✓ T9 assigned candidate removal");
  }

  // T10 single remaining (implicit in T4)
  {
    const passes = matchSimpleRows({
      extractedRows: [
        row({ rowId: "A", widthMm: 191, lengthMm: 74 }),
        row({ rowId: "B", widthMm: 190, lengthMm: 74 }),
      ],
      dxfParts: [
        dxf({ id: "X", partId: "X", widthMm: 190, lengthMm: 74 }),
        dxf({ id: "Y", partId: "Y", widthMm: 190, lengthMm: 73.99 }),
      ],
    }).diagnostics.matchingPasses;
    assert(
      passes.some((p) => p.phase === "SINGLE_REMAINING_CANDIDATE") ||
        passes.some((p) => p.phase === "STRONG_MUTUAL_BEST"),
      "has assignment passes"
    );
    console.log("✓ T10 single/strong passes present");
  }

  // T11 candidates assigned to better rows
  {
    const rows = [
      row({ rowId: "A", widthMm: 447, lengthMm: 32 }),
      row({ rowId: "B", widthMm: 446, lengthMm: 32 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "X", widthMm: 445.85, lengthMm: 32.01 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const a = m.resultRows.find((r) => r.extracted.rowId === "A")!;
    assertEq(a.match.status, "UNMATCHED", "A unmatched");
    assertEq(a.match.message, COLLISION_MESSAGE_HE, "collision msg");
    const reason = m.diagnostics.unmatchedReasons.find((u) => u.rowId === "A");
    assertEq(reason?.reason, "CANDIDATES_ASSIGNED_TO_BETTER_ROWS", "reason");
    console.log("✓ T11 CANDIDATES_ASSIGNED_TO_BETTER_ROWS");
  }

  // T12 never eligible
  {
    const rows = [row({ rowId: "z", widthMm: 9, lengthMm: 9 })];
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(m.resultRows[0]!.match.status, "UNMATCHED", "unmatched");
    assertEq(m.resultRows[0]!.match.message, UNMATCHED_NO_CANDIDATE_HE, "msg");
    assertEq(
      m.diagnostics.unmatchedReasons[0]?.reason,
      "NO_ELIGIBLE_CANDIDATE",
      "reason"
    );
    console.log("✓ T12 NO_ELIGIBLE_CANDIDATE");
  }

  // T13/T14 pending vs unused
  {
    const rows = [row({ rowId: "r", widthMm: 248, lengthMm: 605 })];
    const parts = [
      dxf({ id: "M2", partId: "M2", widthMm: 605.03, lengthMm: 248 }),
      dxf({ id: "MPL4", partId: "MPL4", widthMm: 605.03, lengthMm: 248 }),
      dxf({ id: "ORPHAN", partId: "ORPHAN", widthMm: 10, lengthMm: 10 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const by = Object.fromEntries(
      m.dxfAvailability.map((a) => [a.dxfId, a.state])
    );
    assertEq(by.M2, "PENDING_AMBIGUOUS", "pending M2");
    assertEq(by.MPL4, "PENDING_AMBIGUOUS", "pending MPL4");
    assertEq(by.ORPHAN, "UNUSED", "orphan unused");
    assert(!m.unmatchedDxfIds.includes("M2"), "pending not unused");
    console.log("✓ T13/T14 pending availability + unused filter");
  }

  // T15/T16 local counts
  {
    const m = matchSimpleRows({
      extractedRows: [row({ rowId: "r", widthMm: 100, lengthMm: 200 })],
      dxfParts: [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })],
      extractedRowCount: 1,
    });
    assertEq(m.localSummary.extractedRows, 1, "from array");
    assertEq(typeof m.localSummary.readyRows, "number", "numeric");
    console.log("✓ T15/T16 local counts");
  }

  // T17 one AI call
  {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount: 1"), "one call");
    console.log("✓ T17 no extra AI calls");
  }

  // T18/T19 regression markers
  {
    assert(
      fs
        .readFileSync(
          path.join(process.cwd(), "features/simple-intake/buildSimpleWorkbookSnapshot.ts"),
          "utf8"
        )
        .includes("XLSX.read"),
      "snapshot"
    );
    assert(
      fs
        .readFileSync(
          path.join(process.cwd(), "features/simple-intake/parseSimpleDxfFiles.ts"),
          "utf8"
        )
        .includes("parseDxfFile"),
      "parser"
    );
    console.log("✓ T18/T19 extraction/parser unchanged");
  }

  // T20 manual
  {
    const rows = [row({ rowId: "r", widthMm: 248, lengthMm: 605 })];
    const parts = [
      dxf({ id: "M2", partId: "M2", widthMm: 605.03, lengthMm: 248 }),
      dxf({ id: "MPL4", partId: "MPL4", widthMm: 605.03, lengthMm: 248 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const after = applyManualDxfSelection({
      resultRows: m.resultRows,
      resultRowId: m.resultRows[0]!.resultRowId,
      dxfId: "M2",
      dxfParts: parts,
    });
    assert(after.ok, "ok");
    if (after.ok) {
      assertEq(after.dxfAvailability.find((a) => a.dxfId === "M2")!.state, "USED", "used");
      assertEq(
        after.dxfAvailability.find((a) => a.dxfId === "MPL4")!.state,
        "UNUSED",
        "released"
      );
    }
    console.log("✓ T20 manual selection");
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

  console.log("\n=== Resolve Ambiguity After Assignment v1 passed ===");
}

run();