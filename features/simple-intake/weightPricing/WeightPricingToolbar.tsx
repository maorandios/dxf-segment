"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, FileSpreadsheet } from "lucide-react";

function Segment({
  onClick,
  children,
  primary,
  disabled,
  title,
}: {
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
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
        "disabled:pointer-events-none disabled:opacity-50",
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
 * RTL visual order: חזרה לרשימה | ייצא דוח EXCEL | המשך לסיכום
 */
export function WeightPricingToolbar({
  onBack,
  onExportExcel,
  onContinue,
  exportBusy,
}: {
  onBack: () => void;
  onExportExcel: () => void;
  onContinue: () => void;
  exportBusy?: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="פעולות תמחור הצעת מחיר"
      data-weight-pricing-toolbar="true"
      className="inline-flex max-w-full flex-wrap overflow-hidden rounded-2xl border"
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: "var(--ow-surface, #ffffff)",
      }}
    >
      <Segment onClick={onBack} title="חזרה לרשימה">
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        חזרה לרשימה
      </Segment>
      <Sep />
      <Segment
        onClick={onExportExcel}
        disabled={exportBusy}
        title="ייצא דוח EXCEL"
      >
        <FileSpreadsheet
          className="h-4 w-4 shrink-0"
          strokeWidth={1.75}
          aria-hidden
        />
        ייצא דוח EXCEL
      </Segment>
      <Sep />
      <Segment onClick={onContinue} primary title="המשך לסיכום">
        המשך לסיכום
        <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      </Segment>
    </div>
  );
}
