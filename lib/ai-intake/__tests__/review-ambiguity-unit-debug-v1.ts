/**
 * Generic Review Ambiguity, Unit Authority and Debug Integrity Patch v1.
 * Run: npx tsx lib/ai-intake/__tests__/review-ambiguity-unit-debug-v1.ts
 */

import {
  applyGeometryCorrelation,
  applyDxfAssignmentToOccurrence,
  buildDxfReservations,
  heldOrReservedRegistryIds,
} from "../dxf/geometry-correlation";
import {
  buildAmbiguityGroupId,
  decodeGeometryCandidatesNote,
  geometryCandidateToCanonical,
} from "../dxf/geometry-correlation/canonicalDxfMatch";
import { documentRowToOccurrence } from "../requestOccurrences";
import { emptyDocumentGeometry, type ExtractedDocumentRow } from "../schemas";
import type { DxfPartRegistryItem } from "../types";
import {
  resolveAsStatedExplicitUnit,
  ensureAsStatedIdempotent,
  assertNoUnexplainedUnitDowngrade,
} from "../units/explicitUnitAuthority";
import { extractScopedUnitEvidence } from "../workbook/interpreter/unitEvidence";
import {
  classifySourceForProviderExtraction,
  summarizeProviderCalls,
  type ProviderCallRecord,
} from "../provider/classifySourceForProviderExtraction";
import {
  deepSnapshot,
  validateDebugSnapshots,
  buildDebugEntityRegistry,
} from "../debug/developer-bundle/debugSnapshots";
import { evaluateAnalysisSafetyGate } from "../safety/evaluateAnalysisSafetyGate";
import { applyReviewDecision } from "../review/applyReviewDecision";
import type { IntakeReviewSession, ReviewPartRow } from "../review/types";
import { reconcileFinalMapping } from "../reconcileFinalMapping";

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

function docRow(
  partial: Partial<ExtractedDocumentRow> & { documentId: string }
): ExtractedDocumentRow {
  return {
    matchedDxfPartId: null,
    rawPartReference: null,
    quantity: 2,
    thicknessMm: 12,
    material: "S355",
    description: "PL12X100",
    notes: null,
    action: "INCLUDE",
    documentGeometry: {
      ...emptyDocumentGeometry(),
      width: 100,
      widthUnit: "MM",
      height: 200,
      heightUnit: "MM",
    },
    source: {
      type: "XLSX",
      fileName: "parts.xlsx",
      sheetName: "S",
      rowNumber: 2,
      pageNumber: null,
      partReferenceCell: null,
      quantityCell: null,
      thicknessCell: null,
      materialCell: null,
      excerpt: null,
    },
    issues: [],
    ...partial,
  };
}

function reg(
  id: string,
  partId: string,
  w: number,
  h: number
): DxfPartRegistryItem {
  return {
    id,
    canonicalPartId: partId,
    revision: null,
    rawPartId: partId,
    normalizedRawPartId: partId,
    identitySource: null,
    identityOk: true,
    identityIssues: [],
    identity: { status: "VALID", issues: [] },
    layerMetadata: { layers: [], issues: [] },
    revisionIssue: false,
    duplicateIssue: false,
    filename: `${partId}.dxf`,
    widthMm: w,
    heightMm: h,
    plateAreaMm2: w * h,
    netContourAreaMm2: w * h,
    perimeterMm: 2 * (w + h),
    geometryStatus: "VALID",
    warnings: [],
  } as unknown as DxfPartRegistryItem;
}

