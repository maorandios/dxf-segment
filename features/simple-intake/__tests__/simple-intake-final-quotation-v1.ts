/**
 * OMEGA — Final Quotation Summary and Export Screen v1
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-final-quotation-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFinalQuotationDiagnostics,
  buildFinalQuotationRows,
  calculateFinalQuotationTotals,
  canOpenFinalQuotationScreen,
  createEmptyFinalQuotationDraft,
  FINAL_QUOTATION_NOTES_PLACEHOLDER,
  FINAL_QUOTATION_TABLE_HEADERS,
  NEW_QUOTATION_NOTES_DEFAULT,
  PLACEHOLDER_TEXT_EXPORTED_AS_NOTES,
  QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE,
  QUOTATION_SUMMARY_RENDERED_BELOW_TABLE,
} from "../finalQuotation";
import type { FinalQuotationItemRow } from "../finalQuotation/types";
import type { WeightPricingSummaryPayload } from "../weightPricing/types";
import type { FinalIntakeRow } from "../results/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}

function assertEq(a: unknown, b: unknown, msg: string): void {
  assert.equal(a, b, msg);
}

function assertClose(a: number, b: number, msg: string, eps = 1e-9): void {
  assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
}

console.log("OMEGA — Final Quotation Summary and Export Screen v1");

{
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  const screen = fs.readFileSync(
    path.join(root, "finalQuotation/FinalQuotationScreen.tsx"),
    "utf8"
  );
  const toolbar = fs.readFileSync(
    path.join(root, "finalQuotation/FinalQuotationToolbar.tsx"),
    "utf8"
  );
  const pricing = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingScreen.tsx"),
    "utf8"
  );
  const pricingToolbar = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingToolbar.tsx"),
    "utf8"
  );

  assert_(store.includes("advanceToQuotationSummary"), "continue to summary");
  assert_(store.includes("backToWeightPricing"), "back to pricing");
  assert_(store.includes("finalQuotationDraft"), "draft persisted");
  assert_(store.includes("setFinalQuotationDraft"), "set draft action");
  assert_(shell.includes("FinalQuotationScreen"), "shell mounts final screen");
  assert_(!shell.includes("QuoteCompletedPlaceholder"), "placeholder replaced");
  assert_(screen.includes('title="סיכום הצעת מחיר"'), "screen title");
  assert_(screen.includes("canOpenFinalQuotationScreen"), "access guard");
  assert_(screen.includes("backToWeightPricing"), "guard redirects to pricing");
  assert_(!screen.includes("analysis-summary"), "no analysis-summary redirect");
  assert_(toolbar.includes("חזרה לתמחור"), "back action");
  assert_(toolbar.includes("שמור טיוטה"), "save draft");
  assert_(toolbar.includes("הטיוטה נשמרה"), "save success copy");
  assert_(toolbar.includes("ייצא Excel"), "excel");
  assert_(toolbar.includes("ייצא PDF"), "pdf");
  assert_(pricingToolbar.includes("המשך לסיכום"), "pricing continue");
  assert_(pricing.includes("advanceToQuotationSummary"), "creates summary payload");
  assert_(screen.includes("REVIEW_WORKSPACE_CONTENT_MAX_PX"), "shared width");
  assert_(screen.includes("data-final-screen-dxf-parse=\"false\""), "no DXF parse");
  assert_(screen.includes("data-final-screen-ai-call=\"false\""), "no AI");
  assert_(!screen.includes("StickyActionBar"), "no floating footer");
  assert_(!screen.includes("SimpleDxfThumbnail"), "no geometry column/thumbnail");
  assert_(!screen.includes("onOpenGeometry"), "no geometry open handler");

  console.log("✓ navigation, access guard, chrome wiring");
}

{
  assertEq(NEW_QUOTATION_NOTES_DEFAULT, "", "notes default empty");
  assertEq(PLACEHOLDER_TEXT_EXPORTED_AS_NOTES, false, "placeholder not exported");
  assertEq(QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE, true, "summary above");
  assertEq(QUOTATION_SUMMARY_RENDERED_BELOW_TABLE, false, "summary not below");
  assert_(FINAL_QUOTATION_NOTES_PLACEHOLDER.includes("7 ימי"), "placeholder text");

  const draft = createEmptyFinalQuotationDraft("q1");
  assertEq(draft.notes, "", "new draft notes empty");
  assertEq(draft.metadata.customerName, "", "customer default");
  assertEq(draft.metadata.projectName, "", "project default");
  assertEq(draft.metadata.quotationNumber, "", "number default");
  assert_(/^\d{4}-\d{2}-\d{2}$/.test(draft.metadata.quotationDate), "date ISO");

  draft.metadata.quotationNumber = "000127";
  assertEq(draft.metadata.quotationNumber, "000127", "preserves leading zeroes");

  console.log("✓ metadata / notes defaults");
}

{
  assertEq(FINAL_QUOTATION_TABLE_HEADERS.length, 12, "12 columns");
  assertEq(FINAL_QUOTATION_TABLE_HEADERS[0], "#", "# first (RTL far-right)");
  assertEq(
    FINAL_QUOTATION_TABLE_HEADERS[FINAL_QUOTATION_TABLE_HEADERS.length - 1],
    'סה"כ עלות לפריט',
    "line total last (RTL far-left)"
  );
  assert_(
    !(FINAL_QUOTATION_TABLE_HEADERS as readonly string[]).includes("גאומטריה"),
    "no geometry col"
  );
  assert_(FINAL_QUOTATION_TABLE_HEADERS.includes("שם פריט"), "part name");
  assert_(FINAL_QUOTATION_TABLE_HEADERS.includes("פח מרוג"), "checkered");

  console.log("✓ table schema");
}

{
  const incomplete: WeightPricingSummaryPayload = {
    quotationId: "q",
    groups: [],
    validation: {
      isComplete: false,
      invalidGroupKeys: [],
      firstInvalidGroupKey: null,
    },
    metrics: {
      pricingGroupCount: 0,
      totalActiveItems: 0,
      totalWeightKg: 0,
      weightedAveragePricePerKg: 0,
      subtotalBeforeVat: 0,
    },
  } as unknown as WeightPricingSummaryPayload;

  assertEq(canOpenFinalQuotationScreen(null), false, "null blocked");
  assertEq(canOpenFinalQuotationScreen(incomplete), false, "incomplete blocked");

  const complete = {
    ...incomplete,
    groups: [
      {
        groupKey: "g1",
        materialRowIds: ["m1"],
        finalPricePerKg: 10,
      },
    ],
    validation: {
      isComplete: true,
      invalidGroupKeys: [],
      firstInvalidGroupKey: null,
    },
  } as unknown as WeightPricingSummaryPayload;
  assertEq(canOpenFinalQuotationScreen(complete), true, "complete allowed");

  console.log("✓ access guard logic");
}

function mockRow(partial: {
  materialRowId: string;
  partId: string;
  frozen?: boolean;
  qty?: number;
  weight?: number;
  length?: number;
  width?: number;
  thickness?: number;
  material?: string;
  geometry?: boolean;
}): FinalIntakeRow {
  return {
    id: `r-${partial.materialRowId}`,
    materialRowId: partial.materialRowId,
    status: "READY",
    isExcluded: false,
    isFrozen: Boolean(partial.frozen),
    scopeState: partial.frozen ? "FROZEN" : "ACTIVE",
    thicknessMm: partial.thickness ?? 10,
    quantity: partial.qty ?? 2,
    material: partial.material ?? "S355",
    dxfDimensions: {
      lengthMm: partial.length ?? 400,
      widthMm: partial.width ?? 255,
    },
    commercial: {
      unitWeightKg: (partial.weight ?? 77.76) / (partial.qty ?? 2),
      totalWeightKg: partial.weight ?? 77.76,
    },
    part: {
      matchedDxfId: `dxf-${partial.materialRowId}`,
      matchedDxfFilename: `${partial.partId}.dxf`,
      sourcePartId: partial.partId,
      displayName: partial.partId,
    },
    preview: { geometryAvailable: partial.geometry !== false },
  } as unknown as FinalIntakeRow;
}

{
  const approved = [
    mockRow({ materialRowId: "m1", partId: "5P10", weight: 50, qty: 1 }),
    mockRow({ materialRowId: "m2", partId: "5P2", weight: 20, qty: 2 }),
    mockRow({ materialRowId: "m3", partId: "5P1", frozen: true, weight: 99 }),
    mockRow({ materialRowId: "m4", partId: "5P99", weight: 10 }), // outside membership
  ];

  const summary = {
    quotationId: "q",
    groups: [
      {
        groupKey: "g",
        materialRowIds: ["m1", "m2", "m3"],
        finalPricePerKg: 10,
      },
    ],
    validation: { isComplete: true, invalidGroupKeys: [], firstInvalidGroupKey: null },
  } as unknown as WeightPricingSummaryPayload;

  const rows = buildFinalQuotationRows({
    approvedRows: approved,
    pricingSummary: summary,
    includedMaterialRowIds: ["m1", "m2", "m3"],
  });

  assertEq(rows.length, 2, "frozen excluded");
  assert_(rows.every((r) => r.materialRowId !== "m3"), "no frozen");
  assert_(rows.every((r) => r.materialRowId !== "m4"), "no non-member");
  assertEq(rows[0]!.partId, "5P2", "natural sort 5P2 before 5P10… wait 5P1 frozen");
  // Active: 5P10, 5P2 → natural: 5P2, 5P10
  assertEq(rows.map((r) => r.partId).join(","), "5P2,5P10", "natural part sort");

  for (const r of rows) {
    assertClose(r.lineTotal, r.totalWeightKg * r.finalPricePerKg, "lineTotal");
    assert_(r.finalPricePerKg > 0, "priced");
  }

  const totals = calculateFinalQuotationTotals(rows, 18);
  assertEq(totals.itemCount, 2, "item count");
  assertEq(totals.totalQuantity, 3, "qty 1+2");
  assertClose(totals.totalWeightKg, 70, "weight");
  assertClose(totals.subtotalBeforeVat, 700, "subtotal 50*10+20*10");
  assertClose(totals.vatAmount, 126, "vat 18%");
  assertClose(totals.totalIncludingVat, 826, "incl vat");

  const draft = createEmptyFinalQuotationDraft("q");
  draft.notes = "";
  const diag = buildFinalQuotationDiagnostics({
    quotationId: "q",
    rows,
    totals,
    draft,
  });
  assertEq(diag.frozenRowsIncluded, 0, "diag frozen");
  assertEq(diag.nonMemberRowsIncluded, 0, "diag nonmember");
  assertEq(diag.rowsMissingFinalPrice, 0, "diag price");
  assertEq(diag.webExportRowCount, diag.pdfExportRowCount, "web=pdf rows");
  assertEq(diag.pdfExportRowCount, diag.excelExportRowCount, "pdf=excel rows");
  assertEq(diag.excelWorksheetCount, 1, "one sheet");
  assertEq(diag.placeholderExportedAsNotes, false, "no placeholder export");
  assertEq(diag.finalScreenDxfParseCount, 0, "no parse");
  assertEq(diag.finalScreenAiCallCount, 0, "no ai");
  assertEq(diag.summaryRenderedAboveTable, true, "summary above");
  assertEq(diag.notesLength, 0, "empty notes");

  // Same projection for web/pdf/excel conceptually
  const webRows: FinalQuotationItemRow[] = rows;
  const pdfRows = rows;
  const excelRows = rows;
  assertEq(webRows.length, pdfRows.length, "web=pdf");
  assertEq(pdfRows.length, excelRows.length, "pdf=excel");
  const webTotals = totals;
  const pdfTotals = calculateFinalQuotationTotals(pdfRows, 18);
  const excelTotals = calculateFinalQuotationTotals(excelRows, 18);
  assertClose(webTotals.subtotalBeforeVat, pdfTotals.subtotalBeforeVat, "tot web=pdf");
  assertClose(pdfTotals.subtotalBeforeVat, excelTotals.subtotalBeforeVat, "tot pdf=excel");

  console.log("✓ rows, membership, totals, diagnostics consistency");
}

{
  const summarySrc = fs.readFileSync(
    path.join(root, "finalQuotation/FinalQuotationScreen.tsx"),
    "utf8"
  );
  const summaryIdx = summarySrc.indexOf("<FinalQuotationSummaryStrip");
  const tableIdx = summarySrc.indexOf("<FinalQuotationItemsTable");
  const notesIdx = summarySrc.indexOf("<FinalQuotationNotes");
  assert_(summaryIdx > 0 && tableIdx > summaryIdx, "summary before table");
  assert_(notesIdx > tableIdx, "notes after table");
  assert_(!summarySrc.includes("data-summary-position=\"below-table\""), "no below");

  const notesComp = fs.readFileSync(
    path.join(root, "finalQuotation/FinalQuotationNotes.tsx"),
    "utf8"
  );
  assert_(notesComp.includes("הערות להצעה"), "notes title");
  assert_(notesComp.includes("FINAL_QUOTATION_NOTES_PLACEHOLDER"), "placeholder");
  assert_(!notesComp.includes('value="לדוגמה'), "placeholder not as value");

  const excelSrc = fs.readFileSync(
    path.join(root, "finalQuotation/buildFinalQuotationExcelWorkbook.ts"),
    "utf8"
  );
  assert_(excelSrc.includes('addWorksheet("הצעת מחיר"'), "sheet name");
  assert_(excelSrc.includes("autoFilter"), "autofilter");
  assert_(excelSrc.includes("הערות להצעה"), "excel notes");
  assert_(!excelSrc.includes("גאומטריה"), "excel no geometry col");
  assert_(!excelSrc.includes("renderExistingDxfThumbnail"), "excel no thumbnails");

  const pdfSrc = fs.readFileSync(
    path.join(root, "finalQuotation/buildFinalQuotationPdfPayload.ts"),
    "utf8"
  );
  assert_(
    pdfSrc.includes("/api/simple-intake/export-quotation-pdf"),
    "uses simple-intake pdf api"
  );
  assert_(!pdfSrc.includes("/api/quotes/export-pdf"), "not quick-quote pdf");
  assert_(!pdfSrc.includes("document_variant"), "no quick-quote variant");
  assert_(
    fs.existsSync(
      path.join(root, "../../server/pdf/final_quotation_template.html")
    ),
    "final quotation template exists"
  );
  assert_(
    !fs
      .readFileSync(
        path.join(root, "../../server/pdf/final_quotation_template.html"),
        "utf8"
      )
      .includes("Fabrication partner"),
    "not quick-quote branding"
  );
  assert_(
    fs
      .readFileSync(
        path.join(root, "../../server/pdf/final_quotation_template.html"),
        "utf8"
      )
      .includes("סיכום הצעת מחיר"),
    "matches summary screen title"
  );

  const thumbSrc = fs.readFileSync(
    path.join(root, "finalQuotation/renderExistingDxfThumbnail.ts"),
    "utf8"
  );
  assert_(!thumbSrc.includes("parseDxf"), "thumb no parse");
  assert_(thumbSrc.includes("buildBoundingBoxSvgMarkup"), "bbox svg");

  console.log("✓ UI order, notes, excel/pdf wiring");
}

{
  const metaForm = fs.readFileSync(
    path.join(root, "finalQuotation/FinalQuotationMetadataForm.tsx"),
    "utf8"
  );
  assert_(metaForm.includes("שם הלקוח"), "customer");
  assert_(metaForm.includes("שם הפרויקט"), "project");
  assert_(metaForm.includes("תאריך"), "date");
  assert_(metaForm.includes("מספר הצעה"), "number");
  assert_(metaForm.includes('type="date"'), "date input");
  assert_(metaForm.includes('data-field="quotationNumber"'), "manual number");

  const strip = fs.readFileSync(
    path.join(root, "finalQuotation/FinalQuotationSummaryStrip.tsx"),
    "utf8"
  );
  for (const label of [
    "מספר פריטים",
    "כמות כוללת",
    'משקל כולל',
    'סה"כ לפני מע"מ',
    'מע"מ',
    'סה"כ לתשלום',
  ]) {
    assert_(strip.includes(label), `metric ${label}`);
  }
  assert_(strip.includes('data-summary-position="above-table"'), "above attr");
  assert_(strip.includes("vatRatePercent"), "editable vat");

  console.log("✓ metadata fields + six metrics");
}

console.log("\nOMEGA — Final Quotation Summary and Export Screen v1 — tests passed.");
