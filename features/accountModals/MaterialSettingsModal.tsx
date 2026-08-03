"use client";

import {
  AccountModalShell,
  ACCOUNT_MODAL_COLORS,
} from "./AccountModalShell";

/**
 * Materials settings modal — empty content for now (no pricing/config).
 */
export function MaterialSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AccountModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="הגדרות חומרים"
      closeAriaLabel="סגור הגדרות חומרים"
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
        className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center"
        style={{
          borderColor: ACCOUNT_MODAL_COLORS.border,
          color: ACCOUNT_MODAL_COLORS.muted,
        }}
        data-material-settings-empty="true"
      >
        <p className="text-[13px] leading-relaxed">
          הגדרות חומרים יתווספו בהמשך
        </p>
      </div>
    </AccountModalShell>
  );
}
