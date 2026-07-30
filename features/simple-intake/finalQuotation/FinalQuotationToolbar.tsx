"use client";

import type { ReactNode } from "react";
import { ArrowRight, FileSpreadsheet, FileText, Save } from "lucide-react";

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
 * RTL visual order: חזרה לתמחור | שמור טיוטה | ייצא Excel | ייצא PDF
 */
export function FinalQuotationToolbar({
  onBack,
  onSave,
  onExportExcel,
  onExportPdf,
  saveSuccess,
  exportDisabled,
}: {
  onBack: () => void;
  onSave: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  saveSuccess?: boolean;
  exportDisabled?: boolean;
}) {
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
      <Segment onClick={onBack} title="חזרה לתמחור">
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        חזרה לתמחור
      </Segment>
      <Sep />
      <Segment onClick={onSave} title="שמור טיוטה">
        <Save className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {saveSuccess ? "הטיוטה נשמרה" : "שמור טיוטה"}
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
