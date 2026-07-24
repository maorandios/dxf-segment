"use client";

import { useState } from "react";
import type { SimpleDxfPart } from "../../types";
import type { IntakeAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import type { FinalFilterId } from "../../results/types";
import { ScreenHeader, OmegaSideDrawer } from "../../ui";
import { InitialAnalysisSummary } from "./InitialAnalysisSummary";
import {
  IntakeSummaryIssueList,
  IntakeWorkflowFailureNotice,
} from "./IntakeDiscrepancyCards";
import { UnifiedReviewActionPanel } from "./UnifiedReviewActionPanel";

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
      <div
        className="mx-auto flex w-full max-w-[1040px] flex-col"
        dir="rtl"
      >
        <ScreenHeader
          title="מעבד נתונים"
          supportingText="מכינים את סיכום הניתוח הראשוני לפני טבלת הבדיקה המאוחדת."
        />
        <InitialAnalysisSummary summary={analysis} />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-[1040px] flex-col pb-8"
      dir="rtl"
    >
      <div className="space-y-6">
        <ScreenHeader
          title="ניתוח רשימת החומר וקבצי DXF"
          className="mb-8"
        />

        <InitialAnalysisSummary summary={analysis} />

        <IntakeWorkflowFailureNotice
          summary={analysis}
          invalidDxfCount={invalidDxfParts.length}
          onShowInvalid={() => setInvalidOpen(true)}
        />

        <IntakeSummaryIssueList summary={analysis} />

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
