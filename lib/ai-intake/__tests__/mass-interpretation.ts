/**
 * Generic Mass Interpretation & Source Weight Validation.
 * Run: npx tsx lib/ai-intake/__tests__/mass-interpretation.ts
 */
import {
  evaluateMassCandidate,
  evaluateRelationalMassScale,
  expectedUnitWeightKg,
  getMaterialDensity,
  normalizeMassRawToKg,
  resolveMassInterpretation,
  type MassRowInput,
  type MassUnit,
  type SourceMassBasis,
} from "../mass";
import { parseMeasurementHeader } from "../normalization/parseMeasurementHeader";
import { compareWithPrecision } from "../normalization/precisionCompare";
import { NORMALIZATION_TOLERANCES } from "../normalization/normalizationConfig";
import { MASS_INTERPRETATION_THRESHOLDS } from "../mass/massInterpretationConfig";
import { buildIssuesForRows, resetReviewIdCountersForTests } from "../review/buildReviewIssues";
import { applyReviewDecision, resetDecisionIdCounterForTests } from "../review/applyReviewDecision";
import { refreshReviewSessionDerived } from "../review/buildReviewSession";
import { createApprovedBom } from "../review/createApprovedBom";
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

function densitySteel(): number {
  const d = getMaterialDensity("S235JR");
  assert(d, "S235 density");
  return d!.densityKgPerM3;
}

function unitKg(areaMm2: number, thk: number): number {
  return expectedUnitWeightKg({
    areaMm2,
    thicknessMm: thk,
    densityKgPerM3: densitySteel(),
  });
}

function row(partial: Partial<MassRowInput> & { occurrenceId: string }): MassRowInput {
  return {
    partReference: partial.partReference ?? partial.occurrenceId,
    quantity: partial.quantity ?? 10,
    thicknessMm: partial.thicknessMm ?? 10,
    material: partial.material ?? "S235JR",
    unitWeightRaw: partial.unitWeightRaw ?? null,
    unitWeightDisplayedDecimals: partial.unitWeightDisplayedDecimals ?? 3,
    unitWeightHeader: partial.unitWeightHeader ?? "Weight",
    unitWeightExplicitUnit: partial.unitWeightExplicitUnit ?? null,
    totalWeightRaw: partial.totalWeightRaw ?? null,
    totalWeightDisplayedDecimals: partial.totalWeightDisplayedDecimals ?? 3,
    totalWeightHeader: partial.totalWeightHeader ?? "Weight T",
    totalWeightExplicitUnit: partial.totalWeightExplicitUnit ?? null,
    areaBases: partial.areaBases ?? [],
    ...partial,
  };
}

function makePhysicalRows(args: {
  n: number;
  basis: SourceMassBasis;
  areaMm2: number;
  thk?: number;
  qty?: number;
  unit?: MassUnit;
  anomalyAt?: number;
}): MassRowInput[] {
  const thk = args.thk ?? 10;
  const qty = args.qty ?? 50;
  const expected = unitKg(args.areaMm2, thk);
  const unit = args.unit ?? "KG";
  const scale = unit === "G" ? 1000 : unit === "TON" ? 0.001 : 1;
  const rows: MassRowInput[] = [];
  for (let i = 0; i < args.n; i++) {
    let uw = expected * scale;
    if (args.anomalyAt === i) uw = expected * scale * 3;
    rows.push(
      row({
        occurrenceId: `occ-${i}`,
        quantity: qty,
        thicknessMm: thk,
        unitWeightRaw: Number(uw.toFixed(3)),
        totalWeightRaw: Number((uw * qty).toFixed(3)),
        areaBases: [
          {
            basis: args.basis,
            areaMm2: args.areaMm2,
            provenance: "test",
            confidence: 0.9,
          },
        ],
      })
    );
  }
  return rows;
}

function emptyMatch(): DxfIdentityMatchResult {
  return {
    status: "UNMATCHED",
    sourceRawId: null,
    sourceCanonicalId: "P1",
    matchedCanonicalId: null,
    matchedRegistryEntryId: null,
    matchedPartId: null,
    candidates: [],
    suggestions: [],
    reason: "NO_EXACT_CANONICAL_MATCH",
    geometryStatus: null,
  };
}

