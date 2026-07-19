import { formatIssueCopy } from "./userFacingIssueMessages";
import type {
  ReviewIssue,
  ReviewIssueCode,
  ReviewPartRow,
  ReviewResolutionAction,
  ReviewSourceReference,
} from "./types";

let issueSeq = 0;
let actionSeq = 0;

export function resetReviewIdCountersForTests(): void {
  issueSeq = 0;
  actionSeq = 0;
}

function nextIssueId(code: string): string {
  issueSeq += 1;
  return `iss:${code}:${issueSeq}`;
}

function nextActionId(type: string): string {
  actionSeq += 1;
  return `act:${type}:${actionSeq}`;
}

function partLabel(row: ReviewPartRow): string {
  return (
    row.displayPartReference ??
    row.matchedDxfPartId ??
    row.rawPartReferences[0] ??
    ""
  );
}

export function makeIssue(args: {
  code: ReviewIssueCode;
  rowIds: string[];
  field?: string | null;
  severity: ReviewIssue["severity"];
  scope?: ReviewIssue["scope"];
  detail?: string;
  fieldLabel?: string;
  sourceRefs?: ReviewSourceReference[];
  partLabelOverride?: string;
}): ReviewIssue {
  const label =
    args.partLabelOverride ??
    (args.rowIds[0] ? args.rowIds[0] : "");
  const copy = formatIssueCopy(args.code, {
    partLabel: label,
    fieldLabel: args.fieldLabel,
    detail: args.detail,
  });
  return {
    issueId: nextIssueId(args.code),
    scope: args.scope ?? (args.field ? "FIELD" : "ROW"),
    rowIds: [...args.rowIds],
    field: args.field ?? null,
    code: args.code,
    severity: args.severity,
    title: copy.title,
    message: copy.message,
    suggestedActionIds: [],
    sourceRefs: args.sourceRefs ?? [],
    resolved: false,
    resolvedByDecisionId: null,
  };
}

