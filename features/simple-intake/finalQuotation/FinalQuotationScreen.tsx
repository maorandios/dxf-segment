"use client";

import { useEffect, useMemo, useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { deriveFinalRows } from "../results/deriveFinalRows";
import { ScreenHeader } from "../ui";
import {
  REVIEW_WORKSPACE_CONTENT_MAX_PX,
  REVIEW_WORKSPACE_WIDTH_TOKEN,
} from "../ui/ReviewWorkspaceContainer";
import { assertFinalQuotationInvariants } from "./buildFinalQuotationDiagnostics";
import { buildFinalQuotationDiagnostics } from "./buildFinalQuotationDiagnostics";
import { buildFinalQuotationExcelWorkbook } from "./buildFinalQuotationExcelWorkbook";
import { buildFinalQuotationRows } from "./buildFinalQuotationRows";
import { downloadFinalQuotationPdf } from "./buildFinalQuotationPdfPayload";
import { calculateFinalQuotationTotals } from "./calculateFinalQuotationTotals";
import { canOpenFinalQuotationScreen } from "./canOpenFinalQuotationScreen";
import { filterFinalQuotationRowsBySearch } from "./filterFinalQuotationRowsBySearch";
import { FinalQuotationItemsTable } from "./FinalQuotationItemsTable";
import { FinalQuotationMetadataForm } from "./FinalQuotationMetadataForm";
import { FinalQuotationNotes } from "./FinalQuotationNotes";
import { FinalQuotationSummaryStrip } from "./FinalQuotationSummaryStrip";
import { FinalQuotationToolbar } from "./FinalQuotationToolbar";
import {
  createEmptyFinalQuotationDraft,
  type FinalQuotationDraft,
  type FinalQuotationMetadata,
} from "./types";
import {
  QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE,
  QUOTATION_SUMMARY_RENDERED_BELOW_TABLE,
} from "./types";

/**
 * Final quotation summary + export screen (סיכום הצעת מחיר).
 * Opens only when a completed weight-pricing summary payload exists.
 */
export function FinalQuotationScreen() {
  const session = useSimpleIntakeSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  const pricingSummary = session.weightPricingSummaryPayload;
  const canOpen = canOpenFinalQuotationScreen(pricingSummary);

  useEffect(() => {
    if (!canOpen) {
      simpleIntakeActions.backToWeightPricing();
    }
  }, [canOpen]);

  const quotationId =
    session.quoteDetails?.createdAt != null
      ? `${session.quoteDetails.createdAt}:${session.quoteDetails.projectName}`
      : session.runId ?? "local-quotation";

  useEffect(() => {
    if (!canOpen) return;
    const existing = session.finalQuotationDraft;
    if (existing && existing.quotationId === quotationId) return;
    const seed = createEmptyFinalQuotationDraft(quotationId, {
      customerName: session.quoteDetails?.customerName ?? "",
      projectName: session.quoteDetails?.projectName ?? "",
    });
    simpleIntakeActions.setFinalQuotationDraft(seed);
  }, [
    canOpen,
    quotationId,
    session.finalQuotationDraft,
    session.quoteDetails?.customerName,
    session.quoteDetails?.projectName,
  ]);

  const draft: FinalQuotationDraft =
    session.finalQuotationDraft &&
    session.finalQuotationDraft.quotationId === quotationId
      ? session.finalQuotationDraft
      : createEmptyFinalQuotationDraft(quotationId, {
          customerName: session.quoteDetails?.customerName ?? "",
          projectName: session.quoteDetails?.projectName ?? "",
        });

  const finalRows = useMemo(
    () =>
      deriveFinalRows({
        resultRows: session.resultRows,
        dxfParts: session.dxfParts,
        workbookFilename: session.workbookFile?.name ?? null,
        snapshot: session.workbookSnapshot,
        diagnostics: session.matchingDiagnostics,
        frozenMaterialRows: session.frozenMaterialRows,
        materialRowUserResolutions: session.materialRowUserResolutions,
        confirmedManualMatchIds: new Set(session.confirmedManualMatchIds),
      }),
    [
      session.resultRows,
      session.dxfParts,
      session.workbookFile?.name,
      session.workbookSnapshot,
      session.matchingDiagnostics,
      session.frozenMaterialRows,
      session.materialRowUserResolutions,
      session.confirmedManualMatchIds,
    ]
  );

  const includedIds =
    session.finalQuoteListMembership?.includedMaterialRowIds ?? null;

  const quotationRows = useMemo(() => {
    if (!pricingSummary) return [];
    return buildFinalQuotationRows({
      approvedRows: finalRows,
      pricingSummary,
      commercialOptions: session.quoteItemCommercialOptions,
      includedMaterialRowIds: includedIds ?? [],
    });
  }, [
    finalRows,
    pricingSummary,
    session.quoteItemCommercialOptions,
    includedIds,
  ]);

  const totals = useMemo(
    () =>
      calculateFinalQuotationTotals(quotationRows, draft.vatRatePercent),
    [quotationRows, draft.vatRatePercent]
  );

  const visibleRows = useMemo(
    () => filterFinalQuotationRowsBySearch(quotationRows, searchQuery),
    [quotationRows, searchQuery]
  );

  useEffect(() => {
    if (!canOpen || process.env.NODE_ENV === "production") return;
    const diagnostics = buildFinalQuotationDiagnostics({
      quotationId,
      rows: quotationRows,
      totals,
      draft,
    });
    assertFinalQuotationInvariants(diagnostics);
    if (typeof window !== "undefined") {
      (
        window as unknown as {
          __OMEGA_FINAL_QUOTATION_DIAGNOSTICS__?: unknown;
        }
      ).__OMEGA_FINAL_QUOTATION_DIAGNOSTICS__ = diagnostics;
    }
  }, [canOpen, quotationId, quotationRows, totals, draft]);

  function patchDraft(
    patch: Partial<Omit<FinalQuotationDraft, "metadata">> & {
      metadata?: Partial<FinalQuotationMetadata>;
    }
  ): void {
    const next: FinalQuotationDraft = {
      ...draft,
      ...patch,
      metadata: {
        ...draft.metadata,
        ...(patch.metadata ?? {}),
      },
      updatedAt: new Date().toISOString(),
    };
    simpleIntakeActions.setFinalQuotationDraft(next);
  }

  async function handleExportExcel(): Promise<void> {
    if (quotationRows.length === 0) return;
    setExportError(null);
    try {
      const { filename, bytes } = await buildFinalQuotationExcelWorkbook({
        draft,
        rows: quotationRows,
        totals,
      });
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleExportPdf(): Promise<void> {
    if (quotationRows.length === 0) return;
    setExportError(null);
    const result = await downloadFinalQuotationPdf({
      draft,
      rows: quotationRows,
      totals,
    });
    if (!result.ok) {
      setExportError(result.error ?? "PDF export failed");
    }
  }

  if (!canOpen) {
    return null;
  }

  return (
    <div className="flex w-full justify-center self-stretch">
      <div
        className="mx-auto w-full space-y-4 px-1 pb-10"
        style={{ maxWidth: REVIEW_WORKSPACE_CONTENT_MAX_PX }}
        data-review-workspace-container="true"
        data-review-workspace-width-token={REVIEW_WORKSPACE_WIDTH_TOKEN}
        data-final-quotation-screen="true"
        data-summary-above-table={String(QUOTATION_SUMMARY_RENDERED_ABOVE_TABLE)}
        data-summary-below-table={String(QUOTATION_SUMMARY_RENDERED_BELOW_TABLE)}
        data-final-screen-dxf-parse="false"
        data-final-screen-ai-call="false"
        dir="rtl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ScreenHeader title="סיכום הצעת מחיר" className="mb-0" />
          <FinalQuotationToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onBack={() => simpleIntakeActions.backToWeightPricing()}
            onExportExcel={() => void handleExportExcel()}
            onExportPdf={() => void handleExportPdf()}
            exportDisabled={quotationRows.length === 0}
          />
        </div>

        <FinalQuotationMetadataForm
          metadata={draft.metadata}
          onChange={(metaPatch) => patchDraft({ metadata: metaPatch })}
        />

        <FinalQuotationSummaryStrip
          totals={totals}
          vatRatePercent={draft.vatRatePercent}
          onVatRateChange={(vatRatePercent) => patchDraft({ vatRatePercent })}
        />

        <FinalQuotationItemsTable rows={visibleRows} />

        <FinalQuotationNotes
          notes={draft.notes}
          onChange={(notes) => patchDraft({ notes })}
        />

        {exportError ? (
          <p
            className="text-[13px]"
            style={{ color: "var(--ow-danger, #b42318)" }}
            role="alert"
          >
            {exportError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
