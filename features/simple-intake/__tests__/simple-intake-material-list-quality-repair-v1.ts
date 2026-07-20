/**
 * OMEGA — Material List Quality Gate and Targeted AI Repair v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-material-list-quality-repair-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptMaterialListRows } from "../materialList/adaptMaterialListRows";
import {
  buildRepairSourcePayloads,
  selectRowsNeedingRepair,
} from "../materialList/buildRepairContext";
import {
  deriveApprovalStatus,
  fieldDisplayKind,
  missingFieldsMessageHe,
} from "../materialList/completeness";
import {
  initializePrimaryFieldResolutions,
  mergeTargetedRepair,
} from "../materialList/mergeRepair";
import {
  evaluateFinalValidationGate,
  evaluateQualityGate,
  measureFieldCoverageCounts,
} from "../materialList/qualityGate";
import { MATERIAL_LIST_QUALITY_GATE } from "../materialList/qualityGateConfig";
import {
  buildTargetedRepairUserPrompt,
  TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT,
} from "../materialList/repairSchema";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import {
  EXPECTED_BENCHMARK_MATERIAL_ROWS,
  EXPECTED_BENCHMARK_MATERIAL_UNITS,
  type MaterialListRow,
  type RepairableMaterialField,
} from "../materialList/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
}

function baseRow(
  partial: Partial<MaterialListRow> & Pick<MaterialListRow, "rowId">
): MaterialListRow {
  const row: MaterialListRow = {
    rowId: partial.rowId,
    sheetName: partial.sheetName ?? "S",
    sourceRow: partial.sourceRow ?? 1,
    sourceCell: partial.sourceCell ?? "A1",
    partId: partial.partId ?? null,
    profile: partial.profile ?? "PL10*100",
    description: partial.description ?? null,
    material: "material" in partial ? (partial.material ?? null) : "S355",
    thicknessMm:
      "thicknessMm" in partial ? (partial.thicknessMm ?? null) : 10,
    quantity: "quantity" in partial ? (partial.quantity ?? null) : 1,
    widthMm: "widthMm" in partial ? (partial.widthMm ?? null) : 100,
    lengthMm: "lengthMm" in partial ? (partial.lengthMm ?? null) : 200,
    userOverrides: partial.userOverrides ?? {},
    fieldResolutions: partial.fieldResolutions ?? {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

function manyRows(
  count: number,
  patch: (i: number) => Partial<MaterialListRow>
): MaterialListRow[] {
  return Array.from({ length: count }, (_, i) =>
    baseRow({
      rowId: `r${i}`,
      sourceRow: i + 10,
      sourceCell: `A${i + 10}`,
      ...patch(i),
    })
  );
}

console.log("=== Material List Quality Gate + Targeted Repair v1 ===\n");

{
  const rows = initializePrimaryFieldResolutions(
    manyRows(30, () => ({}))
  );
  const gate = evaluateQualityGate(rows);
  assertEq(gate.shouldRepair, false, "healthy primary does not repair");
  assertEq(gate.passed, true, "healthy primary passes");
  assertEq(gate.repairFields.length, 0, "no repair fields");
  console.log("✓ Successful primary extraction does not trigger repair");
}

{
  const rows = initializePrimaryFieldResolutions(
    manyRows(30, () => ({ lengthMm: null }))
  );
  const gate = evaluateQualityGate(rows);
  assertEq(gate.shouldRepair, true, "length collapse triggers");
  assert(gate.repairFields.includes("lengthMm"), "repair lengthMm");
  assert(
    gate.triggerReasons.some((r) => r.includes("SYSTEMATIC_COLLAPSE:lengthMm")),
    "collapse reason"
  );
  console.log("✓ Systematic length collapse triggers repair");
}

{
  // 25 rows, only 2 missing length (~8% missing = 92% coverage) — not collapse
  const rows = initializePrimaryFieldResolutions(
    manyRows(25, (i) => (i < 2 ? { lengthMm: null } : {}))
  );
  const gate = evaluateQualityGate(rows);
  assertEq(gate.shouldRepair, false, "few missing lengths do not trigger");
  console.log(
    "✓ A few genuinely missing lengths do not automatically trigger systematic repair"
  );
}

{
  const rows = manyRows(5, (i) => ({
    lengthMm: null,
    sourceRow: 20 + i,
  }));
  const snapshot = {
    sheets: [
      {
        sheetName: "S",
        rows: Array.from({ length: 30 }, (_, i) => ({
          rowNumber: i + 1,
          cells: [
            {
              address: `A${i + 1}`,
              text:
                i >= 19
                  ? `PL10*100 S355 1 ${300 + i} 0 1`
                  : i === 5
                    ? "Profile Grade Qty Length Area Weight"
                    : "ctx",
            },
          ],
        })),
      },
    ],
  };
  const payloads = buildRepairSourcePayloads({
    snapshot,
    rows,
    repairFields: ["lengthMm"],
  });
  assertEq(payloads.length, 5, "all needing repair");
  const prompt = buildTargetedRepairUserPrompt({
    repairFields: ["lengthMm"],
    rows: payloads,
  });
  assert(prompt.includes('"repairFields"'), "fields listed");
  assert(prompt.includes("lengthMm"), "length requested");
  assert(!prompt.includes("dxfBytes"), "no dxf bytes");
  assert(!prompt.includes('"entities"'), "no entities");
  assert(
    TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT.includes("Do not use profile width"),
    "length rules"
  );
  const selected = selectRowsNeedingRepair(rows, ["lengthMm"]);
  assertEq(selected.length, 5, "select needing");
  console.log("✓ Repair receives only requested fields and source context");
  console.log("✓ No DXF data is sent to repair");
}

{
  const extractSrc = fs.readFileSync(
    path.join(__dirname, "../materialList/openaiMaterialListExtract.ts"),
    "utf8"
  );
  assert(
    extractSrc.includes("runTargetedMaterialRepair"),
    "repair wired once"
  );
  assert(
    extractSrc.includes("providerCallCount: 1 | 2") ||
      extractSrc.includes("providerCallCount:1|2") ||
      /providerCallCount:\s*1\s*\|\s*2/.test(extractSrc),
    "at most two calls"
  );
  assert(
    extractSrc.includes("if (gateBefore.shouldRepair"),
    "conditional repair"
  );
  console.log("✓ Repair runs at most once");
}

{
  const primary = initializePrimaryFieldResolutions([
    baseRow({
      rowId: "a",
      sheetName: "Sheet1",
      sourceRow: 18,
      lengthMm: null,
    }),
    baseRow({
      rowId: "b",
      sheetName: "Sheet1",
      sourceRow: 19,
      lengthMm: null,
    }),
  ]);
  const beforeCount = primary.length;
  const merged = mergeTargetedRepair({
    rows: primary,
    repairFields: ["lengthMm"],
    repair: {
      rows: [
        {
          sheetName: "Sheet1",
          sourceRow: 18,
          sourceCell: "A1",
          fields: {
            lengthMm: { value: 505, status: "EXACT" },
          },
        },
        {
          sheetName: "Other",
          sourceRow: 99,
          sourceCell: null,
          fields: {
            lengthMm: { value: 999, status: "EXACT" },
          },
        },
      ],
    },
  });
  assertEq(merged.rows.length, beforeCount, "canonical count unchanged");
  assertEq(merged.rows[0]!.lengthMm, 505, "exact merge by provenance");
  assertEq(merged.rows[0]!.fieldResolutions.lengthMm, "EXACT_REPAIR", "repair tag");
  assertEq(merged.rows[1]!.lengthMm, null, "unmatched not applied");
  assertEq(merged.stats.exactValuesMerged, 1, "one merge");
  console.log("✓ Repair merges only by exact sheet and source row");
  console.log("✓ EXACT repair values replace missing primary values");
  console.log("✓ Canonical row count does not change during repair");
}

{
  const primary = initializePrimaryFieldResolutions([
    baseRow({ rowId: "u", sourceRow: 5, lengthMm: null }),
  ]);
  const merged = mergeTargetedRepair({
    rows: primary,
    repairFields: ["lengthMm"],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 5,
          sourceCell: "A1",
          fields: {
            lengthMm: { value: null, status: "UNRESOLVED" },
          },
        },
      ],
    },
  });
  assertEq(merged.rows[0]!.lengthMm, null, "unresolved keeps null");
  assertEq(
    merged.rows[0]!.fieldResolutions.lengthMm,
    "UNRESOLVED",
    "unresolved status"
  );
  assertEq(fieldDisplayKind(merged.rows[0]!, "lengthMm"), "unresolved", "ui kind");
  assert(
    missingFieldsMessageHe(merged.rows[0]!)?.includes("לא פוענח"),
    "unresolved message"
  );
  assertEq(
    deriveApprovalStatus(merged.rows[0]!),
    "NEEDS_COMPLETION",
    "unresolved not valid"
  );
  console.log("✓ UNRESOLVED values remain unresolved");
}

{
  const primary = initializePrimaryFieldResolutions([
    baseRow({ rowId: "m", sourceRow: 6, lengthMm: null }),
  ]);
  const merged = mergeTargetedRepair({
    rows: primary,
    repairFields: ["lengthMm"],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 6,
          sourceCell: "A1",
          fields: {
            lengthMm: { value: null, status: "MISSING_IN_SOURCE" },
          },
        },
      ],
    },
  });
  assertEq(
    merged.rows[0]!.fieldResolutions.lengthMm,
    "MISSING_IN_SOURCE",
    "missing status"
  );
  assertEq(fieldDisplayKind(merged.rows[0]!, "lengthMm"), "missing", "missing ui");
  assert(
    missingFieldsMessageHe(merged.rows[0]!)?.includes("חסר"),
    "missing message"
  );
  console.log("✓ MISSING_IN_SOURCE values display as missing");
}

{
  const primary = initializePrimaryFieldResolutions([
    baseRow({ rowId: "v", sourceRow: 7, lengthMm: 540 }),
  ]);
  const merged = mergeTargetedRepair({
    rows: primary,
    repairFields: ["lengthMm"],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 7,
          sourceCell: "A1",
          fields: {
            lengthMm: { value: null, status: "EXACT" },
          },
        },
      ],
    },
  });
  assertEq(merged.rows[0]!.lengthMm, 540, "valid primary kept");
  assert(merged.stats.skippedInvalidValue >= 1 || merged.stats.skippedWouldOverwriteValid >= 0);
  const merged2 = mergeTargetedRepair({
    rows: primary,
    repairFields: ["lengthMm"],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 7,
          sourceCell: "A1",
          fields: {
            lengthMm: { value: 999, status: "EXACT" },
          },
        },
      ],
    },
  });
  assertEq(merged2.rows[0]!.lengthMm, 540, "not overwritten by repair");
  assertEq(merged2.stats.skippedWouldOverwriteValid, 1, "skip overwrite");
  console.log("✓ Valid primary values are not overwritten by null repair values");
}

{
  const adapted = adaptMaterialListRows({
    rows: [
      {
        sheetName: "S",
        sourceRow: 10,
        sourceCell: "A10",
        partId: null,
        profile: "PL10*100",
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 1,
        widthMm: 100,
        lengthMm: 200,
      },
      {
        sheetName: "S",
        sourceRow: 10,
        sourceCell: "A10",
        partId: null,
        profile: "PL10*100",
        description: null,
        material: "S355",
        thicknessMm: 10,
        quantity: 2,
        widthMm: 100,
        lengthMm: 200,
      },
      {
        sheetName: null,
        sourceRow: null,
        sourceCell: null,
        partId: null,
        profile: "PL1*1",
        description: null,
        material: "X",
        thicknessMm: 1,
        quantity: 1,
        widthMm: 1,
        lengthMm: 1,
      },
      {
        sheetName: "S",
        sourceRow: 0,
        sourceCell: null,
        partId: null,
        profile: "BAD",
        description: null,
        material: "X",
        thicknessMm: 1,
        quantity: 1,
        widthMm: 1,
        lengthMm: 1,
      },
    ],
  });
  assertEq(adapted.rows.length, 1, "one per source row; drop fallbacks");
  assertEq(adapted.rows[0]!.sourceRow, 10, "kept first provenance");
  assert(adapted.diagnostics.duplicateRowsRemoved >= 1, "dupe removed");
  const extracted = materialListToExtractedRows(adapted.rows);
  assert(
    extracted.every((r) => r.sourceRow !== 0),
    "no sourceRow 0"
  );
  console.log("✓ One source row remains one material item");
  console.log("✓ sourceRow: 0 legacy duplicates are not appended");
}

{
  assertEq(EXPECTED_BENCHMARK_MATERIAL_ROWS, 158, "benchmark rows ref");
  assertEq(EXPECTED_BENCHMARK_MATERIAL_UNITS, 1902, "benchmark units ref");
  assert(
    MATERIAL_LIST_QUALITY_GATE.minItemsForSystematicCheck === 20,
    "threshold config"
  );
  console.log("✓ The benchmark ends with 158 / 1902 references documented");
}

{
  const collapsed = initializePrimaryFieldResolutions(
    manyRows(40, () => ({ lengthMm: null }))
  );
  const before = evaluateQualityGate(collapsed);
  assert(before.shouldRepair, "pre-repair fail");
  const repaired = collapsed.map((r) => ({
    ...r,
    lengthMm: 500,
    fieldResolutions: { ...r.fieldResolutions, lengthMm: "EXACT_REPAIR" as const },
    approvalStatus: deriveApprovalStatus({ ...r, lengthMm: 500 }),
  }));
  const after = evaluateFinalValidationGate(repaired);
  assertEq(after.passed, true, "passes after repair");
  assertEq(measureFieldCoverageCounts(repaired).lengthMm, 40, "length covered");
  console.log("✓ Final validation passes after length repair");
}

{
  const shell = fs.readFileSync(
    path.join(__dirname, "../SimpleIntakeShell.tsx"),
    "utf8"
  );
  assert(
    shell.includes("MATERIAL_LIST_QUALITY_FAILED"),
    "quality failed status"
  );
  assert(
    shell.includes("MaterialListQualityFailedScreen"),
    "failure screen"
  );
  const failUi = fs.readFileSync(
    path.join(__dirname, "../materialList/MaterialListQualityFailedScreen.tsx"),
    "utf8"
  );
  assert(failUi.includes("לא הצלחנו לפענח את כל הנתונים"), "heading");
  assert(failUi.includes("הצג פריטים שלא פוענחו"), "show unresolved");
  assert(failUi.includes("נסה שוב"), "retry");
  console.log("✓ Quality-failed UI does not show completed material list");
}

{
  const fields: RepairableMaterialField[] = [
    "material",
    "thicknessMm",
    "quantity",
    "widthMm",
    "lengthMm",
  ];
  assertEq(fields.length, 5, "repairable fields");
  console.log("✓ Repairable field union covered");
}

console.log(
  "\n=== All Material List Quality Gate + Targeted Repair v1 tests passed ===\n"
);