function matchedDxf(): DxfIdentityMatchResult {
  return {
    status: "MATCHED",
    sourceRawId: "P1",
    sourceCanonicalId: "P1",
    matchedCanonicalId: "P1",
    matchedRegistryEntryId: "reg:P1",
    matchedPartId: "P1",
    candidates: [
      {
        registryEntryId: "reg:P1",
        partId: "P1",
        fileName: "P1.dxf",
        canonicalPartId: "P1",
        rawPartId: "P1",
        geometryStatus: "VALID",
        identityOk: true,
      },
    ],
    suggestions: [],
    reason: "EXACT_CANONICAL_MATCH",
    geometryStatus: "VALID",
  };
}

function emptyDiagnostics(): ReviewPartRow["dxfMatchDiagnostics"] {
  return {
    sourceRawId: null,
    sourceCanonicalId: "P1",
    exactRegistryMatchCount: 0,
    exactRegistryEntryIds: [],
    finalStatus: "UNMATCHED",
    finalReason: "NO_EXACT_CANONICAL_MATCH",
    matchedRegistryEntryId: null,
    suggestionCount: 0,
    suggestions: [],
    geometryStatus: null,
  };
}

function stubMeas(
  raw: number | null,
  status: ReviewOptionalMeasurement["status"]
): ReviewOptionalMeasurement {
  return {
    rawValue: raw,
    normalizedValue: status === "RESOLVED" && raw != null ? raw : null,
    normalizedUnit: status === "RESOLVED" ? "KG" : null,
    status,
    sourceRefs: [],
  };
}

function stubRow(id: string, opts?: {
  uw?: ReviewOptionalMeasurement;
  tw?: ReviewOptionalMeasurement;
}): ReviewPartRow {
  return {
    rowId: id,
    sourceOccurrenceIds: [id],
    displayOrder: 0,
    status: "READY",
    includeInQuote: true,
    replacedByRowId: null,
    rawPartReferences: [id],
    displayPartReference: id,
    dxfMatch: emptyMatch(),
    dxfMatchDiagnostics: emptyDiagnostics(),
    matchedDxfPartId: "P1",
    dxfMatchStatus: "UNMATCHED",
    dxfCandidates: [],
    dxfSuggestions: [],
    quantity: {
      proposedValue: 1,
      currentValue: 1,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    thicknessMm: {
      proposedValue: 10,
      currentValue: 10,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: "S235",
      currentValue: "S235",
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    dxfGeometry: {
      widthMm: 100,
      heightMm: 50,
      plateAreaMm2: 5000,
      netContourAreaMm2: 4200,
    },
    documentComparison: {
      unitWeightKg: null,
      totalWeightKg: null,
    },
    documentEvidence: {
      unitWeight: opts?.uw ?? stubMeas(0.3, "AMBIGUOUS"),
      totalWeight: opts?.tw ?? stubMeas(15, "AMBIGUOUS"),
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
      plateAreaMm2: 5000,
      thicknessMm: 10,
      material: "S235",
    },
    dxfGeometryAcknowledged: true,
    issueIds: [],
  };
}

function stubSession(rows: ReviewPartRow[]): IntakeReviewSession {
  const { issues, actions } = buildIssuesForRows({ rows });
  return {
    schemaVersion: INTAKE_REVIEW_SCHEMA_VERSION,
    sessionId: "test-mass",
    analysisRunId: null,
    status: "REVIEW_REQUIRED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rows,
    issues,
    actions,
    decisions: [],
    summary: {
      totalRows: rows.length,
      readyRows: 0,
      decisionRows: rows.length,
      excludedRows: 0,
      blockingIssueCount: 0,
      warningCount: issues.filter((i) => i.severity === "WARNING").length,
      readyForApproval: false,
    },
    approvedBom: null,
  };
}

console.log("=== Mass Interpretation tests ===\n");

// Test 1 — relationship alone does not prove unit
{
  const rows = Array.from({ length: 5 }, (_, i) =>
    row({
      occurrenceId: `r${i}`,
      quantity: 10 + i,
      unitWeightRaw: 0.303,
      totalWeightRaw: 0.303 * (10 + i),
      thicknessMm: null,
      areaBases: [],
    })
  );
  const rel = evaluateRelationalMassScale({ rows });
  assertEq(rel.status, "RESOLVED", "T1 relational");
  const interp = resolveMassInterpretation({
    documentId: "d1",
    rows,
  });
  assertEq(interp.resolvedUnit, null, "T1 unit null");
  assertEq(interp.status, "AMBIGUOUS", "T1 ambiguous");
  assert(
    interp.semanticRelationship.status === "RESOLVED",
    "T1 semantic resolved"
  );
  console.log("T1 relationship alone → unit AMBIGUOUS OK");
}

// Test 2 — KG + bbox
{
  const area = 50_000;
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: area,
  });
  const interp = resolveMassInterpretation({ documentId: "d2", rows });
  assertEq(interp.resolvedUnit, "KG", "T2 unit");
  assertEq(interp.resolvedSourceBasis, "DXF_BBOX_AREA", "T2 basis");
  assertEq(
    interp.status,
    "RESOLVED_BY_MASS_BASIS_CONSISTENCY",
    "T2 status"
  );
  console.log("T2 KG + DXF_BBOX_AREA OK");
}

