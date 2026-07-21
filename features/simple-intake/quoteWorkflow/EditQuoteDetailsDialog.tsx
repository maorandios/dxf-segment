"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { simpleIntakeActions } from "../sessionStore";
import type { QuoteWorkspaceDetails } from "../types";

const btnRadius = "rounded-2xl";

const lightFieldClass =
  "h-11 rounded-2xl border border-[#E5E9EE] px-3 text-[14px] !text-[#13202B] placeholder:!text-[#8B96A3] shadow-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-0 md:text-[14px]";

function EditQuoteDetailsForm({
  details,
  onClose,
}: {
  details: QuoteWorkspaceDetails;
  onClose: () => void;
}) {
  const [projectName, setProjectName] = useState(details.projectName);
  const [customerName, setCustomerName] = useState(details.customerName);
  const canSave =
    projectName.trim().length > 0 && customerName.trim().length > 0;

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        if (
          simpleIntakeActions.updateQuoteDetails({
            projectName,
            customerName,
          })
        ) {
          onClose();
        }
      }}
    >
      <p
        className="text-center text-[15px] font-semibold"
        style={{ color: "#13202B" }}
      >
        עריכת פרטי הצעה
      </p>
      <p
        className="mt-1.5 text-center text-[13px] leading-relaxed"
        style={{ color: "#5C6978" }}
      >
        עדכון שם הפרויקט והלקוח יוצג מיד בכותרת סביבת העבודה.
      </p>

      <div className="mt-4 space-y-3 text-start">
        <div className="space-y-1.5">
          <Label
            htmlFor="edit-project-name"
            className="text-[13px]"
            style={{ color: "#5C6978" }}
          >
            שם הפרויקט
          </Label>
          <Input
            id="edit-project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className={lightFieldClass}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              borderColor: "#E5E9EE",
              color: "#13202B",
            }}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="edit-customer-name"
            className="text-[13px]"
            style={{ color: "#5C6978" }}
          >
            שם הלקוח
          </Label>
          <Input
            id="edit-customer-name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={lightFieldClass}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              borderColor: "#E5E9EE",
              color: "#13202B",
            }}
            autoComplete="organization"
          />
        </div>
      </div>

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
          onClick={onClose}
        >
          ביטול
        </Button>
        <Button
          type="submit"
          disabled={!canSave}
          className={cn(
            "h-10 shadow-none disabled:opacity-100",
            btnRadius,
            !canSave && "hover:bg-[#D0D5DD]"
          )}
          style={
            canSave
              ? {
                  backgroundColor: "#0F766E",
                  color: "#ffffff",
                }
              : {
                  backgroundColor: "#E4E7EC",
                  color: "#98A2B3",
                }
          }
        >
          שמור
        </Button>
      </div>
    </form>
  );
}

/** Bottom-floating light toast for editing quote project/customer details. */
export function EditQuoteDetailsDialog({
  open,
  onOpenChange,
  details,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: QuoteWorkspaceDetails | null;
}) {
  if (!open || !details) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-5 sm:pb-7"
      dir="rtl"
    >
      <div
        role="dialog"
        aria-labelledby="edit-quote-title"
        className="ow-cancel-toast pointer-events-auto w-full max-w-lg rounded-2xl border p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] sm:p-5"
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#E5E9EE",
          color: "#13202B",
        }}
      >
        <span id="edit-quote-title" className="sr-only">
          עריכת פרטי הצעה
        </span>
        <EditQuoteDetailsForm
          key={`${details.projectName}|${details.customerName}|${open}`}
          details={details}
          onClose={() => onOpenChange(false)}
        />
      </div>
    </div>
  );
}
