"use client";

import { useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { DxfUploadWorkspace } from "../dxfUpload";

function isDxfName(name: string): boolean {
  return name.toLowerCase().endsWith(".dxf");
}

export function DxfUploadStage() {
  const session = useSimpleIntakeSession();
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const hasMaterialRows = session.materialListRows.length > 0;
  const isDxfFirst = !hasMaterialRows;

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1040px] flex-1 flex-col">
      <DxfUploadWorkspace
        files={session.dxfFiles}
        materialRowCount={session.materialListRows.length}
        busy={busy}
        isDxfFirst={isDxfFirst}
        notices={notices}
        onPickFiles={acceptFiles}
        onRemove={(name) => simpleIntakeActions.removeDxf(name)}
        onClearAll={() => {
          simpleIntakeActions.clearDxfFiles();
          setNotices([]);
        }}
        onBack={
          hasMaterialRows
            ? () => simpleIntakeActions.backToMaterialList()
            : undefined
        }
        onContinue={() => {
          setBusy(true);
          void (
            isDxfFirst
              ? simpleIntakeActions.completeDxfIntake()
              : simpleIntakeActions.runDxfStageFromApprovedList()
          ).finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
