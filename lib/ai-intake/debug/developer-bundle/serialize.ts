/**
 * Safe JSON serialization for developer debug bundles.
 * Handles cycles, binaries, secrets, special numbers.
 */

import { toJsonSafe } from "../serializeAiIntakeDebugReport";

const SECRET_KEY_RE =
  /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|set-cookie|x-api-key|password|secret|bearer|supabase|service[_-]?role)$/i;

export function serializeOmegaIntakeDeveloperDebug(
  bundle: unknown
): string {
  const safe = toJsonSafeWithCycles(bundle);
  return JSON.stringify(safe, jsonNumberReplacer, 2);
}

function jsonNumberReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    if (!Number.isFinite(value)) return String(value);
  }
  return value;
}

/**
 * Cycle-safe wrapper around toJsonSafe.
 */
export function toJsonSafeWithCycles(
  value: unknown,
  seen = new WeakSet<object>(),
  keyHint?: string
): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  if (keyHint && SECRET_KEY_RE.test(keyHint)) return "[REDACTED]";

  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular]";
    }
    // File / Blob / ArrayBuffer handled by toJsonSafe; mark seen for plain objects
    if (
      !(value instanceof Date) &&
      !(value instanceof Error) &&
      !(typeof File !== "undefined" && value instanceof File) &&
      !(typeof Blob !== "undefined" && value instanceof Blob) &&
      !(typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer)
    ) {
      seen.add(value as object);
    }
  }

  if (typeof Blob !== "undefined" && value instanceof Blob && !(value instanceof File)) {
    return { __type: "Blob", size: value.size, type: value.type };
  }

  if (Array.isArray(value)) {
    return value.map((v) => toJsonSafeWithCycles(v, seen));
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date) && !(value instanceof Error) && !(value instanceof Map) && !(value instanceof Set)) {
    if (typeof File !== "undefined" && value instanceof File) {
      return toJsonSafe(value);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = toJsonSafeWithCycles(v, seen, k);
    }
    return out;
  }

  return toJsonSafe(value, keyHint);
}

export function validateOmegaIntakeDeveloperDebug(bundle: unknown): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, errors: ["NOT_AN_OBJECT"] };
  }
  const b = bundle as Record<string, unknown>;
  if (b.schemaVersion !== "omega-intake-developer-debug/v1") {
    errors.push("INVALID_SCHEMA_VERSION");
  }
  if (!b.run || typeof b.run !== "object") errors.push("MISSING_RUN");
  if (!Array.isArray(b.stageTimeline)) errors.push("MISSING_STAGE_TIMELINE");
  if (!Array.isArray(b.inputManifest)) errors.push("MISSING_INPUT_MANIFEST");
  if (!b.finalOutcome) errors.push("MISSING_FINAL_OUTCOME");
  if (!Array.isArray(b.invariantChecks)) errors.push("MISSING_INVARIANTS");
  return { ok: errors.length === 0, errors };
}

export function downloadOmegaIntakeDeveloperDebug(args: {
  bundle: unknown;
  projectName: string;
  filename?: string;
}): { filename: string; byteLength: number } {
  const json = serializeOmegaIntakeDeveloperDebug(args.bundle);
  const safeName = (args.projectName || "project")
    .replace(/[^\w\u0590-\u05FF\-]+/g, "_")
    .slice(0, 48);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename =
    args.filename ?? `omega-debug-${safeName}-${ts}.json`;

  if (typeof window === "undefined" || typeof document === "undefined") {
    return { filename, byteLength: json.length };
  }

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename, byteLength: json.length };
}
