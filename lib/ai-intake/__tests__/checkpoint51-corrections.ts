/**
 * Focused post-5.1 corrections: header enrichment, coverage counters, metadata rows.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint51-corrections.ts
 */
import ExcelJS from "exceljs";
import {
  buildWorkbookSnapshot,
  enrichColumnHeadersFromSnapshot,
  classifyWorkbookMetadataRows,
  validateMappingCoverage,
  reconstructRawRows,
  type AiWorkbookMappingResult,
} from "../normalization";
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
  { canonicalPartId: "P1098", revision: null, filename: "P1098.dxf" },
];

/** Mimics real workbook: metadata rows 1–5, headers row 6, parts 16–17, empty thickness, total. */
async function buildRealLikeWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "Project Title — Plate Nest";

  ws.getCell("A2").value = "Project";
  ws.getCell("B2").value = "OMEGA-RFQ";
  ws.getCell("A3").value = "Project Number";
  ws.getCell("B3").value = "PRJ-100";
  ws.getCell("A4").value = "Date";
  ws.getCell("B4").value = "2026-07-16";
  ws.getCell("A5").value = "Customer notes only";

  ws.getCell("B6").value = "Part";
  ws.getCell("C6").value = "Qty";
  ws.getCell("D6").value = "Thickness";
  ws.getCell("E6").value = "Width(mm)";
  ws.getCell("F6").value = "Length(m)";
  ws.getCell("G6").value = "Area(m2)";

  ws.getCell("B16").value = "P1095";
  ws.getCell("C16").value = 24;
  ws.getCell("D16").value = 20;
  ws.getCell("E16").value = 300;
  ws.getCell("F16").value = 0.5;

  ws.getCell("B17").value = "P1095";
  ws.getCell("C17").value = 10;
  ws.getCell("D17").value = 20;

  ws.getCell("B18").value = "P1098";
  ws.getCell("C18").value = 5;
  // D18 thickness intentionally empty

  ws.getCell("B20").value = "Total";
  ws.getCell("C20").value = { formula: "SUM(C16:C18)", result: 39 };

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

function modelMappingNullHeaders(): AiWorkbookMappingResult {
  return {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: "B6:G20",
            headerRowNumbers: [6],
            firstDataRow: 16,
            lastDataRow: 20,
            columns: {
              partReference: "B",
              quantity: "C",
              thickness: "D",
              material: null,
              width: "E",
              height: "F",
              area: "G",
              totalArea: null,
              unitWeight: null,
              totalWeight: null,
            },
            columnHeaders: [
              {
                columnLetter: "E",
                rawHeaderText: null,
                detectedMeaning: "width",
                statedUnitText: null,
              },
              {
                columnLetter: "F",
                rawHeaderText: null,
                detectedMeaning: "height/length",
                statedUnitText: null,
              },
              {
                columnLetter: "G",
                rawHeaderText: null,
                detectedMeaning: "area",
                statedUnitText: null,
              },
            ],
            rowRoles: [
              { rowNumber: 6, role: "HEADER", reason: "header" },
              { rowNumber: 16, role: "PART", reason: "part" },
              { rowNumber: 17, role: "PART", reason: "part" },
              { rowNumber: 18, role: "PART", reason: "part" },
              { rowNumber: 19, role: "EMPTY", reason: "gap" },
              { rowNumber: 20, role: "TOTAL", reason: "total" },
            ],
            warnings: [],
          },
        ],
        unmappedNonEmptyRows: [1, 2, 3, 4, 5],
      },
    ],
  };
}

