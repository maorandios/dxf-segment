/**
 * Safe regex contract for REGEX_CAPTURE — no dynamic code execution.
 */

import { INTERPRETER_LIMITS } from "./types";

const DANGEROUS =
  /\(\?[=!<]|\\[1-9]|\(\?\#|\[\^?[^\]]*\[\^|\{(?:\d{3,}|\d+,\d{3,})\}/;

export type SafeRegexResult =
  | { ok: true; regex: RegExp; pattern: string }
  | { ok: false; reason: string };

export function validateSafeRegexPattern(pattern: string): SafeRegexResult {
  if (typeof pattern !== "string" || !pattern.trim()) {
    return { ok: false, reason: "EMPTY_PATTERN" };
  }
  if (pattern.length > INTERPRETER_LIMITS.maxRegexPatternLength) {
    return { ok: false, reason: "PATTERN_TOO_LONG" };
  }
  if (DANGEROUS.test(pattern)) {
    return { ok: false, reason: "DANGEROUS_CONSTRUCT" };
  }
  // Reject nested unbounded quantifiers that commonly cause ReDoS
  if (/(\+|\*)\{|\([^)]*[+*][^)]*\)[+*]/.test(pattern)) {
    return { ok: false, reason: "UNBOUNDED_NESTING" };
  }
  try {
    const regex = new RegExp(pattern);
    return { ok: true, regex, pattern };
  } catch {
    return { ok: false, reason: "INVALID_SYNTAX" };
  }
}

export function safeRegexCapture(args: {
  text: string;
  pattern: string;
  groupIndex: number;
}): { ok: true; value: string | null } | { ok: false; reason: string } {
  const validated = validateSafeRegexPattern(args.pattern);
  if (!validated.ok) return validated;
  const m = validated.regex.exec(args.text);
  if (!m) return { ok: true, value: null };
  if (args.groupIndex < 0 || args.groupIndex >= m.length) {
    return { ok: false, reason: "GROUP_INDEX_OUT_OF_RANGE" };
  }
  return { ok: true, value: m[args.groupIndex] ?? null };
}
