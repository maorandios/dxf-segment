/**
 * Safe optional document measurements for the Review Session.
 * Rejects falsely normalized values when unit evidence is tied or field-irrelevant.
 */

import { NORMALIZATION_TOLERANCES } from "../normalization/normalizationConfig";
import type {
  AiIntakeAnalyzeSuccess,
  ExtractedDocumentRow,
  FinalIntakeMappingRow,
  GeometryComparisonCandidate,
  RequestPartOccurrence,
} from "../schemas";
import type {
  ReviewOptionalMeasurement,
  ReviewPartRow,
  ReviewSourceReference,
} from "./types";

export type OptionalDocField =
  | "width"
  | "height"
  | "area"
  | "unitWeight"
  | "totalWeight";

type AssignmentField = OptionalDocField | "thickness" | "totalArea";

type TableUnitAssignmentLike = Partial<
  Record<AssignmentField, string | null>
>;

type TableUnitCandidateLike = {
  assignment?: TableUnitAssignmentLike;
  score?: number;
  evidenceGroups?: string[];
  evidence?: string[];
};

type FieldDecisionLike = {
  field?: string;
  unit?: string | null;
  status?: string;
  reason?: string | null;
};

export type TableUnitInferenceLike = {
  tableId?: string;
  sheetName?: string | null;
  status?: string;
  resolvedAssignment?: TableUnitAssignmentLike | null;
  candidates?: TableUnitCandidateLike[];
  evidence?: string[];
  /** Optional future / extended shape — preferred when present. */
  fieldDecisions?:
    | Record<string, FieldDecisionLike>
    | FieldDecisionLike[]
    | null;
};

type NormalizedMeasurementLike = {
  raw?: {
    rawValue?: number | string | null;
    rawText?: string | null;
    statedUnit?: string | null;
    sourceCell?: string | null;
    rawHeader?: string | null;
  } | null;
  normalizedValue?: number | null;
  normalizedUnit?: "MM" | "MM2" | "KG" | null;
  statedUnit?: string | null;
  resolvedSourceUnit?: string | null;
  resolutionStatus?: string | null;
  resolutionReason?: string | null;
  candidateInterpretations?: Array<{
    sourceUnit?: string;
    score?: number;
    evidence?: string[];
  }>;
};

type WorkbookNormRowLike = {
  occurrenceId?: string;
  partId?: string | null;
  rowNumber?: number | null;
  width?: NormalizedMeasurementLike | null;
  height?: NormalizedMeasurementLike | null;
  area?: NormalizedMeasurementLike | null;
  unitWeight?: NormalizedMeasurementLike | null;
  totalWeight?: NormalizedMeasurementLike | null;
};

const MASS_RELEVANT_GROUPS = new Set([
  "HEADER",
  "EXPLICIT_CELL",
  "ROW_DENSITY_WEIGHT",
  "ROW_TOTAL_WEIGHT",
]);

const LENGTH_RELEVANT_GROUPS = new Set([
  "HEADER",
  "EXPLICIT_CELL",
  "ROW_GEOMETRY",
  "ROW_TOTAL_AREA",
  "DXF_DIMENSIONS",
  "DXF_AREA",
]);

const AREA_RELEVANT_GROUPS = new Set([
  "HEADER",
  "EXPLICIT_CELL",
  "ROW_GEOMETRY",
  "ROW_TOTAL_AREA",
  "DXF_AREA",
  "DXF_DIMENSIONS",
]);

