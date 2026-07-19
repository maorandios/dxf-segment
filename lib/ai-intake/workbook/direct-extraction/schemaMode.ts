/**
 * Schema mode: STABLE (production) vs EXPERIMENTAL_COMPACT (isolated).
 */

export type DirectExtractionSchemaMode = "STABLE" | "EXPERIMENTAL_COMPACT";

export function resolveDirectExtractionSchemaMode(
  envValue?: string | null
): DirectExtractionSchemaMode {
  const v = (
    envValue ??
    process.env.OMEGA_DIRECT_EXTRACTION_SCHEMA_MODE ??
    "STABLE"
  )
    .trim()
    .toUpperCase();
  if (v === "EXPERIMENTAL_COMPACT" || v === "COMPACT" || v === "V2") {
    return "EXPERIMENTAL_COMPACT";
  }
  return "STABLE";
}
