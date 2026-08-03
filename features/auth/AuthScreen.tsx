"use client";

/**
 * Login / signup screen — magic-link stub UI.
 * Same page atmosphere as quote setup; no top header stripe.
 */

import { useMemo, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SegmentLogo } from "@/features/simple-intake/ui/SegmentLogo";
import { SegmentMarketingFooter } from "@/features/simple-intake/ui/SegmentMarketingFooter";
import { AuthLegalModal, type AuthLegalDoc } from "./AuthLegalModal";
import { completeMagicLinkStub } from "./authSession";
import "@/features/simple-intake/workbookUpload/upload-screen.css";

function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 254) return false;
  // Lightweight client check — real validation arrives with Supabase.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const fieldClass =
  "h-11 rounded-2xl !border !border-[#EEF1F4] bg-white px-4 py-2.5 text-[14px] !text-[#13202B] placeholder:!text-[#98A2B3] shadow-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 focus-visible:ring-offset-0 focus-visible:!border-[#CBD5E1] md:text-[14px]";

const linkClass =
  "font-medium text-[#0F766E] underline decoration-[#0F766E]/35 underline-offset-2 transition-colors hover:text-[#0B625C] hover:decoration-[#0B625C]";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [legalDoc, setLegalDoc] = useState<AuthLegalDoc>(null);

  const emailOk = useMemo(() => isValidEmail(email), [email]);
  const canSubmit = emailOk && acceptedTerms;
  const showEmailError = submitted && !emailOk;
  const showTermsError = submitted && !acceptedTerms;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValidEmail(email) || !acceptedTerms) return;
    // Stub: skip real magic-link email and enter the product.
    completeMagicLinkStub(email);
  }

  return (
    <div
      className="omega-upload-screen flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden"
      dir="rtl"
      data-auth-screen="true"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 50% at 78% 18%, rgba(15,118,110,0.07), transparent 55%), radial-gradient(ellipse 55% 45% at 18% 82%, rgba(15,118,110,0.05), transparent 50%)",
        backgroundColor: "var(--us-page)",
      }}
    >
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 sm:px-6">
        {/* Center logo + card in the remaining viewport above the footer */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div
            className="flex w-full max-w-md shrink-0 flex-col items-center"
            style={{ animation: "us-fade-up 320ms ease-out both" }}
          >
            <SegmentLogo className="h-12 w-auto sm:h-14" />

            <div className="relative mt-8 w-full">
              {/* Soft agentic glow behind the card */}
              <div
                className="pointer-events-none absolute -end-8 -top-12 h-52 w-52 rounded-full bg-[#0F766E]/[0.32] blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -start-10 bottom-0 h-40 w-40 rounded-full bg-[#5EEAD4]/[0.2] blur-3xl"
                aria-hidden
              />

              <section
                className="qs-panel relative w-full overflow-hidden rounded-[24px] border bg-white/80 p-5 sm:p-6 backdrop-blur-md"
                style={{
                  borderColor: "var(--us-border)",
                  boxShadow: "0 12px 36px rgba(15,23,42,0.045)",
                  animation: "us-fade-up 420ms ease-out 60ms both",
                }}
                aria-labelledby="auth-title"
              >
                <div className="relative text-center">
                  <h1
                    id="auth-title"
                    className="text-[20px] font-semibold tracking-tight text-[#13202B] sm:text-[22px]"
                    style={{ textAlign: "center" }}
                  >
                    כניסה למערכת
                  </h1>
                  <p
                    className="mx-auto mt-2 max-w-[22rem] text-center text-[13px] leading-relaxed text-[#5C6978]"
                    style={{ textAlign: "center" }}
                  >
                    הזינו את כתובת הדוא״ל — נשלח קישור להתחברות (ללא סיסמה).
                  </p>
                </div>

                <form
                  className="relative mt-5 flex flex-col items-center gap-5"
                  onSubmit={onSubmit}
                >
                  <div className="w-full space-y-1.5 text-center">
                    <Label
                      htmlFor="auth-email"
                      className="block w-full text-center text-[12px] text-[#5C6978]"
                      style={{ textAlign: "center" }}
                    >
                      דוא״ל
                    </Label>
                    <Input
                      id="auth-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      dir="ltr"
                      className={cn(
                        fieldClass,
                        "us-ltr !bg-white text-center placeholder:text-center [color-scheme:light]"
                      )}
                      style={{
                        textAlign: "center",
                        backgroundColor: "#ffffff",
                        color: "#13202B",
                      }}
                      aria-invalid={showEmailError}
                    />
                    {showEmailError ? (
                      <p
                        className="text-center text-[12px] text-[#B42318]"
                        style={{ textAlign: "center" }}
                      >
                        יש להזין כתובת דוא״ל תקינה
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full">
                    <label
                      htmlFor="auth-terms"
                      className="flex cursor-pointer items-start gap-2.5 text-start"
                    >
                      <Checkbox
                        id="auth-terms"
                        checked={acceptedTerms}
                        onCheckedChange={(v) => setAcceptedTerms(v === true)}
                        className={cn(
                          "mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border border-[#D6DEE6] bg-white shadow-none",
                          "data-[state=checked]:border-[#0F766E] data-[state=checked]:bg-[#0F766E] data-[state=checked]:text-white",
                          "[&_svg]:h-3 [&_svg]:w-3 [&_svg]:stroke-[3] [&_svg]:text-white"
                        )}
                        aria-invalid={showTermsError}
                      />
                      <span className="text-[12px] leading-relaxed text-[#5C6978]">
                        קראתי והבנתי את{" "}
                        <button
                          type="button"
                          className={linkClass}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLegalDoc("terms");
                          }}
                        >
                          מדיניות השימוש
                        </button>{" "}
                        ו
                        <button
                          type="button"
                          className={linkClass}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLegalDoc("privacy");
                          }}
                        >
                          תנאי הפרטיות
                        </button>{" "}
                        של סגמנט
                      </span>
                    </label>
                    {showTermsError ? (
                      <p className="mt-1.5 text-start text-[12px] text-[#B42318]">
                        יש לאשר את מדיניות השימוש ותנאי הפרטיות כדי להמשיך
                      </p>
                    ) : null}
                  </div>

                  <Button
                    type="submit"
                    className={cn(
                      "h-11 w-full rounded-2xl text-[14px] font-medium shadow-none disabled:opacity-100",
                      !canSubmit && "hover:bg-[#D0D5DD]"
                    )}
                    disabled={!canSubmit}
                    style={
                      canSubmit
                        ? { backgroundColor: "var(--us-accent)", color: "#fff" }
                        : { backgroundColor: "#E4E7EC", color: "#98A2B3" }
                    }
                  >
                    <Mail className="ms-1 h-4 w-4" aria-hidden />
                    שלחו קישור התחברות
                  </Button>
                </form>
              </section>
            </div>
          </div>
        </div>

        <div className="h-5 shrink-0 sm:h-6" aria-hidden />
        <SegmentMarketingFooter />
        <div className="h-5 shrink-0 sm:h-6" aria-hidden />
      </main>

      <AuthLegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
