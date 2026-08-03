"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, FolderArchive, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getDisplayContactName,
  getSignedInUser,
} from "@/features/accountModals/signedInUser";
import { simpleIntakeActions } from "../sessionStore";
import { WorkbookUploadHeader } from "../workbookUpload/WorkbookUploadHeader";
import { OpenExistingProjectControl } from "../omegaProject/OpenExistingProjectControl";
import { OmegaProjectBeforeUnload } from "../omegaProject/OmegaProjectBeforeUnload";
import { SegmentMarketingFooter } from "../ui/SegmentMarketingFooter";
import "../workbookUpload/upload-screen.css";

function hasMeaningfulText(value: string): boolean {
  return value.trim().length > 0;
}

const lightFieldClass =
  "h-11 rounded-2xl !border !border-[#EEF1F4] bg-white px-4 py-2.5 text-[14px] !text-[#13202B] placeholder:!text-[#98A2B3] shadow-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 focus-visible:ring-offset-0 focus-visible:!border-[#CBD5E1] md:text-[14px]";

function HeroAccentArt() {
  return (
    <div
      className="relative mx-auto mb-4 flex items-end justify-center gap-3 sm:gap-4"
      aria-hidden
    >
      {/* Soft backdrop blobs */}
      <svg
        className="pointer-events-none absolute inset-x-0 -top-2 mx-auto h-[88px] w-[280px] opacity-70"
        viewBox="0 0 280 88"
        fill="none"
      >
        <ellipse cx="70" cy="48" rx="48" ry="28" fill="#E8EEF5" />
        <ellipse cx="210" cy="42" rx="52" ry="30" fill="#E7F3F0" />
        <circle cx="40" cy="22" r="3.5" stroke="#B8C4D4" strokeWidth="1.2" />
        <circle cx="246" cy="18" r="2.5" stroke="#A8CFC8" strokeWidth="1.2" />
        <path
          d="M128 16h8M132 12v8"
          stroke="#C5CEDA"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M168 70h7M171.5 66.5v7"
          stroke="#B7D5CF"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>

      {/* PDF */}
      <div
        className="qs-file-float qs-file-float-a relative flex w-[54px] flex-col items-center sm:w-[60px]"
        dir="ltr"
      >
        <svg
          className="h-[56px] w-full sm:h-[64px]"
          viewBox="0 0 60 64"
          fill="none"
        >
          <path
            d="M10 4h28l12 12v36a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6Z"
            fill="#fff"
            stroke="#F5A89A"
            strokeWidth="1.6"
          />
          <path
            d="M38 4v10a2 2 0 0 0 2 2h10"
            fill="#FFF1EE"
            stroke="#F5A89A"
            strokeWidth="1.6"
          />
          <rect x="12" y="28" width="28" height="3.2" rx="1.6" fill="#FDE8E4" />
          <rect x="12" y="35" width="34" height="2.6" rx="1.3" fill="#F5E3DF" />
          <rect x="12" y="41.5" width="24" height="2.6" rx="1.3" fill="#F5E3DF" />
          <rect x="12" y="48" width="30" height="2.6" rx="1.3" fill="#F5E3DF" />
        </svg>
        <span className="mt-1 text-[11px] font-bold tracking-[0.06em] text-[#C2410C] sm:text-[12px]">
          PDF
        </span>
      </div>

      {/* DXF */}
      <div
        className="qs-file-float qs-file-float-b relative -mb-0.5 flex w-[60px] flex-col items-center sm:w-[68px]"
        dir="ltr"
      >
        <svg
          className="h-[64px] w-full sm:h-[72px]"
          viewBox="0 0 68 72"
          fill="none"
        >
          <path
            d="M10 4h34l14 14v38a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6Z"
            fill="#fff"
            stroke="#7EB8B0"
            strokeWidth="1.6"
          />
          <path
            d="M44 4v12a2 2 0 0 0 2 2h12"
            fill="#EAF6F4"
            stroke="#7EB8B0"
            strokeWidth="1.6"
          />
          <rect
            x="13"
            y="24"
            width="40"
            height="34"
            rx="4"
            stroke="#A8D4CE"
            strokeWidth="1.2"
          />
          <path
            d="M20 48 28 30l10 8 8-14 7 24"
            stroke="#0F766E"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="20" cy="48" r="2.2" fill="#0F766E" />
          <circle cx="28" cy="30" r="2.2" fill="#0F766E" />
          <circle cx="38" cy="38" r="2.2" fill="#0F766E" />
          <circle cx="46" cy="24" r="2.2" fill="#0F766E" />
          <circle cx="53" cy="48" r="2.2" fill="#0F766E" />
        </svg>
        <span className="mt-1 text-[11px] font-bold tracking-[0.06em] text-[#0F766E] sm:text-[12px]">
          DXF
        </span>
      </div>

      {/* Excel */}
      <div
        className="qs-file-float qs-file-float-c relative flex w-[54px] flex-col items-center sm:w-[60px]"
        dir="ltr"
      >
        <svg
          className="h-[56px] w-full sm:h-[64px]"
          viewBox="0 0 60 64"
          fill="none"
        >
          <path
            d="M10 4h28l12 12v36a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6Z"
            fill="#fff"
            stroke="#86C5A8"
            strokeWidth="1.6"
          />
          <path
            d="M38 4v10a2 2 0 0 0 2 2h10"
            fill="#EAF7F0"
            stroke="#86C5A8"
            strokeWidth="1.6"
          />
          <rect
            x="13"
            y="26"
            width="32"
            height="26"
            rx="3"
            stroke="#A8D9BE"
            strokeWidth="1.2"
          />
          <path
            d="M13 34.5h32M13 43h32M24 26v26M37 26v26"
            stroke="#A8D9BE"
            strokeWidth="1.1"
          />
          <rect x="13.5" y="26.5" width="10" height="7.5" fill="#D8F0E4" />
        </svg>
        <span className="mt-1 text-[11px] font-bold tracking-[0.04em] text-[#067647] sm:text-[12px]">
          EXCEL
        </span>
      </div>
    </div>
  );
}

