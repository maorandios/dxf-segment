/**
 * Transport failure + request lifecycle for direct workbook extraction.
 */

export type DirectExtractionRequestState =
  | "NOT_STARTED"
  | "SCHEMA_VALIDATED"
  | "REQUEST_BUILT"
  | "REQUEST_SENT"
  | "RESPONSE_RECEIVED"
  | "OUTPUT_PARSED"
  | "OUTPUT_VALIDATED"
  | "FAILED";

export type SanitizedErrorCause = {
  name: string;
  message: string;
  code?: string;
};

export type WorkbookDirectExtractionFailure = {
  stage:
    | "SCHEMA_BUILD"
    | "SCHEMA_PREFLIGHT"
    | "REQUEST_BUILD"
    | "REQUEST_SERIALIZATION"
    | "PROVIDER_REQUEST"
    | "PROVIDER_RESPONSE"
    | "STRUCTURED_OUTPUT_PARSE"
    | "RESPONSE_SCHEMA_VALIDATION"
    | "DOMAIN_CONVERSION";
  code: string;
  message: string;
  providerStatus: number | null;
  providerErrorType: string | null;
  providerErrorCode: string | null;
  providerRequestId: string | null;
  schemaVersion: string;
  schemaHash: string | null;
  retryable: boolean;
  sanitizedDetails: Record<string, unknown>;
  causeChain: SanitizedErrorCause[];
};

export type DirectExtractionTransportDiagnostics = {
  schemaMode: "STABLE" | "EXPERIMENTAL_COMPACT";
  schemaVersion: string;
  schemaHash: string | null;
  schemaPreflight: {
    valid: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  } | null;
  requestLifecycle: DirectExtractionRequestState;
  lifecycleTimestamps: Partial<Record<DirectExtractionRequestState, string>>;
  requestBuilt: boolean;
  requestSent: boolean;
  responseReceived: boolean;
  providerRequestId: string | null;
  providerStatus: number | null;
  providerError: Record<string, unknown> | null;
  structuredOutputParsed: boolean;
  responseSchemaValidated: boolean;
  domainConversionCompleted: boolean;
  failureStage: WorkbookDirectExtractionFailure["stage"] | null;
  failure: WorkbookDirectExtractionFailure | null;
  retryable: boolean;
  inputCharacterCount: number | null;
  timeoutMs: number | null;
};

export function createTransportDiagnostics(args: {
  schemaMode: "STABLE" | "EXPERIMENTAL_COMPACT";
  schemaVersion: string;
}): DirectExtractionTransportDiagnostics {
  return {
    schemaMode: args.schemaMode,
    schemaVersion: args.schemaVersion,
    schemaHash: null,
    schemaPreflight: null,
    requestLifecycle: "NOT_STARTED",
    lifecycleTimestamps: {
      NOT_STARTED: new Date().toISOString(),
    },
    requestBuilt: false,
    requestSent: false,
    responseReceived: false,
    providerRequestId: null,
    providerStatus: null,
    providerError: null,
    structuredOutputParsed: false,
    responseSchemaValidated: false,
    domainConversionCompleted: false,
    failureStage: null,
    failure: null,
    retryable: false,
    inputCharacterCount: null,
    timeoutMs: null,
  };
}

export function advanceLifecycle(
  d: DirectExtractionTransportDiagnostics,
  state: DirectExtractionRequestState
): void {
  d.requestLifecycle = state;
  d.lifecycleTimestamps[state] = new Date().toISOString();
  if (state === "REQUEST_BUILT") d.requestBuilt = true;
  if (state === "REQUEST_SENT") d.requestSent = true;
  if (state === "RESPONSE_RECEIVED") d.responseReceived = true;
  if (state === "OUTPUT_PARSED") d.structuredOutputParsed = true;
  if (state === "OUTPUT_VALIDATED") d.responseSchemaValidated = true;
}

export function sanitizeErrorCause(err: unknown): SanitizedErrorCause[] {
  const chain: SanitizedErrorCause[] = [];
  let cur: unknown = err;
  let depth = 0;
  while (cur && depth < 6) {
    if (cur instanceof Error) {
      chain.push({
        name: cur.name,
        message: redactSecrets(cur.message),
        code:
          "code" in cur && typeof (cur as { code?: unknown }).code === "string"
            ? String((cur as { code: string }).code)
            : undefined,
      });
      cur = cur.cause;
    } else if (typeof cur === "object" && cur !== null && "message" in cur) {
      chain.push({
        name: "Error",
        message: redactSecrets(String((cur as { message: unknown }).message)),
      });
      break;
    } else {
      chain.push({ name: "Unknown", message: redactSecrets(String(cur)) });
      break;
    }
    depth += 1;
  }
  return chain;
}

function redactSecrets(msg: string): string {
  return msg
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

export function buildFailure(args: {
  stage: WorkbookDirectExtractionFailure["stage"];
  code: string;
  message: string;
  schemaVersion: string;
  schemaHash: string | null;
  err?: unknown;
  providerStatus?: number | null;
  providerErrorType?: string | null;
  providerErrorCode?: string | null;
  providerRequestId?: string | null;
  retryable?: boolean;
  details?: Record<string, unknown>;
}): WorkbookDirectExtractionFailure {
  const retryable =
    args.retryable ??
    (args.stage === "PROVIDER_REQUEST" ||
      args.code === "PROVIDER_TIMEOUT" ||
      args.code === "OPENAI_SCHEMA");
  return {
    stage: args.stage,
    code: args.code,
    message: redactSecrets(args.message),
    providerStatus: args.providerStatus ?? null,
    providerErrorType: args.providerErrorType ?? null,
    providerErrorCode: args.providerErrorCode ?? null,
    providerRequestId: args.providerRequestId ?? null,
    schemaVersion: args.schemaVersion,
    schemaHash: args.schemaHash,
    retryable,
    sanitizedDetails: args.details ?? {},
    causeChain: args.err ? sanitizeErrorCause(args.err) : [],
  };
}

export function extractProviderErrorMeta(err: unknown): {
  status: number | null;
  type: string | null;
  code: string | null;
  requestId: string | null;
} {
  if (!err || typeof err !== "object") {
    return { status: null, type: null, code: null, requestId: null };
  }
  const e = err as Record<string, unknown>;
  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : null;
  const type =
    typeof e.type === "string"
      ? e.type
      : e.error && typeof e.error === "object" && "type" in e.error
        ? String((e.error as { type: unknown }).type)
        : null;
  const code =
    typeof e.code === "string"
      ? e.code
      : e.error && typeof e.error === "object" && "code" in e.error
        ? String((e.error as { code: unknown }).code)
        : null;
  const requestId =
    typeof e.request_id === "string"
      ? e.request_id
      : typeof e.requestId === "string"
        ? e.requestId
        : null;
  return { status, type, code, requestId };
}
