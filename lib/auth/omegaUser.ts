/**
 * Safe application profile DTO — never includes tokens, ledger internals,
 * or service-role credentials.
 */

export type OmegaAccountStatus = "trial" | "permanent";

export type OmegaCurrentUser = {
  email: string;
  companyName: string;
  companyRegistrationNumber: string | null;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  accountStatus: OmegaAccountStatus;
  creditsBalance: number;
  /** First day of next UTC calendar month for permanent; null for trial. */
  renewalDate: string | null;
  isActive: boolean;
};

export type OmegaUserRow = {
  email: string;
  company_name: string;
  company_registration_number: string | null;
  address: string | null;
  phone: string | null;
  contact_name: string | null;
  account_status: OmegaAccountStatus;
  credits_balance: number;
  credits_period_start: string;
  is_active: boolean;
  auth_user_id: string | null;
};

/** Next UTC calendar month start as YYYY-MM-DD, or null for trial. */
export function deriveRenewalDate(
  accountStatus: OmegaAccountStatus
): string | null {
  if (accountStatus !== "permanent") return null;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const next = m === 11 ? new Date(Date.UTC(y + 1, 0, 1)) : new Date(Date.UTC(y, m + 1, 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function toOmegaCurrentUser(row: OmegaUserRow): OmegaCurrentUser {
  return {
    email: row.email,
    companyName: row.company_name,
    companyRegistrationNumber: row.company_registration_number,
    address: row.address,
    phone: row.phone,
    contactName: row.contact_name,
    accountStatus: row.account_status,
    creditsBalance: row.credits_balance,
    renewalDate: deriveRenewalDate(row.account_status),
    isActive: row.is_active,
  };
}
