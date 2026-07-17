import type { DxfPartRegistryItem } from "../types";
import {
  diagnosticsFromMatchResult,
  matchPartToDxf,
  toDxfMatchRegistryEntries,
} from "../matching";
import type { DxfIdentityMatchResult } from "../matching/types";
import { buildRequestOccurrences } from "../requestOccurrences";
import { formatDocumentSourceLabel } from "../visibleRowNumber";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
  FieldCandidate,
  FieldResolutionStatus,
  RequestPartOccurrence,
} from "../schemas";
import { buildIssuesForRows } from "./buildReviewIssues";
import { buildSafeDocumentEvidence } from "./safeOptionalMeasurements";
import {
  enrichReviewRowsWithMassInterpretation,
  serializeMassInterpretationsForDebug,
} from "../mass/applyMassInterpretationAfterDxfMatch";
import { buildCommercialMassInput } from "../mass/applySourceMassToReviewEvidence";
import {
  buildReviewSummary,
  computeRowStatus,
} from "./validateReviewSession";
import type {
  IntakeReviewSession,
  ReviewDxfCandidate,
  ReviewDxfMatchDiagnostics,
  ReviewDxfSuggestion,
  ReviewField,
  ReviewFieldState,
  ReviewPartRow,
  ReviewSourceReference,
  ReviewSourceType,
} from "./types";
import { INTAKE_REVIEW_SCHEMA_VERSION } from "./types";

export type BuildReviewSessionOptions = {
  createdAt?: string;
  sessionId?: string;
  analysisRunId?: string | null;
  registry?: DxfPartRegistryItem[];
};

function mapSourceType(
  t: string | null | undefined
): ReviewSourceType {
  if (t === "EMAIL") return "EMAIL";
  if (t === "PDF") return "PDF";
  if (t === "DXF") return "DXF";
  if (t === "XLS" || t === "XLSX") return t;
  if (t === "USER") return "USER";
  // Spreadsheet sources in this lab are labeled XLSX even for legacy XLS
  return "XLSX";
}

function fieldStateFromResolution(
  status: FieldResolutionStatus,
  value: string | number | null,
  opts?: { ambiguous?: boolean }
): ReviewFieldState {
  if (opts?.ambiguous) return "AMBIGUOUS";
  if (status === "MISSING" || value == null) return "MISSING";
  if (status === "CONFLICT") return "CONFLICT";
  if (status === "USER_RESOLUTION") return "USER_RESOLVED";
  if (
    status === "OVERRIDE" ||
    status === "EMAIL_AUTHORITATIVE" ||
    status === "EMAIL_EXPLICIT_SUPERSESSION"
  ) {
    return "VERIFIED";
  }
  if (status === "CONSENSUS" || status === "SINGLE_SOURCE") return "VERIFIED";
  return "INFERRED";
}

function toReviewField<T extends string | number>(args: {
  value: T | null;
  resolutionStatus: FieldResolutionStatus;
  candidates: FieldCandidate<T>[];
  ambiguous?: boolean;
  sourceRefs?: ReviewSourceReference[];
}): ReviewField<T> {
  const state = fieldStateFromResolution(
    args.resolutionStatus,
    args.value,
    { ambiguous: args.ambiguous }
  );
  const safeValue =
    state === "AMBIGUOUS" || state === "CONFLICT" || state === "MISSING"
      ? null
      : args.value;

  return {
    proposedValue: args.value,
    currentValue: safeValue,
    state,
    confidence: null,
    candidates: args.candidates.map((c) => ({
      value: c.value,
      sourceLabel: c.sourceLabel,
      sourceType: c.sourceType,
      confidence: null,
      reason: c.instructionType ?? null,
    })),
    sourceRefs: args.sourceRefs ?? [],
    editedByUser: false,
  };
}

