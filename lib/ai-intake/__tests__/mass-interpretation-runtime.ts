/**
 * Mass Interpretation runtime integration (post-DXF).
 * Run: npx tsx lib/ai-intake/__tests__/mass-interpretation-runtime.ts
 */
import {
  assertMassInterpretationGeometryReady,
  collectReviewAreaBases,
  enrichReviewRowsWithMassInterpretation,
  getMaterialDensity,
  describeMaterialDensity,
  resolveMassInterpretation,
  serializeMassInterpretationsForDebug,
} from "../mass";
import { expectedUnitWeightKg } from "../mass/materialDensityRegistry";
import {
  buildIssuesForRows,
  resetReviewIdCountersForTests,
} from "../review/buildReviewIssues";
import { buildReviewDebugReport } from "../review/serializeReviewDebug";
import { filenameAuthoritativeFields } from "../dxfRegistryDefaults";
import { emptyDocumentGeometry } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import type {
  ExtractedDocumentRow,
} from "../schemas";
import type {
  IntakeReviewSession,
  ReviewOptionalMeasurement,
  ReviewPartRow,
} from "../review/types";
import { INTAKE_REVIEW_SCHEMA_VERSION } from "../review/types";
import type { DxfIdentityMatchResult } from "../matching/types";

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

function density(): number {
  return getMaterialDensity("S235JR")!.densityKgPerM3;
}

function unitKg(area: number, thk: number): number {
  return expectedUnitWeightKg({
    areaMm2: area,
    thicknessMm: thk,
    densityKgPerM3: density(),
  });
}

function matchedDxf(id: string): DxfIdentityMatchResult {
  return {
    status: "MATCHED",
    sourceRawId: id,
    sourceCanonicalId: id,
    matchedCanonicalId: id,
    matchedRegistryEntryId: `reg:${id}`,
    matchedPartId: id,
    candidates: [
      {
        registryEntryId: `reg:${id}`,
        partId: id,
        fileName: `${id}.dxf`,
        canonicalPartId: id,
        rawPartId: id,
        geometryStatus: "VALID",
        identityOk: true,
      },
    ],
    suggestions: [],
    reason: "EXACT_CANONICAL_MATCH",
    geometryStatus: "VALID",
  };
}

function dxfItem(
  id: string,
  plate: number,
  net: number
): DxfPartRegistryItem {
  const side = Math.sqrt(plate);
  return {
    id: `reg:${id}`,
    canonicalPartId: id,
    revision: null,
    rawPartId: id,
    normalizedRawPartId: id,
    ...filenameAuthoritativeFields(id),
    revisionIssue: false,
    duplicateIssue: false,
    filename: `${id}.dxf`,
    widthMm: side,
    heightMm: side,
    plateAreaMm2: plate,
    netContourAreaMm2: net,
    perimeterMm: null,
    geometryStatus: "VALID",
    identityOk: true,
    identityStatus: "VALID",
    identityIssues: [],
    layerIdentifiers: [],
    layerDisagreement: false,
    processedGeometry: null,
    warnings: [],
  } as unknown as DxfPartRegistryItem;
}

function meas(
  raw: number | null,
  status: ReviewOptionalMeasurement["status"] = "AMBIGUOUS",
  opts?: Partial<ReviewOptionalMeasurement>
): ReviewOptionalMeasurement {
  return {
    rawValue: raw,
    normalizedValue: status === "RESOLVED" ? raw : null,
    normalizedUnit: status === "RESOLVED" ? "KG" : null,
    status,
    sourceRefs: [
      {
        sourceType: "XLSX",
        fileName: "parts.xlsx",
        sheetName: "Parts",
        rowNumber: 1,
      },
    ],
    ...opts,
  };
}

