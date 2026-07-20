"use client";

import { useMemo, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
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
  return "דורש השלמה";
}

function CellMissing({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-800 dark:text-amber-200">
      {children}
    </span>
  );
}

function CellUnresolved() {
  return (
    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-800 dark:text-rose-200">
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

  if (!editing) {
    return (
      <button
        type="button"
        className="text-start underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
          <span className={missing ? "text-amber-800 dark:text-amber-200" : undefined}>
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
          className="h-8"
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={Boolean(error)}
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
          }}
        >
          שמור
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
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

  if (!editing) {
    return (
      <button
        type="button"
        className="text-start underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
          missing ? <CellMissing>חסר</CellMissing> : <span>—</span>
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
          }}
        >
          שמור
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
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
            className="h-8 w-8 text-destructive hover:text-destructive"
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

  return {
    e,
    derived,
    msg,
    status: (
      <div className="space-y-1">
        <span>{statusLabelHe(row)}</span>
        {msg && (
          <p className="text-xs text-amber-800 dark:text-amber-200">{msg}</p>
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
    material: (
      <EditableText
        label="סוג חומר"
        value={e.material}
        missing
        unresolved={fieldDisplayKind(row, "material") === "unresolved"}
        onSave={(v) => applyOverride(row.rowId, { material: v })}
      />
    ),
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
    <tr className="border-b align-top">
      <td className="px-3 py-2 tabular-nums text-muted-foreground">
        {displayIndex}
      </td>
      <td className="px-3 py-2">{editors.status}</td>
      <td className="px-3 py-2">{editors.part}</td>
      <td className="px-3 py-2">{editors.material}</td>
      <td className="px-3 py-2">{editors.thickness}</td>
      <td className="px-3 py-2">{editors.quantity}</td>
      <td className="px-3 py-2">{editors.width}</td>
      <td className="px-3 py-2">{editors.length}</td>
      <td className="px-3 py-2 tabular-nums">{editors.unitArea}</td>
      <td className="px-3 py-2 tabular-nums">{editors.totalArea}</td>
      <td className="px-3 py-2 tabular-nums">{editors.unitWeight}</td>
      <td className="px-3 py-2 tabular-nums">{editors.totalWeight}</td>
      <td className="px-3 py-2">
        <RowActionIcons onDuplicate={onDuplicate} onDelete={onRequestDelete} />
      </td>
    </tr>
  );
}

function MaterialListMobileCard({
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
    <li className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {displayIndex}
          </span>
          <div className="min-w-0 space-y-1">
            {editors.status}
            <div className="font-medium">{editors.part}</div>
          </div>
        </div>
        <RowActionIcons onDuplicate={onDuplicate} onDelete={onRequestDelete} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">סוג חומר</div>
          {editors.material}
        </div>
        <div>
          <div className="text-muted-foreground">עובי</div>
          {editors.thickness}
        </div>
        <div>
          <div className="text-muted-foreground">כמות</div>
          {editors.quantity}
        </div>
        <div>
          <div className="text-muted-foreground">רוחב</div>
          {editors.width}
        </div>
        <div>
          <div className="text-muted-foreground">אורך</div>
          {editors.length}
        </div>
        <div>
          <div className="text-muted-foreground">שטח יחידה (מ&quot;ר)</div>
          <div>{editors.unitArea}</div>
        </div>
        <div>
          <div className="text-muted-foreground">שטח כללי (מ&quot;ר)</div>
          <div>{editors.totalArea}</div>
        </div>
        <div>
          <div className="text-muted-foreground">משקל יחידה (ק&quot;ג)</div>
          <div>{editors.unitWeight}</div>
        </div>
        <div>
          <div className="text-muted-foreground">משקל כללי (ק&quot;ג)</div>
          <div>{editors.totalWeight}</div>
        </div>
      </div>
    </li>
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
      <div className="space-y-4" dir="rtl">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">רשימת החומר מוכנה</CardTitle>
            <CardDescription>
              סידרנו את הנתונים שמצאנו בקובץ. בדוק את הרשימה והשלם פרטים חסרים לפני
              המעבר ל-DXF.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-2xl font-semibold">{summary.totalRows}</p>
                <p className="text-sm text-muted-foreground">פריטים</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{summary.knownUnits}</p>
                <p className="text-sm text-muted-foreground">יחידות</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{summary.completeRows}</p>
                <p className="text-sm text-muted-foreground">פריטים תקינים</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{summary.incompleteRows}</p>
                <p className="text-sm text-muted-foreground">נדרש השלמה</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap gap-2">
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
                    variant={filter === id ? "default" : "outline"}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="w-full sm:max-w-xs">
                <Label htmlFor="ml-search">חיפוש לפי חלק או פרופיל</Label>
                <Input
                  id="ml-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="חיפוש…"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-start">
                {MATERIAL_LIST_TABLE_HEADERS.map((h, i) => (
                  <th key={`h-${i}`} className="px-3 py-2 font-medium">
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
        </div>

        <ul className="space-y-3 md:hidden">
          {filtered.map((row, index) => (
            <MaterialListMobileCard
              key={row.rowId}
              row={row}
              displayIndex={index + 1}
              onDuplicate={() =>
                simpleIntakeActions.duplicateMaterialListRow(row.rowId)
              }
              onRequestDelete={() => setDeleteRowId(row.rowId)}
            />
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => simpleIntakeActions.backToFiles()}
          >
            חזרה לקבצים
          </Button>
          <Button type="button" size="lg" onClick={requestApprove}>
            אשר רשימה והמשך ל-DXF
          </Button>
        </div>

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
          <DialogContent className="sm:max-w-md" dir="rtl" showCloseButton={false}>
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
