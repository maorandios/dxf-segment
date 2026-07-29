"use client";

/**
 * Final-list side panel body: DXF geometry (with holes) + vertical part-data cards.
 */

import {
  formatAreaM2Cell,
  formatDimMm,
  formatWeightKgCell,
} from "./commercialCalculations";
import { SimpleDxfGeometryPreviewLoader } from "./SimpleDxfGeometryPreview";
import type { FinalIntakeRow } from "./types";

function cellNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

function FieldCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[14px] px-3.5 py-3"
      style={{
        backgroundColor: "rgba(242,244,247,0.92)",
      }}
      data-part-field={label}
    >
      <p
        className="text-[11px] font-medium tracking-wide"
        style={{ color: "var(--ow-text-muted, #667085)" }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 text-[15px] font-semibold leading-snug tabular-nums break-words"
        style={{ color: "var(--ow-text, #101828)" }}
      >
        {value}
      </p>
    </div>
  );
}

export function FinalQuotePartPreviewBody({
  row,
  dxfFile,
}: {
  row: FinalIntakeRow;
  dxfFile: File | null;
}) {
  const partName =
    row.part.sourcePartId?.trim() ||
    row.part.displayName?.trim() ||
    row.materialRowId;
  const lengthMm =
    row.dxfDimensions.lengthMm ??
    row.rawDxfDimensions?.lengthMm ??
    row.source.sourceLengthMm;
  const widthMm =
    row.dxfDimensions.widthMm ??
    row.rawDxfDimensions?.widthMm ??
    row.source.sourceWidthMm;

  const fields: ReadonlyArray<{ label: string; value: string }> = [
    { label: "שם פריט", value: partName },
    { label: "כמות", value: cellNumber(row.quantity) },
    {
      label: "עובי",
      value:
        row.thicknessMm != null && Number.isFinite(row.thicknessMm)
          ? `${formatDimMm(row.thicknessMm)} מ״מ`
          : "—",
    },
    { label: "סוג חומר", value: row.material?.trim() || "—" },
    {
      label: "אורך",
      value: lengthMm != null ? `${formatDimMm(lengthMm)} מ״מ` : "—",
    },
    {
      label: "רוחב",
      value: widthMm != null ? `${formatDimMm(widthMm)} מ״מ` : "—",
    },
    {
      label: "משקל",
      value:
        row.commercial.unitWeightKg != null &&
        Number.isFinite(row.commercial.unitWeightKg)
          ? `${formatWeightKgCell(row.commercial.unitWeightKg, 3)} ק״ג`
          : "—",
    },
    {
      label: "שטח",
      value:
        row.commercial.areaM2 != null && Number.isFinite(row.commercial.areaM2)
          ? `${formatAreaM2Cell(row.commercial.areaM2, 3)} מ״ר`
          : "—",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
      <SimpleDxfGeometryPreviewLoader
        file={dxfFile}
        widthMm={widthMm}
        lengthMm={lengthMm}
      />
      <div
        className="grid grid-cols-2 gap-2.5"
        role="list"
        aria-label="נתוני פריט"
        data-final-quote-part-fields="true"
      >
        {fields.map((f) => (
          <div key={f.label} role="listitem">
            <FieldCard label={f.label} value={f.value} />
          </div>
        ))}
      </div>
    </div>
  );
}
