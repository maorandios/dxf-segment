"use client";

/**
 * Placeholder legal modals for auth — body copy filled in later.
 */

import { FileText, Shield } from "lucide-react";
import { AccountModalShell } from "@/features/accountModals/AccountModalShell";

export type AuthLegalDoc = "terms" | "privacy" | null;

const COPY: Record<
  Exclude<AuthLegalDoc, null>,
  { title: string; description: string; placeholder: string }
> = {
  terms: {
    title: "מדיניות השימוש",
    description: "תנאי השימוש במערכת סגמנט",
    placeholder: "תוכן מדיניות השימוש יתווסף כאן בהמשך.",
  },
  privacy: {
    title: "תנאי הפרטיות",
    description: "מדיניות הפרטיות של סגמנט",
    placeholder: "תוכן תנאי הפרטיות יתווסף כאן בהמשך.",
  },
};

export function AuthLegalModal({
  doc,
  onClose,
}: {
  doc: AuthLegalDoc;
  onClose: () => void;
}) {
  const open = doc != null;
  const meta = doc ? COPY[doc] : null;
  const Icon = doc === "privacy" ? Shield : FileText;

  return (
    <AccountModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={meta?.title ?? ""}
      titleIcon={Icon}
      closeAriaLabel="סגירה"
      description={meta?.description}
      contentClassName="z-[60]"
    >
      <div className="px-5 py-5">
        <p className="text-[13px] leading-relaxed text-[#5C6978]">
          {meta?.placeholder}
        </p>
      </div>
    </AccountModalShell>
  );
}
