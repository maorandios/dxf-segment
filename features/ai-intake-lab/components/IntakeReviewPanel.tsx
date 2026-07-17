"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import {
  applyReviewDecision,
  approveReviewSession,
  serializeReviewDebugReport,
  buildReviewDebugReport,
  type IntakeReviewSession,
  type ReviewIssue,
  type ReviewOptionalMeasurement,
  type ReviewPartRow,
  type ReviewResolutionAction,
} from "@/lib/ai-intake/review";
import { copyTextToClipboard } from "@/lib/ai-intake/debug";
import type { DxfPartRegistryItem } from "@/lib/ai-intake/types";

type FilterKey = "all" | "needs" | "ready" | "excluded";

interface IntakeReviewPanelProps {
  session: IntakeReviewSession;
  onSessionChange: (next: IntakeReviewSession) => void;
  registry: DxfPartRegistryItem[];
}

export function IntakeReviewPanel({
  session,
  onSessionChange,
  registry,
}: IntakeReviewPanelProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [copiedReview, setCopiedReview] = useState(false);

  const activeRows = useMemo(
    () => session.rows.filter((r) => !r.replacedByRowId),
    [session.rows]
  );

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "needs":
        return activeRows.filter((r) => r.status === "NEEDS_DECISION");
      case "ready":
        return activeRows.filter((r) => r.status === "READY");
      case "excluded":
        return activeRows.filter((r) => r.status === "EXCLUDED");
      default:
        return activeRows;
    }
  }, [activeRows, filter]);

  const selectedRow = selectedRowId
    ? activeRows.find((r) => r.rowId === selectedRowId) ?? null
    : null;

  const selectedIssues = selectedRow
    ? session.issues.filter(
        (i) =>
          !i.resolved &&
          i.rowIds.includes(selectedRow.rowId) &&
          i.severity !== "INFO"
      )
    : [];

  const applyAction = (action: ReviewResolutionAction) => {
    if (action.type === "FOCUS_FIELD_EDITOR") {
      const field = String(action.payload.field ?? "thicknessMm");
      setSelectedRowId(String(action.payload.rowId));
      setFocusField(field);
      return;
    }
    let enriched = action;
    if (action.type === "SELECT_DXF_MATCH") {
      const partId = String(action.payload.partId);
      const item = registry.find((r) => r.canonicalPartId === partId);
      if (item) {
        enriched = {
          ...action,
          payload: {
            ...action.payload,
            fileName: item.filename,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
            plateAreaMm2: item.plateAreaMm2,
            netContourAreaMm2: item.netContourAreaMm2,
          },
        };
      }
    }
    onSessionChange(
      applyReviewDecision(session, { kind: "ACTION", action: enriched })
    );
  };

  const editField = (
    rowId: string,
    field: "quantity" | "thicknessMm" | "material",
    raw: string
  ) => {
    if (field === "material") {
      if (!raw.trim()) return;
      onSessionChange(
        applyReviewDecision(session, {
          kind: "MANUAL_EDIT",
          rowId,
          field,
          value: raw.trim(),
        })
      );
      return;
    }
    const n = Number.parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || !(n > 0)) return;
    onSessionChange(
      applyReviewDecision(session, {
        kind: "MANUAL_EDIT",
        rowId,
        field,
        value: n,
      })
    );
  };

  const handleApprove = () => {
    if (!session.summary.readyForApproval) return;
    onSessionChange(approveReviewSession(session));
  };

  const copyReviewJson = async () => {
    const json = serializeReviewDebugReport(buildReviewDebugReport(session));
    try {
      await copyTextToClipboard(json);
      setCopiedReview(true);
      window.setTimeout(() => setCopiedReview(false), 2000);
    } catch {
      // ignore
    }
  };

  if (session.status === "APPROVED" && session.approvedBom) {
    return (
      <ApprovedBomView
        session={session}
        onCopyReview={copyReviewJson}
        copiedReview={copiedReview}
      />
    );
  }

  return (
    <section className="space-y-4">
      <Card className="border-0 shadow-sm rounded-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg tracking-tight">
            {t("aiIntake.review.title")}
          </CardTitle>
          <CardDescription>{t("aiIntake.review.subtitle")}</CardDescription>
          <div className="flex flex-wrap gap-3 text-sm">
            <SummaryChip
              label={t("aiIntake.review.totalRows")}
              value={session.summary.totalRows}
            />
            <SummaryChip
              label={t("aiIntake.review.readyRows")}
              value={session.summary.readyRows}
              tone="ok"
            />
            <SummaryChip
              label={t("aiIntake.review.decisionRows")}
              value={session.summary.decisionRows}
              tone="warn"
            />
            <SummaryChip
              label={t("aiIntake.review.excludedRows")}
              value={session.summary.excludedRows}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", t("aiIntake.review.filterAll")],
                ["needs", t("aiIntake.review.filterNeeds")],
                ["ready", t("aiIntake.review.filterReady")],
                ["excluded", t("aiIntake.review.filterExcluded")],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filter === key ? "default" : "outline"}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-white/[0.03] text-muted-foreground">
            <tr className="text-start">
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colStatus")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colPart")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colDxf")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colQty")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colThickness")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colMaterial")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colDims")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colArea")}</th>
              <th className="px-3 py-2 font-medium">{t("aiIntake.review.colIssue")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const primaryIssue = session.issues.find(
                (i) =>
                  !i.resolved &&
                  i.rowIds.includes(row.rowId) &&
                  i.severity === "BLOCKING"
              );
              return (
                <tr
                  key={row.rowId}
                  className="border-t border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 font-medium" dir="ltr">
                    {row.displayPartReference ?? "—"}
                  </td>
                  <td className="px-3 py-2" dir="ltr">
                    {row.matchedDxfPartId ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <InlineNumber
                      value={row.quantity.currentValue}
                      disabled={row.status === "EXCLUDED"}
                      onCommit={(v) => editField(row.rowId, "quantity", v)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <InlineNumber
                      value={row.thicknessMm.currentValue}
                      disabled={row.status === "EXCLUDED"}
                      onCommit={(v) => editField(row.rowId, "thicknessMm", v)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <InlineText
                      value={row.material.currentValue}
                      disabled={row.status === "EXCLUDED"}
                      onCommit={(v) => editField(row.rowId, "material", v)}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">
                    {row.dxfGeometry?.widthMm != null &&
                    row.dxfGeometry.heightMm != null
                      ? `${row.dxfGeometry.widthMm}×${row.dxfGeometry.heightMm}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums" dir="ltr">
                    {row.dxfGeometry?.plateAreaMm2 != null
                      ? row.dxfGeometry.plateAreaMm2
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {primaryIssue ? (
                      <button
                        type="button"
                        className="text-start text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
                        onClick={() => setSelectedRowId(row.rowId)}
                      >
                        {primaryIssue.title}
                      </button>
                    ) : row.status === "READY" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedRowId(row.rowId)}
                      >
                        {t("aiIntake.review.openIssue")}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filteredRows.map((row) => {
          const primaryIssue = session.issues.find(
            (i) =>
              !i.resolved &&
              i.rowIds.includes(row.rowId) &&
              i.severity === "BLOCKING"
          );
          return (
            <Card key={row.rowId} className="border border-white/10 shadow-none">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold" dir="ltr">
                    {row.displayPartReference ?? "—"}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <FieldLabel label={t("aiIntake.review.colQty")}>
                    <InlineNumber
                      value={row.quantity.currentValue}
                      disabled={row.status === "EXCLUDED"}
                      onCommit={(v) => editField(row.rowId, "quantity", v)}
                    />
                  </FieldLabel>
                  <FieldLabel label={t("aiIntake.review.colThickness")}>
                    <InlineNumber
                      value={row.thicknessMm.currentValue}
                      disabled={row.status === "EXCLUDED"}
                      onCommit={(v) => editField(row.rowId, "thicknessMm", v)}
                    />
                  </FieldLabel>
                  <FieldLabel label={t("aiIntake.review.colMaterial")}>
                    <InlineText
                      value={row.material.currentValue}
                      disabled={row.status === "EXCLUDED"}
                      onCommit={(v) => editField(row.rowId, "material", v)}
                    />
                  </FieldLabel>
                  <FieldLabel label={t("aiIntake.review.colDims")}>
                    <span dir="ltr" className="tabular-nums">
                      {row.dxfGeometry?.widthMm != null &&
                      row.dxfGeometry.heightMm != null
                        ? `${row.dxfGeometry.widthMm}×${row.dxfGeometry.heightMm}`
                        : "—"}
                    </span>
                  </FieldLabel>
                </div>
                {primaryIssue && (
                  <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <p className="font-medium">{primaryIssue.title}</p>
                    <p className="mt-1 text-muted-foreground">
                      {primaryIssue.message}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      onClick={() => setSelectedRowId(row.rowId)}
                    >
                      {t("aiIntake.review.resolve")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedRow && (
        <IssueDrawer
          row={selectedRow}
          issues={selectedIssues}
          actions={session.actions.filter((a) =>
            selectedIssues.some((i) => i.issueId === a.issueId)
          )}
          focusField={focusField}
          onFocusHandled={() => setFocusField(null)}
          onClose={() => {
            setSelectedRowId(null);
            setFocusField(null);
          }}
          onAction={applyAction}
          onEdit={editField}
          onExclude={() =>
            onSessionChange(
              applyReviewDecision(session, {
                kind: "SET_INCLUDE",
                rowId: selectedRow.rowId,
                includeInQuote: false,
              })
            )
          }
        />
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-3 z-10 rounded-xl border border-white/10 bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p>
              {session.summary.totalRows} {t("aiIntake.review.partsWord")} ·{" "}
              {session.summary.readyRows} {t("aiIntake.review.readyWord")} ·{" "}
              {session.summary.decisionRows}{" "}
              {t("aiIntake.review.decisionWord")}
            </p>
            {!session.summary.readyForApproval && (
              <p className="mt-1 text-muted-foreground">
                {t("aiIntake.review.approvalBlocked", {
                  count: Math.max(
                    session.summary.decisionRows,
                    session.summary.blockingIssueCount
                  ),
                })}
              </p>
            )}
          </div>
          <Button
            type="button"
            disabled={!session.summary.readyForApproval}
            onClick={handleApprove}
          >
            {t("aiIntake.review.approveCta")}
          </Button>
        </div>
      </div>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          {t("aiIntake.review.devTools")}
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void copyReviewJson()}>
            {copiedReview
              ? t("aiIntake.review.copiedReview")
              : t("aiIntake.review.copyReviewJson")}
          </Button>
        </div>
      </details>
    </section>
  );
}

function ApprovedBomView(props: {
  session: IntakeReviewSession;
  onCopyReview: () => void;
  copiedReview: boolean;
}) {
  const bom = props.session.approvedBom!;
  return (
    <section className="space-y-4">
      <Card className="border-0 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle>{t("aiIntake.review.approvedTitle")}</CardTitle>
          <CardDescription>
            {t("aiIntake.review.approvedSubtitle", {
              count: bom.summary.includedPartRows,
              qty: bom.summary.totalQuantity,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-white/[0.03] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">{t("aiIntake.review.colPart")}</th>
                  <th className="px-3 py-2 text-start">{t("aiIntake.review.colQty")}</th>
                  <th className="px-3 py-2 text-start">{t("aiIntake.review.colThickness")}</th>
                  <th className="px-3 py-2 text-start">{t("aiIntake.review.colMaterial")}</th>
                  <th className="px-3 py-2 text-start">{t("aiIntake.review.colDims")}</th>
                </tr>
              </thead>
              <tbody>
                {bom.parts.map((p) => (
                  <tr key={p.approvedRowId} className="border-t border-white/5">
                    <td className="px-3 py-2" dir="ltr">
                      {p.partReference}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{p.quantity}</td>
                    <td className="px-3 py-2 tabular-nums">{p.thicknessMm}</td>
                    <td className="px-3 py-2" dir="ltr">
                      {p.material}
                    </td>
                    <td className="px-3 py-2 tabular-nums" dir="ltr">
                      {p.widthMm}×{p.heightMm}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled>
              {t("aiIntake.review.continuePricing")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={props.onCopyReview}
            >
              {props.copiedReview
                ? t("aiIntake.review.copiedReview")
                : t("aiIntake.review.copyReviewJson")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("aiIntake.review.pricingLater")}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function IssueDrawer(props: {
  row: ReviewPartRow;
  issues: ReviewIssue[];
  actions: ReviewResolutionAction[];
  focusField?: string | null;
  onFocusHandled?: () => void;
  onClose: () => void;
  onAction: (a: ReviewResolutionAction) => void;
  onEdit: (
    rowId: string,
    field: "quantity" | "thicknessMm" | "material",
    raw: string
  ) => void;
  onExclude: () => void;
}) {
  const issue = props.issues[0];
  const thicknessRef = useRef<HTMLInputElement>(null);
  const focusField = props.focusField;
  const onFocusHandled = props.onFocusHandled;

  useEffect(() => {
    if (focusField !== "thicknessMm") return;
    thicknessRef.current?.focus();
    thicknessRef.current?.select();
    onFocusHandled?.();
  }, [focusField, onFocusHandled]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-md flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="font-semibold">
            {issue?.title ?? t("aiIntake.review.issueDetails")}
          </h3>
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            {t("aiIntake.review.close")}
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {issue && (
            <p className="text-sm text-muted-foreground">{issue.message}</p>
          )}
          <div className="space-y-2">
            {props.actions
              .filter((a) => !issue || a.issueId === issue.issueId)
              .map((a) => (
                <Button
                  key={a.actionId}
                  type="button"
                  className="w-full justify-start"
                  variant={a.recommended ? "default" : "outline"}
                  onClick={() => {
                    if (a.type === "FOCUS_FIELD_EDITOR") {
                      thicknessRef.current?.focus();
                      thicknessRef.current?.select();
                      return;
                    }
                    props.onAction(a);
                    props.onClose();
                  }}
                >
                  {a.recommended ? "★ " : ""}
                  {a.label}
                </Button>
              ))}
          </div>
          <div className="space-y-2 rounded-[10px] border border-white/10 p-3">
            <p className="text-sm font-medium">{t("aiIntake.review.manualEdit")}</p>
            <label className="block text-xs text-muted-foreground">
              {t("aiIntake.review.colThickness")}
              <Input
                ref={thicknessRef}
                className="mt-1"
                dir="ltr"
                defaultValue={props.row.thicknessMm.currentValue ?? ""}
                onBlur={(e) =>
                  props.onEdit(props.row.rowId, "thicknessMm", e.target.value)
                }
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("aiIntake.review.colQty")}
              <Input
                className="mt-1"
                dir="ltr"
                defaultValue={props.row.quantity.currentValue ?? ""}
                onBlur={(e) =>
                  props.onEdit(props.row.rowId, "quantity", e.target.value)
                }
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("aiIntake.review.colMaterial")}
              <Input
                className="mt-1"
                dir="ltr"
                defaultValue={props.row.material.currentValue ?? ""}
                onBlur={(e) =>
                  props.onEdit(props.row.rowId, "material", e.target.value)
                }
              />
            </label>
          </div>
          <OptionalEvidenceBlock row={props.row} />
          <SourceRefsBlock row={props.row} />
          <Button type="button" variant="destructive" onClick={props.onExclude}>
            {t("aiIntake.review.excludeRow")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OptionalEvidenceBlock({ row }: { row: ReviewPartRow }) {
  const items: Array<{ title: string; m: ReviewOptionalMeasurement }> = [];
  const ev = row.documentEvidence;
  if (ev?.totalWeight && ev.totalWeight.rawValue != null) {
    items.push({ title: t("aiIntake.review.docTotalWeight"), m: ev.totalWeight });
  }
  if (ev?.unitWeight && ev.unitWeight.rawValue != null) {
    items.push({ title: t("aiIntake.review.docUnitWeight"), m: ev.unitWeight });
  }
  if (ev?.area && (ev.area.rawValue != null || ev.area.status === "AMBIGUOUS")) {
    items.push({ title: t("aiIntake.review.docArea"), m: ev.area });
  }
  if (items.length === 0) return null;
  return (
    <details className="rounded-[10px] border border-white/10 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("aiIntake.review.sourceDetails")} — מסמך
      </summary>
      <ul className="mt-2 space-y-3 text-muted-foreground">
        {items.map((item) => (
          <li key={item.title}>
            <p className="font-medium text-foreground">{item.title}</p>
            <p dir="ltr" className="tabular-nums">
              {item.m.rawValue ?? "—"}
            </p>
            {item.m.status === "AMBIGUOUS" && (
              <p>{t("aiIntake.review.unitUndecided")}</p>
            )}
            {item.m.status === "RESOLVED" &&
              item.m.normalizedValue != null &&
              item.m.normalizedUnit && (
                <p dir="ltr" className="tabular-nums text-xs">
                  {item.m.normalizedValue} {item.m.normalizedUnit}
                </p>
              )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceRefsBlock({ row }: { row: ReviewPartRow }) {
  const refs = [
    ...row.quantity.sourceRefs,
    ...row.thicknessMm.sourceRefs,
    ...row.material.sourceRefs,
  ];
  if (refs.length === 0) return null;
  return (
    <details className="rounded-[10px] border border-white/10 p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        {t("aiIntake.review.sourceDetails")}
      </summary>
      <ul className="mt-2 space-y-2 text-muted-foreground" dir="ltr">
        {refs.slice(0, 8).map((r, i) => (
          <li key={i}>
            {r.sourceType}
            {r.fileName ? ` · ${r.fileName}` : ""}
            {r.sheetName ? ` · ${r.sheetName}` : ""}
            {r.rowNumber != null ? ` · row ${r.rowNumber}` : ""}
            {r.pageNumber != null ? ` · page ${r.pageNumber}` : ""}
            {r.excerpt ? ` — ${r.excerpt}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

function StatusBadge({ status }: { status: ReviewPartRow["status"] }) {
  if (status === "READY") {
    return (
      <Badge className="bg-emerald-600/20 text-emerald-700 dark:text-emerald-300">
        {t("aiIntake.review.statusReady")}
      </Badge>
    );
  }
  if (status === "EXCLUDED") {
    return (
      <Badge variant="secondary">{t("aiIntake.review.statusExcluded")}</Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200">
      {t("aiIntake.review.statusNeeds")}
    </Badge>
  );
}

function SummaryChip(props: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-[10px] border border-white/10 px-3 py-1.5">
      <span className="text-muted-foreground">{props.label}: </span>
      <span
        className={
          props.tone === "ok"
            ? "font-semibold text-emerald-600 dark:text-emerald-400"
            : props.tone === "warn"
              ? "font-semibold text-amber-600 dark:text-amber-400"
              : "font-semibold"
        }
      >
        {props.value}
      </span>
    </div>
  );
}

function FieldLabel(props: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1">{props.children}</div>
    </div>
  );
}

function InlineNumber(props: {
  value: number | null;
  disabled?: boolean;
  onCommit: (raw: string) => void;
}) {
  return (
    <Input
      className="h-8 w-20"
      dir="ltr"
      disabled={props.disabled}
      defaultValue={props.value ?? ""}
      key={String(props.value)}
      onBlur={(e) => props.onCommit(e.target.value)}
    />
  );
}

function InlineText(props: {
  value: string | null;
  disabled?: boolean;
  onCommit: (raw: string) => void;
}) {
  return (
    <Input
      className="h-8 w-24"
      dir="ltr"
      disabled={props.disabled}
      defaultValue={props.value ?? ""}
      key={String(props.value)}
      onBlur={(e) => props.onCommit(e.target.value)}
    />
  );
}