function relevantGroupsFor(field: OptionalDocField): Set<string> {
  if (field === "unitWeight" || field === "totalWeight") {
    return MASS_RELEVANT_GROUPS;
  }
  if (field === "area") return AREA_RELEVANT_GROUPS;
  return LENGTH_RELEVANT_GROUPS;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function collectFieldDecisions(
  inference: TableUnitInferenceLike | null | undefined
): Map<string, FieldDecisionLike> {
  const map = new Map<string, FieldDecisionLike>();
  const fd = inference?.fieldDecisions;
  if (!fd) return map;
  if (Array.isArray(fd)) {
    for (const d of fd) {
      const key = String(d.field ?? "").toLowerCase();
      if (key) map.set(key, d);
    }
    return map;
  }
  for (const [k, d] of Object.entries(fd)) {
    map.set(k.toLowerCase(), d);
  }
  return map;
}

/**
 * Derive whether a semantic field's unit is uniquely and safely resolved
 * from table-unit inference candidates (conservative tie fallback).
 */
export function assessFieldUnitFromInference(
  inference: TableUnitInferenceLike | null | undefined,
  field: OptionalDocField
): {
  status: ReviewOptionalMeasurement["status"];
  unit: string | null;
  reason: string | null;
} {
  if (!inference) {
    return { status: "NOT_COMPARABLE", unit: null, reason: null };
  }

  const decisions = collectFieldDecisions(inference);
  const decision =
    decisions.get(field.toLowerCase()) ??
    decisions.get(field === "totalWeight" ? "total_weight" : field);
  if (decision) {
    const st = String(decision.status ?? "").toUpperCase();
    if (st === "RESOLVED" && decision.unit) {
      return {
        status: "RESOLVED",
        unit: String(decision.unit),
        reason: decision.reason ?? null,
      };
    }
    if (st === "AMBIGUOUS" || st === "MISSING" || st === "INVALID") {
      return {
        status: st as ReviewOptionalMeasurement["status"],
        unit: null,
        reason:
          decision.reason ??
          (st === "AMBIGUOUS" ? "Mass unit was not uniquely resolved" : null),
      };
    }
  }

  const candidates = [...(inference.candidates ?? [])].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );
  if (candidates.length === 0) {
    const assigned = inference.resolvedAssignment?.[field] ?? null;
    if (inference.status === "RESOLVED" && assigned) {
      // Still reject mass when only DXF dimension evidence exists.
      const groups = new Set(
        (inference.evidence ?? [])
          .filter((e) => e.startsWith("group:"))
          .map((e) => e.slice("group:".length))
      );
      const relevant = relevantGroupsFor(field);
      const hasRelevant = [...groups].some((g) => relevant.has(g));
      if (!hasRelevant && (field === "totalWeight" || field === "unitWeight")) {
        return {
          status: "AMBIGUOUS",
          unit: null,
          reason: "Mass unit was not uniquely resolved",
        };
      }
      return { status: "RESOLVED", unit: String(assigned), reason: null };
    }
    return { status: "NOT_COMPARABLE", unit: null, reason: null };
  }

  const bestScore = candidates[0]?.score ?? 0;
  const gap = NORMALIZATION_TOLERANCES.minimumCandidateScoreSeparation;
  const nearTies = candidates.filter(
    (c) => (c.score ?? 0) >= bestScore - gap - 1e-12
  );

  const units = new Set<string>();
  for (const c of nearTies) {
    const u = c.assignment?.[field];
    if (u) units.add(String(u));
  }

  if (units.size > 1) {
    return {
      status: "AMBIGUOUS",
      unit: null,
      reason:
        field === "totalWeight" || field === "unitWeight"
          ? "Mass unit was not uniquely resolved"
          : "Unit was not uniquely resolved",
    };
  }

  if (units.size === 0) {
    return { status: "MISSING", unit: null, reason: null };
  }

  const unit = [...units][0]!;
  // Field-relevant evidence check across near-tie winners that share this unit
  const relevant = relevantGroupsFor(field);
  const supporting = nearTies.filter(
    (c) => String(c.assignment?.[field] ?? "") === unit
  );
  const hasRelevantEvidence = supporting.some((c) =>
    (c.evidenceGroups ?? []).some((g) => relevant.has(g))
  );

  if (!hasRelevantEvidence) {
    // DXF_DIMENSIONS alone must not resolve mass units.
    if (field === "totalWeight" || field === "unitWeight") {
      return {
        status: "AMBIGUOUS",
        unit: null,
        reason: "Mass unit was not uniquely resolved",
      };
    }
    // Length may still resolve from DXF correlation groups.
    const hasAny = supporting.some(
      (c) => (c.evidenceGroups ?? []).length > 0
    );
    if (!hasAny) {
      return {
        status: "AMBIGUOUS",
        unit: null,
        reason: "Unit was not uniquely resolved",
      };
    }
  }

  return { status: "RESOLVED", unit, reason: null };
}

function explicitUnitSafe(
  nm: NormalizedMeasurementLike | null | undefined
): boolean {
  if (!nm) return false;
  const status = String(nm.resolutionStatus ?? "");
  if (
    status === "AS_STATED" ||
    status === "RESOLVED_BY_EXPLICIT_CELL_UNIT"
  ) {
    return nm.statedUnit != null || nm.resolvedSourceUnit != null;
  }
  if (nm.raw?.statedUnit) return true;
  return false;
}

