/**
 * Shared email normalization — must match the database rule:
 * trim + lowercase. All lookups and inserts use this form.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const v = normalizeEmail(email);
  if (!v || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
