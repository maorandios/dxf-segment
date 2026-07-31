"use client";

import { type TdHTMLAttributes, useEffect } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
} from "../quoteItemCommercialOptions";
import { formatPricingGroupLabelHe } from "./buildPricingGroupKey";
import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import {
  formatNestingUtilizationColumn,
  formatNestingWastePercentColumn,
  formatNestingWasteWeightColumn,
} from "./formatPricingNestingEstimate";
import {
  formatMoneyIls,
  formatPricePerKg,
  formatPricingWeightKg,
  parseNonNegativePriceInput,
} from "./formatWeightPricing";
import {
  emptyPricingGroupNestingEstimate,
  type PricingGroupNestingEstimate,
} from "./pricingGroupNestingTypes";
import type {
  PricingGroupKey,
  WeightPricingDefaults,
  WeightPricingGroup,
  WeightPricingGroupDraft,
} from "./types";

const MUTED_GRAY = "var(--ow-text-muted)";
const ATTENTION_SOFT = "var(--ow-attention-soft, #fff7e6)";
/** Matches waste accent on the buy-vs-waste metrics card. */
const WASTE_ALERT_RED = "#F41C00";
const WASTE_PERCENT_ALERT_THRESHOLD = 40;

function formatThicknessMmCell(thicknessMm: number): string {
  if (!Number.isFinite(thicknessMm)) return "—";
  return thicknessMm.toLocaleString("he-IL", {
    maximumFractionDigits: 2,
  });
}

