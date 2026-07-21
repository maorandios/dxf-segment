"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import {
  FileUploadSurface,
  ScreenHeader,
  StickyActionBar,
  WorkflowNotice,
  formatFileSize,
} from "../ui";

function isDxfName(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function DxfUploadStage() {
  const session = useSimpleIntakeSession();
  const addMoreRef = useRef<HTMLInputElement>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canMatch = session.dxfFiles.length > 0 && !busy;

  const acceptFiles = (list: File[]) => {
    const nextNotices: string[] = [];
    const accepted: File[] = [];
    const existing = new Set(session.dxfFiles.map((f) => f.name));
    for (const f of list) {
      if (!isDxfName(f.name)) {
        nextNotices.push(`קובץ לא נתמך: ${f.name}`);
        continue;
      }
      if (existing.has(f.name)) {
        nextNotices.push(`שם כפול (דולג): ${f.name}`);
        continue;
      }
      accepted.push(f);
      existing.add(f.name);
    }
    if (accepted.length) {
      simpleIntakeActions.addDxfFiles(accepted);
    }
    setNotices(nextNotices);
  };

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-2">
        <ScreenHeader
          title="חיבור קובצי DXF"
          supportingText="העלה את קובצי הייצור כדי לחבר גאומטריה לפריטים ולחשב שטח ומשקל."
        />

        <WorkflowNotice
          severity="information"
          heading="להתאמה מדויקת מומלץ ששם קובץ ה-DXF יופיע ברשימת החומר."
          className="mb-5"
        >
          כאשר אין שם קובץ, OMEGA תנסה לבצע התאמה לפי הנתונים הקיימים.
        </WorkflowNotice>

        <p
          className="mb-3 text-[13px]"
          style={{ color: "var(--ow-text-muted)" }}
        >
          {session.materialListRows.length.toLocaleString("he-IL")} פריטים
          מאושרים
          {session.dxfFiles.length > 0
            ? ` · ${session.dxfFiles.length.toLocaleString("he-IL")} קבצים נבחרו`
            : null}
        </p>

        {session.dxfFiles.length === 0 ? (
          <FileUploadSurface
            accept=".dxf"
            multiple
            title="גרור קובצי DXF לכאן"
            subtitle="או בחר מספר קבצים מהמחשב"
            hint="קבצים נתמכים: .dxf"
            disabled={busy}
            onFiles={acceptFiles}
          />
        ) : (
          <div
            className="rounded-[var(--ow-radius-lg)] border p-4"
            style={{
              backgroundColor: "var(--ow-surface)",
              borderColor: "var(--ow-border)",
            }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p
                className="text-[14px] font-medium"
                style={{ color: "var(--ow-text)" }}
              >
                {session.dxfFiles.length.toLocaleString("he-IL")} קבצים
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => addMoreRef.current?.click()}
              >
                הוסף קבצים
              </Button>
              <input
                ref={addMoreRef}
                type="file"
                accept=".dxf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files
                    ? Array.from(e.target.files)
                    : [];
                  e.target.value = "";
                  acceptFiles(list);
                }}
              />
            </div>
            <ul className="max-h-64 space-y-1 overflow-auto">
              {session.dxfFiles.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between gap-2 rounded-[var(--ow-radius-sm)] px-2 py-1.5"
                  style={{ backgroundColor: "var(--ow-surface-muted)" }}
                >
                  <div className="min-w-0">
                    <p
                      className="ow-ltr truncate text-[13px]"
                      style={{ color: "var(--ow-text)" }}
                      title={f.name}
                    >
                      {f.name}
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--ow-text-muted)" }}
                    >
                      {formatFileSize(f.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`הסר ${f.name}`}
                    onClick={() => simpleIntakeActions.removeDxf(f.name)}
                  >
                    הסר
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {notices.length > 0 && (
          <div className="mt-4 space-y-2">
            {notices.map((n, i) => (
              <WorkflowNotice
                key={`${n}-${i}`}
                severity="recommendation"
                heading={n}
              />
            ))}
          </div>
        )}
      </div>

      <StickyActionBar
        statusText={
          session.dxfFiles.length > 0
            ? `${session.dxfFiles.length.toLocaleString("he-IL")} קבצים מוכנים להתאמה`
            : "העלה לפחות קובץ DXF אחד"
        }
        secondary={{
          label: "חזרה",
          onClick: () => simpleIntakeActions.backToMaterialList(),
          disabled: busy,
        }}
        primary={{
          label: busy ? "מחבר קבצים..." : "נתח והתאם קבצים",
          disabled: !canMatch,
          loading: busy,
          onClick: () => {
            setBusy(true);
            void simpleIntakeActions
              .runDxfStageFromApprovedList()
              .finally(() => setBusy(false));
          },
        }}
      />
    </div>
  );
}
