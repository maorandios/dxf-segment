/**
 * Checkpoint 5.2 — unit profiles, deterministic resolution, precision comparison.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint52-unit-normalization.ts
 */
import * as XLSX from "xlsx";
import {
  buildWorkbookSnapshot,
  compareWithPrecision,
  convertAreaToMm2,
  convertLengthToMm,
  convertMassToKg,
  inferDisplayedDecimalPlaces,
  measurementFromCell,
  normalizePartRow,
  normalizeWorkbookPartRows,
  normalizedPartRowToExtractedDocumentRow,
  parseNumericWithOptionalUnit,
  parseUnitText,
  rawMeasurementSnapshot,
  type AiWorkbookMappingResult,
  type ColumnUnitProfile,
  type RawDocumentPartRow,
  type RawMeasurement,
} from "../normalization";
import { compareDocumentsToDxfGeometry } from "../compareDocumentDxfGeometry";
import { emptyDocumentGeometry } from "../schemas";

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

function rawMeas(
  partial: Partial<RawMeasurement> & {
    rawValue: number | string | null;
  }
): RawMeasurement {
  return {
    rawValue: partial.rawValue,
    rawText: partial.rawText ?? (partial.rawValue != null ? String(partial.rawValue) : null),
    statedUnit: partial.statedUnit ?? null,
    rawHeader: partial.rawHeader ?? null,
    displayedDecimalPlaces: partial.displayedDecimalPlaces ?? null,
    sourceCell: partial.sourceCell ?? null,
    numberFormat: partial.numberFormat ?? null,
    formula: partial.formula ?? null,
    formulaResult: partial.formulaResult ?? null,
    origin: partial.origin ?? "DETERMINISTIC_WORKBOOK_CELL",
  };
}

function partRow(args: {
  id?: string;
  part?: string;
  matched?: string | null;
  width?: RawMeasurement | null;
  height?: RawMeasurement | null;
  area?: RawMeasurement | null;
  thickness?: RawMeasurement | null;
  qty?: number;
  tableId?: string;
  row?: number;
}): RawDocumentPartRow {
  return {
    occurrenceId: args.id ?? `occ:${args.row ?? 1}`,
    documentId: "doc:1",
    rowRole: "PART",
    matchedDxfPartId: args.matched ?? args.part ?? null,
    rawPartReference: args.part ?? null,
    partReferenceCell: null,
    materialCell: null,
    quantity: rawMeas({ rawValue: args.qty ?? 1, sourceCell: "C1" }),
    thickness: args.thickness ?? null,
    material: null,
    width: args.width ?? null,
    height: args.height ?? null,
    area: args.area ?? null,
    totalArea: null,
    unitWeight: null,
    totalWeight: null,
    description: null,
    notes: null,
    source: {
      type: "XLSX",
      fileName: "t.xlsx",
      sheetName: "Sheet1",
      rowNumber: args.row ?? 16,
      pageNumber: null,
      excerpt: null,
      tableId: args.tableId ?? "t1",
    },
    extractionIssues: [],
    isHiddenRow: false,
  };
}

function mappingFor(headers: {
  width: string;
  height: string;
  area: string;
}): AiWorkbookMappingResult {
  return {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: null,
            headerRowNumbers: [6],
            firstDataRow: 16,
            lastDataRow: 16,
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
                rawHeaderText: headers.width,
                detectedMeaning: "width",
                statedUnitText: null,
                headerCellReferences: ["E6"],
              },
              {
                columnLetter: "F",
                rawHeaderText: headers.height,
                detectedMeaning: "height/length",
                statedUnitText: null,
                headerCellReferences: ["F6"],
              },
              {
                columnLetter: "G",
                rawHeaderText: headers.area,
                detectedMeaning: "area",
                statedUnitText: null,
                headerCellReferences: ["G6"],
              },
            ],
            rowRoles: [],
            warnings: [],
          },
        ],
        unmappedNonEmptyRows: [],
      },
    ],
  };
}

