"use client";

import { useState, type ReactNode } from "react";
import { CircleX, Pencil, Save } from "lucide-react";
import { EditQuoteDetailsDialog } from "../quoteWorkflow/EditQuoteDetailsDialog";
import { simpleIntakeActions } from "../sessionStore";
import type { QuoteWorkspaceDetails } from "../types";
import { firstNameFromFullName } from "../workbookUpload/uploadScreenTokens";

function HeaderSegment({
  children,
  onClick,
  primary,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 px-3.5 text-[13px] font-medium transition-colors sm:px-4",
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

function HeaderSep() {
  return (
    <span
      aria-hidden
      className="h-full w-px shrink-0 self-stretch"
      style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
    />
  );
}

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

        {/* RTL: end = visual left — segmented Save / Cancel stripe */}
        <div className="flex shrink-0 items-center justify-self-end">
          <div
            role="toolbar"
            aria-label="פעולות הצעת מחיר"
            data-quote-header-toolbar="true"
            className="inline-flex max-w-full overflow-hidden rounded-2xl border"
            style={{
              borderColor: "var(--ow-border, #e4e7ec)",
              backgroundColor: "var(--ow-surface, #ffffff)",
            }}
          >
            <HeaderSegment
              ariaLabel="ביטול הצעת מחיר"
              onClick={() => {
                setEditOpen(false);
                setCancelOpen(true);
              }}
            >
              <CircleX
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={1.75}
                aria-hidden
              />
              ביטול הצעת מחיר
            </HeaderSegment>
            <HeaderSep />
            <HeaderSegment
              ariaLabel="שמור הצעת מחיר"
              onClick={() => {
                /* Save is intentionally a no-op for now */
              }}
            >
              <Save className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              שמור הצעת מחיר
            </HeaderSegment>
          </div>
        </div>
      </header>

      <EditQuoteDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        details={quoteDetails}
      />

      {cancelOpen && (
        <div className="fixed inset-0 z-[60]" dir="rtl">
          <button
            type="button"
            className="ow-toast-scrim absolute inset-0"
            aria-label="סגור"
            onClick={() => setCancelOpen(false)}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5 sm:pb-7">
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
            <div className="mt-4 flex items-center justify-center">
              <div
                role="group"
                aria-label="אישור ביטול הצעה"
                className="inline-flex max-w-full overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "var(--ow-border, #e4e7ec)",
                  backgroundColor: "var(--ow-surface, #ffffff)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCancelOpen(false)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-transparent px-5 text-[13px] font-medium text-[var(--ow-text)] transition-colors hover:bg-[var(--ow-surface-muted,#f2f4f7)]"
                >
                  המשך בעבודה
                </button>
                <span
                  aria-hidden
                  className="h-full w-px shrink-0 self-stretch"
                  style={{ backgroundColor: "var(--ow-border, #e4e7ec)" }}
                />
                <button
                  type="button"
                  onClick={confirmCancel}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-[var(--ow-accent)] px-5 text-[13px] font-medium text-[var(--ow-accent-fg)] transition-colors hover:bg-[var(--ow-accent-hover,#115e59)]"
                >
                  בטל הצעה
                </button>
              </div>
            </div>
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
