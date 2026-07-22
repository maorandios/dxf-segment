"use client";

/**
 * Material-list stage upload content (embedded in quote workspace shell).
 * Accepts Excel (.xlsx/.xls) or PDF (.pdf).
 */

import { useCallback, useRef, useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import {
  validateMaterialSourceFile,
} from "../materialList/materialSourceTypes";
import { WorkbookUploadWorkspace } from "./WorkbookUploadWorkspace";

export function WorkbookUploadScreen() {
  const session = useSimpleIntakeSession();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const file = session.workbookFile;
  const sheetCount = session.workbookSnapshot?.sheets.length ?? null;

  const applyFile = useCallback((f: File | null) => {
    if (!f) {
      simpleIntakeActions.setWorkbook(null);
      setNotice(null);
      return;
    }
    const validated = validateMaterialSourceFile(f);
    if (!validated.ok) {
      setNotice(validated.message);
      return;
    }
    simpleIntakeActions.setWorkbook(f);
    setNotice(null);
  }, []);

  const onPickFiles = useCallback(
    (files: File[]) => {
      const f = files[0];
      if (f) applyFile(f);
    },
    [applyFile]
  );

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col items-center justify-center gap-6 py-6">
      <header
        className="mx-auto flex w-full max-w-[720px] flex-col items-center"
        style={{ textAlign: "center" }}
      >
        <h2
          className="w-full text-center text-[26px] font-semibold tracking-tight sm:text-[28px]"
          style={{ color: "var(--ow-text, var(--us-text))", textAlign: "center" }}
        >
          העלאת רשימת חומר
        </h2>
        <p
          className="mx-auto mt-2 w-full max-w-[640px] text-center text-[14px] leading-relaxed"
          style={{
            color: "var(--ow-text-secondary, var(--us-text-secondary))",
            textAlign: "center",
          }}
        >
          העלה קובץ Excel או PDF שקיבלת מהלקוח. OMEGA תארגן את הנתונים לטבלה
          אחידה ומוכנה לבדיקה.
        </p>
      </header>

      <WorkbookUploadWorkspace
        file={file}
        sheetCount={sheetCount}
        loading={loading}
        notice={notice}
        onPickFiles={onPickFiles}
        onReplaceClick={() => replaceInputRef.current?.click()}
        onRemove={() => applyFile(null)}
        onCreate={() => {
          setLoading(true);
          void simpleIntakeActions.analyze().finally(() => setLoading(false));
        }}
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (f) applyFile(f);
        }}
      />
    </div>
  );
}
