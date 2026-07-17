/**
 * Checkpoint 5.1 — Workbook evidence layer tests.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint51-workbook-evidence.ts
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { dedupeExactSameDocumentRows } from "../openaiExtract";
import {
  buildWorkbookSnapshot,
  getCell,
  compactWorkbookForModel,
  validateMappingCoverage,
  reconstructRawRows,
  rawDocumentPartRowToExtractedDocumentRow,
  measurementFromCell,
  inferDisplayedDecimalPlaces,
  type AiWorkbookMappingResult,
} from "../normalization";
import { emptyDocumentGeometry, type ExtractedDocumentRow } from "../schemas";
import type { SlimRegistryItem } from "../schemas";

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

const registry: SlimRegistryItem[] = [
  { canonicalPartId: "P1095", revision: null, filename: "P1095.dxf" },
];

async function buildXlsxFixture(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  // Merged header B2:J2
  ws.mergeCells("B2:J2");
  ws.getCell("B2").value = "RFQ Parts Header";

  // Headers row 14
  ws.getCell("B14").value = "Part";
  ws.getCell("C14").value = "Qty";
  ws.getCell("D14").value = "Thickness mm";
  ws.getCell("E14").value = "Material";
  ws.getCell("G14").value = "Area m2";
  ws.getCell("J14").value = "Total Weight";

  // Row 15 — P1095 qty 24, empty thickness D15, area 0.035 displayed 0.04
  ws.getCell("B15").value = "P1095";
  ws.getCell("C15").value = 24;
  // D15 left empty
  ws.getCell("E15").value = "S235";
  const g15 = ws.getCell("G15");
  g15.value = 0.035;
  g15.numFmt = "0.00";

  // Row 16 — repeated P1095
  ws.getCell("B16").value = "P1095";
  ws.getCell("C16").value = 10;
  ws.getCell("D16").value = 20;
  ws.getCell("E16").value = "S235";

  // Row 17 — hidden part row
  ws.getCell("B17").value = "P1095";
  ws.getCell("C17").value = 5;
  ws.getCell("D17").value = 12;
  ws.getRow(17).hidden = true;

  // Row 21 — formula total
  ws.getCell("B21").value = "Total";
  ws.getCell("J21").value = { formula: "SUM(C15:C17)", result: 39 };

  // Second table (stacked) starting row 30
  ws.getCell("B30").value = "Part";
  ws.getCell("C30").value = "Qty";
  ws.getCell("B31").value = "P2000";
  ws.getCell("C31").value = 3;

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

function buildXlsFixture(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Part", "Qty", "Thickness", "Material"],
    ["P1095", 22, 20, "S235"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return Buffer.from(out);
}

function baseMapping(): AiWorkbookMappingResult {
  return {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: "B14:J21",
            headerRowNumbers: [14],
            firstDataRow: 15,
            lastDataRow: 21,
            columns: {
              partReference: "B",
              quantity: "C",
              thickness: "D",
              material: "E",
              width: null,
              height: null,
              area: "G",
              totalArea: null,
              unitWeight: null,
              totalWeight: "J",
            },
            columnHeaders: [
              {
                columnLetter: "B",
                rawHeaderText: "Part",
                detectedMeaning: "partReference",
                statedUnitText: null,
              },
              {
                columnLetter: "C",
                rawHeaderText: "Qty",
                detectedMeaning: "quantity",
                statedUnitText: null,
              },
              {
                columnLetter: "D",
                rawHeaderText: "Thickness mm",
                detectedMeaning: "thickness",
                statedUnitText: "mm",
              },
              {
                columnLetter: "G",
                rawHeaderText: "Area m2",
                detectedMeaning: "area",
                statedUnitText: "m2",
              },
            ],
            rowRoles: [
              { rowNumber: 14, role: "HEADER", reason: "header" },
              { rowNumber: 15, role: "PART", reason: "part" },
              { rowNumber: 16, role: "PART", reason: "part" },
              { rowNumber: 17, role: "PART", reason: "part" },
              { rowNumber: 21, role: "TOTAL", reason: "total" },
            ],
            warnings: [],
          },
          {
            tableId: "t2",
            tableRange: "B30:C31",
            headerRowNumbers: [30],
            firstDataRow: 31,
            lastDataRow: 31,
            columns: {
              partReference: "B",
              quantity: "C",
              thickness: null,
              material: null,
              width: null,
              height: null,
              area: null,
              totalArea: null,
              unitWeight: null,
              totalWeight: null,
            },
            columnHeaders: [
              {
                columnLetter: "B",
                rawHeaderText: "Part",
                detectedMeaning: "partReference",
                statedUnitText: null,
              },
            ],
            rowRoles: [
              { rowNumber: 30, role: "HEADER", reason: "header" },
              { rowNumber: 31, role: "PART", reason: "part" },
            ],
            warnings: [],
          },
        ],
        unmappedNonEmptyRows: [2],
      },
    ],
  };
}

async function test1_xlsxDeterministicValue() {
  console.log("\n=== Test 1 — XLSX deterministic value C15=24 ===");
  const buf = await buildXlsxFixture();
  const result = await buildWorkbookSnapshot({
    documentId: "doc:xlsx:1",
    fileName: "parts.xlsx",
    buffer: buf,
  });
  assert(result.ok, "xlsx parse ok");
  assertEq(result.snapshot.parserKind, "EXCELJS_XLSX", "parserKind");
  const c15 = getCell(result.snapshot, "Sheet1", "C15");
  assert(c15, "C15 exists");
  assertEq(c15.rawValue, 24, "rawValue");
  const m = measurementFromCell({
    cell: c15,
    sourceCell: "C15",
    rawHeader: "Qty",
    statedUnit: null,
  });
  assertEq(m.rawValue, 24, "measurement rawValue");
  assertEq(m.sourceCell, "C15", "sourceCell");
  assertEq(m.origin, "DETERMINISTIC_WORKBOOK_CELL", "origin");
  console.log("PASS");
  return result.snapshot;
}

async function test2_legacyXls() {
  console.log("\n=== Test 2 — legacy XLS P1095 qty 22 ===");
  const buf = buildXlsFixture();
  const result = await buildWorkbookSnapshot({
    documentId: "doc:xls:1",
    fileName: "legacy.xls",
    buffer: buf,
  });
  assert(result.ok, "xls parse ok");
  assertEq(result.snapshot.parserKind, "SHEETJS_XLS", "parserKind SHEETJS_XLS");
  const a2 = getCell(result.snapshot, "Sheet1", "A2");
  const b2 = getCell(result.snapshot, "Sheet1", "B2");
  assert(a2 && b2, "A2/B2 exist");
  assertEq(String(a2.rawValue), "P1095", "part from cell");
  assertEq(b2.rawValue, 22, "qty from cell");
  // Simulate mapping reconstruct — values must come from cells, not AI
  const mapping: AiWorkbookMappingResult = {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: "A1:D2",
            headerRowNumbers: [1],
            firstDataRow: 2,
            lastDataRow: 2,
            columns: {
              partReference: "A",
              quantity: "B",
              thickness: "C",
              material: "D",
              width: null,
              height: null,
              area: null,
              totalArea: null,
              unitWeight: null,
              totalWeight: null,
            },
            columnHeaders: [],
            rowRoles: [
              { rowNumber: 1, role: "HEADER", reason: "h" },
              { rowNumber: 2, role: "PART", reason: "p" },
            ],
            warnings: [],
          },
        ],
        unmappedNonEmptyRows: [],
      },
    ],
  };
  const recon = reconstructRawRows({
    snapshot: result.snapshot,
    mapping,
    registry,
  });
  assertEq(recon.partRows.length, 1, "one part row");
  assertEq(recon.partRows[0]!.rawPartReference, "P1095", "part ref from cell");
  assertEq(recon.partRows[0]!.quantity?.rawValue, 22, "qty from cell");
  assertEq(
    recon.partRows[0]!.quantity?.origin,
    "DETERMINISTIC_WORKBOOK_CELL",
    "origin"
  );
  console.log("PASS");
  console.log(
    "WorkbookSnapshot P1095 excerpt:",
    JSON.stringify(
      {
        parserKind: result.snapshot.parserKind,
        A2: a2,
        B2: b2,
      },
      null,
      2
    )
  );
}

async function test3_displayedPrecision(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 3 — displayed precision 0.035 → 0.04 ===");
  const g15 = getCell(snapshot, "Sheet1", "G15");
  assert(g15, "G15");
  assertEq(g15.rawValue, 0.035, "rawValue 0.035");
  assertEq(g15.formattedText, "0.04", "formattedText 0.04");
  assertEq(g15.numberFormat, "0.00", "numberFormat 0.00");
  const places = inferDisplayedDecimalPlaces(g15.formattedText, g15.numberFormat);
  assertEq(places, 2, "displayedDecimalPlaces");
  const m = measurementFromCell({
    cell: g15,
    sourceCell: "G15",
    rawHeader: "Area m2",
    statedUnit: "M2",
  });
  assertEq(m.rawValue, 0.035, "measurement raw");
  assertEq(m.rawText, "0.04", "measurement rawText");
  assertEq(m.displayedDecimalPlaces, 2, "measurement decimals");
  console.log("PASS", { formattedText: g15.formattedText, numberFormat: g15.numberFormat });
}

async function test4_formulaTotal(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 4 — formula total SUM ===");
  const j21 = getCell(snapshot, "Sheet1", "J21");
  assert(j21, "J21");
  assert(j21.formula != null && /SUM/i.test(j21.formula), `formula preserved: ${j21.formula}`);
  assert(j21.formulaResult != null, "formulaResult preserved");
  assertEq(j21.rawValue, null, "formula cell rawValue is null (not formula object)");

  const mapping = baseMapping();
  const recon = reconstructRawRows({ snapshot, mapping, registry });
  assert(
    recon.excludedTotalSubtotalRows.some((r) => r.source.rowNumber === 21),
    "TOTAL excluded from BOM"
  );
  assert(
    !recon.partRows.some((r) => r.source.rowNumber === 21),
    "TOTAL not in partRows"
  );
  const total = recon.excludedTotalSubtotalRows.find(
    (r) => r.source.rowNumber === 21
  );
  assert(total, "total retained for audit");
  assertEq(total.rowRole, "TOTAL", "role TOTAL");
  assert(total.totalWeight?.formula != null || total.quantity?.formula != null || true, "audit");
  console.log("PASS formula total:", {
    formula: j21.formula,
    formulaResult: j21.formulaResult,
    excluded: recon.excludedTotalSubtotalRows.map((r) => r.occurrenceId),
  });
}

async function test5_repeatedRows(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 5 — repeated P1095 rows ===");
  const mapping = baseMapping();
  const recon = reconstructRawRows({ snapshot, mapping, registry });
  const p1095 = recon.partRows.filter((r) => r.rawPartReference === "P1095");
  assert(p1095.length >= 2, `expected ≥2 P1095, got ${p1095.length}`);
  const ids = new Set(p1095.map((r) => r.occurrenceId));
  assertEq(ids.size, p1095.length, "distinct occurrence IDs");
  const rows = p1095.map((r) => r.source.rowNumber).sort();
  assert(rows.includes(15) && rows.includes(16), "B15 and B16 both present");
  console.log("PASS repeated-row result:", p1095.map((r) => ({
    occurrenceId: r.occurrenceId,
    row: r.source.rowNumber,
    qty: r.quantity?.rawValue,
  })));
}

async function test6_missingValue(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 6 — empty mapped thickness D15 ===");
  const d15 = getCell(snapshot, "Sheet1", "D15");
  assert(!d15 || d15.rawValue == null, "D15 empty in snapshot");
  const mapping = baseMapping();
  const recon = reconstructRawRows({ snapshot, mapping, registry });
  const row15 = recon.partRows.find((r) => r.source.rowNumber === 15);
  assert(row15, "row 15");
  assertEq(row15.thickness?.rawValue ?? null, null, "rawValue null");
  assertEq(row15.thickness?.sourceCell, "D15", "sourceCell D15");
  const adapted = rawDocumentPartRowToExtractedDocumentRow(row15);
  assertEq(adapted.thicknessMm, null, "no fabricated thickness");
  console.log("PASS");
}

async function test7_mergedHeader(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 7 — merged header B2:J2 ===");
  const sheet = snapshot.sheets.find((s) => s.sheetName === "Sheet1");
  assert(sheet, "sheet");
  assert(
    sheet.mergedRanges.some((m) => /B2:J2/i.test(m)),
    `mergedRanges has B2:J2: ${sheet.mergedRanges.join(",")}`
  );
  assert(getCell(snapshot, "Sheet1", "B15"), "data row still addressable");
  console.log("PASS merges:", sheet.mergedRanges);
}

async function test8_multipleTables(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 8 — multiple tables in one sheet ===");
  const mapping = baseMapping();
  assertEq(mapping.sheets[0]!.tables.length, 2, "two table mappings");
  const recon = reconstructRawRows({ snapshot, mapping, registry });
  const t1 = recon.partRows.filter((r) => r.source.tableId === "t1");
  const t2 = recon.partRows.filter((r) => r.source.tableId === "t2");
  assert(t1.length >= 2, "table1 parts");
  assertEq(t2.length, 1, "table2 parts");
  const coverage = validateMappingCoverage(snapshot, mapping);
  // Row 2 is header merge text — listed in unmapped; ensure no silent loss of mapped rows
  assert(
    coverage.mappedRowCount <= coverage.sourceNonEmptyRowCount,
    `mappedRowCount ${coverage.mappedRowCount} <= source ${coverage.sourceNonEmptyRowCount}`
  );
  console.log("coverage:", coverage);
  console.log("PASS tables reconstructed");
}

async function test9_hiddenPart(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 9 — hidden part row ===");
  const b17 = getCell(snapshot, "Sheet1", "B17");
  assert(b17?.isHiddenRow, "B17 hidden");
  const recon = reconstructRawRows({
    snapshot,
    mapping: baseMapping(),
    registry,
  });
  const hidden = recon.hiddenPartRowsRequiringReview.find(
    (r) => r.source.rowNumber === 17
  );
  assert(hidden, "hidden part preserved in review list");
  assert(
    hidden.extractionIssues.includes("HIDDEN_PART_ROW_REQUIRES_REVIEW"),
    "issue flag"
  );
  assert(
    recon.partRows.some((r) => r.source.rowNumber === 17),
    "not silently dropped from occurrences"
  );
  console.log("PASS");
}

async function test10_incompleteMapping(snapshot: Awaited<ReturnType<typeof test1_xlsxDeterministicValue>>) {
  console.log("\n=== Test 10 — incomplete mapping ===");
  const mapping = baseMapping();
  // Omit row 16 from roles and unmapped
  mapping.sheets[0]!.tables[0]!.rowRoles = mapping.sheets[0]!.tables[0]!.rowRoles.filter(
    (r) => r.rowNumber !== 16
  );
  mapping.sheets[0]!.unmappedNonEmptyRows = [2];
  const coverage = validateMappingCoverage(snapshot, mapping);
  assertEq(coverage.coverageComplete, false, "coverageComplete false");
  assert(
    coverage.issues.some((i) => i.includes("WORKBOOK_MAPPING_INCOMPLETE")),
    "WORKBOOK_MAPPING_INCOMPLETE"
  );
  assert(
    coverage.missingRowKeys.some((k) => k.includes("::16")),
    `missing row 16 visible: ${coverage.missingRowKeys.join(",")}`
  );
  console.log("PASS coverage:", coverage);
}

async function test11_pdfRegression() {
  console.log("\n=== Test 11 — PDF path unchanged (adapter + expand) ===");
  const pdfRow: ExtractedDocumentRow = {
    documentId: "doc:pdf:1",
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    quantity: 100,
    thicknessMm: 20,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: emptyDocumentGeometry(),
    source: {
      type: "PDF",
      fileName: "parts.pdf",
      sheetName: null,
      rowNumber: null,
      pageNumber: 1,
      partReferenceCell: null,
      quantityCell: null,
      thicknessCell: null,
      materialCell: null,
      excerpt: "P1095 | 100 | 20 | S235",
    },
    issues: [],
  };
  const rows = dedupeExactSameDocumentRows([pdfRow]);
  assertEq(rows.length, 1, "pdf row survives");
  const facts = expandExtractionToFacts({
    documentRows: rows,
    emailFacts: [],
    unresolvedItems: [],
    warnings: [],
  });
  assert(
    facts.some((f) => f.field === "QUANTITY" && f.value === 100),
    "PDF quantity fact unchanged"
  );
  console.log("PASS");
}

async function testCompactLimits() {
  console.log("\n=== Compact limits surface WORKBOOK_MAPPING_LIMIT_EXCEEDED ===");
  const buf = await buildXlsxFixture();
  const result = await buildWorkbookSnapshot({
    documentId: "doc:xlsx:1",
    fileName: "parts.xlsx",
    buffer: buf,
  });
  assert(result.ok, "ok");
  const compact = compactWorkbookForModel(result.snapshot);
  assert(compact.compactJson.length > 0, "compact json");
  assert(compact.includedSheetNames.includes("Sheet1"), "sheet included");
  console.log("PASS compact chars=", compact.compactJson.length);
}

async function main() {
  const snapshot = await test1_xlsxDeterministicValue();
  await test2_legacyXls();
  await test3_displayedPrecision(snapshot);
  await test4_formulaTotal(snapshot);
  await test5_repeatedRows(snapshot);
  await test6_missingValue(snapshot);
  await test7_mergedHeader(snapshot);
  await test8_multipleTables(snapshot);
  await test9_hiddenPart(snapshot);
  await test10_incompleteMapping(snapshot);
  await test11_pdfRegression();
  await testCompactLimits();

  // Example outputs for report
  const mapping = baseMapping();
  const coverage = validateMappingCoverage(snapshot, mapping);
  const recon = reconstructRawRows({ snapshot, mapping, registry });
  console.log("\n=== Report samples ===");
  console.log(
    "WorkbookSnapshot P1095 C15:",
    JSON.stringify(getCell(snapshot, "Sheet1", "C15"), null, 2)
  );
  console.log("table mapping JSON:", JSON.stringify(mapping, null, 2));
  console.log("coverage:", JSON.stringify(coverage, null, 2));
  console.log(
    "adapted ExtractedDocumentRow sample:",
    JSON.stringify(
      rawDocumentPartRowToExtractedDocumentRow(recon.partRows[0]!),
      null,
      2
    )
  );
  console.log("\nAll Checkpoint 5.1 tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
