/**
 * Geometry correlation public API.
 */

export type * from "./types";
export { GEOMETRY_CORRELATION_THRESHOLDS } from "./types";
export {
  scoreGeometryCorrelationCandidate,
  type SourceGeometryEvidence,
  type DxfGeometryEvidence,
} from "./scoreGeometryCorrelationCandidate";
export { solveGeometryAssignment } from "./solveGeometryAssignment";
export { applyGeometryCorrelation } from "./applyGeometryCorrelation";
export {
  applyDxfAssignmentToOccurrence,
  assertDxfAssignmentPreservesBusinessFields,
} from "./applyDxfAssignmentToOccurrence";
export {
  buildDxfReservations,
  heldOrReservedRegistryIds,
  assertNoConfirmedMatchAsOrphan,
  assertOneToOneConfirmedAssignments,
  type DxfReservationState,
  type DxfReservationRecord,
} from "./dxfReservations";
export {
  buildAmbiguityGroupId,
  geometryCandidateToCanonical,
  encodeGeometryCandidatesNote,
  decodeGeometryCandidatesNote,
  type CanonicalDxfMatchResult,
  type DxfAmbiguityGroup,
  type CanonicalDxfCandidate,
} from "./canonicalDxfMatch";
