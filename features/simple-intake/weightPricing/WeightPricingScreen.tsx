"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows } from "../results/deriveFinalRows";
import {
  GAP_FIX_PANEL_EASE,
  GAP_FIX_PANEL_MS,
  GAP_FIX_PANEL_WIDTH_PX,
  GapResolutionFixDrawer,
} from "../workflow/GapResolutionFixDrawer";
import { ScreenHeader } from "../ui";
import {
  REVIEW_WORKSPACE_CONTENT_MAX_PX,
  REVIEW_WORKSPACE_WIDTH_TOKEN,
} from "../ui/ReviewWorkspaceContainer";
import {
  applyQuickPricingToDraft,
  assertWeightPricingInvariants,
  buildWeightPricingDiagnostics,
  buildWeightPricingGroups,
  buildWeightPricingSummaryPayload,
  canOpenWeightPricingScreen,
  computeWeightPricingMetrics,
  patchGroupPricingInDraft,
  selectApprovedPricingRows,
  validateWeightPricingGroups,
} from "./index";
import type {
  PricingGroupKey,
  WeightPricingGroupDraft,
} from "./types";
import { WeightPricingGroupDetailsDrawer } from "./WeightPricingGroupDetailsDrawer";
import { WeightPricingMetricCards } from "./WeightPricingMetricCards";
import { WeightPricingQuickBar } from "./WeightPricingQuickBar";
import { WeightPricingTable } from "./WeightPricingTable";
import { WeightPricingToolbar } from "./WeightPricingToolbar";

const PRICING_VALIDATION_MESSAGE =
  "לא ניתן להמשיך — יש להשלים מחיר בסיס לכל קבוצות התמחור.";

/**
 * Weight-based pricing workspace after אישור רשימה.
 */
