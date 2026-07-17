import type { MeasurementUnit, NormalizedUnit } from "./types";
import { NORMALIZATION_TOLERANCES } from "./normalizationConfig";

export type ConversionResult =
  | { ok: true; value: number; normalizedUnit: NormalizedUnit }
  | { ok: false; code: "DOCUMENT_UNIT_INVALID"; message: string };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function rejectNegative(
  value: number,
  allowZero: boolean
): ConversionResult | null {
  if (value < 0 || (!allowZero && value === 0)) {
    return {
      ok: false,
      code: "DOCUMENT_UNIT_INVALID",
      message: `Non-positive value ${value} is invalid for this measurement domain`,
    };
  }
  return null;
}

/** Convert a linear measurement to millimeters. */
export function convertLengthToMm(
  value: number,
  unit: MeasurementUnit
): ConversionResult {
  if (!isFiniteNumber(value)) {
    return {
      ok: false,
      code: "DOCUMENT_UNIT_INVALID",
      message: "Length value is not a finite number",
    };
  }
  const neg = rejectNegative(value, false);
  if (neg) return neg;
  if (unit === "MM") return { ok: true, value, normalizedUnit: "MM" };
  if (unit === "CM") return { ok: true, value: value * 10, normalizedUnit: "MM" };
  if (unit === "M") {
    return { ok: true, value: value * 1000, normalizedUnit: "MM" };
  }
  return {
    ok: false,
    code: "DOCUMENT_UNIT_INVALID",
    message: `Unsupported linear unit: ${unit}`,
  };
}

/** Convert an area measurement to mm². */
export function convertAreaToMm2(
  value: number,
  unit: MeasurementUnit
): ConversionResult {
  if (!isFiniteNumber(value)) {
    return {
      ok: false,
      code: "DOCUMENT_UNIT_INVALID",
      message: "Area value is not a finite number",
    };
  }
  const neg = rejectNegative(value, false);
  if (neg) return neg;
  if (unit === "MM2") return { ok: true, value, normalizedUnit: "MM2" };
  if (unit === "CM2") {
    return { ok: true, value: value * 100, normalizedUnit: "MM2" };
  }
  if (unit === "M2") {
    return { ok: true, value: value * 1_000_000, normalizedUnit: "MM2" };
  }
  return {
    ok: false,
    code: "DOCUMENT_UNIT_INVALID",
    message: `Unsupported area unit: ${unit}`,
  };
}

/** Convert a mass measurement to kilograms. */
export function convertMassToKg(
  value: number,
  unit: MeasurementUnit
): ConversionResult {
  if (!isFiniteNumber(value)) {
    return {
      ok: false,
      code: "DOCUMENT_UNIT_INVALID",
      message: "Mass value is not a finite number",
    };
  }
  const neg = rejectNegative(value, true);
  if (neg) return neg;
  if (unit === "G") {
    return { ok: true, value: value / 1000, normalizedUnit: "KG" };
  }
  if (unit === "KG") return { ok: true, value, normalizedUnit: "KG" };
  if (unit === "TON") {
    return { ok: true, value: value * 1000, normalizedUnit: "KG" };
  }
  return {
    ok: false,
    code: "DOCUMENT_UNIT_INVALID",
    message: `Unsupported mass unit: ${unit}`,
  };
}

export function convertToNormalized(
  value: number,
  unit: MeasurementUnit,
  kind: "LINEAR" | "AREA" | "MASS"
): ConversionResult {
  if (kind === "LINEAR") return convertLengthToMm(value, unit);
  if (kind === "AREA") return convertAreaToMm2(value, unit);
  return convertMassToKg(value, unit);
}

export function nearlyEqual(
  a: number,
  b: number,
  absolute: number,
  relative: number,
  eps = NORMALIZATION_TOLERANCES.floatingPointEpsilon
): boolean {
  const diff = Math.abs(a - b);
  if (diff <= eps) return true;
  const relTol = Math.max(Math.abs(a), Math.abs(b)) * relative;
  return diff <= Math.max(absolute, relTol, eps);
}

export function areaNearlyEqual(a: number, b: number): boolean {
  return nearlyEqual(
    a,
    b,
    0,
    NORMALIZATION_TOLERANCES.areaRelativeRatio
  );
}

export function dimensionNearlyEqual(a: number, b: number): boolean {
  return nearlyEqual(
    a,
    b,
    NORMALIZATION_TOLERANCES.dimensionAbsoluteMm,
    NORMALIZATION_TOLERANCES.dimensionRelativeRatio
  );
}

export function weightNearlyEqual(a: number, b: number): boolean {
  return nearlyEqual(a, b, 0, NORMALIZATION_TOLERANCES.weightRelativeRatio);
}

export function fieldKind(
  field: "THICKNESS" | "WIDTH" | "HEIGHT" | "AREA" | "TOTAL_AREA" | "UNIT_WEIGHT" | "TOTAL_WEIGHT"
): "LINEAR" | "AREA" | "MASS" {
  if (field === "AREA" || field === "TOTAL_AREA") return "AREA";
  if (field === "UNIT_WEIGHT" || field === "TOTAL_WEIGHT") return "MASS";
  return "LINEAR";
}

export function candidateUnitsForKind(
  kind: "LINEAR" | "AREA" | "MASS"
): MeasurementUnit[] {
  if (kind === "LINEAR") return ["MM", "CM", "M"];
  if (kind === "AREA") return ["MM2", "CM2", "M2"];
  return ["G", "KG", "TON"];
}
