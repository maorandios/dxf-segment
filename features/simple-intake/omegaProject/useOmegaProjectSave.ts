"use client";

/**
 * Hook wiring the "save quotation to .omega file" button: busy/error/success
 * label state around `saveOmegaProjectFile`. Does not touch any browser
 * storage — success just means the download/File System Access save
 * completed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import { saveOmegaProjectFile } from "./saveOmegaProjectFile";

const LABEL_IDLE = "שמור הצעה";
const LABEL_BUSY = "שומר...";
const LABEL_SUCCESS = "קובץ ההצעה מוכן";
const ERROR_MESSAGE = "לא ניתן היה לשמור את ההצעה. נסה שוב.";

const SUCCESS_FLASH_MS = 2500;

export type UseOmegaProjectSaveResult = {
  saveLabel: string;
  saveBusy: boolean;
  saveError: string | null;
  saveSuccessFlash: boolean;
  saveProject: () => Promise<void>;
};

export function useOmegaProjectSave(): UseOmegaProjectSaveResult {
  const session = useSimpleIntakeSession();
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessFlash, setSaveSuccessFlash] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  const saveProject = useCallback(async (): Promise<void> => {
    if (saveBusy) return;
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    setSaveBusy(true);
    setSaveError(null);
    setSaveSuccessFlash(false);
    try {
      const result = await saveOmegaProjectFile(session);
      if (!result.ok) {
        setSaveError(ERROR_MESSAGE);
        return;
      }
      setSaveSuccessFlash(true);
      flashTimeoutRef.current = setTimeout(() => {
        setSaveSuccessFlash(false);
      }, SUCCESS_FLASH_MS);
    } catch {
      setSaveError(ERROR_MESSAGE);
    } finally {
      setSaveBusy(false);
    }
  }, [saveBusy, session]);

  const saveLabel = saveBusy
    ? LABEL_BUSY
    : saveSuccessFlash
      ? LABEL_SUCCESS
      : LABEL_IDLE;

  return { saveLabel, saveBusy, saveError, saveSuccessFlash, saveProject };
}
