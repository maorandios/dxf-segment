/**
 * Canonical immutable field lineage — survives extraction → Review.
 * A non-null valid value may become null only with an allowed loss reason.
 */

export type CanonicalFieldStatus =
  | "NOT_PRESENT"
  | "EXTRACTED"
  | "NORMALIZED"
  | "RESOLVED"
  | "AMBIGUOUS"
  | "CONFLICT"
  | "INVALID";

export type FieldValueOrigin =
  | "WORKBOOK_CELL"
  | "WORKBOOK_SUBCELL"
  | "PDF"
  | "EMAIL"
  | "PROFILE_PARSE"
  | "DETERMINISTIC_DERIVATION"
  | "DXF_GEOMETRY"
  | "USER_DECISION";

export type AllowedFieldLossReason =
  | "USER_CLEARED_VALUE"
  | "SOURCE_CONFLICT_UNRESOLVED"
  | "VALIDATION_REJECTED_VALUE"
  | "VALUE_OUTSIDE_ALLOWED_DOMAIN"
  | "SOURCE_OCCURRENCE_EXCLUDED"
  | "CANONICAL_MERGE_CONFLICT"
  | "FIELD_NOT_APPLICABLE";

export type IntakePipelineStage =
  | "EXTRACTION"
  | "NORMALIZATION"
  | "DXF_ASSIGNMENT"
  | "RECONCILIATION"
  | "REVIEW_CONSTRUCTION"
  | "ISSUE_GENERATION"
  | "SAFETY_GATE";

export type SourceReference = {
  sourceType: string;
  address: string | null;
  documentId?: string | null;
  occurrenceId?: string | null;
};

export type CanonicalFieldCandidate<T> = {
  value: T;
  origin: FieldValueOrigin;
  confidence: number;
  sourceRefs: SourceReference[];
};

export type FieldLineageTransition = {
  stage: IntakePipelineStage;
  fromStatus: CanonicalFieldStatus;
  toStatus: CanonicalFieldStatus;
  previousValue: unknown;
  nextValue: unknown;
  reasonCode: string;
  relatedEvidenceIds: string[];
};

export type CanonicalFieldLineage<T = unknown> = {
  targetField: string;
  extractedValue: T | null;
  normalizedValue: T | null;
  resolvedValue: T | null;
  status: CanonicalFieldStatus;
  sourceRefs: SourceReference[];
  candidates: CanonicalFieldCandidate<T>[];
  extractionPlanId: string | null;
  tableId: string | null;
  occurrenceId: string;
  valueOrigin: FieldValueOrigin;
  transitions: FieldLineageTransition[];
};

export function createEmptyLineage<T>(args: {
  targetField: string;
  occurrenceId: string;
  tableId?: string | null;
  extractionPlanId?: string | null;
}): CanonicalFieldLineage<T> {
  return {
    targetField: args.targetField,
    extractedValue: null,
    normalizedValue: null,
    resolvedValue: null,
    status: "NOT_PRESENT",
    sourceRefs: [],
    candidates: [],
    extractionPlanId: args.extractionPlanId ?? null,
    tableId: args.tableId ?? null,
    occurrenceId: args.occurrenceId,
    valueOrigin: "WORKBOOK_CELL",
    transitions: [],
  };
}

export function recordLineageTransition<T>(
  lineage: CanonicalFieldLineage<T>,
  transition: Omit<FieldLineageTransition, "fromStatus" | "previousValue"> & {
    previousValue?: unknown;
  }
): CanonicalFieldLineage<T> {
  const full: FieldLineageTransition = {
    stage: transition.stage,
    fromStatus: lineage.status,
    toStatus: transition.toStatus,
    previousValue: transition.previousValue ?? lineage.resolvedValue,
    nextValue: transition.nextValue,
    reasonCode: transition.reasonCode,
    relatedEvidenceIds: transition.relatedEvidenceIds,
  };
  return {
    ...lineage,
    status: transition.toStatus,
    transitions: [...lineage.transitions, full],
  };
}

const ALLOWED_LOSS = new Set<string>([
  "USER_CLEARED_VALUE",
  "SOURCE_CONFLICT_UNRESOLVED",
  "VALIDATION_REJECTED_VALUE",
  "VALUE_OUTSIDE_ALLOWED_DOMAIN",
  "SOURCE_OCCURRENCE_EXCLUDED",
  "CANONICAL_MERGE_CONFLICT",
  "FIELD_NOT_APPLICABLE",
]);