function measurementFromNormalized(
  nm: NormalizedMeasurementLike | null | undefined,
  field: OptionalDocField,
  inference: TableUnitInferenceLike | null | undefined,
  sourceRefs: ReviewSourceReference[]
): ReviewOptionalMeasurement {
  const rawValue = asNumber(nm?.raw?.rawValue);
  const rawText = nm?.raw?.rawText ?? null;

  if (nm == null && rawValue == null) {
    return {
      rawValue: null,
      rawText: null,
      normalizedValue: null,
      normalizedUnit: null,
      status: "MISSING",
      sourceRefs,
      reason: null,
    };
  }

  if (explicitUnitSafe(nm) && nm?.normalizedValue != null && nm.normalizedUnit) {
    return {
      rawValue,
      rawText,
      normalizedValue: nm.normalizedValue,
      normalizedUnit: nm.normalizedUnit,
      status: "RESOLVED",
      sourceRefs,
      reason: nm.resolutionReason ?? "Explicit unit",
    };
  }

  const assessed = assessFieldUnitFromInference(inference, field);

  // Per-measurement candidate tie (field-specific interpretations)
  if (nm?.candidateInterpretations && nm.candidateInterpretations.length > 1) {
    const scores = nm.candidateInterpretations.map((c) => c.score ?? 0);
    const best = Math.max(...scores);
    const gap = NORMALIZATION_TOLERANCES.minimumCandidateScoreSeparation;
    const near = nm.candidateInterpretations.filter(
      (c) => (c.score ?? 0) >= best - gap - 1e-12
    );
    const units = new Set(
      near.map((c) => c.sourceUnit).filter(Boolean) as string[]
    );
    if (units.size > 1) {
      return {
        rawValue,
        rawText,
        normalizedValue: null,
        normalizedUnit: null,
        status: "AMBIGUOUS",
        sourceRefs,
        reason:
          field === "totalWeight" || field === "unitWeight"
            ? "Mass unit was not uniquely resolved"
            : "Unit was not uniquely resolved",
      };
    }
  }

  if (assessed.status !== "RESOLVED") {
    return {
      rawValue: rawValue ?? asNumber(nm?.normalizedValue),
      rawText,
      normalizedValue: null,
      normalizedUnit: null,
      status: assessed.status === "NOT_COMPARABLE" && rawValue != null
        ? "AMBIGUOUS"
        : assessed.status,
      sourceRefs,
      reason: assessed.reason,
    };
  }

  // Only accept engine normalized value when unit assessment agrees
  const engineUnit = nm?.normalizedUnit ?? null;
  const engineValue = nm?.normalizedValue ?? null;
  if (engineUnit != null && engineValue != null) {
    return {
      rawValue,
      rawText,
      normalizedValue: engineValue,
      normalizedUnit: engineUnit,
      status: "RESOLVED",
      sourceRefs,
      reason: assessed.reason,
    };
  }

  return {
    rawValue,
    rawText,
    normalizedValue: null,
    normalizedUnit: null,
    status: rawValue == null ? "MISSING" : "AMBIGUOUS",
    sourceRefs,
    reason: assessed.reason ?? "Normalized value unavailable",
  };
}

function measurementFromGeometryFallback(args: {
  field: OptionalDocField;
  rawValue: number | null;
  rawText?: string | null;
  proposedNormalized: number | null;
  proposedUnit: "MM" | "MM2" | "KG" | null;
  explicitSourceUnit: string | null;
  inference: TableUnitInferenceLike | null | undefined;
  sourceRefs: ReviewSourceReference[];
}): ReviewOptionalMeasurement {
  const {
    field,
    rawValue,
    rawText,
    proposedNormalized,
    proposedUnit,
    explicitSourceUnit,
    inference,
    sourceRefs,
  } = args;

  if (rawValue == null && proposedNormalized == null) {
    return {
      rawValue: null,
      rawText: rawText ?? null,
      normalizedValue: null,
      normalizedUnit: null,
      status: "MISSING",
      sourceRefs,
      reason: null,
    };
  }

  if (explicitSourceUnit && proposedNormalized != null && proposedUnit) {
    return {
      rawValue: rawValue ?? proposedNormalized,
      rawText: rawText ?? null,
      normalizedValue: proposedNormalized,
      normalizedUnit: proposedUnit,
      status: "RESOLVED",
      sourceRefs,
      reason: "Explicit unit",
    };
  }

  const assessed = assessFieldUnitFromInference(inference, field);
  if (assessed.status === "RESOLVED" && proposedNormalized != null && proposedUnit) {
    return {
      rawValue: rawValue ?? proposedNormalized,
      rawText: rawText ?? null,
      normalizedValue: proposedNormalized,
      normalizedUnit: proposedUnit,
      status: "RESOLVED",
      sourceRefs,
      reason: assessed.reason,
    };
  }

  return {
    // Prefer true raw; never present a tied conversion as raw.
    rawValue: rawValue ?? null,
    rawText: rawText ?? null,
    normalizedValue: null,
    normalizedUnit: null,
    status:
      assessed.status === "RESOLVED"
        ? "AMBIGUOUS"
        : assessed.status === "NOT_COMPARABLE" && rawValue != null
          ? "AMBIGUOUS"
          : assessed.status === "NOT_COMPARABLE"
            ? "MISSING"
            : assessed.status,
    sourceRefs,
    reason:
      assessed.reason ??
      (field === "totalWeight" || field === "unitWeight"
        ? "Mass unit was not uniquely resolved"
        : "Unit was not uniquely resolved"),
  };
}

