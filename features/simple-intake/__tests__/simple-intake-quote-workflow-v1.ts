/**
 * OMEGA — Quote Setup and Five-Step Workflow tests (DXF-first order).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSimpleIntakeSession,
  simpleIntakeActions,
} from "../sessionStore";
import {
  QUOTE_STEPPER_LABELS,
  QUOTE_STEPPER_ORDER,
  deriveQuoteStepperStates,
} from "../quoteWorkflow/quoteStageModel";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, msg);
}

console.log("=== Quote Setup and Five-Step Workflow ===\n");

{
  simpleIntakeActions.reset();
  const s = getSimpleIntakeSession();
  assertEq(s.quoteStage, "QUOTE_SETUP", "starts at setup");
  assertEq(s.quoteDetails, null, "no quote details yet");
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  assert(shell.includes("QuoteSetupScreen"), "shell uses setup screen");
  const setup = fs.readFileSync(
    path.join(root, "quoteWorkflow/QuoteSetupScreen.tsx"),
    "utf8"
  );
  assert(setup.includes("יצירת הצעת מחיר חדשה"), "setup title");
  assert(setup.includes("הבא"), "next CTA");
  assert(!setup.includes("FiveStepProgressBar"), "no five-step on setup");
  console.log("✓ The initial screen is quote setup; five-step bar hidden");
}

{
  simpleIntakeActions.reset();
  assertEq(
    simpleIntakeActions.createQuote({ projectName: "   ", customerName: "A" }),
    false,
    "whitespace project invalid"
  );
  assertEq(
    simpleIntakeActions.createQuote({ projectName: "P", customerName: "  " }),
    false,
    "whitespace customer invalid"
  );
  console.log("✓ Project and customer names required; whitespace-only invalid");
}

{
  simpleIntakeActions.reset();
  const ok = simpleIntakeActions.createQuote({
    projectName: "  מבנה פלדה  ",
    customerName: "  קבוצת אלפא  ",
  });
  assertEq(ok, true, "create ok");
  const s = getSimpleIntakeSession();
  assertEq(s.quoteDetails?.projectName, "מבנה פלדה", "trimmed project");
  assertEq(s.quoteDetails?.customerName, "קבוצת אלפא", "trimmed customer");
  assertEq(s.quoteStage, "DXF_INTAKE", "opens DXF intake stage");
  assert(s.enteredQuoteStages.includes("DXF_INTAKE"), "entered DXF");
  console.log("✓ Clicking הבא stores quote details and opens DXF intake");
}

{
  assertEq(QUOTE_STEPPER_ORDER.length, 5, "exactly five steps");
  assertEq(QUOTE_STEPPER_ORDER[0], "DXF_INTAKE", "step1");
  assertEq(QUOTE_STEPPER_LABELS.DXF_INTAKE, "התאמות קבצי DXF", "step1 label");
  assertEq(QUOTE_STEPPER_LABELS.MATERIAL_INTAKE, "הפקת רשימת חומר", "step2");
  assertEq(QUOTE_STEPPER_LABELS.UNIFIED_REVIEW, "אישור נתונים", "step3");
  assertEq(QUOTE_STEPPER_LABELS.QUOTE_PRICING, "תמחור הצעה", "step4");
  assertEq(QUOTE_STEPPER_LABELS.COMPLETED, "סיום", "step5");
  console.log("✓ Progress bar has exactly five Hebrew step labels (DXF-first)");
}

{
  const header = fs.readFileSync(
    path.join(root, "ui/OmegaHeader.tsx"),
    "utf8"
  );
  assert(header.includes("projectName"), "header shows project");
  assert(header.includes("customerName"), "header shows customer");
  assert(header.includes("ביטול הצעת מחיר"), "cancel quote action");
  assert(header.includes("שמור הצעת מחיר"), "save quote action");
  console.log("✓ Header shows project/customer with cancel/save");
}

{
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert(store.includes('quoteStage: "UNIFIED_REVIEW"'), "unified review stage");
  assert(store.includes("advanceToPricing"), "pricing advance");
  assert(store.includes("goToQuoteStage"), "back nav");
  assert(store.includes("completeDxfIntake"), "dxf intake complete");
  console.log("✓ DXF intake → material → unified review transitions wired");
}

{
  const pricing = fs.readFileSync(
    path.join(root, "quoteWorkflow/QuotePricingPlaceholder.tsx"),
    "utf8"
  );
  assert(pricing.includes("תמחור ההצעה"), "pricing heading");
  assert(pricing.includes("disabled"), "pricing CTA disabled");
  assert(!pricing.includes("calculatePrice"), "no pricing logic");
  console.log("✓ Pricing remains a placeholder without pricing logic");
}

{
  simpleIntakeActions.reset();
  simpleIntakeActions.createQuote({ projectName: "P", customerName: "C" });
  simpleIntakeActions.goToQuoteStage("DXF_INTAKE");
  assertEq(getSimpleIntakeSession().quoteDetails?.projectName, "P", "preserved");
  console.log("✓ Back navigation preserves local quote workspace state");
}

{
  simpleIntakeActions.reset();
  simpleIntakeActions.createQuote({ projectName: "Old", customerName: "Cust" });
  assertEq(
    simpleIntakeActions.updateQuoteDetails({
      projectName: "New Project",
      customerName: "New Customer",
    }),
    true,
    "update ok"
  );
  const s = getSimpleIntakeSession();
  assertEq(s.quoteDetails?.projectName, "New Project", "project updated");
  assertEq(s.quoteStage, "DXF_INTAKE", "stays in workspace");
  console.log("✓ Quote details can be edited from the workspace");
}

{
  const states = deriveQuoteStepperStates("DXF_INTAKE");
  assertEq(states.DXF_INTAKE, "ACTIVE", "active dxf");
  assertEq(states.MATERIAL_INTAKE, "UPCOMING", "upcoming material");
  assertEq(states.COMPLETED, "UPCOMING", "upcoming end");
  const mid = deriveQuoteStepperStates("UNIFIED_REVIEW");
  assertEq(mid.DXF_INTAKE, "COMPLETED", "completed dxf");
  assertEq(mid.UNIFIED_REVIEW, "ACTIVE", "active unified");
  console.log("✓ Stepper state derivation maps stages correctly");
}

{
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  assert(shell.includes("QuotePricingPlaceholder"), "pricing screen");
  assert(shell.includes("QuoteCompletedPlaceholder"), "completed screen");
  assert(!shell.includes("calculatePrice"), "no pricing calc in shell");
  console.log("✓ Pricing and completed stages remain placeholders");
}

console.log("\n=== All Quote Setup and Five-Step Workflow tests passed ===\n");
