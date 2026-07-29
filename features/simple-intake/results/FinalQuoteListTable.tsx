"use client";

import {
  type CSSProperties,
  type ReactNode,
} from "react";
import { CirclePause, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isQuoteItemFrozen } from "../quoteItemScope";
import {
  type QuoteItemCommercialOptions,
  type QuoteItemFinish,
  resolveCommercialOptionsForRow,
  type QuoteItemCommercialOptionsMap,
} from "../quoteItemCommercialOptions";
import { getCanonicalMaterialItemId } from "./canonicalMaterialItemId";
import {
  formatAreaM2Cell,
  formatDimMm,
  formatWeightKgCell,
} from "./commercialCalculations";
import { FinishSelectCell } from "./FinishSelectCell";
import { rowCommercialAreaTotalM2 } from "./finalQuoteListMetrics";
import type { FinalIntakeRow } from "./types";

const MUTED_GRAY = "var(--ow-text-muted)";
const GROUP_SEPARATOR = "1px solid var(--ow-border)";

function cellNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value)
    ? value.toLocaleString("he-IL")
    : value.toLocaleString("he-IL", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
}

function ColHeader({
  label,
  className,
  withSeparator = false,
}: {
  label: string;
  className?: string;
  withSeparator?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`sticky top-0 z-30 whitespace-nowrap px-3 py-2 text-[11px] font-medium ${className ?? ""}`}
      style={{
        color: MUTED_GRAY,
        backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
        borderInlineStart: withSeparator ? GROUP_SEPARATOR : undefined,
        borderBottom: "1px solid var(--ow-border)",
      }}
    >
      {label}
    </th>
  );
}

function Td({
  children,
  className,
  style,
  title,
  withSeparator = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
  withSeparator?: boolean;
}) {
  return (
    <td
      className={className}
      title={title}
      style={{
        ...style,
        borderInlineStart: withSeparator ? GROUP_SEPARATOR : undefined,
      }}
    >
      {children}
    </td>
  );
}

