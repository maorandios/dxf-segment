"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { AnalyzingStep } from "./components/AnalyzingStep";
import { FailedStep } from "./components/FailedStep";
import { ReadyStep } from "./components/ReadyStep";
import { UploadStep } from "./components/UploadStep";
import { useSimpleIntakeSession } from "./useSimpleIntakeSession";

export function SimpleIntakeShell() {
  const session = useSimpleIntakeSession();

  let body: React.ReactNode;
  if (session.status === "ANALYZING") {
    body = <AnalyzingStep />;
  } else if (session.status === "READY") {
    body = <ReadyStep />;
  } else if (session.status === "FAILED") {
    body = <FailedStep />;
  } else {
    body = <UploadStep />;
  }

  return (
    <PageContainer className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          OMEGA · Simple Intake v1
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          ניתוח פשוט: Excel + DXF
        </h1>
      </header>
      {body}
    </PageContainer>
  );
}
