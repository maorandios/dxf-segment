/**
 * Plate-area semantics + document-vs-DXF geometry regressions.
 * Run: npx tsx lib/ai-intake/__tests__/document-dxf-geometry.ts
 */
import { expandExtractionToFacts } from "../expandExtractionToFacts";
import { reconcileFinalMapping } from "../reconcileFinalMapping";
import { geometryMetricsFromProcessed } from "../buildDxfRegistry";
import { plateAreaMm2FromBoundingBox } from "@/lib/geometry/plateAreaFromBoundingBox";
import { comparePlateAreas } from "../compareDocumentDxfGeometry";
import {
  type AiRequestExtraction,
  type ExtractedDocumentRow,
} from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import type { ProcessedGeometry } from "@/types";
import { mmGeometry } from "./documentGeometryHelpers";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function registryAt(args: {
  widthMm: number;
  heightMm: number;
  netContourAreaMm2: number;
  perimeterMm?: number;
  partId?: string;
}): DxfPartRegistryItem[] {
  const partId = args.partId ?? "P1095";
  const plate = plateAreaMm2FromBoundingBox(args.widthMm, args.heightMm);
  return [
    {
      id: "dxf-1",
      canonicalPartId: partId,
      revision: null,
      rawPartId: partId,
      normalizedRawPartId: partId,
      identitySource: "FILENAME",
      identityOk: true,
      identityIssues: [],
      revisionIssue: false,
      duplicateIssue: false,
      filename: `${partId}.dxf`,
      widthMm: args.widthMm,
      heightMm: args.heightMm,
      plateAreaMm2: plate,
      netContourAreaMm2: args.netContourAreaMm2,
      perimeterMm: args.perimeterMm ?? 2 * (args.widthMm + args.heightMm),
      geometryStatus: "VALID",
      warnings: [],
      processedGeometry: null,
    },
  ];
}

function xlsxRow(
  geometry: ReturnType<typeof mmGeometry>,
  extras?: Partial<ExtractedDocumentRow>
): ExtractedDocumentRow {
  return {
    documentId: "doc:xlsx:1",
    matchedDxfPartId: "P1095",
    rawPartReference: "P1095",
    quantity: 10,
    thicknessMm: 20,
    material: "S235",
    description: null,
    notes: null,
    action: "INCLUDE",
    documentGeometry: geometry,
    source: {
      type: "XLSX",
      fileName: "file.xlsx",
      sheetName: "Sheet1",
      rowNumber: 15,
      pageNumber: null,
      partReferenceCell: "A15",
      quantityCell: "B15",
      thicknessCell: "C15",
      materialCell: "D15",
      excerpt: "P1095 geometry row",
    },
    issues: [],
    ...extras,
  };
}

function run(
  docs: ExtractedDocumentRow[],
  reg: DxfPartRegistryItem[]
) {
  const extraction: AiRequestExtraction = {
    documentRows: docs,
    emailFacts: [],
    unresolvedItems: [],
    warnings: [],
  };
  const facts = expandExtractionToFacts(extraction);
  const row = reconcileFinalMapping({
    registry: reg,
    acceptedFacts: facts,
    unresolvedItems: [],
    documentRows: docs,
  }).rows.find((r) => r.partId === (reg[0]?.canonicalPartId ?? "P1095"));
  assert(row, "missing part");
  return row;
}

// Sanity: reused helper matches Quick Quote formula
assert(
  plateAreaMm2FromBoundingBox(250, 140) === 35_000,
  "helper 250×140"
);
assert(
  plateAreaMm2FromBoundingBox(600, 600) === 360_000,
  "helper 600×600"
);

// Registry mapping from processed geometry
{
  const processed = {
    isValid: true,
    status: "valid" as const,
    statusMessage: null,
    area: 329_802,
    perimeter: 2400,
    boundingBox: {
      minX: 0,
      minY: 0,
      maxX: 600,
      maxY: 600,
      width: 600,
      height: 600,
    },
    contours: [],
    holes: [],
    preparation: null,
  } as unknown as ProcessedGeometry;
  const m = geometryMetricsFromProcessed(processed);
  assert(m.plateAreaMm2 === 360_000, `map plate=${m.plateAreaMm2}`);
  assert(m.netContourAreaMm2 === 329_802, `map net=${m.netContourAreaMm2}`);
  console.log("PASS registry maps plate vs net contour");
}

// Test 1 — rectangular envelope differs from contour area
{
  const reg = registryAt({
    widthMm: 600,
    heightMm: 600,
    netContourAreaMm2: 329_802,
    partId: "P1092",
  });
  const row = run([], reg);
  assert(row.plateAreaMm2 === 360_000, `t1 plate=${row.plateAreaMm2}`);
  assert(row.netContourAreaMm2 === 329_802, `t1 net=${row.netContourAreaMm2}`);
  assert(row.widthMm === 600 && row.heightMm === 600, "t1 dims");
  console.log("\n=== P1092 JSON ===");
  console.log(
    JSON.stringify(
      {
        partId: row.partId,
        widthMm: row.widthMm,
        heightMm: row.heightMm,
        plateAreaMm2: row.plateAreaMm2,
        netContourAreaMm2: row.netContourAreaMm2,
      },
      null,
      2
    )
  );
  console.log("PASS Test 1 envelope vs contour");
}

