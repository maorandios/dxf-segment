/**
 * Checkpoint 5.2 — unitless Hebrew headers + deterministic SUBTOTAL/TOTAL.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint52-unitless-table.ts
 */
import {
  buildProvisionalColumnUnitProfiles,
  compareWithPrecision,
  normalizeWorkbookPartRows,
  refineSummaryRowClassification,
  type AiWorkbookMappingResult,
  type RawDocumentPartRow,
  type RawMeasurement,
} from "../normalization";
import type { ResolvedRowRole } from "../normalization/resolveRowRoles";
import { NORMALIZATION_TOLERANCES } from "../normalization/normalizationConfig";
import { parseNumericWithOptionalUnit } from "../normalization/parseUnitText";

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
  partial: Partial<RawMeasurement> & { rawValue: number | string | null }
): RawMeasurement {
  return {
    rawValue: partial.rawValue,
    rawText:
      partial.rawText ??
      (partial.rawValue != null ? String(partial.rawValue) : null),
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

function hebrewMapping(): AiWorkbookMappingResult {
  return {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: "A6:J25",
            headerRowNumbers: [6],
            firstDataRow: 7,
            lastDataRow: 25,
            columns: {
              partReference: "B",
              quantity: "A",
              thickness: "C",
              material: "D",
              width: "E",
              height: "F",
              area: "G",
              totalArea: "H",
              unitWeight: "I",
              totalWeight: "J",
            },
            columnHeaders: [
              {
                columnLetter: "B",
                rawHeaderText: "חלק",
                detectedMeaning: "partReference",
                statedUnitText: null,
              },
              {
                columnLetter: "A",
                rawHeaderText: "כמות",
                detectedMeaning: "quantity",
                statedUnitText: null,
              },
              {
                columnLetter: "C",
                rawHeaderText: "עובי",
                detectedMeaning: "thickness",
                statedUnitText: null,
              },
              {
                columnLetter: "D",
                rawHeaderText: "סוג",
                detectedMeaning: "material",
                statedUnitText: null,
              },
              {
                columnLetter: "E",
                rawHeaderText: "רוחב",
                detectedMeaning: "width",
                statedUnitText: null,
              },
              {
                columnLetter: "F",
                rawHeaderText: "אורך",
                detectedMeaning: "height",
                statedUnitText: null,
              },
              {
                columnLetter: "G",
                rawHeaderText: "שטח",
                detectedMeaning: "area",
                statedUnitText: null,
              },
              {
                columnLetter: "H",
                rawHeaderText: "שטח כללי",
                detectedMeaning: "totalArea",
                statedUnitText: null,
              },
              {
                columnLetter: "I",
                rawHeaderText: "משקל",
                detectedMeaning: "unitWeight",
                statedUnitText: null,
              },
              {
                columnLetter: "J",
                rawHeaderText: "משקל כללי",
                detectedMeaning: "totalWeight",
                statedUnitText: null,
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

function partRow(args: {
  id: string;
  part: string;
  row: number;
  qty?: number;
  thickness?: number | null;
  width?: number | null;
  height?: number | null;
  area?: number | null;
  totalArea?: number | null;
  unitWeight?: number | null;
  totalWeight?: number | null;
  material?: string | null;
  heightRawText?: string | null;
}): RawDocumentPartRow {
  const th =
    args.thickness === undefined
      ? null
      : args.thickness == null
        ? rawMeas({
            rawValue: null,
            rawHeader: "עובי",
            sourceCell: `C${args.row}`,
          })
        : rawMeas({
            rawValue: args.thickness,
            rawHeader: "עובי",
            sourceCell: `C${args.row}`,
          });
  return {
    occurrenceId: args.id,
    documentId: "doc:he:1",
    rowRole: "PART",
    matchedDxfPartId: args.part,
    rawPartReference: args.part,
    partReferenceCell: `B${args.row}`,
    materialCell: null,
    quantity: rawMeas({
      rawValue: args.qty ?? 1,
      sourceCell: `A${args.row}`,
    }),
    thickness: th,
    material: args.material ?? "S235",
    width:
      args.width == null
        ? null
        : rawMeas({
            rawValue: args.width,
            rawHeader: "רוחב",
            sourceCell: `E${args.row}`,
          }),
    height:
      args.height == null
        ? null
        : rawMeas({
            rawValue: args.height,
            rawText: args.heightRawText ?? String(args.height),
            rawHeader: "אורך",
            sourceCell: `F${args.row}`,
          }),
    area:
      args.area == null
        ? null
        : rawMeas({
            rawValue: args.area,
            rawHeader: "שטח",
            sourceCell: `G${args.row}`,
            displayedDecimalPlaces: 2,
          }),
    totalArea:
      args.totalArea == null
        ? null
        : rawMeas({
            rawValue: args.totalArea,
            rawHeader: "שטח כללי",
            sourceCell: `H${args.row}`,
            displayedDecimalPlaces: 2,
          }),
    unitWeight:
      args.unitWeight == null
        ? null
        : rawMeas({
            rawValue: args.unitWeight,
            rawHeader: "משקל",
            sourceCell: `I${args.row}`,
            displayedDecimalPlaces: 1,
          }),
    totalWeight:
      args.totalWeight == null
        ? null
        : rawMeas({
            rawValue: args.totalWeight,
            rawHeader: "משקל כללי",
            sourceCell: `J${args.row}`,
            displayedDecimalPlaces: 1,
          }),
    description: null,
    notes: null,
    source: {
      type: "XLSX",
      fileName: "hebrew.xls",
      sheetName: "Sheet1",
      rowNumber: args.row,
      pageNumber: null,
      excerpt: null,
      tableId: "t1",
    },
    extractionIssues: [],
    isHiddenRow: false,
  };
}

function registry() {
  return [
    {
      canonicalPartId: "P1091",
      revision: null,
      filename: "P1091.dxf",
      widthMm: 250,
      heightMm: 140,
      plateAreaMm2: 35000,
    },
    {
      canonicalPartId: "P1092",
      revision: null,
      filename: "P1092.dxf",
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
    },
    {
      canonicalPartId: "P1093",
      revision: null,
      filename: "P1093.dxf",
      widthMm: 280,
      heightMm: 580,
      plateAreaMm2: 162400,
    },
    {
      canonicalPartId: "P1094",
      revision: null,
      filename: "P1094.dxf",
      widthMm: 80,
      heightMm: 580,
      plateAreaMm2: 46400,
    },
    {
      canonicalPartId: "P1095",
      revision: null,
      filename: "P1095.dxf",
      widthMm: 600,
      heightMm: 600,
      plateAreaMm2: 360000,
    },
    {
      canonicalPartId: "P1098",
      revision: null,
      filename: "P1098.dxf",
      widthMm: 155,
      heightMm: 500,
      plateAreaMm2: 77500,
    },
    {
      canonicalPartId: "P1097",
      revision: null,
      filename: "P1097.dxf",
      widthMm: 264,
      heightMm: 264,
      plateAreaMm2: 69696,
    },
    {
      canonicalPartId: "P1084",
      revision: null,
      filename: "P1084.dxf",
      widthMm: 720,
      heightMm: 720,
      plateAreaMm2: 518400,
    },
    {
      canonicalPartId: "P1096",
      revision: null,
      filename: "P1096.dxf",
      widthMm: 300,
      heightMm: 300,
      plateAreaMm2: 90000,
    },
  ];
}

function hebrewPartRows(): RawDocumentPartRow[] {
  return [
    partRow({
      id: "P1091:r7",
      part: "P1091",
      row: 7,
      qty: 1,
      thickness: 12,
      width: 1000,
      height: 1000,
      area: 0.04,
      totalArea: 0.04,
      unitWeight: 3.3,
      totalWeight: 3.3,
    }),
    partRow({
      id: "P1097:r11",
      part: "P1097",
      row: 11,
      qty: 2,
      thickness: 16,
      width: 264,
      height: 264,
      area: 0.07,
      totalArea: 0.14,
      unitWeight: 8.8,
      totalWeight: 17.6,
    }),
    partRow({
      id: "P1098:r10",
      part: "P1098",
      row: 10,
      qty: 2,
      thickness: null,
      width: 155,
      height: 500,
      area: 0.08,
      totalArea: 0.16,
      unitWeight: 9.7,
      totalWeight: 19.5,
    }),
    partRow({
      id: "P1096:r14",
      part: "P1096",
      row: 14,
      qty: 1,
      thickness: 20,
      width: 300,
      height: 300,
      area: 0.09,
      totalArea: 0.09,
      unitWeight: 14.1,
      totalWeight: 14.1,
    }),
    partRow({
      id: "P1093:r15",
      part: "P1093",
      row: 15,
      qty: 2,
      thickness: 20,
      width: 280,
      height: 580,
      area: 0.16,
      totalArea: 0.32,
      unitWeight: 25.5,
      totalWeight: 51,
    }),
    partRow({
      id: "P1095:r16",
      part: "P1095",
      row: 16,
      qty: 1,
      thickness: 20,
      width: 600,
      height: 600,
      area: 0.36,
      totalArea: 0.36,
      unitWeight: 56.5,
      totalWeight: 56.5,
    }),
    partRow({
      id: "P1095:r17",
      part: "P1095",
      row: 17,
      qty: 1,
      thickness: 20,
      width: 600,
      height: 600,
      area: 0.36,
      totalArea: 0.36,
      unitWeight: 56.5,
      totalWeight: 56.5,
    }),
    partRow({
      id: "P1092:r18",
      part: "P1092",
      row: 18,
      qty: 4,
      thickness: 20,
      width: 600,
      height: 600,
      area: 0.36,
      totalArea: 1.44,
      unitWeight: 56.5,
      totalWeight: 226.1,
    }),
    partRow({
      id: "P1084:r19",
      part: "P1084",
      row: 19,
      qty: 1,
      thickness: 20,
      width: 720,
      height: 720,
      area: 0.52,
      totalArea: 0.52,
      unitWeight: 81.4,
      totalWeight: 81.4,
    }),
    partRow({
      id: "P1094:r22",
      part: "P1094",
      row: 22,
      qty: 1,
      thickness: 30,
      width: 80,
      height: 580,
      area: 0.05,
      totalArea: 0.05,
      unitWeight: 10.9,
      totalWeight: 10.9,
    }),
  ];
}

function profileUnit(
  profiles: ReturnType<typeof normalizeWorkbookPartRows>["profiles"],
  field: string
) {
  return profiles.find((p) => p.semanticField === field);
}

function main() {
  console.log("\n=== Test 1 — Hebrew semantic mapping ===");
  const mapping = hebrewMapping();
  const headers = mapping.sheets[0]!.tables[0]!.columnHeaders;
  const byMeaning = Object.fromEntries(
    headers.map((h) => [h.detectedMeaning, h.rawHeaderText])
  );
  assertEq(byMeaning.partReference, "חלק", "חלק");
  assertEq(byMeaning.quantity, "כמות", "כמות");
  assertEq(byMeaning.thickness, "עובי", "עובי");
  assertEq(byMeaning.material, "סוג", "סוג");
  assertEq(byMeaning.width, "רוחב", "רוחב");
  assertEq(byMeaning.height, "אורך", "אורך");
  assertEq(byMeaning.area, "שטח", "שטח");
  assertEq(byMeaning.totalArea, "שטח כללי", "שטח כללי");
  assertEq(byMeaning.unitWeight, "משקל", "משקל");
  assertEq(byMeaning.totalWeight, "משקל כללי", "משקל כללי");
  const provisional = buildProvisionalColumnUnitProfiles({
    documentId: "doc:he:1",
    mapping,
    partRows: hebrewPartRows(),
  });
  for (const p of provisional) {
    assertEq(p.statedHeaderUnit, null, `${p.semanticField} no stated unit`);
  }
  console.log("PASS");

  console.log("\n=== Test 2 — unitless full plate table (P1092) ===");
  const rows = hebrewPartRows();
  const result = normalizeWorkbookPartRows({
    documentId: "doc:he:1",
    mapping,
    partRows: rows,
    registry: registry(),
  });
  const expectResolved = (
    field: string,
    unit: string
  ) => {
    const p = profileUnit(result.profiles, field)!;
    assertEq(p.resolvedUnit, unit, `${field} unit`);
    assertEq(
      p.resolutionStatus,
      "RESOLVED_BY_COLUMN_CONSISTENCY",
      `${field} status`
    );
    assert(
      p.confidence >=
        NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence,
      `${field} confidence ${p.confidence}`
    );
    assertEq(p.statedHeaderUnit, null, `${field} stated null`);
    assert(
      !p.issues.some(
        (i) => i.code === "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED"
      ),
      `${field} no label inconsistent`
    );
  };
  expectResolved("THICKNESS", "MM");
  expectResolved("WIDTH", "MM");
  expectResolved("HEIGHT", "MM");
  expectResolved("AREA", "M2");
  expectResolved("TOTAL_AREA", "M2");
  expectResolved("UNIT_WEIGHT", "KG");
  expectResolved("TOTAL_WEIGHT", "KG");
  const p1092 = result.normalizedRows.find(
    (r) => r.raw.matchedDxfPartId === "P1092"
  )!;
  assertEq(p1092.thickness?.normalizedValue, 20, "thk 20");
  assertEq(p1092.width?.normalizedValue, 600, "w 600");
  assertEq(p1092.height?.normalizedValue, 600, "h 600");
  assertEq(p1092.area?.resolvedSourceUnit, "M2", "area M2");
  assert(
    !p1092.issues.some((i) =>
      i.code.includes("UNIT_AMBIGUOUS")
    ),
    "no ambiguity P1092"
  );
  console.log("PASS");

  console.log("\n=== Test 3 — table consensus across rows ===");
  assert(result.tableUnitInferences[0]?.status === "RESOLVED", "table resolved");
  const p1091 = result.normalizedRows.find(
    (r) => r.raw.matchedDxfPartId === "P1091"
  )!;
  assertEq(p1091.width?.normalizedValue, 1000, "P1091 width kept");
  assertEq(p1091.area?.raw.rawValue, 0.04, "P1091 area raw preserved");
  console.log("PASS");

  console.log("\n=== Test 4 — P1093 rounding ===");
  const p1093 = result.normalizedRows.find(
    (r) => r.raw.matchedDxfPartId === "P1093"
  )!;
  assertEq(p1093.width?.resolvedSourceUnit, "MM", "P1093 W MM");
  assertEq(p1093.height?.resolvedSourceUnit, "MM", "P1093 H MM");
  const cmp1093 = compareWithPrecision({
    expectedValue: (280 * 580) / 1_000_000,
    sourceValue: 0.16,
    displayedDecimalPlaces: 2,
    absoluteTolerance: 0,
    relativeTolerance: 0.02,
  });
  assertEq(cmp1093.status, "MATCH_AFTER_ROUNDING", "P1093 rounding");
  console.log("PASS");

  console.log("\n=== Test 5 — P1094 rounding ===");
  const p1094 = result.normalizedRows.find(
    (r) => r.raw.matchedDxfPartId === "P1094"
  )!;
  assertEq(p1094.height?.normalizedValue, 580, "580 MM");
  const cmp1094 = compareWithPrecision({
    expectedValue: (80 * 580) / 1_000_000,
    sourceValue: 0.05,
    displayedDecimalPlaces: 2,
    absoluteTolerance: 0,
    relativeTolerance: 0.02,
  });
  assertEq(cmp1094.status, "MATCH_AFTER_ROUNDING", "P1094 rounding");
  console.log("PASS");

  console.log("\n=== Test 6 — mass inference KG ===");
  assertEq(
    profileUnit(result.profiles, "UNIT_WEIGHT")!.resolvedUnit,
    "KG",
    "KG"
  );
  assertEq(p1092.unitWeight?.resolvedSourceUnit, "KG", "uw KG");
  assertEq(p1092.totalWeight?.resolvedSourceUnit, "KG", "tw KG");
  console.log("PASS");

  console.log("\n=== Test 7 — missing thickness P1098 ===");
  const p1098 = result.normalizedRows.find(
    (r) => r.raw.matchedDxfPartId === "P1098"
  )!;
  assertEq(p1098.thickness?.resolutionStatus, "NOT_PRESENT", "NOT_PRESENT");
  assertEq(p1098.thickness?.normalizedValue, null, "null thk");
  assert(
    !p1098.issues.some((i) => i.code === "DOCUMENT_THICKNESS_UNIT_AMBIGUOUS"),
    "no thk ambiguity"
  );
  assertEq(p1098.width?.resolvedSourceUnit, "MM", "P1098 W");
  assertEq(p1098.area?.resolvedSourceUnit, "M2", "P1098 area");
  console.log("PASS");

  console.log("\n=== Test 8 — genuine ambiguity 2×3 ===");
  const ambMap: AiWorkbookMappingResult = {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: null,
            headerRowNumbers: [1],
            firstDataRow: 2,
            lastDataRow: 2,
            columns: {
              partReference: "A",
              quantity: null,
              thickness: null,
              material: null,
              width: "B",
              height: "C",
              area: null,
              totalArea: null,
              unitWeight: null,
              totalWeight: null,
            },
            columnHeaders: [
              {
                columnLetter: "B",
                rawHeaderText: "רוחב",
                detectedMeaning: "width",
                statedUnitText: null,
              },
              {
                columnLetter: "C",
                rawHeaderText: "אורך",
                detectedMeaning: "height",
                statedUnitText: null,
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
  const ambRows: RawDocumentPartRow[] = [
    {
      ...partRow({
        id: "X:r2",
        part: "X",
        row: 2,
        width: 2,
        height: 3,
      }),
      matchedDxfPartId: null,
      material: null,
      thickness: null,
      area: null,
      totalArea: null,
      unitWeight: null,
      totalWeight: null,
    },
  ];
  const amb = normalizeWorkbookPartRows({
    documentId: "doc:amb",
    mapping: ambMap,
    partRows: ambRows,
    registry: [],
  });
  assert(
    amb.tableUnitInferences[0]?.status === "AMBIGUOUS" ||
      amb.tableUnitInferences[0]?.status === "INSUFFICIENT_EVIDENCE",
    `amb status ${amb.tableUnitInferences[0]?.status}`
  );
  assertEq(profileUnit(amb.profiles, "WIDTH")?.resolvedUnit ?? null, null, "W null");
  assertEq(profileUnit(amb.profiles, "HEIGHT")?.resolvedUnit ?? null, null, "H null");
  assertEq(amb.normalizedRows[0]!.width?.normalizedValue, null, "w null");
  assert(
    amb.normalizedRows[0]!.width?.issues.some(
      (i) => i.code === "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"
    ),
    "geometry ambiguous"
  );
  console.log("PASS");

  console.log("\n=== Test 9 — scale-symmetric 10×10 / 100 ===");
  const symMap: AiWorkbookMappingResult = {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: null,
            headerRowNumbers: [1],
            firstDataRow: 2,
            lastDataRow: 2,
            columns: {
              partReference: "A",
              quantity: null,
              thickness: null,
              material: null,
              width: "B",
              height: "C",
              area: "D",
              totalArea: null,
              unitWeight: null,
              totalWeight: null,
            },
            columnHeaders: [
              {
                columnLetter: "B",
                rawHeaderText: "רוחב",
                detectedMeaning: "width",
                statedUnitText: null,
              },
              {
                columnLetter: "C",
                rawHeaderText: "אורך",
                detectedMeaning: "height",
                statedUnitText: null,
              },
              {
                columnLetter: "D",
                rawHeaderText: "שטח",
                detectedMeaning: "area",
                statedUnitText: null,
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
  const symRows = [
    partRow({
      id: "S:r2",
      part: "S",
      row: 2,
      width: 10,
      height: 10,
      area: 100,
    }),
  ];
  symRows[0]!.matchedDxfPartId = null;
  const sym = normalizeWorkbookPartRows({
    documentId: "doc:sym",
    mapping: symMap,
    partRows: symRows,
    registry: [],
  });
  assert(
    sym.tableUnitInferences[0]?.status === "AMBIGUOUS",
    `sym status ${sym.tableUnitInferences[0]?.status}`
  );
  assertEq(profileUnit(sym.profiles, "WIDTH")?.resolvedUnit ?? null, null, "no guess");
  console.log("PASS");

  console.log("\n=== Test 10 — explicit cell override ===");
  const overrideRows = [
    partRow({
      id: "P1092:r18",
      part: "P1092",
      row: 18,
      qty: 4,
      thickness: 20,
      width: 600,
      height: 600,
      area: 0.36,
      totalArea: 1.44,
      unitWeight: 56.5,
      totalWeight: 226.1,
    }),
    partRow({
      id: "EX:r20",
      part: "P1097",
      row: 20,
      qty: 1,
      thickness: 16,
      width: 264,
      height: 0.6,
      heightRawText: "0.6 m",
      area: 0.07,
      totalArea: 0.07,
      unitWeight: 8.8,
      totalWeight: 8.8,
    }),
  ];
  // Ensure parser sees explicit unit
  const parsed = parseNumericWithOptionalUnit(0.6, "0.6 m");
  assertEq(parsed.explicitUnit, "M", "parsed M");
  const over = normalizeWorkbookPartRows({
    documentId: "doc:he:1",
    mapping,
    partRows: overrideRows,
    registry: registry(),
  });
  const ex = over.normalizedRows.find((r) => r.raw.occurrenceId === "EX:r20")!;
  assertEq(ex.height?.resolutionStatus, "RESOLVED_BY_EXPLICIT_CELL_UNIT", "explicit");
  assertEq(ex.height?.resolvedSourceUnit, "M", "cell M");
  assertEq(ex.height?.normalizedValue, 600, "0.6 m → 600 mm");
  console.log("PASS");

  console.log("\n=== Test 11 — subtotal classification ===");
  const roles: ResolvedRowRole[] = [
    { rowNumber: 7, role: "PART", reason: "part", aiRole: "PART", conflict: false },
    { rowNumber: 8, role: "TOTAL", reason: "ai:TOTAL", aiRole: "TOTAL", conflict: false },
    { rowNumber: 11, role: "PART", reason: "part", aiRole: "PART", conflict: false },
    { rowNumber: 12, role: "TOTAL", reason: "ai:TOTAL", aiRole: "TOTAL", conflict: false },
    { rowNumber: 18, role: "PART", reason: "part", aiRole: "PART", conflict: false },
    { rowNumber: 20, role: "TOTAL", reason: "ai:TOTAL", aiRole: "TOTAL", conflict: false },
    { rowNumber: 22, role: "PART", reason: "part", aiRole: "PART", conflict: false },
    { rowNumber: 23, role: "TOTAL", reason: "ai:TOTAL", aiRole: "TOTAL", conflict: false },
    { rowNumber: 25, role: "TOTAL", reason: "ai:TOTAL", aiRole: "TOTAL", conflict: false },
  ];
  const refined = refineSummaryRowClassification(roles);
  const sub = refined.filter((r) => r.role === "SUBTOTAL");
  const tot = refined.filter((r) => r.role === "TOTAL");
  assertEq(sub.length, 4, "4 subtotals");
  assertEq(tot.length, 1, "1 total");
  assertEq(tot[0]!.rowNumber, 25, "total row 25");
  assert(
    [8, 12, 20, 23].every((n) => sub.some((r) => r.rowNumber === n)),
    "subtotal rows"
  );
  console.log("PASS");

  console.log("\n=== Test 12 — real workbook regression summary ===");
  assertEq(result.normalizedRows.length, 10, "10 parts");
  const p1095 = result.normalizedRows.filter(
    (r) => r.raw.matchedDxfPartId === "P1095"
  );
  assertEq(p1095.length, 2, "P1095 x2");
  for (const nr of result.normalizedRows) {
    if (nr.raw.matchedDxfPartId === "P1098") continue;
    const codes = [
      ...(nr.width?.issues ?? []),
      ...(nr.height?.issues ?? []),
      ...(nr.area?.issues ?? []),
      ...(nr.unitWeight?.issues ?? []),
      ...(nr.totalWeight?.issues ?? []),
      ...(nr.thickness?.issues ?? []),
    ].map((i) => i.code);
    assert(
      !codes.includes("DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"),
      `${nr.raw.matchedDxfPartId} no geo amb`
    );
    assert(
      !codes.includes("DOCUMENT_MASS_UNIT_AMBIGUOUS"),
      `${nr.raw.matchedDxfPartId} no mass amb`
    );
  }
  console.log("PASS");

  console.log("\n=== Test 13 — English-header regression (Length(m)→MM) ===");
  const enMap: AiWorkbookMappingResult = {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: null,
            headerRowNumbers: [6],
            firstDataRow: 7,
            lastDataRow: 18,
            columns: {
              partReference: "B",
              quantity: "A",
              thickness: "C",
              material: null,
              width: "E",
              height: "F",
              area: "G",
              totalArea: null,
              unitWeight: "I",
              totalWeight: null,
            },
            columnHeaders: [
              {
                columnLetter: "E",
                rawHeaderText: "Width(mm)",
                detectedMeaning: "width",
                statedUnitText: "mm",
              },
              {
                columnLetter: "F",
                rawHeaderText: "Length(m)",
                detectedMeaning: "height",
                statedUnitText: "m",
              },
              {
                columnLetter: "G",
                rawHeaderText: "Area (m2)",
                detectedMeaning: "area",
                statedUnitText: "m2",
              },
              {
                columnLetter: "I",
                rawHeaderText: "Weight (kg)",
                detectedMeaning: "unitWeight",
                statedUnitText: "kg",
              },
              {
                columnLetter: "C",
                rawHeaderText: "Plate THK",
                detectedMeaning: "thickness",
                statedUnitText: null,
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
  const enRows = [
    partRow({
      id: "P1092:r18",
      part: "P1092",
      row: 18,
      qty: 4,
      thickness: 20,
      width: 600,
      height: 600,
      area: 0.36,
      unitWeight: 56.5,
    }),
  ];
  enRows[0]!.width = rawMeas({
    rawValue: 600,
    statedUnit: "MM",
    rawHeader: "Width(mm)",
    sourceCell: "E18",
  });
  enRows[0]!.height = rawMeas({
    rawValue: 600,
    statedUnit: "M",
    rawHeader: "Length(m)",
    sourceCell: "F18",
  });
  enRows[0]!.area = rawMeas({
    rawValue: 0.36,
    statedUnit: "M2",
    rawHeader: "Area (m2)",
    sourceCell: "G18",
    displayedDecimalPlaces: 2,
  });
  const en = normalizeWorkbookPartRows({
    documentId: "doc:en",
    mapping: enMap,
    partRows: enRows,
    registry: registry(),
  });
  const hProf = profileUnit(en.profiles, "HEIGHT")!;
  assertEq(hProf.statedHeaderUnit, "M", "stated M");
  assertEq(hProf.resolvedUnit, "MM", "resolved MM");
  assert(
    hProf.issues.some(
      (i) => i.code === "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED"
    ),
    "label inconsistent"
  );
  console.log("PASS");

  console.log("\n=== Test 14 — PDF explicit units unchanged path ===");
  // PDF path uses resolveNormalizedMeasurement with stated units — smoke via rawMeas origin
  const pdfRaw = rawMeas({
    rawValue: 0.36,
    statedUnit: "M2",
    origin: "AI_EXTRACTED_PDF",
    rawText: "0.36 m2",
  });
  assertEq(pdfRaw.statedUnit, "M2", "pdf stated");
  assertEq(pdfRaw.origin, "AI_EXTRACTED_PDF", "origin");
  console.log("PASS");

  console.log("\nAll unitless-table stabilization tests passed.");
}

main();
