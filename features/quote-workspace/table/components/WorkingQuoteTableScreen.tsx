"use client";

import { useMemo, useState } from "react";
import { useQuoteSession } from "../../useQuoteSession";
import {
  getQuoteSessionState,
  quoteSessionActions,
} from "../../quoteSessionStore";
import {
  selectQuoteTableViewModel,
  selectSelectedTableRow,
} from "../quoteTableSelectors";
import { issuesForViewRow } from "../quoteTableEvidence";
import type { QuoteEditField } from "../quoteTableEditValidation";
import { QuoteTableToolbar } from "./QuoteTableToolbar";
import { QuoteTable } from "./QuoteTable";
import { QuoteTableMobileCard } from "./QuoteTableMobileCard";
import { QuoteEvidencePanel } from "./QuoteEvidencePanel";
import { QuoteTableEmptyState } from "./QuoteTableEmptyState";

export function WorkingQuoteTableScreen() {
  const { session } = useQuoteSession();
  const [liveMsg, setLiveMsg] = useState("");

  const vm = useMemo(
    () => selectQuoteTableViewModel(session),
    [session]
  );
  const selected = useMemo(
    () => selectSelectedTableRow(session, vm),
    [session, vm]
  );

  if (!session) {
    return (
      <QuoteTableEmptyState
        kind="NO_ANALYSIS"
        onBackToFiles={() => quoteSessionActions.goToFilesStep()}
      />
    );
  }

  if (!vm) {
    return (
      <QuoteTableEmptyState
        kind="NO_ANALYSIS"
        onBackToFiles={() => quoteSessionActions.goToFilesStep()}
      />
    );
  }

  const handleEdit = (
    rowId: string,
    field: QuoteEditField,
    value: string | number
  ) => {
    const before =
      getQuoteSessionState().session?.analysis.reviewSession?.decisions
        .length ?? 0;
    quoteSessionActions.applyTableDecision({
      kind: "MANUAL_EDIT",
      rowId,
      field,
      value,
    });
    const after =
      getQuoteSessionState().session?.analysis.reviewSession?.decisions
        .length ?? 0;
    setLiveMsg(after > before ? "הערך עודכן" : "לא בוצע שינוי");
  };

  const handleToggle = (rowId: string, include: boolean) => {
    quoteSessionActions.applyTableDecision({
      kind: "SET_INCLUDE",
      rowId,
      includeInQuote: include,
    });
    setLiveMsg(include ? "החלק נכלל בהצעה" : "החלק הוחרג מההצעה");
  };

  const emptyKind =
    vm.rows.length === 0
      ? ("NO_ROWS" as const)
      : vm.visibleRows.length === 0
        ? session.reviewUi.searchQuery.trim()
          ? ("NO_SEARCH" as const)
          : ("FILTER_EMPTY" as const)
        : null;

  const selectedStillExists = selected
    ? vm.rows.some((r) => r.rowId === selected.rowId)
    : false;
  const panelRow = selectedStillExists ? selected : null;
  const selectedIssues = panelRow
    ? issuesForViewRow(panelRow, vm.issuesById)
    : [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            פרויקט:{" "}
            <span className="font-medium text-foreground">
              {session.details.projectName}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            לקוח:{" "}
            <span className="font-medium text-foreground">
              {session.details.customerName}
            </span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            טבלת הצעת מחיר
          </h1>
        </div>
        <p className="max-w-xs text-xs text-muted-foreground sm:text-end">
          אישור הטבלה יופעל בשלב הבא
        </p>
      </header>

      <QuoteTableToolbar
        searchQuery={session.reviewUi.searchQuery}
        activeFilter={session.reviewUi.activeFilter}
        filterCounts={vm.filterCounts}
        visibleCount={vm.visibleRows.length}
        counters={vm.counters}
        isStale={session.analysis.isStale}
        onSearch={(q) => quoteSessionActions.setTableSearch(q)}
        onFilter={(f) => quoteSessionActions.setTableFilter(f)}
        onClearFilters={() => quoteSessionActions.clearTableFilters()}
        onAddFiles={() => quoteSessionActions.goToFilesStep()}
        onBackToFiles={() => quoteSessionActions.goToFilesStep()}
      />

      {emptyKind ? (
        <QuoteTableEmptyState kind={emptyKind} />
      ) : (
        <>
          <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <QuoteTable
              rows={vm.visibleRows}
              selectedRowId={session.reviewUi.selectedRowId}
              sortKey={session.reviewUi.sortKey}
              sortDir={session.reviewUi.sortDir}
              onSort={(key) => quoteSessionActions.setTableSort(key)}
              onSelect={(id) => quoteSessionActions.selectTableRow(id)}
              onEdit={handleEdit}
              onToggleInclude={handleToggle}
            />
            {panelRow ? (
              <QuoteEvidencePanel
                row={panelRow}
                issues={selectedIssues}
                onClose={() => quoteSessionActions.selectTableRow(null)}
                onToggleInclude={(include) =>
                  handleToggle(panelRow.rowId, include)
                }
              />
            ) : (
              <div className="rounded-[12px] border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                בחרו שורה כדי לראות מקורות, DXF ובעיות.
              </div>
            )}
          </div>

          <div className="space-y-3 lg:hidden">
            {vm.visibleRows.map((row) => (
              <QuoteTableMobileCard
                key={row.rowId}
                row={row}
                selected={session.reviewUi.selectedRowId === row.rowId}
                onOpen={() => quoteSessionActions.selectTableRow(row.rowId)}
                onToggleInclude={(include) =>
                  handleToggle(row.rowId, include)
                }
              />
            ))}
            {panelRow && (
              <div className="fixed inset-x-0 bottom-0 z-40">
                <QuoteEvidencePanel
                  variant="sheet"
                  row={panelRow}
                  issues={selectedIssues}
                  onClose={() => quoteSessionActions.selectTableRow(null)}
                  onToggleInclude={(include) =>
                    handleToggle(panelRow.rowId, include)
                  }
                />
              </div>
            )}
          </div>
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {liveMsg}
      </p>
    </div>
  );
}