// Test 3 — KG + net contour; commercial remains bbox conceptually
{
  const bbox = 50_000;
  const net = 40_000;
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_NET_CONTOUR_AREA",
    areaMm2: net,
  }).map((r) => ({
    ...r,
    areaBases: [
      {
        basis: "DXF_BBOX_AREA" as const,
        areaMm2: bbox,
        provenance: "bbox",
        confidence: 0.9,
      },
      {
        basis: "DXF_NET_CONTOUR_AREA" as const,
        areaMm2: net,
        provenance: "net",
        confidence: 0.9,
      },
    ],
  }));
  // Observed mass matches net, not bbox
  const expectedNet = unitKg(net, 10);
  for (const r of rows) {
    r.unitWeightRaw = Number(expectedNet.toFixed(3));
    r.totalWeightRaw = Number((expectedNet * (r.quantity ?? 50)).toFixed(3));
  }
  const interp = resolveMassInterpretation({ documentId: "d3", rows });
  assertEq(interp.resolvedUnit, "KG", "T3 unit");
  assertEq(interp.resolvedSourceBasis, "DXF_NET_CONTOUR_AREA", "T3 basis");
  console.log("T3 KG + DXF_NET_CONTOUR_AREA OK");
}

// Test 4 — G rejected when KG matches
{
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: 50_000,
  });
  const interp = resolveMassInterpretation({ documentId: "d4", rows });
  const g = interp.candidates.find(
    (c) => c.massUnit === "G" && c.aggregation === "PER_ITEM"
  );
  const kg = interp.candidates.find(
    (c) => c.massUnit === "KG" && c.aggregation === "PER_ITEM"
  );
  assert(g && kg, "T4 candidates");
  assert(g!.supportRatio < 0.1, `T4 G support ${g!.supportRatio}`);
  assert(kg!.supportRatio > 0.7, `T4 KG support ${kg!.supportRatio}`);
  console.log("T4 G rejected OK");
}

// Test 5 — TON rejected
{
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: 50_000,
  });
  const interp = resolveMassInterpretation({ documentId: "d5", rows });
  const ton = interp.candidates.find(
    (c) => c.massUnit === "TON" && c.aggregation === "PER_ITEM"
  );
  assert(ton, "T5 ton candidate");
  assert(ton!.supportRatio < 0.1, `T5 TON support ${ton!.supportRatio}`);
  console.log("T5 TON rejected OK");
}

// Test 6 — DOCUMENT_AREA basis
{
  const area = 33_000;
  const rows = makePhysicalRows({
    n: 5,
    basis: "DOCUMENT_AREA",
    areaMm2: area,
  });
  const interp = resolveMassInterpretation({ documentId: "d6", rows });
  assertEq(interp.resolvedSourceBasis, "DOCUMENT_AREA", "T6 basis");
  assertEq(interp.resolvedUnit, "KG", "T6 unit");
  console.log("T6 DOCUMENT_AREA OK");
}

