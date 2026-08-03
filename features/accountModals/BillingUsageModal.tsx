"use client";

import { useMemo } from "react";
import {
  AccountModalShell,
  ACCOUNT_MODAL_COLORS,
} from "./AccountModalShell";
import {
  BILLING_UNAVAILABLE_LABEL,
  formatBillingCredits,
  formatBillingRenewalDate,
  getBillingUsageSummary,
} from "./billingUsageSummary";

function InfoCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{
        borderColor: ACCOUNT_MODAL_COLORS.border,
        backgroundColor: "#F8FAFB",
      }}
      data-billing-card={testId}
    >
      <p
        className="text-[12px] font-medium"
        style={{ color: ACCOUNT_MODAL_COLORS.muted }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 text-[18px] font-semibold tabular-nums"
        style={{ color: ACCOUNT_MODAL_COLORS.text }}
        data-billing-value={testId}
      >
        {value}
      </p>
    </div>
  );
}

export function BillingUsageModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const summary = useMemo(
    () => (open ? getBillingUsageSummary() : getBillingUsageSummary()),
    [open]
  );

  const renewalDisplay =
    formatBillingRenewalDate(summary.renewalDate) ?? BILLING_UNAVAILABLE_LABEL;
  const creditsDisplay =
    formatBillingCredits(summary.currentCredits) ?? BILLING_UNAVAILABLE_LABEL;

  return (
    <AccountModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="חיוב ושימוש"
      closeAriaLabel="סגור חיוב ושימוש"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-xl border bg-transparent px-4 text-[13px] font-medium transition-colors hover:bg-[#F2F4F7]"
          style={{
            borderColor: ACCOUNT_MODAL_COLORS.border,
            color: ACCOUNT_MODAL_COLORS.text,
          }}
        >
          סגור
        </button>
      }
    >
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        data-billing-usage-modal="true"
        dir="rtl"
      >
        <InfoCard
          label="מועד חידוש חבילה"
          value={renewalDisplay}
          testId="renewalDate"
        />
        <InfoCard
          label="כמות קרדיטים עדכנית"
          value={creditsDisplay}
          testId="currentCredits"
        />
      </div>
    </AccountModalShell>
  );
}
