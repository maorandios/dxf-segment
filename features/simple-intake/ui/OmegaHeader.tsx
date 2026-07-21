"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditQuoteDetailsDialog } from "../quoteWorkflow/EditQuoteDetailsDialog";
import { simpleIntakeActions } from "../sessionStore";
import type { QuoteWorkspaceDetails } from "../types";
import { firstNameFromFullName } from "../workbookUpload/uploadScreenTokens";

const btnRadius = "rounded-2xl";

export function OmegaHeader({
  quoteDetails,
}: {
  quoteDetails: QuoteWorkspaceDetails | null;
  /** @deprecated Unused — kept optional for callers during transition. */
  statusText?: string;
  onReplaceWorkbook?: () => void;
  onDownloadDebug?: () => void;
  canDownloadDebug?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const confirmCancel = () => {
    setCancelOpen(false);
    simpleIntakeActions.reset();
  };

  return (
    <>
      <header
        className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b ps-4 pe-5 sm:h-16 sm:ps-6 sm:pe-8"
        style={{
          backgroundColor: "var(--ow-surface)",
          borderColor: "var(--ow-border)",
        }}
      >
        {/* RTL: first = visual right — brand only */}
        <div className="min-w-0 justify-self-start text-start">
          <p
            className="text-[15px] font-semibold tracking-[0.04em]"
            style={{ color: "var(--ow-text)" }}
          >
            OMEGA
          </p>
        </div>

        {/* Center — pencil + project · customer */}
        <div className="justify-self-center px-2">
          {quoteDetails ? (
            <div className="flex max-w-[min(56vw,32rem)] items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#F2F5F7]"
                onClick={() => {
                  setCancelOpen(false);
                  setEditOpen(true);
                }}
                aria-label="עריכת פרטי הצעה"
                title="עריכת פרטי הצעה"
              >
                <Pencil
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--ow-text-muted)" }}
                  aria-hidden
                />
              </button>
              <p className="min-w-0 truncate text-[13px] sm:text-[14px]">
                <span
                  className="font-medium"
                  style={{ color: "var(--ow-text)" }}
                >
                  {quoteDetails.projectName}
                </span>
                <span
                  className="mx-1.5"
                  style={{ color: "var(--ow-border-strong)" }}
                  aria-hidden
                >
                  ·
                </span>
                <span style={{ color: "var(--ow-text-secondary)" }}>
                  {quoteDetails.customerName}
                </span>
              </p>
            </div>
          ) : (
            <p
              className="text-[13px]"
              style={{ color: "var(--ow-text-secondary)" }}
            >
              הצעת מחיר חדשה
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-self-end gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-9 border px-3 text-[13px] shadow-none sm:px-4",
              btnRadius
            )}
            style={{
              borderColor: "var(--ow-border-strong)",
              backgroundColor: "var(--ow-surface)",
              color: "var(--ow-text-secondary)",
            }}
            onClick={() => {
              setEditOpen(false);
              setCancelOpen(true);
            }}
          >
            ביטול הצעת מחיר
          </Button>
          <Button
            type="button"
            className={cn("h-9 px-3 text-[13px] shadow-none sm:px-4", btnRadius)}
            style={{
              backgroundColor: "var(--ow-accent)",
              color: "var(--ow-accent-fg)",
            }}
            onClick={() => {
              /* Save is intentionally a no-op for now */
            }}
          >
            שמור הצעת מחיר
          </Button>
        </div>
      </header>

      <EditQuoteDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        details={quoteDetails}
      />

      {cancelOpen && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-5 sm:pb-7"
          dir="rtl"
        >
          <div
            role="alertdialog"
            aria-labelledby="cancel-quote-title"
            aria-describedby="cancel-quote-desc"
            className="ow-cancel-toast pointer-events-auto w-full max-w-lg rounded-2xl border p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:p-5"
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#E5E9EE",
              color: "#13202B",
              textAlign: "center",
            }}
          >
            <p
              id="cancel-quote-title"
              className="text-center text-[15px] font-semibold"
              style={{ color: "#13202B", textAlign: "center" }}
            >
              לבטל את הצעת המחיר?
            </p>
            <p
              id="cancel-quote-desc"
              className="mt-1.5 text-center text-[13px] leading-relaxed"
              style={{ color: "#5C6978", textAlign: "center" }}
            >
              הפעולה תחזיר אתכם למסך יצירת הצעה חדשה. פרטי הפרויקט וההתקדמות
              הנוכחית לא יישמרו.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn("h-10 shadow-none", btnRadius)}
                style={{
                  borderColor: "#D6DEE6",
                  backgroundColor: "#ffffff",
                  color: "#5C6978",
                }}
                onClick={() => setCancelOpen(false)}
              >
                המשך בעבודה
              </Button>
              <Button
                type="button"
                className={cn("h-10 shadow-none", btnRadius)}
                style={{
                  backgroundColor: "#0F766E",
                  color: "#ffffff",
                }}
                onClick={confirmCancel}
              >
                בטל הצעה
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Keep helper available for tests/consumers that inspect first-name greeting. */
export function omegaHeaderGreetingName(fullName: string | null): string {
  return fullName ? firstNameFromFullName(fullName) ?? "שלום" : "שלום";
}
