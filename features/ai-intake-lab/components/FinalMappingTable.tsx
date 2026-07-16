"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import { cn } from "@/lib/utils";
import type {
  DuplicateUserAction,
  FinalIntakeMappingRow,
  RequestPartOccurrence,
  ResolvedCommercialField,
} from "@/lib/ai-intake/schemas";

function statusClass(status: FinalIntakeMappingRow["status"]): string {
  switch (status) {
    case "READY":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    case "NEEDS_REVIEW":
      return "border-amber-500/40 bg-amber-500/15 text-amber-200";
    case "EXCLUDED":
      return "border-white/20 bg-white/5 text-muted-foreground";
    case "REQUEST_WITHOUT_DXF":
      return "border-red-500/40 bg-red-500/15 text-red-300";
    case "DXF_NOT_REQUESTED":
      return "border-white/15 bg-white/5 text-muted-foreground";
    case "DXF_IDENTITY_CONFLICT":
    case "DXF_REVISION_CONFLICT":
      return "border-red-500/40 bg-red-500/15 text-red-300";
  }
}

function sourceTypeLabel(type: "XLSX" | "PDF" | "EMAIL"): string {
  return t(`aiIntake.final.source.${type}`);
}

/**
 * Display provenance for a resolved commercial field.
 * CONSENSUS never collapses to a single arbitrary source.
 */
export function formatFieldProvenance(
  field: ResolvedCommercialField<string | number>
): string {
  switch (field.resolutionStatus) {
    case "MISSING":
      return "—";
    case "OVERRIDE":
      return t("aiIntake.final.provenance.override");
    case "EMAIL_AUTHORITATIVE":
      return t("aiIntake.final.source.EMAIL");
    case "USER_RESOLUTION":
      return t("aiIntake.final.source.USER_RESOLUTION");
    case "CONFLICT": {
      if (field.candidates.length === 0) return t("aiIntake.final.provenance.conflict");
      return field.candidates
        .map((c) => `${sourceTypeLabel(c.sourceType)}:${c.value}`)
        .join(" · ");
    }
    case "CONSENSUS": {
      const order: Array<"XLSX" | "PDF" | "EMAIL"> = ["XLSX", "PDF", "EMAIL"];
      const types = order.filter((type) =>
        field.candidates.some(
          (c) => c.sourceType === type && c.instructionType === "VALUE"
        )
      );
      if (types.length >= 2) {
        return types.map(sourceTypeLabel).join(" + ");
      }
      return t("aiIntake.final.provenance.consensus", {
        count: String(Math.max(types.length, field.candidates.length)),
      });
    }
    case "SINGLE_SOURCE": {
      const primary = field.candidates[0];
      if (primary) return sourceTypeLabel(primary.sourceType);
      return t("aiIntake.final.source.DEFAULT");
    }
    default:
      return "—";
  }
}

function previousDetail(
  row: FinalIntakeMappingRow,
  field: "QUANTITY" | "THICKNESS" | "MATERIAL"
): string | null {
  const prev = row.previousValues.filter((p) => p.field === field);
  if (prev.length === 0) return null;
  return prev
    .map((p) => `${sourceTypeLabel(p.source)}: ${p.value}`)
    .join(" · ");
}

function emailAuthoritativeHint(row: FinalIntakeMappingRow): string | null {
  const qty = row.fieldResolutions.quantity;
  if (qty.resolutionStatus === "EMAIL_AUTHORITATIVE" && row.quantity != null) {
    return t("aiIntake.final.emailAuthoritativeHint");
  }
  if (qty.resolutionStatus === "OVERRIDE" && row.quantity != null) {
    const prevQty = row.previousValues.filter((p) => p.field === "QUANTITY");
    if (prevQty.length > 0) {
      return t("aiIntake.final.qtyOverrideHint", {
        from: prevQty.map((p) => String(p.value)).join("/"),
        to: String(row.quantity),
      });
    }
  }
  return null;
}

function showDuplicateBadge(row: FinalIntakeMappingRow): boolean {
  return (
    row.duplicateStatus !== "NONE" ||
    row.duplicateOccurrenceCount > 0 ||
    row.duplicateIssues.length > 0
  );
}

function duplicateBadgeLabel(row: FinalIntakeMappingRow): string {
  if (row.occurrenceCount > 1) {
    return t("aiIntake.final.duplicate.foundTimes", {
      count: String(row.occurrenceCount),
    });
  }
  return t("aiIntake.final.duplicate.badge");
}

