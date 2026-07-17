/**
 * Infer character spans for fixed-width headers from header text + data alignment.
 */

import { mapFixedWidthHeaderSemantic } from "./mapFixedWidthHeaderSemantic";
import type { FixedWidthHeaderField } from "./types";

/**
 * Split a header line into tokens with character positions.
 * Prefers runs of 2+ spaces as separators (not every single space).
 */
export function tokenizeFixedWidthHeader(headerText: string): Array<{
  text: string;
  start: number;
  end: number;
}> {
  const text = String(headerText ?? "");
  const tokens: Array<{ text: string; start: number; end: number }> = [];
  const re = /\S+(?:\s\S+)*/g;
  // First pass: split on 2+ spaces
  const parts = text.split(/ {2,}/);
  if (parts.length >= 3) {
    let cursor = 0;
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const start = text.indexOf(trimmed, cursor);
      if (start < 0) continue;
      const end = start + trimmed.length;
      tokens.push({ text: trimmed, start, end });
      cursor = end;
    }
    return tokens;
  }
  // Fallback: word tokens (still require later validation of field count)
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/**
 * Build header fields; end of each span is start of next (or end of line).
 */
export function inferFixedWidthHeaderSpans(
  headerText: string,
  sampleDataLines: string[] = []
): FixedWidthHeaderField[] {
  const tokens = tokenizeFixedWidthHeader(headerText);
  if (tokens.length < 3) return [];

  const fields: FixedWidthHeaderField[] = tokens.map((t, index) => {
    const nextStart =
      index + 1 < tokens.length ? tokens[index + 1]!.start : headerText.length;
    return {
      index,
      rawHeader: t.text,
      semantic: mapFixedWidthHeaderSemantic(t.text),
      start: t.start,
      end: Math.max(t.end, nextStart),
      confidence: 0.75,
    };
  });

  // Refine ends using sample alignment when values form clear columns
  if (sampleDataLines.length >= 2) {
    const before = fields.map((f) => ({ ...f }));
    refineSpansFromSamples(fields, sampleDataLines);
    if (!spansAreValid(fields)) {
      // Revert corrupt refinement
      for (let i = 0; i < fields.length; i++) {
        fields[i] = before[i]!;
      }
    }
  }

  // Last field extends to a large end so trailing values are captured
  if (fields.length > 0) {
    const last = fields[fields.length - 1]!;
    last.end = Math.max(last.end, headerText.length + 40);
  }

  return fields;
}

function spansAreValid(fields: FixedWidthHeaderField[]): boolean {
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    if (!(f.end > f.start)) return false;
    if (i > 0 && f.start < fields[i - 1]!.start) return false;
  }
  return true;
}

function refineSpansFromSamples(
  fields: FixedWidthHeaderField[],
  samples: string[]
): void {
  // For each interior boundary, prefer the median gap start among samples
  for (let i = 0; i < fields.length - 1; i++) {
    const left = fields[i]!;
    const right = fields[i + 1]!;
    const boundaryCandidates: number[] = [];
    for (const line of samples) {
      // Find transition from non-space after left.start toward right
      const slice = line.slice(left.start, Math.min(line.length, right.start + 8));
      const gap = slice.search(/ {2,}/);
      if (gap >= 0) {
        boundaryCandidates.push(left.start + gap);
      }
    }
    if (boundaryCandidates.length >= Math.ceil(samples.length * 0.5)) {
      boundaryCandidates.sort((a, b) => a - b);
      const mid = boundaryCandidates[Math.floor(boundaryCandidates.length / 2)]!;
      left.end = mid;
      right.start = mid;
      left.confidence = Math.min(0.95, left.confidence + 0.1);
      right.confidence = Math.min(0.95, right.confidence + 0.1);
    }
  }
}

export function countRecognizableSemantics(
  fields: FixedWidthHeaderField[]
): number {
  return fields.filter((f) => f.semantic !== "UNKNOWN").length;
}
