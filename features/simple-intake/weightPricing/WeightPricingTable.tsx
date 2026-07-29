"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
} from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFinishLabelHe, formatCheckeredPlateExportHe } from "../quoteItemCommercialOptions";
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
    <td className={className} style={style}>
      {children}
    </td>
  );
}

function PriceCellInput({
  value,
  disabled,
  invalid,
  ariaLabel,
  dataGroupKey,
  dataField,
  onCommit,
}: {
  value: number | null;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel: string;
  dataGroupKey: string;
  dataField: string;
  onCommit: (next: number | null) => void;
}) {
  const display =
    value == null || !Number.isFinite(value) ? "" : String(value);

  return (
    <Input
      type="number"
      min={0}
      step={0.01}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      data-pricing-group-key={dataGroupKey}
      data-pricing-field={dataField}
      defaultValue={display}
      key={`${dataGroupKey}:${dataField}:${display}`}
      className="h-8 w-[5.5rem] rounded-lg px-2 text-[13px] tabular-nums"
      style={
        invalid
          ? { backgroundColor: ATTENTION_SOFT }
          : disabled
            ? { opacity: 0.55 }
            : undefined
      }
      inputMode="decimal"
      onBlur={(e) => {
        if (disabled) return;
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
  invalidGroupKeys,
  focusGroupKey,
  focusRequestId = 0,
  onPatchGroup,
  onViewGroup,
}: {
  groups: WeightPricingGroup[];
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
      `[data-pricing-group-key="${CSS.escape(focusGroupKey)}"][data-pricing-field="basePricePerKg"]`
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
          className="w-full min-w-[1180px] border-separate border-spacing-0 text-right text-[13px]"
          aria-label="טבלת תמחור לפי משקל"
        >
          <thead>
            <tr style={{ backgroundColor: "var(--ow-surface-muted, #F2F4F7)" }}>
              <ColHeader label="#" className="w-10 text-center" />
              <ColHeader label={'עובי (מ"מ)'} className="w-20" />
              <ColHeader label="סוג חומר" />
              <ColHeader label="גימור" className="w-24" />
              <ColHeader label="פח מרוג" className="w-24" />
              <ColHeader label="פריטים" className="w-16" />
              <ColHeader label="כמות" className="w-16" />
              <ColHeader label={'משקל (ק"ג)'} className="w-24" />
              <ColHeader label={'מחיר בסיס לק"ג'} className="w-[7rem]" />
              <ColHeader label="תוספת גלוון" className="w-[6.5rem]" />
              <ColHeader label="תוספת עובי" className="w-[6.5rem]" />
              <ColHeader label="תוספת פח מרוג" className="w-[7rem]" />
              <ColHeader label={'מחיר סופי לק"ג'} className="w-24" />
              <ColHeader label='סה"כ' className="w-28" />
              <ColHeader label="צפייה" className="w-14 text-center" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group, index) => {
              const calc = calculateWeightPricingGroup(group);
              const invalid = invalidGroupKeys.has(group.groupKey);
              const baseInvalid =
                invalid &&
                (group.pricing.basePricePerKg == null ||
                  !(group.pricing.basePricePerKg > 0));
              const groupLabel = formatPricingGroupLabelHe(group);
              return (
                <tr
                  key={group.groupKey}
                  data-pricing-group={group.groupKey}
                  style={{ borderBottom: "1px solid var(--ow-border)" }}
                >
                  <Td className="px-2.5 py-2.5 text-center tabular-nums" style={{ color: MUTED_GRAY }}>
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
                  <Td className="px-2.5 py-2.5">
                    <PriceCellInput
                      value={group.pricing.basePricePerKg}
                      invalid={baseInvalid}
                      ariaLabel={`מחיר בסיס לק״ג עבור ${groupLabel}`}
                      dataGroupKey={group.groupKey}
                      dataField="basePricePerKg"
                      onCommit={(next) =>
                        onPatchGroup(group.groupKey, { basePricePerKg: next })
                      }
                    />
                  </Td>
                  <Td className="px-2.5 py-2.5">
                    {group.finish === "GALVANIZED" ? (
                      <PriceCellInput
                        value={group.pricing.galvanizedAddonPerKg}
                        ariaLabel="תוספת גלוון"
                        dataGroupKey={group.groupKey}
                        dataField="galvanizedAddonPerKg"
                        onCommit={(next) =>
                          onPatchGroup(group.groupKey, {
                            galvanizedAddonPerKg: next ?? 0,
                          })
                        }
                      />
                    ) : (
                      <span style={{ color: MUTED_GRAY }}>—</span>
                    )}
                  </Td>
                  <Td className="px-2.5 py-2.5">
                    <PriceCellInput
                      value={group.pricing.thicknessAddonPerKg}
                      ariaLabel="תוספת עובי"
                      dataGroupKey={group.groupKey}
                      dataField="thicknessAddonPerKg"
                      onCommit={(next) =>
                        onPatchGroup(group.groupKey, {
                          thicknessAddonPerKg: next ?? 0,
                        })
                      }
                    />
                  </Td>
                  <Td className="px-2.5 py-2.5">
                    {group.isCheckeredPlate ? (
                      <PriceCellInput
                        value={group.pricing.checkeredPlateAddonPerKg}
                        ariaLabel="תוספת פח מרוג"
                        dataGroupKey={group.groupKey}
                        dataField="checkeredPlateAddonPerKg"
                        onCommit={(next) =>
                          onPatchGroup(group.groupKey, {
                            checkeredPlateAddonPerKg: next ?? 0,
                          })
                        }
                      />
                    ) : (
                      <span style={{ color: MUTED_GRAY }}>—</span>
                    )}
                  </Td>
                  <Td className="px-2.5 py-2.5 tabular-nums whitespace-nowrap">
                    {formatPricePerKg(calc.finalPricePerKg)}
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