function occurrenceLocationLines(occ: RequestPartOccurrence): string[] {
  const lines: string[] = [];
  if (occ.source.fileName) lines.push(occ.source.fileName);
  if (occ.source.sheetName) {
    lines.push(
      t("aiIntake.final.duplicate.sheet", { name: occ.source.sheetName })
    );
  }
  if (occ.source.rowNumber != null) {
    lines.push(
      t("aiIntake.final.duplicate.row", { n: String(occ.source.rowNumber) })
    );
  }
  if (occ.source.pageNumber != null) {
    lines.push(
      t("aiIntake.final.duplicate.page", { n: String(occ.source.pageNumber) })
    );
  }
  lines.push(
    t("aiIntake.final.duplicate.qty", { n: String(occ.quantity ?? "—") })
  );
  lines.push(
    t("aiIntake.final.duplicate.thick", { n: String(occ.thicknessMm ?? "—") })
  );
  lines.push(
    t("aiIntake.final.duplicate.mat", { n: String(occ.material ?? "—") })
  );
  return lines;
}

interface FinalMappingTableProps {
  rows: FinalIntakeMappingRow[];
  onPreview?: (row: FinalIntakeMappingRow) => void;
  canPreview?: (row: FinalIntakeMappingRow) => boolean;
  onDuplicateResolve?: (partId: string, action: DuplicateUserAction) => void;
}