function findDocumentRowForOcc(
  result: AiIntakeAnalyzeSuccess,
  occ: RequestPartOccurrence
): ExtractedDocumentRow | null {
  const rows = result.extraction?.documentRows ?? [];
  return (
    rows.find(
      (r) =>
        r.source.rowNumber === occ.source.rowNumber &&
        r.source.fileName === occ.source.fileName &&
        (r.matchedDxfPartId === occ.matchedDxfPartId ||
          r.rawPartReference === occ.rawPartReference)
    ) ??
    rows.find(
      (r) =>
        r.matchedDxfPartId === occ.matchedDxfPartId &&
        r.source.rowNumber === occ.source.rowNumber
    ) ??
    null
  );
}

function occurrenceSourceLabel(
  occ: RequestPartOccurrence,
  cell?: string | null
): string {
  const type =
    occ.source.type === "EMAIL"
      ? "EMAIL"
      : occ.source.type === "PDF"
        ? "PDF"
        : "XLSX";
  return formatDocumentSourceLabel({
    type,
    fileName: occ.source.fileName,
    sheetName: occ.source.sheetName,
    rowNumber: occ.source.rowNumber,
    cellReferences: cell ? [cell] : undefined,
    pageNumber: occ.source.pageNumber,
  });
}

function occurrenceFieldCandidates<T extends string | number>(args: {
  occ: RequestPartOccurrence;
  value: T | null;
  cell?: string | null;
}): FieldCandidate<T>[] {
  if (args.value == null) return [];
  if (typeof args.value === "string" && !args.value.trim()) return [];
  return [
    {
      value: args.value,
      sourceType:
        args.occ.source.type === "EMAIL"
          ? "EMAIL"
          : args.occ.source.type === "PDF"
            ? "PDF"
            : "XLSX",
      sourceLabel: occurrenceSourceLabel(args.occ, args.cell),
    },
  ];
}

function fieldSourceRefs(args: {
  occ: RequestPartOccurrence;
  cell?: string | null;
  originalValue: unknown;
}): ReviewSourceReference[] {
  return [
    {
      sourceType: mapSourceType(args.occ.source.type),
      fileName: args.occ.source.fileName,
      sheetName: args.occ.source.sheetName,
      rowNumber: args.occ.source.rowNumber,
      pageNumber: args.occ.source.pageNumber,
      cellReferences: args.cell ? [args.cell] : [],
      excerpt: args.occ.source.excerpt,
      originalValue: args.originalValue,
    },
  ];
}

function findFinalRow(
  finalRows: FinalIntakeMappingRow[],
  occ: RequestPartOccurrence
): FinalIntakeMappingRow | null {
  const partId = occ.matchedDxfPartId;
  if (partId) {
    const byId = finalRows.find((r) => r.partId === partId);
    if (byId) return byId;
  }
  if (occ.rawPartReference) {
    return (
      finalRows.find(
        (r) =>
          r.partId === occ.rawPartReference ||
          r.requestOccurrences.some(
            (o) => o.rawPartReference === occ.rawPartReference
          )
      ) ?? null
    );
  }
  return null;
}

function resolveDxfIdentityMatch(args: {
  occ: RequestPartOccurrence;
  registry: DxfPartRegistryItem[];
}): DxfIdentityMatchResult {
  const sourceRawId =
    args.occ.rawPartReference ?? args.occ.matchedDxfPartId ?? null;
  return matchPartToDxf({
    sourceRawId,
    registry: toDxfMatchRegistryEntries(args.registry),
  });
}

