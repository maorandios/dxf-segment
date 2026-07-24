/**
 * Deterministic issue-code derivation for final review rows.
 */

import {
  comparePlateDimensions,
  type PlateDimensionComparison,
} from "../dxfLink/dimensionMismatch";
import type { SimpleDxfPart, SimpleResultRow, SimpleUnmatchedReason } from "../types";
import type { FinalIssueCode } from "./types";

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
  heuristicMatchUnconfirmed?: boolean;
  dxfFilesUploaded: boolean;
  /** When provided, reuse; otherwise computed from source/DXF dims. */
  dimensionComparison?: PlateDimensionComparison | null;
}): FinalIssueCode[] {
  const codes: FinalIssueCode[] = [];
  const { row } = args;

  if (row.excluded) return codes;

  if (args.manualMatchUnconfirmed && row.match.matchedDxfId) {
    codes.push("MANUAL_MATCH_NOT_CONFIRMED");
  }

  if (args.heuristicMatchUnconfirmed && row.match.matchedDxfId) {
    codes.push("HEURISTIC_MATCH_UNCONFIRMED");
  }

  if (row.match.status === "AMBIGUOUS") {
    codes.push("MULTIPLE_DXF_CANDIDATES");
  }

  if (row.match.status === "INVALID_DXF") {
    codes.push("DXF_INVALID");
  }

  if (row.match.status === "UNMATCHED") {
    if (
      row.match.method === "EXPLICIT_FILENAME" ||
      (typeof row.match.message === "string" &&
        row.match.message.startsWith("MISSING_EXPLICIT_DXF"))
    ) {
      codes.push("EXPLICIT_DXF_FILE_MISSING");
    } else if (
      args.unmatchedReason === "CANDIDATES_ASSIGNED_TO_BETTER_ROWS"
    ) {
      codes.push("DXF_ASSIGNED_TO_BETTER_ROW");
    } else {
      codes.push("NO_DXF_FOUND");
    }
  }

  if (
    row.match.status === "MATCHED" &&
    args.dxf &&
    args.dxf.geometryStatus === "VALID"
  ) {
    const comparison =
      args.dimensionComparison !== undefined
        ? args.dimensionComparison
        : comparePlateDimensions(
            {
              widthMm: args.sourceWidthMm,
              lengthMm: args.sourceLengthMm,
            },
            {
              widthMm: args.dxf.widthMm,
              lengthMm: args.dxf.lengthMm,
            }
          );
    if (comparison?.hasSignificantMismatch) {
      codes.push("PART_ID_DIMENSION_MISMATCH");
    }
  }

  // Duplicate DXF usage is diagnostics-only for the normal user (not a primary category).
  void args.duplicateDxf;

  if (!(args.quantity != null && args.quantity > 0)) {
    codes.push("MISSING_QUANTITY");
  }
  if (!(args.material != null && String(args.material).trim() !== "")) {
    codes.push("MISSING_MATERIAL");
  }
  if (!(args.thicknessMm != null && args.thicknessMm > 0)) {
    codes.push("MISSING_THICKNESS");
  }

  const hasSourceDims =
    args.sourceWidthMm != null &&
    args.sourceLengthMm != null &&
    args.sourceWidthMm > 0 &&
    args.sourceLengthMm > 0;
  const hasUsableMatchedDxfDims =
    row.match.status === "MATCHED" &&
    args.dxf != null &&
    args.dxf.geometryStatus === "VALID" &&
    args.dxf.widthMm != null &&
    args.dxf.lengthMm != null &&
    args.dxf.widthMm > 0 &&
    args.dxf.lengthMm > 0;
  if (!hasSourceDims && !hasUsableMatchedDxfDims) {
    codes.push("MISSING_REQUIRED_DIMENSIONS");
  }

  return codes;
}
