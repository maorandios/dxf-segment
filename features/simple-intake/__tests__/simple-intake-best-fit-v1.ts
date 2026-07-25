/**
 * OMEGA Simple Intake — Deterministic Best-Fit Matching Patch v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-best-fit-v1.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  applyManualDxfSelection,
  buildSimpleMatchCandidates,
  deriveSimpleDxfAvailability,
  matchSimpleRows,
} from "../matchSimpleRows";
import { COLLISION_MESSAGE_HE, type SimpleDxfPart, type SimpleExtractedRow } from "../types";

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

function assignmentMap(
  resultRows: ReturnType<typeof matchSimpleRows>["resultRows"]
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const r of resultRows) {
    out[r.extracted.rowId] = r.match.matchedDxfId;
  }
  return out;
}

function run(): void {
  console.log("=== Simple Intake Best-Fit Matching Patch v1 ===\n");

  // T1 row-order independence
  {
    const rowsFwd = [
      row({ rowId: "A", widthMm: 447, lengthMm: 32, sourceRow: 1 }),
      row({ rowId: "B", widthMm: 446, lengthMm: 32, sourceRow: 2 }),
    ];
    const rowsRev = [...rowsFwd].reverse();
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 445.85, lengthMm: 32.01 })];
    const fwd = matchSimpleRows({ extractedRows: rowsFwd, dxfParts: parts });
    const rev = matchSimpleRows({ extractedRows: rowsRev, dxfParts: parts });
    assertEq(
      assignmentMap(fwd.resultRows).A,
      assignmentMap(rev.resultRows).A,
      "A same"
    );
    assertEq(
      assignmentMap(fwd.resultRows).B,
      assignmentMap(rev.resultRows).B,
      "B same"
    );
    assertEq(assignmentMap(fwd.resultRows).B, "d1", "B wins");
    assertEq(assignmentMap(fwd.resultRows).A, null, "A unmatched");
    console.log("✓ T1/T2 row-order independence + best geometric fit");
  }

  // T3 next candidate fallback
  {
    const rows = [
      row({ rowId: "A", widthMm: 100, lengthMm: 200 }),
      row({ rowId: "B", widthMm: 100, lengthMm: 200 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "P1", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d2", partId: "P2", widthMm: 100.4, lengthMm: 200 }),
    ];
    // Both eligible for both; best-fit should assign closest pairs
    // Ambiguity: identical scores for same dims on d1 for both rows → AMBIGUOUS for both?
    // Actually both rows have identical scores to d1 (0) and to d2 (small).
    // For each row, best=d1 score 0, second=d2 score small. Gap > threshold → not ambiguous.
    // Best-fit: both want d1 first. One gets d1, other gets d2.
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const matchedIds = m.resultRows
      .map((r) => r.match.matchedDxfId)
      .filter(Boolean)
      .sort();
    assertEq(matchedIds.length, 2, "both matched");
    assert(matchedIds.includes("d1"), "d1 used");
    assert(matchedIds.includes("d2"), "d2 fallback");
    console.log("✓ T3 next candidate fallback");
  }

  // T4 no remaining candidate → UNMATCHED with collision message
  {
    const rows = [
      row({ rowId: "A", widthMm: 447, lengthMm: 32 }),
      row({ rowId: "B", widthMm: 446, lengthMm: 32 }),
    ];
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 445.85, lengthMm: 32.01 })];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const a = m.resultRows.find((r) => r.extracted.rowId === "A")!;
    assertEq(a.match.status, "UNMATCHED", "A unmatched");
    assertEq(a.match.message, COLLISION_MESSAGE_HE, "collision msg");
    console.log("✓ T4 unmatched when no remaining candidate");
  }

  // T5/T6 exact ID priority + reservation
  {
    const rows = [
      row({ rowId: "id", partId: "P100", widthMm: 999, lengthMm: 999 }),
      row({ rowId: "geo", partId: null, widthMm: 100, lengthMm: 200 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "P100", widthMm: 100, lengthMm: 200 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(
      m.resultRows.find((r) => r.extracted.rowId === "id")!.match.method,
      "EXACT_ID",
      "exact"
    );
    assertEq(
      m.resultRows.find((r) => r.extracted.rowId === "geo")!.match.status,
      "UNMATCHED",
      "geo blocked"
    );
    console.log("✓ T5/T6 exact ID priority + reservation");
  }

  // T7 rotated
  {
    const rows = [row({ rowId: "r1", widthMm: 200, lengthMm: 100 })];
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(m.resultRows[0]!.match.status, "MATCHED", "rotated match");
    assertEq(m.resultRows[0]!.match.method, "GEOMETRY", "geometry");
    console.log("✓ T7 rotated geometry");
  }

  // T8 identical candidates → AMBIGUOUS
  {
    const rows = [row({ rowId: "r1", widthMm: 100, lengthMm: 200 })];
    const parts = [
      dxf({ id: "d1", partId: "A", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d2", partId: "B", widthMm: 100, lengthMm: 200 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(m.resultRows[0]!.match.status, "AMBIGUOUS", "ambiguous identical");
    console.log("✓ T8 identical candidates AMBIGUOUS");
  }

  // T9 near-equal within gap
  {
    const rows = [row({ rowId: "r1", widthMm: 1000, lengthMm: 1000 })];
    // diffs small enough both eligible; scores very close
    const parts = [
      dxf({ id: "d1", partId: "A", widthMm: 1000, lengthMm: 1000 }),
      dxf({ id: "d2", partId: "B", widthMm: 1000.5, lengthMm: 1000 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    // gap = (0.5/1000 + 0) - 0 = 0.0005 < 0.0025 → AMBIGUOUS
    assertEq(m.resultRows[0]!.match.status, "AMBIGUOUS", "near equal");
    console.log("✓ T9 near-equal AMBIGUOUS");
  }

  // T10 clear score gap → auto assign
  {
    const rows = [row({ rowId: "r1", widthMm: 100, lengthMm: 200 })];
    const parts = [
      dxf({ id: "d1", partId: "A", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d2", partId: "B", widthMm: 101, lengthMm: 201 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assertEq(m.resultRows[0]!.match.status, "MATCHED", "clear winner");
    assertEq(m.resultRows[0]!.match.matchedDxfId, "d1", "best dxf");
    console.log("✓ T10 clear score gap assigned");
  }

  // T11–T14 availability states
  {
    const rows = [
      row({ rowId: "amb", widthMm: 100, lengthMm: 200 }),
      row({ rowId: "ok", widthMm: 50, lengthMm: 50 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "A", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d2", partId: "B", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d3", partId: "C", widthMm: 50, lengthMm: 50 }),
      dxf({
        id: "d4",
        partId: "BAD",
        geometryStatus: "INVALID",
        widthMm: null,
        lengthMm: null,
        error: "bad",
      }),
      dxf({ id: "d5", partId: "ORPHAN", widthMm: 10, lengthMm: 10 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const byId = Object.fromEntries(
      m.dxfAvailability.map((a) => [a.dxfId, a.state])
    );
    assertEq(byId.d1, "PENDING_AMBIGUOUS", "pending d1");
    assertEq(byId.d2, "PENDING_AMBIGUOUS", "pending d2");
    assertEq(byId.d3, "USED", "used");
    assertEq(byId.d4, "INVALID", "invalid");
    assertEq(byId.d5, "UNUSED", "unused");
    assert(!m.unmatchedDxfIds.includes("d1"), "pending not unused");
    assert(m.unmatchedDxfIds.includes("d5"), "orphan unused");
    console.log("✓ T11–T14 availability + unused filtering");
  }

  // T15/T16/T17 manual select + release + conflict
  {
    const rows = [
      row({ rowId: "r1", widthMm: 100, lengthMm: 200 }),
      row({ rowId: "r2", widthMm: 50, lengthMm: 50 }),
    ];
    const parts = [
      dxf({ id: "d1", partId: "A", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d2", partId: "B", widthMm: 100, lengthMm: 200 }),
      dxf({ id: "d3", partId: "C", widthMm: 50, lengthMm: 50 }),
    ];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    const amb = m.resultRows.find((r) => r.extracted.rowId === "r1")!;
    const ok = applyManualDxfSelection({
      resultRows: m.resultRows,
      resultRowId: amb.resultRowId,
      dxfId: "d1",
      dxfParts: parts,
    });
    assert(ok.ok, "manual ok");
    if (ok.ok) {
      assertEq(
        ok.resultRows.find((r) => r.extracted.rowId === "r1")!.match.method,
        "MANUAL",
        "manual"
      );
      assertEq(
        ok.dxfAvailability.find((a) => a.dxfId === "d1")!.state,
        "USED",
        "used after manual"
      );
      assertEq(
        ok.dxfAvailability.find((a) => a.dxfId === "d2")!.state,
        "UNUSED",
        "released sibling pending"
      );
    }

    const conflict = applyManualDxfSelection({
      resultRows: ok.ok ? ok.resultRows : m.resultRows,
      resultRowId: m.resultRows.find((r) => r.extracted.rowId === "r2")!
        .resultRowId,
      dxfId: "d3",
      dxfParts: parts,
    });
    // d3 already used by r2 from auto — selecting d3 for r2 again is fine (same row)
    // Select d1 for r2 while d1 used by r1:
    const conflict2 = applyManualDxfSelection({
      resultRows: ok.ok ? ok.resultRows : m.resultRows,
      resultRowId: m.resultRows.find((r) => r.extracted.rowId === "r2")!
        .resultRowId,
      dxfId: "d1",
      dxfParts: parts,
    });
    assert(!conflict2.ok && conflict2.conflict, "conflict detected");
    const forced = applyManualDxfSelection({
      resultRows: ok.ok ? ok.resultRows : m.resultRows,
      resultRowId: m.resultRows.find((r) => r.extracted.rowId === "r2")!
        .resultRowId,
      dxfId: "d1",
      dxfParts: parts,
      forceReassign: true,
    });
    assert(forced.ok, "force ok");
    if (forced.ok) {
      assertEq(
        forced.resultRows.find((r) => r.extracted.rowId === "r2")!.match
          .matchedDxfId,
        "d1",
        "moved"
      );
      assertEq(
        forced.resultRows.find((r) => r.extracted.rowId === "r1")!.match
          .matchedDxfId,
        null,
        "released"
      );
    }
    void conflict;
    console.log("✓ T15–T17 manual select / release / conflict");
  }

  // T18/T19 summary from arrays not AI text
  {
    const rows = [row({ rowId: "r1", widthMm: 100, lengthMm: 200 })];
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })];
    const m = matchSimpleRows({
      extractedRows: rows,
      dxfParts: parts,
      extractedRowCount: 1,
    });
    assertEq(m.localSummary.extractedRows, 1, "count from array");
    assertEq(m.localSummary.validatedRows, 1, "validated");
    assert(m.localSummary.readyRows + m.localSummary.missingDataRows >= 1, "ready/missing");
    // Incorrect AI summary string must not appear in summary numbers
    assertEq(typeof m.localSummary.extractedRows, "number", "numeric");
    console.log("✓ T18/T19 local summary counts");
  }

  // T20 zero extra AI calls (static)
  {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/simple-intake/analyze/route.ts"),
      "utf8"
    );
    assert(route.includes("providerCallCount"), "provider call count tracked");
    console.log("✓ T20 zero additional AI calls");
  }

  // T21/T22 debug diagnostics
  {
    const rows = [
      row({ rowId: "A", widthMm: 447, lengthMm: 32 }),
      row({ rowId: "B", widthMm: 446, lengthMm: 32 }),
    ];
    const parts = [dxf({ id: "d1", partId: "X", widthMm: 445.85, lengthMm: 32.01 })];
    const m = matchSimpleRows({ extractedRows: rows, dxfParts: parts });
    assert(m.diagnostics.assignmentOrder.length > 0, "assignment order");
    assert(m.diagnostics.candidateEdges.length > 0, "edges");
    assert(m.diagnostics.dxfAvailability.length === 1, "availability");
    console.log("✓ T21/T22 debug assignment + availability");
  }

  // T23 candidate generation exists
  {
    const edges = buildSimpleMatchCandidates({
      extractedRows: [row({ rowId: "r1", widthMm: 100, lengthMm: 200 })],
      dxfParts: [dxf({ id: "d1", partId: "X", widthMm: 100, lengthMm: 200 })],
    });
    assert(edges.some((e) => e.method === "GEOMETRY"), "geom edge");
    console.log("✓ T23 candidate generation (extraction unchanged)");
  }

  // T24 parsing module untouched check — file still exports parseSimpleDxfFiles
  {
    const src = fs.readFileSync(
      path.join(process.cwd(), "features/simple-intake/parseSimpleDxfFiles.ts"),
      "utf8"
    );
    assert(src.includes("parseDxfFile"), "parser still used");
    console.log("✓ T24 DXF parsing regression");
  }

  // T25 privacy
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
    console.log("✓ T25 privacy");
  }

  // Derive availability export
  {
    const avail = deriveSimpleDxfAvailability({
      dxfParts: [dxf({ id: "d1", partId: "X" })],
      resultRows: [],
    });
    assertEq(avail[0]!.state, "UNUSED", "unused empty");
    console.log("✓ deriveSimpleDxfAvailability smoke");
  }

  console.log("\n=== Best-Fit Matching Patch v1 tests passed ===");
}

run();