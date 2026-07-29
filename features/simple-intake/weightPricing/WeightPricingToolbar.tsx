"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, Save } from "lucide-react";

function Segment({
  onClick,
  children,
  primary,
  title,
}: {
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 px-3.5 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)] focus-visible:ring-inset",
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
 * RTL visual order: חזרה לרשימה | שמור תמחור | המשך לסיכום
 */
export function WeightPricingToolbar({
  onBack,
  onSave,
  onContinue,
  saveSuccess,
}: {
  onBack: () => void;
  onSave: () => void;
  onContinue: () => void;
  saveSuccess?: boolean;
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
      <Segment onClick={onSave} title="שמור תמחור">
        <Save className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {saveSuccess ? "התמחור נשמר" : "שמור תמחור"}
      </Segment>
      <Sep />
      <Segment onClick={onContinue} primary title="המשך לסיכום">
        <Check className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        המשך לסיכום
      </Segment>
    </div>
  );
}
