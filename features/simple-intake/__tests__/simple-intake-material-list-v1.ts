/**
 * OMEGA — Excel to Approved Material List v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-material-list-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adaptMaterialListRows,
} from "../materialList/adaptMaterialListRows";
import {
  deriveApprovalStatus,
  displayLabel,
  missingCompletionFields,
  refreshRowCompleteness,
  summarizeMaterialList,
} from "../materialList/completeness";
import {
  aiMaterialListResultSchema,
  getSimpleIntakeOpenAiModel,
  MATERIAL_LIST_SYSTEM_PROMPT,
} from "../materialList/schema";
import {
  EXPECTED_BENCHMARK_MATERIAL_ROWS,
  MATERIAL_LIST_TABLE_HEADERS,
  type MaterialListRow,
} from "../materialList/types";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import { FIXED_TABLE_COLUMN_HEADERS } from "../results/tableContract";

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
    profile: partial.profile ?? null,
    description: partial.description ?? null,
    material: partial.material ?? null,
    thicknessMm: partial.thicknessMm ?? null,
    quantity: partial.quantity ?? null,
    widthMm: partial.widthMm ?? null,
    lengthMm: partial.lengthMm ?? null,
    userOverrides: partial.userOverrides ?? {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  return { ...row, approvalStatus: deriveApprovalStatus(row) };
}

console.log("=== Excel to Approved Material List v1 ===\n");

{
  const root = path.resolve(__dirname, "..");
  const upload = fs.readFileSync(
    path.join(root, "components/UploadStep.tsx"),
    "utf8"
  );
  assert(upload.includes("העלאת רשימת חומר"), "upload heading");
  assert(upload.includes("נתח את הקובץ"), "analyze CTA");
  assert(!upload.includes("הוסף DXF"), "no DXF on stage 1 upload");
  assert(upload.includes("canAnalyze = session.workbookFile != null"), "excel only");
  console.log("✓ First screen asks for Excel only; DXF not required");
}

{
  withEnv("SIMPLE_INTAKE_OPENAI_MODEL", "gpt-5.4-mini", () => {
    assertEq(getSimpleIntakeOpenAiModel(), "gpt-5.4-mini", "model env");
  });
  withEnv("SIMPLE_INTAKE_OPENAI_MODEL", undefined, () => {
    assertEq(getSimpleIntakeOpenAiModel(), "gpt-5.4-mini", "default model");
  });
  console.log("✓ OpenAI Mini selected through SIMPLE_INTAKE_OPENAI_MODEL");
}

{
  const schema = aiMaterialListResultSchema.shape.rows.element.shape;
  assert(!("sourceAreaM2" in schema), "no area");
  assert(!("sourceWeightKg" in schema), "no weight");
  assert(!("confidence" in schema), "no confidence");
  assert(!("note" in schema), "no note");
  assert(!("summary" in aiMaterialListResultSchema.shape), "no summary root");
  assert(MATERIAL_LIST_SYSTEM_PROMPT.includes("Do not include DXF"), "no dxf prompt");
  assert(
    MATERIAL_LIST_SYSTEM_PROMPT.includes("Never turn one source row with quantity 20"),
    "qty 20"
  );
  assert(
    MATERIAL_LIST_SYSTEM_PROMPT.includes("Exclude"),
    "excludes headers/totals"
  );
  console.log("✓ AI schema excludes area/weight/confidence/DXF; prompt rules present");
}

{
  const { rows, diagnostics } = adaptMaterialListRows({
    rows: [
      {
        sheetName: "S",
        sourceRow: 10,
        sourceCell: "A10",
        partId: null,
        profile: "PL25*495",
        description: null,
        material: "S235",
        thicknessMm: 25,
        quantity: 20,
        widthMm: 495,
        lengthMm: 1000,
      },
      {
        sheetName: "S",
        sourceRow: 11,
        sourceCell: null,
        partId: null,
        profile: "PL10*10",
        description: null,
        material: null,
        thicknessMm: 0,
        quantity: 0,
        widthMm: null,
        lengthMm: null,
      },
    ],
  });
  assertEq(rows.length, 2, "two rows");
  assertEq(rows[0]!.quantity, 20, "qty 20 one row");
  assertEq(rows[1]!.quantity, 0, "zero preserved");
  assertEq(rows[1]!.thicknessMm, 0, "zero thickness preserved at adapt");
  assertEq(rows[1]!.material, null, "missing material null");
  assert(rows[1]!.approvalStatus === "NEEDS_COMPLETION", "needs completion");
  assert(diagnostics.validatedRowCount === 2, "validated");
  console.log("✓ Adapter: zeros preserved, missing null, qty 20 stays one row");
}

{
  const complete = baseRow({
    rowId: "a",
    material: "S235",
    thicknessMm: 10,
    quantity: 2,
    widthMm: 100,
    lengthMm: 200,
    partId: null,
  });
  assertEq(complete.approvalStatus, "COMPLETE", "complete");
  assertEq(missingCompletionFields(complete).length, 0, "no missing");

  const noMaterial = baseRow({
    rowId: "b",
    material: null,
    thicknessMm: 10,
    quantity: 2,
    widthMm: 100,
    lengthMm: 200,
    partId: "P1",
  });
  assert(missingCompletionFields(noMaterial).includes("material"), "missing material");
  assertEq(displayLabel(noMaterial), "P1", "part id label");

  const noPart = baseRow({
    rowId: "c",
    material: "S235",
    thicknessMm: 10,
    quantity: 2,
    widthMm: 100,
    lengthMm: 200,
    partId: null,
    profile: "PL10*10",
  });
  assertEq(noPart.approvalStatus, "COMPLETE", "missing partId alone ok");

  for (const field of [
    "thicknessMm",
    "quantity",
    "widthMm",
    "lengthMm",
  ] as const) {
    const row = baseRow({
      rowId: field,
      material: "S235",
      thicknessMm: 10,
      quantity: 2,
      widthMm: 100,
      lengthMm: 200,
      [field]: null,
    });
    assert(
      missingCompletionFields(row).includes(field),
      `missing ${field}`
    );
  }
  console.log("✓ Completeness rules for material/thickness/qty/width/length");
}

{
  let row = baseRow({
    rowId: "e1",
    material: null,
    thicknessMm: 10,
    quantity: 1,
    widthMm: 10,
    lengthMm: 10,
  });
  row = refreshRowCompleteness({
    ...row,
    userOverrides: { material: "S275" },
  });
  assertEq(row.approvalStatus, "COMPLETE", "inline edit completes");
  const summary = summarizeMaterialList([row]);
  assertEq(summary.completeRows, 1, "summary updates");
  console.log("✓ Inline edits update canonical completeness + summary");
}

{
  assertEq(MATERIAL_LIST_TABLE_HEADERS.length, 9, "stage1 cols");
  assertEq(FIXED_TABLE_COLUMN_HEADERS.length, 12, "stage2 table unchanged");
  console.log("✓ Fixed Stage 1 columns; Stage 2 table columns unchanged");
}

{
  const rows = [
    baseRow({
      rowId: "ok",
      material: "S235",
      thicknessMm: 10,
      quantity: 1,
      widthMm: 10,
      lengthMm: 10,
    }),
    baseRow({
      rowId: "miss",
      material: null,
      thicknessMm: 10,
      quantity: 1,
      widthMm: 10,
      lengthMm: 10,
    }),
  ];
  const approved = rows.map((r) =>
    r.approvalStatus === "COMPLETE"
      ? r
      : { ...r, approvalStatus: "APPROVED_WITH_MISSING_DATA" as const }
  );
  assert(
    approved.some((r) => r.approvalStatus === "APPROVED_WITH_MISSING_DATA"),
    "approved with missing"
  );
  const extracted = materialListToExtractedRows(approved);
  assertEq(extracted.length, 2, "pass all rows to stage 2");
  assert(
    !extracted.some((r) => r.note === "EXCLUDED"),
    "not excluded"
  );
  console.log("✓ Approval with missing does not exclude rows; Stage 2 receives them");
}

{
  const root = path.resolve(__dirname, "..");
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert(store.includes("materialListRows"), "session has material list");
  assert(store.includes("approveMaterialList"), "approve action");
  assert(store.includes("runDxfStageFromApprovedList"), "dxf stage");
  assert(store.includes("backToMaterialList"), "back nav");
  assert(
    store.includes('analyzingLabel: "קוראים את קובץ האקסל') ||
      store.includes("מארגנים את הנתונים"),
    "workbook analyzing"
  );
  // analyze() must not require DXF
  assert(
    /async analyze\(\)[\s\S]*?if \(!session\.workbookFile\) return;/.test(store),
    "analyze workbook-only"
  );
  assert(
    !/async analyze\(\)[\s\S]*?dxfFiles\.length === 0\) return;/.test(
      store.slice(store.lastIndexOf("async analyze()"))
    ),
    "analyze does not require dxf"
  );

  const route = fs.readFileSync(
    path.join(root, "../../app/api/simple-intake/analyze/route.ts"),
    "utf8"
  );
  assert(route.includes("runOpenAiMaterialListExtraction"), "material extract");
  assert(route.includes("MATERIAL_LIST") || route.includes("material-list"), "ml path");
  assert(route.includes("getSimpleWorkbookExtractionProvider"), "provider switch");
  // Default path must not call Llama
  assert(
    route.includes('provider === "llama-extract"'),
    "llama only when selected"
  );

  const openaiMl = fs.readFileSync(
    path.join(root, "materialList/openaiMaterialListExtract.ts"),
    "utf8"
  );
  assert(openaiMl.includes("getSimpleIntakeOpenAiModel"), "model helper");
  assert(openaiMl.includes("MATERIAL_LIST_SYSTEM_PROMPT"), "prompt");
  assert(openaiMl.includes("providerCall"), "provider call debug");
  assert(openaiMl.includes("MATERIAL_LIST_EXTRACTION"), "purpose");
  assert(!/dxfParts|dxfFiles|matchedDxf/i.test(openaiMl), "no dxf in extract");

  console.log("✓ Wiring: workbook-only analyze, OpenAI Mini path, Llama not default");
}

{
  assertEq(EXPECTED_BENCHMARK_MATERIAL_ROWS, 158, "benchmark doc only");
  console.log("✓ Benchmark reference documented as 158 (not production logic)");
}

console.log("\n=== All Excel to Approved Material List v1 tests passed ===\n");

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}
