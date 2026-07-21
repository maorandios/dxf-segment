"use client";

import { useMemo, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import {
  MetricStrip,
  ScreenHeader,
  StatusBadge,
  StickyActionBar,
  WorkflowNotice,
} from "../ui";
import { ApproveWithMissingDialog } from "./ApproveWithMissingDialog";
import {
  displayLabel,
  effectiveMaterialFields,
  fieldDisplayKind,
  missingFieldsMessageHe,
  summarizeMaterialList,
} from "./completeness";
import {
  deriveMaterialListMetrics,
  formatMaterialListAreaM2,
  formatMaterialListWeightKg,
} from "./materialListDerived";
import { MATERIAL_LIST_TABLE_HEADERS } from "./types";
import type { MaterialListRow, MaterialListUserOverrides } from "./types";

type FilterId = "ALL" | "COMPLETE" | "INCOMPLETE";

function statusLabelHe(row: MaterialListRow): string {
  if (row.approvalStatus === "COMPLETE") return "מלא";
  if (row.approvalStatus === "APPROVED_WITH_MISSING_DATA")
    return "אושר עם חוסרים";
  return "נדרש השלמה";
}

function CellMissing({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--ow-radius-sm)] border px-1.5 py-0.5 text-[12px]"
      style={{
        backgroundColor: "var(--ow-attention-soft)",
        borderColor: "#F9DBAF",
        color: "var(--ow-attention)",
      }}
    >
      {children}
    </span>
  );
}

function CellUnresolved() {
  return (
    <span
      className="inline-flex items-center rounded-[var(--ow-radius-sm)] border px-1.5 py-0.5 text-[12px]"
      style={{
        backgroundColor: "var(--ow-error-soft)",
        borderColor: "#FECDCA",
        color: "var(--ow-error)",
      }}
    >
      לא פוענח
    </span>
  );
}

function EditableNumber({
  label,
  value,
  onSave,
  integer,
  missing,
  unresolved,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
  integer?: boolean;
  missing: boolean;
  unresolved?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          "text-start underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          pulse && "ow-cell-pulse rounded-[var(--ow-radius-sm)] px-0.5"
        )}
        onClick={() => {
          setDraft(value == null ? "" : String(value));
          setError(null);
          setEditing(true);
        }}
        aria-label={`ערוך ${label}`}
      >
        {unresolved ? (
          <CellUnresolved />
        ) : value == null || (typeof value === "number" && value <= 0) ? (
          <CellMissing>חסר</CellMissing>
        ) : (
          <span
            className="ow-tabular ow-ltr inline-block"
            style={
              missing ? { color: "var(--ow-attention)" } : undefined
            }
          >
            {value}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex min-w-[7rem] flex-col gap-1">
      <Label className="sr-only">{label}</Label>
      <div className="flex gap-1">
        <Input
          value={draft}
          inputMode={integer ? "numeric" : "decimal"}
          className="h-8 ow-ltr"
          dir="ltr"
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={Boolean(error)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const t = draft.trim();
            if (t === "") {
              setError(`יש להזין ${label}.`);
              return;
            }
            const n = Number(t.replace(",", "."));
            if (!Number.isFinite(n) || n <= 0) {
              setError(`יש להזין ${label} גדול מאפס.`);
              return;
            }
            if (integer && !Number.isInteger(n)) {
              setError("יש להזין מספר יחידות שלם גדול מאפס.");
              return;
            }
            onSave(n);
            setEditing(false);
            setPulse(true);
            window.setTimeout(() => setPulse(false), 450);
          }}
        >
          שמור
        </Button>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--ow-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function EditableText({
  label,
  value,
  onSave,
  missing,
  unresolved,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  missing?: boolean;
  unresolved?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          "text-start underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          pulse && "ow-cell-pulse rounded-[var(--ow-radius-sm)] px-0.5"
        )}
        onClick={() => {
          setDraft(value ?? "");
          setError(null);
          setEditing(true);
        }}
        aria-label={`ערוך ${label}`}
      >
        {unresolved ? (
          <CellUnresolved />
        ) : !value?.trim() ? (
          missing ? (
            <CellMissing>חסר</CellMissing>
          ) : (
            <span style={{ color: "var(--ow-text-muted)" }}>—</span>
          )
        ) : (
          value
        )}
      </button>
    );
  }

  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <div className="flex gap-1">
        <Input
          value={draft}
          className="h-8"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const t = draft.trim();
            if (missing && !t) {
              setError(`יש להזין ${label}.`);
              return;
            }
            onSave(t || null);
            setEditing(false);
            setPulse(true);
            window.setTimeout(() => setPulse(false), 450);
          }}
        >
          שמור
        </Button>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--ow-error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function applyOverride(
  rowId: string,
  patch: MaterialListUserOverrides
): void {
  simpleIntakeActions.updateMaterialListOverrides(rowId, patch);
}

