/**
 * Deterministic חלק display-name resolution for the fixed table column.
 */

import { FALLBACK_PART_DISPLAY_NAME } from "./tableContract";
import type { FinalPartDisplayNameSource } from "./types";

export function resolvePartDisplayName(args: {
  sourcePartId: string | null;
  matchedDxfPartId: string | null;
  matchedDxfFilename: string | null;
  sourceProfile: string | null;
}): {
  displayName: string;
  displayNameSource: FinalPartDisplayNameSource;
} {
  const sourcePart =
    args.sourcePartId != null && String(args.sourcePartId).trim() !== ""
      ? String(args.sourcePartId).trim()
      : null;
  if (sourcePart) {
    return { displayName: sourcePart, displayNameSource: "SOURCE_PART_ID" };
  }

  const dxfPart =
    args.matchedDxfPartId != null &&
    String(args.matchedDxfPartId).trim() !== ""
      ? String(args.matchedDxfPartId).trim()
      : null;
  if (dxfPart) {
    return { displayName: dxfPart, displayNameSource: "MATCHED_DXF" };
  }

  const fileBase =
    args.matchedDxfFilename != null &&
    String(args.matchedDxfFilename).trim() !== ""
      ? String(args.matchedDxfFilename).replace(/\.dxf$/i, "").trim()
      : null;
  if (fileBase) {
    return { displayName: fileBase, displayNameSource: "MATCHED_DXF" };
  }

  const profile =
    args.sourceProfile != null && String(args.sourceProfile).trim() !== ""
      ? String(args.sourceProfile).trim()
      : null;
  if (profile) {
    return { displayName: profile, displayNameSource: "SOURCE_PROFILE" };
  }

  return {
    displayName: FALLBACK_PART_DISPLAY_NAME,
    displayNameSource: "FALLBACK",
  };
}
