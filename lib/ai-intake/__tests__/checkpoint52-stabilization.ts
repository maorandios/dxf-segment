/**
 * Checkpoint 5.2 stabilization — profile consensus, precision scoring, thickness weight.
 * Run: npx tsx lib/ai-intake/__tests__/checkpoint52-stabilization.ts
 */
import {
  compareWithPrecision,
  normalizeWorkbookPartRows,
  normalizedPartRowToExtractedDocumentRow,
  type AiWorkbookMappingResult,
  type RawDocumentPartRow,
  type RawMeasurement,
} from "../normalization";
import { NORMALIZATION_TOLERANCES } from "../normalization/normalizationConfig";

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

function partRow(args: {
  id: string;
  part: string;
  row: number;
  thickness?: RawMeasurement | null;
  width?: RawMeasurement | null;
  height?: RawMeasurement | null;
  area?: RawMeasurement | null;
  unitWeight?: RawMeasurement | null;
  qty?: number;
  material?: string | null;
}): RawDocumentPartRow {
  return {
    occurrenceId: args.id,
    documentId: "doc:1",
    rowRole: "PART",
    matchedDxfPartId: args.part,
    rawPartReference: args.part,
    partReferenceCell: `B${args.row}`,
    materialCell: null,
    quantity: rawMeas({ rawValue: args.qty ?? 1, sourceCell: `Q${args.row}` }),
    thickness: args.thickness ?? null,
    material: args.material ?? "S235",
    width: args.width ?? null,
    height: args.height ?? null,
    area: args.area ?? null,
    totalArea: null,
    unitWeight: args.unitWeight ?? null,
    totalWeight: null,
    description: null,
    notes: null,
    source: {
      type: "XLSX",
      fileName: "real.xls",
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

function realLikeMapping(): AiWorkbookMappingResult {
  return {
    sheets: [
      {
        sheetName: "Sheet1",
        tables: [
          {
            tableId: "t1",
            tableRange: null,
            headerRowNumbers: [6],
            firstDataRow: 7,
            lastDataRow: 22,
            columns: {
              partReference: "B",
              quantity: "A",
              thickness: "C",
              material: null,
              width: "E",
              height: "F",
              area: "G",
              totalArea: "H",
              unitWeight: "I",
              totalWeight: "J",
            },
            columnHeaders: [
              {
                columnLetter: "C",
                rawHeaderText: "Plate THK",
                detectedMeaning: "thickness",
                statedUnitText: null,
                headerCellReferences: ["C6"],
              },
              {
                columnLetter: "E",
                rawHeaderText: "Width(mm)",
                detectedMeaning: "width",
                statedUnitText: "mm",
                headerCellReferences: ["E6"],
              },
              {
                columnLetter: "F",
                rawHeaderText: "Length(m)",
                detectedMeaning: "height/length",
                statedUnitText: "m",
                headerCellReferences: ["F6"],
              },
              {
                columnLetter: "G",
                rawHeaderText: "Area (m2)",
                detectedMeaning: "area",
                statedUnitText: "m2",
                headerCellReferences: ["G6"],
              },
              {
                columnLetter: "I",
                rawHeaderText: "Wieght (kg)",
                detectedMeaning: "unitWeight",
                statedUnitText: "kg",
                headerCellReferences: ["I6"],
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

function buildRealLikeRows(): RawDocumentPartRow[] {
  const dim = (
    part: string,
    row: number,
    thk: number | null,
    w: number,
    h: number,
    area: number,
    areaDp: number,
    uw: number,
    plateAreaMm2: number
  ) =>
    partRow({
      id: `${part}:r${row}`,
      part,
      row,
      material: "S235",
      thickness:
        thk == null
          ? rawMeas({
              rawValue: null,
              rawHeader: "Plate THK",
              sourceCell: `C${row}`,
            })
          : rawMeas({
              rawValue: thk,
              rawHeader: "Plate THK",
              sourceCell: `C${row}`,
            }),
      width: rawMeas({
        rawValue: w,
        statedUnit: "MM",
        rawHeader: "Width(mm)",
        sourceCell: `E${row}`,
      }),
      height: rawMeas({
        rawValue: h,
        statedUnit: "M",
        rawHeader: "Length(m)",
        sourceCell: `F${row}`,
      }),
      area: rawMeas({
        rawValue: area,
        statedUnit: "M2",
        rawHeader: "Area (m2)",
        sourceCell: `G${row}`,
        displayedDecimalPlaces: areaDp,
      }),
      unitWeight: rawMeas({
        rawValue: uw,
        statedUnit: "KG",
        rawHeader: "Wieght (kg)",
        sourceCell: `I${row}`,
        displayedDecimalPlaces: 1,
      }),
    });

  // Registry plate areas for weight: use matching DXF sizes
  return [
    dim("P1091", 7, 12, 1000, 1000, 0.04, 2, 3.3, 35000),
    dim("P1097", 11, 16, 264, 264, 0.07, 2, 8.8, 69696),
    dim("P1098", 10, null, 155, 500, 0.08, 2, 6.1, 77500),
    dim("P1096", 14, 20, 300, 300, 0.09, 2, 14.1, 90000),
    dim("P1093", 15, 20, 280, 580, 0.16, 2, 25.1, 162400),
    dim("P1095", 16, 20, 600, 600, 0.36, 2, 56.5, 360000),
    dim("P1095", 17, 20, 600, 600, 0.36, 2, 56.5, 360000),
    dim("P1092", 18, 20, 600, 600, 0.36, 2, 56.5, 360000),
    dim("P1084", 19, 20, 720, 720, 0.52, 2, 81.4, 518400),
    dim("P1094", 22, 30, 80, 580, 0.05, 2, 10.9, 46400),
  ];
}

function registry() {
  return [
    { canonicalPartId: "P1091", revision: null, filename: "P1091.dxf", widthMm: 250, heightMm: 140, plateAreaMm2: 35000 },
    { canonicalPartId: "P1097", revision: null, filename: "P1097.dxf", widthMm: 264, heightMm: 264, plateAreaMm2: 69696 },
    { canonicalPartId: "P1098", revision: null, filename: "P1098.dxf", widthMm: 155, heightMm: 500, plateAreaMm2: 77500 },
    { canonicalPartId: "P1096", revision: null, filename: "P1096.dxf", widthMm: 300, heightMm: 300, plateAreaMm2: 90000 },
    { canonicalPartId: "P1093", revision: null, filename: "P1093.dxf", widthMm: 280, heightMm: 580, plateAreaMm2: 162400 },
    { canonicalPartId: "P1095", revision: null, filename: "P1095.dxf", widthMm: 600, heightMm: 600, plateAreaMm2: 360000 },
    { canonicalPartId: "P1092", revision: null, filename: "P1092.dxf", widthMm: 600, heightMm: 600, plateAreaMm2: 360000 },
    { canonicalPartId: "P1084", revision: null, filename: "P1084.dxf", widthMm: 720, heightMm: 720, plateAreaMm2: 518400 },
    { canonicalPartId: "P1094", revision: null, filename: "P1094.dxf", widthMm: 80, heightMm: 580, plateAreaMm2: 46400 },
  ];
}

function main() {
  console.log("\n=== Stabilization Test 1 — profile status invariant ===");
  const mapping = realLikeMapping();
  const rows = buildRealLikeRows();
  const result = normalizeWorkbookPartRows({
    documentId: "doc:1",
    mapping,
    partRows: rows,
    registry: registry(),
  });
  const heightProf = result.profiles.find((p) => p.semanticField === "HEIGHT")!;
  assertEq(heightProf.statedHeaderUnit, "M", "stated M");
  assertEq(heightProf.resolvedUnit, "MM", "resolved MM");
  assert(
    heightProf.resolutionStatus !== "AS_STATED",
    `status must not be AS_STATED, got ${heightProf.resolutionStatus}`
  );
  assertEq(
    heightProf.resolutionStatus,
    "RESOLVED_BY_COLUMN_CONSISTENCY",
    "column consistency"
  );
  assert(
    heightProf.confidence >=
      NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence,
    `confidence ${heightProf.confidence}`
  );
  assert(
    heightProf.issues.some(
      (i) => i.code === "DOCUMENT_UNIT_LABEL_INCONSISTENT_RESOLVED"
    ),
    "label issue"
  );
  console.log("Final F profile:", JSON.stringify({
    statedHeaderUnit: heightProf.statedHeaderUnit,
    resolvedUnit: heightProf.resolvedUnit,
    resolutionStatus: heightProf.resolutionStatus,
    confidence: heightProf.confidence,
    issues: heightProf.issues.map((i) => i.code),
    evidence: heightProf.evidence,
  }, null, 2));

  console.log("\n=== Stabilization Test 2 — HEIGHT column ===");
  // covered above
  console.log("PASS");

  console.log("\n=== Stabilization Test 3 — rounded 155×500 vs 0.08 ===");
  const cmp3 = compareWithPrecision({
    expectedValue: (155 * 500) / 1_000_000,
    sourceValue: 0.08,
    displayedDecimalPlaces: 2,
    absoluteTolerance: 0,
    relativeTolerance: 0.02,
  });
  assertEq(cmp3.status, "MATCH_AFTER_ROUNDING", "155x500");
  const p1098 = result.normalizedRows.find((r) => r.raw.rawPartReference === "P1098")!;
  assertEq(p1098.height?.normalizedValue, 500, "height 500 MM");
  assertEq(p1098.height?.resolvedSourceUnit, "MM", "height unit");
  assert(
    !p1098.height?.candidateInterpretations
      .find((c) => c.sourceUnit === "MM")
      ?.evidence.includes("rowConsistency:width×height≠area"),
    "no false ≠area for MM"
  );
  console.log("PASS");

  console.log("\n=== Stabilization Test 4 — P1094 80×580 vs 0.05 ===");
  const cmp4 = compareWithPrecision({
    expectedValue: (80 * 580) / 1_000_000,
    sourceValue: 0.05,
    displayedDecimalPlaces: 2,
    absoluteTolerance: 0,
    relativeTolerance: 0.02,
  });
  assertEq(cmp4.status, "MATCH_AFTER_ROUNDING", "80x580");
  const p1094 = result.normalizedRows.find((r) => r.raw.rawPartReference === "P1094")!;
  assertEq(p1094.height?.normalizedValue, 580, "580 MM");
  console.log("P1094 precision:", JSON.stringify(cmp4, null, 2));
  console.log("PASS");

  console.log("\n=== Stabilization Test 5 — thickness weight 20 @ 0.36 m² ===");
  const p1092 = result.normalizedRows.find((r) => r.raw.rawPartReference === "P1092")!;
  assertEq(p1092.thickness?.normalizedValue, 20, "20 MM");
  assertEq(p1092.thickness?.resolvedSourceUnit, "MM", "thk unit");
  console.log("PASS");

  console.log("\n=== Stabilization Test 6 — thickness profile propagation ===");
  const thkProf = result.profiles.find((p) => p.semanticField === "THICKNESS")!;
  console.log("Final C profile:", JSON.stringify({
    resolvedUnit: thkProf.resolvedUnit,
    resolutionStatus: thkProf.resolutionStatus,
    confidence: thkProf.confidence,
    evidence: thkProf.evidence,
  }, null, 2));
  assertEq(thkProf.resolvedUnit, "MM", "C → MM");
  assertEq(
    thkProf.resolutionStatus,
    "RESOLVED_BY_COLUMN_CONSISTENCY",
    "C status"
  );
  assert(
    thkProf.confidence >=
      NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence,
    `C conf ${thkProf.confidence}`
  );
  const expectedThk: Record<string, number | null> = {
    P1091: 12,
    P1097: 16,
    P1096: 20,
    P1093: 20,
    "P1095:r16": 20,
    "P1095:r17": 20,
    P1092: 20,
    P1084: 20,
    P1094: 30,
    P1098: null,
  };
  for (const nr of result.normalizedRows) {
    const key =
      nr.raw.rawPartReference === "P1095"
        ? `P1095:r${nr.raw.source.rowNumber}`
        : nr.raw.rawPartReference!;
    const adapted = normalizedPartRowToExtractedDocumentRow(nr);
    const exp = expectedThk[key] ?? expectedThk[nr.raw.rawPartReference!];
    assertEq(adapted.thicknessMm, exp ?? null, `thk ${key}`);
  }
  console.log("PASS");

  console.log("\n=== Stabilization Test 7 — missing thickness P1098 ===");
  assertEq(p1098.thickness?.resolutionStatus, "NOT_PRESENT", "NOT_PRESENT");
  assertEq(p1098.thickness?.normalizedValue, null, "null");
  assertEq(p1098.thickness?.issues.length, 0, "no ambiguity issue");
  assertEq(p1098.thickness?.candidateInterpretations.length, 0, "no candidates");
  console.log("PASS");

  console.log("\n=== Stabilization Test 8 — field-specific ambiguity codes ===");
  // covered by resolve path; smoke check P1098 has no THICKNESS ambiguity
  assert(
    !p1098.issues.some((i) => i.code === "DOCUMENT_THICKNESS_UNIT_AMBIGUOUS"),
    "no thk ambiguity on empty"
  );
  assert(
    !p1092.issues.some((i) => i.code === "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS"),
    "P1092 no geometry ambiguity"
  );
  console.log("PASS");

  console.log("\n=== Stabilization Test 9 — P1091 units resolved, contradiction preserved ===");
  const p1091 = result.normalizedRows.find((r) => r.raw.rawPartReference === "P1091")!;
  console.log("P1091 summary:", JSON.stringify({
    width: { v: p1091.width?.normalizedValue, u: p1091.width?.resolvedSourceUnit },
    height: { v: p1091.height?.normalizedValue, u: p1091.height?.resolvedSourceUnit },
    area: { v: p1091.area?.normalizedValue, u: p1091.area?.resolvedSourceUnit, raw: p1091.area?.raw.rawValue },
    thickness: { v: p1091.thickness?.normalizedValue, u: p1091.thickness?.resolvedSourceUnit },
  }, null, 2));
  assertEq(p1091.width?.normalizedValue, 1000, "w");
  assertEq(p1091.height?.normalizedValue, 1000, "h");
  assertEq(p1091.area?.raw.rawValue, 0.04, "raw area preserved");
  assertEq(p1091.thickness?.normalizedValue, 12, "12 mm");
  // Product 1000×1000 ≠ 0.04 m² — do not silently fix
  assertEq(p1091.area?.normalizedValue, 40000, "0.04 m2 → 40000 mm2");
  console.log("PASS");

  console.log("\n=== P1092 summary ===");
  console.log(JSON.stringify({
    thickness: p1092.thickness?.normalizedValue,
    width: p1092.width?.normalizedValue,
    height: p1092.height?.normalizedValue,
    areaMm2: p1092.area?.normalizedValue,
    heightStatus: p1092.height?.resolutionStatus,
  }, null, 2));

  console.log("\nAll stabilization tests passed.");
}

main();