function RowActionIcons({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="שכפל פריט"
            onClick={onDuplicate}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">שכפל פריט</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            style={{ color: "var(--ow-error)" }}
            aria-label="מחק פריט"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">מחק פריט</TooltipContent>
      </Tooltip>
    </div>
  );
}

function getRowFieldEditors(row: MaterialListRow) {
  const e = effectiveMaterialFields(row);
  const derived = deriveMaterialListMetrics(row);
  const msg = missingFieldsMessageHe(row);
  const incomplete = row.approvalStatus !== "COMPLETE";

  return {
    e,
    derived,
    msg,
    status: (
      <div className="space-y-1">
        <StatusBadge
          label={statusLabelHe(row)}
          variant={incomplete ? "incomplete" : "complete"}
        />
        {msg && (
          <p className="text-[11px]" style={{ color: "var(--ow-attention)" }}>
            {msg}
          </p>
        )}
      </div>
    ),
    part: (
      <EditableText
        label="חלק / פרופיל"
        value={e.partId ?? e.profile}
        onSave={(v) => {
          if (e.partId) {
            applyOverride(row.rowId, { partId: v });
          } else {
            applyOverride(row.rowId, { profile: v });
          }
        }}
      />
    ),
    material: (() => {
      const kind = fieldDisplayKind(row, "material");
      return (
        <EditableText
          label="סוג חומר"
          value={kind === "value" ? e.material : null}
          missing={kind === "missing"}
          unresolved={kind === "unresolved"}
          onSave={(v) => applyOverride(row.rowId, { material: v })}
        />
      );
    })(),
    thickness: (
      <EditableNumber
        label="עובי"
        value={e.thicknessMm}
        missing={!e.thicknessMm || e.thicknessMm <= 0}
        unresolved={fieldDisplayKind(row, "thicknessMm") === "unresolved"}
        onSave={(v) => applyOverride(row.rowId, { thicknessMm: v })}
      />
    ),
    quantity: (
      <EditableNumber
        label="כמות"
        value={e.quantity}
        integer
        missing={!e.quantity || e.quantity <= 0}
        unresolved={fieldDisplayKind(row, "quantity") === "unresolved"}
        onSave={(v) => applyOverride(row.rowId, { quantity: v })}
      />
    ),
    width: (
      <EditableNumber
        label="רוחב"
        value={e.widthMm}
        missing={!e.widthMm || e.widthMm <= 0}
        unresolved={fieldDisplayKind(row, "widthMm") === "unresolved"}
        onSave={(v) => applyOverride(row.rowId, { widthMm: v })}
      />
    ),
    length: (
      <EditableNumber
        label="אורך"
        value={e.lengthMm}
        missing={!e.lengthMm || e.lengthMm <= 0}
        unresolved={fieldDisplayKind(row, "lengthMm") === "unresolved"}
        onSave={(v) => applyOverride(row.rowId, { lengthMm: v })}
      />
    ),
    unitArea: formatMaterialListAreaM2(derived.unitAreaM2),
    totalArea: formatMaterialListAreaM2(derived.totalAreaM2),
    unitWeight: formatMaterialListWeightKg(derived.unitWeightKg),
    totalWeight: formatMaterialListWeightKg(derived.totalWeightKg),
  };
}

