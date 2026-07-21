"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyTextToClipboard } from "@/lib/ai-intake/debug/copyTextToClipboard";
import { displayLabel } from "../materialList/completeness";
import type { MaterialListRow } from "../materialList/types";
import {
  buildCompletionClipboardMessage,
  buildCompletionWorkbook,
  customerActionableIssues,
  downloadBytes,
  type DxfLinkedMaterialItem,
} from "../dxfLink";

export function CompletionRequestDrawer({
  open,
  onClose,
  items,
  allMaterialRows,
  originalFilename,
}: {
  open: boolean;
  onClose: () => void;
  items: DxfLinkedMaterialItem[];
  allMaterialRows: MaterialListRow[];
  originalFilename: string;
}) {
  const actionable = useMemo(
    () =>
      items.filter(
        (i) =>
          i.finalStatus !== "EXCLUDED" && customerActionableIssues(i).length > 0
      ),
    [items]
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sync selection when opened / items change
  const selectedIds = useMemo(() => {
    if (selected.size === 0 && open && actionable.length > 0) {
      return new Set(actionable.map((i) => i.materialRowId));
    }
    return selected;
  }, [selected, open, actionable]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const base =
        prev.size === 0 && actionable.length > 0
          ? new Set(actionable.map((i) => i.materialRowId))
          : new Set(prev);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>בקשת השלמת נתונים</DialogTitle>
          <DialogDescription>
            ריכזנו את הפרטים שחסרים כדי להשלים את התמחור.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 text-sm">
          {actionable.map((item, index) => {
            const checked = selectedIds.has(item.materialRowId);
            const issues = customerActionableIssues(item);
            return (
              <li
                key={item.materialRowId}
                className="rounded-md border border-border p-3"
              >
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggle(item.materialRowId)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {index + 1}. {displayLabel(item.materialRow)}
                    </span>
                    <ul className="mt-1 list-disc pr-4 text-muted-foreground">
                      {issues.map((issue) =>
                        issue.kind === "DIMENSION_MISMATCH" ? (
                          <li key={issue.id}>
                            ברשימה מופיעות מידות {issue.workbookDimsLabel ?? "—"}
                            <br />
                            בקובץ ה-DXF מופיעות מידות {issue.dxfDimsLabel ?? "—"}
                            <br />
                            נא לאשר מהן המידות הנכונות
                          </li>
                        ) : (
                          <li key={issue.id}>{issue.messageHe}</li>
                        )
                      )}
                    </ul>
                  </span>
                </label>
              </li>
            );
          })}
          {actionable.length === 0 && (
            <li className="text-muted-foreground">אין פריטים להשלמה.</li>
          )}
        </ul>

        {toast && (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            {toast}
          </p>
        )}

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          <Button type="button" variant="outline" onClick={onClose}>
            סגור
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={selectedIds.size === 0 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const text = buildCompletionClipboardMessage(items, selectedIds);
                await copyTextToClipboard(text);
                setToast("ההודעה הועתקה");
              } finally {
                setBusy(false);
              }
            }}
          >
            העתק הודעה
          </Button>
          <Button
            type="button"
            disabled={selectedIds.size === 0 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const out = await buildCompletionWorkbook({
                  items,
                  selectedMaterialRowIds: selectedIds,
                  allMaterialRows,
                  originalFilename,
                });
                downloadBytes(out.filename, out.bytes);
              } finally {
                setBusy(false);
              }
            }}
          >
            הורד קובץ להשלמה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
