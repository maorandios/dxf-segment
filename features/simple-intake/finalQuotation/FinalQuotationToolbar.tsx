"use client";

import { useId, type ReactNode } from "react";
import { ArrowRight, FileSpreadsheet, FileText, Search, X } from "lucide-react";

function Segment({
  onClick,
  children,
  primary,
  title,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  title?: string;
  disabled?: boolean;
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
        "disabled:pointer-events-none disabled:opacity-45",
        primary
          ? "bg-[var(--ow-accent)] text-[var(--ow-accent-fg)] hover:bg-[var(--ow-accent-hover,#115e59)]"
          : "bg-transparent text-[var(--ow-text)] hover:bg-[var(--ow-surface-muted,#f2f4f7)]",
      ].join(" ")}
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
 * RTL visual order: חיפוש פריט | חזרה לתמחור | ייצא Excel | ייצא PDF
 * (same search segment pattern as FinalQuoteListToolbar / GapWorkspaceToolbar)
 */
export function FinalQuotationToolbar({
  searchQuery,
  onSearchQueryChange,
  onBack,
  onExportExcel,
  onExportPdf,
  exportDisabled,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onBack: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  exportDisabled?: boolean;
}) {
  const searchId = useId();

  return (
    <div
      role="toolbar"
      aria-label="פעולות סיכום הצעת מחיר"
      data-final-quotation-toolbar="true"
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
          data-final-quotation-search="true"
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
      <Segment onClick={onBack} title="חזרה לתמחור">
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        חזרה לתמחור
      </Segment>
      <Sep />
      <Segment
        onClick={onExportExcel}
        title="ייצא Excel"
        disabled={exportDisabled}
      >
        <FileSpreadsheet className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        ייצא Excel
      </Segment>
      <Sep />
      <Segment
        onClick={onExportPdf}
        primary
        title="ייצא PDF"
        disabled={exportDisabled}
      >
        <FileText className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        ייצא PDF
      </Segment>
    </div>
  );
}
