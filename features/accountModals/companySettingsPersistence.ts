/**
 * Company settings ↔ AppPreferences persistence boundary.
 * Does not invent fake company values; only maps existing preference fields.
 */

import {
  getAppPreferences,
  saveAppPreferences,
} from "@/lib/settings/appPreferences";
import { emptyCompanySettings, type CompanySettings } from "./types";

/** Optional email: empty is valid; non-empty must look like an email. */
export function isValidOptionalEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function loadCompanySettings(): CompanySettings {
  const p = getAppPreferences();
  return {
    companyName: typeof p.companyName === "string" ? p.companyName : "",
    companyRegistrationNumber:
      typeof p.companyRegistrationNumber === "string"
        ? p.companyRegistrationNumber
        : "",
    address: typeof p.companyAddress === "string" ? p.companyAddress : "",
    phone: typeof p.companyPhone === "string" ? p.companyPhone : "",
    email: typeof p.companyEmail === "string" ? p.companyEmail : "",
    contactName: typeof p.contactName === "string" ? p.contactName : "",
  };
}

/**
 * Persist company modal fields through the existing AppPreferences boundary.
 * Registration number is always stored as a string (never Number).
 */
export function saveCompanySettings(settings: CompanySettings): void {
  const base = getAppPreferences();
  const reg = settings.companyRegistrationNumber;
  saveAppPreferences({
    ...base,
    companyName: settings.companyName.trim() || undefined,
    companyRegistrationNumber:
      typeof reg === "string" && reg.trim() ? reg.trim() : undefined,
    companyAddress: settings.address.trim() || undefined,
    companyPhone: settings.phone.trim() || undefined,
    companyEmail: settings.email.trim() || undefined,
    contactName: settings.contactName.trim() || undefined,
  });
}

export function companySettingsEqual(
  a: CompanySettings,
  b: CompanySettings
): boolean {
  return (
    a.companyName === b.companyName &&
    a.companyRegistrationNumber === b.companyRegistrationNumber &&
    a.address === b.address &&
    a.phone === b.phone &&
    a.email === b.email &&
    a.contactName === b.contactName
  );
}

export { emptyCompanySettings };
