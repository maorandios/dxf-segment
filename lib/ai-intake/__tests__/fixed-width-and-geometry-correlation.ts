/**
 * Checkpoint 7.0C Blocker Patch — fixed-width reconstruction + geometry correlation.
 * Run: npx tsx lib/ai-intake/__tests__/fixed-width-and-geometry-correlation.ts
 */

import {
  detectFixedWidthTable,
  inferFixedWidthHeaderSpans,
  reconstructFixedWidthRows,
  parsePlateProfile,
  mapFixedWidthHeaderSemantic,
  tryFixedWidthWorkbookReconstruction,
  FIXED_WIDTH_DETECTION_THRESHOLD,
} from "../workbook/fixed-width";
import {
  applyGeometryCorrelation,
  scoreGeometryCorrelationCandidate,
  solveGeometryAssignment,
  GEOMETRY_CORRELATION_THRESHOLDS,
} from "../dxf/geometry-correlation";
import type { WorkbookSnapshot } from "../normalization/types";
import type { ExtractedDocumentRow } from "../schemas";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";

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

function cell(
  sheet: string,
  addr: string,
  text: string,
  row: number,
  col: string
) {
  return {
    sheetName: sheet,
    cellAddress: addr,
    rawValue: text,
    formattedText: text,
    formula: null,
    formulaResult: null,
    numberFormat: null,
    rowNumber: row,
    columnLetter: col,
    isMerged: false,
    mergedRange: null,
    isHiddenRow: false,
    isHiddenColumn: false,
  };
}

function fixedWidthSnapshot(lines: string[]): WorkbookSnapshot {
  const sheetName = "Material list";
  const cells = lines.map((text, i) =>
    cell(sheetName, `A${i + 1}`, text, i + 1, "A")
  );
  return {
    documentId: "doc:fw:1",
    fileName: "plates.xlsx",
    parserKind: "EXCELJS_XLSX",
    sheets: [
      {
        sheetName,
        usedRange: `A1:A${lines.length}`,
        cells,
        mergedRanges: [],
        hidden: false,
      },
    ],
    warnings: [],
  };
}

function ordinaryMultiColumnSnapshot(): WorkbookSnapshot {
  const sheetName = "Sheet1";
  const rows = [
    ["Part", "Qty", "Thickness", "Material"],
    ["P100", "3", "10", "S235"],
    ["P101", "2", "12", "S355"],
  ];
  const cells = [];
  for (let r = 0; r < rows.length; r++) {
    const cols = ["A", "B", "C", "D"];
    for (let c = 0; c < cols.length; c++) {
      cells.push(
        cell(sheetName, `${cols[c]}${r + 1}`, rows[r]![c]!, r + 1, cols[c]!)
      );
    }
  }
  return {
    documentId: "doc:ord:1",
    fileName: "parts.xlsx",
    parserKind: "EXCELJS_XLSX",
    sheets: [
      {
        sheetName,
        usedRange: "A1:D3",
        cells,
        mergedRanges: [],
        hidden: false,
      },
    ],
    warnings: [],
  };
}

function dxf(
  partId: string,
  w: number,
  h: number
): DxfPartRegistryItem {
  return {
    id: `dxf-${partId}`,
    canonicalPartId: partId,
    revision: null,
    rawPartId: partId,
    normalizedRawPartId: partId,
    ...filenameAuthoritativeFields(partId),
    revisionIssue: false,
    duplicateIssue: false,
    filename: `${partId}.dxf`,
    widthMm: w,
    heightMm: h,
    plateAreaMm2: w * h,
    netContourAreaMm2: w * h * 0.95,
    perimeterMm: 2 * (w + h),
    geometryStatus: "VALID",
    warnings: [],
    processedGeometry: null,
  };
}

