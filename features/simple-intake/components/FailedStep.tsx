"use client";

import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { detectMaterialSourceTypeFromName } from "../materialList/materialSourceTypes";
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

export function FailedStep() {
  const session = useSimpleIntakeSession();
  const err = session.error;
  const isPdf =
    detectMaterialSourceTypeFromName(session.workbookFile?.name ?? "") ===
      "PDF" ||
    /pdf/i.test(err?.message ?? "");

  return (
    <div className="flex min-h-[calc(100vh-11rem)] items-center justify-center py-8">
      <FailureState
        title={
          isPdf
            ? "לא הצלחנו לקרוא את קובץ ה-PDF"
            : "לא הצלחנו להשלים את הניתוח"
        }
        description={
          isPdf
            ? "הקובץ נקלט, אך לא ניתן היה לפענח ממנו רשימת חומר בצורה אמינה."
            : err?.message
              ? "הקובץ נקלט, אך חלק מהנתונים לא פוענחו בצורה אמינה."
              : "אירעה שגיאה בעיבוד הקובץ. ניתן לנסות שוב או להחליף קובץ."
        }
        canRetry={Boolean(err?.retryable)}
        onRetry={() => void simpleIntakeActions.analyze()}
        onReplace={() => simpleIntakeActions.backToFiles()}
        canDebug={Boolean(session.lastDebug)}
        onDebug={() => downloadDebug(session.lastDebug)}
      />
    </div>
  );
}