function test1_ambiguousPropagation(): void {
  const rows = [
    docRow({ documentId: "d1", source: {
      type: "XLSX", fileName: "a.xlsx", sheetName: "S", rowNumber: 2,
      pageNumber: null, partReferenceCell: null, quantityCell: null,
      thicknessCell: null, materialCell: null, excerpt: null,
    }}),
  ];
  const registry = [
    reg("r1", "A", 100, 200),
    reg("r2", "B", 100.2, 200.1),
  ];
  const result = applyGeometryCorrelation({
    documentRows: rows,
    registry,
    tableId: "t1",
  });
  const amb = result.diagnostics.assignments.find(
    (a) => a.status === "AMBIGUOUS_GEOMETRY_MATCH"
  );
  // May or may not be ambiguous depending on scores — force via assignment helper
  const enriched = applyDxfAssignmentToOccurrence({
    occurrence: rows[0]!,
    assignment: {
      matchedDxfPartId: null,
      matchStatus: "AMBIGUOUS_GEOMETRY_MATCH",
      matchReason: "AMBIGUOUS_GEOMETRY_MATCH",
      ambiguityGroupId: buildAmbiguityGroupId("occ1"),
      candidates: [
        geometryCandidateToCanonical(
          {
            registryEntryId: "r1",
            dxfPartId: "A",
            fileName: "A.dxf",
            eligible: true,
            score: 0.9,
            orientation: "W_H",
            dimensionComparison: {
              absoluteError1: 0.1,
              absoluteError2: 0.1,
            },
            areaRelativeError: 0.001,
            massRelativeError: null,
            rejectionReasons: [],
          },
          1
        ),
        geometryCandidateToCanonical(
          {
            registryEntryId: "r2",
            dxfPartId: "B",
            fileName: "B.dxf",
            eligible: true,
            score: 0.88,
            orientation: "W_H",
            dimensionComparison: {
              absoluteError1: 0.2,
              absoluteError2: 0.2,
            },
            areaRelativeError: 0.002,
            massRelativeError: null,
            rejectionReasons: [],
          },
          2
        ),
      ],
    },
  });
  assertEq(enriched.quantity, 2, "qty preserved");
  assertEq(enriched.material, "S355", "mat preserved");
  assertEq(enriched.thicknessMm, 12, "thk preserved");
  assert(
    String(enriched.notes).includes("matchMethod:AMBIGUOUS_GEOMETRY"),
    "amb note"
  );
  assert((enriched.geometryCandidates?.length ?? 0) >= 2, "candidates");
  const occ = documentRowToOccurrence(enriched);
  assertEq(occ.matchMethod, "AMBIGUOUS_GEOMETRY", "occ method");
  assert((occ.geometryCandidates?.length ?? 0) >= 2, "occ cands");
  void amb;
  void result;
}

function test10_heldCandidate(): void {
  const reservations = buildDxfReservations({
    registry: [
      { id: "r1", canonicalPartId: "A", geometryStatus: "VALID" },
      { id: "r2", canonicalPartId: "B", geometryStatus: "VALID" },
    ],
    assignments: [
      {
        sourceOccurrenceId: "o1",
        status: "AMBIGUOUS_GEOMETRY_MATCH",
        matchedRegistryEntryId: null,
        candidates: [{ registryEntryId: "r1" }, { registryEntryId: "r2" }],
      },
    ],
  });
  assertEq(
    reservations.find((r) => r.registryEntryId === "r1")?.state,
    "HELD_BY_AMBIGUITY",
    "held"
  );
  const held = heldOrReservedRegistryIds(reservations);
  assert(held.has("r1") && held.has("r2"), "both held");
}

function test11_noHeldOrphan(): void {
  const reservations = buildDxfReservations({
    registry: [
      { id: "r1", canonicalPartId: "A", geometryStatus: "VALID" },
      { id: "r3", canonicalPartId: "C", geometryStatus: "VALID" },
    ],
    assignments: [
      {
        sourceOccurrenceId: "o1",
        status: "AMBIGUOUS_GEOMETRY_MATCH",
        matchedRegistryEntryId: null,
        candidates: [{ registryEntryId: "r1" }],
      },
    ],
  });
  const suppress = heldOrReservedRegistryIds(reservations);
  assert(suppress.has("r1"), "held suppressed");
  assert(!suppress.has("r3"), "unreserved not suppressed");
}

function test20_explicitLengthUnit(): void {
  const r = resolveAsStatedExplicitUnit({
    rawValue: 15,
    statedUnit: "MM",
    targetField: "LENGTH",
  });
  assertEq(r.status, "AS_STATED", "status");
  assertEq(r.normalizedValue, 15, "value");
  assertEq(r.normalizedUnit, "MM", "unit");
}

function test21_explicitMassUnit(): void {
  const r = resolveAsStatedExplicitUnit({
    rawValue: 1.2,
    statedUnit: "KG",
    targetField: "UNIT_WEIGHT",
  });
  assertEq(r.status, "AS_STATED", "mass as stated");
  assertEq(r.normalizedUnit, "KG", "kg");
}

function test22_noExplicitDowngrade(): void {
  let threw = false;
  try {
    assertNoUnexplainedUnitDowngrade({
      previous: {
        resolutionStatus: "AS_STATED",
        normalizedValue: 10,
        normalizedUnit: "MM",
        statedUnit: "MM",
      },
      next: {
        resolutionStatus: "AMBIGUOUS",
        normalizedValue: null,
        normalizedUnit: null,
        resolutionReason: null,
      },
    });
  } catch {
    threw = true;
  }
  assert(threw, "downgrade without reason throws");
}