function docRow(partial: Partial<ExtractedDocumentRow> & {
  width: number;
  height: number;
  id?: string;
}): ExtractedDocumentRow {
  return {
    documentId: "doc:1",
    matchedDxfPartId: partial.matchedDxfPartId ?? null,
    rawPartReference: partial.rawPartReference ?? null,
    quantity: partial.quantity ?? 1,
    thicknessMm: partial.thicknessMm ?? 12,
    material: partial.material ?? "300W",
    description: partial.description ?? "PL12X102",
    notes: partial.notes ?? null,
    action: "INCLUDE",
    documentGeometry: {
      ...emptyDocumentGeometry(),
      width: partial.width,
      widthUnit: "MM",
      height: partial.height,
      heightUnit: "MM",
      unitWeightKg: partial.documentGeometry?.unitWeightKg ?? null,
    },
    source: {
      type: "XLSX",
      fileName: "plates.xlsx",
      sheetName: "Material list",
      rowNumber: partial.source?.rowNumber ?? 2,
      pageNumber: null,
      partReferenceCell: null,
      quantityCell: "A2",
      thicknessCell: "A2",
      materialCell: "A2",
      excerpt: partial.description ?? "PL12X102",
    },
    issues: [],
  };
}

const HEADER =
  "Profile                Grade         Qty.        Length      Weight(kg)";
const ROW1 =
  "PL12X102               300W            16           229         2.2";
const ROW2 =
  "PL12X74                300W             4           246         1.7";

/* ─── Tests ─── */

function test1_detection(): void {
  const snap = fixedWidthSnapshot([HEADER, ROW1, ROW2, ROW1.replace("16", "8")]);
  const d = detectFixedWidthTable({ snapshot: snap, sheetName: "Material list" });
  assert(d.detected, "detected");
  assert(d.confidence >= FIXED_WIDTH_DETECTION_THRESHOLD, "confidence");
  console.log("PASS test1 fixed-width detection");
}

function test2_ordinaryRejection(): void {
  const snap = ordinaryMultiColumnSnapshot();
  const d = detectFixedWidthTable({ snapshot: snap, sheetName: "Sheet1" });
  assert(!d.detected, "not detected");
  const fw = tryFixedWidthWorkbookReconstruction({
    snapshot: snap,
    documentId: "doc:ord:1",
    registry: [],
  });
  assert(!fw.activated, "not activated");
  console.log("PASS test2 ordinary table rejection");
}

function test3_narrativeRejection(): void {
  const paragraph =
    "This is a long paragraph that happens to contain   several   spaces   but is not a table of materials and quantities at all.";
  const snap = fixedWidthSnapshot([
    paragraph,
    paragraph + " more text.",
    paragraph + " even more.",
    paragraph + " still more.",
  ]);
  const d = detectFixedWidthTable({ snapshot: snap, sheetName: "Material list" });
  assert(!d.detected, "narrative rejected");
  console.log("PASS test3 narrative rejection");
}

function test4_headerSpans(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1, ROW2]);
  assert(fields.length >= 5, "five fields");
  const semantics = fields.map((f) => f.semantic);
  assert(semantics.includes("PROFILE_OR_SIZE"), "profile");
  assert(semantics.includes("MATERIAL"), "material");
  assert(semantics.includes("QUANTITY"), "qty");
  assert(semantics.includes("LENGTH"), "length");
  assert(semantics.includes("WEIGHT"), "weight");
  console.log("PASS test4 header spans");
}

function test5_rowReconstruction(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1, ROW2]);
  const { reconstructed } = reconstructFixedWidthRows({
    fileName: "plates.xlsx",
    sheetName: "Material list",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
    ],
  });
  assertEq(reconstructed.length, 1, "one data row");
  const r = reconstructed[0]!;
  assertEq(r.fields.length >= 5, true, "five fields");
  assertEq(r.sourceDescriptor, "PL12X102", "profile");
  assertEq(r.material, "300W", "material");
  assertEq(r.quantity, 16, "qty");
  assertEq(r.lengthRaw, 229, "length");
  assertEq(r.weightRaw, 2.2, "weight");
  console.log("PASS test5 row reconstruction");
}

