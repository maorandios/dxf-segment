/**
 * Simple Intake workbook extraction provider selection.
 */

export type SimpleWorkbookExtractionProvider = "openai" | "llama-extract";

export function getSimpleWorkbookExtractionProvider(): SimpleWorkbookExtractionProvider {
  const raw = (process.env.SIMPLE_INTAKE_EXTRACTION_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();
  if (raw === "llama-extract" || raw === "llama_extract" || raw === "llama") {
    return "llama-extract";
  }
  return "openai";
}

export type ExtractionProviderResult = {
  /** Compatible AI workbook result for existing validation path. */
  result: {
    status: "SUCCESS" | "NO_RELEVANT_ROWS" | "UNSUPPORTED";
    summary: string;
    rows: Array<Record<string, unknown>>;
    warnings: string[];
  };
  providerCallCount: number;
  model: string | null;
  usage: Record<string, unknown> | null;
  extractionProviderDebug: Record<string, unknown>;
  durationMs: number;
};
