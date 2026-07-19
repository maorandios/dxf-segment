/**
 * Direct workbook extraction orchestrator — STABLE transport recovery.
 * Production default: omega-direct-workbook-extraction/v1.1
 * Experimental compact v2 isolated behind OMEGA_DIRECT_EXTRACTION_SCHEMA_MODE.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { WorkbookSnapshot } from "../../normalization/types";
import type { RawDocumentPartRow } from "../../normalization/types";
import { buildDirectExtractionModelInput } from "./buildModelInput";
import {
  buildCompactCorrectionFeedback,
  shouldRequestDirectExtractionCorrection,
  type CorrectionEligibility,
} from "./correctionEligibility";
import { convertVerifiedDirectRowsToRawPartRows } from "./convertToCanonical";
import { convertStableProviderDtoToDomain } from "./convertStableDto";
import {
  DIRECT_WORKBOOK_CORRECTION_SYSTEM_PROMPT,
  DIRECT_WORKBOOK_EXTRACTION_SYSTEM_PROMPT,
} from "./prompt";
import {
  evaluateDirectExtractionQuality,
  selectBestDirectExtractionResult,
  type DirectExtractionCandidate,
} from "./qualityAndSelection";
import {
  repairEnrichedExtractionLocally,
  repairExtractionEvidenceLocally,
} from "./repairExtractionEvidence";
import { assertDirectExtractionInvariants } from "./runtimeAssertions";
import { aiDirectWorkbookExtractionSchema } from "./schema";
import {
  resolveDirectExtractionSchemaMode,
  type DirectExtractionSchemaMode,
} from "./schemaMode";
import {
  assertPayloadSerializable,
  validateProviderStructuredOutputSchema,
} from "./schemaPreflight";
import {
  STABLE_DIRECT_CORRECTION_SYSTEM_PROMPT,
  STABLE_DIRECT_EXTRACTION_SYSTEM_PROMPT,
} from "./stablePrompt";
import {
  STABLE_DIRECT_EXTRACTION_SCHEMA,
  stableDirectWorkbookExtractionSchema,
  type StableDirectWorkbookExtractionDto,
} from "./stableSchema";
import {
  advanceLifecycle,
  buildFailure,
  createTransportDiagnostics,
  extractProviderErrorMeta,
  type DirectExtractionTransportDiagnostics,
  type WorkbookDirectExtractionFailure,
} from "./transport";
import {
  DIRECT_EXTRACTION_LIMITS,
  DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
  type DirectExtractionQuality,
  type DirectExtractionVerification,
  type DirectSelectionStatus,
  type DirectWorkbookExtraction,
  type DirectWorkbookExtractionV2,
  type DirectWorkbookMappingRequired,
  type LocalEvidenceRepairResult,
} from "./types";
import { verifyDirectWorkbookExtraction } from "./verifyDirectWorkbookExtraction";
import { evaluateWorkbookExtractionGate } from "./workbookExtractionGate";

export type DirectExtractionDiagnostics = {
  mode: "AI_DIRECT";
  schemaMode: DirectExtractionSchemaMode;
  model: string;
  inputStrategy: string;
  originalFileAttached: boolean;
  snapshotChars: number;
  providerCallCount: number;
  transport: DirectExtractionTransportDiagnostics;
  failure: WorkbookDirectExtractionFailure | null;
  initialExtraction: DirectWorkbookExtraction | null;
  initialEvidenceRepair: LocalEvidenceRepairResult | null;
  initialVerification: DirectExtractionVerification | null;
  initialQuality: DirectExtractionQuality | null;
  correctionEligibility: CorrectionEligibility | null;
  correctionTriggers: string[];
  correctedExtraction: DirectWorkbookExtraction | null;
  correctedEvidenceRepair: LocalEvidenceRepairResult | null;
  correctedVerification: DirectExtractionVerification | null;
  correctedQuality: DirectExtractionQuality | null;
  selectionDecision: DirectSelectionStatus | null;
  selectedResult: "initial" | "corrected" | null;
  regressionReasons: string[];
  finalVerification: DirectExtractionVerification | null;
  coverageMetrics: DirectExtractionVerification["coverageMetrics"] | null;
  workbookGate: ReturnType<typeof evaluateWorkbookExtractionGate> | null;
  performance: {
    initialProviderMs: number | null;
    correctionProviderMs: number | null;
    evidenceRepairMs: number | null;
    verificationMs: number | null;
    timedOut: boolean;
  };
  dxfPipeline: "EXECUTED" | "SKIPPED" | "PENDING";
  orphanGeneration: "EXECUTED" | "SUPPRESSED" | "PENDING";
  finalStatus:
    | "SUCCESS"
    | "SUCCESS_WITH_WARNINGS"
    | "MAPPING_REQUIRED"
    | "FAIL"
    | "TOO_LARGE"
    | "TIMEOUT";
  warnings: string[];
};

export type ExtractWorkbookDirectResult = {
  status:
    | "SUCCESS"
    | "SUCCESS_WITH_WARNINGS"
    | "MAPPING_REQUIRED"
    | "FAIL"
    | "TOO_LARGE"
    | "TIMEOUT";
  extraction: DirectWorkbookExtraction | null;
  verification: DirectExtractionVerification | null;
  mappingRequired: DirectWorkbookMappingRequired | null;
  partRows: RawDocumentPartRow[];
  diagnostics: DirectExtractionDiagnostics;
  warnings: string[];
  failure: WorkbookDirectExtractionFailure | null;
  suppressDxfOrphans: boolean;
  skipDxfMatching: boolean;
  retryable: boolean;
};

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  code: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error(code), { code }));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toMappingRequired(
  snapshot: WorkbookSnapshot,
  extraction: DirectWorkbookExtraction | null,
  reasons: string[]
): DirectWorkbookMappingRequired {
  return {
    status: "MAPPING_REQUIRED",
    workbookId: snapshot.documentId,
    detectedTables: extraction?.tables ?? [],
    questions: (extraction?.ambiguities ?? []).map((a) => ({
      type: a.code || "CONFIRM_TABLE",
      message: a.message,
      sheetName: a.sheetName,
    })),
    unresolvedRows: (extraction?.sourceRowLedger ?? [])
      .filter(
        (e) =>
          e.classification === "AMBIGUOUS" || e.classification === "UNPROCESSED"
      )
      .map((e) => ({
        sheetName: e.sheetName,
        rowNumber: e.rowNumber,
        reason: e.reason,
      })),
    proposedFieldMappings: [],
    reasons,
  };
}

function canConvert(args: {
  verification: DirectExtractionVerification;
  selectionStatus: DirectSelectionStatus | null;
}): boolean {
  if (args.verification.status === "MAPPING_REQUIRED") return false;
  if (
    args.verification.hasCandidatePartData &&
    args.verification.coverageMetrics.verifiedPartRows === 0
  ) {
    return false;
  }
  if (
    args.verification.status === "PASS" ||
    args.verification.status === "PASS_WITH_WARNINGS"
  ) {
    return true;
  }
  if (
    args.selectionStatus === "CORRECTION_REJECTED_REGRESSION" &&
    args.verification.coverageMetrics.verifiedPartRows > 0
  ) {
    return true;
  }
  return false;
}

async function callStableProvider(args: {
  client: OpenAI;
  model: string;
  system: string;
  userText: string;
  timeoutMs: number;
  transport: DirectExtractionTransportDiagnostics;
}): Promise<StableDirectWorkbookExtractionDto> {
  advanceLifecycle(args.transport, "REQUEST_SENT");
  try {
    const response = await withTimeout(
      args.client.responses.parse({
        model: args.model,
        reasoning: { effort: "none" },
        input: [
          { role: "system", content: args.system },
          { role: "user", content: args.userText },
        ],
        text: {
          format: zodTextFormat(
            stableDirectWorkbookExtractionSchema,
            "omega_direct_workbook_extraction"
          ),
        },
      }),
      args.timeoutMs,
      "PROVIDER_TIMEOUT"
    );
    advanceLifecycle(args.transport, "RESPONSE_RECEIVED");
    args.transport.providerRequestId =
      (response as { id?: string }).id ?? null;

    const parsed = response.output_parsed;
    if (!parsed) {
      throw Object.assign(new Error("OPENAI_SCHEMA"), {
        code: "OPENAI_SCHEMA",
        stage: "STRUCTURED_OUTPUT_PARSE",
      });
    }
    advanceLifecycle(args.transport, "OUTPUT_PARSED");
    const validated = stableDirectWorkbookExtractionSchema.parse(parsed);
    advanceLifecycle(args.transport, "OUTPUT_VALIDATED");
    return validated;
  } catch (err) {
    const meta = extractProviderErrorMeta(err);
    args.transport.providerStatus = meta.status;
    args.transport.providerRequestId =
      meta.requestId ?? args.transport.providerRequestId;
    args.transport.providerError = {
      type: meta.type,
      code: meta.code,
      message:
        err instanceof Error ? err.message : String(err),
    };
    throw err;
  }
}

async function callExperimentalCompact(args: {
  client: OpenAI;
  model: string;
  system: string;
  userText: string;
  timeoutMs: number;
  transport: DirectExtractionTransportDiagnostics;
}): Promise<DirectWorkbookExtractionV2> {
  advanceLifecycle(args.transport, "REQUEST_SENT");
  const response = await withTimeout(
    args.client.responses.parse({
      model: args.model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.userText },
      ],
      text: {
        format: zodTextFormat(
          aiDirectWorkbookExtractionSchema,
          "omega_direct_workbook_extraction_compact"
        ),
      },
    }),
    args.timeoutMs,
    "PROVIDER_TIMEOUT"
  );
  advanceLifecycle(args.transport, "RESPONSE_RECEIVED");
  const parsed = response.output_parsed;
  if (!parsed) {
    throw Object.assign(new Error("OPENAI_SCHEMA"), { code: "OPENAI_SCHEMA" });
  }
  advanceLifecycle(args.transport, "OUTPUT_PARSED");
  const validated = aiDirectWorkbookExtractionSchema.parse(
    parsed
  ) as DirectWorkbookExtractionV2;
  advanceLifecycle(args.transport, "OUTPUT_VALIDATED");
  return validated;
}

export async function extractWorkbookDirect(args: {
  snapshot: WorkbookSnapshot;
  client: OpenAI;
  model: string;
  injectedExtraction?:
    | StableDirectWorkbookExtractionDto
    | DirectWorkbookExtractionV2
    | DirectWorkbookExtraction
    | null;
  injectedCorrection?:
    | StableDirectWorkbookExtractionDto
    | DirectWorkbookExtractionV2
    | DirectWorkbookExtraction
    | null;
  schemaMode?: DirectExtractionSchemaMode;
}): Promise<ExtractWorkbookDirectResult> {
  const warnings: string[] = [];
  const schemaMode =
    args.schemaMode ?? resolveDirectExtractionSchemaMode();
  const schemaVersion =
    schemaMode === "STABLE"
      ? STABLE_DIRECT_EXTRACTION_SCHEMA
      : DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2;

  const transport = createTransportDiagnostics({ schemaMode, schemaVersion });
  const diagnostics: DirectExtractionDiagnostics = {
    mode: "AI_DIRECT",
    schemaMode,
    model: args.model,
    inputStrategy: "",
    originalFileAttached: false,
    snapshotChars: 0,
    providerCallCount: 0,
    transport,
    failure: null,
    initialExtraction: null,
    initialEvidenceRepair: null,
    initialVerification: null,
    initialQuality: null,
    correctionEligibility: null,
    correctionTriggers: [],
    correctedExtraction: null,
    correctedEvidenceRepair: null,
    correctedVerification: null,
    correctedQuality: null,
    selectionDecision: null,
    selectedResult: null,
    regressionReasons: [],
    finalVerification: null,
    coverageMetrics: null,
    workbookGate: null,
    performance: {
      initialProviderMs: null,
      correctionProviderMs: null,
      evidenceRepairMs: null,
      verificationMs: null,
      timedOut: false,
    },
    dxfPipeline: "PENDING",
    orphanGeneration: "PENDING",
    finalStatus: "FAIL",
    warnings: [],
  };

  const failResult = (
    failure: WorkbookDirectExtractionFailure,
    status: ExtractWorkbookDirectResult["status"] = "FAIL"
  ): ExtractWorkbookDirectResult => {
    advanceLifecycle(transport, "FAILED");
    transport.failureStage = failure.stage;
    transport.failure = failure;
    transport.retryable = failure.retryable;
    diagnostics.failure = failure;
    diagnostics.finalStatus = status;
    diagnostics.dxfPipeline = "SKIPPED";
    diagnostics.orphanGeneration = "SUPPRESSED";
    diagnostics.workbookGate = evaluateWorkbookExtractionGate({
      workbookSupplied: true,
      snapshot: args.snapshot,
      extractionStatus: status,
      verifiedRowCount: 0,
      partRowCount: 0,
      failure,
      mappingRequired: false,
    });
    diagnostics.warnings = warnings;
    return {
      status,
      extraction: null,
      verification: null,
      mappingRequired: null,
      partRows: [],
      diagnostics,
      warnings: [...warnings, failure.code, failure.message],
      failure,
      suppressDxfOrphans: true,
      skipDxfMatching: true,
      retryable: failure.retryable,
    };
  };

  try {
    if (!args.snapshot.sheets.length) {
      return failResult(
        buildFailure({
          stage: "REQUEST_BUILD",
          code: "EMPTY_SNAPSHOT",
          message: "Workbook snapshot has no sheets",
          schemaVersion,
          schemaHash: null,
          retryable: false,
        })
      );
    }

    const input = buildDirectExtractionModelInput({ snapshot: args.snapshot });
    warnings.push(...input.warnings);
    diagnostics.inputStrategy = input.strategy;
    diagnostics.snapshotChars = input.serialized.length;
    transport.inputCharacterCount = input.serialized.length;
    transport.timeoutMs = DIRECT_EXTRACTION_LIMITS.initialTimeoutMs;

    if (input.strategy === "TOO_LARGE") {
      diagnostics.finalStatus = "TOO_LARGE";
      return {
        status: "TOO_LARGE",
        extraction: null,
        verification: null,
        mappingRequired: toMappingRequired(args.snapshot, null, warnings),
        partRows: [],
        diagnostics,
        warnings,
        failure: null,
        suppressDxfOrphans: true,
        skipDxfMatching: true,
        retryable: false,
      };
    }

    const providerSchema =
      schemaMode === "STABLE"
        ? stableDirectWorkbookExtractionSchema
        : aiDirectWorkbookExtractionSchema;

    const preflight = validateProviderStructuredOutputSchema(providerSchema, {
      schemaName:
        schemaMode === "STABLE"
          ? "omega_direct_workbook_extraction"
          : "omega_direct_workbook_extraction_compact",
    });
    transport.schemaPreflight = {
      valid: preflight.valid,
      errors: preflight.errors,
      warnings: preflight.warnings,
    };
    transport.schemaHash = preflight.normalizedSchemaHash;

    if (!preflight.valid) {
      return failResult(
        buildFailure({
          stage: "SCHEMA_PREFLIGHT",
          code: "SCHEMA_PREFLIGHT_FAILED",
          message: preflight.errors.map((e) => e.message).join("; "),
          schemaVersion,
          schemaHash: preflight.normalizedSchemaHash,
          retryable: false,
          details: { errors: preflight.errors },
        })
      );
    }
    advanceLifecycle(transport, "SCHEMA_VALIDATED");

    const userText = [
      schemaMode === "STABLE"
        ? "Extract part/material rows (schema v1.1). Set characterStart/characterEnd to null."
        : "Extract compact part/material rows (experimental v2).",
      "Never return an Extraction Plan.",
      "",
      `workbookId=${args.snapshot.documentId}`,
      `fileName=${args.snapshot.fileName}`,
      "",
      "WORKBOOK_SNAPSHOT_JSON:",
      input.serialized,
    ].join("\n");

    const requestProbe = {
      model: args.model,
      purpose: "WORKBOOK_DIRECT_EXTRACTION",
      schemaVersion,
      schemaHash: preflight.normalizedSchemaHash,
      workbookId: args.snapshot.documentId,
      inputChars: input.serialized.length,
    };
    const serial = assertPayloadSerializable(requestProbe);
    if (!serial.ok) {
      return failResult(
        buildFailure({
          stage: "REQUEST_SERIALIZATION",
          code: "REQUEST_NOT_SERIALIZABLE",
          message: serial.error,
          schemaVersion,
          schemaHash: preflight.normalizedSchemaHash,
          retryable: false,
        })
      );
    }
    advanceLifecycle(transport, "REQUEST_BUILT");

    let domainExtraction: DirectWorkbookExtraction;

    if (args.injectedExtraction) {
      diagnostics.providerCallCount += 1;
      advanceLifecycle(transport, "REQUEST_SENT");
      advanceLifecycle(transport, "RESPONSE_RECEIVED");
      advanceLifecycle(transport, "OUTPUT_PARSED");
      advanceLifecycle(transport, "OUTPUT_VALIDATED");

      const inj = args.injectedExtraction;
      if ("rowLedger" in inj) {
        const repair = repairExtractionEvidenceLocally({
          snapshot: args.snapshot,
          compact: inj as DirectWorkbookExtractionV2,
        });
        domainExtraction = repair.extraction;
        diagnostics.initialEvidenceRepair = repair;
        transport.domainConversionCompleted = true;
      } else if (
        "schemaVersion" in inj &&
        (inj as { schemaVersion?: string }).schemaVersion ===
          STABLE_DIRECT_EXTRACTION_SCHEMA
      ) {
        domainExtraction = convertStableProviderDtoToDomain({
          snapshot: args.snapshot,
          dto: inj as StableDirectWorkbookExtractionDto,
        });
        transport.domainConversionCompleted = true;
      } else if ("workbookSummary" in inj && "sourceRowLedger" in inj) {
        // Already-enriched domain model (tests / local)
        domainExtraction = inj as DirectWorkbookExtraction;
        transport.domainConversionCompleted = true;
      } else {
        // Last-resort: treat as stable DTO-shaped plain object
        const dto = stableDirectWorkbookExtractionSchema.parse({
          ...(inj as object as Record<string, unknown>),
          schemaVersion: STABLE_DIRECT_EXTRACTION_SCHEMA,
        });
        domainExtraction = convertStableProviderDtoToDomain({
          snapshot: args.snapshot,
          dto,
        });
        transport.domainConversionCompleted = true;
      }
    } else {
      const t0 = Date.now();
      try {
        if (schemaMode === "STABLE") {
          const dto = await callStableProvider({
            client: args.client,
            model: args.model,
            system: STABLE_DIRECT_EXTRACTION_SYSTEM_PROMPT,
            userText,
            timeoutMs: DIRECT_EXTRACTION_LIMITS.initialTimeoutMs,
            transport,
          });
          diagnostics.providerCallCount += 1;
          diagnostics.performance.initialProviderMs = Date.now() - t0;
          domainExtraction = convertStableProviderDtoToDomain({
            snapshot: args.snapshot,
            dto: {
              ...dto,
              schemaVersion: STABLE_DIRECT_EXTRACTION_SCHEMA,
              workbookId: args.snapshot.documentId,
            },
          });
          transport.domainConversionCompleted = true;
        } else {
          const compact = await callExperimentalCompact({
            client: args.client,
            model: args.model,
            system: DIRECT_WORKBOOK_EXTRACTION_SYSTEM_PROMPT,
            userText,
            timeoutMs: DIRECT_EXTRACTION_LIMITS.initialTimeoutMs,
            transport,
          });
          diagnostics.providerCallCount += 1;
          diagnostics.performance.initialProviderMs = Date.now() - t0;
          const repair = repairExtractionEvidenceLocally({
            snapshot: args.snapshot,
            compact: {
              ...compact,
              schemaVersion: DIRECT_WORKBOOK_EXTRACTION_SCHEMA_V2,
              workbookId: args.snapshot.documentId,
            },
          });
          diagnostics.initialEvidenceRepair = repair;
          diagnostics.performance.evidenceRepairMs = repair.durationMs;
          domainExtraction = repair.extraction;
          transport.domainConversionCompleted = true;
        }
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "PROVIDER_ERROR";
        const meta = extractProviderErrorMeta(err);
        if (code === "PROVIDER_TIMEOUT") {
          diagnostics.performance.timedOut = true;
          return failResult(
            buildFailure({
              stage: "PROVIDER_REQUEST",
              code: "PROVIDER_TIMEOUT",
              message: "Direct extraction provider timed out",
              schemaVersion,
              schemaHash: transport.schemaHash,
              err,
              retryable: true,
              providerStatus: meta.status,
              providerErrorType: meta.type,
              providerErrorCode: meta.code,
              providerRequestId: meta.requestId,
            }),
            "TIMEOUT"
          );
        }
        const stage =
          code === "OPENAI_SCHEMA"
            ? "STRUCTURED_OUTPUT_PARSE"
            : "PROVIDER_REQUEST";
        return failResult(
          buildFailure({
            stage,
            code,
            message: err instanceof Error ? err.message : String(err),
            schemaVersion,
            schemaHash: transport.schemaHash,
            err,
            retryable: true,
            providerStatus: meta.status,
            providerErrorType: meta.type,
            providerErrorCode: meta.code,
            providerRequestId: meta.requestId,
          })
        );
      }
    }

    domainExtraction = {
      ...domainExtraction,
      workbookId: args.snapshot.documentId,
    };
    diagnostics.initialExtraction = domainExtraction;

    if (
      domainExtraction.status === "MAPPING_REQUIRED" ||
      domainExtraction.status === "UNSUPPORTED"
    ) {
      diagnostics.finalStatus = "MAPPING_REQUIRED";
      diagnostics.selectionDecision = "MAPPING_REQUIRED";
      diagnostics.dxfPipeline = "SKIPPED";
      diagnostics.orphanGeneration = "SUPPRESSED";
      return {
        status: "MAPPING_REQUIRED",
        extraction: domainExtraction,
        verification: null,
        mappingRequired: toMappingRequired(args.snapshot, domainExtraction, [
          ...warnings,
          ...domainExtraction.ambiguities.map((a) => a.message),
        ]),
        partRows: [],
        diagnostics,
        warnings,
        failure: null,
        suppressDxfOrphans: true,
        skipDxfMatching: true,
        retryable: false,
      };
    }

    // For STABLE path, local offsets already applied in convertStableProviderDtoToDomain.
    // Optionally re-run enriched repair for consistency.
    if (!diagnostics.initialEvidenceRepair) {
      const repair = repairEnrichedExtractionLocally({
        snapshot: args.snapshot,
        extraction: domainExtraction,
      });
      diagnostics.initialEvidenceRepair = repair;
      diagnostics.performance.evidenceRepairMs = repair.durationMs;
      domainExtraction = repair.extraction;
    }

    const tVerify0 = Date.now();
    const initialVerification = verifyDirectWorkbookExtraction({
      snapshot: args.snapshot,
      extraction: domainExtraction,
    });
    diagnostics.performance.verificationMs = Date.now() - tVerify0;
    diagnostics.initialVerification = initialVerification;
    const initialQuality = evaluateDirectExtractionQuality({
      extraction: domainExtraction,
      verification: initialVerification,
    });
    diagnostics.initialQuality = initialQuality;

    const eligibility = shouldRequestDirectExtractionCorrection({
      initialExtraction: domainExtraction,
      localEvidenceRepair: diagnostics.initialEvidenceRepair!,
      verification: initialVerification,
    });
    diagnostics.correctionEligibility = eligibility;
    diagnostics.correctionTriggers = eligibility.triggerCodes;

    const initialCandidate: DirectExtractionCandidate = {
      extraction: domainExtraction,
      repair: diagnostics.initialEvidenceRepair!,
      verification: initialVerification,
      quality: initialQuality,
    };

    let correctedCandidate: DirectExtractionCandidate | null = null;
    const canCorrect =
      eligibility.eligible &&
      diagnostics.providerCallCount < DIRECT_EXTRACTION_LIMITS.maxDirectCalls &&
      (Boolean(args.injectedCorrection) || !args.injectedExtraction);

    if (canCorrect && args.injectedCorrection) {
      diagnostics.providerCallCount += 1;
      let correctedExtraction: DirectWorkbookExtraction;
      if (
        "sourceRowLedger" in args.injectedCorrection &&
        !("rowLedger" in args.injectedCorrection)
      ) {
        const raw = args.injectedCorrection as StableDirectWorkbookExtractionDto;
        const dto = stableDirectWorkbookExtractionSchema.parse({
          ...raw,
          schemaVersion: STABLE_DIRECT_EXTRACTION_SCHEMA,
          workbookId: args.snapshot.documentId,
        });
        correctedExtraction = convertStableProviderDtoToDomain({
          snapshot: args.snapshot,
          dto,
        });
      } else if ("rowLedger" in args.injectedCorrection) {
        const repair = repairExtractionEvidenceLocally({
          snapshot: args.snapshot,
          compact: args.injectedCorrection as DirectWorkbookExtractionV2,
        });
        diagnostics.correctedEvidenceRepair = repair;
        correctedExtraction = repair.extraction;
      } else {
        correctedExtraction =
          args.injectedCorrection as DirectWorkbookExtraction;
      }
      diagnostics.correctedExtraction = correctedExtraction;
      const correctedVerification = verifyDirectWorkbookExtraction({
        snapshot: args.snapshot,
        extraction: correctedExtraction,
      });
      diagnostics.correctedVerification = correctedVerification;
      const correctedQuality = evaluateDirectExtractionQuality({
        extraction: correctedExtraction,
        verification: correctedVerification,
      });
      diagnostics.correctedQuality = correctedQuality;
      correctedCandidate = {
        extraction: correctedExtraction,
        repair: diagnostics.correctedEvidenceRepair ??
          diagnostics.initialEvidenceRepair!,
        verification: correctedVerification,
        quality: correctedQuality,
      };
    } else if (canCorrect && !args.injectedExtraction) {
      try {
        const feedback = buildCompactCorrectionFeedback(
          eligibility,
          initialVerification
        );
        const correctionText = [
          "Correct the previous extraction. Return a complete replacement.",
          "",
          `workbookId=${args.snapshot.documentId}`,
          "",
          "CORRECTION_FEEDBACK_JSON:",
          JSON.stringify(feedback),
          "",
          "WORKBOOK_SNAPSHOT_JSON:",
          input.serialized,
        ].join("\n");
        const t1 = Date.now();
        if (schemaMode === "STABLE") {
          const dto = await callStableProvider({
            client: args.client,
            model: args.model,
            system: STABLE_DIRECT_CORRECTION_SYSTEM_PROMPT,
            userText: correctionText,
            timeoutMs: DIRECT_EXTRACTION_LIMITS.correctionTimeoutMs,
            transport,
          });
          diagnostics.providerCallCount += 1;
          diagnostics.performance.correctionProviderMs = Date.now() - t1;
          const correctedExtraction = convertStableProviderDtoToDomain({
            snapshot: args.snapshot,
            dto: {
              ...dto,
              schemaVersion: STABLE_DIRECT_EXTRACTION_SCHEMA,
              workbookId: args.snapshot.documentId,
            },
          });
          diagnostics.correctedExtraction = correctedExtraction;
          const correctedVerification = verifyDirectWorkbookExtraction({
            snapshot: args.snapshot,
            extraction: correctedExtraction,
          });
          diagnostics.correctedVerification = correctedVerification;
          const correctedQuality = evaluateDirectExtractionQuality({
            extraction: correctedExtraction,
            verification: correctedVerification,
          });
          diagnostics.correctedQuality = correctedQuality;
          correctedCandidate = {
            extraction: correctedExtraction,
            repair: diagnostics.initialEvidenceRepair!,
            verification: correctedVerification,
            quality: correctedQuality,
          };
        } else {
          const compact = await callExperimentalCompact({
            client: args.client,
            model: args.model,
            system: DIRECT_WORKBOOK_CORRECTION_SYSTEM_PROMPT,
            userText: correctionText,
            timeoutMs: DIRECT_EXTRACTION_LIMITS.correctionTimeoutMs,
            transport,
          });
          diagnostics.providerCallCount += 1;
          diagnostics.performance.correctionProviderMs = Date.now() - t1;
          const repair = repairExtractionEvidenceLocally({
            snapshot: args.snapshot,
            compact,
          });
          diagnostics.correctedEvidenceRepair = repair;
          const correctedExtraction = repair.extraction;
          diagnostics.correctedExtraction = correctedExtraction;
          const correctedVerification = verifyDirectWorkbookExtraction({
            snapshot: args.snapshot,
            extraction: correctedExtraction,
          });
          diagnostics.correctedVerification = correctedVerification;
          const correctedQuality = evaluateDirectExtractionQuality({
            extraction: correctedExtraction,
            verification: correctedVerification,
          });
          diagnostics.correctedQuality = correctedQuality;
          correctedCandidate = {
            extraction: correctedExtraction,
            repair,
            verification: correctedVerification,
            quality: correctedQuality,
          };
        }
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "";
        if (code === "PROVIDER_TIMEOUT") {
          diagnostics.performance.timedOut = true;
          warnings.push("CORRECTION_PROVIDER_TIMEOUT");
        } else {
          warnings.push(`CORRECTION_FAILED:${code || "ERROR"}`);
        }
      }
    }

    const selection = selectBestDirectExtractionResult({
      initial: initialCandidate,
      corrected: correctedCandidate,
    });
    diagnostics.selectionDecision = selection.status;
    diagnostics.regressionReasons = selection.regressionReasons;
    diagnostics.selectedResult =
      selection.selected === initialCandidate ? "initial" : "corrected";

    const selected = selection.selected;
    diagnostics.finalVerification = selected.verification;
    diagnostics.coverageMetrics = selected.verification.coverageMetrics;

    const gate = evaluateWorkbookExtractionGate({
      workbookSupplied: true,
      snapshot: args.snapshot,
      extractionStatus: selected.verification.status,
      verifiedRowCount: selected.verification.coverageMetrics.verifiedPartRows,
      partRowCount: selected.extraction.rows.length,
      failure: null,
      mappingRequired:
        selection.status === "MAPPING_REQUIRED" ||
        selected.verification.status === "MAPPING_REQUIRED",
    });
    diagnostics.workbookGate = gate;

    if (
      selection.status === "MAPPING_REQUIRED" ||
      selected.verification.status === "MAPPING_REQUIRED" ||
      gate.finalOutcome === "MAPPING_REQUIRED"
    ) {
      diagnostics.finalStatus = "MAPPING_REQUIRED";
      diagnostics.dxfPipeline = "SKIPPED";
      diagnostics.orphanGeneration = "SUPPRESSED";
      return {
        status: "MAPPING_REQUIRED",
        extraction: selected.extraction,
        verification: selected.verification,
        mappingRequired: toMappingRequired(args.snapshot, selected.extraction, [
          ...warnings,
          selected.verification.correctionFeedback.summary,
        ]),
        partRows: [],
        diagnostics,
        warnings,
        failure: null,
        suppressDxfOrphans: true,
        skipDxfMatching: true,
        retryable: false,
      };
    }

    if (
      gate.finalOutcome === "UNSAFE_BLOCK" ||
      gate.finalOutcome === "FAILED" ||
      selection.status === "BOTH_UNSAFE" ||
      !canConvert({
        verification: selected.verification,
        selectionStatus: selection.status,
      })
    ) {
      diagnostics.finalStatus = "FAIL";
      diagnostics.dxfPipeline = "SKIPPED";
      diagnostics.orphanGeneration = "SUPPRESSED";
      return {
        status: "FAIL",
        extraction: selected.extraction,
        verification: selected.verification,
        mappingRequired: null,
        partRows: [],
        diagnostics,
        warnings: [
          ...warnings,
          ...gate.blockingReasons,
          selected.verification.correctionFeedback.summary,
        ],
        failure: null,
        suppressDxfOrphans: true,
        skipDxfMatching: true,
        retryable: false,
      };
    }

    const converted = convertVerifiedDirectRowsToRawPartRows({
      snapshot: args.snapshot,
      extraction: selected.extraction,
      verification: selected.verification,
    });
    warnings.push(...converted.warnings);

    assertDirectExtractionInvariants({
      snapshot: args.snapshot,
      extraction: selected.extraction,
      verification: selected.verification,
      providerCallCount: diagnostics.providerCallCount,
    });

    const status =
      selected.verification.status === "PASS_WITH_WARNINGS" ||
      selection.status === "CORRECTION_REJECTED_REGRESSION"
        ? "SUCCESS_WITH_WARNINGS"
        : "SUCCESS";
    diagnostics.finalStatus = status;
    diagnostics.warnings = warnings;
    diagnostics.dxfPipeline = "EXECUTED";
    diagnostics.orphanGeneration = "EXECUTED";

    return {
      status,
      extraction: selected.extraction,
      verification: selected.verification,
      mappingRequired: null,
      partRows: converted.partRows,
      diagnostics,
      warnings,
      failure: null,
      suppressDxfOrphans: false,
      skipDxfMatching: false,
      retryable: false,
    };
  } catch (err) {
    const meta = extractProviderErrorMeta(err);
    return failResult(
      buildFailure({
        stage: "DOMAIN_CONVERSION",
        code:
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "UNEXPECTED_ERROR",
        message: err instanceof Error ? err.message : String(err),
        schemaVersion,
        schemaHash: transport.schemaHash,
        err,
        retryable: false,
        providerStatus: meta.status,
        providerErrorType: meta.type,
        providerErrorCode: meta.code,
        providerRequestId: meta.requestId,
      })
    );
  }
}