function pickTableInference(
  result: AiIntakeAnalyzeSuccess,
  docRow: ExtractedDocumentRow | null
): TableUnitInferenceLike | null {
  const docs = result.aggregated?.documents ?? [];
  for (const doc of docs) {
    if (docRow && doc.documentId !== docRow.documentId) continue;
    const list = doc.workbookEvidence?.tableUnitInference;
    if (Array.isArray(list) && list.length > 0) {
      return list[0] as TableUnitInferenceLike;
    }
  }
  // Fallback: any document inference
  for (const doc of docs) {
    const list = doc.workbookEvidence?.tableUnitInference;
    if (Array.isArray(list) && list.length > 0) {
      return list[0] as TableUnitInferenceLike;
    }
  }
  return null;
}

function findWorkbookNormRow(
  result: AiIntakeAnalyzeSuccess,
  occ: RequestPartOccurrence
): WorkbookNormRowLike | null {
  const docs = result.aggregated?.documents ?? [];
  for (const doc of docs) {
    const list = doc.workbookEvidence?.normalizedMeasurements;
    if (!Array.isArray(list)) continue;
    const rows = list as WorkbookNormRowLike[];
    const byOcc = rows.find((r) => r.occurrenceId === occ.occurrenceId);
    if (byOcc) return byOcc;
    const byRow = rows.find(
      (r) =>
        occ.source.rowNumber != null &&
        r.rowNumber === occ.source.rowNumber &&
        (r.partId == null ||
          r.partId === occ.matchedDxfPartId ||
          r.partId === occ.rawPartReference)
    );
    if (byRow) return byRow;
  }
  return null;
}

function findDocumentRow(
  result: AiIntakeAnalyzeSuccess,
  occ: RequestPartOccurrence
): ExtractedDocumentRow | null {
  const rows = result.extraction?.documentRows ?? [];
  const byOccMeta = rows.find(
    (r) =>
      r.source.rowNumber === occ.source.rowNumber &&
      r.source.fileName === occ.source.fileName &&
      (r.matchedDxfPartId === occ.matchedDxfPartId ||
        r.rawPartReference === occ.rawPartReference)
  );
  if (byOccMeta) return byOccMeta;
  return (
    rows.find(
      (r) =>
        r.matchedDxfPartId === occ.matchedDxfPartId &&
        r.source.rowNumber === occ.source.rowNumber
    ) ?? null
  );
}

function sourceRefsForField(args: {
  occ: RequestPartOccurrence;
  cell?: string | null;
  originalValue?: unknown;
  rawText?: string | null;
}): ReviewSourceReference[] {
  const cell =
    typeof args.cell === "string" && args.cell.trim().length > 0
      ? args.cell.trim()
      : null;
  // No field-specific evidence at all → empty refs (COLUMN_NOT_PRESENT).
  if (
    cell == null &&
    args.originalValue == null &&
    (args.rawText == null || args.rawText === "")
  ) {
    return [];
  }
  return [
    {
      sourceType:
        args.occ.source.type === "PDF"
          ? "PDF"
          : args.occ.source.type === "EMAIL"
            ? "EMAIL"
            : "XLSX",
      fileName: args.occ.source.fileName,
      sheetName: args.occ.source.sheetName,
      rowNumber: args.occ.source.rowNumber,
      pageNumber: args.occ.source.pageNumber,
      cellReferences: cell ? [cell] : [],
      excerpt: args.occ.source.excerpt,
      originalValue: args.originalValue ?? args.rawText ?? null,
    },
  ];
}

