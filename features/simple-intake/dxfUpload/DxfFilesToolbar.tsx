"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

export type DxfFilesToolbarAction = "ADD_FILES" | "CLEAR_ALL";

function Segment({
  action,
  onAction,
  children,
  disabled,
  embedded,
}: {
  action: DxfFilesToolbarAction;
  onAction: (action: DxfFilesToolbarAction) => void;
  children: ReactNode;
  disabled?: boolean;
  embedded?: boolean;
}) {
  return (
    <button
      type="button"
      data-dxf-action={action}
      disabled={disabled}
      onClick={() => onAction(action)}
      className={[
        "inline-flex shrink-0 items-center justify-center gap-1.5 text-[12.5px] font-medium transition-colors",
        embedded ? "h-8 px-3" : "h-10 px-3.5 text-[13px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ow-accent)] focus-visible:ring-inset",
        "disabled:pointer-events-none disabled:opacity-45",
        "bg-transparent text-[var(--ow-text)] hover:bg-[var(--ow-surface-muted,#f2f4f7)]",
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

export function DxfFilesToolbar({
  onAction,
  disabled,
  embedded = false,
}: {
  onAction: (action: DxfFilesToolbarAction) => void;
  disabled?: boolean;
  /** Flush chrome inside the file card header. */
  embedded?: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="פעולות קובצי DXF"
      data-dxf-files-toolbar="true"
      className={[
        "inline-flex max-w-full flex-wrap overflow-hidden",
        embedded ? "rounded-xl border" : "rounded-2xl border",
      ].join(" ")}
      style={{
        borderColor: "var(--ow-border, #e4e7ec)",
        backgroundColor: embedded
          ? "var(--ow-surface, #ffffff)"
          : "var(--ow-surface, #ffffff)",
      }}
    >
      <Segment
        action="ADD_FILES"
        onAction={onAction}
        disabled={disabled}
        embedded={embedded}
      >
        <Plus
          className={embedded ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"}
          strokeWidth={1.75}
          aria-hidden
        />
        הוסף קבצים
      </Segment>
      <Sep />
      <Segment
        action="CLEAR_ALL"
        onAction={onAction}
        disabled={disabled}
        embedded={embedded}
      >
        <Trash2
          className={embedded ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"}
          strokeWidth={1.75}
          aria-hidden
        />
        מחק הכל
      </Segment>
    </div>
  );
}
