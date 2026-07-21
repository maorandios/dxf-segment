"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinalIntakeRow, FinalIssueCode } from "../results/types";
import {
  categoryTitleHe,
  type ReadinessCategoryId,
} from "./categorizeReadinessIssues";
import {
  makeDeferredKey,
  type DeferredIssueKey,
} from "./issuePresentation";
import {
  deferredCodesForRow,
  pickPrimaryIssueCode,
} from "./pickPrimaryIssue";
import {
  ReadinessIssueCard,
  type IssueCardHandlers,
} from "./ReadinessIssueCard";

export function ReadinessIssueList({
  category,
  rows,
  deferredIssueKeys,
  onBackToSummary,
  onContinueToTable,
  onTreatOtherIssues,
  hasOtherIssues,
  handlers,
}: {
  category: ReadinessCategoryId;
  rows: FinalIntakeRow[];
  deferredIssueKeys: ReadonlySet<DeferredIssueKey>;
  onBackToSummary: () => void;
  onContinueToTable: () => void;
  onTreatOtherIssues: () => void;
  hasOtherIssues: boolean;
  handlers: IssueCardHandlers;
}) {
  const [showDeferred, setShowDeferred] = useState(false);
  const topUploadRef = useRef<HTMLInputElement>(null);

  const activeItems = useMemo(() => {
    const items: Array<{ row: FinalIntakeRow; issue: FinalIssueCode }> = [];
    for (const row of rows) {
      const primary = pickPrimaryIssueCode(row, deferredIssueKeys);
      if (primary) items.push({ row, issue: primary });
    }
    return items;
  }, [rows, deferredIssueKeys]);

  const deferredItems = useMemo(() => {
    const items: Array<{ row: FinalIntakeRow; issue: FinalIssueCode }> = [];
    for (const row of rows) {
      for (const issue of deferredCodesForRow(row, deferredIssueKeys)) {
        items.push({ row, issue });
      }
    }
    return items;
  }, [rows, deferredIssueKeys]);

  const showTopUpload =
    category === "MISSING_DXF" ||
    category === "MULTIPLE_DXF" ||
    category === "INVALID_DXF";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBackToSummary}>
          חזרה לסיכום
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onContinueToTable}
        >
          המשך לטבלה
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-lg">
            {categoryTitleHe(category, rows)}
          </CardTitle>
          {showTopUpload && (
            <>
              <input
                ref={topUploadRef}
                type="file"
                accept=".dxf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handlers.onUploadDxfs(e.target.files);
                  }
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => topUploadRef.current?.click()}
              >
                העלה קובצי DXF נוספים
              </Button>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">לטיפול עכשיו</h3>
            {activeItems.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>אין שורות לטיפול עכשיו בקבוצה זו.</p>
                <div className="flex flex-col gap-2">
                  {hasOtherIssues ? (
                    <Button type="button" onClick={onTreatOtherIssues}>
                      טפל בבעיות נוספות
                    </Button>
                  ) : (
                    <Button type="button" onClick={onContinueToTable}>
                      המשך לטבלה
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {activeItems.map(({ row, issue }) => (
                  <ReadinessIssueCard
                    key={`${row.id}:${issue}`}
                    row={row}
                    issue={issue}
                    mode="active"
                    handlers={handlers}
                  />
                ))}
              </ul>
            )}
          </section>

          {deferredItems.length > 0 && (
            <section className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">טופל אחר כך</h3>
              <p className="text-sm text-muted-foreground">
                {deferredItems.length} בעיות נדחו לטיפול מאוחר יותר
              </p>
              {!showDeferred ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeferred(true)}
                >
                  הצג בעיות שנדחו
                </Button>
              ) : (
                <ul className="space-y-3">
                  {deferredItems.map(({ row, issue }) => (
                    <ReadinessIssueCard
                      key={`def:${row.id}:${issue}`}
                      row={row}
                      issue={issue}
                      mode="deferred"
                      handlers={handlers}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Helper exported for tests / pruning callers. */
export { makeDeferredKey };
