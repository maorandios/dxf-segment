"use client";

import { useState } from "react";
import type { SimpleDxfPart } from "../../types";
import type { IntakeAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import type { FinalFilterId } from "../../results/types";
import { ScreenHeader, OmegaSideDrawer } from "../../ui";
import { InitialAnalysisSummary } from "./InitialAnalysisSummary";
import {
  IntakeAnalysisOverviewNotice,
  IntakeDiscrepancyCards,
} from "./IntakeDiscrepancyCards";
import { UnifiedReviewNextSteps } from "./UnifiedReviewNextSteps";
import { UnifiedReviewActionPanel } from "./UnifiedReviewActionPanel";

const REVEAL_STYLES = `
@keyframes ois-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.initial-analysis-metric {
  animation: ois-fade-up 0.28s ease-out both;
}
.initial-analysis-metric-value {
  animation: ois-fade-up 0.32s ease-out both;
  animation-delay: inherit;
}
@media (prefers-reduced-motion: reduce) {
  .initial-analysis-metric,
  .initial-analysis-metric-value {
    animation: none !important;
  }
}
`;

function InvalidDxfDetailsDrawer({
  open,
  onClose,
  invalidParts,
}: {
  open: boolean;
  onClose: () => void;
  invalidParts: Array<Pick<SimpleDxfPart, "filename" | "error">>;
}) {
  return (
    <OmegaSideDrawer
      open={open}
      onClose={onClose}
      title="קובצי DXF לא תקינים"
      description="קבצים שהועלו אך לא ניתן להשתמש בהם."
    >
      {invalidParts.length === 0 ? (
        <p style={{ color: "var(--ow-text-muted)" }}>אין קבצים להצגה.</p>
      ) : (
        <ul className="space-y-2 text-[13px]">
          {invalidParts.map((d) => (
            <li
              key={d.filename}
              className="rounded-[var(--ow-radius-sm)] border px-3 py-2"
              style={{ borderColor: "var(--ow-border)" }}
            >
              <div className="ow-ltr font-medium" title={d.filename}>
                {d.filename}
              </div>
              <div
                className="mt-1"
                style={{ color: "var(--ow-text-secondary)" }}
              >
                לא ניתן לפענח את הקובץ
              </div>
            </li>
          ))}
        </ul>
      )}
    </OmegaSideDrawer>
  );
}

export function InitialIntakeSummaryScreen({
  analysis,
  invalidDxfParts,
  onOpenUnifiedTable,
  onBackToMaterial,
  onBackToDxf,
}: {
  analysis: IntakeAnalysisSummary;
  invalidDxfParts: Array<Pick<SimpleDxfPart, "filename" | "error">>;
  onOpenUnifiedTable: (filter?: FinalFilterId) => void;
  onBackToMaterial?: () => void;
  onBackToDxf?: () => void;
}) {
  const [invalidOpen, setInvalidOpen] = useState(false);

  if (!analysis.ready) {
    return (
      <div className="flex min-h-[calc(100vh-14rem)] flex-col" dir="rtl">
        <ScreenHeader
          title="מעבד נתונים"
          supportingText="מכינים את סיכום הניתוח הראשוני לפני טבלת הבדיקה המאוחדת."
        />
        <div className="mt-6">
          <InitialAnalysisSummary summary={analysis} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: REVEAL_STYLES }} />

      <div
        className="mx-auto w-full flex-1 space-y-6 pb-6"
        style={{
          width: "min(1120px, calc(100vw - 96px))",
          marginInline: "auto",
        }}
      >
        <ScreenHeader
          title="ניתוח ראשוני הושלם"
          supportingText="שני המקורות עובדו ומוכנים לבדיקה מפורטת בטבלה המאוחדת. זהו סיכום ראשוני בלבד — לא אישור סופי של ההצעה."
        />

        <InitialAnalysisSummary summary={analysis} />

        <IntakeAnalysisOverviewNotice summary={analysis} />

        <IntakeDiscrepancyCards
          summary={analysis}
          onOpenFiltered={(filter) => onOpenUnifiedTable(filter)}
        />

        {invalidDxfParts.length > 0 ? (
          <aside
            className="rounded-[18px] border px-4 py-3.5"
            style={{
              backgroundColor: "var(--ow-error-soft)",
              borderColor: "#FECDCA",
            }}
            role="status"
          >
            <h3
              className="text-[15px] font-medium"
              style={{ color: "var(--ow-error)" }}
            >
              {invalidDxfParts.length.toLocaleString("he-IL")} קובצי DXF שהועלו
              אינם ניתנים לשימוש
            </h3>
            <button
              type="button"
              className="mt-2 text-[13px] font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--ow-accent)" }}
              onClick={() => setInvalidOpen(true)}
            >
              פרטים
            </button>
          </aside>
        ) : null}

        <UnifiedReviewNextSteps />

        <UnifiedReviewActionPanel
          canOpen={analysis.material.totalRows > 0}
          onOpenUnifiedTable={() => onOpenUnifiedTable()}
          onBackToMaterial={onBackToMaterial}
          onBackToDxf={onBackToDxf}
        />
      </div>

      <InvalidDxfDetailsDrawer
        open={invalidOpen}
        onClose={() => setInvalidOpen(false)}
        invalidParts={invalidDxfParts}
      />
    </div>
  );
}

/** @deprecated Prefer InitialIntakeSummaryScreen */
export { InitialIntakeSummaryScreen as PreUnifiedReviewSummaryScreen };