export function FinalQuoteListTable({
  rows,
  commercialOptions,
  activeRowId = null,
  onToggleFreeze,
  onView,
  onFinishChange,
  onCheckeredPlateChange,
}: {
  rows: FinalIntakeRow[];
  commercialOptions: QuoteItemCommercialOptionsMap;
  /** Row open in the side panel — same accent highlight as gaps table. */
  activeRowId?: string | null;
  onToggleFreeze: (row: FinalIntakeRow) => void;
  onView: (rowId: string) => void;
  onFinishChange: (materialRowId: string, finish: QuoteItemFinish) => void;
  onCheckeredPlateChange: (
    materialRowId: string,
    isCheckeredPlate: boolean
  ) => void;
}) {
  return (
    <div
      className="rounded-[var(--ow-radius-lg)] border"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
      data-final-quote-table="true"
    >
      <table
        className="w-full min-w-[1180px] border-separate border-spacing-0 text-right text-[13px]"
        aria-label="רשימה להצעת מחיר"
      >
        <thead>
          <tr
            style={{
              backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
            }}
          >
            <ColHeader label="#" className="w-10 text-center" />
            <ColHeader label="פריט" />
            <ColHeader label="כמות" className="w-16" />
            <ColHeader label={'עובי (מ״מ)'} className="w-20" />
            <ColHeader label="סוג חומר" />
            <ColHeader label={'אורך (מ״מ)'} withSeparator />
            <ColHeader label={'רוחב (מ״מ)'} />
            <ColHeader label={'משקל פריט (ק"ג)'} className="w-[5.5rem]" withSeparator />
            <ColHeader label={'משקל כללי (ק"ג)'} className="w-[5.5rem]" />
            <ColHeader label={'שטח פריט (מ"ר)'} className="w-[5.5rem]" />
            <ColHeader label={'שטח כללי (מ"ר)'} className="w-[5.5rem]" />
            <ColHeader label="גימור" className="w-[7.5rem]" withSeparator />
            <ColHeader label="פח מרוג" className="w-16 text-center" />
            <ColHeader label="הקפא" className="w-14 text-center" />
            <ColHeader label="צפייה" className="w-14 text-center" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const frozen = isQuoteItemFrozen(row);
            const isActiveRow = activeRowId != null && activeRowId === row.id;
            const partLabel =
              row.part.sourcePartId?.trim() ||
              row.part.displayName?.trim() ||
              row.materialRowId;
            const materialRowId =
              getCanonicalMaterialItemId(row) ?? row.materialRowId ?? row.id;
            const opts: QuoteItemCommercialOptions =
              resolveCommercialOptionsForRow(commercialOptions, materialRowId);
            const lengthMm =
              row.dxfDimensions.lengthMm ??
              row.rawDxfDimensions?.lengthMm ??
              row.source.sourceLengthMm;
            const widthMm =
              row.dxfDimensions.widthMm ??
              row.rawDxfDimensions?.widthMm ??
              row.source.sourceWidthMm;
            const unitArea = row.commercial.areaM2;
            const totalArea = rowCommercialAreaTotalM2(row);
            const strikeStyle: CSSProperties | undefined = frozen
              ? {
                  textDecoration: "line-through",
                  color: "var(--ow-text-muted)",
                }
              : undefined;

            return (
              <tr
                key={row.id}
                data-scope-state={frozen ? "FROZEN" : "INCLUDED"}
                data-material-row-id={materialRowId}
                title={
                  frozen ? "הפריט מוקפא ואינו נכלל בהצעה" : undefined
                }
                aria-selected={isActiveRow}
                style={{
                  borderBottom: "1px solid var(--ow-border)",
                  backgroundColor: frozen
                    ? "color-mix(in srgb, var(--ow-surface-muted) 55%, transparent)"
                    : isActiveRow
                      ? "color-mix(in srgb, var(--ow-accent) 12%, white)"
                      : undefined,
                  color: frozen ? "var(--ow-text-muted)" : undefined,
                  boxShadow: isActiveRow
                    ? "inset -3px 0 0 var(--ow-accent)"
                    : undefined,
                }}
                className={
                  isActiveRow || frozen
                    ? undefined
                    : "hover:bg-[color-mix(in_srgb,var(--ow-surface-muted)_55%,transparent)]"
                }
              >
                <Td
                  className="px-3 py-3 text-center tabular-nums"
                  style={{ color: "var(--ow-text-muted)", ...strikeStyle }}
                >
                  {(index + 1).toLocaleString("he-IL")}
                </Td>
                <Td
                  className="px-3 py-3 font-medium whitespace-nowrap"
                  style={strikeStyle}
                >
                  {partLabel}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  style={strikeStyle}
                >
                  {cellNumber(row.quantity)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  style={strikeStyle}
                >
                  {cellNumber(row.thicknessMm)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap"
                  style={strikeStyle}
                >
                  {row.material?.trim() || "—"}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  withSeparator
                  style={strikeStyle}
                >
                  {formatDimMm(lengthMm)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  style={strikeStyle}
                >
                  {formatDimMm(widthMm)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  withSeparator
                  style={strikeStyle}
                >
                  {formatWeightKgCell(row.commercial.unitWeightKg, 3)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  style={strikeStyle}
                >
                  {formatWeightKgCell(row.commercial.totalWeightKg, 2)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  style={strikeStyle}
                >
                  {formatAreaM2Cell(unitArea, 4)}
                </Td>
                <Td
                  className="px-3 py-3 whitespace-nowrap tabular-nums"
                  style={strikeStyle}
                >
                  {unitArea == null || !Number.isFinite(unitArea)
                    ? "—"
                    : formatAreaM2Cell(totalArea, 3)}
                </Td>
                <Td className="px-3 py-3" withSeparator>
                  <FinishSelectCell
                    finish={opts.finish}
                    disabled={frozen}
                    partId={partLabel}
                    onChange={(next) => onFinishChange(materialRowId, next)}
                  />
                </Td>
                <Td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={opts.isCheckeredPlate}
                    disabled={frozen}
                    aria-label={`סמן פח מרוג עבור הפריט ${partLabel}`}
                    title="פח מרוג"
                    className="h-4 w-4 accent-[var(--ow-accent)] disabled:cursor-not-allowed disabled:opacity-55"
                    onChange={(e) =>
                      onCheckeredPlateChange(materialRowId, e.target.checked)
                    }
                  />
                </Td>
                <Td className="px-3 py-3 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg p-0 shadow-none"
                    style={{ color: "var(--ow-text-secondary)" }}
                    aria-pressed={frozen}
                    aria-label={
                      frozen
                        ? `החזר את הפריט ${partLabel}`
                        : `הקפא את הפריט ${partLabel}`
                    }
                    title={frozen ? "החזר פריט" : "הקפא פריט"}
                    onClick={() => onToggleFreeze(row)}
                    data-testid={`freeze-toggle-${materialRowId}`}
                  >
                    {frozen ? (
                      <RotateCcw className="h-4 w-4" aria-hidden />
                    ) : (
                      <CirclePause className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </Td>
                <Td className="px-3 py-3 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg p-0 shadow-none"
                    style={{ color: "var(--ow-text-secondary)" }}
                    aria-label={`צפה בפריט ${partLabel}`}
                    title="צפה בפריט"
                    onClick={() => onView(row.id)}
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