function deriveReviewMatchFields(match: DxfIdentityMatchResult): {
  matchedDxfPartId: string | null;
  dxfMatchStatus: ReviewPartRow["dxfMatchStatus"];
  dxfCandidates: ReviewDxfCandidate[];
  dxfSuggestions: ReviewDxfSuggestion[];
  dxfMatchDiagnostics: ReviewDxfMatchDiagnostics;
} {
  const diagnostics = diagnosticsFromMatchResult(match);
  const dxfMatchDiagnostics: ReviewDxfMatchDiagnostics = {
    sourceRawId: diagnostics.sourceRawId,
    sourceCanonicalId: diagnostics.sourceCanonicalId,
    exactRegistryMatchCount: diagnostics.exactRegistryMatchCount,
    exactRegistryEntryIds: diagnostics.exactRegistryEntryIds,
    finalStatus: diagnostics.finalStatus,
    finalReason: diagnostics.finalReason,
    matchedRegistryEntryId: diagnostics.matchedRegistryEntryId,
    suggestionCount: diagnostics.suggestionCount,
    suggestions: diagnostics.suggestions.map((s) => ({
      partId: s.partId,
      fileName: s.fileName,
      reason: s.reason,
      score: s.score,
      registryEntryId: s.registryEntryId,
    })),
    geometryStatus: diagnostics.geometryStatus,
  };

  if (match.status === "MATCHED") {
    return {
      matchedDxfPartId: match.matchedPartId,
      dxfMatchStatus: "MATCHED",
      dxfCandidates: match.candidates.map((c) => ({
        partId: c.partId,
        fileName: c.fileName,
        reason: match.reason,
        score: 1,
        registryEntryId: c.registryEntryId,
      })),
      dxfSuggestions: [],
      dxfMatchDiagnostics,
    };
  }

  if (match.status === "AMBIGUOUS") {
    return {
      matchedDxfPartId: null,
      dxfMatchStatus: "AMBIGUOUS",
      dxfCandidates: match.candidates.map((c) => ({
        partId: c.partId,
        fileName: c.fileName,
        reason: "CANONICAL_ID_COLLISION",
        score: 1,
        registryEntryId: c.registryEntryId,
      })),
      dxfSuggestions: [],
      dxfMatchDiagnostics,
    };
  }

  // UNMATCHED | INVALID_SOURCE_ID
  return {
    matchedDxfPartId: null,
    dxfMatchStatus: "UNMATCHED",
    dxfCandidates: [],
    dxfSuggestions: match.suggestions.map((s) => ({
      partId: s.partId,
      fileName: s.fileName,
      reason: s.reason,
      score: s.score,
      registryEntryId: s.registryEntryId,
    })),
    dxfMatchDiagnostics,
  };
}

function attachMatchedGeometry(args: {
  match: DxfIdentityMatchResult;
  registry: DxfPartRegistryItem[];
}): ReviewPartRow["dxfGeometry"] {
  if (args.match.status !== "MATCHED") return null;
  const entry =
    args.registry.find((r) => r.id === args.match.matchedRegistryEntryId) ??
    args.registry.find(
      (r) => r.canonicalPartId === args.match.matchedPartId
    ) ??
    null;
  if (!entry) return null;
  if (entry.geometryStatus !== "VALID" && entry.geometryStatus !== "WARNING") {
    return null;
  }
  if (entry.widthMm == null || entry.heightMm == null) return null;
  return {
    widthMm: entry.widthMm,
    heightMm: entry.heightMm,
    plateAreaMm2: entry.plateAreaMm2,
    netContourAreaMm2: entry.netContourAreaMm2,
  };
}

