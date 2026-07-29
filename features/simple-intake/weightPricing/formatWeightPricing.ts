/**
 * Display formatters for weight pricing — store raw numbers in the draft.
 */

export function formatPricingWeightKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function formatPricePerKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

export function formatMoneyIls(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

export function formatPricingMetricValue(
  value: number,
  fractionDigits: number
): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("he-IL", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Parse user numeric input; empty → null; reject negatives. */
export function parseNonNegativePriceInput(
  raw: string
): number | null | undefined {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