export function WeightPricingScreen() {
  const session = useSimpleIntakeSession();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [focusInvalidKey, setFocusInvalidKey] =
    useState<PricingGroupKey | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [detailsGroupKey, setDetailsGroupKey] =
    useState<PricingGroupKey | null>(null);
  const [itemPreviewId, setItemPreviewId] = useState<string | null>(null);

  const finalRows = useMemo(
    () =>
      deriveFinalRows({
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        workbookFilename: session.workbookFile?.name ?? null,
        snapshot: session.workbookSnapshot,
        diagnostics: session.matchingDiagnostics,
        frozenMaterialRows: session.frozenMaterialRows,
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
      session.frozenMaterialRows,
    ]
  );

  const membership = session.finalQuoteListMembership;
  const approvedRows = useMemo(
    () => selectApprovedPricingRows(finalRows, membership),
    [finalRows, membership]
  );

  const canOpen = canOpenWeightPricingScreen({ membership, approvedRows });

  useEffect(() => {
    if (canOpen) return;
    simpleIntakeActions.backToFinalQuoteList();
  }, [canOpen]);

  const quotationId = session.runId ?? "local";

  const { groups, draft: rebuiltDraft } = useMemo(
    () =>
      buildWeightPricingGroups({
        approvedRows,
        commercialOptions: session.quoteItemCommercialOptions,
        draft: session.weightPricingDraft,
        quotationId,
      }),
    [
      approvedRows,
      session.quoteItemCommercialOptions,
      session.weightPricingDraft,
      quotationId,
    ]
  );

  const metrics = useMemo(() => computeWeightPricingMetrics(groups), [groups]);
  const validation = useMemo(
    () => validateWeightPricingGroups(groups),
    [groups]
  );
  const invalidSet = useMemo(
    () => new Set(validation.invalidGroupKeys),
    [validation.invalidGroupKeys]
  );

  const detailsGroup =
    groups.find((g) => g.groupKey === detailsGroupKey) ?? null;

  const previewRow = useMemo(
    () => finalRows.find((r) => r.id === itemPreviewId) ?? null,
    [finalRows, itemPreviewId]
  );

  const previewDxfFile = useMemo((): File | null => {
    if (!previewRow?.part.matchedDxfId) return null;
    const part = session.dxfParts.find(
      (p) => p.id === previewRow.part.matchedDxfId
    );
    if (!part) return null;
    return (
      session.dxfFiles.find(
        (f) => f.name === part.filename || f.name === part.partId
      ) ?? null
    );
  }, [previewRow, session.dxfParts, session.dxfFiles]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const diagnostics = buildWeightPricingDiagnostics({
      approvedRows,
      membership,
      groups,
      draft: session.weightPricingDraft,
    });
    assertWeightPricingInvariants(diagnostics);
    simpleIntakeActions.patchLastDebug({
      weightPricingDiagnostics: diagnostics,
    });
  }, [approvedRows, membership, groups, session.weightPricingDraft]);

  const patchGroup = useCallback(
    (groupKey: PricingGroupKey, patch: Partial<WeightPricingGroupDraft>) => {
      const next = patchGroupPricingInDraft({
        draft: session.weightPricingDraft ?? rebuiltDraft,
        quotationId,
        groupKey,
        patch,
      });
      simpleIntakeActions.setWeightPricingDraft(next);
      setSaveSuccess(false);
      setValidationMessage(null);
    },
    [session.weightPricingDraft, rebuiltDraft, quotationId]
  );

  function handleQuickApply(values: {
    basePricePerKg: number | null;
    galvanizedAddonPerKg: number | null;
    checkeredPlateAddonPerKg: number | null;
  }): void {
    const next = applyQuickPricingToDraft({
      draft: session.weightPricingDraft ?? rebuiltDraft,
      groups,
      ...values,
    });
    simpleIntakeActions.setWeightPricingDraft(next);
    setSaveSuccess(false);
    setValidationMessage(null);
  }

  function handleSave(): void {
    simpleIntakeActions.setWeightPricingDraft({
      ...(session.weightPricingDraft ?? rebuiltDraft),
      updatedAt: new Date().toISOString(),
    });
    setSaveSuccess(true);
    window.setTimeout(() => setSaveSuccess(false), 2500);
  }

  function handleContinue(): void {
    const live = validateWeightPricingGroups(groups);
    if (!live.isComplete) {
      setValidationMessage(PRICING_VALIDATION_MESSAGE);
      setFocusInvalidKey(live.firstInvalidGroupKey);
      setFocusRequestId((n) => n + 1);
      return;
    }
    const payload = buildWeightPricingSummaryPayload({
      quotationId,
      groups,
    });
    if (!payload) {
      setValidationMessage(PRICING_VALIDATION_MESSAGE);
      setFocusInvalidKey(live.firstInvalidGroupKey);
      return;
    }
    simpleIntakeActions.advanceToQuotationSummary(payload);
  }

  if (!canOpen) {
    return null;
  }

  return (
    <div
      className="mx-auto w-full space-y-5 pb-8"
      style={{ maxWidth: REVIEW_WORKSPACE_CONTENT_MAX_PX }}
      data-testid="weight-pricing-screen"
      data-review-workspace-container="true"
      data-review-workspace-width-token={REVIEW_WORKSPACE_WIDTH_TOKEN}
      data-weight-pricing-screen="true"
      data-nesting-enabled="false"
      dir="rtl"
    >
      <div
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        dir="rtl"
      >
        <ScreenHeader title="תמחור הצעת מחיר" className="mb-0" />
        <WeightPricingToolbar
          onBack={() => simpleIntakeActions.backToFinalQuoteList()}
          onSave={handleSave}
          onContinue={handleContinue}
          saveSuccess={saveSuccess}
        />
      </div>

      {validationMessage ? (
        <p
          className="text-[13px]"
          style={{ color: "var(--ow-attention, #b45309)" }}
          role="alert"
          data-pricing-validation-message="true"
        >
          {validationMessage}
        </p>
      ) : null}

      <WeightPricingMetricCards metrics={metrics} />
      <WeightPricingQuickBar onApply={handleQuickApply} />
      <WeightPricingTable
        groups={groups}
        invalidGroupKeys={invalidSet}
        focusGroupKey={focusInvalidKey}
        focusRequestId={focusRequestId}
        onPatchGroup={patchGroup}
        onViewGroup={setDetailsGroupKey}
      />

      <WeightPricingGroupDetailsDrawer
        group={detailsGroup}
        rows={approvedRows}
        open={detailsGroupKey != null}
        onClose={() => setDetailsGroupKey(null)}
        onViewItem={(rowId) => {
          setItemPreviewId(rowId);
        }}
      />

      {itemPreviewId != null && previewRow
        ? createPortal(
            <div
              dir="rtl"
              style={{
                position: "fixed",
                top: 24,
                left: 24,
                zIndex: 60,
                width: GAP_FIX_PANEL_WIDTH_PX,
                maxHeight: "calc(100vh - 48px)",
                overflowY: "auto",
                boxSizing: "border-box",
                transition: `opacity ${GAP_FIX_PANEL_MS}ms ${GAP_FIX_PANEL_EASE}`,
              }}
            >
              <GapResolutionFixDrawer
                row={previewRow}
                open
                onClose={() => setItemPreviewId(null)}
                variant="final-preview"
                dxfFile={previewDxfFile}
                onPickDxf={() => undefined}
                onUseDxfDimensions={() => undefined}
                onKeepDimensionReview={() => undefined}
                trySelectDxf={() => false}
                candidates={[]}
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
