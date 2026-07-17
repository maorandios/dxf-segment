/**
 * Adapter: Quote Workspace → existing AI Intake engine.
 * Does not duplicate DXF/workbook/matching/mass/Review logic.
 * Does not send DXF bytes to OpenAI.
 */

import { buildSlimRegistryForAi } from "@/lib/ai-intake/slimRegistry";
import { reconcileFinalMapping } from "@/lib/ai-intake/reconcileFinalMapping";
import { buildReviewSession } from "@/lib/ai-intake/review/buildReviewSession";
import { applyGeometryCorrelation } from "@/lib/ai-intake/dxf/geometry-correlation";
import type { AiIntakeAnalyzeResponse, AiIntakeAnalyzeSuccess } from "@/lib/ai-intake/schemas";
import type { DxfPartRegistryItem } from "@/lib/ai-intake/types";
import {
  runLocalDxfRegistry,
  type LocalDxfRegistryProgress,
} from "@/features/ai-intake-lab/lib/runLocalDxfRegistry";
import type { QuoteSession, QuoteSource } from "../types";
import { quoteSessionActions } from "../quoteSessionStore";

export type QuoteIntakeProgressPhase =
  | "reading_files"
  | "identifying_parts"
  | "matching_dxf"
  | "comparing_sources"
  | "building_table";

const PHASE_LABELS: Record<QuoteIntakeProgressPhase, string> = {
  reading_files: "קורא את הקבצים",
  identifying_parts: "מזהה חלקים",
  matching_dxf: "מתאים קובצי DXF",
  comparing_sources: "משווה בין המקורות",
  building_table: "בונה את טבלת ההצעה",
};

function mapRegistryProgress(
  p: LocalDxfRegistryProgress
): QuoteIntakeProgressPhase {
  if (p.phase === "reading" || p.phase === "geometry") return "reading_files";
  if (p.phase === "building") return "identifying_parts";
  if (p.phase === "duplicates") return "matching_dxf";
  return "identifying_parts";
}

export type RunQuoteIntakeAnalysisResult = {
  ok: true;
  analyze: AiIntakeAnalyzeSuccess;
  reviewSession: ReturnType<typeof buildReviewSession>;
  dxfRegistry: DxfPartRegistryItem[];
} | {
  ok: false;
  errorHe: string;
};

/**
 * Run the existing intake pipeline once for the quote session sources.
 */
export async function runQuoteIntakeAnalysis(args: {
  quoteSession: QuoteSession;
  sources: QuoteSource[];
  onProgress?: (phase: QuoteIntakeProgressPhase, label: string) => void;
}): Promise<RunQuoteIntakeAnalysisResult> {
  const report = (
    phase: QuoteIntakeProgressPhase
  ): void => {
    const label = PHASE_LABELS[phase];
    args.onProgress?.(phase, label);
    quoteSessionActions.setAnalysisProgress(label);
  };

  const ready = args.sources.filter((s) => s.status === "READY" || s.status === "PROCESSING");
  const dxfFiles = ready
    .filter((s) => s.kind === "DXF")
    .map((s) => s.file);
  const docFiles = ready
    .filter((s) => s.kind === "XLS" || s.kind === "XLSX" || s.kind === "PDF")
    .map((s) => s.file);

  report("reading_files");

  let dxfRegistry: DxfPartRegistryItem[] = [];
  try {
    if (dxfFiles.length > 0) {
      const { items } = await runLocalDxfRegistry(dxfFiles, (p) => {
        const phase = mapRegistryProgress(p);
        report(phase);
      });
      dxfRegistry = items;
    }

    report("matching_dxf");
    const slim = buildSlimRegistryForAi(dxfRegistry);

    // Engine requires a valid slim registry today (same contract as lab).
    if (slim.length === 0) {
      return {
        ok: false,
        errorHe:
          "לא נמצאו קובצי DXF תקינים לזיהוי חלקים. הוסיפו לפחות קובץ DXF אחד תקין ונסו שוב.",
      };
    }

    report("comparing_sources");

    const form = new FormData();
    form.set(
      "sender",
      `quote-workspace@${args.quoteSession.quoteId}.local`
    );
    form.set(
      "subject",
      `הצעת מחיר: ${args.quoteSession.details.projectName}`
    );
    form.set(
      "body",
      [
        `פרויקט: ${args.quoteSession.details.projectName}`,
        `לקוח: ${args.quoteSession.details.customerName}`,
        "",
        "ניתוח חומר דרך סביבת הצעת המחיר.",
      ].join("\n")
    );
    form.set("registryJson", JSON.stringify(slim));
    for (const file of docFiles) {
      form.append("documents", file, file.name);
    }

    const res = await fetch("/api/ai-intake/analyze", {
      method: "POST",
      body: form,
    });

    report("building_table");

    const data = (await res.json()) as AiIntakeAnalyzeResponse;
    if (!data.ok) {
      return {
        ok: false,
        errorHe: data.messageHe || "לא הצלחנו להשלים את ניתוח החומר",
      };
    }

    const analyze = data as AiIntakeAnalyzeSuccess;

    // Geometry correlation uses full DXF registry (never before geometry exists).
    const correlated = applyGeometryCorrelation({
      documentRows: analyze.extraction.documentRows,
      registry: dxfRegistry,
      tableId: args.quoteSession.quoteId,
    });

    const { rows: finalRows } = reconcileFinalMapping({
      registry: dxfRegistry,
      acceptedFacts: analyze.acceptedFacts,
      unresolvedItems: analyze.extraction.unresolvedItems,
      documentRows: correlated.documentRows,
    });

    const withFinals: AiIntakeAnalyzeSuccess = {
      ...analyze,
      extraction: {
        ...analyze.extraction,
        documentRows: correlated.documentRows,
      },
      finalRows,
      warnings: [
        ...analyze.warnings,
        `GEOMETRY_CORRELATION:exact=${correlated.diagnostics.exactMatchCount}`,
        `GEOMETRY_CORRELATION:geometry=${correlated.diagnostics.geometryFallbackCount}`,
        `GEOMETRY_CORRELATION:ambiguous=${correlated.diagnostics.ambiguousCount}`,
      ],
    };

    const reviewSession = buildReviewSession(withFinals, {
      registry: dxfRegistry,
      analysisRunId: args.quoteSession.quoteId,
    });

    return {
      ok: true,
      analyze: withFinals,
      reviewSession,
      dxfRegistry,
    };
  } catch (err) {
    console.error("[quote-workspace] analysis failed", err);
    return {
      ok: false,
      errorHe: "לא הצלחנו להשלים את ניתוח החומר. נסו שוב או בדקו את הקבצים.",
    };
  }
}
