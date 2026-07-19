/**
 * Geometry/DXF assignment as enrichment — never rebuilds business fields.
 */

import type { ExtractedDocumentRow } from "../../schemas";
import {
  encodeGeometryCandidatesNote,
  type CanonicalDxfCandidate,
  type CanonicalDxfMatchReason,
} from "./canonicalDxfMatch";

export type DxfAssignmentEnrichment = {
  matchedDxfPartId: string | null;
  matchedRegistryEntryId?: string | null;
  matchStatus:
    | "MATCHED_BY_EXACT_IDENTIFIER"
    | "MATCHED_BY_GEOMETRY"
    | "AMBIGUOUS_GEOMETRY_MATCH"
    | "UNMATCHED_NO_IDENTIFIER"
    | "UNMATCHED_IDENTIFIER_NOT_FOUND"
    | "UNMATCHED_INSUFFICIENT_GEOMETRY"
    | "UNMATCHED_GEOMETRY_MISMATCH"
    | "INVALID_DXF_GEOMETRY";
  matchReason: CanonicalDxfMatchReason | string;
  candidates?: CanonicalDxfCandidate[];
  ambiguityGroupId?: string | null;
  geometryConfidence?: number | null;
};

/**
 * Enrich occurrence with DXF match metadata without overwriting commercial fields.
 */
export function applyDxfAssignmentToOccurrence(args: {
  occurrence: ExtractedDocumentRow;
  assignment: DxfAssignmentEnrichment;
}): ExtractedDocumentRow {
  const { occurrence: occ, assignment } = args;

  const matchNote =
    assignment.matchStatus === "MATCHED_BY_GEOMETRY"
      ? "matchMethod:GEOMETRY"
      : assignment.matchStatus === "AMBIGUOUS_GEOMETRY_MATCH"
        ? "matchMethod:AMBIGUOUS_GEOMETRY"
        : assignment.matchStatus === "MATCHED_BY_EXACT_IDENTIFIER"
          ? "matchMethod:EXACT"
          : assignment.matchStatus.startsWith("UNMATCHED")
            ? `matchMethod:${assignment.matchStatus}`
            : null;

  const candNote =
    assignment.candidates && assignment.candidates.length > 0
      ? encodeGeometryCandidatesNote(assignment.candidates)
      : null;

  const ambNote = assignment.ambiguityGroupId
    ? `ambiguityGroupId:${assignment.ambiguityGroupId}`
    : null;

  const notes =
    [occ.notes, matchNote, candNote, ambNote].filter(Boolean).join("|") ||
    occ.notes;

  return {
    ...occ,
    quantity: occ.quantity,
    material: occ.material,
    thicknessMm: occ.thicknessMm,
    description: occ.description,
    rawPartReference: occ.rawPartReference,
    documentGeometry: occ.documentGeometry,
    matchedDxfPartId:
      assignment.matchedDxfPartId ?? occ.matchedDxfPartId ?? null,
    notes,
    geometryCandidates: assignment.candidates ?? occ.geometryCandidates ?? null,
    ambiguityGroupId:
      assignment.ambiguityGroupId ?? occ.ambiguityGroupId ?? null,
    matchReason: String(assignment.matchReason),
  };
}

export function assertDxfAssignmentPreservesBusinessFields(args: {
  before: ExtractedDocumentRow;
  after: ExtractedDocumentRow;
}): void {
  const checks: Array<[string, unknown, unknown]> = [
    ["quantity", args.before.quantity, args.after.quantity],
    ["material", args.before.material, args.after.material],
    ["thicknessMm", args.before.thicknessMm, args.after.thicknessMm],
  ];
  for (const [name, a, b] of checks) {
    if (a !== b) {
      const msg = `DXF_ASSIGNMENT_ALTERED_${name.toUpperCase()}`;
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV !== "production"
      ) {
        throw new Error(msg);
      }
      console.error(`[ai-intake] ${msg}`);
    }
  }
}