function test23_unitScoping(): void {
  const massOnLength = extractScopedUnitEvidence({
    governingText: "Weight (kg)",
    targetField: "LENGTH",
  });
  assertEq(massOnLength, null, "no bleed");
}

function test24_idempotence(): void {
  const m = {
    raw: {
      rawValue: 10,
      rawText: "10",
      statedUnit: "MM" as const,
      rawHeader: "Length (mm)",
      displayedDecimalPlaces: null,
      sourceCell: "A1",
      numberFormat: null,
      formula: null,
      formulaResult: null,
      origin: "DETERMINISTIC_WORKBOOK_CELL" as const,
    },
    normalizedValue: 10,
    normalizedUnit: "MM" as const,
    statedUnit: "MM" as const,
    resolvedSourceUnit: "MM" as const,
    resolutionStatus: "AS_STATED" as const,
    resolutionReason: "Validated field-level explicit unit",
    candidateInterpretations: [],
    issues: [],
  };
  const once = ensureAsStatedIdempotent(m);
  const twice = ensureAsStatedIdempotent(once);
  assertEq(once.normalizedValue, twice.normalizedValue, "idempotent value");
  assertEq(once.normalizedUnit, twice.normalizedUnit, "idempotent unit");
  assertEq(once.resolutionStatus, "AS_STATED", "status");
}

function test31_detachedDebug(): void {
  const live: Record<string, unknown> = { a: 1 };
  live.self = live;
  const snap = deepSnapshot({ reservations: [{ id: "r1", state: "HELD" }] });
  const json = JSON.stringify(snap);
  assert(!json.includes("[Circular]"), "no circular marker");
  const v = validateDebugSnapshots({
    sections: { snap },
  });
  assert(v.ok, v.failures.join(","));
}

function test37_circularFailsValidation(): void {
  const v = validateDebugSnapshots({
    sections: { bad: { x: "[Circular]" } },
  });
  assert(!v.ok, "detects circular placeholder");
}

function test38_emptyEmail(): void {
  const e = classifySourceForProviderExtraction({
    kind: "EMAIL",
    subject: "Quote — Project / Customer",
    body: "",
    attachmentIds: [],
  });
  assert(!e.eligible, "not eligible");
  assert(
    e.reason === "EMPTY_TEXT" || e.reason === "METADATA_ONLY",
    e.reason
  );
}

function test39_whitespaceEmail(): void {
  const e = classifySourceForProviderExtraction({
    kind: "EMAIL",
    subject: "",
    body: "   \n\t  ",
  });
  assert(!e.eligible, "whitespace skip");
}

function test40_metadataOnly(): void {
  const e = classifySourceForProviderExtraction({
    kind: "EMAIL",
    subject: "Quote — Foo",
    body: "Quote — Foo",
  });
  assert(!e.eligible, "metadata only");
}

function test41_meaningfulEmail(): void {
  const e = classifySourceForProviderExtraction({
    kind: "EMAIL",
    subject: "Update",
    body: "Please quote 10 plates of S355 thickness 12mm for project wing.",
  });
  assert(e.eligible, "eligible");
  assertEq(e.reason, "HAS_MEANINGFUL_TEXT", "reason");
}

function test42_attachmentDedup(): void {
  const e = classifySourceForProviderExtraction({
    kind: "EMAIL",
    subject: "files",
    body: "",
    attachmentIds: ["doc1"],
    alreadyHandledAttachmentIds: ["doc1"],
  });
  assert(!e.eligible, "no unique attachment");
}

function test43_providerTaxonomy(): void {
  const records: ProviderCallRecord[] = [
    {
      providerCallId: "c1",
      provider: "openai",
      model: "x",
      purpose: "EMAIL_EXTRACTION",
      sourceIds: ["email:1"],
      startedAt: "t0",
      completedAt: "t1",
      durationMs: 10,
      inputCharacters: 100,
      inputTokens: 20,
      outputTokens: 5,
      skipped: false,
      skipReason: null,
      status: "SUCCEEDED",
    },
    {
      providerCallId: "c2",
      provider: "openai",
      model: "x",
      purpose: "EMAIL_EXTRACTION",
      sourceIds: ["email:2"],
      startedAt: "t0",
      completedAt: "t1",
      durationMs: 0,
      inputCharacters: 0,
      inputTokens: null,
      outputTokens: null,
      skipped: true,
      skipReason: "EMPTY_TEXT",
      status: "SKIPPED",
    },
  ];
  const s = summarizeProviderCalls(records);
  assertEq(s.nonSkippedCount, 1, "one real call");
  assertEq(s.skippedCount, 1, "one skipped");
  assertEq(s.totalProviderCallCount, 1, "totals");
}

