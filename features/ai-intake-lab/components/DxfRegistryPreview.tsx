"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlateGeometryCanvas } from "@/components/parts/PlateGeometryCanvas";
import { t } from "@/lib/i18n";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import type { DxfPartRegistryItem } from "@/lib/ai-intake/types";

interface DxfRegistryPreviewProps {
  item: DxfPartRegistryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DxfRegistryPreview({
  item,
  open,
  onOpenChange,
}: DxfRegistryPreviewProps) {
  const geometry = item?.processedGeometry ?? null;
  const canPreview =
    geometry != null &&
    geometry.outer.length > 0 &&
    item?.geometryStatus !== "INVALID";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {item
              ? t("aiIntake.registry.previewTitle", {
                  name: item.filename,
                })
              : t("aiIntake.registry.previewTitleFallback")}
          </DialogTitle>
          <DialogDescription>
            {item?.canonicalPartId
              ? t("aiIntake.registry.previewDescription", {
                  partId: item.canonicalPartId,
                  revision: item.revision ?? "—",
                })
              : t("aiIntake.registry.previewNoId")}
          </DialogDescription>
        </DialogHeader>

        {!item ? null : canPreview && geometry ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-[12px] border border-white/10 bg-[rgb(8,12,16)]">
              <PlateGeometryCanvas
                geometry={geometry}
                width={720}
                height={420}
                appearance="previewModal"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              <div>
                <span className="block text-[11px] opacity-70">
                  {t("aiIntake.registry.col.dimensions")}
                </span>
                {item.widthMm != null && item.heightMm != null
                  ? `${formatDecimal(item.widthMm, 1)} × ${formatDecimal(item.heightMm, 1)}`
                  : "—"}
              </div>
              <div>
                <span className="block text-[11px] opacity-70">
                  {t("aiIntake.registry.col.area")}
                </span>
                {item.areaMm2 != null ? formatInteger(item.areaMm2) : "—"}
              </div>
              <div>
                <span className="block text-[11px] opacity-70">
                  {t("aiIntake.registry.col.perimeter")}
                </span>
                {item.perimeterMm != null
                  ? formatDecimal(item.perimeterMm, 1)
                  : "—"}
              </div>
              <div>
                <span className="block text-[11px] opacity-70">
                  {t("aiIntake.registry.col.geometry")}
                </span>
                {t(`aiIntake.registry.geometry.${item.geometryStatus}`)}
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-[10px] border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
            {t("aiIntake.registry.previewUnavailable")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