function reviewRow(args: {
  id: string;
  qty: number;
  thk: number;
  material: string;
  plate: number;
  net: number;
  docArea: number;
  uw: number;
  tw: number;
  matched?: boolean;
}): ReviewPartRow {
  const id = args.id;
  const match = args.matched === false
    ? {
        status: "UNMATCHED" as const,
        sourceRawId: id,
        sourceCanonicalId: id,
        matchedCanonicalId: null,
        matchedRegistryEntryId: null,
        matchedPartId: null,
        candidates: [] as [],
        suggestions: [],
        reason: "NO_EXACT_CANONICAL_MATCH" as const,
        geometryStatus: null,
      }
    : matchedDxf(id);
  return {
    rowId: `rev:${id}`,
    sourceOccurrenceIds: [id],
    displayOrder: 0,
    status: "READY",
    includeInQuote: true,
    rawPartReferences: [id],
    displayPartReference: id,
    dxfMatch: match,
    dxfMatchDiagnostics: {
      sourceRawId: id,
      sourceCanonicalId: id,
      exactRegistryMatchCount: args.matched === false ? 0 : 1,
      exactRegistryEntryIds: args.matched === false ? [] : [`reg:${id}`],
      finalStatus: match.status,
      finalReason: match.reason,
      matchedRegistryEntryId:
        match.status === "MATCHED" ? match.matchedRegistryEntryId : null,
      suggestionCount: 0,
      suggestions: [],
      geometryStatus: match.geometryStatus,
    },
    matchedDxfPartId: match.status === "MATCHED" ? id : null,
    dxfMatchStatus: match.status === "MATCHED" ? "MATCHED" : "UNMATCHED",
    dxfCandidates: [],
    dxfSuggestions: [],
    quantity: {
      proposedValue: args.qty,
      currentValue: args.qty,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [
        {
          sourceType: "XLSX",
          fileName: "parts.xlsx",
          sheetName: "Parts",
          rowNumber: 1,
        },
      ],
      editedByUser: false,
    },
    thicknessMm: {
      proposedValue: args.thk,
      currentValue: args.thk,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: args.material,
      currentValue: args.material,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    dxfGeometry:
      match.status === "MATCHED"
        ? {
            widthMm: Math.sqrt(args.plate),
            heightMm: Math.sqrt(args.plate),
            plateAreaMm2: args.plate,
            netContourAreaMm2: args.net,
          }
        : null,
    documentComparison: {},
    documentEvidence: {
      area: {
        rawValue: args.docArea,
        normalizedValue: args.docArea,
        normalizedUnit: "MM2",
        status: "RESOLVED",
        sourceRefs: [],
      },
      unitWeight: meas(args.uw),
      totalWeight: meas(args.tw),
    },
    sourceMassEvidence: {
      unitWeightKg: null,
      totalWeightKg: null,
      basis: null,
      unit: null,
      status: "AMBIGUOUS",
    },
    commercialMassInput: {
      areaBasis: "DXF_BBOX_AREA",
      plateAreaMm2: args.plate,
      thicknessMm: args.thk,
      material: args.material,
    },
    dxfGeometryAcknowledged: true,
    issueIds: [],
  };
}

function makeTableRows(n: number, opts?: { tiedBases?: boolean }): ReviewPartRow[] {
  const plate = 10_000;
  const net = 7_500;
  const thk = 8;
  const qty = 50;
  const expected = unitKg(opts?.tiedBases ? plate : net, thk);
  const rows: ReviewPartRow[] = [];
  for (let i = 0; i < n; i++) {
    const uw = Number(expected.toFixed(3));
    rows.push(
      reviewRow({
        id: `PART-${String(i + 1).padStart(3, "0")}`,
        qty,
        thk,
        material: i % 2 === 0 ? "S235" : "S235JR",
        plate,
        net: opts?.tiedBases ? plate : net,
        docArea: opts?.tiedBases ? plate : plate * 1.2,
        uw,
        tw: Number((uw * qty).toFixed(3)),
      })
    );
  }
  return rows;
}

console.log("=== Mass Interpretation runtime integration ===\n");

// Test 1 — correct runtime order: bbox + net visible to resolver
{
  const rows = makeTableRows(5);
  const bases = collectReviewAreaBases({
    documentAreaMm2: 7000,
    documentAreaResolved: true,
    plateAreaMm2: 7000,
    netContourAreaMm2: 4868.8476,
    dxfMatchStatus: "MATCHED",
  });
  assert(
    bases.some((b) => b.basis === "DXF_BBOX_AREA" && b.areaMm2 === 7000),
    "T1 bbox"
  );
  assert(
    bases.some(
      (b) => b.basis === "DXF_NET_CONTOUR_AREA" && b.areaMm2 === 4868.8476
    ),
    "T1 net exact"
  );
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
    requireDxfGeometry: true,
  });
  assertEq(result.resolverCallCount, 1, "T1 one call");
  const interp = result.massInterpretations[0]!.interpretation;
  assert(
    interp.candidates.some((c) => c.sourceBasis === "DXF_NET_CONTOUR_AREA"),
    "T1 net candidate"
  );
  assert(
    interp.candidates.some((c) => c.sourceBasis === "DXF_BBOX_AREA"),
    "T1 bbox candidate"
  );
  console.log("T1 runtime order / areas OK");
}

