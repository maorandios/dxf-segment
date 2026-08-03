/**
 * Signed-in account identity shown in the header / account menu.
 * Driven by Supabase omega_users profile (via auth session).
 */

import { getAuthSession, getCurrentOmegaUser } from "@/features/auth/authSession";

export type SignedInUser = {
  fullName: string;
  email: string;
};

/** Fallback only when no session — should not appear after OTP login. */
export const SIGNED_IN_USER: SignedInUser = {
  fullName: "משתמש",
  email: "",
};

export function getSignedInUser(): SignedInUser {
  const user = getCurrentOmegaUser();
  if (user) {
    const contact = user.contactName?.trim();
    const company = user.companyName?.trim();
    return {
      email: user.email,
      fullName: contact || company || "משתמש",
    };
  }
  const session = getAuthSession();
  if (session) {
    return {
      email: session.email,
      fullName: "משתמש",
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
 * Prefers contact name → company name → email local-part.
 */
export function getDisplayContactName(): string {
  const user = getCurrentOmegaUser();
  if (user) {
    const contact = user.contactName?.trim();
    if (contact) return contact;
    const company = user.companyName?.trim();
    if (company) return company;
  }
  return getSignedInUserFullName() || "משתמש";
}