/**
 * Build optional measurement evidence for a single semantic field only.
 * Cell references must never include unrelated fields from the same row.
 */
export function buildOptionalMeasurementEvidence(args: {
  semanticField: OptionalDocField;
  occ: RequestPartOccurrence;
  cell?: string | null;
  rawValue: number | null;
  rawText?: string | null;
  normalizedValue?: number | null;
  normalizedUnit?: "MM" | "MM2" | "KG" | null;
  explicitUnit?: string | null;
  inference?: TableUnitInferenceLike | null;
  columnPresent?: boolean;
  cellBlank?: boolean;
}): ReviewOptionalMeasurement {
  const {
    semanticField,
    occ,
    cell,
    rawValue,
    rawText,
    normalizedValue,
    normalizedUnit,
    explicitUnit,
    inference,
    columnPresent = true,
    cellBlank = false,
  } = args;

  if (!columnPresent && rawValue == null && normalizedValue == null) {
    return {
      rawValue: null,
      rawText: null,
      normalizedValue: null,
      normalizedUnit: null,
      status: "MISSING",
      sourceRefs: [],
      reason: "No source column or value was found",
    };
  }

  if (cellBlank && rawValue == null && normalizedValue == null) {
    return {
      rawValue: null,
      rawText: rawText ?? null,
      normalizedValue: null,
      normalizedUnit: null,
      status: "MISSING",
      sourceRefs: sourceRefsForField({
        occ,
        cell,
        originalValue: null,
        rawText,
      }),
      reason: "CELL_EMPTY",
    };
  }

  const sourceRefs = sourceRefsForField({
    occ,
    cell,
    originalValue: rawValue,
    rawText,
  });

  if (explicitUnit && normalizedValue != null && normalizedUnit) {
    return {
      rawValue,
      rawText: rawText ?? null,
      normalizedValue,
      normalizedUnit,
      status: "RESOLVED",
      sourceRefs,
      reason: "Explicit unit",
    };
  }

  return measurementFromGeometryFallback({
    field: semanticField,
    rawValue,
    rawText,
    proposedNormalized: normalizedValue ?? null,
    proposedUnit: normalizedUnit ?? null,
    explicitSourceUnit: explicitUnit ?? null,
    inference,
    sourceRefs,
  });
}

/**
 * Build safe documentEvidence + sanitized documentComparison for a review row.
 */
