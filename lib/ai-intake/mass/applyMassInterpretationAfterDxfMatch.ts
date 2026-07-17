/**
 * Canonical post-DXF mass interpretation integration.
 *
 * Pipeline order (authoritative for source-mass resolution):
 * 1. workbook snapshot / mapping / reconstruct
 * 2. unit normalization (Pass A–C; early Pass D is provisional only)
 * 3. DXF registry (full geometry: plateAreaMm2 + netContourAreaMm2)
 * 4. exact DXF matching + geometry attachment
 * 5. reconcile commercial fields
 * 6. THIS STAGE — table-level mass interpretation (once per table)
 * 7. Review issue generation + debug serialization
 *
 * Do not resolve absolute mass units before matched DXF geometry is available.
 */

import type { DxfPartRegistryItem } from "../types";
import type { AiIntakeAnalyzeSuccess } from "../schemas";
import {
  buildMassInterpretationDebugReport,
  resolveMassInterpretation,
} from "./resolveMassInterpretation";
import { getMaterialDensity, describeMaterialDensity } from "./materialDensityRegistry";
import { normalizeMassRawToKg } from "./validateMassInterpretation";
import {
  applyMassInterpretationToOptionalMass,
  buildCommercialMassInput,
  buildSourceMassEvidence,
} from "./applySourceMassToReviewEvidence";
import type {
  MassAreaEvidence,
  MassColumnInterpretation,
  MassInterpretationDebugReport,
  MassRowInput,
  MassUnit,
  SourceMassBasis,
  ThresholdEvaluation,
  UnitScoreAggregate,
} from "./types";
import type {
  ReviewOptionalMeasurement,
  ReviewPartRow,
} from "../review/types";

export type MassTableIdentity = {
  documentId: string;
  sheetName: string | null;
  tableId: string;
  fileName: string | null;
};

export type MassTableGroupingDiagnostics = {
  documentId: string;
  sheetName: string | null;
  tableId: string;
  sourceOccurrenceCount: number;
  massComparableOccurrenceCount: number;
};

export type TableMassInterpretationRecord = {
  documentId: string;
  sheetName: string | null;
  tableId: string;
  fileName: string | null;
  rowCount: number;
  comparableRowCount: number;
  grouping: MassTableGroupingDiagnostics;
  interpretation: MassColumnInterpretation;
  debug: MassInterpretationDebugReport;
  unitScores: UnitScoreAggregate[];
  thresholdEvaluation: ThresholdEvaluation | null;
  dxfGeometryReady: boolean;
  resolverInvocationCount: number;
};

export type ApplyMassInterpretationResult = {
  /** Exactly one record per table that has mass columns. */
  massInterpretations: TableMassInterpretationRecord[];
  /** Map occurrenceId → table interpretation (shared reference). */
  byOccurrenceId: Map<string, MassColumnInterpretation>;
  /** Total resolveMassInterpretation calls (must equal table count with mass). */
  resolverCallCount: number;
};

function tableKey(id: MassTableIdentity): string {
  return [
    id.documentId,
    id.sheetName ?? "",
    id.tableId,
    id.fileName ?? "",
  ].join("::");
}

/**
 * Stable table identity. Prefer workbook tableId when present;
 * otherwise one group per document+sheet (+fileName).
 */
export function resolveMassTableIdentity(args: {
  documentId: string | null | undefined;
  sheetName: string | null | undefined;
  tableId?: string | null;
  fileName?: string | null;
}): MassTableIdentity {
  return {
    documentId: args.documentId?.trim() || "unknown-document",
    sheetName: args.sheetName ?? null,
    tableId: args.tableId?.trim() || "sheet-default",
    fileName: args.fileName ?? null,
  };
}

