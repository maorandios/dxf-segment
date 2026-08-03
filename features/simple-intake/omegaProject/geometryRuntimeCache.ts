/**
 * Module-level, memory-only cache of hydrated DXF geometry.
 *
 * After loading a .omega project, we already have the geometry that was
 * computed at save-time (stored in derived/dxf-geometries.json). This cache
 * lets viewers/nesting code look that geometry up by filename or content
 * hash instead of immediately re-parsing every DXF file on load.
 *
 * Runtime-only — never written to any browser storage, cleared on demand.
 */

import type { ProcessedGeometry } from "@/types";
import { normalizeDxfFileKey } from "../normalizeDxfFileKey";
import type { SerializedDxfGeometryEntry, SlimProcessedGeometry } from "./types";

function toProcessedGeometry(
  geo: SlimProcessedGeometry | null
): ProcessedGeometry | null {
  if (!geo) return null;
  return { ...geo };
}

const byFilename = new Map<string, ProcessedGeometry | null>();
const byContentHash = new Map<string, ProcessedGeometry | null>();

export function setGeometryEntries(
  entries: ReadonlyArray<SerializedDxfGeometryEntry>
): void {
  for (const entry of entries) {
    const geometry = toProcessedGeometry(entry.geometry);
    const key = normalizeDxfFileKey(entry.filename);
    if (key) byFilename.set(key, geometry);
    if (entry.contentHash) byContentHash.set(entry.contentHash, geometry);
  }
}

/**
 * Returns `undefined` on a cache miss (caller should fall back to parsing),
 * `null` when the geometry is known to be unavailable/invalid.
 */
export function getGeometryByFilename(
  filename: string
): ProcessedGeometry | null | undefined {
  const key = normalizeDxfFileKey(filename);
  if (!key) return undefined;
  return byFilename.get(key);
}

export function getGeometryByContentHash(
  contentHash: string
): ProcessedGeometry | null | undefined {
  return byContentHash.get(contentHash);
}

export function clearGeometryCache(): void {
  byFilename.clear();
  byContentHash.clear();
}

// ── Parse/AI/matching/nesting invocation counters used by save/load diagnostics ──

let parseInvocationsDuringLoad = 0;
let aiInvocationsDuringLoad = 0;
let matchingInvocationsDuringLoad = 0;
let nestingInvocationsDuringLoad = 0;

export type LoadInvocationKind = "parse" | "ai" | "matching" | "nesting";

export function trackParseInvocation(
  kind: LoadInvocationKind = "parse"
): void {
  if (kind === "parse") parseInvocationsDuringLoad += 1;
  else if (kind === "ai") aiInvocationsDuringLoad += 1;
  else if (kind === "matching") matchingInvocationsDuringLoad += 1;
  else if (kind === "nesting") nestingInvocationsDuringLoad += 1;
}

export function getParseInvocationCountDuringLoad(
  kind: LoadInvocationKind = "parse"
): number {
  if (kind === "parse") return parseInvocationsDuringLoad;
  if (kind === "ai") return aiInvocationsDuringLoad;
  if (kind === "matching") return matchingInvocationsDuringLoad;
  return nestingInvocationsDuringLoad;
}

export function resetLoadCounters(): void {
  parseInvocationsDuringLoad = 0;
  aiInvocationsDuringLoad = 0;
  matchingInvocationsDuringLoad = 0;
  nestingInvocationsDuringLoad = 0;
}
