/**
 * Canonical value comparison for review decisions.
 * Prevents no-op edits from creating decision events.
 */

export function parseNumericInput(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) return null;
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 12, "12", and "12.0" compare equal. */
export function numericValuesEqual(
  current: number | null | undefined,
  incoming: unknown
): boolean {
  const next = parseNumericInput(incoming);
  if (current == null && next == null) return true;
  if (current == null || next == null) return false;
  return current === next;
}

export function normalizeStringInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** "S235" and " S235 " compare equal. */
export function stringValuesEqual(
  current: string | null | undefined,
  incoming: unknown
): boolean {
  const next = normalizeStringInput(incoming);
  const cur =
    current == null ? null : normalizeStringInput(String(current));
  return cur === next;
}
