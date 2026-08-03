/**
 * OMEGA — Supabase Invite-Only Email OTP Auth + Credits v1
 * Run: npx tsx features/auth/__tests__/supabase-auth-credits-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEmail, isValidEmailFormat } from "@/lib/auth/normalizeEmail";
import {
  deriveRenewalDate,
  toOmegaCurrentUser,
  type OmegaUserRow,
} from "@/lib/auth/omegaUser";
import {
  AUTH_MESSAGES,
  isSixDigitOtp,
  mapOtpRequestError,
  mapOtpVerifyError,
} from "@/lib/auth/otpMessages";
import {
  getSupabaseAuthDiagnostics,
  recordDiagnostic,
} from "@/lib/auth/diagnostics";
import {
  BILLING_NO_RENEWAL_LABEL,
  formatBillingCredits,
  formatBillingRenewalDate,
  getBillingUsageSummary,
} from "@/features/accountModals/billingUsageSummary";
import { setCurrentOmegaUser, clearAuthSession } from "@/features/auth/authSession";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../../..");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(
    actual,
    expected,
    `${msg}: expected ${String(expected)} got ${String(actual)}`
  );
}

console.log("OMEGA — Supabase Invite-Only Email OTP Authentication and User Credits v1");

{
  const browserSrc = fs.readFileSync(
    path.join(repoRoot, "lib/supabase/browser.ts"),
    "utf8"
  );
  assert_(
    browserSrc.includes("getSupabasePublishableKey"),
    "browser client uses public key helper"
  );
  assert_(
    !browserSrc.includes("SERVICE_ROLE"),
    "browser client must not reference service role"
  );
  assert_(
    !browserSrc.includes("createSupabaseAdminClient"),
    "browser client must not import admin client"
  );
}

{
  const adminSrc = fs.readFileSync(
    path.join(repoRoot, "lib/supabase/admin.ts"),
    "utf8"
  );
  assert_(adminSrc.includes('import "server-only"'), "admin has server-only");
  assert_(
    adminSrc.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "admin uses service role env"
  );
}

{
  // Static scan: Client Components / browser entry must not import admin
  const browserTs = path.join(repoRoot, "lib/supabase/browser.ts");
  const authScreen = fs.readFileSync(
    path.join(repoRoot, "features/auth/AuthScreen.tsx"),
    "utf8"
  );
  assert_(
    !authScreen.includes("createSupabaseAdminClient"),
    "AuthScreen must not import admin"
  );
  assert_(fs.existsSync(browserTs), "browser client exists");
}

{
  assertEq(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com", "normalize trim+lower");
  assert_(isValidEmailFormat("a@b.co"), "valid email");
  assert_(!isValidEmailFormat("not-an-email"), "invalid email");
}

{
  assert_(isSixDigitOtp("123456"), "six digits ok");
  assert_(!isSixDigitOtp("12345"), "five digits reject");
  assert_(!isSixDigitOtp("1234567"), "seven digits reject");
  assert_(!isSixDigitOtp("12a456"), "non-numeric reject");
  assertEq(
    "123456".replace(/\D/g, "").slice(0, 6),
    "123456",
    "paste six digits works"
  );
  assertEq(
    "12-34-56".replace(/\D/g, "").slice(0, 6),
    "123456",
    "paste with separators"
  );
}

{
  assertEq(
    mapOtpVerifyError({ message: "Token has expired or is invalid" }),
    AUTH_MESSAGES.expiredOtp,
    "expired otp hebrew"
  );
  assertEq(
    mapOtpVerifyError({ message: "Invalid OTP", status: 401 }),
    AUTH_MESSAGES.invalidOtp,
    "invalid otp hebrew"
  );
  assertEq(
    mapOtpRequestError({ status: 429, message: "rate limit" }),
    AUTH_MESSAGES.rateLimited,
    "rate limit hebrew"
  );
  assertEq(
    AUTH_MESSAGES.unregistered,
    'כתובת הדוא"ל אינה רשומה במערכת',
    "unregistered message"
  );
}

{
  const authScreen = fs.readFileSync(
    path.join(repoRoot, "features/auth/AuthScreen.tsx"),
    "utf8"
  );
  assert_(authScreen.includes("כניסה ל-OMEGA"), "login title");
  assert_(authScreen.includes("שלח קוד כניסה"), "send otp cta");
  assert_(authScreen.includes("אימות וכניסה"), "verify cta");
  assert_(authScreen.includes("שלח קוד מחדש"), "resend");
  assert_(authScreen.includes("שנה כתובת דוא״ל") || authScreen.includes('שנה כתובת דוא"ל') || authScreen.includes("שנה כתובת דוא"), "change email");
  assert_(authScreen.includes('data-otp-input="true"'), "otp input");
  assert_(authScreen.includes("/api/auth/request-otp"), "request otp endpoint");
  assert_(authScreen.includes("/api/auth/verify-otp"), "verify otp endpoint");
  assert_(!authScreen.includes("completeMagicLinkStub"), "no magic link stub");
}

{
  const requestOtp = fs.readFileSync(
    path.join(repoRoot, "app/api/auth/request-otp/route.ts"),
    "utf8"
  );
  assert_(requestOtp.includes("signInWithOtp"), "uses signInWithOtp");
  assert_(
    requestOtp.includes("shouldCreateUser: false"),
    "OTP only after confirmed auth user exists"
  );
  assert_(
    requestOtp.includes("ensureConfirmedAllowlistedAuthUser"),
    "pre-creates confirmed allowlisted auth user"
  );
  assert_(requestOtp.includes("isActiveAllowlistedEmail"), "server precheck");
  assert_(!requestOtp.includes("shouldCreateUser: true"), "does not create via OTP signup");
}

{
  const verifyOtp = fs.readFileSync(
    path.join(repoRoot, "app/api/auth/verify-otp/route.ts"),
    "utf8"
  );
  assert_(verifyOtp.includes('type: "email"'), "verify type email");
  assert_(verifyOtp.includes("verifyOtp"), "calls verifyOtp");
  assert_(!verifyOtp.includes("access_token"), "no tokens in response path");
}

{
  assert_(
    fs.existsSync(path.join(repoRoot, "proxy.ts")),
    "Next.js 16 proxy.ts exists"
  );
  const proxy = fs.readFileSync(path.join(repoRoot, "proxy.ts"), "utf8");
  assert_(proxy.includes("export async function proxy"), "exports proxy");
  assert_(proxy.includes("/login"), "redirects to login");
  assert_(proxy.includes("getUser"), "uses getUser not session alone");
  assert_(!fs.existsSync(path.join(repoRoot, "middleware.ts")), "no dual middleware");
}

{
  const migration = fs.readFileSync(
    path.join(
      repoRoot,
      "supabase/migrations/20260803120000_omega_users_auth_credits.sql"
    ),
    "utf8"
  );
  assert_(migration.includes("omega_users"), "users table");
  assert_(migration.includes("omega_credit_ledger"), "ledger");
  assert_(migration.includes("hook_allow_omega_user"), "before user created hook");
  assert_(migration.includes("consume_quotation_credit"), "consume fn");
  assert_(migration.includes("renew_permanent_user_credits"), "renewal fn");
  assert_(migration.includes("link_omega_user_on_auth_insert"), "auth link trigger");
  assert_(migration.includes("enable row level security"), "RLS");
  assert_(migration.includes("TRIAL_INITIAL_GRANT"), "trial reason");
  assert_(migration.includes("MONTHLY_RENEWAL"), "monthly reason");
  assert_(
    !/create\s+table\s+(?:public\.)?quotation/i.test(migration) &&
      !/create\s+table\s+(?:public\.)?dxf/i.test(migration),
    "no quotation/dxf tables"
  );
}

{
  const row: OmegaUserRow = {
    email: "a@b.com",
    company_name: "Co",
    company_registration_number: "0515",
    address: null,
    phone: null,
    contact_name: "Dana",
    account_status: "trial",
    credits_balance: 10,
    credits_period_start: "2026-08-01",
    is_active: true,
    auth_user_id: "u1",
  };
  const dto = toOmegaCurrentUser(row);
  assertEq(dto.creditsBalance, 10, "trial credits in DTO");
  assertEq(dto.renewalDate, null, "trial has no renewal");
  assertEq(dto.companyRegistrationNumber, "0515", "preserve leading zero as text");

  const perm = toOmegaCurrentUser({ ...row, account_status: "permanent", credits_balance: 500 });
  assert_(perm.renewalDate != null, "permanent has renewal date");
  assertEq(deriveRenewalDate("trial"), null, "derive trial null");
}

{
  clearAuthSession();
  setCurrentOmegaUser({
    email: "trial@example.com",
    companyName: "Trial Co",
    companyRegistrationNumber: null,
    address: null,
    phone: null,
    contactName: "Contact",
    accountStatus: "trial",
    creditsBalance: 7,
    renewalDate: null,
    isActive: true,
  });
  const summary = getBillingUsageSummary();
  assertEq(summary.currentCredits, 7, "billing shows canonical credits");
  assertEq(summary.renewalDate, null, "trial renewal null");
  assertEq(BILLING_NO_RENEWAL_LABEL, "לא מתחדש", "trial label");
  assertEq(formatBillingCredits(7), "7", "format credits");

  setCurrentOmegaUser({
    email: "perm@example.com",
    companyName: "Perm Co",
    companyRegistrationNumber: null,
    address: null,
    phone: null,
    contactName: null,
    accountStatus: "permanent",
    creditsBalance: 500,
    renewalDate: "2026-09-01",
    isActive: true,
  });
  const permSummary = getBillingUsageSummary();
  assertEq(permSummary.renewalDate, "2026-09-01", "permanent renewal date");
  assertEq(
    formatBillingRenewalDate("2026-09-01"),
    "01.09.2026",
    "localized renewal"
  );
  clearAuthSession();
}

{
  const analyze = fs.readFileSync(
    path.join(repoRoot, "app/api/simple-intake/analyze/route.ts"),
    "utf8"
  );
  assert_(analyze.includes("consumeQuotationCredit"), "analyze consumes credit");
  assert_(analyze.includes("refundQuotationCredit"), "analyze can refund");
  assert_(analyze.includes("loadAuthenticatedOmegaUser"), "analyze requires auth");
  assert_(
    analyze.includes("INSUFFICIENT_CREDITS") ||
      analyze.includes("insufficientCredits"),
    "insufficient credits path"
  );
}

{
  const sessionStore = fs.readFileSync(
    path.join(repoRoot, "features/simple-intake/sessionStore.ts"),
    "utf8"
  );
  assert_(
    sessionStore.includes("analysisIdempotencyKey"),
    "client sends idempotency key"
  );
  assert_(
    sessionStore.includes("אין מספיק קרדיטים ליצירת הצעת מחיר חדשה"),
    "insufficient credits message"
  );
  assert_(
    sessionStore.includes("applyCreditsBalance"),
    "updates balance from server"
  );
}

{
  // Non-consumption boundaries: export/save/restore do not call consume
  const pdfExport = fs.readFileSync(
    path.join(repoRoot, "app/api/simple-intake/export-quotation-pdf/route.ts"),
    "utf8"
  );
  assert_(!pdfExport.includes("consumeQuotationCredit"), "PDF export no credit");

  const saveOmega = fs.readFileSync(
    path.join(repoRoot, "features/simple-intake/omegaProject/saveOmegaProjectFile.ts"),
    "utf8"
  );
  assert_(!saveOmega.includes("consumeQuotationCredit"), "save .segment no credit");
}

{
  const company = fs.readFileSync(
    path.join(repoRoot, "features/accountModals/CompanySettingsModal.tsx"),
    "utf8"
  );
  assert_(company.includes("data-email-readonly"), "email readonly");
  const persist = fs.readFileSync(
    path.join(repoRoot, "features/accountModals/companySettingsPersistence.ts"),
    "utf8"
  );
  assert_(
    persist.includes("update-company-profile"),
    "company save via controlled API"
  );
  assert_(!persist.includes("credits_balance"), "company save no credits");
  assert_(!persist.includes("account_status"), "company save no status");
}

{
  const signedIn = fs.readFileSync(
    path.join(repoRoot, "features/accountModals/signedInUser.ts"),
    "utf8"
  );
  assert_(signedIn.includes("getCurrentOmegaUser"), "account uses real profile");
  assert_(!signedIn.includes("Maor.andios@gmail.com"), "no hardcoded email");
}

{
  assert_(
    fs.existsSync(path.join(repoRoot, "docs/supabase-production-setup.md")),
    "setup checklist exists"
  );
  const docs = fs.readFileSync(
    path.join(repoRoot, "docs/supabase-production-setup.md"),
    "utf8"
  );
  assert_(docs.includes("Before User Created"), "hook docs");
  assert_(docs.includes("{{ .Token }}"), "otp template docs");
  assert_(docs.includes("renew_permanent_user_credits"), "cron docs");
  assert_(!/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(docs), "no jwt secrets in docs");
}

{
  const d = getSupabaseAuthDiagnostics();
  assertEq(d.quotationRowsStoredInSupabase, 0, "no quotation rows");
  assertEq(d.dxfFilesStoredInSupabase, 0, "no dxf files");
  assertEq(d.omegaProjectFilesStoredInSupabase, 0, "no omega files");
  assertEq(d.clientCreditMutationCount, 0, "no client credit mutation");
  assertEq(d.serviceRoleExposedClientSide, false, "service role not exposed");
  // unauthorizedProfileReadCount may be >0 in live servers; for unit diag reset expectation:
  // We only assert the structural invariants that must always hold for storage.
  assert_(d.serviceRoleExposedClientSide === false, "invariant service role");
  assert_(d.quotationRowsStoredInSupabase === 0, "invariant quotations");
  assert_(d.dxfFilesStoredInSupabase === 0, "invariant dxf");
  assert_(d.omegaProjectFilesStoredInSupabase === 0, "invariant omega");
  assert_(d.clientCreditMutationCount === 0, "invariant client credits");
  recordDiagnostic("otpRequestCount");
  assert_(getSupabaseAuthDiagnostics().otpRequestCount >= 1, "diag counter works");
}

{
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  ) as { dependencies: Record<string, string> };
  assert_(pkg.dependencies["@supabase/supabase-js"], "supabase-js installed");
  assert_(pkg.dependencies["@supabase/ssr"], "supabase ssr installed");
}

console.log("All supabase-auth-credits-v1 checks passed.");
