"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DocumentDxfAuditRow } from "@/lib/ai-intake/schemas";

function statusClass(status: DocumentDxfAuditRow["status"]): string {
  switch (status) {
    case "MATCHED":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    case "MAPPING_REQUIRES_REVIEW":
      return "border-amber-500/40 bg-amber-500/15 text-amber-200";
    case "REQUEST_PART_NOT_IN_DXF":
      return "border-red-500/40 bg-red-500/15 text-red-300";
    case "SOURCE_FAILED":
      return "border-red-500/40 bg-red-500/15 text-red-300";
    case "DXF_NOT_REFERENCED":
      return "border-white/15 bg-white/5 text-muted-foreground";
  }
}

interface DocumentDxfAuditTableProps {
  rows: DocumentDxfAuditRow[];
}

export function DocumentDxfAuditTable({ rows }: DocumentDxfAuditTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("aiIntake.audit.empty")}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-white/10">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("aiIntake.audit.col.status")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.rawRef")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.matchedId")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.source")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.quantity")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.thickness")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.material")}</TableHead>
            <TableHead>{t("aiIntake.audit.col.reason")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={`${row.documentId ?? "na"}-${row.status}-${row.sourceType}-${row.rawPartReference}-${row.matchedDxfPartId}-${idx}`}>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-md font-normal",
                    statusClass(row.status)
                  )}
                >
                  {t(`aiIntake.audit.status.${row.status}`)}
                </Badge>
              </TableCell>
              <TableCell className="font-medium" dir="ltr">
                {row.rawPartReference ?? "—"}
              </TableCell>
              <TableCell dir="ltr">{row.matchedDxfPartId ?? "—"}</TableCell>
              <TableCell className="max-w-[180px] truncate text-xs">
                {row.sourceLabel ??
                  (row.sourceType
                    ? t(`aiIntake.audit.sourceType.${row.sourceType}`)
                    : "—")}
              </TableCell>
              <TableCell dir="ltr" className="tabular-nums">
                {row.extractedQuantity ?? "—"}
              </TableCell>
              <TableCell dir="ltr" className="tabular-nums">
                {row.extractedThicknessMm ?? "—"}
              </TableCell>
              <TableCell dir="ltr">{row.extractedMaterial ?? "—"}</TableCell>
              <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                <div className="space-y-1">
                  {row.hasDocumentAndEmail && (
                    <Badge
                      variant="outline"
                      className="rounded-md border-sky-500/40 bg-sky-500/10 text-[10px] font-normal text-sky-200"
                    >
                      {t("aiIntake.audit.docAndEmail")}
                    </Badge>
                  )}
                  <div>{row.reason ?? "—"}</div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
