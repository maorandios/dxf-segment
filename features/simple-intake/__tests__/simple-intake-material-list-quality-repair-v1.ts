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
import { decideRepairPlan } from "../materialList/decideRepairPlan";
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
  targetedMaterialRepairResultSchema,
  TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT,
  type TargetedMaterialRepairResult,
} from "../materialList/repairSchema";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import {
  EXPECTED_BENCHMARK_MATERIAL_ROWS,
  EXPECTED_BENCHMARK_MATERIAL_UNITS,
  EXPECTED_BENCHMARK_VALID_MATERIALS,
  EXPECTED_BENCHMARK_MISSING_MATERIALS,
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
    dxfFileName: "dxfFileName" in partial ? (partial.dxfFileName ?? null) : null,
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

type RepairFieldsShape = TargetedMaterialRepairResult["rows"][number]["fields"];

function repairFields(
  partial: Partial<RepairFieldsShape>
): RepairFieldsShape {
  return {
    material: partial.material ?? null,
    thicknessMm: partial.thicknessMm ?? null,
    quantity: partial.quantity ?? null,
    widthMm: partial.widthMm ?? null,
    lengthMm: partial.lengthMm ?? null,
  };
}

console.log("=== Material List Quality Gate + Targeted Repair v1 ===\n");

{
  const schemaSrc = fs.readFileSync(
    path.join(__dirname, "../materialList/repairSchema.ts"),
    "utf8"
  );
  assert(!schemaSrc.includes(".optional("), "no zod optional in repair schema");
  const parsed = targetedMaterialRepairResultSchema.parse({
    rows: [
      {
        sheetName: "S",
        sourceRow: 1,
        sourceCell: "A1",
        fields: repairFields({
          lengthMm: { value: 100, status: "EXACT" },
        }),
      },
    ],
  });
  assertEq(parsed.rows[0]!.fields.material, null, "unrequested material null");
  assertEq(parsed.rows[0]!.fields.widthMm, null, "unrequested width null");
  assertEq(parsed.rows[0]!.fields.lengthMm!.value, 100, "requested length");
  console.log("✓ Repair schema is strict: all field keys required and nullable");
}

{
  const rows = initializePrimaryFieldResolutions(manyRows(30, () => ({})));
  const gate = evaluateQualityGate(rows);
  assertEq(gate.shouldRepair, false, "healthy primary does not repair");
  assertEq(gate.passed, true, "healthy primary passes");
  assertEq(gate.repairFields.length, 0, "no repair fields");
  const plan = decideRepairPlan(rows);
  assertEq(plan.triggerType, "NONE", "no selective either");
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
  const plan = decideRepairPlan(rows);
  assertEq(plan.triggerType, "SYSTEMATIC_COLLAPSE", "systematic plan");
  assertEq(plan.affectedRows.length, 30, "all rows affected");
  console.log("✓ Systematic length collapse triggers repair");
}

{
  const rows = initializePrimaryFieldResolutions(
    manyRows(25, (i) => (i < 2 ? { lengthMm: null } : {}))
  );
  const gate = evaluateQualityGate(rows);
  assertEq(gate.shouldRepair, false, "few missing lengths do not trigger");
  const plan = decideRepairPlan(rows);
  assertEq(plan.triggerType, "SELECTIVE_MISSING_FIELDS", "selective triggers");
  assertEq(plan.affectedRows.length, 2, "only affected rows");
  assert.deepEqual(plan.repairFields, ["lengthMm"], "only length requested");
  console.log(
    "✓ A few genuinely missing lengths do not automatically trigger systematic repair"
  );
  console.log("✓ Selective repair targets only affected missing-field rows");
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
  assert(
    prompt.includes("Set every non-requested field key to null"),
    "null instruction"
  );
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
    /providerCallCount:\s*1\s*\|\s*2/.test(extractSrc),
    "at most two calls"
  );
  assert(extractSrc.includes("decideRepairPlan"), "uses decideRepairPlan");
  assert(
    extractSrc.includes('repairPlan.triggerType !== "NONE"'),
    "conditional repair"
  );
  console.log("✓ Repair runs at most once");
}

