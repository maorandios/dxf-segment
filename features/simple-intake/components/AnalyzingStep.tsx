"use client";

import { useEffect, useMemo, useState } from "react";
import { useSimpleIntakeSession } from "../useSimpleIntakeSession";
import {
  AgentActivityPanel,
  buildDxfActivitySteps,
  buildWorkbookActivitySteps,
} from "../ui";

export function AnalyzingStep() {
  const session = useSimpleIntakeSession();
  const isDxf = session.status === "DXF_PROCESSING";
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const startedMs = session.startedAt
      ? Date.parse(session.startedAt)
      : Date.now();
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    };
    const intervalId = window.setInterval(tick, 250);
    const timeoutId = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [session.startedAt]);

  const sheetCount = session.workbookSnapshot?.sheets.length ?? null;
  const populatedRows =
    session.workbookSnapshot?.sheets.reduce(
      (sum, s) => sum + (s.populatedRowCount ?? 0),
      0
    ) ?? null;
  const sourceType =
    session.workbookFile?.name?.toLowerCase().endsWith(".pdf")
      ? ("PDF" as const)
      : ("EXCEL" as const);
  const pdfPageCount =
    typeof session.lastDebug?.sourceDocument === "object" &&
    session.lastDebug?.sourceDocument &&
    "pdfPageCount" in (session.lastDebug.sourceDocument as object)
      ? ((session.lastDebug.sourceDocument as { pdfPageCount?: number | null })
          .pdfPageCount ?? null)
      : null;

  const steps = useMemo(() => {
    if (isDxf) {
      return buildDxfActivitySteps({
        analyzingLabel: session.analyzingLabel,
        elapsedSec,
        dxfFileCount: session.dxfFiles.length || session.dxfParts.length,
      });
    }
    return buildWorkbookActivitySteps({
      analyzingLabel: session.analyzingLabel,
      elapsedSec,
      sheetCount,
      populatedRows,
      sourceType,
      pdfPageCount,
    });
  }, [
    isDxf,
    session.analyzingLabel,
    elapsedSec,
    session.dxfFiles.length,
    session.dxfParts.length,
    sheetCount,
    populatedRows,
    sourceType,
    pdfPageCount,
  ]);

  return (
    <div className="flex min-h-[calc(100vh-11rem)] items-center justify-center py-10">
      <AgentActivityPanel
        title={isDxf ? "מחברים את קובצי ה-DXF" : "הפקת רשימת חומר מותאמת"}
        steps={steps}
      />
    </div>
  );
}
