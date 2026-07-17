"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { t } from "@/lib/i18n";
import {
  buildAiIntakeDebugReport,
  copyTextToClipboard,
  serializeAiIntakeDebugReport,
  summarizeDebugReportStats,
  type AiIntakeDebugReportContext,
} from "@/lib/ai-intake/debug";
import type { AiIntakeAnalyzeSuccess } from "@/lib/ai-intake/schemas";

interface IntakeDebugPanelProps {
  result: AiIntakeAnalyzeSuccess | null;
  reportContext?: AiIntakeDebugReportContext;
}

export function IntakeDebugPanel({
  result,
  reportContext,
}: IntakeDebugPanelProps) {
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const report = useMemo(() => {
    if (!result) return null;
    return buildAiIntakeDebugReport(result, reportContext ?? {});
  }, [result, reportContext]);

  const serializedJson = useMemo(() => {
    if (!report) return null;
    return serializeAiIntakeDebugReport(report);
  }, [report]);

  const stats = useMemo(() => {
    if (!report || !serializedJson) return null;
    return summarizeDebugReportStats(report, serializedJson);
  }, [report, serializedJson]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleCopy = useCallback(async () => {
    if (!serializedJson) return;
    setCopyError(null);
    try {
      await copyTextToClipboard(serializedJson);
      setCopied(true);
      setToast({
        kind: "success",
        message: t("aiIntake.debug.fullReport.copySuccess"),
      });
    } catch {
      setCopyError(t("aiIntake.debug.fullReport.copyError"));
      setToast({
        kind: "error",
        message: t("aiIntake.debug.fullReport.copyError"),
      });
      setJsonPreviewOpen(true);
    }
  }, [serializedJson]);

  const hasResult = Boolean(result && report && serializedJson);

  return (
    <Card className="border-0 shadow-sm rounded-xl">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">
          {t("aiIntake.debug.fullReport.title")}
        </CardTitle>
        <CardDescription>{t("aiIntake.debug.subtitle")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {toast && (
          <div
            role="status"
            className={
              toast.kind === "success"
                ? "rounded-[10px] border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
                : "rounded-[10px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
            }
          >
            {toast.message}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid flex-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label={t("aiIntake.debug.fullReport.size")}
              value={
                stats
                  ? `${stats.charCount.toLocaleString("he-IL")} / ${stats.sizeKb} KB`
                  : "—"
              }
            />
            <Stat
              label={t("aiIntake.debug.fullReport.schemaVersion")}
              value={stats?.schemaVersion ?? "—"}
              ltr
            />
            <Stat
              label={t("aiIntake.debug.fullReport.documents")}
              value={stats ? String(stats.documentCount) : "—"}
            />
            <Stat
              label={t("aiIntake.debug.fullReport.dxfParts")}
              value={stats ? String(stats.dxfPartCount) : "—"}
            />
            <Stat
              label={t("aiIntake.debug.fullReport.sourceRows")}
              value={stats ? String(stats.sourceRowCount) : "—"}
            />
            <Stat
              label={t("aiIntake.debug.fullReport.finalParts")}
              value={stats ? String(stats.finalPartCount) : "—"}
            />
            <Stat
              label={t("aiIntake.debug.fullReport.issues")}
              value={stats ? String(stats.issueCount) : "—"}
            />
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <Button
              type="button"
              size="sm"
              disabled={!hasResult}
              onClick={() => void handleCopy()}
            >
              {copied
                ? t("aiIntake.debug.fullReport.copied")
                : t("aiIntake.debug.fullReport.copy")}
            </Button>
            {!hasResult && (
              <p className="max-w-[16rem] text-xs text-muted-foreground">
                {t("aiIntake.debug.fullReport.needAnalysis")}
              </p>
            )}
          </div>
        </div>

        {copyError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {copyError}
          </p>
        )}

        {hasResult && (
          <details
            className="rounded-[10px] border border-white/10 p-3"
            open={jsonPreviewOpen}
            onToggle={(e) =>
              setJsonPreviewOpen((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className="cursor-pointer text-sm font-medium">
              {jsonPreviewOpen
                ? t("aiIntake.debug.fullReport.hideJson")
                : t("aiIntake.debug.fullReport.showJson")}
            </summary>
            <pre
              className="mt-2 max-h-96 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
              dir="ltr"
            >
              {serializedJson}
            </pre>
          </details>
        )}

        <details
          className="rounded-[10px] border border-white/10 p-3"
          open={detailedOpen}
          onToggle={(e) =>
            setDetailedOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="cursor-pointer text-sm font-medium">
            {t("aiIntake.debug.fullReport.detailedView")}
          </summary>

          {result ? (
            <div className="mt-4 space-y-4">
              <DetailedDebugPanels result={result} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("aiIntake.debug.fullReport.needAnalysis")}
            </p>
          )}
        </details>
      </CardContent>
    </Card>
  );
}

function Stat(props: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground">{props.label}</span>
      <p
        className="font-medium tabular-nums"
        dir={props.ltr ? "ltr" : undefined}
      >
        {props.value}
      </p>
    </div>
  );
}

function DetailedDebugPanels({ result }: { result: AiIntakeAnalyzeSuccess }) {
  return (
    <>
      <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className="text-muted-foreground">
            {t("aiIntake.debug.model")}
          </span>
          <p className="font-medium" dir="ltr">
            {result.debug.model}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">
            {t("aiIntake.debug.duration")}
          </span>
          <p className="font-medium tabular-nums" dir="ltr">
            {result.debug.durationMs} ms
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">
            {t("aiIntake.debug.openaiCalls")}
          </span>
          <p className="font-medium tabular-nums" dir="ltr">
            {result.debug.openaiCallCount}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">
            {t("aiIntake.debug.inputTokens")}
          </span>
          <p className="font-medium tabular-nums" dir="ltr">
            {result.debug.usage.inputTokens ?? "—"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">
            {t("aiIntake.debug.outputTokens")}
          </span>
          <p className="font-medium tabular-nums" dir="ltr">
            {result.debug.usage.outputTokens ?? "—"}
          </p>
        </div>
      </div>

      {result.debug.perSourceUsage.length > 0 && (
        <details className="rounded-[10px] border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("aiIntake.debug.perSourceUsage")}
          </summary>
          <ul
            className="mt-2 space-y-1 text-[11px] text-muted-foreground"
            dir="ltr"
          >
            {result.debug.perSourceUsage.map((u) => (
              <li key={u.label}>
                {u.label} · {u.status} · in={u.inputTokens ?? "—"} out=
                {u.outputTokens ?? "—"} total={u.totalTokens ?? "—"} ·{" "}
                {u.durationMs} ms
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.warnings.length > 0 && (
        <details className="rounded-[10px] border border-amber-500/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("aiIntake.debug.warnings")} ({result.warnings.length})
          </summary>
          <ul
            className="mt-2 list-disc space-y-1 ps-5 text-[11px] text-muted-foreground"
            dir="ltr"
          >
            {result.warnings.map((w, i) => (
              <li key={`${i}-${w.slice(0, 24)}`}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.finalRowsJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(
            (result.finalRows ?? []).map((r) => ({
              status: r.status,
              partId: r.partId,
              quantity: r.quantity,
              thicknessMm: r.thicknessMm,
              material: r.material,
              fieldSources: r.fieldSources,
              fieldCandidates: r.fieldCandidates,
              fieldResolutions: r.fieldResolutions,
              previousValues: r.previousValues,
              issues: r.issues,
              contributingFacts: r.contributingFacts.map((f) => ({
                field: f.field,
                value: f.value,
                instructionType: f.instructionType,
                sourceType: f.source.type,
                fileName: f.source.fileName,
              })),
            })),
            null,
            2
          )}
        </pre>
      </details>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.aggregatedJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(
            {
              partial: result.aggregated.partial,
              openaiCallCount: result.aggregated.openaiCallCount,
              documents: result.aggregated.documents.map((d) => ({
                documentId: d.documentId,
                sourceType: d.sourceType,
                fileName: d.fileName,
                status: d.status,
                errorCode: d.errorCode,
                usage: d.usage,
                durationMs: d.durationMs,
                rows: d.rows,
                warnings: d.warnings,
              })),
              emailFacts: result.aggregated.emailFacts,
            },
            null,
            2
          )}
        </pre>
      </details>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.documentRowsJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(result.extraction.documentRows, null, 2)}
        </pre>
      </details>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.emailFactsJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(result.extraction.emailFacts, null, 2)}
        </pre>
      </details>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.expandedFactsJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(result.acceptedFacts, null, 2)}
        </pre>
      </details>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.unresolvedJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(result.extraction.unresolvedItems, null, 2)}
        </pre>
      </details>

      <details className="rounded-[10px] border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("aiIntake.debug.auditJson")}
        </summary>
        <pre
          className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
          dir="ltr"
        >
          {JSON.stringify(result.auditRows, null, 2)}
        </pre>
      </details>

      {result.aggregated.documents.some((d) => d.workbookEvidence) && (
        <>
          <details className="rounded-[10px] border border-white/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("aiIntake.debug.workbookEvidence")}
            </summary>
            <pre
              className="mt-2 max-h-96 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
              dir="ltr"
            >
              {JSON.stringify(
                result.aggregated.documents
                  .filter((d) => d.workbookEvidence)
                  .map((d) => ({
                    documentId: d.documentId,
                    fileName: d.fileName,
                    status: d.status,
                    parserKind: d.workbookEvidence?.parserKind,
                    coverage: d.workbookEvidence?.coverage,
                    mapping: d.workbookEvidence?.mapping,
                    snapshot: d.workbookEvidence?.snapshot,
                    rawPartRows: d.workbookEvidence?.rawPartRows,
                    excludedTotalSubtotalRows:
                      d.workbookEvidence?.excludedTotalSubtotalRows,
                    unknownRows: d.workbookEvidence?.unknownRows,
                    hiddenPartRowsRequiringReview:
                      d.workbookEvidence?.hiddenPartRowsRequiringReview,
                  })),
                null,
                2
              )}
            </pre>
          </details>

          <details className="rounded-[10px] border border-white/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("aiIntake.debug.columnUnitProfiles")}
            </summary>
            <pre
              className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
              dir="ltr"
            >
              {JSON.stringify(
                result.aggregated.documents
                  .filter((d) => d.workbookEvidence?.columnUnitProfiles)
                  .map((d) => ({
                    documentId: d.documentId,
                    fileName: d.fileName,
                    profiles: d.workbookEvidence?.columnUnitProfiles,
                  })),
                null,
                2
              )}
            </pre>
          </details>

          <details className="rounded-[10px] border border-white/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("aiIntake.debug.normalizedMeasurements")}
            </summary>
            <pre
              className="mt-2 max-h-96 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
              dir="ltr"
            >
              {JSON.stringify(
                result.aggregated.documents
                  .filter((d) => d.workbookEvidence?.normalizedMeasurements)
                  .map((d) => ({
                    documentId: d.documentId,
                    fileName: d.fileName,
                    normalizedMeasurements:
                      d.workbookEvidence?.normalizedMeasurements,
                  })),
                null,
                2
              )}
            </pre>
          </details>

          <details className="rounded-[10px] border border-white/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("aiIntake.debug.precisionComparisons")}
            </summary>
            <pre
              className="mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed text-muted-foreground"
              dir="ltr"
            >
              {JSON.stringify(
                result.aggregated.documents
                  .filter((d) => d.workbookEvidence?.precisionComparisons)
                  .map((d) => ({
                    documentId: d.documentId,
                    fileName: d.fileName,
                    precisionComparisons:
                      d.workbookEvidence?.precisionComparisons,
                  })),
                null,
                2
              )}
            </pre>
          </details>
        </>
      )}
    </>
  );
}
