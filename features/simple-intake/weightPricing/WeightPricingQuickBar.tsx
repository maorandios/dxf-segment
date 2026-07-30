"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseNonNegativePriceInput } from "./formatWeightPricing";
import type { WeightPricingDefaults } from "./types";

export function WeightPricingQuickBar({
  defaults,
  onApply,
}: {
  defaults: WeightPricingDefaults;
  onApply: (values: {
    blackPricePerKg: number | null;
    galvanizedPricePerKg: number | null;
    checkeredPlateAddonPerKg: number | null;
  }) => void;
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

  return (
    <div
      className="mb-4 rounded-[var(--ow-radius-lg)] border px-4 py-3"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface)",
      }}
      data-weight-pricing-quick-bar="true"
      dir="rtl"
    >
      <div
        className="mb-2 text-[13px] font-semibold"
        style={{ color: "var(--ow-text)" }}
      >
        החלה מהירה
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[7.5rem] flex-1 space-y-1">
          <span
            className="block text-[11px] font-medium"
            style={{ color: "var(--ow-text-muted)" }}
          >
            מחיר שחור לק״ג
          </span>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={black}
            onChange={(e) => setBlack(e.target.value)}
            className="h-9 rounded-xl"
            inputMode="decimal"
            data-quick-field="blackPricePerKg"
          />
        </label>
        <label className="min-w-[7.5rem] flex-1 space-y-1">
          <span
            className="block text-[11px] font-medium"
            style={{ color: "var(--ow-text-muted)" }}
          >
            מחיר מגולוון לק״ג
          </span>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={galv}
            onChange={(e) => setGalv(e.target.value)}
            className="h-9 rounded-xl"
            inputMode="decimal"
            data-quick-field="galvanizedPricePerKg"
          />
        </label>
        <label className="min-w-[7.5rem] flex-1 space-y-1">
          <span
            className="block text-[11px] font-medium"
            style={{ color: "var(--ow-text-muted)" }}
          >
            תוספת פח מרוג לק״ג
          </span>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={checkered}
            onChange={(e) => setCheckered(e.target.value)}
            className="h-9 rounded-xl"
            inputMode="decimal"
            data-quick-field="checkeredPlateAddonPerKg"
          />
        </label>
        <Button
          type="button"
          className="h-9 rounded-xl px-4"
          style={{
            backgroundColor: "var(--ow-accent)",
            color: "var(--ow-accent-fg)",
          }}
          onClick={handleApply}
        >
          החל על הקבוצות
        </Button>
      </div>
    </div>
  );
}