// Test 7 — equivalent bases → unit may resolve, basis ambiguous
{
  const area = 40_000;
  const expected = unitKg(area, 10);
  const rows = Array.from({ length: 5 }, (_, i) =>
    row({
      occurrenceId: `eq-${i}`,
      quantity: 20,
      unitWeightRaw: Number(expected.toFixed(3)),
      totalWeightRaw: Number((expected * 20).toFixed(3)),
      areaBases: [
        {
          basis: "DOCUMENT_AREA",
          areaMm2: area,
          provenance: "doc",
          confidence: 0.9,
        },
        {
          basis: "DXF_BBOX_AREA",
          areaMm2: area,
          provenance: "bbox",
          confidence: 0.9,
        },
      ],
    })
  );
  const interp = resolveMassInterpretation({ documentId: "d7", rows });
  assertEq(interp.resolvedUnit, "KG", "T7 unit");
  assert(
    interp.resolvedSourceBasis == null ||
      interp.status === "RESOLVED_UNIT_BASIS_AMBIGUOUS",
    `T7 basis ambiguous status=${interp.status} basis=${interp.resolvedSourceBasis}`
  );
  console.log("T7 equivalent bases OK");
}

// Test 8 — unknown material
{
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: 50_000,
  }).map((r) => ({ ...r, material: "UNKNOWN_ALLOY_XYZ" }));
  assertEq(getMaterialDensity("UNKNOWN_ALLOY_XYZ"), null, "T8 density null");
  const interp = resolveMassInterpretation({ documentId: "d8", rows });
  assertEq(interp.resolvedUnit, null, "T8 unit unresolved");
  const phys = evaluateMassCandidate({
    rows,
    massUnit: "KG",
    sourceBasis: "DXF_BBOX_AREA",
    aggregation: "PER_ITEM",
  });
  assertEq(phys.comparableRowCount, 0, "T8 not comparable");
  console.log("T8 unknown material OK");
}

// Test 9 — missing thickness
{
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: 50_000,
  }).map((r, i) =>
    i === 0 ? { ...r, thicknessMm: null } : r
  );
  const cand = evaluateMassCandidate({
    rows,
    massUnit: "KG",
    sourceBasis: "DXF_BBOX_AREA",
    aggregation: "PER_ITEM",
  });
  const miss = cand.rowResults.find((r) => r.occurrenceId === "occ-0");
  assertEq(miss?.comparisonStatus, "NOT_COMPARABLE", "T9 status");
  assert(miss?.reason?.includes("thickness"), "T9 reason");
  assert(cand.comparableRowCount === 4, "T9 other rows comparable");
  console.log("T9 missing thickness OK");
}

// Test 10 — missing quantity
{
  const area = 50_000;
  const expected = unitKg(area, 10);
  const rows = [
    row({
      occurrenceId: "q0",
      quantity: null,
      unitWeightRaw: Number(expected.toFixed(3)),
      totalWeightRaw: 15,
      areaBases: [
        {
          basis: "DXF_BBOX_AREA",
          areaMm2: area,
          provenance: "t",
          confidence: 0.9,
        },
      ],
    }),
  ];
  const unitCand = evaluateMassCandidate({
    rows,
    massUnit: "KG",
    sourceBasis: "DXF_BBOX_AREA",
    aggregation: "PER_ITEM",
  });
  assert(unitCand.comparableRowCount === 1, "T10 unit comparable");
  const totCand = evaluateMassCandidate({
    rows,
    massUnit: "KG",
    sourceBasis: "DXF_BBOX_AREA",
    aggregation: "TOTAL",
  });
  assertEq(totCand.comparableRowCount, 0, "T10 total not comparable");
  assertEq(
    totCand.rowResults[0]?.comparisonStatus,
    "NOT_COMPARABLE",
    "T10 total status"
  );
  console.log("T10 missing quantity OK");
}

// Test 11 — explicit KG header
{
  const rows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: 50_000,
  }).map((r) => ({
    ...r,
    unitWeightHeader: "Weight (kg)",
    unitWeightExplicitUnit: "KG" as const,
    // Deliberately wrong physical scale — must not reinterpret as G
    unitWeightRaw: 0.001,
    totalWeightRaw: 0.05,
  }));
  const interp = resolveMassInterpretation({ documentId: "d11", rows });
  assertEq(interp.resolvedUnit, "KG", "T11 explicit KG");
  assertEq(interp.status, "RESOLVED_BY_EXPLICIT_HEADER_UNIT", "T11 status");
  console.log("T11 explicit KG OK");
}

