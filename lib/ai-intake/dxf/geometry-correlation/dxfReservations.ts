/**
 * Explicit DXF reservation states during geometry correlation / reconciliation.
 */

export type DxfReservationState =
  | "UNRESERVED"
  | "RESERVED_EXACT"
  | "RESERVED_GEOMETRY"
  | "HELD_BY_AMBIGUOUS_SET"
  | "HELD_BY_AMBIGUITY"
  | "INVALID_GEOMETRY"
  | "PENDING_SOURCE_EXTRACTION"
  | "EMITTED_AS_ORPHAN";

export type DxfReservationRecord = {
  registryEntryId: string;
  canonicalPartId: string | null;
  state: DxfReservationState;
  reservingOccurrenceId: string | null;
  ambiguityGroupId: string | null;
  ambiguityGroupIds: string[];
  orphanDecision:
    | "NOT_ORPHAN"
    | "ORPHAN"
    | "HELD"
    | "PENDING_SOURCE_EXTRACTION"
    | null;
};

export type GeometryAssignmentLike = {
  sourceOccurrenceId: string;
  status: string;
  matchedRegistryEntryId: string | null;
  candidates?: Array<{ registryEntryId?: string; dxfRegistryEntryId?: string }>;
};

/**
 * Build reservation map from correlation assignments.
 * Held ambiguous candidates are not emitted as ordinary orphans.
 */
export function buildDxfReservations(args: {
  registry: Array<{
    id: string;
    canonicalPartId?: string | null;
    geometryStatus?: string;
  }>;
  assignments: GeometryAssignmentLike[];
  reservedExactRegistryIds?: string[];
  /**
   * When workbook source extraction failed with candidate part data,
   * unreserved DXFs are PENDING_SOURCE_EXTRACTION — not ordinary orphans.
   */
  pendingSourceExtraction?: boolean;
}): DxfReservationRecord[] {
  const byId = new Map<string, DxfReservationRecord>();

  for (const r of args.registry) {
    const invalid =
      r.geometryStatus === "INVALID" || r.geometryStatus === "EMPTY";
    byId.set(r.id, {
      registryEntryId: r.id,
      canonicalPartId: r.canonicalPartId ?? null,
      state: invalid ? "INVALID_GEOMETRY" : "UNRESERVED",
      reservingOccurrenceId: null,
      ambiguityGroupId: null,
      ambiguityGroupIds: [],
      orphanDecision: null,
    });
  }

  for (const id of args.reservedExactRegistryIds ?? []) {
    const rec = byId.get(id);
    if (!rec) continue;
    rec.state = "RESERVED_EXACT";
    rec.orphanDecision = "NOT_ORPHAN";
  }

  for (const a of args.assignments) {
    if (
      a.matchedRegistryEntryId &&
      (a.status === "MATCHED_BY_GEOMETRY" ||
        a.status === "MATCHED_BY_EXACT_IDENTIFIER")
    ) {
      const rec = byId.get(a.matchedRegistryEntryId);
      if (!rec) continue;
      rec.state =
        a.status === "MATCHED_BY_EXACT_IDENTIFIER"
          ? "RESERVED_EXACT"
          : "RESERVED_GEOMETRY";
      rec.reservingOccurrenceId = a.sourceOccurrenceId;
      rec.orphanDecision = "NOT_ORPHAN";
    }

    if (a.status === "AMBIGUOUS_GEOMETRY_MATCH") {
      for (const c of a.candidates ?? []) {
        const cid = c.registryEntryId ?? c.dxfRegistryEntryId;
        if (!cid) continue;
        const rec = byId.get(cid);
        if (!rec) continue;
        if (
          rec.state === "RESERVED_EXACT" ||
          rec.state === "RESERVED_GEOMETRY"
        ) {
          continue;
        }
        rec.state = "HELD_BY_AMBIGUITY";
        rec.ambiguityGroupId = a.sourceOccurrenceId;
        if (!rec.ambiguityGroupIds.includes(a.sourceOccurrenceId)) {
          rec.ambiguityGroupIds.push(a.sourceOccurrenceId);
        }
        rec.orphanDecision = "HELD";
      }
    }

    if (a.status === "INVALID_DXF_GEOMETRY" && a.matchedRegistryEntryId) {
      const rec = byId.get(a.matchedRegistryEntryId);
      if (rec) {
        rec.state = "INVALID_GEOMETRY";
        rec.orphanDecision = "NOT_ORPHAN";
      }
    }
  }

  for (const rec of byId.values()) {
    if (rec.state === "UNRESERVED") {
      if (args.pendingSourceExtraction) {
        rec.state = "PENDING_SOURCE_EXTRACTION";
        rec.orphanDecision = "PENDING_SOURCE_EXTRACTION";
      } else {
        rec.orphanDecision = "ORPHAN";
      }
    }
  }

  return [...byId.values()];
}

export function assertNoConfirmedMatchAsOrphan(
  reservations: DxfReservationRecord[],
  emittedOrphanRegistryIds: string[]
): string[] {
  const failures: string[] = [];
  const reserved = new Set(
    reservations
      .filter(
        (r) =>
          r.state === "RESERVED_EXACT" || r.state === "RESERVED_GEOMETRY"
      )
      .map((r) => r.registryEntryId)
  );
  for (const id of emittedOrphanRegistryIds) {
    if (reserved.has(id)) {
      failures.push(`MATCHED_ORPHAN_DUPLICATION:${id}`);
    }
  }
  return failures;
}

export function assertOneToOneConfirmedAssignments(
  reservations: DxfReservationRecord[]
): string[] {
  const failures: string[] = [];
  const byOcc = new Map<string, string[]>();
  for (const r of reservations) {
    if (
      (r.state === "RESERVED_EXACT" || r.state === "RESERVED_GEOMETRY") &&
      r.reservingOccurrenceId
    ) {
      const list = byOcc.get(r.reservingOccurrenceId) ?? [];
      list.push(r.registryEntryId);
      byOcc.set(r.reservingOccurrenceId, list);
    }
  }
  // Also: one DXF → one occurrence (already encoded in reservation map uniqueness)
  const dxfOwners = new Map<string, string>();
  for (const r of reservations) {
    if (
      (r.state === "RESERVED_EXACT" || r.state === "RESERVED_GEOMETRY") &&
      r.reservingOccurrenceId
    ) {
      const prev = dxfOwners.get(r.registryEntryId);
      if (prev && prev !== r.reservingOccurrenceId) {
        failures.push(
          `DUPLICATE_CONFIRMED_DXF:${r.registryEntryId}:${prev},${r.reservingOccurrenceId}`
        );
      }
      dxfOwners.set(r.registryEntryId, r.reservingOccurrenceId);
    }
  }
  return failures;
}

/** Registry IDs that must not be emitted as ordinary orphan quote rows. */
export function heldOrReservedRegistryIds(
  reservations: DxfReservationRecord[]
): Set<string> {
  return new Set(
    reservations
      .filter(
        (r) =>
          r.state === "RESERVED_EXACT" ||
          r.state === "RESERVED_GEOMETRY" ||
          r.state === "HELD_BY_AMBIGUOUS_SET" ||
          r.state === "HELD_BY_AMBIGUITY" ||
          r.state === "INVALID_GEOMETRY" ||
          r.state === "PENDING_SOURCE_EXTRACTION"
      )
      .map((r) => r.registryEntryId)
  );
}
