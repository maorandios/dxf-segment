"use client";

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
import { DXF_ISSUE, type DxfPartRegistryItem } from "@/lib/ai-intake/types";

function issueLabel(code: string): string {
  const key = `aiIntake.registry.issue.${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

function rowStatus(item: DxfPartRegistryItem): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (item.revisionIssue || item.duplicateIssue) {
    return {
      label: t("aiIntake.registry.rowStatus.revisionDuplicate"),
      variant: "destructive",
    };
  }
  if (!item.identityOk) {
    return {
      label: t("aiIntake.registry.rowStatus.identityProblem"),
      variant: "destructive",
    };
  }
  if (item.geometryStatus === "INVALID") {
    return {
      label: t("aiIntake.registry.rowStatus.geometryInvalid"),
      variant: "destructive",
    };
  }
  if (item.geometryStatus === "WARNING") {
    return {
      label: t("aiIntake.registry.rowStatus.geometryWarning"),
      variant: "secondary",
    };
  }
  return {
    label: t("aiIntake.registry.rowStatus.valid"),
    variant: "default",
  };
}

function displayIssues(item: DxfPartRegistryItem): string[] {
  return item.identityIssues.filter((c) => c !== DXF_ISSUE.LAYER_CONFIRMED);
}

interface DxfRegistryTableProps {
  items: DxfPartRegistryItem[];
  onPreview: (item: DxfPartRegistryItem) => void;
}

export function DxfRegistryTable({ items, onPreview }: DxfRegistryTableProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("aiIntake.registry.emptyFilter")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[12px] border border-white/10">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("aiIntake.registry.col.status")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.canonicalId")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.revision")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.rawId")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.filename")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.identitySource")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.dimensions")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.area")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.perimeter")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.geometry")}</TableHead>
            <TableHead>{t("aiIntake.registry.col.issues")}</TableHead>
            <TableHead className="text-end">
              {t("aiIntake.registry.col.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const status = rowStatus(item);
            const issues = displayIssues(item);
            const canPreview =
              item.processedGeometry != null &&
              item.processedGeometry.outer.length > 0 &&
              item.geometryStatus !== "INVALID";

            return (
              <TableRow
                key={item.id}
                className={cn(
                  !item.identityOk && "bg-destructive/[0.03]",
                  canPreview && "cursor-pointer"
                )}
                onClick={() => {
                  if (canPreview) onPreview(item);
                }}
              >
                <TableCell>
                  <Badge variant={status.variant} className="rounded-md font-normal">
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium tabular-nums" dir="ltr">
                  {item.canonicalPartId || "—"}
                </TableCell>
                <TableCell dir="ltr">{item.revision ?? "—"}</TableCell>
                <TableCell className="max-w-[140px] truncate text-xs" dir="ltr">
                  {item.normalizedRawPartId || item.rawPartId || "—"}
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs" dir="ltr">
                  {item.filename}
                </TableCell>
                <TableCell>
                  {item.identitySource
                    ? t(`aiIntake.registry.source.${item.identitySource}`)
                    : "—"}
                </TableCell>
                <TableCell className="tabular-nums whitespace-nowrap" dir="ltr">
                  {item.widthMm != null && item.heightMm != null
                    ? `${formatDecimal(item.widthMm, 1)} × ${formatDecimal(item.heightMm, 1)}`
                    : "—"}
                </TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {item.areaMm2 != null ? formatInteger(item.areaMm2) : "—"}
                </TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {item.perimeterMm != null
                    ? formatDecimal(item.perimeterMm, 1)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.geometryStatus === "VALID"
                        ? "secondary"
                        : item.geometryStatus === "WARNING"
                          ? "outline"
                          : "destructive"
                    }
                    className="rounded-md font-normal"
                  >
                    {t(`aiIntake.registry.geometry.${item.geometryStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[220px]">
                  {issues.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {issues.map((code) => (
                        <li key={code}>{issueLabel(code)}</li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!canPreview}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview(item);
                    }}
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
