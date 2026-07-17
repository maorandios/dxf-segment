/**
 * Formatting helpers for Working Quote Table cells.
 */

export function formatQuoteDash(): string {
  return "—";
}

export function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return formatQuoteDash();
  return String(Math.trunc(value));
}

export function formatDecimal(
  value: number | null | undefined,
  places = 2
): string {
  if (value == null || !Number.isFinite(value)) return formatQuoteDash();
  const fixed = value.toFixed(places);
  return fixed.replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}

export function formatMeasurementMm(
  value: number | null | undefined,
  places = 1
): string {
  if (value == null || !Number.isFinite(value)) return formatQuoteDash();
  return formatDecimal(value, places);
}

export function formatAreaM2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return formatQuoteDash();
  if (value === 0) return "0";
  if (value < 0.0001) return value.toExponential(2);
  return formatDecimal(value, 4);
}

export function formatMassKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return formatQuoteDash();
  return formatDecimal(value, 3);
}

export function formatMaterial(value: string | null | undefined): string {
  if (value == null || !String(value).trim()) return formatQuoteDash();
  return String(value).trim();
}

export function presentationStatusLabelHe(
  status: "READY" | "NEEDS_REVIEW" | "WARNING" | "EXCLUDED"
): string {
  switch (status) {
    case "READY":
      return "תקין";
    case "NEEDS_REVIEW":
      return "דורש טיפול";
    case "WARNING":
      return "אזהרה";
    case "EXCLUDED":
      return "לא כלול";
    default:
      return status;
  }
}

export function issueSeverityLabelHe(
  severity: "BLOCKING" | "WARNING" | "INFO" | string
): string {
  if (severity === "BLOCKING") return "דורש טיפול";
  if (severity === "WARNING") return "אזהרה";
  if (severity === "INFO") return "מידע";
  return severity;
}

export function fieldStateLabelHe(state: string): string | null {
  switch (state) {
    case "CALCULATED":
      return "מחושב";
    case "INFERRED":
      return "הוסק";
    case "MISSING":
      return "חסר";
    case "CONFLICT":
      return "קונפליקט";
    case "AMBIGUOUS":
      return "לא חד-משמעי";
    case "USER_RESOLVED":
      return "שונה ידנית";
    case "NOT_APPLICABLE":
      return null;
    default:
      return null;
  }
}
