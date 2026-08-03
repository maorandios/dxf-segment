"use client";

import { closeAccountModal, useAccountModal } from "./accountModalStore";
import { BillingUsageModal } from "./BillingUsageModal";
import { CompanySettingsModal } from "./CompanySettingsModal";
import { MaterialSettingsModal } from "./MaterialSettingsModal";
import "./account-modal.css";

/** Mount once at app chrome — renders the active account modal. */
export function AccountModalsHost() {
  const active = useAccountModal();

  return (
    <>
      <CompanySettingsModal
        open={active === "COMPANY_SETTINGS"}
        onClose={closeAccountModal}
      />
      <MaterialSettingsModal
        open={active === "MATERIAL_SETTINGS"}
        onClose={closeAccountModal}
      />
      <BillingUsageModal
        open={active === "BILLING_USAGE"}
        onClose={closeAccountModal}
      />
    </>
  );
}
