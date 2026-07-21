"use client";

import { Button } from "@/components/ui/button";
import type { FinalResultsSummary } from "../results/types";
import {
  AttentionInbox,
  MetricStrip,
  ScreenHeader,
  StickyActionBar,
  type AttentionInboxItem,
} from "../ui";
import {
  categoryTitleHe,
  type ReadinessBreakdown,
  type ReadinessCategoryId,
} from "./categorizeReadinessIssues";

const PANEL_CATEGORIES: ReadinessCategoryId[] = [
  "MISSING_DXF",
  "MULTIPLE_DXF",
  "INVALID_DXF",
  "DIMENSION_MISMATCH",
  "MISSING_INFO",
];

function inboxItems(breakdown: ReadinessBreakdown): AttentionInboxItem[] {
  return PANEL_CATEGORIES.map((id) => {
    const count =
      id === "MISSING_DXF"
        ? breakdown.missingDxf.length
        : id === "MULTIPLE_DXF"
          ? breakdown.multipleDxf.length
          : id === "INVALID_DXF"
            ? breakdown.invalidDxf.length
            : id === "DIMENSION_MISMATCH"
              ? breakdown.dimensionMismatch.length
              : breakdown.missingInfo.length;
    return {
      id,
      count,
      label: categoryTitleHe(
        id,
        id === "MISSING_DXF" ? breakdown.missingDxf : undefined
      ),
    };
  }).filter((c) => c.count > 0);
}

export function ReadinessIssueCards({
  breakdown,
  onOpenCategory,
}: {
  breakdown: ReadinessBreakdown;
  onOpenCategory: (id: ReadinessCategoryId) => void;
}) {
  const items = inboxItems(breakdown);
  if (items.length === 0) return null;

  return (
    <AttentionInbox
      remainingCount={breakdown.criticalRowCount}
      items={items}
      primaryLabel="התחל בדיקה"
      onPrimary={() => {
        const first = items[0];
        if (first) onOpenCategory(first.id as ReadinessCategoryId);
      }}
    />
  );
}

export function ReadinessSummary({
  summary,
  breakdown,
  uploadedDxfCount,
  unusedDxfCount,
  onOpenCategory,
  onTreatAll,
  onContinueToTable,
  onShowUnusedDxfs,
  onOpenCompletionRequest,
  matchMetrics,
}: {
  summary: FinalResultsSummary;
  breakdown: ReadinessBreakdown;
  uploadedDxfCount: number;
  unusedDxfCount: number;
  onOpenCategory: (id: ReadinessCategoryId) => void;
  onTreatAll: () => void;
  onContinueToTable: () => void;
  onShowUnusedDxfs?: () => void;
  onOpenCompletionRequest?: () => void;
  matchMetrics?: {
    certain: number;
    suggested: number;
    unassigned: number;
    explicitMissing: number;
  };
}) {
  const needs = breakdown.criticalRowCount;
  const allReady = summary.totalRowCount > 0 && needs === 0;

  const metricItems = [
    matchMetrics && matchMetrics.certain > 0
      ? {
          id: "certain",
          label: "התאמות ודאיות",
          value: matchMetrics.certain,
          highlight: "success" as const,
        }
      : null,
    matchMetrics && matchMetrics.suggested > 0
      ? {
          id: "suggested",
          label: "התאמות מוצעות",
          value: matchMetrics.suggested,
          highlight: "attention" as const,
        }
      : null,
    matchMetrics && matchMetrics.unassigned > 0
      ? {
          id: "unassigned",
          label: "לא שויכו",
          value: matchMetrics.unassigned,
        }
      : null,
    matchMetrics && matchMetrics.explicitMissing > 0
      ? {
          id: "missing-upload",
          label: "קבצים שלא הועלו",
          value: matchMetrics.explicitMissing,
          highlight: "attention" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    label: string;
    value: number;
    highlight?: "attention" | "success" | "none";
  }>;

  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col">
      <div className="flex-1 space-y-5 pb-4">
        <ScreenHeader
          title="בדיקת התאמות"
          supportingText="OMEGA חיברה את קובצי ה-DXF לפריטים. נשאר לטפל רק במקרים שדורשים החלטה."
        />

        {metricItems.length > 0 && <MetricStrip items={metricItems} />}

        <p className="text-[13px]" style={{ color: "var(--ow-text-muted)" }}>
          {uploadedDxfCount.toLocaleString("he-IL")} קובצי DXF נקלטו
          {unusedDxfCount > 0 ? (
            <>
              {" "}
              · {unusedDxfCount.toLocaleString("he-IL")} קבצים לא שויכו
              {onShowUnusedDxfs && (
                <>
                  {" "}
                  ·{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={onShowUnusedDxfs}
                  >
                    הצג קבצים
                  </button>
                </>
              )}
            </>
          ) : null}
        </p>

        {allReady ? (
          <AttentionInbox remainingCount={0} items={[]} />
        ) : (
          <ReadinessIssueCards
            breakdown={breakdown}
            onOpenCategory={onOpenCategory}
          />
        )}

        {onOpenCompletionRequest && needs > 0 && (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={onOpenCompletionRequest}
            >
              הכן בקשת השלמה
            </Button>
          </div>
        )}
      </div>

      <StickyActionBar
        statusText={
          allReady
            ? "כל ההתאמות מוכנות"
            : `${needs.toLocaleString("he-IL")} פריטים דורשים החלטה`
        }
        secondary={
          allReady
            ? undefined
            : {
                label: "המשך לטבלה",
                onClick: onContinueToTable,
              }
        }
        primary={{
          label: allReady ? "המשך לאישור נתונים" : "התחל בדיקה",
          onClick: allReady ? onContinueToTable : onTreatAll,
        }}
      />
    </div>
  );
}