function test48_safeReviewRequired(): void {
  const gate = evaluateAnalysisSafetyGate({
    analyze: {
      acceptedFacts: [],
      extraction: { documentRows: [], unresolvedItems: [] },
      warnings: [],
      aggregated: { documents: [] },
    } as never,
    reviewSession: {
      rows: [
        {
          rowId: "r1",
          includeInQuote: true,
          status: "NEEDS_DECISION",
          dxfMatchStatus: "AMBIGUOUS",
          dxfMatch: {
            status: "AMBIGUOUS",
            reason: "AMBIGUOUS_GEOMETRY_MATCH",
            candidates: [{ partId: "A" }],
          },
          dxfCandidates: [
            { partId: "A", fileName: "A.dxf", reason: "AMBIGUOUS_GEOMETRY_MATCH", score: 0.9 },
          ],
          quantity: { proposedValue: 1, currentValue: 1, state: "VERIFIED" },
          thicknessMm: { proposedValue: 10, currentValue: 10, state: "VERIFIED" },
          material: { proposedValue: "X", currentValue: "X", state: "VERIFIED" },
        },
      ],
      issues: [
        {
          issueId: "i1",
          code: "AMBIGUOUS_DXF_MATCH",
          severity: "BLOCKING",
          rowIds: ["r1"],
        },
      ],
    } as unknown as IntakeReviewSession,
    analysisErrorHe: null,
    exception: null,
  });
  assert(gate.workingTableReady, "table ready with ambiguity");
  assertEq(gate.finalRunStatus, "SUCCESS_REVIEW_REQUIRED", "review required");
}

function test49_unsafeLostCandidates(): void {
  const gate = evaluateAnalysisSafetyGate({
    analyze: {
      acceptedFacts: [],
      extraction: { documentRows: [], unresolvedItems: [] },
      warnings: [],
      aggregated: { documents: [] },
    } as never,
    reviewSession: {
      rows: [
        {
          rowId: "r1",
          includeInQuote: true,
          status: "NEEDS_DECISION",
          dxfMatchStatus: "AMBIGUOUS",
          dxfMatch: {
            status: "AMBIGUOUS",
            reason: "AMBIGUOUS_GEOMETRY_MATCH",
            candidates: [],
          },
          dxfCandidates: [],
          quantity: { proposedValue: 1, currentValue: 1, state: "VERIFIED" },
          thicknessMm: { proposedValue: 10, currentValue: 10, state: "VERIFIED" },
          material: { proposedValue: "X", currentValue: "X", state: "VERIFIED" },
        },
      ],
      issues: [],
    } as unknown as IntakeReviewSession,
    analysisErrorHe: null,
    exception: null,
  });
  assertEq(gate.status, "UNSAFE_RESULT", "unsafe");
  assert(!gate.workingTableReady, "blocked");
}

