"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { simpleIntakeActions } from "../sessionStore";
import {
  MANUAL_CONFLICT_CONFIRM_HE,
  type SimpleResultRow,
  type SimpleResultRowStatus,
} from "../types";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";

const STATUS_HE: Record<SimpleResultRowStatus, string> = {
  READY: "מוכן",
  NEEDS_DXF: "נדרשת בחירת DXF",
  NO_DXF: "לא נמצא DXF",
  MISSING_DATA: "חסרים נתונים",
  INVALID_DXF: "DXF לא תקין",
  EXCLUDED: "הוחרג",
};

function displayValue(
  row: SimpleResultRow,
  key: keyof SimpleResultRow["edits"]
): string {
  const edited = row.edits[key];
  if (edited !== undefined) {
    return edited == null ? "—" : String(edited);
  }
  const v = row.extracted[key as keyof typeof row.extracted];
  return v == null || v === "" ? "—" : String(v);
}

function downloadDebug(debug: Record<string, unknown> | null): void {
  if (!debug) return;
  const blob = new Blob([JSON.stringify(debug, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `omega-simple-intake-debug-${debug.runId ?? "run"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReadyStep() {
  const session = useSimpleIntakeSession();
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<string | null>(null);

  const pickerRow = useMemo(
    () => session.resultRows.find((r) => r.resultRowId === pickerRowId) ?? null,
    [session.resultRows, pickerRowId]
  );
  const editRow = useMemo(
    () => session.resultRows.find((r) => r.resultRowId === editRowId) ?? null,
    [session.resultRows, editRowId]
  );

  const summary = session.localSummary;
  const unused = session.dxfParts.filter((d) =>
    session.dxfAvailability.some(
      (a) => a.dxfId === d.id && a.state === "UNUSED"
    )
  );
  const pendingAmbiguous = session.dxfAvailability.filter(
    (a) => a.state === "PENDING_AMBIGUOUS"
  );
  const invalidDxfs = session.dxfParts.filter(
    (d) => d.geometryStatus === "INVALID"
  );

  function trySelectDxf(resultRowId: string, dxfId: string | null): void {
    if (dxfId == null) {
      simpleIntakeActions.selectDxf(resultRowId, null);
      setPickerRowId(null);
      return;
    }
    const first = simpleIntakeActions.selectDxf(resultRowId, dxfId);
    if (first.conflict) {
      const ok = window.confirm(
        `${MANUAL_CONFLICT_CONFIRM_HE}\n(שורה ${first.occupyingSourceRow})`
      );
      if (!ok) return;
      simpleIntakeActions.selectDxf(resultRowId, dxfId, {
        forceReassign: true,
      });
    }
    setPickerRowId(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">טבלת תוצאות</CardTitle>
            <CardDescription>
              {session.workbookFile?.name} · {session.providerCallCount} קריאת
              AI
              {session.timing.matchingMs != null
                ? ` · התאמה ${session.timing.matchingMs}ms`
                : ""}
            </CardDescription>
            {session.hasCoverageWarnings && (
              <p className="mt-2 text-sm text-amber-200">
                חלק מהפריטים שזוהו באקסל לא חולצו — ראו את הסעיף למטה.
              </p>
            )}
            {summary && (
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                <li>שורות מחולצות: {summary.extractedRows}</li>
                <li>שורות מאומתות: {summary.validatedRows}</li>
                <li>מוכן: {summary.readyRows}</li>
                <li>עמום: {summary.ambiguousRows}</li>
                <li>ללא DXF: {summary.unmatchedRows}</li>
                <li>חסרים נתונים: {summary.missingDataRows}</li>
                <li>DXF בשימוש: {summary.usedDxfs}</li>
                <li>ממתינים לבחירה: {summary.pendingAmbiguousDxfs}</li>
                <li>
                  חסרים מחילוץ: {summary.missingFromExtractionDxfs}
                </li>
                <li>DXF לא מותאם: {summary.unusedDxfs}</li>
                <li>DXF לא תקין: {summary.invalidDxfs}</li>
                <li>
                  מזהים באקסל: {summary.exactIdsFoundInWorkbook}
                </li>
                <li>
                  מזהים שחולצו: {summary.exactIdsPresentInExtractedRows}
                </li>
                <li>
                  מזהים חסרים: {summary.exactIdsMissingFromExtraction}
                </li>
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => simpleIntakeActions.backToFiles()}
            >
              חזור לקבצים
            </Button>
            {session.hasCoverageWarnings && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void simpleIntakeActions.analyze()}
              >
                נסה ניתוח מחדש
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => downloadDebug(session.lastDebug)}
            >
              הורד JSON מפתחים
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-right text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">סטטוס</th>
                <th className="px-2 py-2 font-medium">שורה</th>
                <th className="px-2 py-2 font-medium">מק״ט</th>
                <th className="px-2 py-2 font-medium">פרופיל/תיאור</th>
                <th className="px-2 py-2 font-medium">כמות</th>
                <th className="px-2 py-2 font-medium">חומר</th>
                <th className="px-2 py-2 font-medium">עובי</th>
                <th className="px-2 py-2 font-medium">רוחב</th>
                <th className="px-2 py-2 font-medium">אורך</th>
                <th className="px-2 py-2 font-medium">משקל מקור</th>
                <th className="px-2 py-2 font-medium">DXF</th>
                <th className="px-2 py-2 font-medium">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {session.resultRows.map((row) => {
                const dxf = session.dxfParts.find(
                  (d) => d.id === row.match.matchedDxfId
                );
                const profile =
                  row.extracted.profile ?? row.extracted.description ?? "—";
                return (
                  <tr
                    key={row.resultRowId}
                    className="border-b border-white/5 align-top"
                  >
                    <td className="px-2 py-2">{STATUS_HE[row.status]}</td>
                    <td className="px-2 py-2">
                      {row.extracted.sheetName}:{row.extracted.sourceRow}
                    </td>
                    <td className="px-2 py-2">{displayValue(row, "partId")}</td>
                    <td
                      className="max-w-[160px] truncate px-2 py-2"
                      title={profile}
                    >
                      {profile}
                    </td>
                    <td className="px-2 py-2">{displayValue(row, "quantity")}</td>
                    <td className="px-2 py-2">{displayValue(row, "material")}</td>
                    <td className="px-2 py-2">
                      {displayValue(row, "thicknessMm")}
                    </td>
                    <td className="px-2 py-2">{displayValue(row, "widthMm")}</td>
                    <td className="px-2 py-2">{displayValue(row, "lengthMm")}</td>
                    <td className="px-2 py-2">
                      {row.extracted.sourceWeightKg ?? "—"}
                    </td>
                    <td className="px-2 py-2">{dxf?.filename ?? "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPickerRowId(row.resultRowId)}
                        >
                          {row.match.matchedDxfId ? "שנה DXF" : "בחר DXF"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditRowId(row.resultRowId)}
                        >
                          ערוך
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            simpleIntakeActions.excludeRow(
                              row.resultRowId,
                              !row.excluded
                            )
                          }
                        >
                          {row.excluded ? "כלול" : "החרג"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">קובצי DXF שלא הותאמו</CardTitle>
          <CardDescription>
            קבצים תקינים שאינם בשימוש ואינם ממתינים לבחירה או חסרים מחילוץ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unused.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין קבצים לא מותאמים</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {unused.map((d) => (
                <li key={d.id}>
                  {d.filename}
                  {d.widthMm != null && d.lengthMm != null
                    ? ` · ${d.widthMm}×${d.lengthMm} מ״מ`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {session.coverageIssues.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              פריטים שנמצאו באקסל אך לא חולצו
            </CardTitle>
            <CardDescription>
              מזהי DXF שמופיעים באקסל אך לא הוחזרו בתוצאת ה-AI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.coverageIssues.map((issue, idx) => (
              <div
                key={`${issue.normalizedPartId}-${issue.sourceRow}-${idx}`}
                className="rounded-md border border-white/10 p-3 text-sm"
              >
                <p className="font-medium">{issue.originalPartId}</p>
                <p className="text-xs text-muted-foreground">
                  {issue.sheetName} · שורה {issue.sourceRow} ·{" "}
                  {issue.cellAddress}
                </p>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {issue.sourceText}
                </p>
                <p className="mt-1 text-amber-200">{issue.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      simpleIntakeActions.addManualRowFromCoverage(issue)
                    }
                  >
                    הוסף שורה ידנית
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingAmbiguous.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">ממתינים לבחירה</CardTitle>
            <CardDescription>
              מועמדים בשורות עמומות — לא יופיעו ברשימת הלא-מותאמים
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {pendingAmbiguous.map((a) => {
                const dxf = session.dxfParts.find((d) => d.id === a.dxfId);
                const related = session.resultRows.filter((r) =>
                  a.relatedRowIds.includes(r.extracted.rowId)
                );
                return (
                  <li key={a.dxfId}>
                    {dxf?.filename ?? a.dxfId}
                    {related.length > 0
                      ? ` · שורות: ${related
                          .map((r) => r.extracted.sourceRow)
                          .join(", ")}`
                      : ""}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {invalidDxfs.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">קובצי DXF עם שגיאה</CardTitle>
            <CardDescription>נכשלו בקריאה מקומית או בגיאומטריה</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {invalidDxfs.map((d) => (
                <li key={d.id}>
                  {d.filename}
                  {d.error ? ` · ${d.error}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {editRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="עריכת שורה"
        >
          <Card className="w-full max-w-md border shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">עריכת ערכים</CardTitle>
              <CardDescription>
                שורה {editRow.extracted.sourceRow}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  ["partId", "מק״ט"],
                  ["quantity", "כמות"],
                  ["material", "חומר"],
                  ["thicknessMm", "עובי"],
                  ["widthMm", "רוחב"],
                  ["lengthMm", "אורך"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-transparent px-2 py-1.5"
                    defaultValue={displayValue(editRow, key).replace("—", "")}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (key === "partId" || key === "material") {
                        simpleIntakeActions.updateRowEdits(editRow.resultRowId, {
                          [key]: raw === "" ? null : raw,
                        });
                        return;
                      }
                      const num = raw === "" ? null : Number(raw);
                      simpleIntakeActions.updateRowEdits(editRow.resultRowId, {
                        [key]:
                          num == null || Number.isNaN(num) ? null : num,
                      });
                    }}
                  />
                </label>
              ))}
              <div className="flex justify-end pt-2">
                <Button type="button" onClick={() => setEditRowId(null)}>
                  סגור
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {pickerRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="בחירת DXF"
        >
          <Card className="max-h-[80vh] w-full max-w-lg overflow-auto border shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">בחירת DXF</CardTitle>
              <CardDescription>
                שורה {pickerRow.extracted.sourceRow}
                {pickerRow.match.candidates.length > 0
                  ? " · מועמדים מוצעים"
                  : " · כל הקבצים הזמינים"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(pickerRow.match.candidates.length > 0
                ? pickerRow.match.candidates.map((c) => ({
                    id: c.dxfId,
                    label: `${c.filename} (${c.partId})`,
                  }))
                : session.dxfParts
                    .filter((d) => d.geometryStatus === "VALID")
                    .map((d) => ({
                      id: d.id,
                      label: `${d.filename} (${d.partId})`,
                    }))
              ).map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => trySelectDxf(pickerRow.resultRowId, opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
              <div className="flex justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => trySelectDxf(pickerRow.resultRowId, null)}
                >
                  נקה בחירה
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerRowId(null)}
                >
                  סגור
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
