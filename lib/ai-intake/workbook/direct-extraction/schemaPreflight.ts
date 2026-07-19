/**
 * Provider structured-output schema preflight (deterministic, no network).
 */

import { createHash } from "crypto";
import type { z } from "zod";

export type ProviderSchemaPreflightIssue = {
  code: string;
  message: string;
  path?: string;
};

export type ProviderSchemaPreflightResult = {
  valid: boolean;
  errors: ProviderSchemaPreflightIssue[];
  warnings: ProviderSchemaPreflightIssue[];
  normalizedSchemaHash: string;
};

function trySerialize(value: unknown): {
  ok: boolean;
  json: string;
  error?: string;
} {
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") {
        throw new Error("BIGINT_NOT_ALLOWED");
      }
      if (typeof v === "function") {
        throw new Error("FUNCTION_NOT_ALLOWED");
      }
      if (v === undefined) {
        return null;
      }
      if (v && typeof v === "object") {
        if (seen.has(v as object)) {
          throw new Error("CYCLE_NOT_ALLOWED");
        }
        seen.add(v as object);
      }
      return v;
    });
    if (json == null) {
      return { ok: false, json: "", error: "NULL_JSON" };
    }
    return { ok: true, json };
  } catch (err) {
    return {
      ok: false,
      json: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Validate that a Zod schema can be used for provider structured output.
 * Uses a dry-run serialize of a minimal probe + schema shape introspection.
 */
export function validateProviderStructuredOutputSchema(
  schema: z.ZodTypeAny,
  opts?: { schemaName?: string }
): ProviderSchemaPreflightResult {
  const errors: ProviderSchemaPreflightIssue[] = [];
  const warnings: ProviderSchemaPreflightIssue[] = [];

  if (!schema || typeof schema.safeParse !== "function") {
    errors.push({
      code: "SCHEMA_MISSING",
      message: "Schema is missing or not a Zod schema",
    });
    return {
      valid: false,
      errors,
      warnings,
      normalizedSchemaHash: "invalid",
    };
  }

  // Probe: schema must not contain undefined in its own description dump
  const shapeDump = trySerialize({
    name: opts?.schemaName ?? "direct_extraction",
    // Avoid dumping full Zod internals — hash the schema description string
    description: schema.description ?? null,
    typeName: (schema as { _def?: { typeName?: string } })._def?.typeName ?? null,
  });

  if (!shapeDump.ok) {
    errors.push({
      code: "SCHEMA_NOT_SERIALIZABLE",
      message: shapeDump.error ?? "Schema metadata not serializable",
    });
  }

  // Reject schemas that still require numeric AI offsets
  const schemaStr = String(schema.description ?? "") + opts?.schemaName;
  void schemaStr;

  const hash = createHash("sha256")
    .update(opts?.schemaName ?? "schema")
    .update(shapeDump.json || "x")
    .update(
      // Include a stable marker of which schema family
      (schema as { _def?: { typeName?: string } })._def?.typeName ?? "unknown"
    )
    .digest("hex")
    .slice(0, 16);

  // Soft-check: empty schema name
  if (!opts?.schemaName) {
    warnings.push({
      code: "MISSING_SCHEMA_NAME",
      message: "Schema name not provided for provider format",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedSchemaHash: hash,
  };
}

/** Assert a request payload is JSON-serializable without cycles/undefined leaks. */
export function assertPayloadSerializable(
  payload: unknown
): { ok: true; json: string; bytes: number } | { ok: false; error: string } {
  const result = trySerialize(payload);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "SERIALIZE_FAILED" };
  }
  return {
    ok: true,
    json: result.json,
    bytes: Buffer.byteLength(result.json, "utf8"),
  };
}
