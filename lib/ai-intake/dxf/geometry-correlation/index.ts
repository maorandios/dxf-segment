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
