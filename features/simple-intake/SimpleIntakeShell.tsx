"use client";

import { useMemo } from "react";
import { AuthScreen, useAuthBootstrapped, useIsSignedIn, useOmegaCurrentUser, signOut } from "@/features/auth";
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
  deriveQuoteStepperStates,
} from "./quoteWorkflow";
import { WeightPricingScreen } from "./weightPricing";
import { FinalQuotationScreen } from "./finalQuotation";
import { OmegaProjectBeforeUnload } from "./omegaProject/OmegaProjectBeforeUnload";
import { Button } from "@/components/ui/button";

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

function HydrationGate({ status }: { status: string }) {
  const label =
    status === "READING_ARCHIVE"
      ? "קורא את קובץ ההצעה..."
      : status === "VALIDATING" || status === "MIGRATING"
        ? "בודק את קובץ ההצעה..."
        : status === "HYDRATING"
          ? "טוען את ההצעה..."
          : "טוען...";
  return (
    <div
      className="flex min-h-[100vh] min-h-[100dvh] flex-col items-center justify-center"
      dir="rtl"
      data-omega-hydration-gate="true"
    >
      <p className="text-[15px] font-medium" style={{ color: "var(--ow-text)" }}>
        {label}
      </p>
      <OmegaProjectBeforeUnload />
    </div>
  );
}

export function SimpleIntakeShell() {
  const authReady = useAuthBootstrapped();
  const signedIn = useIsSignedIn();
  const omegaUser = useOmegaCurrentUser();
  const session = useSimpleIntakeSession();

  const materialSummary = useMemo(
    () => summarizeMaterialList(session.materialListRows),
    [session.materialListRows]
  );

  const stepperStates = deriveQuoteStepperStates(session.quoteStage, {
    materialNeedsCompletion: materialSummary.incompleteRows > 0,
  });

  // No dark "טוען..." gate — if we already have a session, enter the app.
  // If not signed in yet, keep the login UI (bootstrap finishes in the background).
  if (!signedIn) {
    return <AuthScreen />;
  }

  // Avoid flashing login while cookie session is still resolving after a soft nav.
  if (!authReady && !omegaUser) {
    return (
      <div
        className="omega-upload-screen min-h-[100dvh] w-full"
        dir="rtl"
        data-auth-bootstrapping="true"
        style={{ backgroundColor: "#f8fafb" }}
        aria-busy="true"
      />
    );
  }

  if (omegaUser && !omegaUser.isActive) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4"
        dir="rtl"
        data-auth-blocked="inactive"
      >
        <p className="text-[16px] font-medium text-[#13202B]">
          הגישה לחשבון זה אינה פעילה
        </p>
        <Button
          type="button"
          onClick={() => void signOut()}
          className="rounded-2xl"
        >
          התנתקות
        </Button>
      </div>
    );
  }

  const hydrating =
    session.hydrationStatus === "READING_ARCHIVE" ||
    session.hydrationStatus === "VALIDATING" ||
    session.hydrationStatus === "MIGRATING" ||
    session.hydrationStatus === "HYDRATING";

  if (hydrating) {
    return <HydrationGate status={session.hydrationStatus} />;
  }

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
        <WeightPricingScreen />
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
        <FinalQuotationScreen />
      </OmegaAppShell>
    );
  }

  let body: React.ReactNode;
  if (session.status === "ANALYZING" || session.status === "DXF_PROCESSING") {
    body = <AnalyzingStep />;
  } else if (session.status === "MATERIAL_LIST_QUALITY_FAILED") {
    body = <MaterialListQualityFailedScreen />;
  } else if (
    session.quoteStage === "DXF_INTAKE" ||
    session.status === "DXF_UPLOAD"
  ) {
    body = <DxfUploadStage />;
  } else if (session.status === "MATERIAL_LIST_REVIEW") {
    // Recovery / quality-failed path only — primary flow skips this screen.
    body = <MaterialListReviewScreen />;
  } else if (
    session.status === "DXF_REVIEW" ||
    session.status === "FINAL_PRICING_TABLE" ||
    session.status === "READY"
  ) {
    body = <ReadyStep />;
  } else if (session.status === "FAILED") {
    body = <FailedStep />;
  } else {
    // MATERIAL_INTAKE upload
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