function test6_provenance(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed } = reconstructFixedWidthRows({
    fileName: "plates.xlsx",
    sheetName: "Material list",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
    ],
  });
  const mat = reconstructed[0]!.fields.find((f) => f.semantic === "MATERIAL")!;
  assertEq(mat.evidence.cellReference, "A2", "cell");
  assertEq(mat.evidence.rowNumber, 2, "row");
  assert(mat.evidence.characterEnd > mat.evidence.characterStart, "span");
  assert(mat.evidence.originalCellText === ROW1, "full text");
  console.log("PASS test6 source provenance");
}

function test7_repeatedHeader(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed, skipped } = reconstructFixedWidthRows({
    fileName: "f.xlsx",
    sheetName: "S",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
      { rowNumber: 3, cellText: HEADER, cellReference: "A3" },
      { rowNumber: 4, cellText: ROW2, cellReference: "A4" },
    ],
  });
  assert(skipped.some((s) => s.class === "REPEATED_HEADER"), "repeated skipped");
  assertEq(reconstructed.length, 2, "two data");
  console.log("PASS test7 repeated header");
}

function test8_separatorTotal(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed, skipped } = reconstructFixedWidthRows({
    fileName: "f.xlsx",
    sheetName: "S",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
      { rowNumber: 3, cellText: "----------------", cellReference: "A3" },
      { rowNumber: 4, cellText: "Total                              20", cellReference: "A4" },
    ],
  });
  assert(skipped.some((s) => s.class === "SEPARATOR"), "sep");
  assert(skipped.some((s) => s.class === "TOTAL"), "total");
  assertEq(reconstructed.length, 1, "one part");
  console.log("PASS test8 separator and total");
}

function test9_profileParsing(): void {
  const p = parsePlateProfile("PL12X102");
  assertEq(p.status, "PARSED_EXPLICIT_PROFILE", "status");
  assertEq(p.thicknessMm, 12, "thk");
  assertEq(p.widthMm, 102, "w");
  const p2 = parsePlateProfile("PL 12 x 102");
  assert(
    p2.status === "PARSED_WITH_NORMALIZED_SEPARATOR" ||
      p2.status === "PARSED_EXPLICIT_PROFILE",
    "spaced"
  );
  console.log("PASS test9 profile parsing");
}

function test10_arbitraryIdProtection(): void {
  const p = parsePlateProfile("MPL1008");
  assertEq(p.status, "NOT_A_PROFILE", "not profile");
  const p2 = parsePlateProfile("5P1091");
  assertEq(p2.status, "NOT_A_PROFILE", "not profile 2");
  console.log("PASS test10 arbitrary ID protection");
}

function test11_identifierDistinction(): void {
  assertEq(mapFixedWidthHeaderSemantic("Profile"), "PROFILE_OR_SIZE", "sem");
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed } = reconstructFixedWidthRows({
    fileName: "f.xlsx",
    sheetName: "S",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
    ],
  });
  assertEq(reconstructed[0]!.explicitPartIdentifier, null, "no explicit id");
  assertEq(reconstructed[0]!.sourceDescriptor, "PL12X102", "descriptor");
  console.log("PASS test11 identifier distinction");
}

function test12_materialMapping(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed } = reconstructFixedWidthRows({
    fileName: "f.xlsx",
    sheetName: "S",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
    ],
  });
  assertEq(reconstructed[0]!.material, "300W", "material");
  assert(reconstructed[0]!.material !== ROW1, "not full line");
  console.log("PASS test12 material mapping");
}

function test13_quantity(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed } = reconstructFixedWidthRows({
    fileName: "f.xlsx",
    sheetName: "S",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
    ],
  });
  assertEq(reconstructed[0]!.quantity, 16, "qty");
  console.log("PASS test13 quantity mapping");
}

function test14_weightKg(): void {
  const fields = inferFixedWidthHeaderSpans(HEADER, [ROW1]);
  const { reconstructed } = reconstructFixedWidthRows({
    fileName: "f.xlsx",
    sheetName: "S",
    sourceType: "XLSX",
    columnLetter: "A",
    headerRowNumber: 1,
    headerText: HEADER,
    headerFields: fields,
    rows: [
      { rowNumber: 1, cellText: HEADER, cellReference: "A1" },
      { rowNumber: 2, cellText: ROW1, cellReference: "A2" },
    ],
  });
  assertEq(reconstructed[0]!.weightRaw, 2.2, "weight");
  assertEq(reconstructed[0]!.weightUnit, "KG", "kg");
  console.log("PASS test14 weight mapping");
}