function asMassUnit(u: string | null | undefined): MassUnit | null {
  if (u === "G" || u === "KG" || u === "TON") return u;
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Build area bases from Review-ready evidence.
 * Prefer exact DXF fields; never fabricate net from width×height when plate exists.
 */
export function collectReviewAreaBases(args: {
  documentAreaMm2: number | null;
  documentAreaResolved: boolean;
  plateAreaMm2: number | null;
  netContourAreaMm2: number | null;
  dxfMatchStatus: string | null;
}): MassAreaEvidence[] {
  const bases: MassAreaEvidence[] = [];
  if (
    args.documentAreaResolved &&
    args.documentAreaMm2 != null &&
    args.documentAreaMm2 > 0
  ) {
    bases.push({
      basis: "DOCUMENT_AREA",
      areaMm2: args.documentAreaMm2,
      provenance: "review.documentEvidence.area",
      confidence: 0.85,
    });
  }
  if (
    args.dxfMatchStatus === "MATCHED" &&
    args.plateAreaMm2 != null &&
    args.plateAreaMm2 > 0
  ) {
    bases.push({
      basis: "DXF_BBOX_AREA",
      areaMm2: args.plateAreaMm2,
      provenance: "review.dxfGeometry.plateAreaMm2",
      confidence: 0.9,
    });
  }
  if (
    args.dxfMatchStatus === "MATCHED" &&
    args.netContourAreaMm2 != null &&
    args.netContourAreaMm2 > 0
  ) {
    bases.push({
      basis: "DXF_NET_CONTOUR_AREA",
      areaMm2: args.netContourAreaMm2,
      provenance: "review.dxfGeometry.netContourAreaMm2",
      confidence: 0.9,
    });
  }
  return bases.sort((a, b) => a.basis.localeCompare(b.basis));
}

export function reviewRowToMassInput(row: ReviewPartRow): MassRowInput {
  const area = row.documentEvidence.area;
  const uw = row.documentEvidence.unitWeight;
  const tw = row.documentEvidence.totalWeight;
  const documentAreaMm2 =
    area?.normalizedUnit === "MM2" ? num(area.normalizedValue) : null;
  const documentAreaResolved =
    area?.status === "RESOLVED" && documentAreaMm2 != null && documentAreaMm2 > 0;

  return {
    occurrenceId: row.sourceOccurrenceIds[0] ?? row.rowId,
    partReference: row.displayPartReference ?? row.matchedDxfPartId,
    quantity: num(row.quantity.currentValue ?? row.quantity.proposedValue),
    thicknessMm: num(
      row.thicknessMm.currentValue ?? row.thicknessMm.proposedValue
    ),
    material: row.material.currentValue ?? row.material.proposedValue,
    unitWeightRaw: num(uw?.rawValue),
    unitWeightDisplayedDecimals: null,
    unitWeightHeader: null,
    unitWeightExplicitUnit: asMassUnit(
      uw?.massResolutionStatus?.includes("EXPLICIT")
        ? uw.normalizedUnit
        : null
    ),
    totalWeightRaw: num(tw?.rawValue),
    totalWeightDisplayedDecimals: null,
    totalWeightHeader: null,
    totalWeightExplicitUnit: null,
    areaBases: collectReviewAreaBases({
      documentAreaMm2,
      documentAreaResolved,
      plateAreaMm2: row.dxfGeometry?.plateAreaMm2 ?? null,
      netContourAreaMm2: row.dxfGeometry?.netContourAreaMm2 ?? null,
      dxfMatchStatus: row.dxfMatchStatus,
    }),
  };
}

/**
 * Assert DXF geometry is available before physical mass resolution.
 * Development/test helper — returns reason when evidence incomplete.
 */
export function assertMassInterpretationGeometryReady(args: {
  rows: ReviewPartRow[];
  requireMatchedGeometry?: boolean;
}): { ok: boolean; reason: string | null } {
  const withMass = args.rows.filter(
    (r) =>
      r.documentEvidence.unitWeight?.rawValue != null ||
      r.documentEvidence.totalWeight?.rawValue != null
  );
  if (withMass.length === 0) {
    return { ok: true, reason: null };
  }
  if (!args.requireMatchedGeometry) {
    return { ok: true, reason: null };
  }
  const matched = withMass.filter((r) => r.dxfMatchStatus === "MATCHED");
  if (matched.length === 0) {
    return {
      ok: false,
      reason: "PHYSICAL_EVIDENCE_UNAVAILABLE: no MATCHED DXF rows for mass columns",
    };
  }
  const missingPlate = matched.filter(
    (r) => r.dxfGeometry?.plateAreaMm2 == null
  );
  if (missingPlate.length === matched.length) {
    return {
      ok: false,
      reason: "PHYSICAL_EVIDENCE_UNAVAILABLE: MATCHED rows lack plateAreaMm2",
    };
  }
  return { ok: true, reason: null };
}

function lookupTableIdFromWorkbookEvidence(
  result: AiIntakeAnalyzeSuccess | null | undefined,
  occurrenceId: string
): string | null {
  const docs = result?.aggregated?.documents ?? [];
  for (const doc of docs) {
    const rawRows = doc.workbookEvidence?.rawPartRows;
    if (!Array.isArray(rawRows)) continue;
    for (const rr of rawRows) {
      if (!rr || typeof rr !== "object") continue;
      const rec = rr as {
        occurrenceId?: string;
        source?: { tableId?: string | null };
        raw?: { source?: { tableId?: string | null } };
      };
      if (rec.occurrenceId === occurrenceId) {
        return (
          rec.source?.tableId ??
          rec.raw?.source?.tableId ??
          null
        );
      }
    }
  }
  return null;
}

function sourceMetaForRow(
  row: ReviewPartRow,
  result: AiIntakeAnalyzeSuccess | null | undefined
): MassTableIdentity {
  const occId = row.sourceOccurrenceIds[0] ?? row.rowId;
  const refs = [
    ...(row.documentEvidence.unitWeight?.sourceRefs ?? []),
    ...(row.quantity.sourceRefs ?? []),
  ];
  const ref = refs[0];
  const documentId =
    result?.aggregated?.documents?.find(
      (d) => d.fileName === ref?.fileName
    )?.documentId ??
    result?.aggregated?.documents?.[0]?.documentId ??
    "review-document";
  const tableId = lookupTableIdFromWorkbookEvidence(result, occId);
  return resolveMassTableIdentity({
    documentId,
    sheetName: ref?.sheetName ?? null,
    tableId,
    fileName: ref?.fileName ?? null,
  });
}

/**
 * Enrich Review rows with table-level mass interpretation after DXF geometry
 * is attached. Calls resolveMassInterpretation once per table.
 */
export function enrichReviewRowsWithMassInterpretation(args: {
  rows: ReviewPartRow[];
  registry: DxfPartRegistryItem[];
  analyzeResult?: AiIntakeAnalyzeSuccess | null;
  /** When true, skip physical resolution if geometry not ready. */
  requireDxfGeometry?: boolean;
}): ApplyMassInterpretationResult {
  void args.registry; // geometry already on rows; registry kept for contract clarity
  const requireGeo = args.requireDxfGeometry !== false;
  const byTable = new Map<
    string,
    { identity: MassTableIdentity; rows: ReviewPartRow[] }
  >();

  for (const row of args.rows) {
    if (row.replacedByRowId) continue;
    const hasMass =
      row.documentEvidence.unitWeight?.rawValue != null ||
      row.documentEvidence.totalWeight?.rawValue != null ||
      row.documentEvidence.unitWeight?.status === "AMBIGUOUS" ||
      row.documentEvidence.totalWeight?.status === "AMBIGUOUS";
    if (!hasMass) continue;
    const identity = sourceMetaForRow(row, args.analyzeResult);
    const key = tableKey(identity);
    const bucket = byTable.get(key) ?? { identity, rows: [] };
    bucket.rows.push(row);
    byTable.set(key, bucket);
  }

  const massInterpretations: TableMassInterpretationRecord[] = [];
  const byOccurrenceId = new Map<string, MassColumnInterpretation>();
  let resolverCallCount = 0;

  for (const { identity, rows } of [...byTable.values()].sort((a, b) =>
    tableKey(a.identity).localeCompare(tableKey(b.identity))
  )) {
    const geoCheck = assertMassInterpretationGeometryReady({
      rows,
      requireMatchedGeometry: requireGeo,
    });

    const massInputs = rows.map(reviewRowToMassInput);
    const comparable = massInputs.filter(
      (r) =>
        r.areaBases.length > 0 &&
        r.thicknessMm != null &&
        getMaterialDensity(r.material) != null &&
        (r.unitWeightRaw != null || r.totalWeightRaw != null)
    ).length;

    resolverCallCount += 1;
    const interpretation = resolveMassInterpretation({
      documentId: identity.documentId,
      sheetName: identity.sheetName,
      tableId: identity.tableId,
      unitWeightColumn: "unitWeight",
      totalWeightColumn: "totalWeight",
      rows: massInputs,
      geometryReady: geoCheck.ok,
      geometryNotReadyReason: geoCheck.ok ? null : geoCheck.reason,
    });
    const debug = buildMassInterpretationDebugReport(interpretation, massInputs);

    const record: TableMassInterpretationRecord = {
      documentId: identity.documentId,
      sheetName: identity.sheetName,
      tableId: identity.tableId,
      fileName: identity.fileName,
      rowCount: rows.length,
      comparableRowCount: comparable,
      grouping: {
        documentId: identity.documentId,
        sheetName: identity.sheetName,
        tableId: identity.tableId,
        sourceOccurrenceCount: rows.length,
        massComparableOccurrenceCount: comparable,
      },
      interpretation,
      debug,
      unitScores: interpretation.unitScores ?? [],
      thresholdEvaluation: interpretation.thresholdEvaluation ?? null,
      dxfGeometryReady: geoCheck.ok,
      resolverInvocationCount: 1,
    };
    massInterpretations.push(record);

    for (const row of rows) {
      for (const occId of row.sourceOccurrenceIds) {
        byOccurrenceId.set(occId, interpretation);
      }
      applyTableInterpretationToReviewRow(row, interpretation);
    }
  }

  return { massInterpretations, byOccurrenceId, resolverCallCount };
}

export function applyTableInterpretationToReviewRow(
  row: ReviewPartRow,
  interpretation: MassColumnInterpretation
): void {
  const uw = applyMassInterpretationToOptionalMass(
    row.documentEvidence.unitWeight ?? {
      rawValue: null,
      normalizedValue: null,
      normalizedUnit: null,
      status: "MISSING",
      sourceRefs: [],
    },
    { interpretation, role: "unitWeight" }
  ) as ReviewOptionalMeasurement;
  const tw = applyMassInterpretationToOptionalMass(
    row.documentEvidence.totalWeight ?? {
      rawValue: null,
      normalizedValue: null,
      normalizedUnit: null,
      status: "MISSING",
      sourceRefs: [],
    },
    { interpretation, role: "totalWeight" }
  ) as ReviewOptionalMeasurement;

  row.documentEvidence = {
    ...row.documentEvidence,
    unitWeight: uw,
    totalWeight: tw,
  };
  row.documentComparison = {
    ...row.documentComparison,
    unitWeightKg: uw.status === "RESOLVED" ? uw.normalizedValue : null,
    totalWeightKg: tw.status === "RESOLVED" ? tw.normalizedValue : null,
  };
  row.sourceMassEvidence = buildSourceMassEvidence({
    interpretation,
    unitWeightRaw: uw.rawValue,
    totalWeightRaw: tw.rawValue,
  });

  // Commercial basis must remain bbox policy.
  const commercial = buildCommercialMassInput({
    plateAreaMm2: row.dxfGeometry?.plateAreaMm2 ?? null,
    thicknessMm: row.thicknessMm.currentValue ?? row.thicknessMm.proposedValue,
    material: row.material.currentValue ?? row.material.proposedValue,
  });
  if (
    row.sourceMassEvidence?.basis != null &&
    commercial.areaBasis !== "DXF_BBOX_AREA"
  ) {
    throw new Error("Commercial mass basis mutated by source interpretation");
  }
  row.commercialMassInput = commercial;
}

/** Serialize table records for debug (always include ambiguous outcomes). */
export function serializeMassInterpretationsForDebug(
  records: TableMassInterpretationRecord[]
): unknown[] {
  return records.map((r) => ({
    documentId: r.documentId,
    sheetName: r.sheetName,
    tableId: r.tableId,
    fileName: r.fileName,
    rowCount: r.rowCount,
    comparableRowCount: r.comparableRowCount,
    grouping: r.grouping,
    dxfGeometryReady: r.dxfGeometryReady,
    resolverInvocationCount: r.resolverInvocationCount,
    columnProfile: {
      unitWeightColumn: r.interpretation.unitWeightColumn,
      totalWeightColumn: r.interpretation.totalWeightColumn,
      semanticRelationship: r.interpretation.semanticRelationship.status,
      relationshipSupportRatio: r.interpretation.semanticRelationship.supportRatio,
    },
    densityCoverage: {
      supportedRowCount: r.debug.densityCoverage.supportedRows,
      unsupportedRowCount: r.debug.densityCoverage.unsupportedRows,
      coverageRatio:
        r.rowCount > 0
          ? r.debug.densityCoverage.supportedRows / r.rowCount
          : 0,
      unsupportedMaterials: r.debug.unsupportedMaterials ?? [],
      densityDiagnostics: r.debug.densityDiagnostics ?? [],
    },
    candidates: r.interpretation.candidates.map((c) => ({
      massUnit: c.massUnit,
      sourceBasis: c.sourceBasis,
      aggregation: c.aggregation,
      comparableRowCount: c.comparableRowCount,
      matchingRowCount: c.matchingRowCount,
      supportRatio: c.supportRatio,
      coverageRatio: c.coverageRatio,
      medianRelativeError: c.medianRelativeError,
      trimmedMeanRelativeError: c.meanRelativeError,
      maxRelativeError: c.maxRelativeError,
      contradictionCount: c.contradictionCount,
      score: c.score,
    })),
    unitScores: r.unitScores,
    winningCandidate: r.interpretation.winningCandidate
      ? {
          massUnit: r.interpretation.winningCandidate.massUnit,
          sourceBasis: r.interpretation.winningCandidate.sourceBasis,
          score: r.interpretation.winningCandidate.score,
          supportRatio: r.interpretation.winningCandidate.supportRatio,
          comparableRowCount:
            r.interpretation.winningCandidate.comparableRowCount,
        }
      : null,
    runnerUpCandidate: r.interpretation.runnerUpCandidate
      ? {
          massUnit: r.interpretation.runnerUpCandidate.massUnit,
          sourceBasis: r.interpretation.runnerUpCandidate.sourceBasis,
          score: r.interpretation.runnerUpCandidate.score,
          supportRatio: r.interpretation.runnerUpCandidate.supportRatio,
          comparableRowCount:
            r.interpretation.runnerUpCandidate.comparableRowCount,
        }
      : null,
    resolvedUnit: r.interpretation.resolvedUnit,
    resolvedSourceBasis: r.interpretation.resolvedSourceBasis,
    status: r.interpretation.status,
    confidence: r.interpretation.confidence,
    reason: r.interpretation.reason,
    thresholdEvaluation: r.thresholdEvaluation,
    rowEvaluations: enrichRowEvaluationsForDebug(r),
  }));
}

function enrichRowEvaluationsForDebug(
  record: TableMassInterpretationRecord
): unknown[] {
  const unit = record.interpretation.resolvedUnit ?? "KG";
  const basis =
    record.interpretation.resolvedSourceBasis ??
    record.interpretation.winningCandidate?.sourceBasis ??
    null;
  return record.debug.rowEvaluations.map((ev) => {
    const dens = describeMaterialDensity(ev.material);
    const observedUnitKg =
      ev.aggregation === "PER_ITEM"
        ? ev.convertedObservedKg
        : normalizeMassRawToKg(
            // total path — leave as converted when present
            ev.rawObservedMass,
            (ev.massUnit as MassUnit) ?? unit
          );
    return {
      sourceOccurrenceId: ev.occurrenceId,
      partReference: ev.partReference,
      quantity: ev.quantity,
      thicknessMm: ev.thicknessMm,
      rawMaterial: ev.material,
      normalizedMaterial: dens.normalizedMaterial,
      densityFound: dens.densityFound,
      densityKgPerM3: dens.densityKgPerM3,
      densitySource: dens.densitySource,
      densityReason: dens.reason,
      rawUnitWeight:
        ev.aggregation === "PER_ITEM" ? ev.rawObservedMass : null,
      rawTotalWeight:
        ev.aggregation === "TOTAL" ? ev.rawObservedMass : null,
      sourceBasis: ev.sourceBasis,
      sourceAreaMm2: ev.areaMm2,
      observedUnitWeightKg:
        ev.aggregation === "PER_ITEM" ? observedUnitKg : null,
      observedTotalWeightKg:
        ev.aggregation === "TOTAL" ? observedUnitKg : null,
      expectedUnitWeightKg:
        ev.aggregation === "PER_ITEM" ? ev.expectedKg : null,
      expectedTotalWeightKg:
        ev.aggregation === "TOTAL" ? ev.expectedKg : null,
      unitWeightComparison:
        ev.aggregation === "PER_ITEM" ? ev.comparisonStatus : null,
      totalWeightComparison:
        ev.aggregation === "TOTAL" ? ev.comparisonStatus : null,
      comparable: ev.comparisonStatus !== "NOT_COMPARABLE",
      reason: ev.reason,
      winningBasisHint: basis,
    };
  });
}

export type { SourceMassBasis };
