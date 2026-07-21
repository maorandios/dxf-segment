"use client";

import { useMemo } from "react";
import { AnalyzingStep } from "./components/AnalyzingStep";
import { FailedStep } from "./components/FailedStep";
import { ReadyStep } from "./components/ReadyStep";
import { UploadStep } from "./components/UploadStep";
import {
  DxfUploadStage,
  MaterialListQualityFailedScreen,
  MaterialListReviewScreen,
} from "./materialList";
import { summarizeMaterialList } from "./materialList/completeness";
import { useSimpleIntakeSession } from "./useSimpleIntakeSession";
import { simpleIntakeActions } from "./sessionStore";
import { OmegaAppShell, deriveHeaderStatus } from "./ui";
import {
  QuoteSetupScreen,
  QuotePricingPlaceholder,
  QuoteCompletedPlaceholder,
  deriveQuoteStepperStates,
} from "./quoteWorkflow";

function downloadDebug(debug: Record<string, unknown> | null): void {
  if (!debug) return;
  const blob = new Blob([JSON.stringify(debug, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `omega-simple-intake-debug-${debug.runId ?? "run"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SimpleIntakeShell() {
  const session = useSimpleIntakeSession();

  const materialSummary = useMemo(
    () => summarizeMaterialList(session.materialListRows),
    [session.materialListRows]
  );

  const stepperStates = deriveQuoteStepperStates(session.quoteStage, {
    materialNeedsCompletion: materialSummary.incompleteRows > 0,
  });

  if (!session.quoteDetails || session.quoteStage === "QUOTE_SETUP") {
    return <QuoteSetupScreen />;
  }

  if (session.quoteStage === "QUOTE_PRICING") {
    return (
      <OmegaAppShell
        quoteDetails={session.quoteDetails}
        quoteStage={session.quoteStage}
        enteredQuoteStages={session.enteredQuoteStages}
        stepperStates={stepperStates}
        statusText={deriveHeaderStatus(session)}
        onDownloadDebug={() => downloadDebug(session.lastDebug)}
        canDownloadDebug={Boolean(session.lastDebug)}
      >
        <QuotePricingPlaceholder />
      </OmegaAppShell>
    );
  }

  if (session.quoteStage === "COMPLETED") {
    return (
      <OmegaAppShell
        quoteDetails={session.quoteDetails}
        quoteStage={session.quoteStage}
        enteredQuoteStages={session.enteredQuoteStages}
        stepperStates={stepperStates}
        statusText={deriveHeaderStatus(session)}
      >
        <QuoteCompletedPlaceholder />
      </OmegaAppShell>
    );
  }

  let body: React.ReactNode;
  if (session.status === "ANALYZING" || session.status === "DXF_PROCESSING") {
    body = <AnalyzingStep />;
  } else if (session.status === "MATERIAL_LIST_QUALITY_FAILED") {
    body = <MaterialListQualityFailedScreen />;
  } else if (session.status === "MATERIAL_LIST_REVIEW") {
    body = <MaterialListReviewScreen />;
  } else if (session.status === "DXF_UPLOAD") {
    body = <DxfUploadStage />;
  } else if (
    session.status === "DXF_REVIEW" ||
    session.status === "FINAL_PRICING_TABLE" ||
    session.status === "READY"
  ) {
    body = <ReadyStep />;
  } else if (session.status === "FAILED") {
    body = <FailedStep />;
  } else {
    body = <UploadStep />;
  }

  return (
    <OmegaAppShell
      quoteDetails={session.quoteDetails}
      quoteStage={session.quoteStage}
      enteredQuoteStages={session.enteredQuoteStages}
      stepperStates={stepperStates}
      statusText={deriveHeaderStatus(session)}
      onReplaceWorkbook={() => simpleIntakeActions.backToFiles()}
      onDownloadDebug={() => downloadDebug(session.lastDebug)}
      canDownloadDebug={Boolean(session.lastDebug)}
    >
      {body}
    </OmegaAppShell>
  );
}
