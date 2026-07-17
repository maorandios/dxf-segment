"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Trash2, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { QuoteSession } from "../types";
import { quoteSessionActions } from "../quoteSessionStore";
import {
  selectCanAnalyze,
  selectSourceCounters,
} from "../quoteSessionSelectors";
import {
  formatQuoteFileSize,
  quoteKindLabelHe,
  quoteStatusLabelHe,
} from "../sourceClassify";
import { QuoteSessionPrivacyNotice } from "./QuoteSessionPrivacyNotice";

export function QuoteFilesStep(props: {
  session: QuoteSession;
  onAnalyze: () => void;
}) {
  const { session, onAnalyze } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const counters = selectSourceCounters(session);
  const canAnalyze = selectCanAnalyze(session);
  const busy = session.status === "PROCESSING";

  const ingest = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    await quoteSessionActions.addFiles(files);
    setLiveMessage(`נוספו ${files.length} קבצים`);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-1 text-center sm:text-start">
        <p className="text-sm text-muted-foreground">
          פרויקט:{" "}
          <span className="font-medium text-foreground">
            {session.details.projectName}
          </span>
          {" · "}
          לקוח:{" "}
          <span className="font-medium text-foreground">
            {session.details.customerName}
          </span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          העלאת חומר להצעה
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          גרור לכאן את כל הקבצים שקיבלת עבור הפרויקט. המערכת תרכז את הנתונים
          ותבנה טבלה לבדיקה.
        </p>
      </div>

      <QuoteSessionPrivacyNotice variant="files" />

      <div
        className={cn(
          "rounded-[12px] border border-dashed px-4 py-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-white/15 bg-white/[0.02]"
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void ingest(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        aria-label="אזור העלאת קבצים"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <Upload
          className="mx-auto mb-3 h-8 w-8 text-muted-foreground"
          aria-hidden
          strokeWidth={1.5}
        />
        <p className="text-sm font-medium">גרור קבצים לכאן או בחרו מהמחשב</p>
        <p className="mt-1 text-xs text-muted-foreground">
          DXF · Excel · PDF
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          הוסף קבצים
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files) void ingest(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {counters.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">סה״כ קבצים: {counters.total}</Badge>
          {counters.dxf > 0 && (
            <Badge variant="outline">DXF: {counters.dxf}</Badge>
          )}
          {counters.documents > 0 && (
            <Badge variant="outline">מסמכים: {counters.documents}</Badge>
          )}
          {counters.problems > 0 && (
            <Badge
              variant="outline"
              className="text-amber-700 dark:text-amber-300"
            >
              בעיות: {counters.problems}
            </Badge>
          )}
        </div>
      )}

      {session.sources.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-base">קבצים שנבחרו</CardTitle>
            <CardDescription>ניתן להסיר או להוסיף לפני הניתוח</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <ul className="divide-y divide-white/10">
              {session.sources.map((s) => (
                <li
                  key={s.sourceId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-medium">{s.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {quoteKindLabelHe(s.kind)} ·{" "}
                      {formatQuoteFileSize(s.sizeBytes)}
                      {" · "}
                      <span
                        className={cn(
                          s.status === "READY" || s.status === "PROCESSED"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : s.status === "UNSUPPORTED" ||
                                s.status === "DUPLICATE" ||
                                s.status === "FAILED"
                              ? "text-amber-700 dark:text-amber-300"
                              : ""
                        )}
                      >
                        {quoteStatusLabelHe(s.status)}
                      </span>
                    </p>
                    {s.blockingReason && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileWarning className="h-3.5 w-3.5" aria-hidden />
                        {s.blockingReason}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`הסר את הקובץ ${s.fileName}`}
                    onClick={() => quoteSessionActions.removeSource(s.sourceId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => quoteSessionActions.goToDetailsStep()}
          >
            חזרה לפרטי ההצעה
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || session.sources.length === 0}
            onClick={() => {
              quoteSessionActions.clearSources();
              setLiveMessage("כל הקבצים הוסרו");
            }}
          >
            נקה הכול
          </Button>
        </div>
        <Button
          type="button"
          disabled={!canAnalyze || busy}
          onClick={onAnalyze}
        >
          נתח את החומר
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
    </div>
  );
}
