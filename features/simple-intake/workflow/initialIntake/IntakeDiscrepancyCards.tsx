"use client";

import { Button } from "@/components/ui/button";
import type { IntakeAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import { formatHebrewCount } from "../../buildIntakeAnalysisSummary";
import type { FinalFilterId } from "../../results/types";

type Severity = "blocking" | "attention" | "warning";

const SEVERITY: Record<
  Severity,
  { badge: string; border: string; bg: string; title: string }
> = {
  blocking: {
    badge: "חמור",
    border: "#FECDCA",
    bg: "var(--ow-error-soft)",
    title: "var(--ow-error)",
  },
  attention: {
    badge: "דורש בדיקה",
    border: "#F9DBAF",
    bg: "rgba(254, 243, 199, 0.55)",
    title: "#B45309",
  },
  warning: {
    badge: "אזהרה",
    border: "#F9DBAF",
    bg: "rgba(254, 243, 199, 0.4)",
    title: "#B45309",
  },
};

function PreviewIds({ ids }: { ids: string[] }) {
  const shown = ids.slice(0, 6);
  if (shown.length === 0) return null;
  return (
    <p className="ow-ltr mt-2 text-[12px] font-medium tracking-wide" dir="ltr">
      {shown.join(" · ")}
      {ids.length > shown.length ? " · …" : ""}
    </p>
  );
}

function DiscrepancyCard({
  severity,
  title,
  description,
  preview,
  actionLabel,
  onAction,
}: {
  severity: Severity;
  title: string;
  description: string;
  preview?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  const styles = SEVERITY[severity];
  return (
    <article
      className="rounded-[18px] border px-4 py-3.5"
      style={{ borderColor: styles.border, backgroundColor: styles.bg }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            color: styles.title,
            backgroundColor: "rgba(255,255,255,0.75)",
          }}
        >
          {styles.badge}
        </span>
        <h3
          className="text-[15px] font-semibold"
          style={{ color: styles.title }}
        >
          {title}
        </h3>
      </div>
      <p
        className="mt-1.5 text-[13px] leading-relaxed"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {description}
      </p>
      {preview}
      <div className="mt-3">
        <Button type="button" size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </article>
  );
}

export function IntakeDiscrepancyCards({
  summary,
  onOpenFiltered,
}: {
  summary: IntakeAnalysisSummary;
  onOpenFiltered: (filter: FinalFilterId) => void;
}) {
  if (!summary.ready) return null;

  const cards: React.ReactNode[] = [];
  const missing = summary.comparison.missingDxfPartIds;
  const extras = summary.comparison.extraDxfPartIds;
  const dups = summary.dxf.duplicateGroups;
  const conflicts = summary.comparison.conflictingPartIds;

  if (missing.length > 0) {
    cards.push(
      <DiscrepancyCard
        key="missing"
        severity="blocking"
        title={`${formatHebrewCount(missing.length)} קובצי DXF חסרים`}
        description="הפריטים הבאים מופיעים ברשימת החומר אך לא נמצאו בין קובצי ה־DXF שהועלו."
        preview={<PreviewIds ids={missing} />}
        actionLabel="הצג את הפריטים החסרים"
        onAction={() => onOpenFiltered("MISSING_DXF")}
      />
    );
  }

  if (dups.length > 0) {
    const title =
      dups.length === 1
        ? "זוהה עותק כפול אחד"
        : `זוהו ${formatHebrewCount(dups.length)} פריטי DXF כפולים`;
    const preview = (
      <div className="mt-2 space-y-2">
        {dups.slice(0, 3).map((g) => (
          <div key={`${g.reason}-${g.normalizedPartId}`} className="text-[12px]">
            <p className="ow-ltr font-medium" dir="ltr">
              {g.normalizedPartId}
            </p>
            <ul className="mt-0.5 space-y-0.5" style={{ color: "var(--ow-text-secondary)" }}>
              {g.files.map((f) => (
                <li key={f.fileId} className="ow-ltr" dir="ltr">
                  {f.fileName}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
    cards.push(
      <DiscrepancyCard
        key="dups"
        severity="attention"
        title={title}
        description="יותר מקובץ אחד משויך לאותו מזהה פריט. יש לבדוק איזה קובץ צריך להמשיך לתהליך."
        preview={preview}
        actionLabel="בדוק את הקבצים הכפולים"
        onAction={() => onOpenFiltered("DUPLICATE_DXF")}
      />
    );
  }

  if (extras.length > 0) {
    cards.push(
      <DiscrepancyCard
        key="extra"
        severity="warning"
        title={`${formatHebrewCount(extras.length)} קובצי DXF אינם מופיעים ברשימת החומר`}
        description="ייתכן שמדובר בקבצים מיותרים, גרסאות קודמות או פריטים שחסרים ברשימה."
        preview={<PreviewIds ids={extras} />}
        actionLabel="בדוק את הקבצים העודפים"
        onAction={() => onOpenFiltered("ALL")}
      />
    );
  }

  if (conflicts.length > 0) {
    cards.push(
      <DiscrepancyCard
        key="conflicts"
        severity="attention"
        title={`${formatHebrewCount(conflicts.length)} פריטים מכילים נתונים סותרים`}
        description="העובי, החומר, הכמות או המידות אינם תואמים בין המקורות."
        preview={<PreviewIds ids={conflicts} />}
        actionLabel="בדוק את ההתאמות"
        onAction={() => onOpenFiltered("CONFLICTING_DATA")}
      />
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className="space-y-3" aria-label="פערים לטיפול">
      {cards}
    </div>
  );
}

export function IntakeAnalysisOverviewNotice({
  summary,
}: {
  summary: IntakeAnalysisSummary;
}) {
  if (!summary.ready) return null;

  if (summary.showMissingIdentifiersWarning) {
    return (
      <aside
        className="rounded-[18px] border px-4 py-3.5"
        style={{
          backgroundColor: "rgba(254, 243, 199, 0.55)",
          borderColor: "#F9DBAF",
        }}
        role="status"
      >
        <h3 className="text-[15px] font-medium" style={{ color: "#B45309" }}>
          לא זוהו מזהי פריט ברשימת החומר
        </h3>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          לא נמצאו מזהי פריט תקינים בשורות הרשימה, ולא בוצעו התאמות לקובצי DXF.
          ניתן להשלים מזהים בטבלת הבדיקה המאוחדת.
        </p>
      </aside>
    );
  }

  if (summary.actionableDiscrepancyCount > 0) {
    const hasMissing = summary.comparison.missingDxfPartIds.length > 0;
    const hasDups = summary.dxf.duplicateGroups.length > 0;
    const bits: string[] = [];
    if (hasMissing) bits.push("קובצי DXF חסרים");
    if (hasDups) bits.push("כפולים");
    if (summary.comparison.extraDxfPartIds.length > 0) bits.push("עודפים");
    if (summary.comparison.conflictingPartIds.length > 0) {
      bits.push("נתונים סותרים");
    }

    return (
      <aside
        className="rounded-[18px] border px-4 py-3.5"
        style={{
          backgroundColor: hasMissing
            ? "var(--ow-error-soft)"
            : "rgba(254, 243, 199, 0.55)",
          borderColor: hasMissing ? "#FECDCA" : "#F9DBAF",
        }}
        role="status"
      >
        <h3
          className="text-[15px] font-medium"
          style={{ color: hasMissing ? "var(--ow-error)" : "#B45309" }}
        >
          נמצאו פערים בין רשימת החומר לקובצי ה־DXF
        </h3>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-secondary)" }}
        >
          {summary.comparison.matchedPartIds.length > 0
            ? "רוב הפריטים הותאמו בהצלחה. "
            : ""}
          נמצאו {bits.join(" או ")} שדורשים בדיקה לפני הכנת הצעת המחיר.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="rounded-[18px] border px-4 py-3.5"
      style={{
        backgroundColor: "rgba(209, 250, 223, 0.45)",
        borderColor: "#B7E4C7",
      }}
      role="status"
    >
      <h3 className="text-[15px] font-medium" style={{ color: "#0F7A45" }}>
        ההשוואה הראשונית הושלמה בהצלחה
      </h3>
      <p
        className="mt-1.5 text-[13px] leading-relaxed"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        לא נמצאו פערים מהותיים בין רשימת החומר לקובצי ה־DXF.
      </p>
    </aside>
  );
}