async function main() {
  const buf = await buildRealLikeWorkbook();
  const parsed = await buildWorkbookSnapshot({
    documentId: "doc:xlsx:real",
    fileName: "real-like.xlsx",
    buffer: buf,
  });
  assert(parsed.ok, "parse ok");
  const snapshot = parsed.snapshot;

  let mapping = modelMappingNullHeaders();
  mapping = enrichColumnHeadersFromSnapshot(snapshot, mapping);

  const e6 = mapping.sheets[0]!.tables[0]!.columnHeaders.find(
    (h) => h.columnLetter === "E"
  );
  const f6 = mapping.sheets[0]!.tables[0]!.columnHeaders.find(
    (h) => h.columnLetter === "F"
  );
  const g6 = mapping.sheets[0]!.tables[0]!.columnHeaders.find(
    (h) => h.columnLetter === "G"
  );

  console.log("\n=== Test 1–2 — enriched headers E6/F6/G6 ===");
  assertEq(e6?.rawHeaderText, "Width(mm)", "E6 rawHeaderText");
  assertEq(f6?.rawHeaderText, "Length(m)", "F6 rawHeaderText");
  assertEq(g6?.rawHeaderText, "Area(m2)", "G6 rawHeaderText");
  assertEq(e6?.statedUnitText, "mm", "E6 statedUnitText");
  assertEq(f6?.statedUnitText, "m", "F6 statedUnitText");
  assertEq(g6?.statedUnitText, "m2", "G6 statedUnitText");
  assert(
    e6?.headerCellReferences?.includes("E6"),
    "E6 headerCellReferences"
  );
  console.log(
    "enriched header JSON:",
    JSON.stringify({ E: e6, F: f6, G: g6 }, null, 2)
  );

  const classified = classifyWorkbookMetadataRows(snapshot, mapping);
  mapping = classified.mapping;

  console.log("\n=== Test 4 — rows 1–5 classification ===");
  const roles = mapping.sheets[0]!.tables[0]!.rowRoles.filter((r) =>
    [1, 2, 3, 4, 5].includes(r.rowNumber)
  );
  assert(roles.length >= 5, `rows 1–5 classified, got ${roles.length}`);
  for (const r of roles) {
    assert(
      r.role === "HEADER" || r.role === "NOTE",
      `row ${r.rowNumber} HEADER|NOTE got ${r.role}`
    );
  }
  assertEq(
    mapping.sheets[0]!.unmappedNonEmptyRows.length,
    0,
    "no unmapped after metadata pass"
  );
  assert(
    classified.info.every((i) => i.startsWith("INFO_")),
    "metadata reported as INFO"
  );
  console.log(
    "rows 1–5:",
    JSON.stringify(
      roles.map((r) => ({ row: r.rowNumber, role: r.role, reason: r.reason })),
      null,
      2
    )
  );

  const coverage = validateMappingCoverage(snapshot, mapping);
  console.log("\n=== Test 3 — coverage counters ===");
  assert(
    coverage.mappedRowCount <= coverage.sourceNonEmptyRowCount,
    `mappedRowCount ${coverage.mappedRowCount} <= sourceNonEmptyRowCount ${coverage.sourceNonEmptyRowCount}`
  );
  assert(
    coverage.accountedNonEmptyRowCount <= coverage.sourceNonEmptyRowCount,
    "accounted <= source"
  );
  assertEq(coverage.mappedEmptyRowCount, 1, "EMPTY counted separately");
  assert(
    coverage.coverageComplete,
    `coverageComplete: ${JSON.stringify(coverage)}`
  );
  console.log("revised coverage JSON:", JSON.stringify(coverage, null, 2));

  const recon = reconstructRawRows({ snapshot, mapping, registry });

  console.log("\n=== Test 5 — P1095 rows 16 and 17 separate ===");
  const p1095 = recon.partRows.filter((r) => r.rawPartReference === "P1095");
  assertEq(p1095.length, 2, "two P1095");
  assert(
    new Set(p1095.map((r) => r.occurrenceId)).size === 2,
    "distinct occurrence IDs"
  );

  console.log("\n=== Test 6 — P1098 thickness null ===");
  const p1098 = recon.partRows.find((r) => r.rawPartReference === "P1098");
  assert(p1098, "P1098");
  assertEq(p1098.thickness?.rawValue ?? null, null, "thickness null");
  assertEq(p1098.thickness?.sourceCell, "D18", "thickness sourceCell");

  console.log("\n=== Test 7 — TOTAL excluded from BOM ===");
  assert(
    !recon.partRows.some((r) => r.source.rowNumber === 20),
    "total not in BOM"
  );
  assert(
    recon.excludedTotalSubtotalRows.some((r) => r.source.rowNumber === 20),
    "total in audit"
  );

  console.log("\nAll correction tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
