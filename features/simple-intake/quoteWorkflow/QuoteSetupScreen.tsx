"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { simpleIntakeActions } from "../sessionStore";
import { WorkbookUploadHeader } from "../workbookUpload/WorkbookUploadHeader";
import "../workbookUpload/upload-screen.css";

function hasMeaningfulText(value: string): boolean {
  return value.trim().length > 0;
}

const lightFieldClass =
  "h-14 rounded-2xl border border-[#E5E9EE] px-4 py-3 text-[15px] !text-[#13202B] placeholder:!text-[#8B96A3] shadow-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-0 focus-visible:border-[#0F766E] md:text-[15px]";

export function QuoteSetupScreen() {
  const [projectName, setProjectName] = useState("");
  const [customerName, setCustomerName] = useState("");

  const canSubmit = useMemo(
    () => hasMeaningfulText(projectName) && hasMeaningfulText(customerName),
    [projectName, customerName]
  );

  const submit = () => {
    if (!canSubmit) return;
    simpleIntakeActions.createQuote({ projectName, customerName });
  };

  return (
    <div
      className="omega-upload-screen flex min-h-[100vh] min-h-[100dvh] flex-col"
      dir="rtl"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 28%, rgba(15,118,110,0.05), transparent 30%), radial-gradient(circle at 50% 100%, rgba(15,118,110,0.035), transparent 28%)",
        backgroundColor: "var(--us-page)",
      }}
    >
      <WorkbookUploadHeader
        quotationTitle=""
        user={{ fullName: "מאור סבג", email: "Maor.andios@gmail.com" }}
      />

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
        <div
          className="us-enter mx-auto flex w-full max-w-lg flex-col items-center"
          style={{ animation: "us-fade-up 280ms ease-out both" }}
        >
          <div
            className="flex w-full flex-col items-center text-center"
            style={{ textAlign: "center" }}
          >
            <p
              className="w-full text-center text-[13px] font-medium"
              style={{ color: "var(--us-accent)", textAlign: "center" }}
            >
              שלום, מאור סבג
            </p>
            <h1
              className="mt-2 w-full text-center text-[32px] font-semibold tracking-tight sm:text-[38px]"
              style={{ color: "var(--us-text)", textAlign: "center" }}
            >
              יצירת הצעת מחיר חדשה
            </h1>
            <p
              className="mx-auto mt-2.5 w-full max-w-md text-center text-[14px] leading-relaxed"
              style={{ color: "var(--us-text-secondary)", textAlign: "center" }}
            >
              הזן את פרטי הפרויקט כדי לפתוח סביבת עבודה חדשה להצעה.
            </p>
          </div>

          <form
            className="mt-8 w-full space-y-4 text-start"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-2">
              <Label
                htmlFor="quote-project-name"
                className="text-[13px]"
                style={{ color: "var(--us-text-secondary)" }}
              >
                שם הפרויקט
              </Label>
              <Input
                id="quote-project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="לדוגמה: מבנה פלדה — אזור תעשייה דרום"
                autoComplete="off"
                className={lightFieldClass}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  borderColor: "#E5E9EE",
                  color: "#13202B",
                }}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="quote-customer-name"
                className="text-[13px]"
                style={{ color: "var(--us-text-secondary)" }}
              >
                שם הלקוח
              </Label>
              <Input
                id="quote-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="לדוגמה: קבוצת אלפא בע״מ"
                autoComplete="organization"
                className={lightFieldClass}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  borderColor: "#E5E9EE",
                  color: "#13202B",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              className={cn(
                "mt-2 h-14 w-full rounded-2xl text-[15px] shadow-none disabled:opacity-100",
                !canSubmit && "hover:bg-[#D0D5DD]"
              )}
              disabled={!canSubmit}
              style={
                canSubmit
                  ? {
                      backgroundColor: "var(--us-accent)",
                      color: "#fff",
                    }
                  : {
                      backgroundColor: "#E4E7EC",
                      color: "#98A2B3",
                    }
              }
            >
              הבא
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
