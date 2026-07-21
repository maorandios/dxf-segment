"use client";

import { UserAccountMenu, type UploadScreenUser } from "./UserAccountMenu";

export function WorkbookUploadHeader({
  quotationTitle = "הצעת מחיר חדשה",
  user,
}: {
  quotationTitle?: string;
  user: UploadScreenUser;
}) {
  return (
    <header
      className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b ps-4 pe-5 sm:h-16 sm:ps-6 sm:pe-8"
      style={{
        backgroundColor: "var(--us-surface)",
        borderColor: "var(--us-border)",
      }}
    >
      {/* Brand — visual right in RTL (first column) */}
      <div className="min-w-0 justify-self-start text-start">
        <p
          className="text-[14px] font-semibold tracking-[0.05em]"
          style={{ color: "var(--us-text)" }}
        >
          OMEGA
        </p>
        {quotationTitle ? (
          <p
            className="truncate text-[12px]"
            style={{ color: "var(--us-text-muted)" }}
          >
            {quotationTitle}
          </p>
        ) : null}
      </div>

      {/* Center spacer keeps brand/user balanced; greeting lives in main */}
      <div className="justify-self-center" aria-hidden />

      <div className="justify-self-end pe-1 sm:pe-2">
        <UserAccountMenu user={user} />
      </div>
    </header>
  );
}