function buildRowFromOccurrence(args: {
  occ: RequestPartOccurrence;
  final: FinalIntakeMappingRow | null;
  displayOrder: number;
  registry: DxfPartRegistryItem[];
  engineIssues: string[];
  result: AiIntakeAnalyzeSuccess;
}): ReviewPartRow {
  const { occ, final, displayOrder, registry, result } = args;
  const dxfMatch = resolveDxfIdentityMatch({ occ, registry });
  const derived = deriveReviewMatchFields(dxfMatch);
  const partId = derived.matchedDxfPartId;

  const qtyFromOcc = occ.quantity;
  const thkFromOcc = occ.thicknessMm;
  const matFromOcc = occ.material;

  const docRow = findDocumentRowForOcc(result, occ);

  // Prefer occurrence commercial values; fall back to final reconciled
  const qtyValue =
    qtyFromOcc ??
    (typeof final?.quantity === "number" ? final.quantity : null);
  const thkValue =
    thkFromOcc ??
    (typeof final?.thicknessMm === "number" ? final.thicknessMm : null);
  const matValue =
    matFromOcc ??
    (typeof final?.material === "string" ? final.material : null);

  const qtyRes = final?.fieldResolutions.quantity;
  const thkRes = final?.fieldResolutions.thickness;
  const matRes = final?.fieldResolutions.material;

  const unitAmbiguous = args.engineIssues.some(
    (c) =>
      c.includes("UNIT_AMBIGUOUS") ||
      c === "DOCUMENT_THICKNESS_UNIT_AMBIGUOUS" ||
      c === "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS" ||
      c === "DOCUMENT_MASS_UNIT_AMBIGUOUS"
  );

  const thicknessAmbiguous =
    unitAmbiguous &&
    thkValue == null &&
    (thkRes?.resolutionStatus === "MISSING" || thkFromOcc == null);

  // Candidates: occurrence-local when this occurrence has a value.
  // When missing, fall back to reconciled suggestions (email/other) without
  // copying another duplicate occurrence's provenance.
  const quantity: ReviewField<number> = toReviewField({
    value: qtyValue,
    resolutionStatus:
      qtyValue == null
        ? "MISSING"
        : final?.issues.includes("QUANTITY_CONFLICT")
          ? "CONFLICT"
          : (qtyRes?.resolutionStatus ?? "SINGLE_SOURCE"),
    candidates:
      qtyFromOcc != null
        ? occurrenceFieldCandidates({
            occ,
            value: qtyFromOcc,
            cell: docRow?.source.quantityCell,
          })
        : (qtyRes?.candidates ?? []).length
          ? qtyRes!.candidates
          : occurrenceFieldCandidates({
              occ,
              value: qtyValue,
              cell: docRow?.source.quantityCell,
            }),
    sourceRefs: fieldSourceRefs({
      occ,
      cell: docRow?.source.quantityCell,
      originalValue: qtyFromOcc ?? qtyValue,
    }),
  });

  const thicknessMm: ReviewField<number> = toReviewField({
    value: thkValue,
    resolutionStatus:
      thkValue == null
        ? "MISSING"
        : final?.issues.includes("THICKNESS_CONFLICT")
          ? "CONFLICT"
          : (thkRes?.resolutionStatus ?? "SINGLE_SOURCE"),
    candidates:
      thkFromOcc != null
        ? occurrenceFieldCandidates({
            occ,
            value: thkFromOcc,
            cell: docRow?.source.thicknessCell,
          })
        : (thkRes?.candidates ?? []).length
          ? thkRes!.candidates
          : occurrenceFieldCandidates({
              occ,
              value: thkValue,
              cell: docRow?.source.thicknessCell,
            }),
    ambiguous: thicknessAmbiguous,
    sourceRefs: fieldSourceRefs({
      occ,
      cell: docRow?.source.thicknessCell,
      originalValue: thkFromOcc ?? thkValue,
    }),
  });

  const material: ReviewField<string> = toReviewField({
    value: matValue,
    resolutionStatus:
      matValue == null || !String(matValue).trim()
        ? "MISSING"
        : final?.issues.includes("MATERIAL_CONFLICT")
          ? "CONFLICT"
          : (matRes?.resolutionStatus ?? "SINGLE_SOURCE"),
    candidates:
      matFromOcc != null && String(matFromOcc).trim()
        ? occurrenceFieldCandidates({
            occ,
            value: matFromOcc,
            cell: docRow?.source.materialCell,
          })
        : (matRes?.candidates ?? []).length
          ? matRes!.candidates
          : occurrenceFieldCandidates({
              occ,
              value: matValue,
              cell: docRow?.source.materialCell,
            }),
    sourceRefs: fieldSourceRefs({
      occ,
      cell: docRow?.source.materialCell,
      originalValue: matFromOcc ?? matValue,
    }),
  });

  const includeInQuote = final?.status !== "EXCLUDED" && occ.action !== "EXCLUDE";

  // Provisional document evidence only — table-level mass interpretation runs
  // after all rows have matched DXF geometry (enrichReviewRowsWithMassInterpretation).
  const { documentEvidence: baseEvidence, documentComparison: baseComparison } =
    buildSafeDocumentEvidence({
      result,
      occ,
      final,
    });

  const matchedGeo = attachMatchedGeometry({ match: dxfMatch, registry });
  const commercialMassInput = buildCommercialMassInput({
    plateAreaMm2: matchedGeo?.plateAreaMm2 ?? null,
    thicknessMm: thkValue,
    material: matValue,
  });

  const row: ReviewPartRow = {
    rowId: `rev:${occ.occurrenceId}`,
    sourceOccurrenceIds: [occ.occurrenceId],
    displayOrder,
    status: "NEEDS_DECISION",
    includeInQuote,
    replacedByRowId: null,
    rawPartReferences: occ.rawPartReference ? [occ.rawPartReference] : [],
    displayPartReference:
      occ.rawPartReference ?? partId ?? final?.partId ?? null,
    dxfMatch,
    dxfMatchDiagnostics: derived.dxfMatchDiagnostics,
    matchedDxfPartId: partId,
    dxfMatchStatus: derived.dxfMatchStatus,
    dxfCandidates: derived.dxfCandidates,
    dxfSuggestions: derived.dxfSuggestions,
    quantity,
    thicknessMm,
    material,
    dxfGeometry: matchedGeo,
    documentComparison: baseComparison,
    documentEvidence: baseEvidence,
    sourceMassEvidence: {
      unitWeightKg: null,
      totalWeightKg: null,
      basis: null,
      unit: null,
      status: "MISSING",
    },
    commercialMassInput,
    dxfGeometryAcknowledged: false,
    issueIds: [],
  };

  row.status = computeRowStatus(row);
  return row;
}

