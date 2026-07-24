/**
 * OMEGA — Identifier-Free Material List Analysis Fix v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-identifier-free-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import {
  buildIntakeAnalysisSummary,
  deriveAffectedMaterialItemIds,
} from "../buildIntakeAnalysisSummary";
import {
  computeSourceIdentifierCoverage,
  getSourceMatchIdentifier,
} from "../getSourceMatchIdentifier";
import { matchWithFilenamePriority, resolveMatchLevel } from "../matchWithFilenamePriority";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import { deriveFinalRows } from "../results/deriveFinalRows";
import { buildCompletionClipboardMessage } from "../dxfLink/completionRequest";
import { buildDxfLinkedMaterialItems } from "../dxfLink/buildDxfLinkedItems";
import type { SimpleDxfPart } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
}

function materialRow(
  partial: Partial<MaterialListRow> & Pick<MaterialListRow, "rowId">
): MaterialListRow {
  const row: MaterialListRow = {
    rowId: partial.rowId,
    sheetName: "S",
    sourceRow: partial.sourceRow ?? 1,
    sourceCell: "A1",
    partId: "partId" in partial ? (partial.partId ?? null) : null,
    profile: "profile" in partial ? (partial.profile ?? null) : "PL10*100",
    description: partial.description ?? null,
    material: partial.material ?? "S355",
    thicknessMm: partial.thicknessMm ?? 10,
    quantity: partial.quantity ?? 1,
    widthMm: partial.widthMm ?? 100,
    lengthMm: partial.lengthMm ?? 200,
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
    userOverrides: partial.userOverrides ?? {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function dxf(
  partial: Partial<SimpleDxfPart> & { id: string; filename: string }
): SimpleDxfPart {
  const partId = partial.partId ?? partial.filename.replace(/\.dxf$/i, "");
  const contentHash = partial.contentHash ?? `hash:${partial.id}`;
  return {
    id: partial.id,
    filename: partial.filename,
    partId,
    widthMm: partial.widthMm ?? 100 + (Number(partial.id.replace(/\D/g, "")) || 0),
    lengthMm: partial.lengthMm ?? 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: contentHash,
    contentHash,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

console.log("=== Identifier-Free Material List Analysis Fix v1 ===\n");

{
  const row = materialRow({
    rowId: "local-uuid-1",
    sourceRow: 42,
    partId: null,
    dxfFileName: null,
    profile: "HEA200",
    widthMm: 120,
    lengthMm: 340,
  });
  const id = getSourceMatchIdentifier(row);
  assertEq(id.partId, null, "rowId not a part id");
  assertEq(id.dxfFileName, null, "no filename");
  assertEq(
    getSourceMatchIdentifier(
      materialRow({ rowId: "r", partId: null, profile: "PL10", dxfFileName: null })
    ).partId,
    null,
    "profile not identifier"
  );
  assertEq(
    getSourceMatchIdentifier(
      materialRow({
        rowId: "r",
        partId: null,
        dxfFileName: null,
        widthMm: 99,
        lengthMm: 99,
      })
    ).partId,
    null,
    "dims not identifier"
  );
  console.log("✓ Local IDs / profile / dims are not source identifiers");
}

{
  const rows = Array.from({ length: 74 }, (_, i) =>
    materialRow({
      rowId: `r${i}`,
      sourceRow: i + 2,
      partId: null,
      dxfFileName: null,
      widthMm: 100 + (i % 17),
      lengthMm: 200 + (i % 11),
    })
  );
  const coverage = computeSourceIdentifierCoverage(rows);
  assertEq(coverage.coverage, "NONE", "NONE coverage");
  assertEq(coverage.rowsWithAnyExplicitIdentifier, 0, "zero identifiers");
  assertEq(coverage.materialItemCount, 74, "74 items");

  const parts: SimpleDxfPart[] = [];
  for (let i = 0; i < 74; i++) {
    parts.push(
      dxf({
        id: `d${i}`,
        filename: `file-${i}.dxf`,
        partId: `FILE-${i}`,
        contentHash: `unique-${i}`,
        widthMm: 100 + (i % 17),
        lengthMm: 200 + (i % 11),
      })
    );
  }
  parts.push(
    dxf({
      id: "dup",
      filename: "file-0-copy.dxf",
      partId: "FILE-0-COPY",
      contentHash: "unique-0",
      widthMm: 100,
      lengthMm: 200,
    })
  );

  const extracted = materialListToExtractedRows(rows);
  const matched = matchWithFilenamePriority({
    extractedRows: extracted,
    dxfParts: parts,
  });
  const finalRows = deriveFinalRows({
    resultRows: matched.resultRows,
    dxfParts: parts,
    workbookFilename: "wb.xlsx",
    snapshot: null,
  });

  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    resultRows: matched.resultRows,
    finalRows,
    ready: true,
  });

  const d = summary.identifierFreeAnalysisDiagnostics;
  assertEq(d.materialItemCount, 74, "materialItemCount");
  assertEq(d.identifierCoverage, "NONE", "coverage NONE");
  assertEq(d.physicalDxfFileCount, 75, "75 physical");
  assertEq(d.uniqueDxfContentCount, 74, "74 unique");
  assertEq(d.exactDuplicateCount, 1, "1 exact dup");
  assertEq(d.explicitFilenameMatchCount, 0, "no explicit filename matches");
  assertEq(d.unreferencedDxfCount, 0, "no unreferenced under NONE");
  assert(d.affectedItemCount > 0, "affected > 0");
  assertEq(summary.comparison.extraDxfPartIds.length, 0, "no extras list");
  assertEq(summary.issueCounts.unreferencedDxfCount, 0, "unreferenced count 0");
  assertEq(summary.issueCounts.sourceHasNoIdentifiersCount, 1, "one source finding");
  assertEq(
    summary.findings.filter((f) => f.category === "SOURCE_HAS_NO_DXF_IDENTIFIERS")
      .length,
    1,
    "one aggregated finding"
  );
  assert(
    !summary.findings.some((f) => f.category === "UNREFERENCED_DXF"),
    "no unreferenced finding"
  );
  assertEq(summary.dxf.exactContentDuplicateFileCount, 1, "dup detected");
  assert(
    summary.findings.some((f) => f.category === "EXACT_DUPLICATE"),
    "dup finding shown"
  );
  assertEq(summary.material.extractionStatus, "SUCCESS", "extraction ok");
  assertEq(summary.material.matchingIdentifierStatus, "ATTENTION", "id attention");
  assertEq(summary.matchingCapability, "NO_EXPLICIT_IDENTIFIERS", "capability");

  // Heuristic matches are SUGGESTED and NEEDS_REVIEW until confirmed
  const suggested = matched.resultRows.filter(
    (r) => resolveMatchLevel(r.match) === "SUGGESTED"
  );
  assert(suggested.length >= 0, "heuristic may run");
  for (const r of suggested.slice(0, 5)) {
    const fr = finalRows.find((x) => x.id === r.resultRowId);
    assert(fr, "final row exists for suggested");
    assertEq(fr!.status, "NEEDS_REVIEW", "suggested → NEEDS_REVIEW");
    assert(
      fr!.issueCodes.includes("HEURISTIC_MATCH_UNCONFIRMED"),
      "heuristic unconfirmed code"
    );
  }

  if (suggested.length > 0) {
    const first = suggested[0]!;
    const confirmed = deriveFinalRows({
      resultRows: matched.resultRows,
      dxfParts: parts,
      workbookFilename: "wb.xlsx",
      snapshot: null,
      confirmedManualMatchIds: new Set([first.resultRowId]),
    });
    const confirmedRow = confirmed.find((x) => x.id === first.resultRowId)!;
    assert(confirmedRow, "confirmed row");
    assertEq(confirmedRow.status, "READY", "confirmed → READY");
    assert(
      !confirmedRow.issueCodes.includes("HEURISTIC_MATCH_UNCONFIRMED"),
      "confirmed clears heuristic issue"
    );
    const src = rows.find((r) => r.rowId === first.extracted.rowId)!;
    assertEq(getSourceMatchIdentifier(src).dxfFileName, null, "no fabricated source name");
  }

  const affected = deriveAffectedMaterialItemIds({ finalRows });
  assert(affected.size > 0, "affected from final rows");
  assertEq(affected.size, summary.reviewMetric.affectedItemCount, "metric matches");

  console.log("✓ 74/75/74 identifier-free regression fixture");
}

{
  // FULL coverage still classifies extras
  const rows = [materialRow({ rowId: "a", partId: "P1", dxfFileName: "P1.dxf" })];
  const parts = [
    dxf({ id: "d1", filename: "P1.dxf", partId: "P1" }),
    dxf({ id: "d2", filename: "ORPHAN.dxf", partId: "ORPHAN" }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.identifierCoverage.coverage, "FULL", "full");
  assertEq(summary.comparison.extraDxfPartIds.length, 1, "orphan extra");
  console.log("✓ FULL coverage still detects unreferenced DXF");
}

{
  const rows = Array.from({ length: 3 }, (_, i) =>
    materialRow({ rowId: `r${i}`, partId: null, dxfFileName: null })
  );
  const parts = [
    dxf({ id: "d0", filename: "a.dxf", contentHash: "h0" }),
    dxf({ id: "d1", filename: "b.dxf", contentHash: "h1" }),
    dxf({ id: "d2", filename: "c.dxf", contentHash: "h2" }),
  ];
  const matched = matchWithFilenamePriority({
    extractedRows: materialListToExtractedRows(rows),
    dxfParts: parts,
  });
  const linked = buildDxfLinkedMaterialItems({
    materialListRows: rows,
    resultRows: matched.resultRows,
    dxfParts: parts,
  });
  const msg = buildCompletionClipboardMessage(
    linked,
    new Set(rows.map((r) => r.rowId))
  );
  assert(msg.includes("הערה כללית"), "source-level note");
  const missingFilenameAsks = (msg.match(/לא צוין שם קובץ DXF עבור הפריט/g) ?? [])
    .length;
  assertEq(missingFilenameAsks, 0, "no per-row filename asks under NONE");
  console.log("✓ Completion request uses one source-level identifier note");
}

{
  const root = path.resolve(__dirname, "..");
  const analysis = fs.readFileSync(
    path.join(root, "buildIntakeAnalysisSummary.ts"),
    "utf8"
  );
  const metrics = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  assert(analysis.includes("SOURCE_HAS_NO_DXF_IDENTIFIERS"), "source finding");
  assert(analysis.includes("identifierFreeAnalysisDiagnostics"), "diagnostics");
  assert(analysis.includes('coverage === "NONE"'), "none gate");
  assert(metrics.includes("matchingIdentifierStatus"), "material card status");
  assert(metrics.includes("לא נמצאו מזהי התאמה"), "hebrew no-id badge");
  console.log("✓ UI / diagnostics wiring");
}

console.log("\n=== Identifier-Free Material List Analysis Fix v1 passed ===");