function test15_exactIdPriority(): void {
  const rows = [
    docRow({
      width: 100,
      height: 200,
      rawPartReference: "MPL1008",
      matchedDxfPartId: null,
      description: "PL12X102",
    }),
  ];
  const registry = [dxf("MPL1008", 999, 999), dxf("OTHER", 100, 200)];
  const { documentRows, diagnostics } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  assertEq(documentRows[0]!.matchedDxfPartId, "MPL1008", "exact wins");
  assertEq(diagnostics.exactMatchCount, 1, "exact count");
  assertEq(diagnostics.geometryFallbackCount, 0, "no geometry override");
  console.log("PASS test15 exact ID priority");
}

function test16_uniqueGeometry(): void {
  const rows = [
    docRow({
      width: 102,
      height: 229,
      rawPartReference: null,
      matchedDxfPartId: null,
      thicknessMm: 12,
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 2,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "x",
      },
    }),
  ];
  const registry = [dxf("MPL1008", 102, 229), dxf("OTHER", 50, 50)];
  const { documentRows, diagnostics } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  assertEq(documentRows[0]!.matchedDxfPartId, "MPL1008", "geo match");
  assertEq(diagnostics.geometryFallbackCount, 1, "geo count");
  console.log("PASS test16 unique geometry match");
}

function test17_orientationReversal(): void {
  const rows = [
    docRow({
      width: 102,
      height: 229,
      rawPartReference: null,
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 3,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "x",
      },
    }),
  ];
  const registry = [dxf("REV", 229, 102)];
  const { documentRows } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  assertEq(documentRows[0]!.matchedDxfPartId, "REV", "reversed");
  console.log("PASS test17 orientation reversal");
}

function test18_precisionTolerance(): void {
  const c = scoreGeometryCorrelationCandidate({
    source: {
      occurrenceId: "o1",
      widthMm: 102,
      lengthMm: 229,
      thicknessMm: 12,
      material: "300W",
      quantity: 1,
      unitWeightKg: null,
      areaMm2: null,
      hasExplicitIdentifier: false,
      matchedDxfPartId: null,
    },
    dxf: {
      registryEntryId: "r1",
      partId: "P1",
      fileName: "P1.dxf",
      widthMm: 102.4,
      heightMm: 229.2,
      plateAreaMm2: 102.4 * 229.2,
      netContourAreaMm2: null,
      geometryStatus: "VALID",
    },
  });
  assert(c.eligible || c.dimensionComparison?.withinTolerance, "within tol");
  console.log("PASS test18 precision-aware tolerance");
}

function test19_dimensionMismatch(): void {
  const c = scoreGeometryCorrelationCandidate({
    source: {
      occurrenceId: "o1",
      widthMm: 102,
      lengthMm: 229,
      thicknessMm: 12,
      material: null,
      quantity: 1,
      unitWeightKg: null,
      areaMm2: 102 * 229,
      hasExplicitIdentifier: false,
      matchedDxfPartId: null,
    },
    dxf: {
      registryEntryId: "r1",
      partId: "P1",
      fileName: "P1.dxf",
      widthMm: 200,
      heightMm: 116,
      plateAreaMm2: 102 * 229, // similar area
      netContourAreaMm2: null,
      geometryStatus: "VALID",
    },
  });
  assert(!c.eligible, "rejected");
  assert(
    c.rejectionReasons.some((r) => r.includes("dimension")),
    "dim reason"
  );
  console.log("PASS test19 dimension mismatch");
}

function test20_ambiguousGeometry(): void {
  const rows = [
    docRow({
      width: 100,
      height: 200,
      rawPartReference: null,
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 5,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "x",
      },
    }),
  ];
  const registry = [dxf("A", 100, 200), dxf("B", 100, 200)];
  const { documentRows, diagnostics } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  assertEq(documentRows[0]!.matchedDxfPartId, null, "no auto pick");
  assertEq(diagnostics.ambiguousCount, 1, "ambiguous");
  assertEq(
    diagnostics.assignments[0]!.status,
    "AMBIGUOUS_GEOMETRY_MATCH",
    "status"
  );
  console.log("PASS test20 ambiguous geometry");
}

