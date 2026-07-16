import type { FinalIntakeMappingRow } from "./schemas";
import { hasBlockingGeometryIssue } from "./compareDocumentDxfGeometry";

/**
 * Local prototype: user picks one email quantity when MULTIPLE_EMAIL_QUANTITY_VALUES.
 */
export function applyEmailQuantityUserResolution(
  row: FinalIntakeMappingRow,
  quantity: number
): FinalIntakeMappingRow {
  const issues = row.issues.filter(
    (i) =>
      i !== "MULTIPLE_EMAIL_QUANTITY_VALUES" &&
      i !== "MISSING_QUANTITY" &&
      i !== "QUANTITY_CONFLICT"
  );
  const otherBlocking =
    issues.some(
      (i) =>
        i.includes("CONFLICT") ||
        i.startsWith("MULTIPLE_") ||
        i.startsWith("MISSING_") ||
        i === "IDENTICAL_REQUEST_ROW_DUPLICATE" ||
        i === "REPEATED_PART_DIFFERENT_QUANTITY"
    ) || hasBlockingGeometryIssue(issues);
  const thickOk =
    typeof row.thicknessMm === "number" &&
    Number.isFinite(row.thicknessMm) &&
    row.thicknessMm > 0;
  const matOk =
    typeof row.material === "string" && row.material.trim().length > 0;
  const qtyOk = Number.isFinite(quantity) && quantity > 0;
  const status =
    row.dxfFileId &&
    qtyOk &&
    thickOk &&
    matOk &&
    !otherBlocking &&
    row.status !== "DXF_IDENTITY_CONFLICT" &&
    row.status !== "DXF_REVISION_CONFLICT" &&
    row.status !== "REQUEST_WITHOUT_DXF" &&
    row.status !== "DXF_NOT_REQUESTED" &&
    row.status !== "EXCLUDED"
      ? ("READY" as const)
      : ("NEEDS_REVIEW" as const);

  return {
    ...row,
    quantity,
    status,
    issues,
    fieldSources: {
      ...row.fieldSources,
      quantity: "USER_RESOLUTION",
    },
    fieldResolutions: {
      ...row.fieldResolutions,
      quantity: {
        value: quantity,
        resolutionStatus: "USER_RESOLUTION",
        candidates: row.fieldResolutions.quantity.candidates,
      },
    },
  };
}