function ColHeader({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`sticky top-0 z-20 whitespace-nowrap px-1.5 py-2 text-[10px] font-medium ${className ?? ""}`}
      style={{
        color: MUTED_GRAY,
        backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
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
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={className}
      style={{
        borderBottom: "1px solid var(--ow-border, #e4e7ec)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

function FinalPriceCellInput({
  displayValue,
  invalid,
  ariaLabel,
  dataGroupKey,
  onCommit,
}: {
  displayValue: number | null;
  invalid?: boolean;
  ariaLabel: string;
  dataGroupKey: string;
  onCommit: (next: number | null) => void;
}) {
  const display =
    displayValue == null || !Number.isFinite(displayValue)
      ? ""
      : String(displayValue);

  return (
    <Input
      type="number"
      min={0}
      step={0.01}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      data-pricing-group-key={dataGroupKey}
      data-pricing-field="finalPricePerKg"
      defaultValue={display}
      key={`${dataGroupKey}:final:${display}`}
      className="h-7 w-[4.5rem] rounded-md px-1.5 text-[12px] tabular-nums"
      style={invalid ? { backgroundColor: ATTENTION_SOFT } : undefined}
      inputMode="decimal"
      onBlur={(e) => {
        const parsed = parseNonNegativePriceInput(e.target.value);
        if (parsed === undefined) {
          e.target.value = display;
          return;
        }
        onCommit(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function NestingMetricCell({
  estimate,
  text,
  field,
}: {
  estimate: PricingGroupNestingEstimate;
  text: string;
  field: "utilization" | "wastePercent" | "wasteWeight";
}) {
  const muted =
    estimate.status !== "READY" ||
    estimate.utilizationPercent == null;

  return (
    <span
      className="relative z-[1] tabular-nums text-[12px] leading-none whitespace-nowrap"
      style={{ color: muted ? MUTED_GRAY : "var(--ow-text)" }}
      data-pricing-nesting-cell={field}
      data-pricing-nesting-status={estimate.status}
    >
      {text}
    </span>
  );
}

function isHighWastePercent(estimate: PricingGroupNestingEstimate): boolean {
  return (
    estimate.status === "READY" &&
    estimate.wastePercent != null &&
    Number.isFinite(estimate.wastePercent) &&
    estimate.wastePercent > WASTE_PERCENT_ALERT_THRESHOLD
  );
}

/** Solid red alert dot under high-%-פחת values (>40%). */
function HighWasteAlertDot() {
  return (
    <span
      aria-hidden
      className="mt-1 inline-block h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: WASTE_ALERT_RED }}
      data-pricing-waste-alert-dot="true"
    />
  );
}

export function WeightPricingTable({
  groups,
  defaults,
  invalidGroupKeys,
  focusGroupKey,
  focusRequestId = 0,
  selectedPricingGroupKey = null,
  nestingEstimatesByKey,
  onPatchGroup,
  onViewGroup,
}: {
  groups: WeightPricingGroup[];
  defaults: WeightPricingDefaults;
  invalidGroupKeys: ReadonlySet<PricingGroupKey>;
  focusGroupKey: PricingGroupKey | null;
  focusRequestId?: number;
  /** Row open in the side panel — same accent highlight as gaps/final tables. */
  selectedPricingGroupKey?: PricingGroupKey | null;
  nestingEstimatesByKey?: ReadonlyMap<
    PricingGroupKey,
    PricingGroupNestingEstimate
  >;
  onPatchGroup: (
    groupKey: PricingGroupKey,
    patch: Partial<WeightPricingGroupDraft>
  ) => void;
  onViewGroup: (groupKey: PricingGroupKey) => void;
}) {
  useEffect(() => {
    if (!focusGroupKey) return;
    const el = document.querySelector<HTMLElement>(
      `[data-pricing-group-key="${CSS.escape(focusGroupKey)}"][data-pricing-field="finalPricePerKg"]`
    );
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // Intentionally omit `groups`: re-focusing on every draft/group update trapped
    // the caret in the empty cell and blocked clicking elsewhere after typing a price.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus only on explicit request
  }, [focusGroupKey, focusRequestId]);

  return (
    <div
      className="rounded-[var(--ow-radius-lg)] border"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
      data-weight-pricing-table="true"
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-right text-[12px]"
        aria-label="טבלת תמחור לפי משקל"
      >
        <colgroup>
          <col style={{ width: "2.5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "4%" }} />
          <col style={{ width: "4%" }} />
          <col style={{ width: "6.5%" }} />
          <col style={{ width: "5.5%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "6.5%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "4.5%" }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: "var(--ow-surface-muted, #F2F4F7)" }}>
            <ColHeader label="#" className="text-center" />
            <ColHeader label={'עובי (מ"מ)'} />
            <ColHeader label="סוג חומר" />
            <ColHeader label="גימור" />
            <ColHeader label="פח מרוג" />
            <ColHeader label="פריטים" />
            <ColHeader label="כמות" />
            <ColHeader label={'משקל (ק"ג)'} />
            <ColHeader label="% ניצול" />
            <ColHeader label="% פחת" />
            <ColHeader label={'פחת (ק"ג)'} />
            <ColHeader label="מחיר לפי גימור" />
            <ColHeader label="תוספת פח מרוג" />
            <ColHeader label={'מחיר סופי לק"ג'} />
            <ColHeader label='סה"כ' />
            <ColHeader label="צפייה" className="text-center" />
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const calc = calculateWeightPricingGroup(group, defaults);
            const invalid = invalidGroupKeys.has(group.groupKey);
            const groupLabel = formatPricingGroupLabelHe(group);
            const nesting =
              nestingEstimatesByKey?.get(group.groupKey) ??
              emptyPricingGroupNestingEstimate(group.groupKey, "IDLE");
            const highWaste = isHighWastePercent(nesting);
            const isSelectedRow =
              selectedPricingGroupKey != null &&
              selectedPricingGroupKey === group.groupKey;
            return (
              <tr
                key={group.groupKey}
                data-pricing-group={group.groupKey}
                data-selected={isSelectedRow ? "true" : "false"}
                aria-selected={isSelectedRow}
                style={{
                  backgroundColor: isSelectedRow
                    ? "color-mix(in srgb, var(--ow-accent) 12%, white)"
                    : undefined,
                  boxShadow: isSelectedRow
                    ? "inset -3px 0 0 var(--ow-accent)"
                    : undefined,
                }}
                className={
                  isSelectedRow
                    ? undefined
                    : "hover:bg-[color-mix(in_srgb,var(--ow-surface-muted)_55%,transparent)]"
                }
              >
                <Td
                  className="px-1.5 py-2 text-center tabular-nums"
                  style={{ color: MUTED_GRAY }}
                >
                  {(index + 1).toLocaleString("he-IL")}
                </Td>
                <Td className="px-1.5 py-2 tabular-nums whitespace-nowrap">
                  {formatThicknessMmCell(group.thicknessMm)}
                </Td>
                <Td className="px-1.5 py-2 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                  {group.material}
                </Td>
                <Td className="px-1.5 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatFinishLabelHe(group.finish)}
                </Td>
                <Td className="px-1.5 py-2 whitespace-nowrap">
                  {formatCheckeredPlateExportHe(group.isCheckeredPlate)}
                </Td>
                <Td className="px-1.5 py-2 tabular-nums">
                  {group.itemCount.toLocaleString("he-IL")}
                </Td>
                <Td className="px-1.5 py-2 tabular-nums">
                  {group.totalQuantity.toLocaleString("he-IL")}
                </Td>
                <Td className="px-1.5 py-2 tabular-nums overflow-hidden text-ellipsis">
                  {formatPricingWeightKg(group.totalWeightKg)}
                </Td>
                <Td className="px-1.5 py-2">
                  <NestingMetricCell
                    estimate={nesting}
                    text={formatNestingUtilizationColumn(nesting)}
                    field="utilization"
                  />
                </Td>
                <Td
                  className="px-1.5 py-2 tabular-nums"
                  data-pricing-waste-alert={highWaste ? "true" : undefined}
                >
                  <span className="inline-flex flex-col items-center gap-0">
                    <NestingMetricCell
                      estimate={nesting}
                      text={formatNestingWastePercentColumn(nesting)}
                      field="wastePercent"
                    />
                    {highWaste ? <HighWasteAlertDot /> : null}
                  </span>
                </Td>
                <Td className="px-1.5 py-2 tabular-nums">
                  <NestingMetricCell
                    estimate={nesting}
                    text={formatNestingWasteWeightColumn(nesting)}
                    field="wasteWeight"
                  />
                </Td>
                <Td className="px-1.5 py-2 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatPricePerKg(calc.finishBasePricePerKg)}
                </Td>
                <Td className="px-1.5 py-2 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
                  {group.isCheckeredPlate
                    ? formatPricePerKg(calc.applicableCheckeredAddonPerKg)
                    : (
                        <span style={{ color: MUTED_GRAY }}>—</span>
                      )}
                </Td>
                <Td className="px-1 py-2">
                  <div className="inline-flex max-w-full items-center gap-0.5">
                    <FinalPriceCellInput
                      displayValue={calc.finalPricePerKg}
                      invalid={invalid}
                      ariaLabel={`מחיר סופי לק״ג עבור ${groupLabel}`}
                      dataGroupKey={group.groupKey}
                      onCommit={(next) =>
                        onPatchGroup(group.groupKey, {
                          manualFinalPricePerKg: next,
                        })
                      }
                    />
                    {calc.isManualOverride ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 rounded-md p-0 shadow-none"
                        style={{ color: "var(--ow-text-secondary)" }}
                        title="איפוס למחיר המחושב"
                        aria-label="איפוס למחיר המחושב"
                        data-reset-manual={group.groupKey}
                        onClick={() =>
                          onPatchGroup(group.groupKey, {
                            manualFinalPricePerKg: null,
                          })
                        }
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </Td>
                <Td className="px-1.5 py-2 tabular-nums whitespace-nowrap font-medium overflow-hidden text-ellipsis">
                  {formatMoneyIls(calc.groupTotal)}
                </Td>
                <Td className="px-1 py-2 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg p-0 shadow-none"
                    style={{ color: "var(--ow-text-secondary)" }}
                    aria-label={`צפה בקבוצה ${groupLabel}`}
                    title="צפייה בקבוצה"
                    data-view-group={group.groupKey}
                    onClick={() => onViewGroup(group.groupKey)}
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