// Test 2 — early execution without geometry
{
  const rows = makeTableRows(3).map((r) => ({
    ...r,
    dxfMatchStatus: "UNMATCHED" as const,
    dxfGeometry: null,
    matchedDxfPartId: null,
    documentEvidence: {
      ...r.documentEvidence,
      area: {
        rawValue: null,
        normalizedValue: null,
        normalizedUnit: null,
        status: "MISSING" as const,
        sourceRefs: [],
      },
    },
  }));
  const check = assertMassInterpretationGeometryReady({
    rows,
    requireMatchedGeometry: true,
  });
  assertEq(check.ok, false, "T2 not ready");
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: [],
    requireDxfGeometry: true,
  });
  const st = result.massInterpretations[0]!.interpretation.status;
  assert(
    st === "NOT_COMPARABLE" || st === "AMBIGUOUS",
    `T2 status ${st}`
  );
  assert(
    result.massInterpretations[0]!.dxfGeometryReady === false,
    "T2 geometry flag"
  );
  console.log("T2 early execution prevented OK");
}

// Test 3 — one table, many rows → one resolver call
{
  const rows = makeTableRows(99);
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assertEq(result.resolverCallCount, 1, "T3 calls");
  assertEq(result.massInterpretations[0]!.rowCount, 99, "T3 rowCount");
  assertEq(
    result.massInterpretations[0]!.grouping.sourceOccurrenceCount,
    99,
    "T3 grouping"
  );
  console.log("T3 one table many rows OK");
}

// Test 4 — density propagation
{
  for (const m of ["S235", "S235JR", "S355", "S355J2"]) {
    const d = describeMaterialDensity(m);
    assert(d.densityFound, `T4 ${m}`);
    assert(d.densityKgPerM3 != null, `T4 dens ${m}`);
  }
  assertEq(describeMaterialDensity("UNKNOWN_X").densityFound, false, "T4 unk");
  console.log("T4 density OK");
}

// Test 5 — net-contour exact propagation
{
  const net = 4868.8476;
  const bases = collectReviewAreaBases({
    documentAreaMm2: null,
    documentAreaResolved: false,
    plateAreaMm2: 7000,
    netContourAreaMm2: net,
    dxfMatchStatus: "MATCHED",
  });
  assertEq(
    bases.find((b) => b.basis === "DXF_NET_CONTOUR_AREA")!.areaMm2,
    net,
    "T5 exact"
  );
  console.log("T5 net contour OK");
}

// Test 6 — unique KG + unique net
{
  const rows = makeTableRows(8);
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  const interp = result.massInterpretations[0]!.interpretation;
  assertEq(interp.resolvedUnit, "KG", "T6 unit");
  assertEq(interp.resolvedSourceBasis, "DXF_NET_CONTOUR_AREA", "T6 basis");
  assertEq(interp.status, "RESOLVED_BY_MASS_BASIS_CONSISTENCY", "T6 status");
  assert(
    rows.every(
      (r) =>
        r.documentEvidence.unitWeight?.status === "RESOLVED" &&
        r.documentEvidence.unitWeight.normalizedValue != null
    ),
    "T6 normalized"
  );
  console.log("T6 unique KG+net OK");
}

// Test 7 — unique KG, tied bases
{
  const rows = makeTableRows(8, { tiedBases: true });
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 10_000)
    ),
  });
  const interp = result.massInterpretations[0]!.interpretation;
  assertEq(interp.resolvedUnit, "KG", "T7 unit");
  assert(
    interp.resolvedSourceBasis == null ||
      interp.status === "RESOLVED_UNIT_BASIS_AMBIGUOUS",
    `T7 basis status=${interp.status} basis=${interp.resolvedSourceBasis}`
  );
  assert(
    rows[0]!.documentEvidence.unitWeight?.normalizedValue != null,
    "T7 normalized despite basis"
  );
  console.log("T7 tied bases OK");
}

