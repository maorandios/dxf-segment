"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { OmegaSideDrawer } from "../ui";

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

  const preview = useMemo(() => {
    try {
      return buildCompletionClipboardMessage(items, selectedIds);
    } catch {
      return "";
    }
  }, [items, selectedIds]);

  return (
    <OmegaSideDrawer
      open={open}
      onClose={onClose}
      wide
      title="בקשת השלמת נתונים"
      description="ריכזנו את הפרטים שחסרים כדי להשלים את התמחור."
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-start">
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
                const text = buildCompletionClipboardMessage(
                  items,
                  selectedIds
                );
                await copyTextToClipboard(text);
                setToast("ההודעה הועתקה");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "מכין..." : "העתק הודעה"}
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
                setToast("הקובץ הורד");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "מכין את הקובץ..." : "הורד קובץ להשלמה"}
          </Button>
        </div>
      }
    >
      <p
        className="mb-4 text-[13px]"
        style={{ color: "var(--ow-text-secondary)" }}
      >
        {actionable.length.toLocaleString("he-IL")} פריטים להשלמה ·{" "}
        {selectedIds.size.toLocaleString("he-IL")} נבחרו
      </p>

      <ul className="space-y-3 text-[13px]">
        {actionable.map((item, index) => {
          const checked = selectedIds.has(item.materialRowId);
          const issues = customerActionableIssues(item);
          return (
            <li
              key={item.materialRowId}
              className="rounded-[var(--ow-radius)] border p-3"
              style={{
                borderColor: "var(--ow-border)",
                backgroundColor: "var(--ow-surface-muted)",
              }}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => toggle(item.materialRowId)}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="font-medium"
                    style={{ color: "var(--ow-text)" }}
                  >
                    {index + 1}. {displayLabel(item.materialRow)}
                  </span>
                  <ul
                    className="mt-1 list-disc pr-4"
                    style={{ color: "var(--ow-text-muted)" }}
                  >
                    {issues.map((issue) =>
                      issue.kind === "DIMENSION_MISMATCH" ? (
                        <li key={issue.id}>
                          ברשימה מופיעות מידות{" "}
                          <span className="ow-ltr inline-block">
                            {issue.workbookDimsLabel ?? "—"}
                          </span>
                          <br />
                          בקובץ ה-DXF מופיעות מידות{" "}
                          <span className="ow-ltr inline-block">
                            {issue.dxfDimsLabel ?? "—"}
                          </span>
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
          <li style={{ color: "var(--ow-text-muted)" }}>
            אין פריטים להשלמה.
          </li>
        )}
      </ul>

      {preview && selectedIds.size > 0 && (
        <div className="mt-5 space-y-2">
          <p
            className="text-[12px] font-medium"
            style={{ color: "var(--ow-text-secondary)" }}
          >
            תצוגת הודעה
          </p>
          <pre
            className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--ow-radius)] border p-3 text-[12px] leading-relaxed"
            style={{
              backgroundColor: "var(--ow-surface)",
              borderColor: "var(--ow-border)",
              color: "var(--ow-text-secondary)",
            }}
            dir="rtl"
          >
            {preview}
          </pre>
        </div>
      )}

      {toast && (
        <p
          className="mt-3 rounded-[var(--ow-radius-sm)] px-3 py-2 text-[13px]"
          style={{
            backgroundColor: "var(--ow-success-soft)",
            color: "var(--ow-success)",
          }}
          role="status"
        >
          {toast}
        </p>
      )}
    </OmegaSideDrawer>
  );
}