export function buildSafeDocumentEvidence(args: {
  result: AiIntakeAnalyzeSuccess;
  occ: RequestPartOccurrence;
  final: FinalIntakeMappingRow | null;
}): {
  documentEvidence: NonNullable<ReviewPartRow["documentEvidence"]>;
  documentComparison: ReviewPartRow["documentComparison"];
} {
  const { result, occ, final } = args;
  const docRow = findDocumentRow(result, occ);
  const inference = pickTableInference(result, docRow);
  const normRow = findWorkbookNormRow(result, occ);
  const geo: GeometryComparisonCandidate | undefined =
    final?.geometryComparisons?.[0];
  const g = docRow?.documentGeometry;

  const fieldMeas = (
    field: OptionalDocField,
    nm: NormalizedMeasurementLike | null | undefined,
    opts: {
      cell: string | null | undefined;
      rawValue: number | null;
      rawText?: string | null;
      normalizedValue: number | null;
      normalizedUnit: "MM" | "MM2" | "KG" | null;
      explicitUnit: string | null;
    }
  ): ReviewOptionalMeasurement => {
    const cell = opts.cell ?? nm?.raw?.sourceCell ?? null;
    const hasAnyEvidence =
      cell != null ||
      opts.rawValue != null ||
      opts.normalizedValue != null ||
      nm != null;

    if (!hasAnyEvidence) {
      return buildOptionalMeasurementEvidence({
        semanticField: field,
        occ,
        columnPresent: false,
        rawValue: null,
      });
    }

    if (nm != null) {
      return measurementFromNormalized(
        nm,
        field,
        inference,
        sourceRefsForField({
          occ,
          cell,
          originalValue: asNumber(nm.raw?.rawValue) ?? opts.rawValue,
          rawText: nm.raw?.rawText ?? opts.rawText,
        })
      );
    }

    const blank =
      cell != null && opts.rawValue == null && opts.normalizedValue == null;
    return buildOptionalMeasurementEvidence({
      semanticField: field,
      occ,
      cell,
      rawValue: opts.rawValue,
      rawText: opts.rawText,
      normalizedValue: opts.normalizedValue,
      normalizedUnit: opts.normalizedUnit,
      explicitUnit: opts.explicitUnit,
      inference,
      columnPresent: true,
      cellBlank: blank,
    });
  };

  const width = fieldMeas("width", normRow?.width, {
    cell: g?.widthCell,
    rawValue: geo?.rawWidth ?? g?.width ?? null,
    rawText: normRow?.width?.raw?.rawText ?? null,
    normalizedValue: geo?.documentWidthMm ?? null,
    normalizedUnit: "MM",
    explicitUnit: geo?.rawWidthUnit ?? g?.widthUnit ?? null,
  });

  const height = fieldMeas("height", normRow?.height, {
    cell: g?.heightCell,
    rawValue: geo?.rawHeight ?? g?.height ?? null,
    rawText: normRow?.height?.raw?.rawText ?? null,
    normalizedValue: geo?.documentHeightMm ?? null,
    normalizedUnit: "MM",
    explicitUnit: geo?.rawHeightUnit ?? g?.heightUnit ?? null,
  });

  const area = fieldMeas("area", normRow?.area, {
    cell: g?.areaCell,
    rawValue: geo?.rawArea ?? g?.area ?? null,
    rawText: normRow?.area?.raw?.rawText ?? null,
    normalizedValue: geo?.documentAreaMm2 ?? null,
    normalizedUnit: "MM2",
    explicitUnit: geo?.rawAreaUnit ?? g?.areaUnit ?? null,
  });

  const unitWeight = fieldMeas("unitWeight", normRow?.unitWeight, {
    cell: g?.unitWeightCell,
    rawValue: asNumber(normRow?.unitWeight?.raw?.rawValue),
    rawText: normRow?.unitWeight?.raw?.rawText ?? null,
    normalizedValue: geo?.documentUnitWeightKg ?? g?.unitWeightKg ?? null,
    normalizedUnit: "KG",
    explicitUnit: null,
  });

  const totalWeight = fieldMeas("totalWeight", normRow?.totalWeight, {
    cell: g?.totalWeightCell,
    rawValue: asNumber(normRow?.totalWeight?.raw?.rawValue),
    rawText: normRow?.totalWeight?.raw?.rawText ?? null,
    normalizedValue: geo?.documentTotalWeightKg ?? g?.totalWeightKg ?? null,
    normalizedUnit: "KG",
    explicitUnit: null,
  });

  const documentEvidence = {
    width,
    height,
    area,
    unitWeight,
    totalWeight,
  };

  const documentComparison = {
    widthMm: width.status === "RESOLVED" ? width.normalizedValue : null,
    heightMm: height.status === "RESOLVED" ? height.normalizedValue : null,
    areaMm2: area.status === "RESOLVED" ? area.normalizedValue : null,
    unitWeightKg:
      unitWeight.status === "RESOLVED" ? unitWeight.normalizedValue : null,
    totalWeightKg:
      totalWeight.status === "RESOLVED" ? totalWeight.normalizedValue : null,
  };

  return { documentEvidence, documentComparison };
}

/** Pure builder for tests without a full analysis payload. */
export function buildOptionalMeasurement(args: {
  field: OptionalDocField;
  rawValue: number | null;
  rawText?: string | null;
  normalizedValue?: number | null;
  normalizedUnit?: "MM" | "MM2" | "KG" | null;
  explicitUnit?: string | null;
  inference?: TableUnitInferenceLike | null;
  sourceRefs?: ReviewSourceReference[];
}): ReviewOptionalMeasurement {
  if (args.explicitUnit && args.normalizedValue != null && args.normalizedUnit) {
    return {
      rawValue: args.rawValue,
      rawText: args.rawText ?? null,
      normalizedValue: args.normalizedValue,
      normalizedUnit: args.normalizedUnit,
      status: "RESOLVED",
      sourceRefs: args.sourceRefs ?? [],
      reason: "Explicit unit",
    };
  }
  return measurementFromGeometryFallback({
    field: args.field,
    rawValue: args.rawValue,
    rawText: args.rawText,
    proposedNormalized: args.normalizedValue ?? null,
    proposedUnit: args.normalizedUnit ?? null,
    explicitSourceUnit: args.explicitUnit ?? null,
    inference: args.inference,
    sourceRefs: args.sourceRefs ?? [],
  });
}
