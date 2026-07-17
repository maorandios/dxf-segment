import { validateReviewSession } from "./validateReviewSession";
import {
  APPROVED_BOM_SCHEMA_VERSION,
  type ApprovedBomV1,
  type IntakeReviewSession,
} from "./types";

/**
 * Create an immutable Approved BOM from a ready review session.
 * Throws if the session is not ready for approval.
 */
export function createApprovedBom(
  session: IntakeReviewSession,
  opts?: { approvedAt?: string }
): ApprovedBomV1 {
  const validation = validateReviewSession(session);
  if (!validation.readyForApproval) {
    throw new Error(
      `Cannot create Approved BOM: ${validation.unresolvedRows.length} unresolved rows, ${validation.blockingIssues.length} blocking issues`
    );
  }

  const approvedAt = opts?.approvedAt ?? new Date().toISOString();
  const active = session.rows.filter((r) => !r.replacedByRowId);
  const included = active.filter((r) => r.status === "READY" && r.includeInQuote);
  const excluded = active.filter((r) => r.status === "EXCLUDED" || !r.includeInQuote);

  const parts = included.map((row) => {
    const qty = row.quantity.currentValue;
    const thk = row.thicknessMm.currentValue;
    const mat = row.material.currentValue;
    const dxfId = row.matchedDxfPartId;
    const geo = row.dxfGeometry;
    const widthMm = geo?.widthMm ?? null;
    const heightMm = geo?.heightMm ?? null;
    const plateAreaMm2 =
      geo?.plateAreaMm2 ??
      (widthMm != null && heightMm != null ? widthMm * heightMm : null);
    if (
      typeof qty !== "number" ||
      typeof thk !== "number" ||
      typeof mat !== "string" ||
      !dxfId ||
      widthMm == null ||
      heightMm == null ||
      plateAreaMm2 == null
    ) {
      throw new Error(`Row ${row.rowId} missing mandatory approved fields`);
    }

    const userResolvedFields: string[] = [];
    if (row.quantity.editedByUser) userResolvedFields.push("quantity");
    if (row.thicknessMm.editedByUser) userResolvedFields.push("thicknessMm");
    if (row.material.editedByUser) userResolvedFields.push("material");

    const cand = row.dxfCandidates.find((c) => c.partId === dxfId);

    return {
      approvedRowId: row.rowId,
      partReference:
        row.displayPartReference ?? row.rawPartReferences[0] ?? dxfId,
      dxfPartId: dxfId,
      dxfFileName: cand?.fileName ?? `${dxfId}.dxf`,
      quantity: qty,
      thicknessMm: thk,
      material: mat.trim(),
      widthMm,
      heightMm,
      plateAreaMm2,
      netContourAreaMm2: geo?.netContourAreaMm2 ?? null,
      sourceOccurrenceIds: [...row.sourceOccurrenceIds],
      userResolvedFields,
    };
  });

  const bom: ApprovedBomV1 = {
    schemaVersion: APPROVED_BOM_SCHEMA_VERSION,
    approvedAt,
    reviewSessionId: session.sessionId,
    analysisRunId: session.analysisRunId ?? null,
    parts,
    excludedRows: excluded.map((r) => ({
      rowId: r.rowId,
      partReference: r.displayPartReference,
      reason: "EXCLUDED_BY_USER",
    })),
    decisions: structuredClone(session.decisions),
    summary: {
      includedPartRows: parts.length,
      excludedPartRows: excluded.length,
      totalQuantity: parts.reduce((s, p) => s + p.quantity, 0),
    },
  };

  // Deep freeze recursively
  return deepFreeze(structuredClone(bom));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  for (const v of Object.values(value as object)) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  }
  return value;
}

/**
 * Mark session as approved and attach a frozen BOM.
 */
export function approveReviewSession(
  session: IntakeReviewSession,
  opts?: { approvedAt?: string }
): IntakeReviewSession {
  const bom = createApprovedBom(session, opts);
  return {
    ...session,
    status: "APPROVED",
    updatedAt: bom.approvedAt,
    approvedBom: bom,
    summary: {
      ...session.summary,
      readyForApproval: true,
      decisionRows: 0,
      blockingIssueCount: 0,
    },
  };
}