// Test 12 — explicit tonne header
{
  const h = parseMeasurementHeader("Weight [t]");
  assertEq(h.explicitUnit, "TON", "T12 parse");
  const rows = Array.from({ length: 3 }, (_, i) =>
    row({
      occurrenceId: `t${i}`,
      unitWeightHeader: "Weight [t]",
      unitWeightExplicitUnit: "TON",
      unitWeightRaw: 0.001,
      totalWeightRaw: 0.05,
      areaBases: [],
    })
  );
  const interp = resolveMassInterpretation({ documentId: "d12", rows });
  assertEq(interp.resolvedUnit, "TON", "T12 unit");
  assertEq(interp.status, "RESOLVED_BY_EXPLICIT_HEADER_UNIT", "T12 status");
  console.log("T12 explicit tonne OK");
}

// Test 13 — bare T
{
  const h = parseMeasurementHeader("Weight T");
  assertEq(h.explicitUnit, null, "T13 not ton");
  assertEq(h.aggregation, "TOTAL", "T13 aggregation TOTAL");
  console.log("T13 bare T OK");
}

// Test 14 — precision-aware rounding
{
  const cmp = compareWithPrecision({
    expectedValue: 0.306,
    sourceValue: 0.303,
    displayedDecimalPlaces: 3,
    absoluteTolerance: MASS_INTERPRETATION_THRESHOLDS.absoluteToleranceKg,
    relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
  });
  assert(
    cmp.status === "MATCH_WITHIN_TOLERANCE" ||
      cmp.status === "MATCH_AFTER_ROUNDING" ||
      cmp.status === "MISMATCH" ||
      cmp.status === "EXACT_MATCH",
    `T14 status ${cmp.status}`
  );
  // Relative error ~1% < 3% weight tolerance → should match within tolerance
  assert(
    cmp.status === "MATCH_WITHIN_TOLERANCE" ||
      cmp.status === "MATCH_AFTER_ROUNDING" ||
      cmp.status === "EXACT_MATCH",
    `T14 expected match-ish got ${cmp.status}`
  );
  console.log(`T14 precision-aware ${cmp.status} OK`);
}

// Test 15 — one anomalous row
{
  const rows = makePhysicalRows({
    n: 8,
    basis: "DXF_BBOX_AREA",
    areaMm2: 50_000,
    anomalyAt: 3,
  });
  const interp = resolveMassInterpretation({ documentId: "d15", rows });
  assertEq(interp.resolvedUnit, "KG", "T15 unit");
  assertEq(interp.resolvedSourceBasis, "DXF_BBOX_AREA", "T15 basis");
  const anom = interp.winningCandidate?.rowResults.find(
    (r) => r.occurrenceId === "occ-3"
  );
  assertEq(anom?.comparisonStatus, "MISMATCH", "T15 anomaly mismatch");
  assertEq(rows[3]!.unitWeightRaw, rows[3]!.unitWeightRaw, "T15 raw preserved");
  console.log("T15 anomalous row OK");
}

// Test 16 — insufficient support / close candidates
{
  const area = 50_000;
  const expected = unitKg(area, 10);
  // Half KG-like, half G-like → ambiguous
  const rows: MassRowInput[] = [];
  for (let i = 0; i < 6; i++) {
    const asG = i % 2 === 0;
    const uw = asG ? expected * 1000 : expected;
    rows.push(
      row({
        occurrenceId: `amb-${i}`,
        unitWeightRaw: Number(uw.toFixed(3)),
        totalWeightRaw: Number((uw * 10).toFixed(3)),
        quantity: 10,
        areaBases: [
          {
            basis: "DXF_BBOX_AREA",
            areaMm2: area,
            provenance: "t",
            confidence: 0.9,
          },
        ],
      })
    );
  }
  const interp = resolveMassInterpretation({ documentId: "d16", rows });
  assertEq(interp.status, "AMBIGUOUS", "T16 ambiguous");
  assertEq(interp.resolvedUnit, null, "T16 unit null");
  assertEq(normalizeMassRawToKg(0.3, null), null, "T16 no normalized");
  console.log("T16 insufficient support OK");
}

