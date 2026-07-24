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
  { label: string; signal: string }
> = {
  CRITICAL: { label: "חמור", signal: "var(--ow-error)" },
  REVIEW: { label: "דורש בדיקה", signal: "var(--ow-attention)" },
  INFO: { label: "מידע", signal: "var(--ow-text-muted)" },
};

function FindingRow({ finding }: { finding: InitialFindingPresentation }) {
  const sev = SEVERITY_UI[finding.severity];
  return (
    <li
      className="flex min-h-[64px] items-start gap-3 px-5 py-4"
      style={{ borderColor: "var(--ow-border)" }}
      aria-label={`${sev.label}: ${finding.title}. ${finding.description}`}
    >
      <span
        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: sev.signal }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p
            className="text-[14px] font-medium leading-snug"
            style={{ color: "var(--ow-text)" }}
          >
            {finding.title}
          </p>
          <span
            className="text-[11px] font-medium tracking-wide"
            style={{ color: sev.signal }}
          >
            {sev.label}
          </span>
        </div>
        <p
          className="mt-1.5 max-w-2xl text-[13px] leading-relaxed"
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
        className="flex items-center gap-3 rounded-[var(--ow-radius-lg)] border px-4 py-3.5"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-success-soft)",
        }}
        role="status"
      >
        <CheckCircle2
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--ow-success)" }}
          aria-hidden
        />
        <div className="min-w-0 text-[13px]">
          <p className="font-medium" style={{ color: "var(--ow-success)" }}>
            לא נמצאו פערים שדורשים טיפול
          </p>
          <p
            className="mt-0.5"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            הנתונים מוכנים לבדיקה ולאישור בטבלה המאוחדת.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="initial-findings-heading">
      <h2
        id="initial-findings-heading"
        className="text-[15px] font-semibold tracking-tight"
        style={{ color: "var(--ow-text)" }}
      >
        מצאנו מספר פערים שדורשים התייחסות
      </h2>
      <ul
        className="divide-y overflow-hidden rounded-[var(--ow-radius-lg)] border"
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface)",
          boxShadow: "var(--ow-shadow-sm)",
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
        className="rounded-[var(--ow-radius-lg)] border px-4 py-3.5"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          borderColor: "var(--ow-border)",
        }}
        role="alert"
      >
        <p
          className="text-[14px] font-medium"
          style={{ color: "var(--ow-error)" }}
        >
          לא נוצרו פריטי חומר לבדיקה
        </p>
      </aside>
    );
  }

  if (summary.showNoUsableDxfFailure) {
    return (
      <aside
        className="rounded-[var(--ow-radius-lg)] border px-4 py-3.5"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          borderColor: "var(--ow-border)",
        }}
        role="alert"
      >
        <p
          className="text-[14px] font-medium"
          style={{ color: "var(--ow-error)" }}
        >
          אין קובצי DXF תקינים לשימוש
        </p>
      </aside>
    );
  }

  if (summary.showMissingIdentifiersWarning) {
    return (
      <aside
        className="rounded-[var(--ow-radius-lg)] border px-4 py-3.5"
        style={{
          backgroundColor: "var(--ow-attention-soft)",
          borderColor: "var(--ow-border)",
        }}
        role="status"
      >
        <p
          className="text-[14px] font-medium"
          style={{ color: "var(--ow-attention)" }}
        >
          לא זוהו מזהי פריט ברשימת החומר
        </p>
        <p
          className="mt-1 text-[13px]"
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
        className="flex items-center justify-between gap-3 rounded-[var(--ow-radius-lg)] border px-4 py-3.5"
        style={{
          backgroundColor: "var(--ow-error-soft)",
          borderColor: "var(--ow-border)",
        }}
        role="status"
      >
        <p
          className="text-[13px] font-medium"
          style={{ color: "var(--ow-error)" }}
        >
          {formatHebrewCount(invalidDxfCount)} קובצי DXF אינם ניתנים לשימוש
        </p>
        {onShowInvalid ? (
          <button
            type="button"
            className="text-[13px] font-medium underline-offset-2 hover:underline"
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
