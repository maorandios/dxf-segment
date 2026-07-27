"use client";

import { Button } from "@/components/ui/button";
import type { GapWorkspaceAction } from "../gapCommunication";

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
      className="flex flex-wrap items-center justify-between gap-2"
      data-gap-workspace-toolbar="true"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-2xl px-4 text-[13px]"
          data-gap-action="BACK_TO_SUMMARY"
          onClick={() => onAction("BACK_TO_SUMMARY")}
        >
          חזרה לסיכום
        </Button>
        <span
          aria-hidden
          className="mx-0.5 hidden h-6 w-px sm:block"
          style={{ backgroundColor: "var(--ow-border)" }}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-2xl px-4 text-[13px]"
          data-gap-action="CREATE_GAP_EMAIL"
          onClick={() => onAction("CREATE_GAP_EMAIL")}
        >
          צור מייל פערים
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-2xl px-4 text-[13px]"
          data-gap-action="EXPORT_ROUND_TRIP_EXCEL"
          onClick={() => onAction("EXPORT_ROUND_TRIP_EXCEL")}
        >
          ייצא דוח Excel
        </Button>
      </div>
      <span
        aria-hidden
        className="mx-0.5 hidden h-6 w-px sm:block"
        style={{ backgroundColor: "var(--ow-border)" }}
      />
      <Button
        type="button"
        className="h-10 rounded-2xl px-5 text-[13px] font-medium shadow-none"
        style={{
          backgroundColor: "var(--ow-accent)",
          color: "var(--ow-accent-fg)",
        }}
        data-gap-action="CONTINUE_TO_FINAL_TABLE"
        onClick={() => onAction("CONTINUE_TO_FINAL_TABLE")}
      >
        המשך לטבלה המסכמת
      </Button>
    </div>
  );
}