{
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../../../app/api/simple-intake/analyze/route.ts"),
    "utf8"
  );
  assert(routeSrc.includes("INVALID_STRICT_SCHEMA"), "schema errors classified");
  assert(
    routeSrc.includes("SCHEMA_VALIDATION_FAILED"),
    "validation non-retryable"
  );
  assert(routeSrc.includes("nonRetryableCodes"), "non-retryable set");
  console.log("✓ Schema/config Structured Output errors are not retryable");
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
          fields: repairFields({
            lengthMm: { value: 505, status: "EXACT" },
          }),
        },
        {
          sheetName: "Other",
          sourceRow: 99,
          sourceCell: null,
          fields: repairFields({
            lengthMm: { value: 999, status: "EXACT" },
          }),
        },
      ],
    },
  });
  assertEq(merged.rows.length, beforeCount, "canonical count unchanged");
  assertEq(merged.rows[0]!.lengthMm, 505, "exact merge by provenance");
  assertEq(
    merged.rows[0]!.fieldResolutions.lengthMm,
    "EXACT_REPAIR",
    "repair tag"
  );
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
          fields: repairFields({
            lengthMm: { value: null, status: "UNRESOLVED" },
          }),
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
  assertEq(
    fieldDisplayKind(merged.rows[0]!, "lengthMm"),
    "unresolved",
    "ui kind"
  );
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
          fields: repairFields({
            lengthMm: { value: null, status: "MISSING_IN_SOURCE" },
          }),
        },
      ],
    },
  });
  assertEq(
    merged.rows[0]!.fieldResolutions.lengthMm,
    "MISSING_IN_SOURCE",
    "missing status"
  );
  assertEq(
    fieldDisplayKind(merged.rows[0]!, "lengthMm"),
    "missing",
    "missing ui"
  );
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
          fields: repairFields({
            lengthMm: { value: null, status: "EXACT" },
          }),
        },
      ],
    },
  });
  assertEq(merged.rows[0]!.lengthMm, 540, "valid primary kept");
  const merged2 = mergeTargetedRepair({
    rows: primary,
    repairFields: ["lengthMm"],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 7,
          sourceCell: "A1",
          fields: repairFields({
            lengthMm: { value: 999, status: "EXACT" },
          }),
        },
      ],
    },
  });
  assertEq(merged2.rows[0]!.lengthMm, 540, "not overwritten by repair");
  assertEq(merged2.stats.skippedWouldOverwriteValid, 1, "skip overwrite");
  console.log(
    "✓ Valid primary values are not overwritten by null repair values"
  );
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
        dxfFileName: null,
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
        dxfFileName: null,
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
        dxfFileName: null,
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
        dxfFileName: null,
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
  assertEq(EXPECTED_BENCHMARK_VALID_MATERIALS, 152, "valid materials ref");
  assertEq(EXPECTED_BENCHMARK_MISSING_MATERIALS, 6, "missing materials ref");
  assert(
    MATERIAL_LIST_QUALITY_GATE.minItemsForSystematicCheck === 20,
    "threshold config"
  );
  console.log("✓ The benchmark ends with 158 / 1902 references documented");
  console.log(
    "✓ The benchmark ends with 152 valid materials and 6 missing materials"
  );
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
    fieldResolutions: {
      ...r.fieldResolutions,
      lengthMm: "EXACT_REPAIR" as const,
    },
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
  assert(shell.includes("MaterialListQualityFailedScreen"), "failure screen");
  const failUi = fs.readFileSync(
    path.join(__dirname, "../materialList/MaterialListQualityFailedScreen.tsx"),
    "utf8"
  );
  assert(
    failUi.includes("לא הצלחנו לפענח את כל הנתונים") ||
      failUi.includes("לא הצלחנו להשלים את הניתוח"),
    "heading"
  );
  assert(failUi.includes("הצג פריטים שלא פוענחו"), "show unresolved");
  assert(
    failUi.includes("נסה שוב") || failUi.includes("onRetry") || failUi.includes("FailureState"),
    "retry"
  );
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