/**
 * Build an immutable review session from the analysis success payload.
 * Does not mutate extraction / reconciliation inputs.
 */
export function buildReviewSession(
  result: AiIntakeAnalyzeSuccess,
  options: BuildReviewSessionOptions = {}
): IntakeReviewSession {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const sessionId =
    options.sessionId ?? `review:${createdAt}:${Math.random().toString(36).slice(2, 8)}`;
  const registry = options.registry ?? [];
  const finalRows = result.finalRows ?? [];

  const { occurrences } = buildRequestOccurrences(
    result.extraction.documentRows
  );

  const rows: ReviewPartRow[] = [];
  let order = 0;
  const coveredFinalParts = new Set<string>();

  for (const occ of occurrences) {
    const final = findFinalRow(finalRows, occ);
    if (final?.partId) coveredFinalParts.add(final.partId);
    const engineIssues = [
      ...(final?.issues ?? []),
      ...result.warnings,
    ];
    rows.push(
      buildRowFromOccurrence({
        occ,
        final,
        displayOrder: order++,
        registry,
        engineIssues,
        result,
      })
    );
  }

  // Email-only / DXF-not-requested / unmatched final rows without document occ
  for (const final of finalRows) {
    if (!final.partId) continue;
    if (coveredFinalParts.has(final.partId)) continue;
    if (final.requestOccurrences.length > 0) {
      // Already represented via document occurrences that map to this part
      const hasOcc = occurrences.some(
        (o) =>
          o.matchedDxfPartId === final.partId ||
          final.requestOccurrences.some((ro) => ro.occurrenceId === o.occurrenceId)
      );
      if (hasOcc) continue;
    }

    const syntheticOcc: RequestPartOccurrence = {
      occurrenceId: `email-or-dxf:${final.partId}`,
      matchedDxfPartId: final.partId,
      rawPartReference: final.partId,
      quantity: final.quantity,
      thicknessMm: final.thicknessMm,
      material: final.material,
      description: final.description,
      action: final.action,
      source: {
        documentId: null,
        type: final.hasEmailSource ? "EMAIL" : "XLSX",
        fileName: null,
        sheetName: null,
        rowNumber: null,
        pageNumber: null,
        excerpt: null,
      },
    };
    rows.push(
      buildRowFromOccurrence({
        occ: syntheticOcc,
        final,
        displayOrder: order++,
        registry,
        engineIssues: final.issues,
        result,
      })
    );
  }

  // Enrich thickness candidates across same-part siblings with sibling provenance
  const byPart = new Map<string, ReviewPartRow[]>();
  for (const row of rows) {
    const key = row.matchedDxfPartId ?? row.displayPartReference ?? row.rowId;
    const list = byPart.get(key) ?? [];
    list.push(row);
    byPart.set(key, list);
  }
  for (const group of byPart.values()) {
    for (const row of group) {
      if (row.thicknessMm.currentValue != null) continue;
      for (const sibling of group) {
        if (sibling.rowId === row.rowId) continue;
        const v =
          sibling.thicknessMm.currentValue ?? sibling.thicknessMm.proposedValue;
        if (typeof v !== "number" || !(v > 0)) continue;
        if (row.thicknessMm.candidates.some((c) => c.value === v)) continue;
        const siblingLabel =
          sibling.thicknessMm.candidates[0]?.sourceLabel ??
          `ערך מחלק זהה בבקשה · row ${sibling.displayOrder + 1}`;
        row.thicknessMm.candidates.push({
          value: v,
          sourceLabel: siblingLabel,
          sourceType: sibling.thicknessMm.candidates[0]?.sourceType ?? "XLSX",
          reason: "suggest",
        });
      }
    }
  }

  // Post-DXF table-level mass interpretation (once per table, full geometry).
  const massEnrichment = enrichReviewRowsWithMassInterpretation({
    rows,
    registry,
    analyzeResult: result,
    requireDxfGeometry: true,
  });
  const massInterpretations = serializeMassInterpretationsForDebug(
    massEnrichment.massInterpretations
  );

  const { issues, actions } = buildIssuesForRows({
    rows,
    massInterpretations: massEnrichment.massInterpretations,
  });

  // Recompute statuses after issues (mismatch ack etc. affect readiness via issues)
  for (const row of rows) {
    const hasBlocking = issues.some(
      (i) =>
        !i.resolved &&
        i.severity === "BLOCKING" &&
        i.rowIds.includes(row.rowId)
    );
    if (!row.includeInQuote) {
      row.status = "EXCLUDED";
    } else if (hasBlocking || !computeRowStatus(row) || computeRowStatus(row) === "NEEDS_DECISION") {
      row.status = hasBlocking ? "NEEDS_DECISION" : computeRowStatus(row);
      if (hasBlocking) row.status = "NEEDS_DECISION";
    } else {
      row.status = computeRowStatus(row);
    }
  }

  const summary = buildReviewSummary(rows, issues);

  return {
    schemaVersion: INTAKE_REVIEW_SCHEMA_VERSION,
    sessionId,
    analysisRunId: options.analysisRunId ?? null,
    status: summary.readyForApproval ? "READY_FOR_APPROVAL" : "REVIEW_REQUIRED",
    createdAt,
    updatedAt: createdAt,
    rows,
    issues,
    actions,
    decisions: [],
    summary,
    approvedBom: null,
    massInterpretations,
  };
}

/** Rebuild issues/actions/summary after mutation (shared by apply). */
export function refreshReviewSessionDerived(
  session: IntakeReviewSession,
  updatedAt?: string
): IntakeReviewSession {
  const rows = session.rows.map((r) => ({ ...r }));
  const { issues, actions } = buildIssuesForRows({
    rows,
    massInterpretations: session.massInterpretations ?? null,
  });
  for (const row of rows) {
    const hasBlocking = issues.some(
      (i) =>
        !i.resolved &&
        i.severity === "BLOCKING" &&
        i.rowIds.includes(row.rowId)
    );
    if (!row.includeInQuote) {
      row.status = "EXCLUDED";
    } else if (hasBlocking) {
      row.status = "NEEDS_DECISION";
    } else {
      row.status = computeRowStatus(row);
    }
  }
  const summary = buildReviewSummary(rows, issues);
  return {
    ...session,
    rows,
    issues,
    actions,
    updatedAt: updatedAt ?? new Date().toISOString(),
    status:
      session.status === "APPROVED"
        ? "APPROVED"
        : summary.readyForApproval
          ? "READY_FOR_APPROVAL"
          : "REVIEW_REQUIRED",
    summary,
  };
}
