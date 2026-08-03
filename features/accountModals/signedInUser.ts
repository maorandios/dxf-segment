/**
 * Signed-in account identity shown in the header / account menu.
 * Used for PDF letterhead email and read-only settings display.
 * Prefers the in-memory auth stub session when present (Supabase later).
 */

import { getAuthSession } from "@/features/auth/authSession";
import { getAppPreferences } from "@/lib/settings/appPreferences";

export type SignedInUser = {
  fullName: string;
  email: string;
};

/** Fallback identity when no auth session is active (legacy / non-gated surfaces). */
export const SIGNED_IN_USER: SignedInUser = {
  fullName: "מאור סבג",
  email: "Maor.andios@gmail.com",
};

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "משתמש";
  return local;
}

export function getSignedInUser(): SignedInUser {
  const session = getAuthSession();
  if (session) {
    return {
      email: session.email,
      fullName: displayNameFromEmail(session.email),
    };
  }
  return SIGNED_IN_USER;
}

export function getSignedInUserEmail(): string {
  return getSignedInUser().email.trim();
}

export function getSignedInUserFullName(): string {
  return getSignedInUser().fullName.trim();
}

/**
 * Display name for greetings / header.
 * Prefers company-settings contact name; falls back to signed-in full name.
 */
export function getDisplayContactName(): string {
  const prefs = getAppPreferences();
  const fromSettings =
    typeof prefs.contactName === "string" ? prefs.contactName.trim() : "";
  if (fromSettings) return fromSettings;
  return getSignedInUserFullName() || "משתמש";
}
