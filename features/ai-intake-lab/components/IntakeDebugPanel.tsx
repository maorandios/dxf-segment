"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { t } from "@/lib/i18n";
import type { AiIntakeAnalyzeSuccess } from "@/lib/ai-intake/schemas";

interface IntakeDebugPanelProps {
  result: AiIntakeAnalyzeSuccess;
}

export function IntakeDebugPanel({ result }: IntakeDebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-0 shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            {t("aiIntake.debug.title")}
          </CardTitle>
          <CardDescription>{t("aiIntake.debug.subtitle")}</CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("aiIntake.debug.hide") : t("aiIntake.debug.show")}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
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
            <details className="rounded-[10px] border border-white/10 p-3" open>
              <summary className="cursor-pointer text-sm font-medium">
                {t("aiIntake.debug.perSourceUsage")}
              </summary>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground" dir="ltr">
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
            <details className="rounded-[10px] border border-amber-500/30 p-3" open>
              <summary className="cursor-pointer text-sm font-medium">
                {t("aiIntake.debug.warnings")} ({result.warnings.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-[11px] text-muted-foreground" dir="ltr">
                {result.warnings.map((w, i) => (
                  <li key={`${i}-${w.slice(0, 24)}`}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <details className="rounded-[10px] border border-white/10 p-3" open>
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

          <details className="rounded-[10px] border border-white/10 p-3" open>
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

          <details className="rounded-[10px] border border-white/10 p-3" open>
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

          <details className="rounded-[10px] border border-white/10 p-3" open>
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
        </CardContent>
      )}
    </Card>
  );
}
