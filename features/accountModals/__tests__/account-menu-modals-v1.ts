/**
 * OMEGA — Account Menu Modals v1
 * Run: npx tsx features/accountModals/__tests__/account-menu-modals-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeAccountModal,
  getAccountModal,
  openAccountModal,
} from "../accountModalStore";
import {
  companySettingsEqual,
  emptyCompanySettings,
  isValidOptionalEmail,
  loadCompanySettings,
  saveCompanySettings,
} from "../companySettingsPersistence";
import {
  BILLING_UNAVAILABLE_LABEL,
  formatBillingCredits,
  formatBillingRenewalDate,
  getBillingUsageSummary,
} from "../billingUsageSummary";
import {
  getAppPreferences,
  saveAppPreferences,
} from "@/lib/settings/appPreferences";
import { DEFAULT_APP_PREFERENCES } from "@/types/settings";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const repoRoot = path.join(__dirname, "../../..");

/** Minimal localStorage stub for Node persistence tests. */
function installLocalStorageStub(): void {
  const map = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
  (globalThis as { window?: unknown; localStorage?: unknown }).window = {
    localStorage,
    dispatchEvent() {
      return true;
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
}

installLocalStorageStub();

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}
function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, `${msg}: expected ${String(expected)} got ${String(actual)}`);
}

console.log("OMEGA — Account Menu Modals v1");

{
  const menu = fs.readFileSync(
    path.join(repoRoot, "features/simple-intake/workbookUpload/UserAccountMenu.tsx"),
    "utf8"
  );
  assert_(menu.includes("הגדרות"), "settings label");
  assert_(menu.includes("הגדרות חומרים"), "materials label");
  assert_(menu.includes("חיוב ושימוש"), "billing label");
  assert_(menu.includes("התנתק"), "logout visible");
  assert_(menu.includes('data-logout-inactive="true"'), "logout inactive marker");
  assert_(menu.includes("disabled"), "logout disabled");
  assert_(!menu.includes('href="/settings/account"'), "no account page nav");
  assert_(!menu.includes('href="/settings/materials"'), "no materials page nav");
  assert_(!menu.includes('href="/settings/bill-and-usage"'), "no billing page nav");
  assert_(menu.includes('openModal("COMPANY_SETTINGS")'), "opens company modal");
  assert_(menu.includes('openModal("MATERIAL_SETTINGS")'), "opens materials modal");
  assert_(menu.includes('openModal("BILLING_USAGE")'), "opens billing modal");
  assert_(menu.includes("setMenuOpen(false)"), "closes dropdown on open");
  console.log("✓ account dropdown opens modals, no route links, logout inactive");
}

{
  closeAccountModal();
  assertEq(getAccountModal(), null, "starts closed");
  openAccountModal("COMPANY_SETTINGS");
  assertEq(getAccountModal(), "COMPANY_SETTINGS", "company open");
  openAccountModal("BILLING_USAGE");
  assertEq(getAccountModal(), "BILLING_USAGE", "only one modal");
  closeAccountModal();
  assertEq(getAccountModal(), null, "closed");
  openAccountModal("MATERIAL_SETTINGS");
  assertEq(getAccountModal(), "MATERIAL_SETTINGS", "materials open");
  closeAccountModal();
  console.log("✓ shared account-modal state");
}

{
  const companySrc = fs.readFileSync(
    path.join(root, "CompanySettingsModal.tsx"),
    "utf8"
  );
  assert_(companySrc.includes("שם חברה"), "field company name");
  assert_(companySrc.includes("ח.פ"), "field registration");
  assert_(companySrc.includes("כתובת"), "field address");
  assert_(companySrc.includes("טלפון"), "field phone");
  assert_(companySrc.includes('דוא"ל') || companySrc.includes("דוא״ל"), "field email");
  assert_(companySrc.includes("שם איש קשר"), "field contact");
  assert_(companySrc.includes("שמור הגדרות"), "save action");
  assert_(companySrc.includes("ביטול"), "cancel action");
  assert_(companySrc.includes("יש שינויים שלא נשמרו"), "unsaved confirm");
  assert_(companySrc.includes("ההגדרות נשמרו"), "saved message");
  assert_(companySrc.includes('data-field="companyRegistrationNumber"'), "reg field");
  assert_(companySrc.includes('type="text"'), "reg as text");
  console.log("✓ company settings modal fields");
}

{
  assert_(isValidOptionalEmail(""), "empty email ok");
  assert_(isValidOptionalEmail("a@b.co"), "valid email");
  assert_(!isValidOptionalEmail("not-an-email"), "invalid email");
  console.log("✓ company email validation");
}

