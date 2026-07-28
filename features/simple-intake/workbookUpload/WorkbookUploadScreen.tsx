"use client";

/**
 * Material-list stage upload content (embedded in quote workspace shell).
 * Accepts Excel (.xlsx/.xls) or PDF (.pdf).
 */

import { useCallback, useState } from "react";
import { simpleIntakeActions } from "../sessionStore";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { validateMaterialSourceFile } from "../materialList/materialSourceTypes";
import { WorkbookUploadWorkspace } from "./WorkbookUploadWorkspace";

export function WorkbookUploadScreen() {
  const session = useSimpleIntakeSession();
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1040px] flex-1 flex-col">
      <WorkbookUploadWorkspace
        file={file}
        sheetCount={sheetCount}
        loading={loading}
        notice={notice}
        onPickFiles={onPickFiles}
        onRemove={() => applyFile(null)}
        onBack={() => simpleIntakeActions.backToDxfIntake()}
        onCreate={() => {
          setLoading(true);
          void simpleIntakeActions.analyze().finally(() => setLoading(false));
        }}
      />
    </div>
  );
}
