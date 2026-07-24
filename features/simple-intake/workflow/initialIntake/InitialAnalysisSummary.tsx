"use client";

import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ClipboardList,
  Files,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { IntakeAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import {
  buildReviewMetricCategoryLine,
  formatHebrewCount,
} from "../../buildIntakeAnalysisSummary";
import { buildDxfDuplicateCardBadge } from "../../classifyDxfDuplicates";

export type AnalysisTone = "healthy" | "attention" | "information" | "error";

const VIVID_ORANGE = "#ea580c";
const VIVID_GREEN = "#16a34a";
const MUTED_GRAY = "var(--ow-text-muted)";

function conclusionIsOk(tone: AnalysisTone): boolean {
  return tone === "healthy";
}

/** Compact metric cell — kept for callers/tests; prefer InitialAnalysisSummary. */
export function InitialAnalysisMetric({
  label,
  value,
  supporting,
  badge,
  tone = "information",
  icon: Icon,
  headerStyle = "muted",
  className,
  valueNode,
}: {
  label: string;
  value: string;
  supporting: string;
  badge?: string | null;
  tone?: AnalysisTone;
  icon?: LucideIcon;
  /** muted = gray header; vivid = strong orange header (review card) */
  headerStyle?: "muted" | "vivid";
  className?: string;
  valueNode?: React.ReactNode;
}) {
  const headerColor =
    headerStyle === "vivid" ? VIVID_ORANGE : MUTED_GRAY;
  const ok = conclusionIsOk(tone);
  const conclusionDot = ok ? VIVID_GREEN : VIVID_ORANGE;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[var(--ow-radius-lg)] border px-5 py-5",
        className
      )}
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "color-mix(in srgb, var(--ow-surface) 20%, transparent)",
      }}
      aria-label={`${label}: ${value}. ${supporting}${badge ? `. ${badge}` : ""}`}
    >
      <div className="flex items-center gap-2.5">
        {Icon ? (
          <Icon
            className="h-4 w-4 shrink-0"
            style={{ color: headerColor }}
            aria-hidden
          />
        ) : null}
        <span
          className="text-[12px] font-medium tracking-wide"
          style={{ color: headerColor }}
        >
          {label}
        </span>
      </div>

      <div
        className="ow-tabular text-[34px] font-semibold leading-none tracking-tight sm:text-[36px]"
        style={{ color: "var(--ow-text)" }}
      >
        {valueNode ?? value}
      </div>

      <div className="space-y-1">
        <p
          className="text-[13px] leading-snug"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {supporting}
        </p>
        {badge ? (
          <p
            className="flex items-start gap-2 text-[12px] font-bold leading-snug"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: conclusionDot }}
              aria-hidden
            />
            <span>{badge}</span>
          </p>
        ) : null}
      </div>
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
        className="h-7 w-7 animate-spin"
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
      attentionBadge = buildReviewMetricCategoryLine(summary) || null;
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
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      role="group"
      aria-label="סיכום ניתוח ראשוני"
    >
      <InitialAnalysisMetric
        label="רשימת החומר"
        value={formatHebrewCount(m.totalRows)}
        supporting="פריטים ברשימה"
        badge={materialBadge}
        tone={materialTone}
        icon={ClipboardList}
        headerStyle="muted"
      />
      <InitialAnalysisMetric
        label="קובצי DXF"
        value={formatHebrewCount(d.totalFiles)}
        supporting={d.totalFiles === 1 ? "קובץ DXF נותח" : "קובצי DXF נותחו"}
        badge={dxfBadge}
        tone={uploadTone}
        icon={Files}
        headerStyle="muted"
      />
      <InitialAnalysisMetric
        label="דורש בדיקה"
        value={attentionValue}
        valueNode={attentionValueNode}
        supporting={attentionSupporting}
        badge={attentionBadge}
        tone={attentionTone}
        icon={AlertCircle}
        headerStyle="vivid"
      />
    </div>
  );
}