function NewQuoteArt() {
  return (
    <svg
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto h-[72px] w-auto max-w-full sm:h-[84px]"
      aria-hidden
    >
      <defs>
        <linearGradient
          id="nq-a"
          x1="40"
          y1="20"
          x2="240"
          y2="140"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0F766E" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0F766E" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient
          id="nq-b"
          x1="70"
          y1="40"
          x2="210"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0F766E" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect
        x="36"
        y="28"
        width="160"
        height="108"
        rx="18"
        fill="url(#nq-a)"
        stroke="#0F766E"
        strokeOpacity="0.18"
      />
      <rect
        x="84"
        y="18"
        width="160"
        height="108"
        rx="18"
        fill="white"
        stroke="#E5E9EE"
      />
      <rect x="104" y="40" width="72" height="8" rx="4" fill="#E8F6F3" />
      <rect x="104" y="58" width="108" height="6" rx="3" fill="#EEF2F5" />
      <rect x="104" y="72" width="96" height="6" rx="3" fill="#EEF2F5" />
      <rect x="104" y="86" width="84" height="6" rx="3" fill="#EEF2F5" />
      <circle cx="214" cy="104" r="22" fill="url(#nq-b)" />
      <path
        d="M214 94v20M204 104h20"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M48 118c28-18 52-10 74 2s46 8 70-8"
        stroke="#0F766E"
        strokeOpacity="0.2"
        strokeWidth="2"
        strokeLinecap="round"
        className="qs-draw"
      />
    </svg>
  );
}

