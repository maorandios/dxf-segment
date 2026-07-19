"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { QuoteTableSortKey } from "../../types";
import type { QuoteEditField } from "../quoteTableEditValidation";
import { nextEditableField } from "../quoteTableKeyboardNavigation";
import {
  formatAreaM2,
  formatInteger,
  formatMassKg,
  formatMaterial,
  formatMeasurementMm,
} from "../quoteTableFormatting";
import { getVisibleQuoteTableColumns } from "../quoteTableColumns";
import type { QuoteTableRowViewModel } from "../types";
import { EditableQuoteCell } from "./EditableQuoteCell";
import { QuoteRowStatusBadge } from "./QuoteRowStatusBadge";

export function QuoteTableHeader(props: {
  sortKey: QuoteTableSortKey | null;
  sortDir: "asc" | "desc";
  onSort: (key: QuoteTableSortKey) => void;
}) {
  const cols = getVisibleQuoteTableColumns();
  const sortable = new Set<string>([
    "partReference",
    "quantity",
    "material",
    "thicknessMm",
    "widthMm",
    "heightMm",
    "status",
  ]);

  return (
    <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
      <tr className="border-b border-white/10 text-xs text-muted-foreground">
        {cols.map((col) => {
          const canSort = sortable.has(col.key);
          const active = props.sortKey === col.key;
          return (
            <th
              key={col.key}
              scope="col"
              className={cn(
                "whitespace-nowrap px-2 py-2 font-medium",
                col.align === "END" && "text-end",
                col.align === "CENTER" && "text-center",
                col.minWidth && `min-w-[${col.minWidth}px]`
              )}
              style={{ minWidth: col.minWidth }}
            >
              {canSort ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => props.onSort(col.key as QuoteTableSortKey)}
                >
                  {col.label}
                  {active && (
                    <span aria-hidden>
                      {props.sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              ) : (
                col.label
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function QuoteTableRow(props: {
  row: QuoteTableRowViewModel;
  selected: boolean;
  onSelect: () => void;
  onEdit: (field: QuoteEditField, value: string | number) => void;
  onToggleInclude: (include: boolean) => void;
  onMoveEdit: (field: QuoteEditField, dir: 1 | -1) => void;
}) {
  const { row } = props;
  const excluded = row.presentationStatus === "EXCLUDED";

  return (
    <tr
      className={cn(
        "border-b border-white/5 transition-colors hover:bg-white/[0.03]",
        props.selected && "bg-primary/10",
        excluded && "opacity-55"
      )}
      aria-selected={props.selected}
      onClick={props.onSelect}
    >
      <td className="px-2 py-2 text-sm font-medium">
        {row.displayPartReference}
      </td>
      <td className="px-2 py-2 text-end" onClick={(e) => e.stopPropagation()}>
        <EditableQuoteCell
          rowId={row.rowId}
          field="quantity"
          displayValue={formatInteger(row.quantity)}
          edited={row.quantityEdited}
          highlighted={Boolean(row.fieldIssueKeys.quantity)}
          disabled={excluded}
          onCommit={(v) => props.onEdit("quantity", v)}
          onMove={(dir) => props.onMoveEdit("quantity", dir)}
        />
      </td>
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <EditableQuoteCell
          rowId={row.rowId}
          field="material"
          displayValue={formatMaterial(row.material)}
          edited={row.materialEdited}
          highlighted={Boolean(row.fieldIssueKeys.material)}
          disabled={excluded}
          onCommit={(v) => props.onEdit("material", v)}
          onMove={(dir) => props.onMoveEdit("material", dir)}
        />
      </td>
      <td className="px-2 py-2 text-end" onClick={(e) => e.stopPropagation()}>
        <EditableQuoteCell
          rowId={row.rowId}
          field="thicknessMm"
          displayValue={formatMeasurementMm(row.thicknessMm)}
          edited={row.thicknessEdited}
          highlighted={Boolean(row.fieldIssueKeys.thicknessMm)}
          disabled={excluded}
          onCommit={(v) => props.onEdit("thicknessMm", v)}
          onMove={(dir) => props.onMoveEdit("thicknessMm", dir)}
        />
      </td>
      <td className="px-2 py-2 text-end text-sm tabular-nums">
        {formatMeasurementMm(row.widthMm)}
      </td>
      <td className="px-2 py-2 text-end text-sm tabular-nums">
        {formatMeasurementMm(row.heightMm)}
      </td>
      <td className="px-2 py-2 text-end text-sm tabular-nums">
        {formatAreaM2(row.plateAreaM2)}
      </td>
      <td className="px-2 py-2 text-end text-sm tabular-nums">
        {formatMassKg(row.unitWeightKg)}
      </td>
      <td className="px-2 py-2 text-end text-sm tabular-nums">
        {formatMassKg(row.totalWeightKg)}
      </td>
      <td className="px-2 py-2">
        <QuoteRowStatusBadge
          status={row.presentationStatus}
          labelOverride={row.statusLabelOverrideHe}
        />
      </td>
      <td
        className="px-2 py-2 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Switch
          checked={row.includeInQuote}
          onCheckedChange={props.onToggleInclude}
          aria-label={`כלול את ${row.displayPartReference} בהצעה`}
        />
      </td>
    </tr>
  );
}

export function QuoteTable(props: {
  rows: QuoteTableRowViewModel[];
  selectedRowId: string | null;
  sortKey: QuoteTableSortKey | null;
  sortDir: "asc" | "desc";
  onSort: (key: QuoteTableSortKey) => void;
  onSelect: (rowId: string) => void;
  onEdit: (
    rowId: string,
    field: QuoteEditField,
    value: string | number
  ) => void;
  onToggleInclude: (rowId: string, include: boolean) => void;
}) {
  return (
    <div className="max-h-[min(70vh,720px)] overflow-auto rounded-[12px] border border-white/10">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <QuoteTableHeader
          sortKey={props.sortKey}
          sortDir={props.sortDir}
          onSort={props.onSort}
        />
        <tbody>
          {props.rows.map((row) => (
            <QuoteTableRow
              key={row.rowId}
              row={row}
              selected={props.selectedRowId === row.rowId}
              onSelect={() => props.onSelect(row.rowId)}
              onEdit={(field, value) =>
                props.onEdit(row.rowId, field, value)
              }
              onToggleInclude={(include) =>
                props.onToggleInclude(row.rowId, include)
              }
              onMoveEdit={(field, dir) => {
                const next = nextEditableField(field, dir);
                const el = document.getElementById(
                  `quote-cell-${row.rowId}-${next}`
                );
                el?.focus();
                el?.click();
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
