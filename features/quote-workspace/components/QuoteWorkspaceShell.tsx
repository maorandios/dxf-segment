"use client";

import { useCallback } from "react";
import { PageContainer } from "@/components/shared/PageContainer";
import { useQuoteSession } from "../useQuoteSession";
import {
  getQuoteSessionState,
  quoteSessionActions,
} from "../quoteSessionStore";
import { selectCanAnalyze } from "../quoteSessionSelectors";
import { runQuoteIntakeAnalysis } from "../adapters/runQuoteIntakeAnalysis";
import { WorkingQuoteTableScreen } from "../table";
import { QuoteProgressHeader } from "./QuoteProgressHeader";
import { QuoteDetailsStep } from "./QuoteDetailsStep";
import { QuoteFilesStep } from "./QuoteFilesStep";
import {
  QuoteAnalysisComplete,
  QuoteAnalysisFailed,
  QuoteAnalysisProcessing,
} from "./QuoteAnalysisState";

function progressStepForSession(
  session: ReturnType<typeof useQuoteSession>["session"]
): 1 | 2 | 3 {
  if (!session || session.currentStep === "DETAILS") return 1;
  if (session.currentStep === "TABLE" || session.currentStep === "COMPLETE") {
    return 3;
  }
  return 2;
}

async function runAnalysisOnce(): Promise<void> {
  const before = getQuoteSessionState().session;
  if (!before || !selectCanAnalyze(before)) return;
  try {
    quoteSessionActions.startAnalysis("קורא את הקבצים");
    const current = getQuoteSessionState().session;
    if (!current) return;
    const result = await runQuoteIntakeAnalysis({
      quoteSession: current,
      sources: current.sources,
    });
    if (!result.ok) {
      quoteSessionActions.failAnalysis(result.errorHe);
      return;
    }
    quoteSessionActions.completeAnalysis({
      result: result.analyze,
      reviewSession: result.reviewSession,
      dxfRegistry: result.dxfRegistry,
    });
  } catch {
    quoteSessionActions.failAnalysis(
      "לא הצלחנו להשלים את ניתוח החומר. נסו שוב."
    );
  }
}

export function QuoteWorkspaceShell() {
  const { session } = useQuoteSession();

  const handleRetry = useCallback(() => {
    quoteSessionActions.prepareReanalyze();
    void runAnalysisOnce();
  }, []);

  const handleGoToTable = useCallback(() => {
    const ok = quoteSessionActions.goToTable();
    if (!ok) {
      // Stay on completion; table requires Review Session
    }
  }, []);

  const activeStep = progressStepForSession(session);

  let body: React.ReactNode;
  if (!session || session.currentStep === "DETAILS") {
    body = (
      <QuoteDetailsStep
        initialProjectName={session?.details.projectName}
        initialCustomerName={session?.details.customerName}
      />
    );
  } else if (
    session.status === "PROCESSING" ||
    session.currentStep === "PROCESSING"
  ) {
    body = <QuoteAnalysisProcessing session={session} />;
  } else if (session.currentStep === "TABLE") {
    body = <WorkingQuoteTableScreen />;
  } else if (
    session.status === "ANALYSIS_COMPLETE" &&
    session.currentStep === "COMPLETE"
  ) {
    body = (
      <QuoteAnalysisComplete
        session={session}
        onReanalyze={() => quoteSessionActions.prepareReanalyze()}
        onGoToTable={handleGoToTable}
      />
    );
  } else if (session.status === "ANALYSIS_FAILED") {
    body = (
      <QuoteAnalysisFailed
        session={session}
        onRetry={handleRetry}
        onBackToFiles={() => quoteSessionActions.goToFilesStep()}
      />
    );
  } else {
    body = (
      <QuoteFilesStep
        session={session}
        onAnalyze={() => void runAnalysisOnce()}
      />
    );
  }

  return (
    <PageContainer className="space-y-6">
      <QuoteProgressHeader activeStep={activeStep} />
      {body}
    </PageContainer>
  );
}
