"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCheckeredPlateExportHe,
  formatFinishLabelHe,
  type QuoteItemFinish,
} from "../quoteItemCommercialOptions";
import { parseNonNegativePriceInput } from "./formatWeightPricing";
import type { WeightPricingDefaults, WeightPricingGroup } from "./types";

export type WeightPricingGroupFilters = {
  finish: "ALL" | QuoteItemFinish;
  thicknessMm: "ALL" | string;
  checkered: "ALL" | "YES" | "NO";
  material: "ALL" | string;
};

export function defaultWeightPricingGroupFilters(): WeightPricingGroupFilters {
  return {
    finish: "ALL",
    thicknessMm: "ALL",
    checkered: "ALL",
    material: "ALL",
  };
}

export function filterWeightPricingGroups(
  groups: ReadonlyArray<WeightPricingGroup>,
  filters: WeightPricingGroupFilters
): WeightPricingGroup[] {
  return groups.filter((g) => {
    if (filters.finish !== "ALL" && g.finish !== filters.finish) return false;
    if (
      filters.thicknessMm !== "ALL" &&
      String(g.thicknessMm) !== filters.thicknessMm
    ) {
      return false;
    }
    if (filters.checkered === "YES" && !g.isCheckeredPlate) return false;
    if (filters.checkered === "NO" && g.isCheckeredPlate) return false;
    if (filters.material !== "ALL" && g.material !== filters.material) {
      return false;
    }
    return true;
  });
}