export function FinalMappingTable({
  rows,
  onPreview,
  canPreview,
  onDuplicateResolve,
}: FinalMappingTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("aiIntake.final.empty")}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-white/10">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("aiIntake.final.col.status")}</TableHead>
            <TableHead>{t("aiIntake.final.col.partId")}</TableHead>
            <TableHead>{t("aiIntake.final.col.dxfFile")}</TableHead>
            <TableHead>{t("aiIntake.final.col.dimensions")}</TableHead>
            <TableHead>{t("aiIntake.final.col.area")}</TableHead>
            <TableHead>{t("aiIntake.final.col.quantity")}</TableHead>
            <TableHead>{t("aiIntake.final.col.thickness")}</TableHead>
            <TableHead>{t("aiIntake.final.col.material")}</TableHead>
            <TableHead>{t("aiIntake.final.col.qtySource")}</TableHead>
            <TableHead>{t("aiIntake.final.col.thickSource")}</TableHead>
            <TableHead>{t("aiIntake.final.col.matSource")}</TableHead>
            <TableHead>{t("aiIntake.final.col.override")}</TableHead>
            <TableHead>{t("aiIntake.final.col.issues")}</TableHead>
            <TableHead className="text-end">
              {t("aiIntake.final.col.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => {
            const hint = emailAuthoritativeHint(row);
            const previewOk = canPreview?.(row) ?? false;
            const qtyResolvedByEmail =
              row.fieldResolutions.quantity.resolutionStatus ===
                "EMAIL_AUTHORITATIVE" ||
              row.fieldResolutions.quantity.resolutionStatus === "OVERRIDE";
            const rowKey = `${row.partId}-${row.dxfFileId ?? "none"}-${row.status}-${row.displayLabel ?? ""}-${rowIndex}`;
            const expanded = Boolean(expandedKeys[rowKey]);
            const dupBadge = showDuplicateBadge(row);
            const canResolve =
              row.duplicateStatus === "IDENTICAL_DUPLICATE" &&
              Boolean(row.partId) &&
              Boolean(onDuplicateResolve);

            return (
              <TableRow key={rowKey}>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-md font-normal",
                      statusClass(row.status)
                    )}
                  >
                    {t(`aiIntake.final.status.${row.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium" dir="ltr">
                  <div className="space-y-1">
                    <div>{row.displayLabel ?? row.partId ?? "—"}</div>
                    {row.hasDocumentAndEmail && (
                      <Badge
                        variant="outline"
                        className="rounded-md border-sky-500/40 bg-sky-500/10 text-[10px] font-normal text-sky-200"
                      >
                        {t("aiIntake.audit.docAndEmail")}
                      </Badge>
                    )}
                    {dupBadge && (
                      <Badge
                        variant="outline"
                        className="rounded-md border-amber-500/40 bg-amber-500/10 text-[10px] font-normal text-amber-100"
                      >
                        {duplicateBadgeLabel(row)}
                      </Badge>
                    )}
                    {dupBadge && row.requestOccurrences.length > 0 && (
                      <div className="space-y-1 pt-1" dir="rtl">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto px-0 py-0 text-[11px] text-muted-foreground"
                          onClick={() =>
                            setExpandedKeys((prev) => ({
                              ...prev,
                              [rowKey]: !expanded,
                            }))
                          }
                        >
                          {expanded
                            ? t("aiIntake.final.duplicate.hideDetails")
                            : t("aiIntake.final.duplicate.showDetails")}
                        </Button>
                        {expanded && (
                          <div className="space-y-2 text-[11px] font-normal text-muted-foreground">
                            {row.duplicateStatus === "IDENTICAL_DUPLICATE" && (
                              <p>{t("aiIntake.final.duplicate.identicalMsg")}</p>
                            )}
                            {row.requestOccurrences.map((occ, idx) => (
                              <div
                                key={occ.occurrenceId}
                                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5"
                              >
                                <div className="font-medium text-foreground/80">
                                  {t("aiIntake.final.duplicate.occurrence", {
                                    n: String(idx + 1),
                                  })}
                                </div>
                                <ul className="mt-1 list-inside list-disc space-y-0.5">
                                  {occurrenceLocationLines(occ).map((line) => (
                                    <li key={line}>{line}</li>
                                  ))}
                                </ul>
                                {occ.currentlyIgnored && (
                                  <div className="mt-1 text-amber-200/90">
                                    {t("aiIntake.final.duplicate.currentlyIgnored")}
                                  </div>
                                )}
                              </div>
                            ))}
                            {canResolve && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() =>
                                    onDuplicateResolve?.(row.partId!, "IGNORE")
                                  }
                                >
                                  {t("aiIntake.final.duplicate.actionIgnore")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() =>
                                    onDuplicateResolve?.(row.partId!, "SUM")
                                  }
                                >
                                  {t("aiIntake.final.duplicate.actionSum")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() =>
                                    onDuplicateResolve?.(
                                      row.partId!,
                                      "KEEP_SEPARATE"
                                    )
                                  }
                                >
                                  {t(
                                    "aiIntake.final.duplicate.actionKeepSeparate"
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-xs" dir="ltr">
                  {row.dxfFilename ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums whitespace-nowrap" dir="ltr">
                  {row.widthMm != null && row.heightMm != null
                    ? `${formatDecimal(row.widthMm, 1)} × ${formatDecimal(row.heightMm, 1)}`
                    : "—"}
                </TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {row.areaMm2 != null ? formatInteger(row.areaMm2) : "—"}
                </TableCell>
                <TableCell className="tabular-nums font-medium" dir="ltr">
                  <div className="space-y-0.5">
                    <div>{row.quantity ?? "—"}</div>
                    {qtyResolvedByEmail && previousDetail(row, "QUANTITY") && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {previousDetail(row, "QUANTITY")}
                      </div>
                    )}
                    {row.fieldResolutions.quantity.resolutionStatus ===
                      "CONFLICT" &&
                      row.fieldResolutions.quantity.candidates.length > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {row.fieldResolutions.quantity.candidates
                            .map((c) => `${c.sourceType}:${c.value}`)
                            .join(" · ")}
                        </div>
                      )}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {row.thicknessMm ?? "—"}
                </TableCell>
                <TableCell dir="ltr">{row.material ?? "—"}</TableCell>
                <TableCell className="max-w-[180px] text-xs" title={row.fieldResolutions.quantity.candidates.map((c) => `${c.sourceLabel}${c.instructionType ? ` (${c.instructionType})` : ""}`).join(" | ")}>
                  <div className="space-y-0.5">
                    <div>{formatFieldProvenance(row.fieldResolutions.quantity)}</div>
                    {qtyResolvedByEmail && previousDetail(row, "QUANTITY") && (
                      <div className="text-[10px] text-muted-foreground">
                        {previousDetail(row, "QUANTITY")}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[160px] text-xs" title={row.fieldResolutions.thickness.candidates.map((c) => c.sourceLabel).join(" | ")}>
                  {formatFieldProvenance(row.fieldResolutions.thickness)}
                </TableCell>
                <TableCell className="max-w-[160px] text-xs" title={row.fieldResolutions.material.candidates.map((c) => c.sourceLabel).join(" | ")}>
                  {formatFieldProvenance(row.fieldResolutions.material)}
                </TableCell>
                <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                  {hint ?? "—"}
                </TableCell>
                <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                  {row.issues.length === 0
                    ? "—"
                    : row.issues.map((c) => t(`aiIntake.final.issue.${c}`) === `aiIntake.final.issue.${c}` ? c : t(`aiIntake.final.issue.${c}`)).join(", ")}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!previewOk}
                    onClick={() => onPreview?.(row)}
                  >
                    {t("aiIntake.registry.previewAction")}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
