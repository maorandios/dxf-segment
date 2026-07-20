"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { AnalyzingStep } from "./components/AnalyzingStep";
import { FailedStep } from "./components/FailedStep";
import { ReadyStep } from "./components/ReadyStep";
import { UploadStep } from "./components/UploadStep";
import {
  DxfUploadStage,
  MaterialListQualityFailedScreen,
  MaterialListReviewScreen,
} from "./materialList";
import { useSimpleIntakeSession } from "./useSimpleIntakeSession";

export function SimpleIntakeShell() {
  const session = useSimpleIntakeSession();

  let body: React.ReactNode;
  if (session.status === "ANALYZING") {
    body = <AnalyzingStep />;
  } else if (session.status === "MATERIAL_LIST_QUALITY_FAILED") {
    body = <MaterialListQualityFailedScreen />;
  } else if (session.status === "MATERIAL_LIST_REVIEW") {
    body = <MaterialListReviewScreen />;
  } else if (session.status === "DXF_UPLOAD") {
    body = <DxfUploadStage />;
  } else if (session.status === "READY") {
    body = <ReadyStep />;
  } else if (session.status === "FAILED") {
    body = <FailedStep />;
  } else {
    body = <UploadStep />;
  }

  return (
    <PageContainer className="space-y-6">
      <header className="space-y-1" dir="rtl">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          OMEGA · רשימת חומר מאושרת
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          Excel לרשימת חומר מוכנה לתמחור
        </h1>
      </header>
      {body}
    </PageContainer>
  );
}
