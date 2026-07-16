"use client";

import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { formatInteger } from "@/lib/formatNumbers";
import type { DocumentDxfAuditSummary } from "@/lib/ai-intake/schemas";

interface DocumentDxfAuditSummaryCardsProps {
  summary: DocumentDxfAuditSummary;
}

const CARDS: Array<{ key: keyof DocumentDxfAuditSummary; labelKey: string }> = [
  { key: "customerPartsSeen", labelKey: "aiIntake.audit.summary.customerParts" },
  { key: "matchedCount", labelKey: "aiIntake.audit.summary.matched" },
  {
    key: "requestWithoutDxfCount",
    labelKey: "aiIntake.audit.summary.withoutDxf",
  },
  {
    key: "dxfNotReferencedCount",
    labelKey: "aiIntake.audit.summary.dxfNotReferenced",
  },
  {
    key: "requiresReviewCount",
    labelKey: "aiIntake.audit.summary.requiresReview",
  },
  {
    key: "failedSourceCount",
    labelKey: "aiIntake.audit.summary.failedSources",
  },
];

export function DocumentDxfAuditSummaryCards({
  summary,
}: DocumentDxfAuditSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {CARDS.map(({ key, labelKey }) => (
        <Card key={key} className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t(labelKey)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {formatInteger(summary[key])}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
