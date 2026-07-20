"use client";

/**
 * Ready step — after DXF matching: existing readiness + final table.
 * Includes a way back to the approved material list.
 */

import { Button } from "@/components/ui/button";
import { PostAnalysisWorkflow } from "../workflow/PostAnalysisWorkflow";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";

export function ReadyStep() {
  const session = useSimpleIntakeSession();
  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex justify-start">
        <Button
          type="button"
          variant="outline"
          onClick={() => simpleIntakeActions.backToMaterialList()}
        >
          חזרה לרשימת החומר
        </Button>
      </div>
      <PostAnalysisWorkflow key={session.runId ?? "idle"} />
    </div>
  );
}
