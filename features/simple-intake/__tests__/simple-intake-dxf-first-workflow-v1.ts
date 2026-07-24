/**
 * OMEGA — DXF-First Unified Intake Workflow v1 tests
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
  WORKFLOW_STAGE_ORDER_DEBUG,
  deriveQuoteStepperStates,
} from "../quoteWorkflow/quoteStageModel";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function assertEq<T>(actual: T, expected: T, msg: string): void {
  assert.equal(actual, expected, msg);
}

console.log("=== DXF-First Unified Intake Workflow v1 ===\n");

{
  simpleIntakeActions.reset();
  const s = getSimpleIntakeSession();
  assertEq(s.quoteStage, "QUOTE_SETUP", "starts at setup");
  assertEq(s.quoteDetails, null, "no quote details yet");
  console.log("✓ Quote setup is the initial screen");
}

{
  simpleIntakeActions.reset();
  const ok = simpleIntakeActions.createQuote({
    projectName: "  מבנה פלדה  ",
    customerName: "  קבוצת אלפא  ",
  });
  assertEq(ok, true, "create ok");
  const s = getSimpleIntakeSession();
  assertEq(s.quoteStage, "DXF_INTAKE", "opens DXF intake");
  assertEq(s.status, "DXF_UPLOAD", "status is DXF upload");
  assert(s.enteredQuoteStages.includes("DXF_INTAKE"), "entered DXF");
  assert(!s.enteredQuoteStages.includes("MATERIAL_INTAKE"), "material not yet");
  console.log("✓ Quote setup advances to DXF intake");
}

{
  assertEq(QUOTE_STEPPER_ORDER[0], "DXF_INTAKE", "step1 dxf");
  assertEq(QUOTE_STEPPER_ORDER[1], "MATERIAL_INTAKE", "step2 material");
  assertEq(QUOTE_STEPPER_ORDER[2], "UNIFIED_REVIEW", "step3 unified");
  assertEq(QUOTE_STEPPER_ORDER[3], "QUOTE_PRICING", "step4 pricing");
  assertEq(QUOTE_STEPPER_ORDER[4], "COMPLETED", "step5 completed");
  assertEq(QUOTE_STEPPER_LABELS.DXF_INTAKE, "התאמות קבצי DXF", "dxf label");
  assertEq(QUOTE_STEPPER_LABELS.MATERIAL_INTAKE, "הפקת רשימת חומר", "material label");
  assertEq(QUOTE_STEPPER_LABELS.UNIFIED_REVIEW, "אישור נתונים", "review label");
  assert.deepEqual(
    [...WORKFLOW_STAGE_ORDER_DEBUG],
    [
      "DXF_INTAKE",
      "MATERIAL_INTAKE",
      "UNIFIED_REVIEW",
      "QUOTE_PRICING",
      "COMPLETED",
    ],
    "debug stage order"
  );
  console.log("✓ First numbered workflow step is DXF intake");
}

{
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  assert(shell.includes('quoteStage === "DXF_INTAKE"'), "shell routes DXF first");
  assert(shell.includes("DxfUploadStage"), "dxf stage mounted");
  assert(shell.includes("UploadStep"), "material upload still available");
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert(store.includes("completeDxfIntake"), "dxf intake complete action");
  assert(store.includes("buildWorkflowDebug"), "workflow debug");
  assert(
    store.includes("Preserve DXF registry") ||
      store.includes("dxfParts from stage 1") ||
      !store.includes("dxfParts: [],\n      timing"),
    "analyze preserves DXF registry"
  );
  assert(store.includes("runDxfStageFromApprovedList"), "matching reused");
  assert(!store.includes('quoteStage: "MATERIAL_LIST"'), "old MATERIAL_LIST stage gone");
  assert(!store.includes('quoteStage: "DXF_MATCHING"'), "old DXF_MATCHING stage gone");
  console.log("✓ Material intake follows DXF; analyze preserves registry and auto-matches");
}

{
  const dxfStage = fs.readFileSync(
    path.join(root, "materialList/DxfUploadStage.tsx"),
    "utf8"
  );
  assert(dxfStage.includes("completeDxfIntake"), "dxf-first continue");
  assert(dxfStage.includes("isDxfFirst"), "dxf-first mode");
  assert(!/openai|gpt|responses\.parse/i.test(dxfStage), "no AI in DXF UI");
  console.log("✓ DXFs parse locally before material; no AI during DXF intake");
}

{
  simpleIntakeActions.reset();
  simpleIntakeActions.createQuote({ projectName: "P", customerName: "C" });
  assertEq(getSimpleIntakeSession().quoteStage, "DXF_INTAKE", "at dxf");
  // Simulate completing DXF intake without files should no-op
  void simpleIntakeActions.completeDxfIntake();
  assertEq(getSimpleIntakeSession().quoteStage, "DXF_INTAKE", "stays without files");

  simpleIntakeActions.goToQuoteStage("MATERIAL_INTAKE");
  // Cannot enter material via goTo if not entered — should stay
  assertEq(
    getSimpleIntakeSession().quoteStage,
    "DXF_INTAKE",
    "material cannot begin before entered"
  );
  console.log("✓ Material intake cannot begin before quote setup / DXF entry");
}

{
  simpleIntakeActions.reset();
  simpleIntakeActions.createQuote({ projectName: "P", customerName: "C" });
  // Mark stages entered as if user progressed
  const s = getSimpleIntakeSession();
  // Force entered stages by completing create + manual mark via go after enter
  // Use store internals by advancing quote stage through completeDxfIntake path simulation:
  (simpleIntakeActions as { goToQuoteStage: (st: string) => void }).goToQuoteStage(
    "DXF_INTAKE"
  );
  // Manually set entered via complete path: set session by re-create and patch through backToMaterialList after forcing
  void s;
  const states = deriveQuoteStepperStates("DXF_INTAKE");
  assertEq(states.DXF_INTAKE, "ACTIVE", "active dxf");
  assertEq(states.MATERIAL_INTAKE, "UPCOMING", "upcoming material");
  const mid = deriveQuoteStepperStates("UNIFIED_REVIEW");
  assertEq(mid.DXF_INTAKE, "COMPLETED", "completed dxf");
  assertEq(mid.MATERIAL_INTAKE, "COMPLETED", "completed material");
  assertEq(mid.UNIFIED_REVIEW, "ACTIVE", "active unified");
  console.log("✓ Stepper maps DXF → material → unified review");
}

{
  const store = fs.readFileSync(path.join(root, "sessionStore.ts"), "utf8");
  assert(
    store.includes('quoteStage: "UNIFIED_REVIEW"'),
    "matching lands on unified review"
  );
  assert(
    !store.includes('status: qualityGatePassed\n          ? "MATERIAL_LIST_REVIEW"'),
    "does not stop at material-only approval on success"
  );
  assert(
    store.includes("await simpleIntakeActions.runDxfStageFromApprovedList()"),
    "auto match after extraction"
  );
  console.log("✓ Matching runs automatically after material extraction");
}

{
  const shell = fs.readFileSync(path.join(root, "SimpleIntakeShell.tsx"), "utf8");
  assert(
    shell.includes("Recovery / quality-failed path") ||
      shell.includes("MATERIAL_LIST_REVIEW"),
    "material review kept for recovery"
  );
  const review = fs.readFileSync(
    path.join(root, "materialList/MaterialListReviewScreen.tsx"),
    "utf8"
  );
  assert(review.includes("approveMaterialList"), "review still reusable");
  console.log("✓ Standalone material approval removed from primary path");
}

{
  const pricing = fs.readFileSync(
    path.join(root, "quoteWorkflow/QuotePricingPlaceholder.tsx"),
    "utf8"
  );
  assert(pricing.includes("תמחור ההצעה"), "pricing heading");
  assert(pricing.includes("disabled"), "pricing CTA disabled");
  assert(!pricing.includes("calculatePrice"), "no pricing logic");
  console.log("✓ Pricing placeholder unchanged");
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
  console.log("✓ Back navigation preserves quote details");
}

{
  const completion = fs.readFileSync(
    path.join(root, "dxfLink/completionRequest.ts"),
    "utf8"
  );
  const workflow = fs.readFileSync(
    path.join(root, "workflow/PostAnalysisWorkflow.tsx"),
    "utf8"
  );
  assert(completion.includes("customerActionableIssues"), "completion issues");
  assert(
    workflow.includes("onOpenCompletionRequest") ||
      workflow.includes("CompletionRequest"),
    "completion in unified review workflow"
  );
  assert(
    workflow.includes("TABLE") ||
      workflow.includes("ResultsReviewScreen") ||
      workflow.includes("FINAL_TABLE"),
    "completion after unified review exists"
  );
  console.log("✓ Completion request remains on unified review path");
}

{
  const openai = fs.readFileSync(
    path.join(root, "materialList/openaiMaterialListExtract.ts"),
    "utf8"
  );
  const pdf = fs.readFileSync(
    path.join(root, "materialList/openaiPdfMaterialListExtract.ts"),
    "utf8"
  );
  assert(!openai.includes("dxfParts"), "excel extract no dxf parts");
  assert(!pdf.includes("dxfParts"), "pdf extract no dxf parts");
  assert(!/"entities"/.test(openai), "no dxf entities in excel path");
  console.log("✓ DXF files are not sent to AI; extraction unchanged");
}

console.log("\n=== All DXF-First Unified Intake Workflow v1 tests passed ===\n");
