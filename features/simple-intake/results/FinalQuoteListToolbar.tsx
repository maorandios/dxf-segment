"use client";

import { useId, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Search,
  X,
} from "lucide-react";

export type FinalQuoteListAction =
  | "APPROVE_LIST"
  | "EXPORT_EXCEL"
  | "BACK"
  | "SEARCH";

function Segment({
  onClick,
  children,
  primary,
  disabled,
  title,
  className,
}: {
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 px-3.5 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)] focus-visible:ring-inset",
        "disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "bg-[var(--ow-accent)] text-[var(--ow-accent-fg)] hover:bg-[var(--ow-accent-hover,#115e59)] disabled:hover:bg-[var(--ow-accent)]"
          : "bg-transparent text-[var(--ow-text)] hover:bg-[var(--ow-surface-muted,#f2f4f7)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <span
      aria-hidden
      className="h-full w-px shrink-0 self-stretch"
      style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
    />
  );
}

/**
 * RTL visual order inside the panel:
 * חיפוש פריט | חזרה | ייצא דוח EXCEL | אישור רשימה
 * (DOM first = visual right in RTL)
 */
export function FinalQuoteListToolbar({
  searchQuery,
  onSearchQueryChange,
  onApprove,
  onExportExcel,
  onBack,
  approveDisabled,
  approveDisabledReason,
  exportBusy,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onApprove: () => void;
  onExportExcel: () => void;
  onBack: () => void;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
  exportBusy?: boolean;
}) {
  const searchId = useId();

  return (
    <div
      role="toolbar"
      aria-label="פעולות רשימת הצעת מחיר"
      data-final-quote-toolbar="true"
      className="inline-flex max-w-full flex-wrap overflow-hidden rounded-2xl border"
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: "var(--ow-surface, #ffffff)",
      }}
    >
      <div className="inline-flex h-10 min-w-[10.5rem] flex-1 items-center gap-1.5 px-3 sm:w-[13.5rem] sm:flex-none">
        <Search
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--ow-text-muted, #98a2b3)" }}
          strokeWidth={1.75}
          aria-hidden
        />
        <label htmlFor={searchId} className="sr-only">
          חיפוש פריט
        </label>
        <input
          id={searchId}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="חיפוש פריט"
          className="gap-toolbar-search min-w-0 flex-1 border-0 bg-transparent py-0 text-[13px] text-[var(--ow-text)] outline-none placeholder:text-[var(--ow-text-muted,#98a2b3)]"
          autoComplete="off"
          spellCheck={false}
        />
        {searchQuery ? (
          <button
            type="button"
            aria-label="נקה חיפוש"
            title="נקה חיפוש"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)]"
            style={{ color: "var(--ow-text-muted, #98a2b3)" }}
            onClick={() => onSearchQueryChange("")}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>
      <Sep />
      <Segment onClick={onBack}>
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        חזרה
      </Segment>
      <Sep />
      <Segment onClick={onExportExcel} disabled={exportBusy}>
        <FileSpreadsheet
          className="h-4 w-4 shrink-0"
          strokeWidth={1.75}
          aria-hidden
        />
        ייצא דוח EXCEL
      </Segment>
      <Sep />
      <Segment
        onClick={onApprove}
        primary
        disabled={approveDisabled}
        title={
          approveDisabled
            ? (approveDisabledReason ??
              "לא ניתן לאשר רשימה ללא פריטים פעילים")
            : "אישור רשימה"
        }
      >
        <Check className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        אישור רשימה
      </Segment>
    </div>
  );
}
