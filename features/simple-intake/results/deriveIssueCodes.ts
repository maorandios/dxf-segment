/**
 * Deterministic issue-code derivation for final review rows.
 */

import { GEOMETRY_TOLERANCE } from "../types";
import type { SimpleDxfPart, SimpleResultRow, SimpleUnmatchedReason } from "../types";
import type { FinalIssueCode } from "./types";

function withinTol(a: number, b: number): boolean {
  const tol = Math.max(
    GEOMETRY_TOLERANCE.absoluteMm,
    Math.abs(b) * GEOMETRY_TOLERANCE.relative
  );
  return Math.abs(a - b) <= tol;
}

function dimsMismatch(
  sourceW: number | null,
  sourceL: number | null,
  dxfW: number | null,
  dxfL: number | null
): boolean {
  if (
    sourceW == null ||
    sourceL == null ||
    dxfW == null ||
    dxfL == null ||
    !(sourceW > 0) ||
    !(sourceL > 0) ||
    !(dxfW > 0) ||
    !(dxfL > 0)
  ) {
    return false;
  }
  const direct = withinTol(sourceW, dxfW) && withinTol(sourceL, dxfL);
  const rotated = withinTol(sourceW, dxfL) && withinTol(sourceL, dxfW);
  return !direct && !rotated;
}

export function deriveIssueCodes(args: {
  row: SimpleResultRow;
  dxf: SimpleDxfPart | null;
  material: string | null;
  thicknessMm: number | null;
  quantity: number | null;
  sourceWidthMm: number | null;
  sourceLengthMm: number | null;
  unmatchedReason: SimpleUnmatchedReason | null;
  duplicateDxf: boolean;
  manualMatchUnconfirmed: boolean;
  dxfFilesUploaded: boolean;
}): FinalIssueCode[] {
  const codes: FinalIssueCode[] = [];
  const { row } = args;

  if (row.excluded) return codes;

  if (args.manualMatchUnconfirmed && row.match.matchedDxfId) {
    codes.push("MANUAL_MATCH_NOT_CONFIRMED");
  }

  if (row.match.status === "AMBIGUOUS") {
    codes.push("MULTIPLE_DXF_CANDIDATES");
  }

  if (row.match.status === "INVALID_DXF") {
    codes.push("DXF_INVALID");
  }

  if (row.match.status === "UNMATCHED") {
    if (args.unmatchedReason === "CANDIDATES_ASSIGNED_TO_BETTER_ROWS") {
      codes.push("DXF_ASSIGNED_TO_BETTER_ROW");
    } else {
      codes.push("NO_DXF_FOUND");
    }
  }

  if (
    row.match.status === "MATCHED" &&
    row.match.method === "EXACT_ID" &&
    args.dxf &&
    dimsMismatch(
      args.sourceWidthMm,
      args.sourceLengthMm,
      args.dxf.widthMm,
      args.dxf.lengthMm
    )
  ) {
    codes.push("PART_ID_DIMENSION_MISMATCH");
  }

  if (args.duplicateDxf && row.match.matchedDxfId) {
    codes.push("DUPLICATE_DXF_USAGE");
  }

  if (!(args.quantity != null && args.quantity > 0)) {
    codes.push("MISSING_QUANTITY");
  }
  if (!(args.material != null && String(args.material).trim() !== "")) {
    codes.push("MISSING_MATERIAL");
  }
  if (!(args.thicknessMm != null && args.thicknessMm > 0)) {
    codes.push("MISSING_THICKNESS");
  }

  return codes;
}
