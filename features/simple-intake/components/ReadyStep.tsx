"use client";

import { PostAnalysisWorkflow } from "../workflow/PostAnalysisWorkflow";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";

export function ReadyStep() {
  const session = useSimpleIntakeSession();
  return <PostAnalysisWorkflow key={session.runId ?? "idle"} />;
}