export function buildIssuesForRows(args: {
  rows: ReviewPartRow[];
  massInterpretations?: unknown[] | null;
}): { issues: ReviewIssue[]; actions: ReviewResolutionAction[] } {
  const issues: ReviewIssue[] = [];
  const actions: ReviewResolutionAction[] = [];
  const active = args.rows.filter((r) => !r.replacedByRowId);

  // Duplicate groups by genuine identity only — never profile/descriptor alone.
  // Prefer: confirmed matched DXF → explicit raw part identifier → occurrence rowId.
  const byPart = new Map<string, ReviewPartRow[]>();
  for (const row of active) {
    if (!row.includeInQuote) continue;
    const explicitId =
      row.dxfMatchDiagnostics?.sourceRawId?.trim() ||
      ((row.rawPartReferences ?? []).find((r) => r.trim().length > 0) ?? "");
    // Display labels / profiles are not unique part identities.
    const key = row.matchedDxfPartId
      ? `dxf:${row.matchedDxfPartId}`
      : explicitId
        ? `id:${explicitId}`
        : `occ:${row.rowId}`;
    const list = byPart.get(key) ?? [];
    list.push(row);
    byPart.set(key, list);
  }

  for (const [, group] of byPart) {
    if (group.length < 2) continue;
    const identical = group.every(
      (r) =>
        r.quantity.currentValue === group[0]!.quantity.currentValue &&
        r.thicknessMm.currentValue === group[0]!.thicknessMm.currentValue &&
        (r.material.currentValue ?? "").trim().toLowerCase() ===
          (group[0]!.material.currentValue ?? "").trim().toLowerCase()
    );
    const label = partLabel(group[0]!);
    const issue = makeIssue({
      code: "DUPLICATE_SOURCE_OCCURRENCE",
      rowIds: group.map((r) => r.rowId),
      severity: "BLOCKING",
      scope: "REQUEST",
      partLabelOverride: label,
      detail: identical
        ? `${label} מופיע בשתי שורות עם אותם נתונים.`
        : `${label} מופיע בכמה שורות.`,
    });
    issues.push(issue);

    const keep = makeAction({
      issueId: issue.issueId,
      type: "KEEP_SEPARATE_ROWS",
      label: "השאר כשתי שורות",
      recommended: true,
      appliesToRowIds: group.map((r) => r.rowId),
      payload: { rowIds: group.map((r) => r.rowId) },
    });
    actions.push(keep);
    issue.suggestedActionIds.push(keep.actionId);

    const thicknesses = new Set(
      group.map((r) => r.thicknessMm.currentValue).filter((v) => v != null)
    );
    const materials = new Set(
      group
        .map((r) => (r.material.currentValue ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    const compatible =
      thicknesses.size <= 1 &&
      materials.size <= 1 &&
      group.every(
        (r) =>
          typeof r.quantity.currentValue === "number" &&
          r.quantity.currentValue > 0
      );

    if (compatible) {
      const merge = makeAction({
        issueId: issue.issueId,
        type: "MERGE_DUPLICATE_ROWS",
        label: "מזג כמויות",
        recommended: false,
        appliesToRowIds: group.map((r) => r.rowId),
        payload: {
          rowIds: group.map((r) => r.rowId),
          primaryRowId: group[0]!.rowId,
        },
      });
      actions.push(merge);
      issue.suggestedActionIds.push(merge.actionId);
    }

    for (const row of group.slice(1)) {
      const remove = makeAction({
        issueId: issue.issueId,
        type: "REMOVE_DUPLICATE_ROW",
        label: `הסר שורה כפולה (${row.displayPartReference ?? row.rowId})`,
        recommended: false,
        appliesToRowIds: [row.rowId],
        payload: { rowId: row.rowId, keepRowId: group[0]!.rowId },
      });
      actions.push(remove);
      issue.suggestedActionIds.push(remove.actionId);
    }
  }

  for (const row of active) {
    const label = partLabel(row);
    if (!row.includeInQuote) continue;

    // DXF identity / geometry match (canonical contract)
    if (row.dxfMatchStatus === "AMBIGUOUS") {
      const isGeometryAmbiguity =
        row.dxfMatch?.reason === "AMBIGUOUS_GEOMETRY_MATCH" ||
        row.dxfMatchDiagnostics?.finalReason === "AMBIGUOUS_GEOMETRY_MATCH" ||
        row.dxfCandidates.some(
          (c) => c.reason === "AMBIGUOUS_GEOMETRY_MATCH"
        );
      const issue = makeIssue({
        code: isGeometryAmbiguity
          ? "AMBIGUOUS_DXF_MATCH"
          : "AMBIGUOUS_DXF_IDENTITY",
        rowIds: [row.rowId],
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const cand of row.dxfCandidates) {
        const act = makeAction({
          issueId: issue.issueId,
          type: "SELECT_DXF_MATCH",
          label: `בחר DXF · ${cand.partId}`,
          recommended: false,
          appliesToRowIds: [row.rowId],
          payload: {
            rowId: row.rowId,
            partId: cand.partId,
            fileName: cand.fileName,
            registryEntryId: cand.registryEntryId ?? null,
            ambiguityGroupId:
              (row.dxfMatch as { ambiguityGroupId?: string | null })
                ?.ambiguityGroupId ?? null,
            decisionType: "SELECT_DXF_CANDIDATE",
            score: cand.score,
          },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
    } else if (
      row.dxfMatchStatus === "UNMATCHED" ||
      row.matchedDxfPartId == null
    ) {
      const noId =
        row.dxfMatchDiagnostics?.sourceRawId == null &&
        (row.dxfMatchDiagnostics?.finalReason === "UNMATCHED_NO_IDENTIFIER" ||
          row.dxfMatchDiagnostics?.finalReason ===
            "UNMATCHED_INSUFFICIENT_GEOMETRY" ||
          row.dxfMatchDiagnostics?.finalReason ===
            "UNMATCHED_GEOMETRY_MISMATCH" ||
          (row.rawPartReferences ?? []).every((r) => !r.trim()));
      const issue = makeIssue({
        code: "MISSING_DXF_MATCH",
        rowIds: [row.rowId],
        severity: "BLOCKING",
        partLabelOverride: label,
        detail: noId
          ? row.dxfMatchDiagnostics?.finalReason ?? "UNMATCHED_NO_IDENTIFIER"
          : undefined,
      });
      // Override Hebrew for no-ID cases so we don't say "identical identifier"
      if (noId) {
        issue.title = "לא נמצא DXF מתאים";
        issue.message =
          row.dxfMatchDiagnostics?.finalReason ===
          "UNMATCHED_INSUFFICIENT_GEOMETRY"
            ? "אין מספיק מידות מקור להתאמת DXF."
            : row.dxfMatchDiagnostics?.finalReason ===
                "UNMATCHED_GEOMETRY_MISMATCH"
              ? "מידות המקור אינן תואמות לאף קובץ DXF זמין."
              : "לא נמצא קובץ DXF תואם למידות החלק.";
      }
      issues.push(issue);
      const suggestions = row.dxfSuggestions ?? [];
      for (const sug of suggestions.slice(0, 8)) {
        const act = makeAction({
          issueId: issue.issueId,
          type: "SELECT_DXF_MATCH",
          label: `קבצים דומים · ${sug.partId}`,
          recommended: suggestions.length === 1,
          appliesToRowIds: [row.rowId],
          payload: {
            rowId: row.rowId,
            partId: sug.partId,
            fileName: sug.fileName,
            registryEntryId: sug.registryEntryId ?? null,
          },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
      const excl = makeAction({
        issueId: issue.issueId,
        type: "EXCLUDE_ROW",
        label: "אל תכלול בהצעה",
        recommended: false,
        appliesToRowIds: [row.rowId],
        payload: { rowId: row.rowId },
      });
      actions.push(excl);
      issue.suggestedActionIds.push(excl.actionId);
    } else if (
      row.dxfMatchStatus === "MATCHED" &&
      (row.dxfMatch?.geometryStatus === "INVALID" ||
        row.dxfMatch?.geometryStatus === "EMPTY" ||
        row.dxfGeometry == null ||
        row.dxfGeometry.widthMm == null ||
        row.dxfGeometry.heightMm == null)
    ) {
      const issue = makeIssue({
        code: "DXF_GEOMETRY_INVALID",
        rowIds: [row.rowId],
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      pushExclude(actions, issue, row.rowId);
    }

    // Optional measurement unit ambiguity (non-blocking for Approved BOM).
    // Mass columns are grouped later — avoid per-row spam.
    if (row.documentEvidence?.area?.status === "AMBIGUOUS") {
      const issue = makeIssue({
        code: "OPTIONAL_MEASUREMENT_UNIT_AMBIGUOUS",
        rowIds: [row.rowId],
        field: "area",
        severity: "WARNING",
        partLabelOverride: label,
        fieldLabel: "area",
      });
      issues.push(issue);
    }

    // Quantity — genuine missing only (proposedValue present means value was extracted)
    if (
      row.quantity.state === "MISSING" &&
      row.quantity.proposedValue == null &&
      row.quantity.currentValue == null
    ) {
      const issue = makeIssue({
        code: "MISSING_QUANTITY",
        rowIds: [row.rowId],
        field: "quantity",
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const c of row.quantity.candidates) {
        if (typeof c.value !== "number" || !(c.value > 0)) continue;
        const act = makeAction({
          issueId: issue.issueId,
          type: "SET_FIELD_VALUE",
          label: `אשר ${c.value}`,
          recommended: true,
          appliesToRowIds: [row.rowId],
          payload: { rowId: row.rowId, field: "quantity", value: c.value },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
      pushExclude(actions, issue, row.rowId);
    } else if (
      row.quantity.state === "CONFLICT" ||
      (typeof row.quantity.currentValue === "number" &&
        !(row.quantity.currentValue > 0))
    ) {
      const code =
        typeof row.quantity.currentValue === "number" &&
        !(row.quantity.currentValue > 0)
          ? "INVALID_QUANTITY"
          : "QUANTITY_CONFLICT";
      const issue = makeIssue({
        code,
        rowIds: [row.rowId],
        field: "quantity",
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const c of row.quantity.candidates) {
        if (typeof c.value !== "number" || !(c.value > 0)) continue;
        const act = makeAction({
          issueId: issue.issueId,
          type: "SET_FIELD_VALUE",
          label: `בחר ${c.value} (${c.sourceLabel})`,
          recommended: false,
          appliesToRowIds: [row.rowId],
          payload: { rowId: row.rowId, field: "quantity", value: c.value },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
    }

    // Thickness — genuine missing only
    if (
      row.thicknessMm.state === "MISSING" &&
      row.thicknessMm.proposedValue == null &&
      row.thicknessMm.currentValue == null
    ) {
      const issue = makeIssue({
        code: "MISSING_THICKNESS",
        rowIds: [row.rowId],
        field: "thicknessMm",
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const c of row.thicknessMm.candidates) {
        if (typeof c.value !== "number" || !(c.value > 0)) continue;
        const act = makeAction({
          issueId: issue.issueId,
          type: "SET_FIELD_VALUE",
          label: `אשר ${c.value} מ״מ`,
          recommended: true,
          appliesToRowIds: [row.rowId],
          payload: {
            rowId: row.rowId,
            field: "thicknessMm",
            value: c.value,
          },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
      const focus = makeAction({
        issueId: issue.issueId,
        type: "FOCUS_FIELD_EDITOR",
        label: "הזן עובי",
        recommended: row.thicknessMm.candidates.length === 0,
        appliesToRowIds: [row.rowId],
        payload: { rowId: row.rowId, field: "thicknessMm" },
      });
      actions.push(focus);
      issue.suggestedActionIds.push(focus.actionId);
      pushExclude(actions, issue, row.rowId);
    } else if (
      row.thicknessMm.state === "AMBIGUOUS" ||
      row.thicknessMm.state === "CONFLICT"
    ) {
      const issue = makeIssue({
        code:
          row.thicknessMm.state === "AMBIGUOUS"
            ? "AMBIGUOUS_THICKNESS"
            : "THICKNESS_CONFLICT",
        rowIds: [row.rowId],
        field: "thicknessMm",
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const c of row.thicknessMm.candidates) {
        if (typeof c.value !== "number" || !(c.value > 0)) continue;
        const act = makeAction({
          issueId: issue.issueId,
          type: "SET_FIELD_VALUE",
          label: `אשר ${c.value} מ״מ`,
          recommended: Boolean(c.reason?.includes("suggest")),
          appliesToRowIds: [row.rowId],
          payload: {
            rowId: row.rowId,
            field: "thicknessMm",
            value: c.value,
          },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
    }

    // Material — genuine missing only
    if (
      row.material.state === "MISSING" &&
      (row.material.proposedValue == null ||
        !String(row.material.proposedValue).trim()) &&
      !row.material.currentValue?.trim()
    ) {
      const issue = makeIssue({
        code: "MISSING_MATERIAL",
        rowIds: [row.rowId],
        field: "material",
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const c of row.material.candidates) {
        if (typeof c.value !== "string" || !c.value.trim()) continue;
        const act = makeAction({
          issueId: issue.issueId,
          type: "SET_FIELD_VALUE",
          label: `אשר ${c.value}`,
          recommended: true,
          appliesToRowIds: [row.rowId],
          payload: { rowId: row.rowId, field: "material", value: c.value },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
      pushExclude(actions, issue, row.rowId);
    } else if (row.material.state === "CONFLICT") {
      const issue = makeIssue({
        code: "MATERIAL_CONFLICT",
        rowIds: [row.rowId],
        field: "material",
        severity: "BLOCKING",
        partLabelOverride: label,
      });
      issues.push(issue);
      for (const c of row.material.candidates) {
        if (typeof c.value !== "string" || !c.value.trim()) continue;
        const act = makeAction({
          issueId: issue.issueId,
          type: "SET_FIELD_VALUE",
          label: `בחר ${c.value}`,
          recommended: false,
          appliesToRowIds: [row.rowId],
          payload: { rowId: row.rowId, field: "material", value: c.value },
        });
        actions.push(act);
        issue.suggestedActionIds.push(act.actionId);
      }
    }

    // DXF dimension mismatch acknowledgment
    const docW =
      row.documentEvidence?.width?.status === "RESOLVED"
        ? row.documentEvidence.width.normalizedValue
        : (row.documentComparison.widthMm ?? null);
    const docH =
      row.documentEvidence?.height?.status === "RESOLVED"
        ? row.documentEvidence.height.normalizedValue
        : (row.documentComparison.heightMm ?? null);
    const dxfW = row.dxfGeometry?.widthMm ?? null;
    const dxfH = row.dxfGeometry?.heightMm ?? null;
    const hasMismatch =
      !row.dxfGeometryAcknowledged &&
      dxfW != null &&
      dxfH != null &&
      docW != null &&
      docH != null &&
      (Math.abs(docW - dxfW) > 1 || Math.abs(docH - dxfH) > 1) &&
      (Math.abs(docW - dxfH) > 1 || Math.abs(docH - dxfW) > 1);

    if (hasMismatch) {
      const detail = `במסמך מופיע ${docW}×${docH}, וב־DXF מופיע ${dxfW}×${dxfH} מ״מ.`;
      const issue = makeIssue({
        code: "DOCUMENT_DXF_DIMENSION_MISMATCH",
        rowIds: [row.rowId],
        severity: "BLOCKING",
        partLabelOverride: label,
        detail,
      });
      issues.push(issue);
      const useDxf = makeAction({
        issueId: issue.issueId,
        type: "USE_DXF_GEOMETRY",
        label: "השתמש ב־DXF",
        recommended: true,
        appliesToRowIds: [row.rowId],
        payload: { rowId: row.rowId },
      });
      actions.push(useDxf);
      issue.suggestedActionIds.push(useDxf.actionId);
      pushExclude(actions, issue, row.rowId);
    }
  }

  // Grouped mass-column unit ambiguity (one COLUMN issue, not per-row spam).
  // Skip when unit is resolved (including RESOLVED_UNIT_BASIS_AMBIGUOUS).
  const massAmbiguousRows = active.filter((row) => {
    if (!row.includeInQuote) return false;
    const unitResolved =
      row.sourceMassEvidence?.unit != null &&
      (row.sourceMassEvidence.status === "RESOLVED_BY_MASS_BASIS_CONSISTENCY" ||
        row.sourceMassEvidence.status === "RESOLVED_UNIT_BASIS_AMBIGUOUS" ||
        row.sourceMassEvidence.status === "RESOLVED_BY_EXPLICIT_HEADER_UNIT" ||
        row.sourceMassEvidence.status === "RESOLVED_BY_RELATED_COLUMN" ||
        row.sourceMassEvidence.status === "RESOLVED_BY_EXPLICIT_CELL_UNIT");
    if (unitResolved) return false;
    const uw = row.documentEvidence?.unitWeight;
    const tw = row.documentEvidence?.totalWeight;
    return uw?.status === "AMBIGUOUS" || tw?.status === "AMBIGUOUS";
  });
  if (massAmbiguousRows.length > 0) {
    const rowIds = massAmbiguousRows.map((r) => r.rowId);
    const issue = makeIssue({
      code: "MASS_COLUMNS_UNIT_AMBIGUOUS",
      rowIds,
      field: "unitWeight,totalWeight",
      severity: "WARNING",
      scope: "COLUMN",
      partLabelOverride: "עמודות משקל",
    });
    issues.push(issue);

    const confirmKg = makeAction({
      issueId: issue.issueId,
      type: "CONFIRM_RELATED_MASS_COLUMNS_UNIT",
      label: "אשר ק״ג לשתי העמודות",
      recommended: true,
      appliesToRowIds: rowIds,
      payload: {
        unit: "KG",
        unitWeightColumnId: "unitWeight",
        totalWeightColumnId: "totalWeight",
        affectedRowIds: rowIds,
      },
    });
    actions.push(confirmKg);
    issue.suggestedActionIds.push(confirmKg.actionId);

    const confirmG = makeAction({
      issueId: issue.issueId,
      type: "CONFIRM_RELATED_MASS_COLUMNS_UNIT",
      label: "בחר יחידה אחרת (גרם)",
      recommended: false,
      appliesToRowIds: rowIds,
      payload: {
        unit: "G",
        unitWeightColumnId: "unitWeight",
        totalWeightColumnId: "totalWeight",
        affectedRowIds: rowIds,
      },
    });
    actions.push(confirmG);
    issue.suggestedActionIds.push(confirmG.actionId);

    const leave = makeAction({
      issueId: issue.issueId,
      type: "ACKNOWLEDGE_WARNING",
      label: "השאר ללא יחידה",
      recommended: false,
      appliesToRowIds: rowIds,
      payload: { issueId: issue.issueId },
    });
    actions.push(leave);
    issue.suggestedActionIds.push(leave.actionId);
  }

  // Unit resolved, basis ambiguous — informational only, non-blocking, no confirm required.
  const basisAmbiguousRows = active.filter(
    (row) =>
      row.includeInQuote &&
      row.sourceMassEvidence?.status === "RESOLVED_UNIT_BASIS_AMBIGUOUS"
  );
  if (basisAmbiguousRows.length > 0) {
    const issue = makeIssue({
      code: "MASS_SOURCE_BASIS_AMBIGUOUS",
      rowIds: basisAmbiguousRows.map((r) => r.rowId),
      field: "sourceMassBasis",
      severity: "INFO",
      scope: "COLUMN",
      partLabelOverride: "עמודות משקל",
    });
    issues.push(issue);
  }

  void args.massInterpretations;

  // Attach issue ids onto rows
  const byRow = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.resolved) continue;
    for (const id of issue.rowIds) {
      const list = byRow.get(id) ?? [];
      list.push(issue.issueId);
      byRow.set(id, list);
    }
  }
  for (const row of args.rows) {
    row.issueIds = byRow.get(row.rowId) ?? [];
  }

  return { issues, actions };
}

function makeAction(args: {
  issueId: string;
  type: ReviewResolutionAction["type"];
  label: string;
  recommended: boolean;
  appliesToRowIds: string[];
  payload: Record<string, unknown>;
}): ReviewResolutionAction {
  return {
    actionId: nextActionId(args.type),
    issueId: args.issueId,
    type: args.type,
    label: args.label,
    recommended: args.recommended,
    payload: args.payload,
    appliesToRowIds: [...args.appliesToRowIds],
  };
}

function pushExclude(
  actions: ReviewResolutionAction[],
  issue: ReviewIssue,
  rowId: string
): void {
  const act = makeAction({
    issueId: issue.issueId,
    type: "EXCLUDE_ROW",
    label: "אל תכלול בהצעה",
    recommended: false,
    appliesToRowIds: [rowId],
    payload: { rowId },
  });
  actions.push(act);
  issue.suggestedActionIds.push(act.actionId);
}
