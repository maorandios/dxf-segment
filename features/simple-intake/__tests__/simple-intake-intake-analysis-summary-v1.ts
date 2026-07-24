/**
 * Intake analysis summary — part-ID set comparison for initial analysis screen.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-intake-analysis-summary-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveApprovalStatus } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import {
  buildIntakeAnalysisSummary,
  buildAttentionSupportingText,
} from "../buildIntakeAnalysisSummary";
import { normalizePartIdForMatch } from "../normalizePartId";
import { filterFinalRows } from "../results/filterFinalRows";
import type { FinalIntakeRow } from "../results/types";
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
    partId: "partId" in partial ? (partial.partId ?? null) : "P1",
    profile: "PL10*100",
    description: null,
    material: "S355",
    thicknessMm: 10,
    quantity: 1,
    widthMm: 100,
    lengthMm: 200,
    dxfFileName: null,
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
  return {
    id: partial.id,
    filename: partial.filename,
    partId,
    widthMm: 100,
    lengthMm: 200,
    areaMm2: 20000,
    geometryStatus: "VALID",
    error: null,
    fingerprint: partial.contentHash ?? `hash:${partial.id}`,
    contentHash: partial.contentHash ?? `hash:${partial.id}`,
    normalizedFilenameKey: partial.filename.toLowerCase(),
  };
}

console.log("=== Intake Analysis Summary v1 (part-ID comparison) ===\n");

{
  // Identifiers extracted + matched → no missing-identifiers warning
  const rows = [
    materialRow({ rowId: "a", partId: "P1091" }),
    materialRow({ rowId: "b", partId: "P-1092" }),
  ];
  const parts = [
    dxf({ id: "d1", filename: "P1091.dxf", partId: "P1091" }),
    dxf({ id: "d2", filename: "P_1092.dxf", partId: "P_1092" }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.material.extractedIdentifierCount, 2, "extracted ids");
  assertEq(summary.comparison.matchedPartIds.length, 2, "matched via normalize");
  assertEq(summary.showMissingIdentifiersWarning, false, "no false warning");
  assertEq(summary.actionableDiscrepancyCount, 0, "no gaps");
  console.log("✓ Matched identifiers → no 'no DXF names' warning");
}

{
  // Missing via set difference, not arithmetic
  const rows = [
    materialRow({ rowId: "1", partId: "P1082" }),
    materialRow({ rowId: "2", partId: "P1087" }),
    materialRow({ rowId: "3", partId: "P1099" }),
    materialRow({ rowId: "4", partId: "P1104" }),
    materialRow({ rowId: "5", partId: "P1000" }), // present
    materialRow({ rowId: "6", partId: "P1000" }), // duplicate material ref
  ];
  const parts = [dxf({ id: "d", filename: "P1000.dxf", partId: "P1000" })];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.material.totalRows, 6, "rows");
  assertEq(summary.material.uniquePartIds.length, 5, "unique material ids");
  assertEq(summary.comparison.missingDxfPartIds.length, 4, "4 missing by set");
  assert(
    summary.comparison.missingDxfPartIds.includes("P1082"),
    "includes P1082"
  );
  assertEq(summary.comparison.extraDxfPartIds.length, 0, "no extras");
  assert(
    buildAttentionSupportingText(summary).includes("4 קבצים חסרים"),
    "supporting text"
  );
  console.log("✓ Missing DXF via normalized set difference (not 6-1)");
}

{
  // Duplicate part-id group
  const rows = [materialRow({ rowId: "a", partId: "P1091" })];
  const parts = [
    dxf({ id: "d1", filename: "P1091.dxf", partId: "P1091" }),
    dxf({ id: "d2", filename: "P1091-copy.dxf", partId: "P1091" }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.dxf.duplicateGroups.length, 1, "one dup group");
  assertEq(summary.dxf.duplicateGroups[0]!.files.length, 2, "two files");
  assertEq(summary.comparison.missingDxfPartIds.length, 0, "not missing");
  assertEq(summary.actionableDiscrepancyCount, 1, "one actionable");
  console.log("✓ Duplicate DXF group with real filenames");
}

{
  // Extra DXF
  const rows = [materialRow({ rowId: "a", partId: "P1" })];
  const parts = [
    dxf({ id: "d1", filename: "P1.dxf" }),
    dxf({ id: "d2", filename: "ORPHAN.dxf", partId: "ORPHAN" }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: parts,
    ready: true,
  });
  assertEq(summary.comparison.extraDxfPartIds.length, 1, "one extra");
  assertEq(summary.comparison.extraDxfPartIds[0], "ORPHAN", "ORPHAN");
  console.log("✓ Extra DXF detected");
}

{
  // No identifiers and no matches → warning
  const rows = [
    materialRow({ rowId: "a", partId: null }),
    materialRow({ rowId: "b", partId: "  " }),
  ];
  const summary = buildIntakeAnalysisSummary({
    materialRows: rows,
    dxfParts: [dxf({ id: "d", filename: "X.dxf", partId: "X" })],
    resultRows: [],
    ready: true,
  });
  assertEq(summary.showMissingIdentifiersWarning, true, "warning when none");
  console.log("✓ True missing-identifiers warning only when none extracted/matched");
}

{
  // Attention card never uses dash when ready with zero
  const summary = buildIntakeAnalysisSummary({
    materialRows: [materialRow({ rowId: "a", partId: "A" })],
    dxfParts: [dxf({ id: "d", filename: "A.dxf", partId: "A" })],
    ready: true,
  });
  assertEq(summary.actionableDiscrepancyCount, 0, "zero");
  assertEq(summary.ready, true, "ready");
  console.log("✓ Zero discrepancies is a real zero state");
}

{
  assertEq(normalizePartIdForMatch("P-1091"), "P-1091", "keep hyphen style");
  assertEq(normalizePartIdForMatch("P_1091"), "P-1091", "underscore→hyphen");
  assertEq(normalizePartIdForMatch("p1091"), "P1091", "case");
  console.log("✓ Normalization shared with matching");
}

{
  const rows: FinalIntakeRow[] = [
    {
      id: "1",
      status: "BLOCKED",
      reviewStatus: "BLOCKED",
      part: {
        displayName: "P1",
        displayNameSource: "SOURCE_PART_ID",
        sourcePartId: "P1",
        sourceProfile: null,
        matchedDxfId: null,
        matchedDxfPartId: null,
        matchedDxfFilename: null,
      },
      preview: { dxfId: null, geometryAvailable: false },
      material: "S355",
      thicknessMm: 10,
      quantity: 1,
      dxfDimensions: { widthMm: null, lengthMm: null },
      commercial: { areaM2: null, unitWeightKg: null, totalWeightKg: null },
      source: {
        workbookFilename: "w.xlsx",
        sheetName: "S",
        sourceRow: 1,
        sourceCell: "A1",
        sourceText: null,
        sourceWidthMm: null,
        sourceLengthMm: null,
        sourceAreaM2: null,
        sourceWeightKg: null,
      },
      issueCodes: ["NO_DXF_FOUND"],
      primaryMessage: null,
      availableActions: ["PICK_DXF"],
      isManuallyMatched: false,
      isManualMatchConfirmed: false,
      isExcluded: false,
      match: {
        status: "UNMATCHED",
        method: null,
        candidates: [],
        message: null,
      },
      sourceOrderIndex: 0,
      resultRowId: "1",
    } as FinalIntakeRow,
  ];
  assertEq(filterFinalRows(rows, "MISSING_DXF").length, 1, "missing filter");
  assertEq(filterFinalRows(rows, "DUPLICATE_DXF").length, 0, "not dup");
  console.log("✓ Table MISSING_DXF filter works");
}

{
  const root = path.resolve(__dirname, "..");
  const analysisUi = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialAnalysisSummary.tsx"),
    "utf8"
  );
  const screen = fs.readFileSync(
    path.join(root, "workflow/initialIntake/InitialIntakeSummaryScreen.tsx"),
    "utf8"
  );
  const cards = fs.readFileSync(
    path.join(root, "workflow/initialIntake/IntakeDiscrepancyCards.tsx"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  assert(analysisUi.includes("דורש טיפול"), "attention card");
  assert(!analysisUi.includes("פערים ראשוניים"), "old gaps card gone");
  assert(!analysisUi.includes("אין שמות מקור להשוואה"), "no dash message");
  assert(!screen.includes("לא נמצאו שמות קובצי DXF ברשימת החומר"), "old warning gone");
  assert(cards.includes("קובצי DXF חסרים"), "missing card");
  assert(cards.includes("הצג את הפריטים החסרים"), "missing action");
  assert(cards.includes("MISSING_DXF"), "missing opens MISSING_DXF filter");
  assert(workflow.includes("buildIntakeAnalysisSummary"), "wired");
  assert(workflow.includes("onOpenUnifiedTable"), "opens table");
  console.log("✓ UI copy and wiring");
}

console.log("\n=== Intake Analysis Summary v1 passed ===");
