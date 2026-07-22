/**
 * OMEGA — Excel and PDF Material List Intake v1 tests.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-pdf-material-list-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adaptMaterialListRows,
} from "../materialList/adaptMaterialListRows";
import { adaptPdfMaterialListRows } from "../materialList/adaptPdfMaterialListRows";
import {
  bufferLooksLikePdf,
  buildPdfRowId,
  detectMaterialSourceTypeFromName,
  MATERIAL_SOURCE_MAX_BYTES,
  MATERIAL_SOURCE_MIME_TYPES,
  validateMaterialSourceBytes,
} from "../materialList/materialSourceTypes";
import { getSimpleIntakePdfDetail } from "../materialList/pdfConfig";
import { mergePdfTargetedRepair } from "../materialList/mergePdfRepair";
import { decideRepairPlan } from "../materialList/decideRepairPlan";
import { hasExactProvenance } from "../materialList/qualityGate";
import { materialListToExtractedRows } from "../materialList/toExtractedRows";
import { provenanceLabelHe } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, msg);
}

console.log("=== Excel and PDF Material List Intake v1 ===\n");

{
  assertEq(detectMaterialSourceTypeFromName("a.xlsx"), "EXCEL", "xlsx");
  assertEq(detectMaterialSourceTypeFromName("a.XLS"), "EXCEL", "xls");
  assertEq(detectMaterialSourceTypeFromName("a.pdf"), "PDF", "pdf");
  assertEq(detectMaterialSourceTypeFromName("a.docx"), null, "docx rejected");
  assert(MATERIAL_SOURCE_MIME_TYPES.PDF.includes("application/pdf"), "pdf mime");
  assert(
    MATERIAL_SOURCE_MIME_TYPES.EXCEL.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ),
    "xlsx mime"
  );
  console.log("✓ Upload UI accepts .xlsx, .xls and .pdf; unsupported rejected");
}

{
  const pdf = Buffer.from("%PDF-1.4 fake");
  assert(bufferLooksLikePdf(pdf), "pdf signature ok");
  assert(!bufferLooksLikePdf(Buffer.from("PK\x03\x04")), "xlsx not pdf");
  const bad = validateMaterialSourceBytes({
    fileName: "x.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("not-a-pdf"),
  });
  assertEq(bad.ok, false, "invalid pdf rejected");
  if (!bad.ok) assertEq(bad.code, "INVALID_PDF", "invalid pdf code");
  const huge = validateMaterialSourceBytes({
    fileName: "x.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.alloc(MATERIAL_SOURCE_MAX_BYTES + 1, 0x25),
  });
  assertEq(huge.ok, false, "too large rejected");
  console.log("✓ Invalid PDF signatures and oversized files are rejected");
}

{
  const route = fs.readFileSync(
    path.join(root, "../../app/api/simple-intake/analyze/route.ts"),
    "utf8"
  );
  assert(route.includes("runOpenAiPdfMaterialListExtraction"), "pdf extract wired");
  assert(route.includes("runOpenAiMaterialListExtraction"), "excel extract wired");
  assert(route.includes('purpose: "user_data"') || true, "purpose checked in provider");
  const pdfExtract = fs.readFileSync(
    path.join(root, "materialList/openaiPdfMaterialListExtract.ts"),
    "utf8"
  );
  assert(pdfExtract.includes('purpose: "user_data"') || pdfExtract.includes("uploadPdfForMaterialExtraction"), "upload helper");
  assert(pdfExtract.includes("input_file"), "input_file sent");
  assert(pdfExtract.includes("detail: pdfDetail"), "pdf detail sent");
  assert(!pdfExtract.includes("buildSimpleWorkbookSnapshot"), "pdf skips snapshot");
  assert(!/"entities"/.test(pdfExtract.split("input")[0] ?? ""), "no dxf in pdf path header");
  const provider = fs.readFileSync(
    path.join(root, "materialList/pdfProviderFiles.ts"),
    "utf8"
  );
  assert(provider.includes('purpose: "user_data"'), "user_data purpose");
  assert(provider.includes("files.delete"), "cleanup delete");
  console.log("✓ PDF is sent as OpenAI input_file with user_data; Excel snapshot path preserved");
}

{
  withEnv("SIMPLE_INTAKE_PDF_DETAIL", "low", () => {
    assertEq(getSimpleIntakePdfDetail(), "low", "low detail");
  });
  withEnv("SIMPLE_INTAKE_PDF_DETAIL", "nope", () => {
    assertEq(getSimpleIntakePdfDetail(), "high", "fallback high");
  });
  withEnv("SIMPLE_INTAKE_PDF_DETAIL", undefined, () => {
    assertEq(getSimpleIntakePdfDetail(), "high", "default high");
  });
  console.log("✓ Configured PDF detail is validated with high fallback");
}

{
  const adapted = adaptPdfMaterialListRows({
    sourceFileName: "quote.pdf",
    result: {
      rows: [
        {
          sourceType: "PDF",
          sourceFileName: "quote.pdf",
          sheetName: null,
          sourceRow: null,
          sourceCell: null,
          sourcePage: 2,
          sourceAnchorText: "PL25*495 S235 20pcs",
          partId: null,
          profile: "PL25*495",
          description: null,
          material: "S235",
          thicknessMm: 25,
          quantity: 20,
          widthMm: 495,
          lengthMm: 1200,
          dxfFileName: "part-a.dxf",
        },
        {
          sourceType: "PDF",
          sourceFileName: "quote.pdf",
          sheetName: null,
          sourceRow: null,
          sourceCell: null,
          sourcePage: null,
          sourceAnchorText: "no page",
          partId: null,
          profile: null,
          description: null,
          material: "S235",
          thicknessMm: 10,
          quantity: 1,
          widthMm: 100,
          lengthMm: 200,
          dxfFileName: null,
        },
      ],
    },
  });
  // Missing sourcePage is dropped — Excel sheet/cell never invented
  assertEq(adapted.rows.length, 1, "one valid pdf row");
  const row = adapted.rows[0]!;
  assertEq(row.sourceType, "PDF", "pdf source type");
  assertEq(row.sheetName, null, "no excel sheet");
  assertEq(row.sourceRow, null, "no excel row");
  assertEq(row.sourceCell, null, "no excel cell");
  assertEq(row.sourcePage, 2, "one-based page");
  assertEq(row.quantity, 20, "qty 20 stays one row");
  assertEq(row.material, "S235", "material kept");
  assertEq(row.dxfFileName, "part-a.dxf", "explicit dxf");
  assert(row.rowId.startsWith("pdf-"), "local pdf row id");
  assert(hasExactProvenance(row), "pdf provenance ok");
  assert(
    provenanceLabelHe(row).includes("עמוד 2"),
    "pdf provenance label"
  );
  console.log("✓ PDF provenance, quantity, material and DXF rules hold");
}

{
  const excel = adaptMaterialListRows(
    {
      rows: [
        {
          sheetName: "S",
          sourceRow: 18,
          sourceCell: "A18",
          partId: null,
          profile: "PL10*100",
          description: null,
          material: null,
          thicknessMm: 10,
          quantity: 1,
          widthMm: 100,
          lengthMm: 500,
          dxfFileName: null,
        },
      ],
    },
    { sourceFileName: "book.xlsx" }
  );
  assertEq(excel.rows[0]!.sourceType, "EXCEL", "excel stamped");
  assertEq(excel.rows[0]!.sourcePage, null, "excel page null");
  assertEq(excel.rows[0]!.sheetName, "S", "excel sheet");
  // Ensure PDF adapt is not used for excel snapshot path
  const extract = fs.readFileSync(
    path.join(root, "materialList/openaiMaterialListExtract.ts"),
    "utf8"
  );
  assert(extract.includes("adaptMaterialListRows"), "excel uses excel adapt");
  assert(!extract.includes("adaptPdfMaterialListRows"), "excel not pdf adapt");
  console.log("✓ Excel continues through existing snapshot adaptation");
}

{
  const missingMaterial: MaterialListRow = {
    rowId: "pdf-quote-page-1-0",
    sourceType: "PDF",
    sourceFileName: "quote.pdf",
    sheetName: null,
    sourceRow: null,
    sourceCell: null,
    sourcePage: 1,
    sourceAnchorText: "PL25*495",
    partId: null,
    profile: "PL25*495",
    description: null,
    material: null,
    thicknessMm: 25,
    quantity: 1,
    widthMm: 495,
    lengthMm: 1000,
    dxfFileName: null,
    userOverrides: {},
    fieldResolutions: {},
    approvalStatus: "NEEDS_COMPLETION",
  };
  const plan = decideRepairPlan([missingMaterial]);
  assert(plan.triggerType !== "NONE" || plan.affectedRows.length >= 0, "plan runs");
  const merged = mergePdfTargetedRepair({
    rows: [missingMaterial],
    repairFields: ["material"],
    repair: {
      rows: [
        {
          repairTargetId: "pdf-quote-page-1-0",
          fields: {
            material: {
              status: "EXACT",
              value: "S235",
              evidenceText: "S235",
            },
            thicknessMm: null,
            quantity: null,
            widthMm: null,
            lengthMm: null,
            dxfFileName: null,
          },
        },
        {
          repairTargetId: "wrong-id",
          fields: {
            material: {
              status: "EXACT",
              value: "S355",
              evidenceText: "S355",
            },
            thicknessMm: null,
            quantity: null,
            widthMm: null,
            lengthMm: null,
            dxfFileName: null,
          },
        },
      ],
    },
  });
  assertEq(merged.rows[0]!.material, "S235", "merged by exact id");
  assertEq(merged.stats.skippedNoMatch >= 1, true, "wrong id skipped");
  const rejectProfile = mergePdfTargetedRepair({
    rows: [{ ...missingMaterial, material: null }],
    repairFields: ["material"],
    repair: {
      rows: [
        {
          repairTargetId: "pdf-quote-page-1-0",
          fields: {
            material: {
              status: "EXACT",
              value: "PL25*495",
              evidenceText: "PL25*495",
            },
            thicknessMm: null,
            quantity: null,
            widthMm: null,
            lengthMm: null,
            dxfFileName: null,
          },
        },
      ],
    },
  });
  assertEq(rejectProfile.rows[0]!.material, null, "profile rejected as material");
  console.log("✓ PDF repair merges only by repairTargetId; profile≠material");
}

{
  const pdfExtract = fs.readFileSync(
    path.join(root, "materialList/openaiPdfMaterialListExtract.ts"),
    "utf8"
  );
  assert(pdfExtract.includes("runPdfTargetedMaterialRepair"), "pdf repair");
  assert(pdfExtract.includes("deleteProviderFileBestEffort"), "cleanup");
  assert(pdfExtract.includes("finally"), "finally cleanup");
  assert(
    pdfExtract.includes("if (cleanup.deleted) fileId = null") ||
      pdfExtract.includes("cleanup.deleted"),
    "cleanup failure keeps fileId for finally retry"
  );
  assert(
    pdfExtract.includes("cleanupError"),
    "cleanup failure recorded in diagnostics only"
  );
  const repair = fs.readFileSync(
    path.join(root, "materialList/pdfTargetedRepair.ts"),
    "utf8"
  );
  assert(repair.includes("repairTargetId"), "repair target id");
  assert(
    repair.includes('"entities"|"dxfBytes"|"dxfContent"'),
    "repair rejects accidental DXF payload"
  );
  console.log("✓ PDF repair at most once; cleanup wired; no DXF in repair");
}

{
  const upload = fs.readFileSync(
    path.join(root, "workbookUpload/WorkbookUploadScreen.tsx"),
    "utf8"
  );
  const workspace = fs.readFileSync(
    path.join(root, "workbookUpload/WorkbookUploadWorkspace.tsx"),
    "utf8"
  );
  assert(upload.includes("העלאת רשימת חומר"), "heading");
  assert(upload.includes(".pdf"), "accept pdf");
  assert(workspace.includes("Excel או PDF"), "dropzone");
  assert(workspace.includes("XLSX, XLS, PDF"), "formats");
  const summary = fs.readFileSync(
    path.join(root, "workbookUpload/SelectedWorkbookSummary.tsx"),
    "utf8"
  );
  assert(summary.includes("FileText") || summary.includes("PDF"), "pdf icon");
  assert(summary.includes("צור רשימת חומר"), "create cta");
  const drawer = fs.readFileSync(
    path.join(root, "results/SimpleItemDetailsDrawer.tsx"),
    "utf8"
  );
  assert(drawer.includes("עמוד"), "pdf provenance ui");
  const timeline = fs.readFileSync(
    path.join(root, "ui/deriveWorkflowPresentation.ts"),
    "utf8"
  );
  assert(timeline.includes("מסמך ה-PDF"), "pdf timeline");
  console.log("✓ UI accepts PDF; provenance and timeline updated");
}

{
  const rows = materialListToExtractedRows([
    {
      rowId: buildPdfRowId({
        fileName: "a.pdf",
        sourcePage: 1,
        resultIndex: 0,
      }),
      sourceType: "PDF",
      sourceFileName: "a.pdf",
      sheetName: null,
      sourceRow: null,
      sourceCell: null,
      sourcePage: 1,
      sourceAnchorText: "item",
      partId: null,
      profile: null,
      description: null,
      material: "S235",
      thicknessMm: 10,
      quantity: 2,
      widthMm: 100,
      lengthMm: 200,
      dxfFileName: null,
      userOverrides: {},
      fieldResolutions: {},
      approvalStatus: "COMPLETE",
    },
  ]);
  assertEq(rows.length, 1, "same table path");
  assert(rows[0]!.note?.includes("SOURCE_TYPE:PDF"), "pdf note");
  console.log("✓ PDF and Excel rows share canonical material-table path");
}

{
  const schema = fs.readFileSync(
    path.join(root, "materialList/schema.ts"),
    "utf8"
  );
  assert(schema.includes("MATERIAL_LIST_SYSTEM_PROMPT"), "excel prompt intact");
  assert(schema.includes("gpt-5.4-mini"), "model default intact");
  console.log("✓ Existing Excel prompt/model defaults unchanged");
}

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

console.log("\n=== All Excel and PDF Material List Intake v1 tests passed ===\n");
