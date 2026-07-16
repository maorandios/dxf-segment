"use client";

import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { formatInteger } from "@/lib/formatNumbers";
import type { DxfRegistrySummary } from "@/lib/ai-intake/types";

interface DxfRegistrySummaryCardsProps {
  summary: DxfRegistrySummary;
}

const CARDS: Array<{
  key: keyof DxfRegistrySummary;
  labelKey: string;
}> = [
  { key: "uploadedDxfCount", labelKey: "aiIntake.registry.summary.uploaded" },
  { key: "validIdentityCount", labelKey: "aiIntake.registry.summary.validIds" },
  {
    key: "identityConflictCount",
    labelKey: "aiIntake.registry.summary.identityConflicts",
  },
  {
    key: "revisionOrDuplicateCount",
    labelKey: "aiIntake.registry.summary.revisionDuplicate",
  },
  {
    key: "invalidGeometryCount",
    labelKey: "aiIntake.registry.summary.invalidGeometry",
  },
];

export function DxfRegistrySummaryCards({
  summary,
}: DxfRegistrySummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