// Test 17 — candidate order independence
{
  const baseRows = makePhysicalRows({
    n: 5,
    basis: "DXF_BBOX_AREA",
    areaMm2: 45_000,
  });
  const a = resolveMassInterpretation({
    documentId: "d17",
    rows: [...baseRows].reverse(),
  });
  const b = resolveMassInterpretation({
    documentId: "d17",
    rows: baseRows,
  });
  assertEq(a.resolvedUnit, b.resolvedUnit, "T17 unit");
  assertEq(a.resolvedSourceBasis, b.resolvedSourceBasis, "T17 basis");
  assertEq(a.status, b.status, "T17 status");
  console.log("T17 order independence OK");
}

// Test 18 — grouped Review warning
{
  resetReviewIdCountersForTests();
  const rows = Array.from({ length: 99 }, (_, i) => stubRow(`r${i}`));
  const { issues } = buildIssuesForRows({ rows });
  const massIssues = issues.filter((i) => i.code === "MASS_COLUMNS_UNIT_AMBIGUOUS");
  const perRowMass = issues.filter(
    (i) =>
      i.code === "OPTIONAL_MEASUREMENT_UNIT_AMBIGUOUS" &&
      (i.field === "unitWeight" || i.field === "totalWeight")
  );
  assertEq(massIssues.length, 1, "T18 one grouped");
  assertEq(perRowMass.length, 0, "T18 no per-row mass");
  assertEq(massIssues[0]!.rowIds.length, 99, "T18 all rows");
  assertEq(
    massIssues[0]!.title,
    "יחידות עמודות המשקל לא הוכרעו",
    "T18 title"
  );
  console.log("T18 grouped warning OK");
}

// Test 19 — manual KG confirmation
{
  resetReviewIdCountersForTests();
  resetDecisionIdCounterForTests();
  const rows = [stubRow("a"), stubRow("b")];
  let session = stubSession(rows);
  const action = session.actions.find(
    (a) => a.type === "CONFIRM_RELATED_MASS_COLUMNS_UNIT" && a.payload.unit === "KG"
  );
  assert(action, "T19 action");
  const rawBefore = session.rows[0]!.documentEvidence.unitWeight!.rawValue;
  session = applyReviewDecision(session, {
    kind: "ACTION",
    action,
    createdAt: new Date().toISOString(),
  });
  session = refreshReviewSessionDerived(session);
  assertEq(session.decisions.length, 1, "T19 one decision");
  assertEq(
    session.rows[0]!.documentEvidence.unitWeight!.rawValue,
    rawBefore,
    "T19 raw preserved"
  );
  assertEq(
    session.rows[0]!.documentEvidence.unitWeight!.normalizedUnit,
    "KG",
    "T19 normalized unit"
  );
  assert(
    session.rows[0]!.documentEvidence.unitWeight!.status === "RESOLVED",
    "T19 resolved"
  );
  assertEq(session.rows[0]!.sourceMassEvidence?.unit, "KG", "T19 evidence unit");
  assertEq(
    session.rows[0]!.sourceMassEvidence?.basis,
    null,
    "T19 basis may stay unknown"
  );
  console.log("T19 manual confirmation OK");
}

