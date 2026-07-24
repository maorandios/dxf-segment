"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import type { SimpleDxfPart } from "../../types";
import type { IntakeAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import { buildOneLineAnalysisSummary } from "../../buildIntakeAnalysisSummary";
import type { FinalFilterId } from "../../results/types";
import { ScreenHeader, OmegaSideDrawer } from "../../ui";
import { InitialAnalysisSummary } from "./InitialAnalysisSummary";
import {
  IntakeSummaryIssueList,
  IntakeWorkflowFailureNotice,
} from "./IntakeDiscrepancyCards";
import { UnifiedReviewNextSteps } from "./UnifiedReviewNextSteps";
import { UnifiedReviewActionPanel } from "./UnifiedReviewActionPanel";

const HELP_KEY = "omega.initial-summary-help-dismissed";

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

function FirstUseHelp({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="relative rounded-[14px] border px-3.5 py-3"
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-info-soft)",
      }}
      role="note"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute start-2 top-2 rounded p-1"
        aria-label="סגור הסבר"
        style={{ color: "var(--ow-text-muted)" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <UnifiedReviewNextSteps />
    </div>
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
  const [showHelp, setShowHelp] = useState(false);

  const dismissHelp = () => {
    setShowHelp(false);
    try {
      window.localStorage.setItem(HELP_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!analysis.ready) {
    return (
      <div className="flex min-h-[calc(100vh-14rem)] flex-col" dir="rtl">
        <ScreenHeader
          title="מעבד נתונים"
          supportingText="מכינים את סיכום הניתוח הראשוני לפני טבלת הבדיקה המאוחדת."
        />
        <div className="mt-4">
          <InitialAnalysisSummary summary={analysis} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col" dir="rtl">
      <div
        className="mx-auto w-full flex-1 space-y-4 pb-5"
        style={{
          width: "min(1120px, calc(100vw - 96px))",
          marginInline: "auto",
        }}
      >
        <div className="relative">
          <ScreenHeader
            title="ניתוח ראשוני הושלם"
            supportingText={buildOneLineAnalysisSummary(analysis)}
          />
          {!showHelp ? (
            <button
              type="button"
              className="absolute end-0 top-1 flex items-center gap-1 text-[12px]"
              style={{ color: "var(--ow-text-muted)" }}
              onClick={() => setShowHelp(true)}
              aria-label="הצג הסבר קצר"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              עזרה
            </button>
          ) : null}
        </div>

        <InitialAnalysisSummary summary={analysis} />

        <IntakeWorkflowFailureNotice
          summary={analysis}
          invalidDxfCount={invalidDxfParts.length}
          onShowInvalid={() => setInvalidOpen(true)}
        />

        <IntakeSummaryIssueList summary={analysis} />

        {showHelp ? <FirstUseHelp onDismiss={dismissHelp} /> : null}

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
