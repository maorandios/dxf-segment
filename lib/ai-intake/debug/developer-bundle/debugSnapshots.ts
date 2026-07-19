/**
 * Detached debug snapshots — cycle-free DTOs for developer JSON.
 */

export function deepSnapshot<T>(value: T, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return { $ref: "[ArrayCycleAvoided]" };
    seen.add(value);
    return value.map((v) => deepSnapshot(v, seen));
  }
  if (seen.has(value as object)) {
    return { $ref: "[ObjectCycleAvoided]" };
  }
  seen.add(value as object);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = deepSnapshot(v, seen);
  }
  return out;
}

export type DebugEntityRegistry = {
  dxfReservations: Record<string, unknown>;
  ambiguityGroups: Record<string, unknown>;
  sourceOccurrences: Record<string, unknown>;
  reviewRows: Record<string, unknown>;
};

export function buildDebugEntityRegistry(args: {
  reservations?: Array<{ registryEntryId: string; [k: string]: unknown }>;
  ambiguityGroups?: Array<{ ambiguityGroupId: string; [k: string]: unknown }>;
  sourceOccurrences?: Array<{ sourceOccurrenceId: string; [k: string]: unknown }>;
  reviewRows?: Array<{ rowId: string; [k: string]: unknown }>;
}): DebugEntityRegistry {
  const dxfReservations: Record<string, unknown> = {};
  for (const r of args.reservations ?? []) {
    dxfReservations[r.registryEntryId] = deepSnapshot(r);
  }
  const ambiguityGroups: Record<string, unknown> = {};
  for (const g of args.ambiguityGroups ?? []) {
    ambiguityGroups[g.ambiguityGroupId] = deepSnapshot(g);
  }
  const sourceOccurrences: Record<string, unknown> = {};
  for (const s of args.sourceOccurrences ?? []) {
    sourceOccurrences[s.sourceOccurrenceId] = deepSnapshot(s);
  }
  const reviewRows: Record<string, unknown> = {};
  for (const r of args.reviewRows ?? []) {
    reviewRows[r.rowId] = deepSnapshot(r);
  }
  return { dxfReservations, ambiguityGroups, sourceOccurrences, reviewRows };
}

export function validateDebugSnapshots(args: {
  sections: Record<string, unknown>;
  entities?: DebugEntityRegistry | null;
}): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const json = JSON.stringify(args.sections);
  if (json.includes('"[Circular]"') || json.includes("[Circular]")) {
    failures.push("CIRCULAR_PLACEHOLDER_IN_CANONICAL_SECTION");
  }

  const walk = (node: unknown, path: string): void => {
    if (node == null) return;
    if (typeof node === "string" && node === "[Circular]") {
      failures.push(`CIRCULAR_AT:${path}`);
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.$ref === "string" && args.entities) {
      const ref = obj.$ref;
      const m = ref.match(/^dxf-reservation:(.+)$/);
      if (m && !args.entities.dxfReservations[m[1]!]) {
        failures.push(`UNRESOLVED_REF:${ref}`);
      }
      const a = ref.match(/^ambiguity-group:(.+)$/);
      if (a && !args.entities.ambiguityGroups[a[1]!]) {
        failures.push(`UNRESOLVED_REF:${ref}`);
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      walk(v, `${path}.${k}`);
    }
  };

  for (const [name, section] of Object.entries(args.sections)) {
    walk(section, name);
  }

  return { ok: failures.length === 0, failures };
}