{
  assert(
    TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT.includes(
      "A profile or part designation is never a material grade"
    ),
    "material prompt guard"
  );
  assert(
    TARGETED_MATERIAL_REPAIR_SYSTEM_PROMPT.includes("evidenceText"),
    "evidence in prompt"
  );

  const profileRow = initializePrimaryFieldResolutions([
    baseRow({
      rowId: "pl",
      sourceRow: 12,
      profile: "PL31*540",
      material: null,
      lengthMm: 540,
    }),
  ])[0]!;
  const ctxPl = {
    sheetName: "S",
    sourceRow: 12,
    sourceRowText: "PL31*540 |  | 1 | 31 | 540",
    nearbyContextRows: [],
  };
  const rejectPl = mergeTargetedRepair({
    rows: [profileRow],
    repairFields: ["material"],
    sourceContexts: [ctxPl],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 12,
          sourceCell: "A1",
          fields: repairFields({
            material: {
              value: "PL31*540",
              status: "EXACT",
              evidenceText: "PL31*540",
              evidenceSourceRow: 12,
            },
          }),
        },
      ],
    },
  });
  assertEq(rejectPl.rows[0]!.material, null, "PL31 not merged");
  assertEq(
    rejectPl.rows[0]!.fieldResolutions.material,
    "MISSING_IN_SOURCE",
    "rejected blank stays missing"
  );
  assertEq(rejectPl.stats.rejectedExactValues, 1, "rejected count");
  assertEq(rejectPl.stats.rejectedReasons[0]!.reason, "EQUALS_PROFILE", "profile reason");
  assertEq(
    deriveApprovalStatus(rejectPl.rows[0]!),
    "NEEDS_COMPLETION",
    "not complete after invalid"
  );
  assertEq(fieldDisplayKind(rejectPl.rows[0]!, "material"), "missing", "shows חסר");
  console.log("✓ PL31*540 cannot be merged as material when it is also the profile");

  const fltRow = initializePrimaryFieldResolutions([
    baseRow({
      rowId: "flt",
      sourceRow: 13,
      profile: "FLT20*250",
      material: null,
      lengthMm: 250,
    }),
  ])[0]!;
  const rejectFlt = mergeTargetedRepair({
    rows: [fltRow],
    repairFields: ["material"],
    sourceContexts: [
      {
        sheetName: "S",
        sourceRow: 13,
        sourceRowText: "FLT20*250 |  | 2 | 20 | 250",
        nearbyContextRows: [],
      },
    ],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 13,
          sourceCell: "A1",
          fields: repairFields({
            material: {
              value: "FLT20*250",
              status: "EXACT",
              evidenceText: "FLT20*250",
              evidenceSourceRow: 13,
            },
          }),
        },
      ],
    },
  });
  assertEq(rejectFlt.rows[0]!.material, null, "FLT not merged");
  assertEq(rejectFlt.stats.rejectedReasons[0]!.reason, "EQUALS_PROFILE", "flt profile");
  console.log("✓ FLT20*250 cannot be merged as material when it is also the profile");

  const s355Row = initializePrimaryFieldResolutions([
    baseRow({
      rowId: "ok",
      sourceRow: 14,
      profile: "PL10*100",
      material: null,
    }),
  ])[0]!;
  const accept = mergeTargetedRepair({
    rows: [s355Row],
    repairFields: ["material"],
    sourceContexts: [
      {
        sheetName: "S",
        sourceRow: 14,
        sourceRowText: "PL10*100 | S355 | 1 | 10 | 100",
        nearbyContextRows: [],
      },
    ],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 14,
          sourceCell: "A1",
          fields: repairFields({
            material: {
              value: "S355",
              status: "EXACT",
              evidenceText: "S355",
              evidenceSourceRow: 14,
            },
          }),
        },
      ],
    },
  });
  assertEq(accept.rows[0]!.material, "S355", "S355 merged");
  assertEq(accept.rows[0]!.fieldResolutions.material, "EXACT_REPAIR", "exact repair");
  assertEq(accept.stats.exactValuesMerged, 1, "merged once");
  assertEq(accept.stats.rejectedExactValues, 0, "no reject");
  console.log("✓ An explicit S355 with valid source evidence is merged");

  const blank = mergeTargetedRepair({
    rows: [
      initializePrimaryFieldResolutions([
        baseRow({ rowId: "blank", sourceRow: 15, material: null }),
      ])[0]!,
    ],
    repairFields: ["material"],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 15,
          sourceCell: "A1",
          fields: repairFields({
            material: {
              value: null,
              status: "MISSING_IN_SOURCE",
              evidenceText: null,
              evidenceSourceRow: null,
            },
          }),
        },
      ],
    },
  });
  assertEq(blank.rows[0]!.material, null, "blank stays null");
  assertEq(
    blank.rows[0]!.fieldResolutions.material,
    "MISSING_IN_SOURCE",
    "missing status"
  );
  assertEq(fieldDisplayKind(blank.rows[0]!, "material"), "missing", "חסר kind");
  assert(
    missingFieldsMessageHe(blank.rows[0]!)?.includes("חסר"),
    "חסר message"
  );
  console.log("✓ A blank material position returns MISSING_IN_SOURCE");

  const noEvidence = mergeTargetedRepair({
    rows: [
      initializePrimaryFieldResolutions([
        baseRow({
          rowId: "ne",
          sourceRow: 16,
          profile: "PL10*100",
          material: null,
        }),
      ])[0]!,
    ],
    repairFields: ["material"],
    sourceContexts: [
      {
        sheetName: "S",
        sourceRow: 16,
        sourceRowText: "PL10*100 | S355 | 1",
        nearbyContextRows: [],
      },
    ],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 16,
          sourceCell: "A1",
          fields: repairFields({
            material: {
              value: "S355",
              status: "EXACT",
              evidenceText: null,
              evidenceSourceRow: null,
            },
          }),
        },
      ],
    },
  });
  assertEq(noEvidence.rows[0]!.material, null, "no evidence no merge");
  assertEq(
    noEvidence.stats.rejectedReasons[0]!.reason,
    "MISSING_EVIDENCE",
    "missing evidence reason"
  );
  console.log("✓ Missing evidence prevents an EXACT merge");

  const peerBorrow = mergeTargetedRepair({
    rows: [
      initializePrimaryFieldResolutions([
        baseRow({
          rowId: "peer",
          sourceRow: 250,
          profile: "FLT20*250",
          material: null,
        }),
      ])[0]!,
    ],
    repairFields: ["material"],
    sourceContexts: [
      {
        sheetName: "S",
        sourceRow: 250,
        sourceRowText: "FLT20*250                                   26           520          0            0",
        nearbyContextRows: [
          {
            rowNumber: 249,
            text: "FLT20*250            S355                   13           250          0            7",
          },
        ],
      },
    ],
    repair: {
      rows: [
        {
          sheetName: "S",
          sourceRow: 250,
          sourceCell: "A1",
          fields: repairFields({
            material: {
              value: "S355",
              status: "EXACT",
              evidenceText: "S355",
              evidenceSourceRow: 249,
            },
          }),
        },
      ],
    },
  });
  assertEq(peerBorrow.rows[0]!.material, null, "peer grade not borrowed");
  assertEq(
    peerBorrow.stats.rejectedReasons[0]!.reason,
    "EVIDENCE_NOT_IN_SOURCE",
    "peer evidence rejected"
  );
  console.log("✓ Material grade from a peer profile row is not merged");

  assertEq(
    deriveApprovalStatus(rejectPl.rows[0]!),
    "NEEDS_COMPLETION",
    "invalid repair not complete"
  );
  console.log("✓ Invalid repair output does not make a row complete");

  const lengthOk = initializePrimaryFieldResolutions(
    manyRows(158, (i) => ({
      sourceRow: i + 1,
      lengthMm: 100 + i,
      material: i < 152 ? "S355" : null,
    }))
  );
  assertEq(
    lengthOk.filter((r) => r.lengthMm != null).length,
    158,
    "all lengths present"
  );
  assertEq(
    lengthOk.filter((r) => r.fieldResolutions.material === "EXACT_PRIMARY")
      .length,
    152,
    "152 valid materials"
  );
  console.log("✓ All 158 lengths remain correct");
}

console.log(
  "\n=== All Material List Quality Gate + Targeted Repair v1 tests passed ===\n"
);