function MaterialListTableRow({
  row,
  displayIndex,
  onDuplicate,
  onRequestDelete,
}: {
  row: MaterialListRow;
  displayIndex: number;
  onDuplicate: () => void;
  onRequestDelete: () => void;
}) {
  const editors = getRowFieldEditors(row);

  return (
    <tr
      className="border-b transition-colors duration-150 hover:bg-[color:var(--ow-surface-muted)]"
      style={{ borderColor: "var(--ow-border)" }}
    >
      <td
        className="px-3 py-2.5 text-[13px] ow-tabular"
        style={{ color: "var(--ow-text-muted)" }}
      >
        {displayIndex}
      </td>
      <td className="px-3 py-2.5 text-[13px]">{editors.status}</td>
      <td className="px-3 py-2.5 text-[13px]">{editors.part}</td>
      <td className="px-3 py-2.5 text-[13px]">{editors.material}</td>
      <td className="px-3 py-2.5 text-[13px]">{editors.thickness}</td>
      <td className="px-3 py-2.5 text-[13px]">{editors.quantity}</td>
      <td className="px-3 py-2.5 text-[13px]">{editors.width}</td>
      <td className="px-3 py-2.5 text-[13px]">{editors.length}</td>
      <td className="px-3 py-2.5 text-[13px] ow-tabular ow-ltr">
        {editors.unitArea}
      </td>
      <td className="px-3 py-2.5 text-[13px] ow-tabular ow-ltr">
        {editors.totalArea}
      </td>
      <td className="px-3 py-2.5 text-[13px] ow-tabular ow-ltr">
        {editors.unitWeight}
      </td>
      <td className="px-3 py-2.5 text-[13px] ow-tabular ow-ltr">
        {editors.totalWeight}
      </td>
      <td className="px-3 py-2.5">
        <RowActionIcons onDuplicate={onDuplicate} onDelete={onRequestDelete} />
      </td>
    </tr>
  );
}

