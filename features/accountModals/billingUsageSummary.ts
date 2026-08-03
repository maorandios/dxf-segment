/**
 * Billing / usage summary — isolated boundary for future billing data.
 * Does not invent renewal dates or credit counts.
 */

import { formatInteger } from "@/lib/formatNumbers";
import type { BillingUsageSummary } from "./types";

/** Read billing summary from current account state when available. */
export function getBillingUsageSummary(): BillingUsageSummary {
  return {
    renewalDate: null,
    currentCredits: null,
  };
}

/** Localized date display for billing renewal; unavailable → null. */
export function formatBillingRenewalDate(
  value: string | null | undefined
): string | null {
  if (value == null || !String(value).trim()) return null;
  const raw = String(value).trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  if (!Number.isFinite(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatBillingCredits(
  value: number | null | undefined
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return formatInteger(value);
}

export const BILLING_UNAVAILABLE_LABEL = "לא זמין";