function profileLookup(
  profiles: ColumnUnitProfile[],
  field: ColumnUnitProfile["semanticField"]
): ColumnUnitProfile | null {
  return profiles.find((p) => p.semanticField === field) ?? null;
}

async function test1_correctLabels() {
  console.log("\n=== Test 1 — correctly labeled units ===");
  const mapping = mappingFor({
    width: "Width(mm)",
    height: "Length(mm)",
    area: "Area(m2)",
  });
  // Enrich stated units like production does via parse on headers
  for (const h of mapping.sheets[0]!.tables[0]!.columnHeaders) {
    const u = parseUnitText(h.rawHeaderText);
    if (u === "MM" || u === "M" || u === "CM" || u === "M2" || u === "MM2" || u === "CM2") {
      // stated applied on RawMeasurement
    }
  }
  const row = partRow({
    part: "P1",
    matched: "P1",
    width: rawMeas({
      rawValue: 600,
      statedUnit: "MM",
      rawHeader: "Width(mm)",
      sourceCell: "E16",
    }),
    height: rawMeas({
      rawValue: 600,
      statedUnit: "MM",
      rawHeader: "Length(mm)",
      sourceCell: "F16",
    }),
    area: rawMeas({
      rawValue: 0.36,
      statedUnit: "M2",
      rawHeader: "Area(m2)",
      sourceCell: "G16",
      displayedDecimalPlaces: 2,
    }),
  });
  const result = normalizeWorkbookPartRows({
    documentId: "doc:1",
    mapping,
    partRows: [row],
    registry: [
      {
        canonicalPartId: "P1",
        revision: null,
        filename: "P1.dxf",
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
      },
    ],
  });
  const n = result.normalizedRows[0]!;
  assertEq(n.width?.normalizedValue, 600, "width mm");
  assertEq(n.width?.normalizedUnit, "MM", "width unit");
  assertEq(n.width?.resolutionStatus, "AS_STATED", "width status");
  assertEq(n.height?.normalizedValue, 600, "height mm");
  assertEq(n.height?.resolutionStatus, "AS_STATED", "height status");
  assertEq(n.area?.normalizedValue, 360000, "area mm2");
  assertEq(n.area?.normalizedUnit, "MM2", "area unit");
  assertEq(n.area?.resolutionStatus, "AS_STATED", "area status");
  console.log("PASS");
}

async function test2_wrongHeader() {
  console.log("\n=== Test 2 — real wrong header Length(m) → MM ===");
  const mapping = mappingFor({
    width: "Width(mm)",
    height: "Length(m)",
    area: "Area(m2)",
  });
  const row = partRow({
    part: "P1092",
    matched: "P1092",
    width: rawMeas({
      rawValue: 600,
      statedUnit: "MM",
      rawHeader: "Width(mm)",
      sourceCell: "E16",
    }),
    height: rawMeas({
      rawValue: 600,
      statedUnit: "M",
      rawHeader: "Length(m)",
      sourceCell: "F16",
    }),
    area: rawMeas({
      rawValue: 0.36,
      statedUnit: "M2",
      rawHeader: "Area(m2)",
      sourceCell: "G16",
      displayedDecimalPlaces: 2,
    }),
  });
  const result = normalizeWorkbookPartRows({
    documentId: "doc:1",
    mapping,
    partRows: [row],
    registry: [
      {
        canonicalPartId: "P1092",
        revision: null,
        filename: "P1092.dxf",
        widthMm: 600,
        heightMm: 600,
        plateAreaMm2: 360000,
      },
    ],
  });
  const n = result.normalizedRows[0]!;
  console.log(
    "P1092 height JSON:",
    JSON.stringify(
      {
        rawValue: n.height?.raw.rawValue,
        rawHeader: n.height?.raw.rawHeader,
        statedUnit: n.height?.statedUnit,
        resolvedSourceUnit: n.height?.resolvedSourceUnit,
        normalizedValue: n.height?.normalizedValue,
        normalizedUnit: n.height?.normalizedUnit,
        resolutionStatus: n.height?.resolutionStatus,
        issues: n.height?.issues.map((i) => i.code),
      },
      null,
      2
    )
  );
  assertEq(n.height?.normalizedValue, 600, "height → 600 mm");
  assertEq(n.height?.resolvedSourceUnit, "MM", "resolved MM");
  assert(
    n.height?.resolutionStatus === "RESOLVED_BY_ROW_CONSISTENCY" ||
      n.height?.resolutionStatus === "RESOLVED_BY_DXF_CORRELATION" ||
      n.height?.resolutionStatus === "RESOLVED_BY_COLUMN_CONSISTENCY",
    `status=${n.height?.resolutionStatus}`
  );
  assert(
    n.height?.issues.some(
      (i) => i.code === "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED"
    ),
    "inconsistent label issue"
  );
  assertEq(n.height?.raw.rawHeader, "Length(m)", "header preserved");

  const adapted = normalizedPartRowToExtractedDocumentRow(n);
  assertEq(adapted.documentGeometry.heightUnit, "MM", "adapter height unit MM");
  assertEq(adapted.documentGeometry.height, 600, "adapter height value");

  const geo = compareDocumentsToDxfGeometry({
    documentRows: [adapted],
    partId: "P1092",
    dxf: {
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
      netContourAreaMm2: 360000,
      perimeterMm: 2400,
    },
    resolved: { thicknessMm: 10, material: "S235", quantity: 1 },
  });
  assert(
    !geo.issues.includes("DOCUMENT_DXF_DIMENSION_MISMATCH"),
    `no false dimension mismatch: ${geo.issues.join(",")}`
  );
  console.log("PASS");
}

