/**
 * Signed-in account identity shown in the header / account menu.
 * Used for PDF letterhead email and read-only settings display.
 * (Auth provider not wired yet — keep this as the single source of truth.)
 */

export type SignedInUser = {
  fullName: string;
  email: string;
};

export const SIGNED_IN_USER: SignedInUser = {
  fullName: "מאור סבג",
  email: "Maor.andios@gmail.com",
};

export function getSignedInUser(): SignedInUser {
  return SIGNED_IN_USER;
}

export function getSignedInUserEmail(): string {
  return SIGNED_IN_USER.email.trim();
}

export function getSignedInUserFullName(): string {
  return SIGNED_IN_USER.fullName.trim();
}
