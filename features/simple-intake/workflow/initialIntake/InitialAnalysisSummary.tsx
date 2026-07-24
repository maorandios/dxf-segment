"use client";

import { cn } from "@/lib/utils";
import {
  FileSpreadsheet,
  Files,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { IntakeAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import {
  buildReviewMetricCategoryLine,
  formatHebrewCount,
} from "../../buildIntakeAnalysisSummary";
import { buildDxfDuplicateCardBadge } from "../../classifyDxfDuplicates";

export type AnalysisTone = "healthy" | "attention" | "information" | "error";

const TONE_STYLES: Record<
  AnalysisTone,
  { border: string; bg: string; accent: string; label: string }
> = {
  healthy: {
    border: "#B7E4C7",
    bg: "rgba(209, 250, 223, 0.35)",
    accent: "#0F7A45",
    label: "תקין",
  },
  attention: {
    border: "#F9DBAF",
    bg: "rgba(254, 243, 199, 0.45)",
    accent: "#B45309",
    label: "דורש בדיקה",
  },
  information: {
    border: "var(--ow-border)",
    bg: "var(--ow-info-soft)",
    accent: "var(--ow-text-secondary)",
    label: "מידע",
  },
  error: {
    border: "#FECDCA",
    bg: "var(--ow-error-soft)",
    accent: "var(--ow-error)",
    label: "שגיאה",
  },
};

export function InitialAnalysisMetric({
  label,
  value,
  supporting,
  badge,
  tone = "information",
  icon,
  className,
  valueNode,
}: {
  label: string;
  value: string;
  supporting: string;
  badge?: string | null;
  tone?: AnalysisTone;
  icon: React.ReactNode;
  className?: string;
  valueNode?: React.ReactNode;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <section
      className={cn(
        "flex min-h-[132px] flex-1 flex-col rounded-[18px] border px-4 py-3.5",
        className
      )}
      style={{
        borderColor: styles.border,
        backgroundColor: styles.bg,
      }}
      aria-label={`${label}: ${value}. ${supporting}${badge ? `. ${badge}` : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(255,255,255,0.75)",
              color: styles.accent,
            }}
            aria-hidden
          >
            {icon}
          </span>
          <h3
            className="text-[12px] font-medium"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            {label}
          </h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: styles.accent,
            backgroundColor: "rgba(255,255,255,0.7)",
          }}
        >
          {styles.label}
        </span>
      </div>

      <div
        className="mt-3 text-[34px] font-semibold leading-none tracking-tight ow-tabular"
        style={{ color: "var(--ow-text)" }}
      >
        {valueNode ?? value}
      </div>
      <p
        className="mt-1.5 text-[12px] leading-snug"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {supporting}
      </p>
      {badge ? (
        <p
          className="mt-auto pt-2 text-[12px] font-medium"
          style={{ color: styles.accent }}
        >
          {badge}
        </p>
      ) : (
        <div className="mt-auto" />
      )}
    </section>
  );
}

function RtlFlowChevron() {
  return (
    <div
      className="hidden shrink-0 items-center self-center text-[var(--ow-text-muted)] lg:flex"
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path
          d="M12.5 4.5L7 10l5.5 5.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function InitialAnalysisSummary({
  summary,
}: {
  summary: IntakeAnalysisSummary;
}) {
  const m = summary.material;
  const d = summary.dxf;
  const review = summary.reviewMetric;
  const hasFindings = summary.findings.length > 0;

  const materialTone: AnalysisTone =
    m.extractionStatus === "EMPTY"
      ? "error"
      : m.matchingIdentifierStatus === "ATTENTION"
        ? "attention"
        : m.rowsWithoutIdentifierCount > 0
          ? "attention"
          : "healthy";

  const uploadTone: AnalysisTone =
    d.totalFiles === 0
      ? "error"
      : summary.showNoUsableDxfFailure
        ? "error"
        : d.duplicateSummary.duplicateFileCount > 0 ||
            d.duplicateSummary.sameNameDifferentContentConflictCount > 0
          ? "information"
          : "healthy";

  // Issues requiring review — attention, not a global error (unless no usable DXF).
  const attentionTone: AnalysisTone = !summary.ready
    ? "information"
    : summary.showNoUsableDxfFailure
      ? "error"
      : hasFindings || review.affectedItemCount > 0
        ? "attention"
        : "healthy";

  const materialBadge =
    m.matchingIdentifierStatus === "ATTENTION" &&
    summary.identifierCoverage.coverage === "NONE"
      ? "לא נמצאו מזהי התאמה ברשימה"
      : m.extractedIdentifierCount === 0
        ? "לא זוהו מזהי פריט"
        : `${formatHebrewCount(m.extractedIdentifierCount)} עם מזהה פריט`;

  const dxfBadge = buildDxfDuplicateCardBadge(d.duplicateSummary);

  let attentionValue = "0";
  let attentionSupporting = "אין פערים הדורשים בדיקה";
  let attentionBadge: string | null = null;
  let attentionValueNode: React.ReactNode | undefined;

  if (!summary.ready) {
    attentionValue = "…";
    attentionSupporting = "בודק התאמות...";
    attentionBadge = "משווה בין רשימת החומר לקובצי ה־DXF";
    attentionValueNode = (
      <Loader2
        className="h-8 w-8 animate-spin"
        style={{ color: "var(--ow-text-muted)" }}
        aria-label="בודק התאמות"
      />
    );
  } else if (hasFindings || review.affectedItemCount > 0) {
    if (review.affectedItemCount > 0) {
      attentionValue = formatHebrewCount(review.affectedItemCount);
      attentionSupporting =
        review.affectedItemCount === 1
          ? "פריט דורש בדיקה"
          : "פריטים דורשים בדיקה";
      const categoryLine = buildReviewMetricCategoryLine(summary);
      attentionBadge = categoryLine || null;
    } else {
      attentionValue = formatHebrewCount(review.findingCategoryCount);
      attentionSupporting =
        review.findingCategoryCount === 1
          ? "סוג ממצא זוהה"
          : "סוגי ממצאים זוהו";
      attentionBadge =
        summary.matchingStatus.suggestedMatchCount > 0
          ? `${formatHebrewCount(summary.matchingStatus.suggestedMatchCount)} התאמות מוצעות`
          : null;
    }
  }

  return (
    <div
      className="flex flex-col gap-2.5 lg:flex-row lg:items-stretch lg:gap-2"
      role="group"
      aria-label="סיכום ניתוח ראשוני"
    >
      <InitialAnalysisMetric
        label="רשימת החומר"
        value={formatHebrewCount(m.totalRows)}
        supporting="פריטים ברשימה"
        badge={materialBadge}
        tone={materialTone}
        icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />}
      />
      <RtlFlowChevron />
      <InitialAnalysisMetric
        label="קובצי DXF"
        value={formatHebrewCount(d.totalFiles)}
        supporting={
          d.totalFiles === 1 ? "קובץ DXF נותח" : "קובצי DXF נותחו"
        }
        badge={dxfBadge}
        tone={uploadTone}
        icon={<Files className="h-3.5 w-3.5" aria-hidden />}
      />
      <RtlFlowChevron />
      <InitialAnalysisMetric
        label="דורש בדיקה"
        value={attentionValue}
        valueNode={attentionValueNode}
        supporting={attentionSupporting}
        badge={attentionBadge}
        tone={attentionTone}
        icon={
          attentionTone === "healthy" ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          )
        }
      />
    </div>
  );
}
