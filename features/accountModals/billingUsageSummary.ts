/**
 * Billing / usage summary from authenticated omega_users profile.
 */

import { formatInteger } from "@/lib/formatNumbers";
import { getCurrentOmegaUser } from "@/features/auth/authSession";
import type { BillingUsageSummary } from "./types";

/** Trial → no renewal; permanent → next UTC month start from profile. */
export function getBillingUsageSummary(): BillingUsageSummary {
  const user = getCurrentOmegaUser();
  if (!user) {
    return {
      renewalDate: null,
      currentCredits: null,
    };
  }
  return {
    renewalDate: user.accountStatus === "trial" ? null : user.renewalDate,
    currentCredits: user.creditsBalance,
  };
}

/** Localized date display; trial uses לא מתחדש via BILLING_NO_RENEWAL_LABEL. */
export function formatBillingRenewalDate(
  value: string | null | undefined
): string | null {
  if (value == null || !String(value).trim()) return null;
  const raw = String(value).trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw);
  if (!Number.isFinite(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatBillingCredits(
  value: number | null | undefined
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return formatInteger(value);
}

export const BILLING_UNAVAILABLE_LABEL = "לא זמין";
export const BILLING_NO_RENEWAL_LABEL = "לא מתחדש";