function test6_candidateSelection(): void {
  const row = {
    rowId: "row1",
    includeInQuote: true,
    status: "NEEDS_DECISION",
    matchedDxfPartId: null,
    displayPartReference: "PL12",
    dxfMatchStatus: "AMBIGUOUS",
    dxfMatch: {
      status: "AMBIGUOUS",
      sourceRawId: null,
      sourceCanonicalId: null,
      matchedCanonicalId: null,
      matchedRegistryEntryId: null,
      matchedPartId: null,
      candidates: [
        {
          registryEntryId: "r1",
          partId: "A",
          fileName: "A.dxf",
          canonicalPartId: "A",
          rawPartId: "A",
          geometryStatus: "VALID",
          identityOk: true,
        },
      ],
      suggestions: [],
      reason: "AMBIGUOUS_GEOMETRY_MATCH",
      geometryStatus: null,
      method: "GEOMETRY",
      ambiguityGroupId: "amb:1",
    },
    dxfCandidates: [
      {
        partId: "A",
        fileName: "A.dxf",
        reason: "AMBIGUOUS_GEOMETRY_MATCH",
        score: 0.9,
        registryEntryId: "r1",
      },
    ],
    dxfSuggestions: [],
    dxfMatchDiagnostics: {
      sourceRawId: null,
      sourceCanonicalId: null,
      exactRegistryMatchCount: 0,
      exactRegistryEntryIds: [],
      finalStatus: "AMBIGUOUS",
      finalReason: "AMBIGUOUS_GEOMETRY_MATCH",
      matchedRegistryEntryId: null,
      suggestionCount: 0,
      suggestions: [],
      geometryStatus: null,
    },
    quantity: {
      proposedValue: 2,
      currentValue: 2,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: "S355",
      currentValue: "S355",
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    thicknessMm: {
      proposedValue: 12,
      currentValue: 12,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    issueIds: [],
    sourceOccurrenceIds: ["occ1"],
    rawPartReferences: [],
    displayOrder: 1,
    dxfGeometry: null,
    documentEvidence: {
      width: { status: "RESOLVED", normalizedValue: 100 },
      height: { status: "RESOLVED", normalizedValue: 200 },
      area: null,
      unitWeightKg: null,
      totalWeightKg: null,
    },
    documentComparison: {
      widthMm: 100,
      heightMm: 200,
    },
    sourceMassEvidence: null,
    replacedByRowId: null,
    dxfGeometryAcknowledged: false,
  } as unknown as ReviewPartRow;

  const session = {
    schemaVersion: "ai-intake-review/v1",
    sessionId: "s1",
    status: "REVIEW_REQUIRED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rows: [row],
    issues: [],
    actions: [],
    decisions: [],
    summary: {
      totalRows: 1,
      readyRows: 0,
      decisionRows: 1,
      excludedRows: 0,
      blockingIssueCount: 0,
      warningCount: 0,
      readyForApproval: false,
    },
  } as unknown as IntakeReviewSession;

  const next = applyReviewDecision(session, {
    kind: "ACTION",
    action: {
      actionId: "act1",
      issueId: "",
      type: "SELECT_DXF_MATCH",
      label: "בחר DXF",
      recommended: false,
      appliesToRowIds: ["row1"],
      payload: {
        rowId: "row1",
        partId: "A",
        fileName: "A.dxf",
        registryEntryId: "r1",
        decisionType: "SELECT_DXF_CANDIDATE",
      },
    },
  });
  assertEq(next.rows[0]!.dxfMatchStatus, "MATCHED", "resolved");
  assertEq(next.rows[0]!.matchedDxfPartId, "A", "part");
  assertEq(next.rows[0]!.quantity.currentValue, 2, "qty kept");
  assert(
    next.rows[0]!.dxfMatch.reason === "MATCHED_BY_GEOMETRY" ||
      next.rows[0]!.dxfMatch.reason === "USER_SELECTED_DXF",
    "geometry reason"
  );
}

function test7_invalidCandidateRejected(): void {
  const row = {
    rowId: "row1",
    includeInQuote: true,
    status: "NEEDS_DECISION",
    matchedDxfPartId: null,
    dxfMatchStatus: "AMBIGUOUS",
    dxfMatch: {
      status: "AMBIGUOUS",
      sourceRawId: null,
      sourceCanonicalId: null,
      matchedCanonicalId: null,
      matchedRegistryEntryId: null,
      matchedPartId: null,
      candidates: [],
      suggestions: [],
      reason: "AMBIGUOUS_GEOMETRY_MATCH",
      geometryStatus: null,
    },
    dxfCandidates: [
      {
        partId: "A",
        fileName: "A.dxf",
        reason: "AMBIGUOUS_GEOMETRY_MATCH",
        score: 0.9,
        registryEntryId: "r1",
      },
    ],
    dxfSuggestions: [],
    dxfMatchDiagnostics: {
      sourceRawId: null,
      sourceCanonicalId: null,
      exactRegistryMatchCount: 0,
      exactRegistryEntryIds: [],
      finalStatus: "AMBIGUOUS",
      finalReason: "AMBIGUOUS_GEOMETRY_MATCH",
      matchedRegistryEntryId: null,
      suggestionCount: 0,
      suggestions: [],
      geometryStatus: null,
    },
    quantity: {
      proposedValue: 1,
      currentValue: 1,
      state: "VERIFIED",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    },
    material: {
      proposedValue: "X",
      currentValue: "X",
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
    issueIds: [],
    sourceOccurrenceIds: ["occ1"],
  } as unknown as ReviewPartRow;

  const session = {
    schemaVersion: "ai-intake-review/v1",
    sessionId: "s1",
    status: "REVIEW_REQUIRED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rows: [row],
    issues: [],
    actions: [],
    decisions: [],
    summary: {
      totalRows: 1,
      readyRows: 0,
      decisionRows: 1,
      excludedRows: 0,
      blockingIssueCount: 0,
      warningCount: 0,
      readyForApproval: false,
    },
  } as unknown as IntakeReviewSession;

  let rejected = false;
  try {
    applyReviewDecision(session, {
      kind: "ACTION",
      action: {
        actionId: "act1",
        issueId: "",
        type: "SELECT_DXF_MATCH",
        label: "bad",
        recommended: false,
        appliesToRowIds: ["row1"],
        payload: {
          rowId: "row1",
          partId: "OUTSIDER",
          fileName: "X.dxf",
          registryEntryId: "r999",
          decisionType: "SELECT_DXF_CANDIDATE",
        },
      },
    });
  } catch (e) {
    rejected = String(e).includes("SELECT_DXF_CANDIDATE_NOT_IN_AMBIGUITY_GROUP");
  }
  assert(rejected, "outsider rejected");
}

function testEncodeDecodeCandidates(): void {
  const cands = [
    geometryCandidateToCanonical(
      {
        registryEntryId: "r1",
        dxfPartId: "A",
        fileName: "A.dxf",
        eligible: true,
        score: 0.91,
        orientation: "W_H",
        dimensionComparison: { absoluteError1: 0, absoluteError2: 0 },
        areaRelativeError: null,
        massRelativeError: null,
        rejectionReasons: [],
      },
      1
    ),
  ];
  const note = `matchMethod:AMBIGUOUS_GEOMETRY|geometryCandidates:${JSON.stringify(
    cands.map((c) => ({
      id: c.registryEntryId,
      p: c.partId,
      f: c.fileName,
      s: c.score,
      e: 1,
      r: c.rank,
    }))
  )}`;
  const decoded = decodeGeometryCandidatesNote(note);
  assertEq(decoded.length, 1, "decoded");
  assertEq(decoded[0]!.partId, "A", "part");
}

function testEntityRegistry(): void {
  const entities = buildDebugEntityRegistry({
    reservations: [{ registryEntryId: "r1", state: "HELD_BY_AMBIGUITY" }],
    ambiguityGroups: [
      { ambiguityGroupId: "amb:1", candidates: [{ partId: "A" }] },
    ],
  });
  assert(entities.dxfReservations.r1, "res");
  assert(entities.ambiguityGroups["amb:1"], "amb");
}

function testReconcileSuppressesHeld(): void {
  const registry = [reg("r1", "HELD1", 50, 50), reg("r2", "FREE2", 60, 60)];
  const { rows } = reconcileFinalMapping({
    registry,
    acceptedFacts: [],
    unresolvedItems: [],
    documentRows: [],
    suppressOrphanRegistryEntryIds: new Set(["r1"]),
  });
  const ids = rows.map((r) => r.partId);
  assert(!ids.includes("HELD1"), "held not orphaned");
  assert(ids.includes("FREE2"), "free still present");
}

const tests: Array<[string, () => void]> = [
  ["T1 ambiguous propagation", test1_ambiguousPropagation],
  ["T6 candidate selection", test6_candidateSelection],
  ["T7 invalid candidate rejected", test7_invalidCandidateRejected],
  ["T10 held candidate", test10_heldCandidate],
  ["T11 no held orphan", test11_noHeldOrphan],
  ["T20 explicit length unit", test20_explicitLengthUnit],
  ["T21 explicit mass unit", test21_explicitMassUnit],
  ["T22 no explicit downgrade", test22_noExplicitDowngrade],
  ["T23 unit scoping", test23_unitScoping],
  ["T24 unit idempotence", test24_idempotence],
  ["T31 detached debug", test31_detachedDebug],
  ["T37 circular validation", test37_circularFailsValidation],
  ["T38 empty email", test38_emptyEmail],
  ["T39 whitespace email", test39_whitespaceEmail],
  ["T40 metadata-only", test40_metadataOnly],
  ["T41 meaningful email", test41_meaningfulEmail],
  ["T42 attachment dedup", test42_attachmentDedup],
  ["T43 provider taxonomy", test43_providerTaxonomy],
  ["T48 safe review required", test48_safeReviewRequired],
  ["T49 unsafe lost candidates", test49_unsafeLostCandidates],
  ["encode/decode candidates", testEncodeDecodeCandidates],
  ["entity registry", testEntityRegistry],
  ["reconcile suppresses held", testReconcileSuppressesHeld],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e);
  }
}
if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} tests passed.`);
