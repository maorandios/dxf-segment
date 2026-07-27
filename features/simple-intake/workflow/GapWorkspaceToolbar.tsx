"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Mail,
} from "lucide-react";
import type { GapWorkspaceAction } from "../gapCommunication";

function Segment({
  action,
  onAction,
  children,
  primary,
  className,
}: {
  action: GapWorkspaceAction;
  onAction: (action: GapWorkspaceAction) => void;
  children: ReactNode;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-gap-action={action}
      onClick={() => onAction(action)}
      className={[
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 px-3.5 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)] focus-visible:ring-inset",
        primary
          ? "bg-[var(--ow-accent)] text-[var(--ow-accent-fg)] hover:bg-[var(--ow-accent-hover,#115e59)]"
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

export function GapWorkspaceToolbar({
  onAction,
  continueDisabled,
}: {
  onAction: (action: GapWorkspaceAction) => void;
  /** Reserved — continue is always allowed per product rules. */
  continueDisabled?: boolean;
}) {
  void continueDisabled;
  return (
    <div
      role="toolbar"
      aria-label="פעולות פערים"
      data-gap-workspace-toolbar="true"
      className="inline-flex max-w-full flex-wrap overflow-hidden rounded-2xl border"
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: "var(--ow-surface, #ffffff)",
      }}
    >
      <Segment action="BACK_TO_SUMMARY" onAction={onAction}>
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        חזרה לסיכום
      </Segment>
      <Sep />
      <Segment action="CREATE_GAP_EMAIL" onAction={onAction}>
        <Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        צור מייל פערים
      </Segment>
      <Sep />
      <Segment action="EXPORT_ROUND_TRIP_EXCEL" onAction={onAction}>
        <FileSpreadsheet
          className="h-4 w-4 shrink-0"
          strokeWidth={1.75}
          aria-hidden
        />
        ייצא דוח Excel
      </Segment>
      <Sep />
      <Segment action="CONTINUE_TO_FINAL_TABLE" onAction={onAction} primary>
        המשך לטבלה המסכמת
        <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      </Segment>
    </div>
  );
}
