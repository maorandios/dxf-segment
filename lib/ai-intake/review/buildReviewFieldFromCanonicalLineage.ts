/**
 * Build Review field state from canonical field lineage.
 */

import type { CanonicalFieldLineage } from "../lineage/canonicalFieldLineage";
import type { ReviewFieldState } from "./types";

export type ReviewFieldFromLineage<T> = {
  proposedValue: T | null;
  currentValue: T | null;
  state: ReviewFieldState;
  candidates: unknown[];
  sourceRefs: unknown[];
  editedByUser: false;
};

export function buildReviewFieldFromCanonicalLineage<T>(
  lineage: CanonicalFieldLineage<T> | null | undefined
): ReviewFieldFromLineage<T> {
  if (!lineage || lineage.status === "NOT_PRESENT") {
    return {
      proposedValue: null,
      currentValue: null,
      state: "MISSING",
      candidates: [],
      sourceRefs: [],
      editedByUser: false,
    };
  }

  if (lineage.status === "CONFLICT") {
    return {
      proposedValue: lineage.resolvedValue,
      currentValue: null,
      state: "CONFLICT",
      candidates: lineage.candidates,
      sourceRefs: lineage.sourceRefs,
      editedByUser: false,
    };
  }

  if (lineage.status === "AMBIGUOUS") {
    return {
      proposedValue: lineage.resolvedValue ?? lineage.normalizedValue,
      currentValue: null,
      state: "AMBIGUOUS",
      candidates: lineage.candidates,
      sourceRefs: lineage.sourceRefs,
      editedByUser: false,
    };
  }

  if (lineage.status === "INVALID") {
    return {
      proposedValue: lineage.extractedValue,
      currentValue: null,
      state: "MISSING",
      candidates: lineage.candidates,
      sourceRefs: lineage.sourceRefs,
      editedByUser: false,
    };
  }

  const value =
    lineage.resolvedValue ??
    lineage.normalizedValue ??
    lineage.extractedValue ??
    null;

  if (value == null && lineage.candidates.length === 0) {
    return {
      proposedValue: null,
      currentValue: null,
      state: "MISSING",
      candidates: [],
      sourceRefs: lineage.sourceRefs,
      editedByUser: false,
    };
  }

  // Resolved / extracted / normalized with a valid value → never MISSING
  const state: ReviewFieldState =
    lineage.valueOrigin === "DETERMINISTIC_DERIVATION" ||
    lineage.valueOrigin === "DXF_GEOMETRY"
      ? "CALCULATED"
      : lineage.status === "NORMALIZED"
        ? "INFERRED"
        : "VERIFIED";

  return {
    proposedValue: value,
    currentValue: value,
    state: value == null ? "MISSING" : state,
    candidates: lineage.candidates,
    sourceRefs: lineage.sourceRefs,
    editedByUser: false,
  };
}