function test21_globalAssignment(): void {
  // Greedy would give both rows the same best DXF (100x200) if processed poorly;
  // global assignment should pair correctly.
  const rows = [
    docRow({
      width: 100,
      height: 200,
      rawPartReference: null,
      description: "A",
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 10,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "A",
      },
    }),
    docRow({
      width: 50,
      height: 50,
      rawPartReference: null,
      description: "B",
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 11,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "B",
      },
    }),
  ];
  const registry = [dxf("BIG", 100, 200), dxf("SMALL", 50, 50)];
  const { documentRows } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  const ids = documentRows.map((r) => r.matchedDxfPartId).sort();
  assertEq(ids.join(","), "BIG,SMALL", "both assigned uniquely");
  console.log("PASS test21 global assignment");
}

function test22_oneToOne(): void {
  const candidates = [
    {
      sourceOccurrenceId: "s1",
      registryEntryId: "r1",
      dxfPartId: "P1",
      fileName: "a.dxf",
      eligible: true,
      score: 0.9,
      orientation: "W_H" as const,
      dimensionComparison: null,
      areaRelativeError: null,
      massRelativeError: null,
      rejectionReasons: [],
    },
    {
      sourceOccurrenceId: "s2",
      registryEntryId: "r1",
      dxfPartId: "P1",
      fileName: "a.dxf",
      eligible: true,
      score: 0.85,
      orientation: "W_H" as const,
      dimensionComparison: null,
      areaRelativeError: null,
      massRelativeError: null,
      rejectionReasons: [],
    },
  ];
  const pairs = solveGeometryAssignment({
    sourceIds: ["s1", "s2"],
    registryIds: ["r1"],
    candidates,
  });
  assertEq(pairs.length, 1, "only one assignment");
  console.log("PASS test22 one-to-one assignment");
}

function test23_matchedOrphanPrevention(): void {
  // Geometry match should set matchedDxfPartId so reconcile won't orphan it.
  const rows = [
    docRow({
      width: 80,
      height: 120,
      rawPartReference: null,
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 20,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "x",
      },
    }),
  ];
  const registry = [dxf("ONLY", 80, 120)];
  const { documentRows } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  assertEq(documentRows[0]!.matchedDxfPartId, "ONLY", "matched");
  console.log("PASS test23 matched orphan prevention (correlation)");
}

function test24_unmatchedPolicy(): void {
  const rows = [
    docRow({
      width: 10,
      height: 10,
      rawPartReference: null,
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 21,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "x",
      },
    }),
  ];
  const registry = [dxf("FAR", 500, 500)];
  const { documentRows, diagnostics } = applyGeometryCorrelation({
    documentRows: rows,
    registry,
  });
  assertEq(documentRows[0]!.matchedDxfPartId, null, "unmatched");
  assert(diagnostics.unmatchedCount >= 1, "unmatched count");
  console.log("PASS test24 unmatched DXF policy path");
}

function test25_endToEndFixedWidthFields(): void {
  const snap = fixedWidthSnapshot([HEADER, ROW1, ROW2]);
  const fw = tryFixedWidthWorkbookReconstruction({
    snapshot: snap,
    documentId: "doc:fw:1",
    registry: [],
  });
  assert(fw.activated, "activated");
  const row = fw.result!.partRows[0]!;
  assertEq(row.material, "300W", "mat");
  assertEq(row.quantity?.rawValue, 16, "qty");
  assertEq(row.thickness?.rawValue, 12, "thk");
  assertEq(row.width?.rawValue, 102, "width");
  assertEq(row.height?.rawValue, 229, "length as height");
  assertEq(row.rawPartReference, null, "no id");
  assertEq(row.description, "PL12X102", "descriptor");
  assert(row.material !== ROW1, "material not full line");
  console.log("PASS test25 Review field mapping (raw rows)");
}

