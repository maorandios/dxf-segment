"use client";

import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { FailureState } from "../ui";

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

export function MaterialListQualityFailedScreen() {
  const session = useSimpleIntakeSession();

  return (
    <FailureState
      title="לא הצלחנו להשלים את הניתוח"
      description="הקובץ נקלט, אך חלק מהנתונים לא פוענחו בצורה אמינה."
      onRetry={() => void simpleIntakeActions.analyze()}
      onReplace={() => simpleIntakeActions.backToFiles()}
      canDebug={Boolean(session.lastDebug)}
      onDebug={() => downloadDebug(session.lastDebug)}
      secondaryActionLabel="הצג פריטים שלא פוענחו"
      onSecondaryAction={() => simpleIntakeActions.showUnresolvedMaterialItems()}
    />
  );
}
