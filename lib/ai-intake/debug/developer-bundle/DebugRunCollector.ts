/**
 * Mutable stage collector — observational only; never mutates analysis domain.
 */

import type {
  DebugPipelineStage,
  DebugPipelineStageName,
  DebugStageStatus,
} from "./types";

export class DebugRunCollector {
  readonly stages: DebugPipelineStage[] = [];
  readonly errors: Array<{ code: string; message: string; stage?: string }> =
    [];
  readonly warnings: Array<{ code: string; message: string }> = [];
  private open = new Map<DebugPipelineStageName, number>();

  begin(
    stage: DebugPipelineStageName,
    inputSummary?: Record<string, unknown> | null
  ): void {
    this.open.set(stage, Date.now());
    this.stages.push({
      stage,
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
      inputSummary: inputSummary ?? null,
      outputSummary: null,
      warnings: [],
      errorCode: null,
      errorMessage: null,
      stack: null,
      relatedIds: [],
    });
  }

  end(
    stage: DebugPipelineStageName,
    status: DebugStageStatus,
    args?: {
      outputSummary?: Record<string, unknown> | null;
      warnings?: string[];
      errorCode?: string | null;
      errorMessage?: string | null;
      stack?: string | null;
      relatedIds?: string[];
    }
  ): void {
    const started = this.open.get(stage);
    this.open.delete(stage);
    const existing = [...this.stages].reverse().find((s) => s.stage === stage);
    if (!existing) {
      this.stages.push({
        stage,
        status,
        startedAt: null,
        completedAt: new Date().toISOString(),
        durationMs: null,
        inputSummary: null,
        outputSummary: args?.outputSummary ?? null,
        warnings: args?.warnings ?? [],
        errorCode: args?.errorCode ?? null,
        errorMessage: args?.errorMessage ?? null,
        stack: args?.stack ?? null,
        relatedIds: args?.relatedIds ?? [],
      });
      return;
    }
    existing.status = status;
    existing.completedAt = new Date().toISOString();
    existing.durationMs =
      started != null ? Date.now() - started : null;
    existing.outputSummary = args?.outputSummary ?? existing.outputSummary;
    existing.warnings = [
      ...existing.warnings,
      ...(args?.warnings ?? []),
    ];
    existing.errorCode = args?.errorCode ?? null;
    existing.errorMessage = args?.errorMessage ?? null;
    existing.stack = args?.stack ?? null;
    if (args?.relatedIds) {
      existing.relatedIds = [...existing.relatedIds, ...args.relatedIds];
    }
    if (status === "FAILED" && args?.errorMessage) {
      this.errors.push({
        code: args.errorCode ?? "STAGE_FAILED",
        message: args.errorMessage,
        stage,
      });
    }
  }

  skip(stage: DebugPipelineStageName, reason: string): void {
    this.stages.push({
      stage,
      status: "SKIPPED",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      inputSummary: null,
      outputSummary: { reason },
      warnings: [reason],
      errorCode: null,
      errorMessage: null,
      stack: null,
      relatedIds: [],
    });
  }

  warn(code: string, message: string): void {
    this.warnings.push({ code, message });
  }
}
