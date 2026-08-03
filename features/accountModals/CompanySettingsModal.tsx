"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Hash,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import {
  AccountModalShell,
  ACCOUNT_MODAL_COLORS,
} from "./AccountModalShell";
import {
  companySettingsEqual,
  loadCompanySettings,
  saveCompanySettingsAsync,
} from "./companySettingsPersistence";
import type { CompanySettings } from "./types";

const fieldClass =
  "h-10 w-full rounded-lg border bg-white px-3 text-right text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent,#0f766e)]";

function Field({
  id,
  label,
  icon: Icon,
  children,
  error,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span
        className="flex items-center gap-1.5 text-[12px] font-medium"
        style={{ color: ACCOUNT_MODAL_COLORS.muted }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      {children}
      {error ? (
        <span className="block text-[12px] text-red-600" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function CompanySettingsBody({
  onClose,
  bindRequestClose,
}: {
  onClose: () => void;
  bindRequestClose: (fn: () => void) => void;
}) {
  const baseId = useId();
  const initial = loadCompanySettings();
  const [draft, setDraft] = useState<CompanySettings>(initial);
  const [baseline, setBaseline] = useState<CompanySettings>(initial);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const dirty = useMemo(
    () => !companySettingsEqual(draft, baseline),
    [draft, baseline]
  );

  function patch(field: keyof CompanySettings, value: string): void {
    if (field === "email") return;
    setDraft((prev) => ({ ...prev, [field]: value }));
    setSaveMessage(null);
  }

  function requestClose(): void {
    if (dirty && !discardConfirm) {
      setDiscardConfirm(true);
      return;
    }
    setDiscardConfirm(false);
    onClose();
  }

  bindRequestClose(requestClose);

  async function handleSave(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveCompanySettingsAsync(draft);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    const saved = loadCompanySettings();
    setDraft(saved);
    setBaseline(saved);
    setSaveMessage("ההגדרות נשמרו");
    window.setTimeout(() => {
      onClose();
    }, 450);
  }

  const border = { borderColor: ACCOUNT_MODAL_COLORS.border };

  return (
    <>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        data-company-settings-form="true"
        dir="rtl"
      >
        <Field id={`${baseId}-name`} label="שם חברה" icon={Building2}>
          <input
            id={`${baseId}-name`}
            type="text"
            dir="rtl"
            autoComplete="organization"
            value={draft.companyName}
            onChange={(e) => patch("companyName", e.target.value)}
            className={fieldClass}
            style={border}
            data-field="companyName"
          />
        </Field>
        <Field id={`${baseId}-reg`} label="ח.פ" icon={Hash}>
          <input
            id={`${baseId}-reg`}
            type="text"
            inputMode="text"
            dir="rtl"
            autoComplete="off"
            value={draft.companyRegistrationNumber}
            onChange={(e) =>
              patch("companyRegistrationNumber", e.target.value)
            }
            className={fieldClass}
            style={border}
            data-field="companyRegistrationNumber"
          />
        </Field>
        <Field id={`${baseId}-address`} label="כתובת" icon={MapPin}>
          <input
            id={`${baseId}-address`}
            type="text"
            dir="rtl"
            autoComplete="street-address"
            value={draft.address}
            onChange={(e) => patch("address", e.target.value)}
            className={fieldClass}
            style={border}
            data-field="address"
          />
        </Field>
        <Field id={`${baseId}-phone`} label="טלפון" icon={Phone}>
          <input
            id={`${baseId}-phone`}
            type="tel"
            dir="rtl"
            autoComplete="tel"
            value={draft.phone}
            onChange={(e) => patch("phone", e.target.value)}
            className={fieldClass}
            style={border}
            data-field="phone"
          />
        </Field>
        <div className="block space-y-1.5">
          <span
            className="flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: ACCOUNT_MODAL_COLORS.muted }}
          >
            <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            דוא&quot;ל
          </span>
          <div
            className="flex h-10 w-full items-center justify-end rounded-lg border px-3 text-right text-[13px]"
            style={{
              borderColor: ACCOUNT_MODAL_COLORS.border,
              backgroundColor: "#F2F4F7",
              color: ACCOUNT_MODAL_COLORS.muted,
            }}
            dir="rtl"
            data-field="email"
            data-email-readonly="true"
            title="כתובת הדוא״ל משויכת לחשבון המחובר"
            aria-readonly="true"
          >
            <span className="min-w-0 truncate">{draft.email}</span>
          </div>
        </div>
        <Field id={`${baseId}-contact`} label="שם איש קשר" icon={UserRound}>
          <input
            id={`${baseId}-contact`}
            type="text"
            dir="rtl"
            autoComplete="name"
            value={draft.contactName}
            onChange={(e) => patch("contactName", e.target.value)}
            className={fieldClass}
            style={border}
            data-field="contactName"
          />
        </Field>
      </div>

      {discardConfirm ? (
        <div
          className="mt-4 rounded-xl border p-3"
          style={{
            borderColor: ACCOUNT_MODAL_COLORS.border,
            backgroundColor: "#F8FAFB",
          }}
          role="alertdialog"
          aria-labelledby={`${baseId}-discard-title`}
          data-unsaved-confirm="true"
        >
          <p
            id={`${baseId}-discard-title`}
            className="text-[13px] font-medium"
            style={{ color: ACCOUNT_MODAL_COLORS.text }}
          >
            יש שינויים שלא נשמרו. לסגור בכל זאת?
          </p>
          <div className="mt-3 flex flex-wrap gap-2" dir="ltr">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-[13px] font-medium"
              style={{
                backgroundColor: ACCOUNT_MODAL_COLORS.accent,
                color: ACCOUNT_MODAL_COLORS.accentFg,
              }}
              onClick={() => setDiscardConfirm(false)}
            >
              חזור לעריכה
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl border bg-transparent px-3 text-[13px] font-medium hover:bg-white"
              style={{
                borderColor: ACCOUNT_MODAL_COLORS.border,
                color: ACCOUNT_MODAL_COLORS.text,
              }}
              onClick={() => {
                setDiscardConfirm(false);
                onClose();
              }}
            >
              סגור ללא שמירה
            </button>
          </div>
        </div>
      ) : null}

      {saveError ? (
        <p
          className="mt-3 text-right text-[13px] font-medium text-red-600"
          role="alert"
          data-company-settings-error="true"
        >
          {saveError}
        </p>
      ) : null}

      {saveMessage ? (
        <p
          className="mt-3 text-right text-[13px] font-medium"
          style={{ color: ACCOUNT_MODAL_COLORS.accent }}
          data-company-settings-saved="true"
        >
          {saveMessage}
        </p>
      ) : null}

      <CompanySettingsActions
        onSave={() => void handleSave()}
        onCancel={requestClose}
        saving={saving}
      />
    </>
  );
}

function CompanySettingsActions({
  onSave,
  onCancel,
  saving = false,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-start gap-2 border-t pt-3"
      style={{ borderColor: ACCOUNT_MODAL_COLORS.border }}
      dir="ltr"
      data-company-settings-actions="true"
    >
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-medium transition-colors disabled:opacity-60"
        style={{
          backgroundColor: ACCOUNT_MODAL_COLORS.accent,
          color: ACCOUNT_MODAL_COLORS.accentFg,
        }}
        data-company-settings-save="true"
      >
        {saving ? "שומר..." : "שמור הגדרות"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-10 items-center justify-center rounded-xl border bg-transparent px-4 text-[13px] font-medium transition-colors hover:bg-[#F2F4F7]"
        style={{
          borderColor: ACCOUNT_MODAL_COLORS.border,
          color: ACCOUNT_MODAL_COLORS.text,
        }}
      >
        ביטול
      </button>
    </div>
  );
}

export function CompanySettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const requestCloseRef = useRef<() => void>(onClose);

  return (
    <AccountModalShell
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        requestCloseRef.current();
      }}
      title="הגדרות חברה"
      titleIcon={Building2}
      description="עדכנו את פרטי החברה שיופיעו בהצעות מחיר ובמסמכים מיוצאים."
      closeAriaLabel="סגור הגדרות חברה"
    >
      {open ? (
        <CompanySettingsBody
          onClose={onClose}
          bindRequestClose={(fn) => {
            requestCloseRef.current = fn;
          }}
        />
      ) : null}
    </AccountModalShell>
  );
}
