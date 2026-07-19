"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { QuoteSession } from "../types";
import { selectAnalysisSummary } from "../quoteSessionSelectors";
import { DownloadDeveloperDebugButton } from "./DownloadDeveloperDebugButton";

const FALLBACK_LABELS = [
  "קורא את הקבצים",
  "מזהה חלקים",
  "מתאים קובצי DXF",
  "משווה בין המקורות",
  "בונה את טבלת ההצעה",
] as const;

export function QuoteAnalysisProcessing(props: {
  session: QuoteSession;
}) {
  const label =
    props.session.analysis.progressLabel ?? FALLBACK_LABELS[0];

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <Loader2
            className="h-6 w-6 animate-spin text-primary"
            aria-hidden
          />
        </div>
        <CardTitle className="text-xl">מנתח את חומר ההצעה</CardTitle>
        <CardDescription className="text-sm">
          {props.session.details.projectName} ·{" "}
          {props.session.details.customerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-center text-sm font-medium"
          aria-live="polite"
          aria-atomic="true"
        >
          {label}
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="התקדמות ניתוח"
          aria-valuetext={label}
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
        </div>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {FALLBACK_LABELS.map((item) => (
            <li
              key={item}
              className={
                item === label ? "font-medium text-foreground" : undefined
              }
            >
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function QuoteAnalysisComplete(props: {
  session: QuoteSession;
  onReanalyze: () => void;
  onGoToTable: () => void;
}) {
  const summary = selectAnalysisSummary(props.session);

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-2xl tracking-tight">
          הטבלה מוכנה לבדיקה
        </CardTitle>
        <CardDescription>
          {props.session.details.projectName} ·{" "}
          {props.session.details.customerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {summary && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[10px] bg-white/[0.04] px-3 py-2">
              <dt className="text-xs text-muted-foreground">שורות שזוהו</dt>
              <dd className="text-lg font-semibold">{summary.rowCount}</dd>
            </div>
            <div className="rounded-[10px] bg-white/[0.04] px-3 py-2">
              <dt className="text-xs text-muted-foreground">התאמות DXF מדויקות</dt>
              <dd className="text-lg font-semibold">
                {summary.exactDxfMatches}
              </dd>
            </div>
            <div className="rounded-[10px] bg-white/[0.04] px-3 py-2">
              <dt className="text-xs text-muted-foreground">בעיות חוסמות</dt>
              <dd className="text-lg font-semibold">
                {summary.blockingIssues}
              </dd>
            </div>
            <div className="rounded-[10px] bg-white/[0.04] px-3 py-2">
              <dt className="text-xs text-muted-foreground">אזהרות</dt>
              <dd className="text-lg font-semibold">
                {summary.warningIssues}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={props.onReanalyze}>
            נתח שוב
          </Button>
          <Button type="button" onClick={props.onGoToTable}>
            עבור לטבלה
          </Button>
        </div>
        <DownloadDeveloperDebugButton
          developerDebug={props.session.analysis.developerDebug}
          projectName={props.session.details.projectName}
          className="pt-1"
        />
        <p className="text-center text-xs text-muted-foreground">
          התוצאה נשמרת בסשן הנוכחי בלבד ומוכנה לבדיקה בטבלה.
        </p>
      </CardContent>
    </Card>
  );
}

export function QuoteAnalysisFailed(props: {
  session: QuoteSession;
  onRetry: () => void;
  onBackToFiles: () => void;
}) {
  const rawError = props.session.analysis.error ?? "";
  const isUnsafe = rawError.startsWith("UNSAFE_RESULT");
  const isWorkbookFail =
    rawError.includes("WORKBOOK_DIRECT") ||
    rawError.includes("WORKBOOK_PARSE") ||
    rawError.includes("FAILURE_STAGE") ||
    rawError.includes("כשל בניתוח קובץ");

  const unsafeBody =
    "זוהתה אי־עקביות פנימית במהלך עיבוד הנתונים. הקבצים נשמרו בסשן הנוכחי וניתן לנסות שוב או להוריד JSON מפתחים לצורך אבחון.";
  const workbookBody =
    "לא ניתן היה להשלים את קריאת הקובץ. הקבצים נשמרו בסשן הנוכחי וניתן לנסות שוב או להוריד JSON מפתחים לצורך אבחון.";

  const title = isUnsafe
    ? "לא ניתן להציג את הטבלה בבטחה"
    : isWorkbookFail
      ? "כשל בניתוח קובץ ה-Excel"
      : "לא הצלחנו להשלים את ניתוח החומר";

  const description = isUnsafe
    ? rawError.includes(":")
      ? rawError.slice(rawError.indexOf(":") + 1)
      : unsafeBody
    : isWorkbookFail
      ? workbookBody
      : rawError || "אירעה שגיאה במהלך הניתוח. ניתן לנסות שוב.";

  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={props.onBackToFiles}>
            חזור לקבצים
          </Button>
          <Button type="button" onClick={props.onRetry}>
            נסה שוב
          </Button>
        </div>
        <DownloadDeveloperDebugButton
          developerDebug={props.session.analysis.developerDebug}
          projectName={props.session.details.projectName}
        />
      </CardContent>
    </Card>
  );
}

export function QuoteTablePlaceholder(props: {
  session: QuoteSession;
  onBack: () => void;
}) {
  return (
    <Card className="mx-auto w-full max-w-lg border-0 shadow-sm">
      <CardHeader className="text-center space-y-2">
        <CardTitle className="text-xl">מסך הטבלה יושלם בשלב הבא</CardTitle>
        <CardDescription>
          {props.session.details.projectName} ·{" "}
          {props.session.details.customerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          תוצאת הניתוח זמינה בזיכרון הסשן ומוכנה לשלב הטבלה העריכה.
        </p>
        <Button type="button" variant="outline" onClick={props.onBack}>
          חזרה לקבצים
        </Button>
      </CardContent>
    </Card>
  );
}
