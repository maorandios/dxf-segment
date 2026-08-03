/**
 * Company settings ↔ omega_users (with local AppPreferences mirror for PDF letterhead).
 * Login email is identity — read-only from authenticated profile.
 */

import {
  getAppPreferences,
  saveAppPreferences,
} from "@/lib/settings/appPreferences";
import {
  getCurrentOmegaUser,
  setCurrentOmegaUser,
} from "@/features/auth/authSession";
import { getSignedInUserEmail } from "./signedInUser";
import { emptyCompanySettings, type CompanySettings } from "./types";
import type { OmegaCurrentUser } from "@/lib/auth/omegaUser";

/** Optional email: empty is valid; non-empty must look like an email. */
export function isValidOptionalEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function loadCompanySettings(): CompanySettings {
  const user = getCurrentOmegaUser();
  if (user) {
    return {
      companyName: user.companyName ?? "",
      companyRegistrationNumber: user.companyRegistrationNumber ?? "",
      address: user.address ?? "",
      phone: user.phone ?? "",
      email: user.email,
      contactName: user.contactName ?? "",
    };
  }
  const p = getAppPreferences();
  return {
    companyName: typeof p.companyName === "string" ? p.companyName : "",
    companyRegistrationNumber:
      typeof p.companyRegistrationNumber === "string"
        ? p.companyRegistrationNumber
        : "",
    address: typeof p.companyAddress === "string" ? p.companyAddress : "",
    phone: typeof p.companyPhone === "string" ? p.companyPhone : "",
    email: getSignedInUserEmail(),
    contactName: typeof p.contactName === "string" ? p.contactName : "",
  };
}

function mirrorLocalPreferences(settings: CompanySettings): void {
  const base = getAppPreferences();
  const reg = settings.companyRegistrationNumber;
  saveAppPreferences({
    ...base,
    companyName: settings.companyName.trim() || undefined,
    companyRegistrationNumber:
      typeof reg === "string" && reg.trim() ? reg.trim() : undefined,
    companyAddress: settings.address.trim() || undefined,
    companyPhone: settings.phone.trim() || undefined,
    contactName: settings.contactName.trim() || undefined,
  });
}

/**
 * Persist permitted company fields via server RPC; mirror to local prefs for PDF.
 * Signed-in email is never overwritten.
 */
export async function saveCompanySettingsAsync(
  settings: CompanySettings
): Promise<{ ok: true; user: OmegaCurrentUser } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/auth/update-company-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        companyName: settings.companyName,
        companyRegistrationNumber: settings.companyRegistrationNumber,
        address: settings.address,
        phone: settings.phone,
        contactName: settings.contactName,
      }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      message?: string;
      user?: OmegaCurrentUser;
    };
    if (!res.ok || !json.ok || !json.user) {
      return {
        ok: false,
        message: json.message ?? "לא ניתן לשמור את פרטי החברה",
      };
    }
    setCurrentOmegaUser(json.user);
    mirrorLocalPreferences(settings);
    return { ok: true, user: json.user };
  } catch {
    return { ok: false, message: "לא ניתן לשמור את פרטי החברה" };
  }
}

/**
 * Sync local-only mirror (used by tests / offline stubs).
 * Prefer saveCompanySettingsAsync in the UI.
 */
export function saveCompanySettings(settings: CompanySettings): void {
  mirrorLocalPreferences(settings);
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
    a.contactName === b.contactName
  );
}

export { emptyCompanySettings };