async function test3_roundedArea() {
  console.log("\n=== Test 3 — rounded area 0.16 vs 0.1624 ===");
  const cmp = compareWithPrecision({
    expectedValue: 0.1624,
    sourceValue: 0.16,
    displayedDecimalPlaces: 2,
    absoluteTolerance: 0,
    relativeTolerance: 0.02,
  });
  console.log("P1093 precision JSON:", JSON.stringify(cmp, null, 2));
  assertEq(cmp.status, "MATCH_AFTER_ROUNDING", "status");
  console.log("PASS");
}

async function test4_ambiguous() {
  console.log("\n=== Test 4 — genuinely ambiguous ===");
  const mapping = mappingFor({
    width: "Width",
    height: "Length",
    area: "Area",
  });
  const row = partRow({
    part: "PX",
    matched: null,
    width: rawMeas({ rawValue: 600, rawHeader: "Width", sourceCell: "E16" }),
    height: rawMeas({ rawValue: 600, rawHeader: "Length", sourceCell: "F16" }),
  });
  const result = normalizeWorkbookPartRows({
    documentId: "doc:1",
    mapping,
    partRows: [row],
    registry: [],
  });
  const n = result.normalizedRows[0]!;
  console.log(
    "ambiguous JSON:",
    JSON.stringify(
      {
        width: {
          status: n.width?.resolutionStatus,
          normalizedValue: n.width?.normalizedValue,
          issues: n.width?.issues.map((i) => i.code),
        },
        height: {
          status: n.height?.resolutionStatus,
          normalizedValue: n.height?.normalizedValue,
        },
      },
      null,
      2
    )
  );
  assertEq(n.width?.resolutionStatus, "AMBIGUOUS", "width ambiguous");
  assertEq(n.width?.normalizedValue, null, "no guessed width");
  assertEq(n.height?.normalizedValue, null, "no guessed height");
  console.log("PASS");
}

