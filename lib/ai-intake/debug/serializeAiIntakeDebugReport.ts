import type { AiIntakeDebugReportV1 } from "./types";

const SECRET_KEY_RE =
  /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|set-cookie|x-api-key|password|secret|bearer)$/i;

const SECRET_VALUE_RE =
  /(sk-[a-zA-Z0-9]{10,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*|data:application\/|X-Amz-Signature|Signature=|AWSAccessKeyId)/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof Error) &&
    !(v instanceof Map) &&
    !(v instanceof Set) &&
    !(typeof ArrayBuffer !== "undefined" && v instanceof ArrayBuffer) &&
    !(typeof Uint8Array !== "undefined" && v instanceof Uint8Array)
  );
}

/**
 * Convert arbitrary values into JSON-safe structures.
 * Drops secrets, binaries, and undefined (replaced with null at object leaves via omit).
 */
export function toJsonSafe(value: unknown, keyHint?: string): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === "string") {
    if (SECRET_VALUE_RE.test(value)) return "[REDACTED]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();

  if (keyHint && SECRET_KEY_RE.test(keyHint)) return "[REDACTED]";

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }

  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = toJsonSafe(v, String(k));
    }
    return obj;
  }

  if (value instanceof Set) {
    return Array.from(value).map((v) => toJsonSafe(v));
  }

  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return null;
  }
  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) {
    return null;
  }
  if (typeof File !== "undefined" && value instanceof File) {
    return {
      name: value.name,
      size: value.size,
      type: value.type,
    };
  }

  if (Array.isArray(value)) {
    return value.map((v) => toJsonSafe(v));
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      if (v === undefined) {
        out[k] = null;
        continue;
      }
      out[k] = toJsonSafe(v, k);
    }
    return out;
  }

  // Functions, symbols, etc.
  if (typeof value === "function") return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

/**
 * Serialize the canonical debug report to pretty-printed JSON.
 * Guarantees no undefined, no circular refs (via rebuild), Hebrew preserved.
 */
export function serializeAiIntakeDebugReport(
  report: AiIntakeDebugReportV1
): string {
  const safe = toJsonSafe(report) as AiIntakeDebugReportV1;
  return JSON.stringify(safe, null, 2);
}