export function MaterialListReviewScreen() {
  const session = useSimpleIntakeSession();
  const rows = session.materialListRows;
  const [filter, setFilter] = useState<FilterId>(
    session.materialListShowUnresolvedOnly ? "INCOMPLETE" : "ALL"
  );
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);

  const summary = useMemo(() => summarizeMaterialList(rows), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "COMPLETE" && r.approvalStatus !== "COMPLETE") return false;
      if (filter === "INCOMPLETE" && r.approvalStatus === "COMPLETE")
        return false;
      if (!q) return true;
      const label = displayLabel(r).toLowerCase();
      const e = effectiveMaterialFields(r);
      return (
        label.includes(q) ||
        (e.partId ?? "").toLowerCase().includes(q) ||
        (e.profile ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const requestApprove = () => {
    if (summary.incompleteRows > 0) {
      setConfirmOpen(true);
      return;
    }
    simpleIntakeActions.approveMaterialList({ allowMissing: false });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-[calc(100vh-11rem)] flex-col">
        <div className="flex-1 space-y-4 pb-4">
          <ScreenHeader
            title="רשימת החומר מוכנה"
            supportingText="סידרנו את הנתונים שמצאנו בקובץ. בדוק את הפריטים שדורשים השלמה לפני המעבר לקובצי DXF."
          />

          <MetricStrip
            items={[
              { id: "items", label: "פריטים", value: summary.totalRows },
              { id: "units", label: "יחידות", value: summary.knownUnits },
              {
                id: "ok",
                label: "פריטים תקינים",
                value: summary.completeRows,
              },
              {
                id: "need",
                label: "נדרש השלמה",
                value: summary.incompleteRows,
                highlight:
                  summary.incompleteRows > 0 ? "attention" : "none",
              },
            ]}
          />

          {summary.incompleteRows > 0 && (
            <WorkflowNotice
              severity="recommendation"
              heading={`נמצאו ${summary.incompleteRows.toLocaleString("he-IL")} פריטים שדורשים השלמה`}
              actionLabel="הצג רק פריטים להשלמה"
              onAction={() => setFilter("INCOMPLETE")}
            >
              ניתן לתקן את הנתונים ישירות בטבלה או להמשיך ולרכז את החוסרים לאחר
              חיבור קובצי ה-DXF.
            </WorkflowNotice>
          )}

          <div
            className="flex flex-col gap-3 rounded-[var(--ow-radius)] border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            style={{
              backgroundColor: "var(--ow-surface)",
              borderColor: "var(--ow-border)",
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["ALL", "הכול"],
                  ["COMPLETE", "מלא"],
                  ["INCOMPLETE", "דורש השלמה"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={filter === id ? "default" : "ghost"}
                  className="h-8"
                  style={
                    filter === id
                      ? {
                          backgroundColor: "var(--ow-accent)",
                          color: "var(--ow-accent-fg)",
                        }
                      : undefined
                  }
                  onClick={() => setFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="w-full sm:max-w-xs">
              <Label htmlFor="ml-search" className="sr-only">
                חיפוש לפי חלק או פרופיל
              </Label>
              <Input
                id="ml-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי חלק או פרופיל"
                className="h-8"
              />
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-[var(--ow-radius)] border"
            style={{
              backgroundColor: "var(--ow-surface)",
              borderColor: "var(--ow-border)",
            }}
          >
            <table className="w-full min-w-[1100px] border-collapse text-[13px]">
              <thead>
                <tr
                  className="sticky top-0 z-10 border-b text-start"
                  style={{
                    backgroundColor: "var(--ow-surface-muted)",
                    borderColor: "var(--ow-border)",
                  }}
                >
                  {MATERIAL_LIST_TABLE_HEADERS.map((h, i) => (
                    <th
                      key={`h-${i}`}
                      className="px-3 py-2.5 text-[12px] font-medium"
                      style={{ color: "var(--ow-text-secondary)" }}
                      scope="col"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => (
                  <MaterialListTableRow
                    key={row.rowId}
                    row={row}
                    displayIndex={index + 1}
                    onDuplicate={() =>
                      simpleIntakeActions.duplicateMaterialListRow(row.rowId)
                    }
                    onRequestDelete={() => setDeleteRowId(row.rowId)}
                  />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p
                className="px-4 py-10 text-center text-[13px]"
                style={{ color: "var(--ow-text-muted)" }}
              >
                אין פריטים להצגה לפי הסינון הנוכחי.
              </p>
            )}
          </div>
        </div>

        <StickyActionBar
          statusText={
            summary.incompleteRows > 0
              ? `${summary.incompleteRows.toLocaleString("he-IL")} פריטים דורשים השלמה`
              : "כל הפריטים תקינים"
          }
          secondary={{
            label: "חזרה",
            onClick: () => simpleIntakeActions.backToFiles(),
          }}
          primary={{
            label: "אשר רשימה והמשך ל-DXF",
            onClick: requestApprove,
          }}
        />

        <ApproveWithMissingDialog
          open={confirmOpen}
          incompleteCount={summary.incompleteRows}
          onBack={() => setConfirmOpen(false)}
          onContinueAnyway={() => {
            setConfirmOpen(false);
            simpleIntakeActions.approveMaterialList({ allowMissing: true });
          }}
        />

        <Dialog
          open={deleteRowId != null}
          onOpenChange={(next) => {
            if (!next) setDeleteRowId(null);
          }}
        >
          <DialogContent
            className="sm:max-w-md"
            dir="rtl"
            showCloseButton={false}
          >
            <DialogHeader>
              <DialogTitle>מחיקת פריט</DialogTitle>
              <DialogDescription>
                האם למחוק את הפריט מהרשימה?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteRowId(null)}
              >
                ביטול
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (deleteRowId) {
                    simpleIntakeActions.deleteMaterialListRow(deleteRowId);
                  }
                  setDeleteRowId(null);
                }}
              >
                מחק פריט
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
