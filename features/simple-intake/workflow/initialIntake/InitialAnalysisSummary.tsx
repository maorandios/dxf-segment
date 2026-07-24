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
  buildAttentionSupportingText,
  formatHebrewCount,
} from "../../buildIntakeAnalysisSummary";

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
    label: "דורש תשומת לב",
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
  staggerMs = 0,
  className,
  valueNode,
}: {
  label: string;
  value: string;
  supporting: string;
  badge?: string | null;
  tone?: AnalysisTone;
  icon: React.ReactNode;
  staggerMs?: number;
  className?: string;
  valueNode?: React.ReactNode;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <section
      className={cn(
        "initial-analysis-metric flex min-h-[168px] flex-1 flex-col rounded-[20px] border px-5 py-4",
        className
      )}
      style={{
        borderColor: styles.border,
        backgroundColor: styles.bg,
        animationDelay: `${staggerMs}ms`,
      }}
      aria-label={`${label}: ${value}. ${supporting}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              backgroundColor: "rgba(255,255,255,0.75)",
              color: styles.accent,
            }}
            aria-hidden
          >
            {icon}
          </span>
          <h3
            className="text-[13px] font-medium"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            {label}
          </h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            color: styles.accent,
            backgroundColor: "rgba(255,255,255,0.7)",
          }}
        >
          {styles.label}
        </span>
      </div>

      <div
        className="initial-analysis-metric-value mt-4 text-[40px] font-semibold leading-none tracking-tight ow-tabular"
        style={{ color: "var(--ow-text)" }}
      >
        {valueNode ?? value}
      </div>
      <p
        className="mt-2 text-[13px] leading-snug"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {supporting}
      </p>
      {badge ? (
        <p
          className="mt-auto pt-3 text-[12px] font-medium"
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

function RtlFlowChevron({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "hidden shrink-0 items-center self-center text-[var(--ow-text-muted)] lg:flex",
        className
      )}
      aria-hidden
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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

  const materialTone: AnalysisTone =
    m.extractedIdentifierCount === 0 && m.totalRows > 0
      ? "attention"
      : m.rowsWithoutIdentifierCount > 0
        ? "attention"
        : "healthy";

  const uploadTone: AnalysisTone =
    d.totalFiles === 0
      ? "error"
      : d.duplicateGroups.length > 0
        ? "attention"
        : "healthy";

  const attentionTone: AnalysisTone = !summary.ready
    ? "information"
    : summary.actionableDiscrepancyCount > 0
      ? summary.comparison.missingDxfPartIds.length > 0
        ? "error"
        : "attention"
      : "healthy";

  const materialBadge =
    m.extractedIdentifierCount === 0
      ? "לא זוהו מזהי פריט"
      : m.rowsWithoutIdentifierCount > 0
        ? `${formatHebrewCount(m.extractedIdentifierCount)} מתוך ${formatHebrewCount(m.totalRows)} שורות כוללות מזהה פריט`
        : `${formatHebrewCount(m.uniquePartIds.length)} מזהי פריט זוהו`;

  const dxfBadgeParts: string[] = [
    `${formatHebrewCount(d.uniquePartIds.length)} ייחודיים`,
  ];
  if (d.duplicateGroups.length === 1) {
    dxfBadgeParts.push("עותק כפול אחד");
  } else if (d.duplicateGroups.length > 1) {
    dxfBadgeParts.push(
      `${formatHebrewCount(d.duplicateGroups.length)} פריטים כפולים`
    );
  } else if (d.exactContentDuplicateFileCount > 0) {
    dxfBadgeParts.push(
      d.exactContentDuplicateFileCount === 1
        ? "עותק כפול אחד"
        : `${formatHebrewCount(d.exactContentDuplicateFileCount)} עותקים כפולים`
    );
  }

  let attentionValue = "0";
  let attentionSupporting = "לא נמצאו פערים מהותיים";
  let attentionBadge: string | null = "ניתן להמשיך לטבלת הבדיקה המלאה";
  let attentionValueNode: React.ReactNode | undefined;

  if (!summary.ready) {
    attentionValue = "…";
    attentionSupporting = "בודק התאמות...";
    attentionBadge = "משווה בין רשימת החומר לקובצי ה־DXF";
    attentionValueNode = (
      <Loader2
        className="h-9 w-9 animate-spin"
        style={{ color: "var(--ow-text-muted)" }}
        aria-label="בודק התאמות"
      />
    );
  } else if (summary.actionableDiscrepancyCount > 0) {
    attentionValue = formatHebrewCount(summary.actionableDiscrepancyCount);
    attentionSupporting = "פערים דורשים בדיקה";
    const support = buildAttentionSupportingText(summary);
    attentionBadge = support.length > 0 ? support : null;
  }

  return (
    <div
      className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-2"
      role="group"
      aria-label="סיכום ניתוח ראשוני"
    >
      <InitialAnalysisMetric
        label="רשימת החומר"
        value={formatHebrewCount(m.totalRows)}
        supporting="פריטים ברשימה"
        badge={materialBadge}
        tone={materialTone}
        staggerMs={0}
        icon={<FileSpreadsheet className="h-4 w-4" aria-hidden />}
      />
      <RtlFlowChevron />
      <InitialAnalysisMetric
        label="קובצי DXF"
        value={formatHebrewCount(d.totalFiles)}
        supporting={d.totalFiles === 1 ? "קובץ הועלה" : "קבצים הועלו"}
        badge={dxfBadgeParts.join(" · ")}
        tone={uploadTone}
        staggerMs={90}
        icon={<Files className="h-4 w-4" aria-hidden />}
      />
      <RtlFlowChevron />
      <InitialAnalysisMetric
        label="דורש טיפול"
        value={attentionValue}
        valueNode={attentionValueNode}
        supporting={attentionSupporting}
        badge={attentionBadge}
        tone={attentionTone}
        staggerMs={180}
        icon={
          attentionTone === "healthy" ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4" aria-hidden />
          )
        }
      />
    </div>
  );
}