function test26_descriptorPreservation(): void {
  const rows = [
    docRow({
      width: 102,
      height: 229,
      rawPartReference: null,
      description: "PL12X102",
      source: {
        type: "XLSX",
        fileName: "f.xlsx",
        sheetName: "S",
        rowNumber: 30,
        pageNumber: null,
        partReferenceCell: null,
        quantityCell: null,
        thicknessCell: null,
        materialCell: null,
        excerpt: "PL12X102",
      },
    }),
  ];
  const { documentRows } = applyGeometryCorrelation({
    documentRows: rows,
    registry: [dxf("MPL1008", 102, 229)],
  });
  assertEq(documentRows[0]!.matchedDxfPartId, "MPL1008", "id");
  assertEq(documentRows[0]!.description, "PL12X102", "profile kept");
  console.log("PASS test26 source descriptor preservation");
}

function test27_issueReduction(): void {
  const snap = fixedWidthSnapshot([HEADER, ROW1, ROW2]);
  const fw = tryFixedWidthWorkbookReconstruction({
    snapshot: snap,
    documentId: "doc:fw:1",
    registry: [],
  });
  assert(fw.activated && fw.result, "activated");
  const row = fw.result!.partRows[0]!;
  assert(row.quantity != null, "qty present → no MISSING_QUANTITY root");
  assert(row.thickness != null, "thk present");
  assert(row.material != null, "mat present");
  console.log("PASS test27 issue reduction preconditions");
}

function test28_diagnostics(): void {
  const snap = fixedWidthSnapshot([HEADER, ROW1, ROW2]);
  const fw = tryFixedWidthWorkbookReconstruction({
    snapshot: snap,
    documentId: "doc:fw:1",
    registry: [],
  });
  assert(fw.diagnostics.length >= 1, "diag");
  const d = fw.diagnostics[0]!;
  assert(d.inferredSpans.length >= 5, "spans");
  assert(d.reconstructedRowCount >= 2, "rows");
  assert(d.sampleReconstructedRows.length >= 1, "samples");
  console.log("PASS test28 fixed-width diagnostics");
}

function test29_geometryDiagnostics(): void {
  const { diagnostics } = applyGeometryCorrelation({
    documentRows: [
      docRow({
        width: 102,
        height: 229,
        rawPartReference: null,
        source: {
          type: "XLSX",
          fileName: "f.xlsx",
          sheetName: "S",
          rowNumber: 40,
          pageNumber: null,
          partReferenceCell: null,
          quantityCell: null,
          thicknessCell: null,
          materialCell: null,
          excerpt: "x",
        },
      }),
    ],
    registry: [dxf("MPL1008", 102, 229)],
  });
  assert(diagnostics.assignments.length === 1, "assignment");
  assert(diagnostics.thresholds.minScore === GEOMETRY_CORRELATION_THRESHOLDS.minScore, "thr");
  assert(diagnostics.candidateMatrixSummary.length >= 1, "matrix");
  console.log("PASS test29 geometry diagnostics");
}

function main(): void {
  test1_detection();
  test2_ordinaryRejection();
  test3_narrativeRejection();
  test4_headerSpans();
  test5_rowReconstruction();
  test6_provenance();
  test7_repeatedHeader();
  test8_separatorTotal();
  test9_profileParsing();
  test10_arbitraryIdProtection();
  test11_identifierDistinction();
  test12_materialMapping();
  test13_quantity();
  test14_weightKg();
  test15_exactIdPriority();
  test16_uniqueGeometry();
  test17_orientationReversal();
  test18_precisionTolerance();
  test19_dimensionMismatch();
  test20_ambiguousGeometry();
  test21_globalAssignment();
  test22_oneToOne();
  test23_matchedOrphanPrevention();
  test24_unmatchedPolicy();
  test25_endToEndFixedWidthFields();
  test26_descriptorPreservation();
  test27_issueReduction();
  test28_diagnostics();
  test29_geometryDiagnostics();
  console.log(
    "\nAll fixed-width + geometry-correlation blocker-patch tests passed."
  );
}

main();
