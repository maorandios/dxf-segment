"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
} from "react";
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
  formatMoneyIls,
  formatPricePerKg,
  formatPricingWeightKg,
  parseNonNegativePriceInput,
} from "./formatWeightPricing";
import type {
  PricingGroupKey,
  WeightPricingDefaults,
  WeightPricingGroup,
  WeightPricingGroupDraft,
} from "./types";

const MUTED_GRAY = "var(--ow-text-muted)";
const ATTENTION_SOFT = "var(--ow-attention-soft, #fff7e6)";

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
      className={`sticky top-0 z-20 whitespace-nowrap px-2.5 py-2 text-[11px] font-medium ${className ?? ""}`}
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
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <td
      className={className}
      style={{
        borderBottom: "1px solid var(--ow-border, #e4e7ec)",
        ...style,
      }}
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
      className="h-8 w-[5.5rem] rounded-lg px-2 text-[13px] tabular-nums"
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

export function WeightPricingTable({
  groups,
  defaults,
  invalidGroupKeys,
  focusGroupKey,
  focusRequestId = 0,
  onPatchGroup,
  onViewGroup,
}: {
  groups: WeightPricingGroup[];
  defaults: WeightPricingDefaults;
  invalidGroupKeys: ReadonlySet<PricingGroupKey>;
  focusGroupKey: PricingGroupKey | null;
  focusRequestId?: number;
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
  }, [focusGroupKey, focusRequestId, groups]);

  return (
    <div
      className="rounded-[var(--ow-radius-lg)] border"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
      data-weight-pricing-table="true"
    >
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[1100px] border-separate border-spacing-0 text-right text-[13px]"
          aria-label="טבלת תמחור לפי משקל"
        >
          <thead>
            <tr style={{ backgroundColor: "var(--ow-surface-muted, #F2F4F7)" }}>
              <ColHeader label="#" className="w-10 text-center" />
              <ColHeader label={'עובי (מ"מ)'} className="w-20" />
              <ColHeader label="סוג חומר" />
              <ColHeader label="גימור" className="w-24" />
              <ColHeader label="פח מרוג" className="w-20" />
              <ColHeader label="פריטים" className="w-16" />
              <ColHeader label="כמות" className="w-16" />
              <ColHeader label={'משקל (ק"ג)'} className="w-24" />
              <ColHeader label="מחיר לפי גימור" className="w-28" />
              <ColHeader label="תוספת פח מרוג" className="w-28" />
              <ColHeader label={'מחיר סופי לק"ג'} className="w-[8.5rem]" />
              <ColHeader label='סה"כ' className="w-28" />
              <ColHeader label="צפייה" className="w-14 text-center" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group, index) => {
              const calc = calculateWeightPricingGroup(group, defaults);
              const invalid = invalidGroupKeys.has(group.groupKey);
              const groupLabel = formatPricingGroupLabelHe(group);
              return (
                <tr
                  key={group.groupKey}
                  data-pricing-group={group.groupKey}
                >
                  <Td
                    className="px-2.5 py-2.5 text-center tabular-nums"
                    style={{ color: MUTED_GRAY }}
                  >
                    {(index + 1).toLocaleString("he-IL")}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums whitespace-nowrap">
                    {formatThicknessMmCell(group.thicknessMm)}
                  </Td>
                  <Td className="px-2.5 py-2.5 font-medium whitespace-nowrap">
                    {group.material}
                  </Td>
                  <Td className="px-2.5 py-2.5 whitespace-nowrap">
                    {formatFinishLabelHe(group.finish)}
                  </Td>
                  <Td className="px-2.5 py-2.5 whitespace-nowrap">
                    {formatCheckeredPlateExportHe(group.isCheckeredPlate)}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums">
                    {group.itemCount.toLocaleString("he-IL")}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums">
                    {group.totalQuantity.toLocaleString("he-IL")}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums">
                    {formatPricingWeightKg(group.totalWeightKg)}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums whitespace-nowrap">
                    {formatPricePerKg(calc.finishBasePricePerKg)}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums whitespace-nowrap">
                    {group.isCheckeredPlate
                      ? formatPricePerKg(calc.applicableCheckeredAddonPerKg)
                      : (
                          <span style={{ color: MUTED_GRAY }}>—</span>
                        )}
                  </Td>
                  <Td className="px-2.5 py-2.5">
                    <div className="inline-flex items-center gap-1">
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
                          className="h-8 w-8 rounded-lg p-0 shadow-none"
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
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums whitespace-nowrap font-medium">
                    {formatMoneyIls(calc.groupTotal)}
                  </Td>
                  <Td className="px-2.5 py-2.5 text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg p-0 shadow-none"
                      style={{ color: "var(--ow-text-secondary)" }}
                      aria-label={`צפה בקבוצה ${groupLabel}`}
                      title="צפייה"
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
    </div>
  );
}