function PanelShell({
  title,
  children,
  testId,
  variant = "default",
}: {
  title: string;
  children: ReactNode;
  testId: string;
  variant?: "default" | "accent";
}) {
  const isAccent = variant === "accent";
  return (
    <div
      className="min-w-0 flex-1 rounded-[var(--ow-radius-lg)] border px-4 py-3"
      style={
        isAccent
          ? {
              borderColor: "var(--ow-accent, #0f766e)",
              backgroundColor: "var(--ow-accent, #0f766e)",
            }
          : {
              borderColor: "var(--ow-border)",
              backgroundColor:
                "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
            }
      }
      data-testid={testId}
      data-rates-panel-variant={isAccent ? "accent" : "default"}
      dir="rtl"
    >
      <div
        className="mb-2 text-[13px] font-semibold"
        style={{
          color: isAccent
            ? "var(--ow-accent-fg, #ffffff)"
            : "var(--ow-text)",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const RATES_CONTROL_STYLE = {
  borderColor: "var(--ow-accent-soft, #e7f6f3)",
  backgroundColor: "var(--ow-accent-soft, #e7f6f3)",
  color: "var(--ow-accent-hover, #115e59)",
} as const;

const RATES_FIELD_CLASS =
  "h-9 rounded-xl border shadow-none focus-visible:ring-[var(--ow-accent-hover,#115e59)]";

const RATES_BUTTON_CLASS =
  "h-9 rounded-xl border px-4 shadow-none hover:brightness-105";

function FilterSelect({
  label,
  value,
  onValueChange,
  placeholder,
  options,
  dataField,
}: {
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  dataField: string;
}) {
  return (
    <label className="min-w-0 flex-1 space-y-1">
      <span
        className="block text-[11px] font-medium"
        style={{ color: "var(--ow-text-muted)" }}
      >
        {label}
      </span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          className="h-9 rounded-xl border-[#e4e7ec] bg-white text-[#101828]"
          data-pricing-filter={dataField}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        {/* Portal mounts on body (outside .omega-workflow), so force light colors. */}
        <SelectContent className="border-[#e4e7ec] bg-white text-[#101828] shadow-md">
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-[#101828] focus:bg-[#f2f4f7] focus:text-[#101828] data-[state=checked]:bg-[#e7f6f3]"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function WeightPricingQuickBar({
  defaults,
  groups,
  filters,
  onFiltersChange,
  onApply,
  onReset,
}: {
  defaults: WeightPricingDefaults;
  groups: ReadonlyArray<WeightPricingGroup>;
  filters: WeightPricingGroupFilters;
  onFiltersChange: (next: WeightPricingGroupFilters) => void;
  onApply: (values: {
    blackPricePerKg: number | null;
    galvanizedPricePerKg: number | null;
    checkeredPlateAddonPerKg: number | null;
  }) => void;
  onReset: () => void;
}) {
  const [black, setBlack] = useState(
    defaults.blackPricePerKg != null ? String(defaults.blackPricePerKg) : ""
  );
  const [galv, setGalv] = useState(
    defaults.galvanizedPricePerKg != null
      ? String(defaults.galvanizedPricePerKg)
      : ""
  );
  const [checkered, setCheckered] = useState(
    defaults.checkeredPlateAddonPerKg > 0
      ? String(defaults.checkeredPlateAddonPerKg)
      : ""
  );

  const materialOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      if (g.material.trim()) set.add(g.material);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [groups]);

  const thicknessOptions = useMemo(() => {
    const set = new Set<number>();
    for (const g of groups) {
      if (Number.isFinite(g.thicknessMm)) set.add(g.thicknessMm);
    }
    return [...set].sort((a, b) => a - b);
  }, [groups]);

  function handleApply(): void {
    const blackParsed = parseNonNegativePriceInput(black);
    const galvParsed = parseNonNegativePriceInput(galv);
    const checkParsed = parseNonNegativePriceInput(checkered);
    if (
      blackParsed === undefined ||
      galvParsed === undefined ||
      checkParsed === undefined
    ) {
      return;
    }
    onApply({
      blackPricePerKg: blackParsed,
      galvanizedPricePerKg: galvParsed,
      checkeredPlateAddonPerKg: checkParsed,
    });
  }

  function handleReset(): void {
    setBlack("");
    setGalv("");
    setCheckered("");
    onReset();
  }

  return (
    <div
      className="mb-4 flex flex-col gap-3 lg:flex-row"
      data-weight-pricing-quick-bar="true"
      dir="rtl"
    >
      <PanelShell
        title="תעריפים לחיוב"
        testId="weight-pricing-rates-panel"
        variant="accent"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[6.5rem] flex-1 space-y-1">
            <span className="block text-[11px] font-medium text-white/75">
              מחיר שחור לק״ג
            </span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={black}
              onChange={(e) => setBlack(e.target.value)}
              className={RATES_FIELD_CLASS}
              style={RATES_CONTROL_STYLE}
              inputMode="decimal"
              data-quick-field="blackPricePerKg"
            />
          </label>
          <label className="min-w-[6.5rem] flex-1 space-y-1">
            <span className="block text-[11px] font-medium text-white/75">
              מחיר מגולוון לק״ג
            </span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={galv}
              onChange={(e) => setGalv(e.target.value)}
              className={RATES_FIELD_CLASS}
              style={RATES_CONTROL_STYLE}
              inputMode="decimal"
              data-quick-field="galvanizedPricePerKg"
            />
          </label>
          <label className="min-w-[6.5rem] flex-1 space-y-1">
            <span className="block text-[11px] font-medium text-white/75">
              תוספת פח מרוג לק״ג
            </span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={checkered}
              onChange={(e) => setCheckered(e.target.value)}
              className={RATES_FIELD_CLASS}
              style={RATES_CONTROL_STYLE}
              inputMode="decimal"
              data-quick-field="checkeredPlateAddonPerKg"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className={RATES_BUTTON_CLASS}
            style={RATES_CONTROL_STYLE}
            onClick={handleApply}
            data-quick-apply="true"
          >
            עדכן תעריפים
          </Button>
          <Button
            type="button"
            variant="outline"
            className={RATES_BUTTON_CLASS}
            style={RATES_CONTROL_STYLE}
            onClick={handleReset}
            data-quick-reset="true"
            title="איפוס תעריפים"
          >
            איפוס
          </Button>
        </div>
      </PanelShell>

      <PanelShell title="סינון קבוצות" testId="weight-pricing-filters-panel">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="עובי"
            value={filters.thicknessMm}
            dataField="thickness"
            placeholder="הכל"
            onValueChange={(next) =>
              onFiltersChange({ ...filters, thicknessMm: next })
            }
            options={[
              { value: "ALL", label: "הכל" },
              ...thicknessOptions.map((t) => ({
                value: String(t),
                label: `${t.toLocaleString("he-IL")} מ״מ`,
              })),
            ]}
          />
          <FilterSelect
            label="סוג חומר"
            value={filters.material}
            dataField="material"
            placeholder="הכל"
            onValueChange={(next) =>
              onFiltersChange({ ...filters, material: next })
            }
            options={[
              { value: "ALL", label: "הכל" },
              ...materialOptions.map((m) => ({ value: m, label: m })),
            ]}
          />
          <FilterSelect
            label="גימור"
            value={filters.finish}
            dataField="finish"
            placeholder="הכל"
            onValueChange={(next) =>
              onFiltersChange({
                ...filters,
                finish: next as WeightPricingGroupFilters["finish"],
              })
            }
            options={[
              { value: "ALL", label: "הכל" },
              { value: "BLACK", label: formatFinishLabelHe("BLACK") },
              { value: "GALVANIZED", label: formatFinishLabelHe("GALVANIZED") },
            ]}
          />
          <FilterSelect
            label="פח מרוג"
            value={filters.checkered}
            dataField="checkered"
            placeholder="הכל"
            onValueChange={(next) =>
              onFiltersChange({
                ...filters,
                checkered: next as WeightPricingGroupFilters["checkered"],
              })
            }
            options={[
              { value: "ALL", label: "הכל" },
              { value: "YES", label: formatCheckeredPlateExportHe(true) },
              { value: "NO", label: formatCheckeredPlateExportHe(false) },
            ]}
          />
        </div>
      </PanelShell>
    </div>
  );
}