async function test5_mixedUnits() {
  console.log("\n=== Test 5 — mixed linear units ===");
  const rows = [
    partRow({
      id: "r1",
      row: 1,
      width: rawMeas({
        rawValue: "300 mm",
        rawText: "300 mm",
        rawHeader: "Width",
        sourceCell: "E1",
      }),
    }),
    partRow({
      id: "r2",
      row: 2,
      width: rawMeas({
        rawValue: "50 cm",
        rawText: "50 cm",
        rawHeader: "Width",
        sourceCell: "E2",
      }),
    }),
    partRow({
      id: "r3",
      row: 3,
      width: rawMeas({
        rawValue: "0.6 m",
        rawText: "0.6 m",
        rawHeader: "Width",
        sourceCell: "E3",
      }),
    }),
  ];
  const mapping = mappingFor({
    width: "Width",
    height: "Length",
    area: "Area",
  });
  const result = normalizeWorkbookPartRows({
    documentId: "doc:1",
    mapping,
    partRows: rows,
    registry: [],
  });
  const vals = result.normalizedRows.map((r) => r.width?.normalizedValue);
  console.log("mixed-unit JSON:", JSON.stringify(vals));
  assertEq(vals[0], 300, "300 mm");
  assertEq(vals[1], 500, "50 cm");
  assertEq(vals[2], 600, "0.6 m");
  const wp = profileLookup(result.profiles, "WIDTH");
  assertEq(wp?.resolutionStatus, "MIXED_UNITS", "profile MIXED_UNITS");
  console.log("PASS");
}

async function test6_mass() {
  console.log("\n=== Test 6 — mass units ===");
  assertEq(convertMassToKg(3300, "G").ok ? (convertMassToKg(3300, "G") as { value: number }).value : null, 3.3, "g");
  assertEq(convertMassToKg(3.3, "KG").ok ? (convertMassToKg(3.3, "KG") as { value: number }).value : null, 3.3, "kg");
  assertEq(convertMassToKg(0.0033, "TON").ok ? (convertMassToKg(0.0033, "TON") as { value: number }).value : null, 3.3, "ton");
  console.log("PASS");
}

async function test7_precisionXls() {
  console.log("\n=== Test 7 — displayed precision from legacy format ===");
  const places = inferDisplayedDecimalPlaces("0.04 ", "0.00\\ ");
  assertEq(places, 2, "2 dp");
  const cell = measurementFromCell({
    cell: {
      sheetName: "S",
      cellAddress: "G10",
      rawValue: 0.04,
      formattedText: "0.04 ",
      formula: null,
      formulaResult: null,
      numberFormat: "0.00\\ ",
      rowNumber: 10,
      columnLetter: "G",
      isMerged: false,
      mergedRange: null,
      isHiddenRow: false,
      isHiddenColumn: false,
    },
    sourceCell: "G10",
    rawHeader: "Area",
    statedUnit: "M2",
  });
  assertEq(cell.rawValue, 0.04, "raw preserved");
  assertEq(cell.displayedDecimalPlaces, 2, "decimals");
  console.log("PASS");
}

async function test8_explicitOverride() {
  console.log("\n=== Test 8 — explicit cell unit overrides header ===");
  const n = normalizePartRow({
    row: partRow({
      height: rawMeas({
        rawValue: "0.6 m",
        rawText: "0.6 m",
        statedUnit: "MM",
        rawHeader: "Length(mm)",
        sourceCell: "F16",
      }),
    }),
    profiles: [],
    dxf: null,
  });
  assertEq(n.height?.normalizedValue, 600, "600 mm");
  assertEq(n.height?.resolutionStatus, "RESOLVED_BY_EXPLICIT_CELL_UNIT", "explicit");
  console.log("PASS");
}

async function test9_pdf() {
  console.log("\n=== Test 9 — PDF area M2 → mm2 ===");
  const conv = convertAreaToMm2(0.36, "M2");
  assert(conv.ok, "ok");
  assertEq(conv.ok ? conv.value : null, 360000, "360000");
  const n = normalizePartRow({
    row: {
      ...partRow({
        area: rawMeas({
          rawValue: 0.36,
          statedUnit: "M2",
          origin: "AI_EXTRACTED_PDF",
          sourceCell: null,
        }),
      }),
      source: {
        type: "PDF",
        fileName: "a.pdf",
        sheetName: null,
        rowNumber: null,
        pageNumber: 1,
        excerpt: null,
        tableId: null,
      },
    },
    profiles: [],
    dxf: null,
  });
  assertEq(n.area?.normalizedValue, 360000, "pdf area");
  assertEq(n.area?.raw.origin, "AI_EXTRACTED_PDF", "origin");
  console.log("PASS");
}

