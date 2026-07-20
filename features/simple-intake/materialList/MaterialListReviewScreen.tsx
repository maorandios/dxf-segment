"use client";

import { useMemo, useState } from "react";
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
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { ApproveWithMissingDialog } from "./ApproveWithMissingDialog";
import {
  displayLabel,
  effectiveMaterialFields,
  missingFieldsMessageHe,
  provenanceLabelHe,
  summarizeMaterialList,
} from "./completeness";
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

function EditableNumber({
  label,
  value,
  onSave,
  integer,
  missing,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
  integer?: boolean;
  missing: boolean;
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
        {value == null || (typeof value === "number" && value <= 0) ? (
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
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  missing?: boolean;
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
        {!value?.trim() ? (
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

export function MaterialListReviewScreen() {
  const session = useSimpleIntakeSession();
  const rows = session.materialListRows;
  const [filter, setFilter] = useState<FilterId>("ALL");
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sourceRowId, setSourceRowId] = useState<string | null>(null);

  const summary = useMemo(() => summarizeMaterialList(rows), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "COMPLETE" && r.approvalStatus !== "COMPLETE") return false;
      if (
        filter === "INCOMPLETE" &&
        r.approvalStatus === "COMPLETE"
      )
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

  const sourceExcerpt = useMemo(() => {
    if (!sourceRowId || !session.workbookSnapshot) return null;
    const row = rows.find((r) => r.rowId === sourceRowId);
    if (!row || row.sheetName == null || row.sourceRow == null) return null;
    const sheet = session.workbookSnapshot.sheets.find(
      (s) => s.sheetName === row.sheetName
    );
    const snapRow = sheet?.rows.find((r) => r.rowNumber === row.sourceRow);
    return { row, cells: snapRow?.cells ?? [] };
  }, [sourceRowId, rows, session.workbookSnapshot]);

  const unitsText = summary.unitsComplete
    ? `${summary.totalUnits} יחידות`
    : `לפחות ${summary.knownUnits} יחידות`;

  const requestApprove = () => {
    if (summary.incompleteRows > 0) {
      setConfirmOpen(true);
      return;
    }
    simpleIntakeActions.approveMaterialList({ allowMissing: false });
  };

  return (
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
              <p className="text-sm text-muted-foreground">שורות חומר</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{summary.completeRows}</p>
              <p className="text-sm text-muted-foreground">שורות מלאות</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{summary.incompleteRows}</p>
              <p className="text-sm text-muted-foreground">דורשות השלמה</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{unitsText}</p>
              <p className="text-sm text-muted-foreground">
                {summary.unitsComplete ? "סה״כ יחידות" : "יחידות ידועות"}
              </p>
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

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-start">
              {MATERIAL_LIST_TABLE_HEADERS.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const e = effectiveMaterialFields(row);
              const msg = missingFieldsMessageHe(row);
              return (
                <tr key={row.rowId} className="border-b align-top">
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <span>{statusLabelHe(row)}</span>
                      {msg && (
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          {msg}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
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
                  </td>
                  <td className="px-3 py-2">
                    <EditableText
                      label="חומר"
                      value={e.material}
                      missing
                      onSave={(v) =>
                        applyOverride(row.rowId, { material: v })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableNumber
                      label="עובי"
                      value={e.thicknessMm}
                      missing={!e.thicknessMm || e.thicknessMm <= 0}
                      onSave={(v) =>
                        applyOverride(row.rowId, { thicknessMm: v })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableNumber
                      label="כמות"
                      value={e.quantity}
                      integer
                      missing={!e.quantity || e.quantity <= 0}
                      onSave={(v) =>
                        applyOverride(row.rowId, { quantity: v })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableNumber
                      label="רוחב"
                      value={e.widthMm}
                      missing={!e.widthMm || e.widthMm <= 0}
                      onSave={(v) => applyOverride(row.rowId, { widthMm: v })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableNumber
                      label="אורך"
                      value={e.lengthMm}
                      missing={!e.lengthMm || e.lengthMm <= 0}
                      onSave={(v) => applyOverride(row.rowId, { lengthMm: v })}
                    />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {provenanceLabelHe(row)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSourceRowId(row.rowId)}
                    >
                      מקור
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

      {sourceExcerpt && (
        <Dialogish
          title="שורת מקור"
          onClose={() => setSourceRowId(null)}
        >
          <p className="mb-2 text-sm text-muted-foreground">
            {provenanceLabelHe(sourceExcerpt.row)}
          </p>
          {sourceExcerpt.cells.length === 0 ? (
            <p className="text-sm">אין קטע מקור זמין מה-snapshot המקומי.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">
              {sourceExcerpt.cells.map((c) => (
                <li key={c.address}>
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.address}
                  </span>
                  {": "}
                  {c.text}
                </li>
              ))}
            </ul>
          )}
        </Dialogish>
      )}
    </div>
  );
}

function Dialogish({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div className="w-full max-w-lg rounded-lg bg-background p-4 shadow-lg" dir="rtl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            סגור
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