export function QuoteSetupScreen() {
  const [projectName, setProjectName] = useState("");
  const [customerName, setCustomerName] = useState("");

  const contactName = getDisplayContactName();
  const signedIn = getSignedInUser();

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
      className="omega-upload-screen flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden"
      dir="rtl"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 50% at 78% 18%, rgba(15,118,110,0.07), transparent 55%), radial-gradient(ellipse 55% 45% at 18% 82%, rgba(15,118,110,0.05), transparent 50%)",
        backgroundColor: "var(--us-page)",
      }}
    >
      <WorkbookUploadHeader
        quotationTitle=""
        user={{
          fullName: contactName,
          email: signedIn.email,
        }}
      />

      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 sm:px-6">
        {/* Absorb leftover height above the composition */}
        <div className="min-h-0 flex-1" aria-hidden />

        <div
          className="qs-enter relative shrink-0 pb-4 text-center sm:pb-5"
          style={{ animation: "us-fade-up 320ms ease-out both" }}
        >
          <HeroAccentArt />
          <p
            className="text-center text-[14px] font-medium sm:text-[15px]"
            style={{ color: "var(--us-accent)", textAlign: "center" }}
          >
            שלום, {contactName}
          </p>
          <h1
            className="mt-2 text-center text-[28px] font-semibold tracking-tight sm:text-[34px]"
            style={{ color: "var(--us-text)", textAlign: "center" }}
          >
            צרו הצעת מחיר חדשה
          </h1>
        </div>

        {/* RTL: first column = visual right (new), second = visual left (open) */}
        <div
          className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4"
          style={{ animation: "us-fade-up 420ms ease-out 60ms both" }}
        >
          {/* New quote — visual right */}
          <section
            className="qs-panel relative flex flex-col overflow-hidden rounded-[24px] border bg-white/90 p-4 sm:p-5"
            style={{
              borderColor: "var(--us-border)",
              boxShadow: "0 12px 36px rgba(15,23,42,0.045)",
            }}
            aria-labelledby="qs-new-title"
          >
            <div className="pointer-events-none absolute -start-10 -top-10 h-32 w-32 rounded-full bg-[#0F766E]/[0.06]" />
            <div className="relative shrink-0 text-center">
              <div className="mb-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#E8F6F3] px-2.5 py-1 text-[11px] font-medium text-[#0F766E]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                מסלול חדש
              </div>
              <h2
                id="qs-new-title"
                className="mt-2 text-center text-[19px] font-semibold tracking-tight text-[#13202B] sm:text-[21px]"
                style={{ textAlign: "center" }}
              >
                יצירת הצעת מחיר חדשה
              </h2>
              <p
                className="mx-auto mt-1.5 max-w-[22rem] text-center text-[13px] leading-relaxed text-[#5C6978]"
                style={{ textAlign: "center" }}
              >
                הזינו שם פרויקט ולקוח — ונפתח סביבת עבודה חדשה.
              </p>
            </div>

            <div className="relative my-2.5 flex shrink-0 justify-center sm:my-3">
              <NewQuoteArt />
            </div>

            <form
              className="relative flex flex-col gap-2.5 text-start"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="space-y-1">
                <Label
                  htmlFor="quote-project-name"
                  className="text-[12px] text-[#5C6978]"
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
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="quote-customer-name"
                  className="text-[12px] text-[#5C6978]"
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
                  "mt-0.5 h-11 w-full rounded-2xl text-[14px] font-medium shadow-none disabled:opacity-100",
                  !canSubmit && "hover:bg-[#D0D5DD]"
                )}
                disabled={!canSubmit}
                style={
                  canSubmit
                    ? { backgroundColor: "var(--us-accent)", color: "#fff" }
                    : { backgroundColor: "#E4E7EC", color: "#98A2B3" }
                }
              >
                <span>התחל הצעה</span>
                <ArrowLeft className="me-1 h-4 w-4" aria-hidden />
              </Button>
            </form>
          </section>

          {/* Open existing — visual left */}
          <section
            className="qs-panel relative flex flex-col overflow-hidden rounded-[24px] border bg-[#FBFCFD] p-4 sm:p-5"
            style={{
              borderColor: "var(--us-border)",
              boxShadow: "0 12px 36px rgba(15,23,42,0.04)",
            }}
            aria-labelledby="qs-open-title"
          >
            <div className="relative shrink-0 pb-2.5 text-center">
              <div className="mb-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#F2F5F7] px-2.5 py-1 text-[11px] font-medium text-[#5C6978]">
                <FolderArchive className="h-3.5 w-3.5" aria-hidden />
                קובץ שמור
              </div>
              <h2
                id="qs-open-title"
                className="mt-2 text-center text-[19px] font-semibold tracking-tight text-[#13202B] sm:text-[21px]"
                style={{ textAlign: "center" }}
              >
                פתיחת הצעה קיימת
              </h2>
              <p
                className="mx-auto mt-1.5 max-w-[22rem] text-center text-[13px] leading-relaxed text-[#5C6978]"
                style={{ textAlign: "center" }}
              >
                טענו קובץ{" "}
                <span className="font-medium text-[#0F766E]" dir="ltr">
                  .segment
                </span>{" "}
                והמשיכו מהשלב שבו נשמרה ההצעה.
              </p>
            </div>

            <div className="relative min-h-[168px] flex-1 sm:min-h-[184px]">
              <OpenExistingProjectControl variant="panel" className="h-full" />
            </div>
          </section>
        </div>

        {/* Equal gap: cards → footer text */}
        <div className="h-5 shrink-0 sm:h-6" aria-hidden />

        <SegmentMarketingFooter />

        {/* Equal gap: footer text → bottom of screen */}
        <div className="h-5 shrink-0 sm:h-6" aria-hidden />
      </main>

      <OmegaProjectBeforeUnload />
    </div>
  );
}