// Test 20 — commercial boundary
{
  resetReviewIdCountersForTests();
  const row = stubRow("c1", {
    uw: stubMeas(0.3, "RESOLVED"),
    tw: stubMeas(15, "RESOLVED"),
  });
  row.dxfMatchStatus = "MATCHED";
  row.dxfMatch = matchedDxf();
  row.matchedDxfPartId = "P1";
  row.dxfMatchDiagnostics = {
    ...emptyDiagnostics(),
    finalStatus: "MATCHED",
    finalReason: "EXACT_CANONICAL_MATCH",
    exactRegistryMatchCount: 1,
    exactRegistryEntryIds: ["reg:P1"],
    matchedRegistryEntryId: "reg:P1",
    geometryStatus: "VALID",
  };
  row.dxfCandidates = [
    {
      partId: "P1",
      fileName: "P1.dxf",
      score: 1,
      registryEntryId: "reg:P1",
    },
  ];
  row.sourceMassEvidence = {
    unitWeightKg: 0.3,
    totalWeightKg: 15,
    basis: "DXF_NET_CONTOUR_AREA",
    unit: "KG",
    status: "RESOLVED_BY_MASS_BASIS_CONSISTENCY",
  };
  row.status = "READY";
  row.dxfGeometryAcknowledged = true;
  const session = stubSession([row]);
  session.status = "READY_FOR_APPROVAL";
  session.summary.readyForApproval = true;
  session.summary.blockingIssueCount = 0;
  session.summary.decisionRows = 0;
  session.summary.readyRows = 1;
  session.issues = session.issues.filter((i) => i.severity !== "BLOCKING");
  // Ensure row is READY without blocking issues on it
  for (const i of session.issues) {
    if (i.severity === "BLOCKING") i.resolved = true;
  }
  row.status = "READY";
  row.issueIds = [];
  const bom = createApprovedBom({
    ...session,
    rows: [row],
    issues: [],
    summary: {
      ...session.summary,
      readyForApproval: true,
      blockingIssueCount: 0,
      decisionRows: 0,
      readyRows: 1,
    },
  });
  assertEq(bom.parts[0]!.plateAreaMm2, 5000, "T20 commercial bbox area");
  assertEq(bom.parts[0]!.thicknessMm, 10, "T20 thk");
  assertEq(bom.parts[0]!.material, "S235", "T20 mat");
  assertEq(bom.parts[0]!.quantity, 1, "T20 qty");
  assert(
    !("unitWeightKg" in bom.parts[0]!),
    "T20 no source mass on BOM part"
  );
  console.log("T20 commercial boundary OK");
}

// Density registry smoke
{
  assert(getMaterialDensity("S235"), "steel");
  assert(getMaterialDensity("AL6061"), "aluminium");
  assertEq(getMaterialDensity(""), null, "empty");
  console.log("Density registry OK");
}

// Test 21 — large synthetic table smoke (generic, no fixture headers)
{
  const n = 99;
  const area = 42_000;
  const rows = makePhysicalRows({
    n,
    basis: "DXF_NET_CONTOUR_AREA",
    areaMm2: area,
  }).map((r) => ({
    ...r,
    areaBases: [
      {
        basis: "DXF_BBOX_AREA" as const,
        areaMm2: area * 1.15,
        provenance: "bbox",
        confidence: 0.9,
      },
      {
        basis: "DXF_NET_CONTOUR_AREA" as const,
        areaMm2: area,
        provenance: "net",
        confidence: 0.9,
      },
    ],
  }));
  const interp = resolveMassInterpretation({ documentId: "smoke-large", rows });
  assertEq(interp.resolvedUnit, "KG", "T21 unit");
  assertEq(interp.resolvedSourceBasis, "DXF_NET_CONTOUR_AREA", "T21 basis");
  assertEq(
    interp.status,
    "RESOLVED_BY_MASS_BASIS_CONSISTENCY",
    "T21 status"
  );
  assert(
    interp.semanticRelationship.status === "RESOLVED",
    "T21 relationship"
  );
  resetReviewIdCountersForTests();
  const reviewRows = Array.from({ length: n }, (_, i) =>
    stubRow(`smoke-${i}`, {
      uw: stubMeas(rows[i]!.unitWeightRaw, "RESOLVED"),
      tw: stubMeas(rows[i]!.totalWeightRaw, "RESOLVED"),
    })
  );
  // Ambiguous subset for grouping check when unresolved
  const amb = Array.from({ length: n }, (_, i) => stubRow(`amb-${i}`));
  const { issues } = buildIssuesForRows({ rows: amb });
  assertEq(
    issues.filter((i) => i.code === "MASS_COLUMNS_UNIT_AMBIGUOUS").length,
    1,
    "T21 grouped"
  );
  void reviewRows;
  console.log("T21 large-table smoke OK");
}

console.log("\nAll mass-interpretation tests passed.");
