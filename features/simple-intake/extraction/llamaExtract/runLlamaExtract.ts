/**
 * Run LlamaExtract v2 on an original workbook file (server-only).
 *
 * Dense Excel files may be split into mechanical row chunks because LlamaExtract
 * refuses >100 tabular entities per page (TABULAR_MAX_ITEMS_PER_PAGE).
 */

import { LlamaCloud, toFile } from "@llamaindex/llama-cloud";
import type { ExtractionProviderResult } from "../types";
import { adaptLlamaExtractRows } from "./adaptLlamaExtractRows";
import {
  isTabularMaxItemsError,
  planLlamaWorkbookChunks,
  remapDenseExtractResult,
  type LlamaWorkbookChunk,
} from "./chunkWorkbookForLlamaExtract";
import {
  buildLlamaDataSchema,
  LLAMA_EXTRACT_SYSTEM_PROMPT,
} from "./schema";

const HEBREW_FAIL =
  "לא הצלחנו לקרוא את קובץ האקסל. נסה שוב או העלה קובץ אחר.";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LlamaExtractError extends Error {
  code: string;
  debug: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    debug: Record<string, unknown> = {}
  ) {
    super(message);
    this.code = code;
    this.debug = debug;
  }
}

function mergeExtractResults(parts: unknown[]): unknown {
  const entities: unknown[] = [];
  for (const part of parts) {
    if (part == null) continue;
    if (Array.isArray(part)) {
      entities.push(...part);
      continue;
    }
    if (typeof part === "object") {
      const obj = part as Record<string, unknown>;
      for (const key of ["rows", "items", "entities", "data"]) {
        if (Array.isArray(obj[key])) {
          entities.push(...(obj[key] as unknown[]));
          break;
        }
      }
      if (
        entities.length === 0 &&
        ("profile" in obj || "quantity" in obj || "sourceRow" in obj)
      ) {
        entities.push(obj);
      }
    }
  }
  return entities;
}

type ChunkJobResult = {
  chunkIndex: number;
  filename: string;
  jobId: string | null;
  fileId: string | null;
  status: string;
  estimatedContentRows: number;
  entityCount: number;
  error_message: string | null;
  extractResult: unknown;
  extractMetadata: unknown;
  usage: unknown;
  uploadMs: number;
  createMs: number;
  pollMs: number;
  pollCount: number;
};

