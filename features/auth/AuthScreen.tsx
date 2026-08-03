"use client";

/**
 * Invite-only Email OTP login — Hebrew RTL.
 * Step 1: email precheck + send OTP
 * Step 2: six-digit code verification
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SegmentLogo } from "@/features/simple-intake/ui/SegmentLogo";
import { SegmentMarketingFooter } from "@/features/simple-intake/ui/SegmentMarketingFooter";
import { AuthLegalModal, type AuthLegalDoc } from "./AuthLegalModal";
import { setCurrentOmegaUser } from "./authSession";
import { normalizeEmail } from "@/lib/auth/normalizeEmail";
import type { OmegaCurrentUser } from "@/lib/auth/omegaUser";
import "@/features/simple-intake/workbookUpload/upload-screen.css";

function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const fieldClass =
  "h-11 rounded-2xl !border !border-[#EEF1F4] bg-white px-4 py-2.5 text-[14px] !text-[#13202B] placeholder:!text-[#98A2B3] shadow-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 focus-visible:ring-offset-0 focus-visible:!border-[#CBD5E1] md:text-[14px]";

const linkClass =
  "font-medium text-[#0F766E] underline decoration-[#0F766E]/35 underline-offset-2 transition-colors hover:text-[#0B625C] hover:decoration-[#0B625C]";

const RESEND_COOLDOWN_SEC = 45;

type Step = "email" | "otp";

export function AuthScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [legalDoc, setLegalDoc] = useState<AuthLegalDoc>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const emailOk = useMemo(() => isValidEmail(email), [email]);
  const canSubmitEmail = emailOk && acceptedTerms && !busy;
  const showEmailError = submitted && step === "email" && !emailOk;
  const showTermsError = submitted && step === "email" && !acceptedTerms;
  const otpOk = /^\d{6}$/.test(otp);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "otp") {
      otpRef.current?.focus();
    }
  }, [step]);

  const requestOtp = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.message ?? 'כתובת הדוא"ל אינה רשומה במערכת');
        return false;
      }
      setCooldown(RESEND_COOLDOWN_SEC);
      return true;
    } catch {
      setError("אירעה תקלה בשליחת הקוד. נסה שוב");
      return false;
    } finally {
      setBusy(false);
    }
  }, [email]);

  async function onSubmitEmail(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValidEmail(email) || !acceptedTerms) return;
    const ok = await requestOtp();
    if (ok) {
      setStep("otp");
      setOtp("");
    }
  }

  async function onSubmitOtp(e: FormEvent) {
    e.preventDefault();
    if (!otpOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: normalizeEmail(email),
          token: otp.trim(),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        user?: OmegaCurrentUser;
      };
      if (!res.ok || !json.ok || !json.user) {
        setError(json.message ?? "הקוד שהוזן אינו תקין");
        return;
      }
      setCurrentOmegaUser(json.user);
      // Soft navigate — keep in-memory session; avoid full reload + dark "טוען..." gate.
      router.replace("/");
    } catch {
      setError("אירעה תקלה באימות הקוד. נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (cooldown > 0 || busy) return;
    await requestOtp();
  }

  function onChangeEmail() {
    setStep("email");
    setOtp("");
    setError(null);
    setSubmitted(false);
  }

  function handleOtpChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    setError(null);
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text") ?? "";
    const digits = text.replace(/\D/g, "").slice(0, 6);
    if (digits.length > 0) {
      e.preventDefault();
      setOtp(digits);
      setError(null);
    }
  }

  function handleOtpKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && otpOk) {
      // form submit handles it
    }
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div
            className="flex w-full max-w-md shrink-0 flex-col items-center"
            style={{ animation: "us-fade-up 320ms ease-out both" }}
          >
            <SegmentLogo className="h-12 w-auto sm:h-14" />

            <div className="relative mt-8 w-full">
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
                    התחברות למערכת
                  </h1>
                  <p
                    className="mx-auto mt-2 max-w-[22rem] text-center text-[13px] leading-relaxed text-[#5C6978]"
                    style={{ textAlign: "center" }}
                  >
                    {step === "email"
                      ? "הזינו כתובת דוא״ל רשומה — נשלח קוד כניסה בן 6 ספרות."
                      : `שלחנו קוד בן 6 ספרות ל-${normalizeEmail(email)}`}
                  </p>
                </div>

                {step === "email" ? (
                  <form
                    className="relative mt-5 flex flex-col items-center gap-5"
                    onSubmit={onSubmitEmail}
                    data-auth-step="email"
                  >
                    <div className="w-full space-y-1.5 text-center">
                      <Label
                        htmlFor="auth-email"
                        className="block w-full text-center text-[12px] text-[#5C6978]"
                        style={{ textAlign: "center" }}
                      >
                        כתובת דוא״ל
                      </Label>
                      <Input
                        id="auth-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
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
                        disabled={busy}
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

                    {error ? (
                      <p
                        className="w-full text-center text-[13px] text-[#B42318]"
                        role="alert"
                        data-auth-error="true"
                      >
                        {error}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      className={cn(
                        "h-11 w-full rounded-2xl text-[14px] font-medium shadow-none disabled:opacity-100",
                        !canSubmitEmail && "hover:bg-[#D0D5DD]"
                      )}
                      disabled={!canSubmitEmail}
                      style={
                        canSubmitEmail
                          ? { backgroundColor: "var(--us-accent)", color: "#fff" }
                          : { backgroundColor: "#E4E7EC", color: "#98A2B3" }
                      }
                    >
                      <Mail className="ms-1 h-4 w-4" aria-hidden />
                      {busy ? "שולח..." : "שלח קוד כניסה"}
                    </Button>
                  </form>
                ) : (
                  <form
                    className="relative mt-5 flex flex-col items-center gap-5"
                    onSubmit={onSubmitOtp}
                    data-auth-step="otp"
                  >
                    <div className="w-full space-y-1.5 text-center">
                      <Label
                        htmlFor="auth-otp"
                        className="block w-full text-center text-[12px] text-[#5C6978]"
                        style={{ textAlign: "center" }}
                      >
                        קוד בן 6 ספרות
                      </Label>
                      <Input
                        ref={otpRef}
                        id="auth-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="\d{6}"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => handleOtpChange(e.target.value)}
                        onPaste={handleOtpPaste}
                        onKeyDown={handleOtpKeyDown}
                        placeholder="••••••"
                        dir="ltr"
                        className={cn(
                          fieldClass,
                          "us-ltr !bg-white text-center tracking-[0.35em] placeholder:text-center placeholder:tracking-[0.35em] [color-scheme:light]"
                        )}
                        style={{
                          textAlign: "center",
                          backgroundColor: "#ffffff",
                          color: "#13202B",
                        }}
                        aria-invalid={Boolean(error)}
                        disabled={busy}
                        data-otp-input="true"
                      />
                    </div>

                    {error ? (
                      <p
                        className="w-full text-center text-[13px] text-[#B42318]"
                        role="alert"
                        data-auth-error="true"
                      >
                        {error}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      className="h-11 w-full rounded-2xl text-[14px] font-medium shadow-none"
                      disabled={!otpOk || busy}
                      style={
                        otpOk && !busy
                          ? { backgroundColor: "var(--us-accent)", color: "#fff" }
                          : { backgroundColor: "#E4E7EC", color: "#98A2B3" }
                      }
                    >
                      <KeyRound className="ms-1 h-4 w-4" aria-hidden />
                      {busy ? "מאמת..." : "אימות וכניסה"}
                    </Button>

                    <div className="flex w-full flex-col gap-2 text-center text-[12px]">
                      <button
                        type="button"
                        className={cn(
                          linkClass,
                          (cooldown > 0 || busy) &&
                            "pointer-events-none opacity-50"
                        )}
                        onClick={() => void onResend()}
                        disabled={cooldown > 0 || busy}
                        data-auth-resend="true"
                      >
                        {cooldown > 0
                          ? `שלח קוד מחדש (${cooldown})`
                          : "שלח קוד מחדש"}
                      </button>
                      <button
                        type="button"
                        className={linkClass}
                        onClick={onChangeEmail}
                        disabled={busy}
                        data-auth-change-email="true"
                      >
                        שנה כתובת דוא״ל
                      </button>
                    </div>
                  </form>
                )}
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