{
  const prev = getAppPreferences();
  try {
    saveAppPreferences({ ...DEFAULT_APP_PREFERENCES });
    const loaded = loadCompanySettings();
    assertEq(loaded.companyName, "", "no fake company name");
    assertEq(loaded.companyRegistrationNumber, "", "no fake registration");
    assertEq(loaded.email, "", "no fake email");

    saveCompanySettings({
      ...emptyCompanySettings(),
      companyName: "אלפא",
      companyRegistrationNumber: "01234567",
      email: "a@b.co",
    });
    const after = loadCompanySettings();
    assertEq(after.companyName, "אלפא", "saved name");
    assertEq(after.companyRegistrationNumber, "01234567", "reg preserved as text");
    assertEq(typeof after.companyRegistrationNumber, "string", "reg type string");
    assert_(
      getAppPreferences().companyRegistrationNumber === "01234567",
      "prefs boundary"
    );
    assert_(
      !companySettingsEqual(loaded, after),
      "dirty when changed"
    );
    assert_(
      companySettingsEqual(after, after),
      "equal when same"
    );
  } finally {
    saveAppPreferences(prev);
  }
  console.log("✓ company persistence boundary + no fake defaults");
}

{
  const billingSrc = fs.readFileSync(
    path.join(root, "BillingUsageModal.tsx"),
    "utf8"
  );
  assert_(billingSrc.includes("מועד חידוש חבילה"), "renewal label");
  assert_(billingSrc.includes("כמות קרדיטים עדכנית"), "credits label");
  assert_(billingSrc.includes("סגור"), "close action");
  assert_(!billingSrc.includes("upgrade"), "no upgrade");
  assert_(!billingSrc.includes("תשלום"), "no payment");
  assert_(!billingSrc.includes("type=\"number\""), "read-only no edit inputs");
  const summary = getBillingUsageSummary();
  assertEq(summary.renewalDate, null, "no invented renewal");
  assertEq(summary.currentCredits, null, "no invented credits");
  assertEq(formatBillingRenewalDate(null), null, "null renewal");
  assertEq(formatBillingCredits(null), null, "null credits");
  assertEq(BILLING_UNAVAILABLE_LABEL, "לא זמין", "unavailable label");
  assertEq(formatBillingRenewalDate("2026-09-15"), "15.09.2026", "date format");
  assertEq(formatBillingCredits(1240), "1,240", "credits format");
  console.log("✓ billing modal + unavailable state");
}

{
  const materialsSrc = fs.readFileSync(
    path.join(root, "MaterialSettingsModal.tsx"),
    "utf8"
  );
  assert_(materialsSrc.includes("הגדרות חומרים"), "materials title");
  assert_(materialsSrc.includes("הגדרות חומרים יתווספו בהמשך"), "empty state");
  assert_(materialsSrc.includes('data-material-settings-empty="true"'), "empty marker");
  assert_(!materialsSrc.includes("density"), "no density");
  assert_(!materialsSrc.includes("price"), "no price");
  assert_(!materialsSrc.includes("<input"), "no form inputs");
  console.log("✓ empty materials modal");
}

{
  const shell = fs.readFileSync(path.join(root, "AccountModalShell.tsx"), "utf8");
  assert_(shell.includes('dir="rtl"'), "rtl");
  assert_(shell.includes("DialogPrimitive"), "dialog primitive");
  assert_(shell.includes("ow-account-modal-scrim"), "toast-style scrim");
  assert_(shell.includes("ow-account-modal-panel"), "slide panel");
  assert_(shell.includes("closeAriaLabel"), "close aria");
  const motionCss = fs.readFileSync(path.join(root, "account-modal.css"), "utf8");
  assert_(motionCss.includes("ow-account-modal-in"), "slide-in keyframes");
  assert_(motionCss.includes("backdrop-filter"), "blur backdrop");
  assert_(motionCss.includes("rgba(15, 23, 42, 0.28)"), "toast gray scrim");
  const host = fs.readFileSync(path.join(root, "AccountModalsHost.tsx"), "utf8");
  assert_(host.includes("CompanySettingsModal"), "host company");
  assert_(host.includes("BillingUsageModal"), "host billing");
  assert_(host.includes("MaterialSettingsModal"), "host materials");
  const chrome = fs.readFileSync(
    path.join(repoRoot, "components/layout/RootChrome.tsx"),
    "utf8"
  );
  assert_(chrome.includes("AccountModalsHost"), "host mounted");
  console.log("✓ shared shell + host wiring");
}

{
  const topBar = fs.readFileSync(
    path.join(repoRoot, "components/shared/AppTopBar.tsx"),
    "utf8"
  );
  assert_(topBar.includes("openAccountModal"), "topbar modals");
  assert_(!topBar.includes('href="/settings/account"'), "topbar no account href");
  console.log("✓ AppTopBar uses modals");
}

console.log("\nOMEGA — Account Menu Modals v1 — all checks passed.");