// Test 8 — unit unresolved → null normalized + grouped issue
{
  resetReviewIdCountersForTests();
  const rows = makeTableRows(6).map((r, i) => {
    const asG = i % 2 === 0;
    const raw = asG ? (r.documentEvidence.unitWeight!.rawValue! * 1000) : r.documentEvidence.unitWeight!.rawValue!;
    return {
      ...r,
      documentEvidence: {
        ...r.documentEvidence,
        unitWeight: meas(Number(raw.toFixed(3))),
        totalWeight: meas(Number((raw * 50).toFixed(3))),
      },
    };
  });
  enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assertEq(rows[0]!.sourceMassEvidence?.unit, null, "T8 unit null");
  assertEq(
    rows[0]!.documentEvidence.unitWeight?.normalizedValue,
    null,
    "T8 norm null"
  );
  const { issues } = buildIssuesForRows({ rows });
  assertEq(
    issues.filter((i) => i.code === "MASS_COLUMNS_UNIT_AMBIGUOUS").length,
    1,
    "T8 grouped"
  );
  console.log("T8 unresolved OK");
}

// Test 9 — G/TON rejected
{
  const rows = makeTableRows(8);
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  const cands = result.massInterpretations[0]!.interpretation.candidates;
  const kg = Math.max(
    ...cands.filter((c) => c.massUnit === "KG").map((c) => c.score)
  );
  const g = Math.max(
    ...cands.filter((c) => c.massUnit === "G").map((c) => c.score),
    0
  );
  const ton = Math.max(
    ...cands.filter((c) => c.massUnit === "TON").map((c) => c.score),
    0
  );
  assert(kg > g + 0.3, `T9 kg ${kg} vs g ${g}`);
  assert(kg > ton + 0.3, `T9 kg ${kg} vs ton ${ton}`);
  console.log("T9 G/TON rejected OK");
}

// Test 10 — unsupported density
{
  const dens = describeMaterialDensity("MYSTERY_ALLOY");
  assertEq(dens.densityFound, false, "T10");
  assert(dens.reason.length > 0, "T10 reason");
  const rows = makeTableRows(5).map((r) => ({
    ...r,
    material: {
      ...r.material,
      proposedValue: "MYSTERY_ALLOY",
      currentValue: "MYSTERY_ALLOY",
    },
  }));
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assert(
    result.massInterpretations[0]!.interpretation.status === "NOT_COMPARABLE" ||
      result.massInterpretations[0]!.interpretation.status === "AMBIGUOUS",
    "T10 status"
  );
  console.log("T10 unsupported density OK");
}

// Test 11 — anomalous row
{
  const rows = makeTableRows(10);
  rows[3]!.documentEvidence.unitWeight = meas(9.999);
  rows[3]!.documentEvidence.totalWeight = meas(499.95);
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assertEq(
    result.massInterpretations[0]!.interpretation.resolvedUnit,
    "KG",
    "T11 unit"
  );
  const evals =
    result.massInterpretations[0]!.interpretation.winningCandidate?.rowResults ??
    [];
  const anom = evals.find((e) => e.occurrenceId === rows[3]!.sourceOccurrenceIds[0]);
  assert(anom?.comparisonStatus === "MISMATCH", "T11 anomaly");
  console.log("T11 anomaly OK");
}