/**
 * Runtime assertion: unexplained non-null → null is forbidden.
 */
export function assertNoUnexplainedFieldLoss(args: {
  field: string;
  previous: unknown;
  next: unknown;
  reasonCode: string | null | undefined;
  stage: IntakePipelineStage;
}): void {
  const had =
    args.previous != null &&
    !(typeof args.previous === "string" && args.previous.trim() === "");
  const lost =
    args.next == null ||
    (typeof args.next === "string" && args.next.trim() === "");
  if (!had || !lost) return;
  if (args.reasonCode && ALLOWED_LOSS.has(args.reasonCode)) return;
  const msg = `UNEXPLAINED_FIELD_LOSS:${args.field}@${args.stage}:reason=${args.reasonCode ?? "NONE"}`;
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    throw new Error(msg);
  }
  console.error(`[ai-intake] ${msg}`);
}

export function isPopulatedLineage<T>(
  lineage: CanonicalFieldLineage<T> | null | undefined
): boolean {
  if (!lineage) return false;
  if (lineage.resolvedValue != null) return true;
  if (lineage.normalizedValue != null) return true;
  if (lineage.extractedValue != null) return true;
  if (lineage.candidates.length > 0) return true;
  return false;
}

/**
 * Populated valid lineage wins over absent. Conflicting populated → CONFLICT.
 */
export function mergeCanonicalFieldLineages<T>(args: {
  field: string;
  occurrences: CanonicalFieldLineage<T>[];
  precedenceRules?: Array<(a: CanonicalFieldLineage<T>, b: CanonicalFieldLineage<T>) => number>;
}): CanonicalFieldLineage<T> {
  const populated = args.occurrences.filter(isPopulatedLineage);
  if (populated.length === 0) {
    return (
      args.occurrences[0] ??
      createEmptyLineage<T>({
        targetField: args.field,
        occurrenceId: "merge:empty",
      })
    );
  }
  if (populated.length === 1) {
    return populated[0]!;
  }

  const values = new Map<string, CanonicalFieldLineage<T>>();
  for (const p of populated) {
    const key = JSON.stringify(p.resolvedValue ?? p.normalizedValue ?? p.extractedValue);
    if (!values.has(key)) values.set(key, p);
  }

  const allCandidates = populated.flatMap((p) => p.candidates);
  const allRefs = populated.flatMap((p) => p.sourceRefs);
  const allTransitions = populated.flatMap((p) => p.transitions);

  if (values.size === 1) {
    const winner = [...values.values()][0]!;
    return {
      ...winner,
      candidates: allCandidates.length ? allCandidates : winner.candidates,
      sourceRefs: allRefs.length ? allRefs : winner.sourceRefs,
      transitions: [
        ...allTransitions,
        {
          stage: "RECONCILIATION",
          fromStatus: winner.status,
          toStatus: "RESOLVED",
          previousValue: winner.resolvedValue,
          nextValue: winner.resolvedValue,
          reasonCode: "MERGED_IDENTICAL_LINEAGES",
          relatedEvidenceIds: populated.map((p) => p.occurrenceId),
        },
      ],
    };
  }

  // Conflict: retain all candidates, do not nullify history
  const primary = populated[0]!;
  return {
    ...primary,
    resolvedValue: null,
    status: "CONFLICT",
    candidates: allCandidates,
    sourceRefs: allRefs,
    transitions: [
      ...allTransitions,
      {
        stage: "RECONCILIATION",
        fromStatus: primary.status,
        toStatus: "CONFLICT",
        previousValue: primary.resolvedValue,
        nextValue: null,
        reasonCode: "CANONICAL_MERGE_CONFLICT",
        relatedEvidenceIds: populated.map((p) => p.occurrenceId),
      },
    ],
  };
}

/**
 * Absent incoming must never overwrite populated existing.
 */
export function preferPopulatedLineage<T>(
  existing: CanonicalFieldLineage<T> | null | undefined,
  incoming: CanonicalFieldLineage<T> | null | undefined
): CanonicalFieldLineage<T> | null {
  const ex = isPopulatedLineage(existing);
  const inc = isPopulatedLineage(incoming);
  if (ex && !inc) return existing!;
  if (!ex && inc) return incoming!;
  if (ex && inc) {
    return mergeCanonicalFieldLineages({
      field: existing!.targetField,
      occurrences: [existing!, incoming!],
    });
  }
  return existing ?? incoming ?? null;
}
