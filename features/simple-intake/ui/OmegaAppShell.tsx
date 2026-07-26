"use client";

import { cn } from "@/lib/utils";
import { OmegaHeader } from "./OmegaHeader";
import { FiveStepProgressBar } from "../quoteWorkflow/FiveStepProgressBar";
import type { OmegaQuoteStage, QuoteWorkspaceDetails, WorkflowStepState } from "../types";
import type { QuoteStepperId } from "../quoteWorkflow/quoteStageModel";

export function OmegaAppShell({
  quoteDetails,
  quoteStage,
  enteredQuoteStages,
  stepperStates,
  children,
  actionBar,
  className,
  showStepper = true,
}: {
  quoteDetails: QuoteWorkspaceDetails | null;
  quoteStage: OmegaQuoteStage;
  enteredQuoteStages: OmegaQuoteStage[];
  stepperStates: Record<QuoteStepperId, WorkflowStepState>;
  statusText?: string;
  children: React.ReactNode;
  actionBar?: React.ReactNode;
  onReplaceWorkbook?: () => void;
  onDownloadDebug?: () => void;
  canDownloadDebug?: boolean;
  className?: string;
  showStepper?: boolean;
}) {
  return (
    <div
      className={cn(
        "omega-workflow flex min-h-[100vh] min-h-[100dvh] flex-col",
        className
      )}
      dir="rtl"
    >
      <OmegaHeader quoteDetails={quoteDetails} />
      {showStepper && quoteDetails && (
        <FiveStepProgressBar
          states={stepperStates}
          enteredStages={enteredQuoteStages}
          activeStage={quoteStage}
        />
      )}
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="ow-stage-enter flex min-h-0 flex-1 flex-col overflow-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col items-stretch">
            {children}
          </div>
        </div>
        {actionBar}
      </main>
    </div>
  );
}
