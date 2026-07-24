"use client";

import { CheckCircle2 } from "lucide-react";
import type {
  IntakeAnalysisSummary,
  InitialFindingPresentation,
  InitialFindingSeverity,
} from "../../buildIntakeAnalysisSummary";
import { formatHebrewCount } from "../../buildIntakeAnalysisSummary";

const SEVERITY_UI: Record<
  InitialFindingSeverity,
  {
    label: string;
    badgeBg: string;
    badgeFg: string;
    side: string;
  }
> = {
  CRITICAL: {
    label: "חמור",
    badgeBg: "var(--ow-error-soft)",
    badgeFg: "var(--ow-error)",
    side: "var(--ow-error)",
  },
  REVIEW: {
    label: "דורש בדיקה",
    badgeBg: "rgba(254, 243, 199, 0.7)",
    badgeFg: "#B45309",
    side: "#F59E0B",
  },
  INFO: {
    label: "מידע",
    badgeBg: "var(--ow-info-soft)",
    badgeFg: "var(--ow-text-secondary)",
    side: "#94A3B8",
  },
};

function FindingRow({ finding }: { finding: InitialFindingPresentation }) {
  const sev = SEVERITY_UI[finding.severity];
  return (
    <li
      className="flex min-h-[64px] items-start gap-3 border-b px-[18px] py-[14px] last:border-b-0"
      style={{ borderColor: "var(--ow-border)" }}
      aria-label={`${sev.label}: ${finding.title}. ${finding.description}`}
    >
      <span
        className="mt-1 h-10 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: sev.side }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="ow-tabular text-[15px] font-semibold leading-none"
            style={{ color: "var(--ow-text)" }}
          >
            {formatHebrewCount(finding.count)}
          </span>
          <p
            className="text-[13px] font-medium leading-snug"
            style={{ color: "var(--ow-text)" }}
          >
            {finding.title}
          </p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: sev.badgeBg,
              color: sev.badgeFg,
            }}
          >
            {sev.label}
          </span>
        </div>
        <p
          className="mt-1 max-w-3xl text-[12px] leading-snug"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {finding.description}
        </p>
      </div>
    </li>
  );
}

export function IntakeSummaryIssueList({
  summary,
}: {
  summary: IntakeAnalysisSummary;
}) {
  if (!summary.ready) return null;

  if (summary.findings.length === 0) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3"
        style={{
          borderColor: "#B7E4C7",
          backgroundColor: "rgba(209, 250, 223, 0.4)",
        }}
        role="status"
      >
        <CheckCircle2
          className="h-4 w-4 shrink-0"
          style={{ color: "#0F7A45" }}
          aria-hidden
        />
        <div className="min-w-0 text-[13px]">
          <p className="font-medium" style={{ color: "#0F7A45" }}>
            לא נמצאו פערים שדורשים טיפול
          </p>
          <p style={{ color: "var(--ow-text-secondary)" }}>
            הנתונים מוכנים לבדיקה ולאישור בטבלה המאוחדת.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-2" aria-labelledby="initial-findings-heading">
      <div>
        <h2
          id="initial-findings-heading"
          className="text-[14px] font-semibold"
          style={{ color: "var(--ow-text)" }}
        >
          ממצאים ראשוניים
        </h2>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          פירוט מלא זמין בטבלת הבדיקה המאוחדת.
        </p>
      </div>
      <ul
        className="overflow-hidden rounded-[14px] border motion-safe:opacity-100"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
        }}
      >
        {summary.findings.map((finding) => (
          <FindingRow key={finding.category} finding={finding} />
        ))}
      </ul>
    </section>
  );
}

/** Workflow-wide failures only — not normal missing/duplicate/extra cases. */
export function IntakeWorkflowFailureNotice({
  summary,
  invalidDxfCount,
  onShowInvalid,
}: {
  summary: IntakeAnalysisSummary;
  invalidDxfCount: number;
  onShowInvalid?: () => void;
}) {
  if (!summary.ready) return null;

  if (summary.material.totalRows === 0) {
    return (
      <aside
        className="rounded-[14px] border px-3.5 py-3"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          borderColor: "#FECDCA",
        }}
        role="alert"
      >
        <p className="text-[14px] font-medium" style={{ color: "var(--ow-error)" }}>
          לא נוצרו פריטי חומר לבדיקה
        </p>
      </aside>
    );
  }

  if (summary.showNoUsableDxfFailure) {
    return (
      <aside
        className="rounded-[14px] border px-3.5 py-3"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          borderColor: "#FECDCA",
        }}
        role="alert"
      >
        <p className="text-[14px] font-medium" style={{ color: "var(--ow-error)" }}>
          אין קובצי DXF תקינים לשימוש
        </p>
      </aside>
    );
  }

  if (summary.showMissingIdentifiersWarning) {
    return (
      <aside
        className="rounded-[14px] border px-3.5 py-3"
        style={{
          backgroundColor: "rgba(254, 243, 199, 0.55)",
          borderColor: "#F9DBAF",
        }}
        role="status"
      >
        <p className="text-[14px] font-medium" style={{ color: "#B45309" }}>
          לא זוהו מזהי פריט ברשימת החומר
        </p>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          ניתן להשלים מזהים בטבלת הבדיקה המאוחדת.
        </p>
      </aside>
    );
  }

  if (invalidDxfCount > 0) {
    return (
      <aside
        className="flex items-center justify-between gap-3 rounded-[14px] border px-3.5 py-3"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          borderColor: "#FECDCA",
        }}
        role="status"
      >
        <p className="text-[13px] font-medium" style={{ color: "var(--ow-error)" }}>
          {formatHebrewCount(invalidDxfCount)} קובצי DXF אינם ניתנים לשימוש
        </p>
        {onShowInvalid ? (
          <button
            type="button"
            className="text-[12px] font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--ow-accent)" }}
            onClick={onShowInvalid}
          >
            פרטים
          </button>
        ) : null}
      </aside>
    );
  }

  return null;
}
