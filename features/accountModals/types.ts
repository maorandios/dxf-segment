/**
 * OMEGA — Account Menu Modals v1 types.
 */

export type AccountModalType =
  | "COMPANY_SETTINGS"
  | "MATERIAL_SETTINGS"
  | "BILLING_USAGE"
  | null;

export type CompanySettings = {
  companyName: string;
  companyRegistrationNumber: string;
  address: string;
  phone: string;
  email: string;
  contactName: string;
};

export type BillingUsageSummary = {
  renewalDate: string | null;
  currentCredits: number | null;
};

export function emptyCompanySettings(): CompanySettings {
  return {
    companyName: "",
    companyRegistrationNumber: "",
    address: "",
    phone: "",
    email: "",
    contactName: "",
  };
}
