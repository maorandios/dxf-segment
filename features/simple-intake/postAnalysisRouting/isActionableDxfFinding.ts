/**
 * Whether a DXF-file finding requires user decision / corrective action.
 * Uses canonical finding metadata — never visual labels.
 */

import type { DxfFileFinding } from "../dxfFileFindings";

type FindingWithOptionalAction = DxfFileFinding & {
  requiresUserAction?: boolean;
};

/**
 * Actionable findings route to gap resolution.
 * Informational-only duplicates / unreferenced files do not.
 */
export function isActionableDxfFinding(finding: DxfFileFinding): boolean {
  const f = finding as FindingWithOptionalAction;

  if (f.requiresUserAction === true) return true;
  if (f.requiresUserAction === false) return false;

  if (finding.type === "SAME_IDENTIFIER_DIFFERENT_CONTENT") return true;
  if (finding.type === "INVALID_DXF") return true;

  if (finding.severity === "BLOCKING" || finding.severity === "REVIEW") {
    return true;
  }

  // DUPLICATE_CONTENT / UNREFERENCED_DXF with INFO and no explicit action flag
  return false;
}