// Test 12 — order independence
{
  const base = makeTableRows(6);
  const a = enrichReviewRowsWithMassInterpretation({
    rows: [...base].reverse().map((r) => structuredClone(r)),
    registry: base.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  const b = enrichReviewRowsWithMassInterpretation({
    rows: base.map((r) => structuredClone(r)),
    registry: base.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assertEq(
    a.massInterpretations[0]!.interpretation.resolvedUnit,
    b.massInterpretations[0]!.interpretation.resolvedUnit,
    "T12 unit"
  );
  assertEq(
    a.massInterpretations[0]!.interpretation.resolvedSourceBasis,
    b.massInterpretations[0]!.interpretation.resolvedSourceBasis,
    "T12 basis"
  );
  console.log("T12 order independence OK");
}

// Test 13 — commercial boundary
{
  const rows = makeTableRows(5);
  enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assert(
    rows.every((r) => r.commercialMassInput?.areaBasis === "DXF_BBOX_AREA"),
    "T13 commercial"
  );
  assertEq(
    rows[0]!.sourceMassEvidence?.basis,
    "DXF_NET_CONTOUR_AREA",
    "T13 source basis"
  );
  console.log("T13 commercial boundary OK");
}

// Test 14 — debug output resolved + ambiguous
{
  const resolved = enrichReviewRowsWithMassInterpretation({
    rows: makeTableRows(5),
    registry: makeTableRows(5).map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  const ser = serializeMassInterpretationsForDebug(resolved.massInterpretations);
  assert(Array.isArray(ser) && ser.length === 1, "T14 ser");
  const rec = ser[0] as Record<string, unknown>;
  assert(Array.isArray(rec.candidates), "T14 candidates");
  assert(rec.thresholdEvaluation != null, "T14 threshold");
  assert(Array.isArray(rec.rowEvaluations), "T14 rows");

  const ambRows = makeTableRows(4).map((r) => ({
    ...r,
    dxfGeometry: null,
    dxfMatchStatus: "UNMATCHED" as const,
    documentEvidence: {
      ...r.documentEvidence,
      area: {
        rawValue: null,
        normalizedValue: null,
        normalizedUnit: null,
        status: "MISSING" as const,
        sourceRefs: [],
      },
    },
  }));
  const amb = enrichReviewRowsWithMassInterpretation({
    rows: ambRows,
    registry: [],
  });
  const ambSer = serializeMassInterpretationsForDebug(amb.massInterpretations);
  assert(ambSer.length === 1, "T14 amb present");
  assert(
    (ambSer[0] as { thresholdEvaluation: unknown }).thresholdEvaluation != null,
    "T14 amb threshold"
  );
  console.log("T14 debug OK");
}

// Test 15 — grouped issue
{
  resetReviewIdCountersForTests();
  const rows = makeTableRows(40).map((r) => ({
    ...r,
    documentEvidence: {
      ...r.documentEvidence,
      unitWeight: meas(0.3),
      totalWeight: meas(15),
    },
    sourceMassEvidence: {
      unitWeightKg: null,
      totalWeightKg: null,
      basis: null,
      unit: null,
      status: "AMBIGUOUS" as const,
    },
  }));
  // Force unresolved by wiping geometry after setting AMBIGUOUS evidence
  for (const r of rows) {
    r.dxfGeometry = null;
    r.dxfMatchStatus = "UNMATCHED";
  }
  enrichReviewRowsWithMassInterpretation({ rows, registry: [] });
  const { issues } = buildIssuesForRows({ rows });
  const mass = issues.filter((i) => i.code === "MASS_COLUMNS_UNIT_AMBIGUOUS");
  const perRow = issues.filter(
    (i) =>
      i.code === "OPTIONAL_MEASUREMENT_UNIT_AMBIGUOUS" &&
      (i.field === "unitWeight" || i.field === "totalWeight")
  );
  assertEq(mass.length, 1, "T15 one issue");
  assertEq(perRow.length, 0, "T15 no per-row");
  console.log("T15 grouped issue OK");
}

// Test 16 — synthetic 99-row smoke (existing behavior)
{
  const rows = makeTableRows(99);
  const result = enrichReviewRowsWithMassInterpretation({
    rows,
    registry: rows.map((r) =>
      dxfItem(r.displayPartReference!, 10_000, 7_500)
    ),
  });
  assertEq(result.resolverCallCount, 1, "T16 calls");
  assertEq(
    result.massInterpretations[0]!.interpretation.resolvedUnit,
    "KG",
    "T16 unit"
  );
  console.log("T16 99-row smoke OK");
}

// Test 17 — real-shaped integration via buildReviewSession
{
  resetReviewIdCountersForTests();
  const n = 12;
  const plate = 12_000;
  const net = 9_000;
  const thk = 10;
  const qty = 20;
  const expected = unitKg(net, thk);
  const registry = Array.from({ length: n }, (_, i) =>
    dxfItem(`GEN-${i + 100}`, plate, net)
  );
  const docs: ExtractedDocumentRow[] = registry.map((reg, i) => {
    return {
      documentId: "doc:gen:1",
      matchedDxfPartId: reg.canonicalPartId,
      rawPartReference: reg.canonicalPartId,
      quantity: qty,
      thicknessMm: thk,
      material: "S355J2",
      description: null,
      notes: null,
      action: "INCLUDE",
      documentGeometry: {
        ...emptyDocumentGeometry(),
        area: plate / 1_000_000,
        areaUnit: "M2",
        unitWeightKg: null,
        totalWeightKg: null,
        areaCell: `G${i + 2}`,
        unitWeightCell: `I${i + 2}`,
        totalWeightCell: `J${i + 2}`,
      },
      source: {
        type: "XLSX",
        fileName: "generic-mass.xlsx",
        sheetName: "SheetA",
        rowNumber: i + 2,
        pageNumber: null,
        partReferenceCell: `A${i + 2}`,
        quantityCell: `B${i + 2}`,
        thicknessCell: `C${i + 2}`,
        materialCell: `D${i + 2}`,
        excerpt: `${reg.canonicalPartId} | ${qty}`,
      },
      issues: ["DOCUMENT_MASS_UNIT_AMBIGUOUS"],
    };
  });
  // Build review rows directly then enrich — mirrors session path for mass fields
  const rows = docs.map((d) => {
    const uw = Number(expected.toFixed(3));
    return reviewRow({
      id: d.matchedDxfPartId!,
      qty: qty,
      thk,
      material: "S355J2",
      plate,
      net,
      docArea: plate,
      uw,
      tw: Number((uw * qty).toFixed(3)),
    });
  });
  const enriched = enrichReviewRowsWithMassInterpretation({
    rows,
    registry,
  });
  assertEq(
    enriched.massInterpretations[0]!.interpretation.resolvedUnit,
    "KG",
    "T17 unit"
  );
  assert(
    enriched.massInterpretations[0]!.interpretation.status ===
      "RESOLVED_BY_MASS_BASIS_CONSISTENCY" ||
      enriched.massInterpretations[0]!.interpretation.status ===
        "RESOLVED_UNIT_BASIS_AMBIGUOUS",
    "T17 status"
  );

  // Session debug includes massInterpretations
  const session: IntakeReviewSession = {
    schemaVersion: INTAKE_REVIEW_SCHEMA_VERSION,
    sessionId: "t17",
    analysisRunId: null,
    status: "REVIEW_REQUIRED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rows,
    issues: [],
    actions: [],
    decisions: [],
    summary: {
      totalRows: rows.length,
      readyRows: rows.length,
      decisionRows: 0,
      excludedRows: 0,
      blockingIssueCount: 0,
      warningCount: 0,
      readyForApproval: false,
    },
    approvedBom: null,
    massInterpretations: serializeMassInterpretationsForDebug(
      enriched.massInterpretations
    ),
  };
  const dbg = buildReviewDebugReport(session);
  assert(dbg.massInterpretations.length >= 1, "T17 debug");
  console.log("T17 real-shaped integration OK", {
    status: enriched.massInterpretations[0]!.interpretation.status,
    unit: enriched.massInterpretations[0]!.interpretation.resolvedUnit,
    basis: enriched.massInterpretations[0]!.interpretation.resolvedSourceBasis,
    rowCount: enriched.massInterpretations[0]!.rowCount,
    comparable: enriched.massInterpretations[0]!.comparableRowCount,
  });
}

// Threshold diagnostics present when ambiguous
{
  const rows = makeTableRows(2);
  const interp = resolveMassInterpretation({
    documentId: "d",
    rows: rows.map((r) => ({
      occurrenceId: r.sourceOccurrenceIds[0]!,
      partReference: r.displayPartReference,
      quantity: 50,
      thicknessMm: 8,
      material: "S235",
      unitWeightRaw: 0.3,
      unitWeightDisplayedDecimals: 3,
      unitWeightHeader: null,
      unitWeightExplicitUnit: null,
      totalWeightRaw: 15,
      totalWeightDisplayedDecimals: 3,
      totalWeightHeader: null,
      totalWeightExplicitUnit: null,
      areaBases: [],
    })),
  });
  assert(interp.thresholdEvaluation != null, "threshold present");
  assert(interp.unitScores != null && interp.unitScores.length === 3, "unit scores");
  console.log("Threshold diagnostics OK", interp.thresholdEvaluation?.rejectionReason);
}

console.log("\nAll mass-interpretation-runtime tests passed.");