async function runOneChunk(args: {
  client: LlamaCloud;
  chunk: LlamaWorkbookChunk;
  dataSchema: Record<string, unknown>;
  tier: "agentic" | "cost_effective";
  pinnedVersion: string;
  pollIntervalMs: number;
  timeoutMs: number;
}): Promise<ChunkJobResult> {
  const { client, chunk, dataSchema, tier, pinnedVersion, pollIntervalMs, timeoutMs } =
    args;

  let fileId: string | null = null;
  let jobId: string | null = null;
  let pollCount = 0;

  try {
    const tUpload = Date.now();
    const uploadable = await toFile(chunk.bytes, chunk.filename);
    const uploaded = await client.files.create({
      file: uploadable,
      purpose: "extract",
    });
    fileId = uploaded.id;
    const uploadMs = Date.now() - tUpload;

    const tCreate = Date.now();
    const job = await client.extract.create({
      file_input: fileId,
      configuration: {
        data_schema: dataSchema as {
          [key: string]:
            | string
            | number
            | boolean
            | unknown[]
            | { [key: string]: unknown }
            | null;
        },
        extraction_target: "per_table_row",
        tier,
        version: pinnedVersion,
        system_prompt: LLAMA_EXTRACT_SYSTEM_PROMPT,
        cite_sources: true,
        confidence_scores: true,
      },
    });
    jobId = job.id;
    const createMs = Date.now() - tCreate;

    const tPoll = Date.now();
    let completed = job;
    while (true) {
      pollCount++;
      completed = await client.extract.get(jobId, {
        expand: ["extract_metadata", "configuration"],
      });
      const status = String(completed.status ?? "").toUpperCase();
      if (status === "COMPLETED") {
        const rawExtract = completed.extract_result ?? null;
        const extractResult = remapDenseExtractResult(rawExtract, chunk.rowRefs);
        const entityCount = Array.isArray(extractResult)
          ? extractResult.length
          : extractResult == null
            ? 0
            : 1;
        return {
          chunkIndex: chunk.chunkIndex,
          filename: chunk.filename,
          jobId,
          fileId,
          status: completed.status,
          estimatedContentRows: chunk.estimatedContentRows,
          entityCount,
          error_message: null,
          extractResult,
          extractMetadata: completed.extract_metadata ?? null,
          usage:
            (completed.metadata as { usage?: unknown } | null)?.usage ?? null,
          uploadMs,
          createMs,
          pollMs: Date.now() - tPoll,
          pollCount,
        };
      }
      if (status === "FAILED") {
        throw new LlamaExtractError("LLAMA_JOB_FAILED", HEBREW_FAIL, {
          reason: "FAILED",
          error_message: completed.error_message ?? null,
          jobId,
          chunkIndex: chunk.chunkIndex,
          chunkFilename: chunk.filename,
        });
      }
      if (status === "CANCELLED") {
        throw new LlamaExtractError("LLAMA_JOB_CANCELLED", HEBREW_FAIL, {
          reason: "CANCELLED",
          jobId,
          chunkIndex: chunk.chunkIndex,
        });
      }
      if (Date.now() - tPoll > timeoutMs) {
        throw new LlamaExtractError("LLAMA_POLL_TIMEOUT", HEBREW_FAIL, {
          reason: "TIMEOUT",
          pollCount,
          jobId,
          chunkIndex: chunk.chunkIndex,
        });
      }
      await sleep(pollIntervalMs);
    }
  } finally {
    if (fileId) {
      try {
        await client.files.delete(fileId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "file_delete_failed";
        console.warn(
          "[simple-intake] Llama file cleanup failed:",
          msg,
          "chunk",
          chunk.chunkIndex
        );
      }
    }
  }
}

export async function runLlamaExtractWorkbook(args: {
  workbookBytes: Buffer;
  filename: string;
}): Promise<ExtractionProviderResult> {
  const started = Date.now();
  const apiKey = process.env.LLAMA_CLOUD_API_KEY?.trim();
  if (!apiKey) {
    throw new LlamaExtractError("MISSING_LLAMA_API_KEY", HEBREW_FAIL, {
      reason: "MISSING_LLAMA_API_KEY",
    });
  }

  const tierRaw = (process.env.LLAMA_EXTRACT_TIER ?? "agentic").trim();
  const tier =
    tierRaw === "cost_effective" ? "cost_effective" : "agentic";
  const pinnedVersion =
    process.env.LLAMA_EXTRACT_VERSION?.trim() || "2026-03-31";
  const pollIntervalMs = envInt("LLAMA_EXTRACT_POLL_INTERVAL_MS", 2000);
  const timeoutMs = envInt("LLAMA_EXTRACT_TIMEOUT_MS", 240_000);

  const client = new LlamaCloud({ apiKey });
  let llamaUploadMs = 0;
  let llamaExtractionMs = 0;
  let llamaPollingMs = 0;
  let llamaNormalizationMs: number | null = null;
  const cleanupError: string | null = null;
  const chunkJobs: ChunkJobResult[] = [];

  try {
    const lower = args.filename.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      throw new LlamaExtractError("UNSUPPORTED_WORKBOOK", HEBREW_FAIL, {
        reason: "UNSUPPORTED_EXTENSION",
        filename: args.filename,
      });
    }
    if (!args.workbookBytes.length) {
      throw new LlamaExtractError("EMPTY_WORKBOOK", HEBREW_FAIL, {
        reason: "EMPTY_FILE",
      });
    }
    const maxBytes = 25 * 1024 * 1024;
    if (args.workbookBytes.length > maxBytes) {
      throw new LlamaExtractError("WORKBOOK_TOO_LARGE", HEBREW_FAIL, {
        reason: "FILE_TOO_LARGE",
        size: args.workbookBytes.length,
      });
    }

    const safeName = args.filename.replace(/[^\w.\-()\s\u0590-\u05FF]+/g, "_");
    const tChunk = Date.now();
    const plan = await planLlamaWorkbookChunks(args.workbookBytes, safeName);
    let chunkPlanMs = Date.now() - tChunk;
    const adaptiveResplits: Array<{
      fromChunk: string;
      fromMaxRows: number;
      toMaxRows: number;
      subChunkCount: number;
      error_message: string | null;
    }> = [];

    const dataSchema = buildLlamaDataSchema();
    const queue: LlamaWorkbookChunk[] = [...plan.chunks];
    let nextChunkIndex = plan.chunks.length;
    let uploadCount = 0;
    let jobCount = 0;

    while (queue.length > 0) {
      const chunk = queue.shift()!;
      try {
        const job = await runOneChunk({
          client,
          chunk,
          dataSchema,
          tier,
          pinnedVersion,
          pollIntervalMs,
          timeoutMs,
        });
        chunkJobs.push(job);
        uploadCount += 1;
        jobCount += 1;
        llamaUploadMs += job.uploadMs;
        llamaExtractionMs += job.createMs;
        llamaPollingMs += job.pollMs;
      } catch (err) {
        const tabular =
          err instanceof LlamaExtractError &&
          isTabularMaxItemsError(err.debug.error_message);
        const nextMax = Math.max(
          15,
          Math.floor((chunk.maxRowsPerChunk || chunk.estimatedContentRows) / 2)
        );
        const canResplit =
          tabular &&
          nextMax < chunk.maxRowsPerChunk &&
          chunk.estimatedContentRows > nextMax;

        if (!canResplit) throw err;

        const tResplit = Date.now();
        const subPlan = await planLlamaWorkbookChunks(chunk.bytes, chunk.filename, {
          maxRowsPerChunk: nextMax,
          forceChunk: true,
          indexOffset: nextChunkIndex,
        });
        chunkPlanMs += Date.now() - tResplit;
        nextChunkIndex += subPlan.chunks.length;
        adaptiveResplits.push({
          fromChunk: chunk.filename,
          fromMaxRows: chunk.maxRowsPerChunk,
          toMaxRows: nextMax,
          subChunkCount: subPlan.chunks.length,
          error_message:
            err instanceof LlamaExtractError
              ? String(err.debug.error_message ?? "")
              : null,
        });
        // Failed attempt still consumed an upload+job before failure.
        uploadCount += 1;
        jobCount += 1;
        queue.unshift(...subPlan.chunks);
      }
    }

    // Reflect final executed chunk count in plan metadata used below.
    plan.chunked = plan.chunked || adaptiveResplits.length > 0 || chunkJobs.length > 1;
    if (adaptiveResplits.length > 0) {
      plan.reason =
        (plan.reason ? `${plan.reason}; ` : "") +
        `adaptive_resplit_on_TABULAR_MAX:${adaptiveResplits.length}`;
    }

    const mergedResult = mergeExtractResults(
      chunkJobs.map((j) => j.extractResult)
    );
    const mergedMetadata = {
      chunks: chunkJobs.map((j) => ({
        chunkIndex: j.chunkIndex,
        extractMetadata: j.extractMetadata,
        usage: j.usage,
      })),
    };

    const tNorm = Date.now();
    const adapted = adaptLlamaExtractRows(mergedResult, mergedMetadata);
    llamaNormalizationMs = Date.now() - tNorm;

    if (adapted.conflictFatal) {
      throw new LlamaExtractError("LLAMA_PROVENANCE_CONFLICT", HEBREW_FAIL, {
        reason: "PROVENANCE_CONFLICT",
        duplicateConflicts: adapted.diagnostics.duplicateConflicts,
      });
    }

    if (adapted.rows.length === 0) {
      throw new LlamaExtractError("LLAMA_EMPTY_RESULT", HEBREW_FAIL, {
        reason: "EMPTY_RESULT",
        diagnostics: adapted.diagnostics,
        chunkPlan: {
          chunked: plan.chunked,
          totalContentRows: plan.totalContentRows,
          chunkCount: plan.chunks.length,
        },
      });
    }

    const usageSummary = {
      chunkUsages: chunkJobs.map((j) => j.usage),
    };

    const extractionProviderDebug = {
      provider: "llama-extract",
      apiVersion: "v2",
      tier,
      pinnedVersion,
      extractionTarget: "per_table_row",
      citeSources: true,
      confidenceScores: true,
      timings: {
        llamaChunkPlanMs: chunkPlanMs,
        llamaUploadMs,
        llamaExtractionMs,
        llamaPollingMs,
        llamaNormalizationMs,
      },
      llamaJob: {
        status: "COMPLETED",
        pollCount: chunkJobs.reduce((n, j) => n + j.pollCount, 0),
        terminalReason: "COMPLETED",
        jobIds: chunkJobs.map((j) => j.jobId),
        chunkCount: chunkJobs.length,
      },
      workbookChunking: {
        enabled: plan.chunked,
        reason: plan.reason,
        totalContentRows: plan.totalContentRows,
        maxRowsPerChunk: plan.maxRowsPerChunk,
        initialChunkCount: plan.chunks.length,
        completedChunkCount: chunkJobs.length,
        adaptiveResplits,
        chunks: chunkJobs.map((j) => ({
          chunkIndex: j.chunkIndex,
          filename: j.filename,
          jobId: j.jobId,
          status: j.status,
          estimatedContentRows: j.estimatedContentRows,
          entityCount: j.entityCount,
        })),
      },
      usage: usageSummary,
      rawExtractResult: mergedResult,
      extractMetadata: mergedMetadata,
      adaptDiagnostics: adapted.diagnostics,
      providerCall: {
        provider: "llama-extract",
        uploadCount,
        extractionJobCount: jobCount,
        openAiCallCount: 0,
      },
      cleanupError,
    };

    return {
      result: {
        status: "SUCCESS",
        summary: `llama-extract:${adapted.rows.length}`,
        rows: adapted.rows,
        warnings: [
          ...adapted.diagnostics.warnings,
          ...(plan.chunked
            ? [
                `workbook_chunked_for_llama_tabular_limit:${chunkJobs.length}`,
              ]
            : []),
        ],
      },
      providerCallCount: jobCount,
      model: `llama-extract:${tier}:${pinnedVersion}`,
      usage: usageSummary,
      extractionProviderDebug,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    if (err instanceof LlamaExtractError) {
      throw err;
    }
    throw new LlamaExtractError("LLAMA_NETWORK_OR_SDK", HEBREW_FAIL, {
      reason: "UNEXPECTED",
      message: err instanceof Error ? err.message : String(err),
      chunkJobs: chunkJobs.map((j) => ({
        chunkIndex: j.chunkIndex,
        jobId: j.jobId,
        status: j.status,
      })),
    });
  }
}