async function test10_xlsRegression() {
  console.log("\n=== Test 10 — legacy XLS regression ===");
  const ws = XLSX.utils.aoa_to_sheet([
    ["Part", "Width(mm)", "Length(m)", "Area (m2)"],
    ["P1092", 600, 600, 0.36],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xls" }));
  const snap = await buildWorkbookSnapshot({
    documentId: "doc:xls",
    fileName: "legacy.xls",
    buffer: buf,
  });
  assert(snap.ok, "parse");
  assertEq(snap.snapshot.parserKind, "SHEETJS_XLS", "parserKind");
  const c2 = snap.snapshot.sheets[0]!.cells.find((c) => c.cellAddress === "C2");
  assertEq(c2?.rawValue, 600, "deterministic cell");
  console.log("PASS XLS regression parserKind=", snap.snapshot.parserKind);
}

async function test11_immutability() {
  console.log("\n=== Test 11 — RawMeasurement immutability ===");
  const raw = rawMeas({
    rawValue: 600,
    statedUnit: "M",
    rawHeader: "Length(m)",
    sourceCell: "F16",
  });
  const before = rawMeasurementSnapshot(raw);
  normalizePartRow({
    row: partRow({
      width: rawMeas({ rawValue: 600, statedUnit: "MM", sourceCell: "E16" }),
      height: raw,
      area: rawMeas({ rawValue: 0.36, statedUnit: "M2", sourceCell: "G16" }),
    }),
    profiles: [],
    dxf: { canonicalPartId: "P", widthMm: 600, heightMm: 600, plateAreaMm2: 360000 },
  });
  assertEq(rawMeasurementSnapshot(raw), before, "raw unchanged");
  console.log("PASS");
}

async function test12_noFalseMismatch() {
  console.log("\n=== Test 12 — unresolved unit → NOT_COMPARABLE / no false mismatch ===");
  const row = {
    documentId: "doc:1",
    matchedDxfPartId: "P1",
    rawPartReference: "P1",
    quantity: 1,
    thicknessMm: 10,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE" as const,
    documentGeometry: {
      ...emptyDocumentGeometry(),
      width: 600,
      widthUnit: null,
      height: 600,
      heightUnit: null,
    },
    source: {
      type: "XLSX" as const,
      fileName: "t.xlsx",
      sheetName: "Sheet1",
      rowNumber: 16,
      pageNumber: null,
      partReferenceCell: null,
      quantityCell: null,
      thicknessCell: null,
      materialCell: null,
      excerpt: null,
    },
    issues: ["DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"],
  };
  const geo = compareDocumentsToDxfGeometry({
    documentRows: [row],
    partId: "P1",
    dxf: {
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
      netContourAreaMm2: null,
      perimeterMm: null,
    },
    resolved: { thicknessMm: 10, material: "S235", quantity: 1 },
  });
  assert(
    geo.issues.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"),
    "ambiguous issue"
  );
  assert(
    !geo.issues.includes("DOCUMENT_DXF_DIMENSION_MISMATCH"),
    "no false mismatch"
  );
  console.log("PASS");
}

async function main() {
  // unit parser smoke
  assertEq(parseUnitText("Length(m)"), "M", "parse m");
  assertEq(parseUnitText("Width(mm)"), "MM", "parse mm");
  assertEq(parseUnitText("Area (m2)"), "M2", "parse m2");
  assertEq(parseUnitText("Wieght (kg)"), "KG", "parse kg typo header");
  assertEq(parseNumericWithOptionalUnit("0.6 m").explicitUnit, "M", "cell unit");
  assert(convertLengthToMm(1, "M").ok, "m→mm");

  await test1_correctLabels();
  await test2_wrongHeader();
  await test3_roundedArea();
  await test4_ambiguous();
  await test5_mixedUnits();
  await test6_mass();
  await test7_precisionXls();
  await test8_explicitOverride();
  await test9_pdf();
  await test10_xlsRegression();
  await test11_immutability();
  await test12_noFalseMismatch();
  console.log("\nAll Checkpoint 5.2 tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