// P1091 example
{
  const reg = registryAt({
    widthMm: 250,
    heightMm: 140,
    netContourAreaMm2: 27_188,
    partId: "P1091",
  });
  const row = run([], reg);
  assert(row.plateAreaMm2 === 35_000, `P1091 plate=${row.plateAreaMm2}`);
  assert(row.netContourAreaMm2 === 27_188, `P1091 net=${row.netContourAreaMm2}`);
  console.log("\n=== P1091 JSON ===");
  console.log(
    JSON.stringify(
      {
        partId: row.partId,
        widthMm: row.widthMm,
        heightMm: row.heightMm,
        plateAreaMm2: row.plateAreaMm2,
        netContourAreaMm2: row.netContourAreaMm2,
      },
      null,
      2
    )
  );
}

// Test 2 — exact document area match (0.36 m²)
{
  const reg = registryAt({
    widthMm: 600,
    heightMm: 600,
    netContourAreaMm2: 329_802,
  });
  const row = run(
    [
      xlsxRow(
        mmGeometry(600, 600, {
          area: 0.36,
          areaUnit: "M2",
        })
      ),
    ],
    reg
  );
  assert(row.plateAreaMm2 === 360_000, "t2 plate");
  assert(!row.issues.includes("DOCUMENT_DXF_AREA_MISMATCH"), `t2 issues=${row.issues}`);
  assert(!row.issues.includes("DOCUMENT_DIMENSIONS_AREA_INCONSISTENT"), "t2 internal");
  const c = row.geometryComparisons[0];
  assert(
    c?.comparisonStatus === "MATCH" ||
      c?.comparisonStatus === "MATCH_AFTER_DOCUMENT_ROUNDING",
    `t2 cmp=${c?.comparisonStatus}`
  );
  assert(row.status === "READY", `t2 status=${row.status}`);
  console.log("PASS Test 2 exact area match");
}

// Test 3 — rounded area 0.04 m² vs 35,000 mm²
{
  const reg = registryAt({
    widthMm: 250,
    heightMm: 140,
    netContourAreaMm2: 27_188,
  });
  const areaResult = comparePlateAreas({
    documentAreaMm2: 40_000,
    dxfPlateAreaMm2: 35_000,
    rawArea: 0.04,
    rawAreaUnit: "M2",
  });
  assert(
    areaResult.status === "MATCH_AFTER_DOCUMENT_ROUNDING",
    `t3 helper=${areaResult.status}`
  );

  const row = run(
    [
      xlsxRow(
        mmGeometry(250, 140, {
          area: 0.04,
          areaUnit: "M2",
        })
      ),
    ],
    reg
  );
  assert(row.plateAreaMm2 === 35_000, "t3 plate");
  assert(!row.issues.includes("DOCUMENT_DXF_AREA_MISMATCH"), `t3 issues=${row.issues}`);
  assert(
    !row.issues.includes("DOCUMENT_DIMENSIONS_AREA_INCONSISTENT"),
    `t3 internal=${row.issues}`
  );
  const c = row.geometryComparisons[0];
  assert(
    c?.comparisonStatus === "MATCH_AFTER_DOCUMENT_ROUNDING" ||
      c?.comparisonStatus === "MATCH",
    `t3 cmp=${c?.comparisonStatus}`
  );
  // Rounding match must not block READY
  assert(row.status === "READY", `t3 status=${row.status}`);
  console.log("PASS Test 3 rounded area", areaResult.note);
}

// Test 4 — real mismatch 0.50 m² vs 90,000
{
  const reg = registryAt({
    widthMm: 300,
    heightMm: 300,
    netContourAreaMm2: 80_000,
  });
  const row = run(
    [
      xlsxRow(
        mmGeometry(300, 300, {
          area: 0.5,
          areaUnit: "M2",
        })
      ),
    ],
    reg
  );
  assert(row.plateAreaMm2 === 90_000, "t4 plate");
  assert(
    row.issues.includes("DOCUMENT_DXF_AREA_MISMATCH") ||
      row.issues.includes("DOCUMENT_DIMENSIONS_AREA_INCONSISTENT"),
    `t4 issues=${row.issues}`
  );
  assert(row.status === "NEEDS_REVIEW", `t4 status=${row.status}`);
  console.log("PASS Test 4 real mismatch");
}

// Test 5 — dimensions differ
{
  const reg = registryAt({
    widthMm: 300,
    heightMm: 300,
    netContourAreaMm2: 80_000,
  });
  const row = run([xlsxRow(mmGeometry(9999, 8888))], reg);
  assert(row.widthMm === 300 && row.heightMm === 300, "t5 dxf dims");
  assert(row.plateAreaMm2 === 90_000, "t5 plate");
  assert(
    row.issues.includes("DOCUMENT_DXF_DIMENSION_MISMATCH"),
    `t5 issues=${row.issues}`
  );
  assert(row.status === "NEEDS_REVIEW", `t5 status=${row.status}`);
  console.log("PASS Test 5 dimension mismatch");
}

console.log("\nALL DOCUMENT-DXF GEOMETRY / PLATE-AREA TESTS PASSED");
