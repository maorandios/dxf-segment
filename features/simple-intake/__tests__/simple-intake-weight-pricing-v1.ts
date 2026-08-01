/**
 * OMEGA — Weight-Based Pricing Screen v1 (superseded by finish-v2).
 * Retains navigation/chrome wiring checks; pricing model tests live in v2.
 * Run: npx tsx features/simple-intake/__tests__/simple-intake-weight-pricing-v1.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function assert_(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
}

console.log("OMEGA — Weight-Based Pricing Screen v1 (wiring only; model → v2)");

{
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  const screen = fs.readFileSync(
    path.join(root, "results/ResultsReviewScreen.tsx"),
    "utf8"
  );
  const pricingScreen = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingScreen.tsx"),
    "utf8"
  );
  const toolbar = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingToolbar.tsx"),
    "utf8"
  );
  const metrics = fs.readFileSync(
    path.join(root, "weightPricing/WeightPricingMetricCards.tsx"),
    "utf8"
  );

  assert_(store.includes("advanceToPricing"), "approve advances to pricing");
  assert_(store.includes("backToFinalQuoteList"), "back to list");
  assert_(store.includes("advanceToQuotationSummary"), "continue to summary");
  assert_(store.includes("weightPricingDraft"), "draft in session");
  assert_(
    store.includes("weightPricingNestingCache"),
    "nesting cache in session"
  );
  assert_(
    store.includes("setWeightPricingNestingCache"),
    "set nesting cache action"
  );
  assert_(shell.includes("WeightPricingScreen"), "shell mounts pricing");
  assert_(screen.includes("advanceToPricing(finalRows)"), "approve passes rows");
  assert_(pricingScreen.includes('title="תמחור הצעת מחיר"'), "screen title");
  assert_(toolbar.includes("חזרה לרשימה"), "back action");
  assert_(toolbar.includes("ייצא דוח EXCEL"), "excel export");
  assert_(!toolbar.includes("שמור תמחור"), "no save button");
  assert_(toolbar.includes("המשך לסיכום"), "continue");
  assert_(toolbar.includes("ArrowLeft"), "continue left arrow");
  assert_(
    pricingScreen.includes("buildWeightPricingExcelWorkbook"),
    "excel workbook wired"
  );
  assert_(!pricingScreen.includes("StickyActionBar"), "no floating bar");
  assert_(
    pricingScreen.includes('data-nesting-enabled="estimate"'),
    "nesting estimate mode"
  );
  assert_(
    pricingScreen.includes("usePricingGroupNestingEstimates"),
    "nesting hook"
  );
  assert_(metrics.includes('משקל כולל (ק"ג)'), "metric total weight");
  assert_(pricingScreen.includes("finish-v2") || pricingScreen.includes("applyQuickPricingDefaults"), "v2 model");

  console.log("✓ navigation wiring preserved; pricing model covered by v2");
}

console.log("\nOMEGA — Weight-Based Pricing Screen v1 — wiring checks passed.");
