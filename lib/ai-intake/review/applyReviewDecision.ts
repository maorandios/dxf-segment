import { refreshReviewSessionDerived } from "./buildReviewSession";
import {
  buildReviewSummary,
  computeRowStatus,
} from "./validateReviewSession";
import type {
  IntakeReviewSession,
  ReviewDecisionEvent,
  ReviewDecisionReason,
  ReviewPartRow,
  ReviewResolutionAction,
} from "./types";
import {
  normalizeStringInput,
  numericValuesEqual,
  parseNumericInput,
  stringValuesEqual,
} from "./valueEquality";

let decisionSeq = 0;

export function resetDecisionIdCounterForTests(): void {
  decisionSeq = 0;
}

function nextDecisionId(): string {
  decisionSeq += 1;
  return `dec:${decisionSeq}:${Date.now().toString(36)}`;
}

function cloneSession(session: IntakeReviewSession): IntakeReviewSession {
  return structuredClone(session);
}

function findRow(
  rows: ReviewPartRow[],
  rowId: string
): ReviewPartRow | undefined {
  return rows.find((r) => r.rowId === rowId && !r.replacedByRowId);
}

function pushDecision(
  session: IntakeReviewSession,
  partial: Omit<ReviewDecisionEvent, "decisionId" | "createdAt"> & {
    createdAt?: string;
  }
): ReviewDecisionEvent {
  const ev: ReviewDecisionEvent = {
    decisionId: nextDecisionId(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
    actionType: partial.actionType,
    actionId: partial.actionId ?? null,
    affectedRowIds: [...partial.affectedRowIds],
    affectedField: partial.affectedField ?? null,
    previousValue: partial.previousValue,
    newValue: partial.newValue,
    reason: partial.reason,
    sourceIssueId: partial.sourceIssueId ?? null,
  };
  session.decisions = [...session.decisions, ev];
  return ev;
}

function currentFieldValue(
  row: ReviewPartRow,
  field: "quantity" | "thicknessMm" | "material"
): number | string | null {
  if (field === "material") return row.material.currentValue;
  if (field === "quantity") return row.quantity.currentValue;
  return row.thicknessMm.currentValue;
}

/** True when normalized input equals the row's current value. */
export function isFieldEditNoOp(
  row: ReviewPartRow,
  field: "quantity" | "thicknessMm" | "material",
  value: number | string
): boolean {
  const current = currentFieldValue(row, field);
  if (field === "material") {
    return stringValuesEqual(
      typeof current === "string" ? current : null,
      value
    );
  }
  return numericValuesEqual(
    typeof current === "number" ? current : null,
    value
  );
}

function canonicalizeFieldValue(
  field: "quantity" | "thicknessMm" | "material",
  value: number | string
): number | string {
  if (field === "material") {
    const s = normalizeStringInput(value);
    if (s == null) throw new Error("Material must be a non-empty string");
    return s;
  }
  const n = parseNumericInput(value);
  if (n == null || !(n > 0)) {
    throw new Error(
      field === "quantity"
        ? "Quantity must be a positive number"
        : "Thickness must be a positive number"
    );
  }
  return n;
}

function setFieldValue(
  row: ReviewPartRow,
  field: "quantity" | "thicknessMm" | "material",
  value: number | string
): unknown {
  const canonical = canonicalizeFieldValue(field, value);
  const prev = currentFieldValue(row, field);

  if (field === "quantity" && typeof canonical === "number") {
    row.quantity = {
      ...row.quantity,
      currentValue: canonical,
      // proposedValue is immutable after buildReviewSession
      state: "USER_RESOLVED",
      editedByUser: true,
      sourceRefs: [
        ...row.quantity.sourceRefs,
        { sourceType: "USER", originalValue: canonical },
      ],
    };
  } else if (field === "thicknessMm" && typeof canonical === "number") {
    row.thicknessMm = {
      ...row.thicknessMm,
      currentValue: canonical,
      state: "USER_RESOLVED",
      editedByUser: true,
      sourceRefs: [
        ...row.thicknessMm.sourceRefs,
        { sourceType: "USER", originalValue: canonical },
      ],
    };
  } else if (field === "material" && typeof canonical === "string") {
    row.material = {
      ...row.material,
      currentValue: canonical,
      state: "USER_RESOLVED",
      editedByUser: true,
      sourceRefs: [
        ...row.material.sourceRefs,
        { sourceType: "USER", originalValue: canonical },
      ],
    };
  }
  return prev;
}

function keepSeparateGroupsFromDecisions(
  decisions: ReviewDecisionEvent[]
): string[][] {
  return decisions
    .filter((d) => d.actionType === "KEEP_SEPARATE_ROWS")
    .map((d) => [...d.affectedRowIds]);
}

function applyKeepSeparateResolution(
  session: IntakeReviewSession
): IntakeReviewSession {
  const keepGroups = keepSeparateGroupsFromDecisions(session.decisions);
  if (keepGroups.length === 0) return session;

  const issues = session.issues.map((issue) => {
    if (issue.code !== "DUPLICATE_SOURCE_OCCURRENCE" || issue.resolved) {
      return issue;
    }
    const covered = keepGroups.some(
      (g) =>
        g.length === issue.rowIds.length &&
        g.every((id) => issue.rowIds.includes(id))
    );
    if (!covered) return issue;
    return {
      ...issue,
      resolved: true,
      resolvedByDecisionId:
        session.decisions[session.decisions.length - 1]?.decisionId ?? null,
    };
  });

  const resolvedIds = new Set(
    issues.filter((i) => i.resolved).map((i) => i.issueId)
  );
  const actions = session.actions.filter((a) => !resolvedIds.has(a.issueId));
  const rows = session.rows.map((row) => {
    if (!row.includeInQuote || row.replacedByRowId) {
      return { ...row, status: "EXCLUDED" as const };
    }
    const hasBlocking = issues.some(
      (i) =>
        !i.resolved &&
        i.severity === "BLOCKING" &&
        i.rowIds.includes(row.rowId)
    );
    if (hasBlocking) return { ...row, status: "NEEDS_DECISION" as const };
    return { ...row, status: computeRowStatus(row) };
  });
  const summary = buildReviewSummary(rows, issues);
  return {
    ...session,
    rows,
    issues,
    actions,
    summary,
    status: summary.readyForApproval
      ? "READY_FOR_APPROVAL"
      : "REVIEW_REQUIRED",
  };
}

export type ApplyReviewDecisionInput =
  | {
      kind: "ACTION";
      action: ReviewResolutionAction;
      reason?: ReviewDecisionReason;
      createdAt?: string;
    }
  | {
      kind: "MANUAL_EDIT";
      rowId: string;
      field: "quantity" | "thicknessMm" | "material";
      value: number | string;
      reason?: ReviewDecisionReason;
      createdAt?: string;
    }
  | {
      kind: "SET_INCLUDE";
      rowId: string;
      includeInQuote: boolean;
      createdAt?: string;
    }
  | {
      kind: "BULK_SET_FIELD";
      rowIds: string[];
      field: "quantity" | "thicknessMm" | "material";
      value: number | string;
      createdAt?: string;
    };

/**
 * Apply a user decision. Returns a new session; never mutates the input.
 */
export function applyReviewDecision(
  session: IntakeReviewSession,
  input: ApplyReviewDecisionInput
): IntakeReviewSession {
  if (session.status === "APPROVED") {
    throw new Error("Cannot modify an approved review session");
  }

  const next = cloneSession(session);

  if (input.kind === "MANUAL_EDIT") {
    const existing = findRow(session.rows, input.rowId);
    if (!existing) throw new Error(`Unknown row ${input.rowId}`);
    // Validate / canonicalize first so invalid input still throws.
    const canonical = canonicalizeFieldValue(input.field, input.value);
    if (isFieldEditNoOp(existing, input.field, canonical)) {
      return session;
    }
    const row = findRow(next.rows, input.rowId)!;
    const prev = setFieldValue(row, input.field, canonical);
    pushDecision(next, {
      actionType: "SET_FIELD_VALUE",
      affectedRowIds: [input.rowId],
      affectedField: input.field,
      previousValue: prev,
      newValue: canonical,
      reason: input.reason ?? "USER_MANUAL_EDIT",
      createdAt: input.createdAt,
    });
    return applyKeepSeparateResolution(
      refreshReviewSessionDerived(next, input.createdAt)
    );
  }

  if (input.kind === "SET_INCLUDE") {
    const existing = findRow(session.rows, input.rowId);
    if (!existing) throw new Error(`Unknown row ${input.rowId}`);
    if (existing.includeInQuote === input.includeInQuote) {
      return session;
    }
    const row = findRow(next.rows, input.rowId)!;
    const prev = row.includeInQuote;
    row.includeInQuote = input.includeInQuote;
    pushDecision(next, {
      actionType: input.includeInQuote ? "INCLUDE_ROW" : "EXCLUDE_ROW",
      affectedRowIds: [input.rowId],
      previousValue: prev,
      newValue: input.includeInQuote,
      reason: "USER_EXCLUDED_ROW",
      createdAt: input.createdAt,
    });
    return applyKeepSeparateResolution(
      refreshReviewSessionDerived(next, input.createdAt)
    );
  }

  if (input.kind === "BULK_SET_FIELD") {
    const canonical = canonicalizeFieldValue(input.field, input.value);
    const changedIds: string[] = [];
    const prevMap: Record<string, unknown> = {};
    for (const rowId of input.rowIds) {
      const existing = findRow(session.rows, rowId);
      if (!existing) continue;
      if (isFieldEditNoOp(existing, input.field, canonical)) continue;
      const row = findRow(next.rows, rowId);
      if (!row) continue;
      prevMap[rowId] = setFieldValue(row, input.field, canonical);
      changedIds.push(rowId);
    }
    if (changedIds.length === 0) {
      return session;
    }
    pushDecision(next, {
      actionType: "SET_FIELD_VALUE",
      affectedRowIds: changedIds,
      affectedField: input.field,
      previousValue: prevMap,
      newValue: canonical,
      reason: "USER_BULK_ACTION",
      createdAt: input.createdAt,
    });
    return applyKeepSeparateResolution(
      refreshReviewSessionDerived(next, input.createdAt)
    );
  }

  const action = input.action;
  const reason = input.reason ?? "USER_SELECTED_SUGGESTION";

  switch (action.type) {
    case "SET_FIELD_VALUE": {
      const rowId = String(action.payload.rowId);
      const field = String(action.payload.field) as
        | "quantity"
        | "thicknessMm"
        | "material";
      const canonical = canonicalizeFieldValue(
        field,
        action.payload.value as number | string
      );
      const existing = findRow(session.rows, rowId);
      if (!existing) throw new Error(`Unknown row ${rowId}`);
      const fieldState = existing[field].state;
      const needsExplicitConfirm =
        fieldState === "AMBIGUOUS" ||
        fieldState === "MISSING" ||
        fieldState === "CONFLICT" ||
        fieldState === "INFERRED";
      if (
        isFieldEditNoOp(existing, field, canonical) &&
        !needsExplicitConfirm
      ) {
        return session;
      }
      const row = findRow(next.rows, rowId)!;
      const prev = setFieldValue(row, field, canonical);
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [rowId],
        affectedField: field,
        previousValue: prev,
        newValue: canonical,
        reason,
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "FOCUS_FIELD_EDITOR": {
      // UI-only — never creates a decision event.
      return session;
    }
    case "SELECT_DXF_MATCH": {
      const rowId = String(action.payload.rowId);
      const partId = String(action.payload.partId);
      const row = findRow(next.rows, rowId);
      if (!row) throw new Error(`Unknown row ${rowId}`);
      const prev = row.matchedDxfPartId;
      row.matchedDxfPartId = partId;
      row.dxfMatchStatus = "MATCHED";
      row.displayPartReference = row.displayPartReference ?? partId;
      if (!row.dxfGeometry) {
        row.dxfGeometry = {
          widthMm: null,
          heightMm: null,
          plateAreaMm2: null,
          netContourAreaMm2: null,
        };
      }
      if (typeof action.payload.widthMm === "number") {
        row.dxfGeometry.widthMm = action.payload.widthMm as number;
      }
      if (typeof action.payload.heightMm === "number") {
        row.dxfGeometry.heightMm = action.payload.heightMm as number;
      }
      if (typeof action.payload.plateAreaMm2 === "number") {
        row.dxfGeometry.plateAreaMm2 = action.payload.plateAreaMm2 as number;
      }
      if (typeof action.payload.netContourAreaMm2 === "number") {
        row.dxfGeometry.netContourAreaMm2 = action.payload
          .netContourAreaMm2 as number;
      }
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [rowId],
        previousValue: prev,
        newValue: partId,
        reason: "USER_SELECTED_DXF",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "USE_DXF_GEOMETRY": {
      const rowId = String(action.payload.rowId);
      const row = findRow(next.rows, rowId);
      if (!row) throw new Error(`Unknown row ${rowId}`);
      row.dxfGeometryAcknowledged = true;
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [rowId],
        previousValue: false,
        newValue: true,
        reason: "USER_ACKNOWLEDGED",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "EXCLUDE_ROW": {
      const rowId = String(action.payload.rowId);
      const row = findRow(next.rows, rowId);
      if (!row) throw new Error(`Unknown row ${rowId}`);
      row.includeInQuote = false;
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [rowId],
        previousValue: true,
        newValue: false,
        reason: "USER_EXCLUDED_ROW",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "INCLUDE_ROW": {
      const rowId = String(action.payload.rowId);
      const row = findRow(next.rows, rowId);
      if (!row) throw new Error(`Unknown row ${rowId}`);
      row.includeInQuote = true;
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [rowId],
        previousValue: false,
        newValue: true,
        reason: "USER_SELECTED_SUGGESTION",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "KEEP_SEPARATE_ROWS": {
      const rowIds =
        (action.payload.rowIds as string[]) ?? action.appliesToRowIds;
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: rowIds,
        newValue: "KEEP_SEPARATE",
        reason,
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "REMOVE_DUPLICATE_ROW": {
      const rowId = String(action.payload.rowId);
      const row = findRow(next.rows, rowId);
      if (!row) throw new Error(`Unknown row ${rowId}`);
      row.includeInQuote = false;
      row.status = "EXCLUDED";
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [rowId],
        previousValue: true,
        newValue: false,
        reason: "USER_EXCLUDED_ROW",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "MERGE_DUPLICATE_ROWS": {
      const rowIds =
        (action.payload.rowIds as string[]) ?? action.appliesToRowIds;
      const primaryId = String(action.payload.primaryRowId ?? rowIds[0] ?? "");
      const primary = findRow(next.rows, primaryId);
      if (!primary) throw new Error("Primary merge row missing");
      const others = rowIds
        .filter((id) => id !== primaryId)
        .map((id) => findRow(next.rows, id))
        .filter((r): r is ReviewPartRow => Boolean(r));

      const thicknesses = new Set(
        [primary, ...others]
          .map((r) => r.thicknessMm.currentValue)
          .filter((v) => v != null)
      );
      const materials = new Set(
        [primary, ...others]
          .map((r) => (r.material.currentValue ?? "").trim().toLowerCase())
          .filter(Boolean)
      );
      if (thicknesses.size > 1 || materials.size > 1) {
        throw new Error("Cannot merge rows with incompatible thickness/material");
      }

      const sumQty = [primary, ...others].reduce(
        (s, r) => s + (r.quantity.currentValue ?? 0),
        0
      );
      const mergedId = `rev:merged:${primaryId}`;
      const nonUserQtyRefs = [primary, ...others].flatMap((r) =>
        r.quantity.sourceRefs.filter((ref) => ref.sourceType !== "USER")
      );
      const mergedCandidates = [primary, ...others].flatMap(
        (r) => r.quantity.candidates
      );
      const merged: ReviewPartRow = {
        ...structuredClone(primary),
        rowId: mergedId,
        sourceOccurrenceIds: [primary, ...others].flatMap(
          (r) => r.sourceOccurrenceIds
        ),
        quantity: {
          ...structuredClone(primary.quantity),
          // Keep the primary occurrence's original system proposal.
          proposedValue: primary.quantity.proposedValue,
          currentValue: sumQty,
          state: "USER_RESOLVED",
          editedByUser: true,
          candidates: mergedCandidates,
          sourceRefs: [
            ...nonUserQtyRefs,
            {
              sourceType: "USER",
              originalValue: sumQty,
              excerpt: "Merged quantities from duplicate occurrences",
            },
          ],
        },
        displayOrder: primary.displayOrder,
        replacedByRowId: null,
        issueIds: [],
      };
      merged.status = computeRowStatus(merged);
      for (const r of [primary, ...others]) {
        r.replacedByRowId = mergedId;
        r.includeInQuote = false;
        r.status = "EXCLUDED";
      }
      next.rows.push(merged);
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: [...rowIds, mergedId],
        previousValue: rowIds,
        newValue: { mergedRowId: mergedId, quantity: sumQty },
        reason: "USER_MERGED_ROWS",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "CONFIRM_SUGGESTED_UNIT":
    case "SET_COLUMN_UNIT": {
      const rowIds =
        (action.payload.rowIds as string[]) ?? action.appliesToRowIds;
      const field = String(action.payload.field ?? "thicknessMm");
      if (field === "thicknessMm" && typeof action.payload.value === "number") {
        for (const id of rowIds) {
          const row = findRow(next.rows, id);
          if (!row) continue;
          setFieldValue(row, "thicknessMm", action.payload.value as number);
        }
      }
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: rowIds,
        affectedField: field,
        newValue: action.payload,
        reason: "USER_BULK_ACTION",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    case "ACKNOWLEDGE_WARNING": {
      pushDecision(next, {
        actionType: action.type,
        actionId: action.actionId,
        affectedRowIds: action.appliesToRowIds,
        reason: "USER_ACKNOWLEDGED",
        sourceIssueId: action.issueId,
        createdAt: input.createdAt,
      });
      break;
    }
    default:
      throw new Error(`Unsupported action type: ${(action as { type: string }).type}`);
  }

  return applyKeepSeparateResolution(
    refreshReviewSessionDerived(next, input.createdAt)
  );
}
