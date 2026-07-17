import { plateAreaMm2FromBoundingBox } from "@/lib/geometry/plateAreaFromBoundingBox";
import { densityForMaterial } from "../geometryComparisonConfig";
import { NORMALIZATION_TOLERANCES } from "./normalizationConfig";
import { compareWithPrecision } from "./precisionCompare";
import { parseNumericWithOptionalUnit } from "./parseUnitText";
import {
  convertAreaToMm2,
  convertLengthToMm,
  convertMassToKg,
  candidateUnitsForKind,
} from "./unitConvert";
import type {
  ColumnUnitProfile,
  DxfUnitCorrelationRef,
  MeasurementUnit,
  RawDocumentPartRow,
  RawMeasurement,
  SemanticMeasurementField,
  StructuredNormalizationIssue,
} from "./types";

export type TableUnitAssignment = {
  thickness: MeasurementUnit | null;
  width: MeasurementUnit | null;
  height: MeasurementUnit | null;
  area: MeasurementUnit | null;
  totalArea: MeasurementUnit | null;
  unitWeight: MeasurementUnit | null;
  totalWeight: MeasurementUnit | null;
};

export type TableUnitEvidenceGroup =
  | "HEADER"
  | "EXPLICIT_CELL"
  | "ROW_GEOMETRY"
  | "ROW_TOTAL_AREA"
  | "ROW_DENSITY_WEIGHT"
  | "ROW_TOTAL_WEIGHT"
  | "DXF_DIMENSIONS"
  | "DXF_AREA"
  | "DOMAIN_HINT";

export type TableUnitInferenceCandidate = {
  assignment: TableUnitAssignment;
  score: number;
  supportingRowCount: number;
  contradictingRowCount: number;
  notComparableRowCount: number;
  evidence: string[];
  evidenceGroups: TableUnitEvidenceGroup[];
};

export type TableUnitInferenceResult = {
  tableId: string;
  sheetName: string | null;
  resolvedAssignment: TableUnitAssignment | null;
  status:
    | "RESOLVED"
    | "PARTIALLY_RESOLVED"
    | "AMBIGUOUS"
    | "INSUFFICIENT_EVIDENCE";
  confidence: number;
  candidates: TableUnitInferenceCandidate[];
  evidence: string[];
  issues: StructuredNormalizationIssue[];
};

const FIELD_KEYS = [
  "thickness",
  "width",
  "height",
  "area",
  "totalArea",
  "unitWeight",
  "totalWeight",
] as const;

type AssignmentField = (typeof FIELD_KEYS)[number];

const FIELD_TO_SEMANTIC: Record<AssignmentField, SemanticMeasurementField> = {
  thickness: "THICKNESS",
  width: "WIDTH",
  height: "HEIGHT",
  area: "AREA",
  totalArea: "TOTAL_AREA",
  unitWeight: "UNIT_WEIGHT",
  totalWeight: "TOTAL_WEIGHT",
};

function emptyAssignment(): TableUnitAssignment {
  return {
    thickness: null,
    width: null,
    height: null,
    area: null,
    totalArea: null,
    unitWeight: null,
    totalWeight: null,
  };
}

function numericRaw(raw: RawMeasurement | null | undefined): number | null {
  if (!raw) return null;
  return parseNumericWithOptionalUnit(raw.rawValue, raw.rawText).value;
}

function explicitUnit(raw: RawMeasurement | null | undefined): MeasurementUnit | null {
  if (!raw) return null;
  return parseNumericWithOptionalUnit(raw.rawValue, raw.rawText).explicitUnit;
}

function quantityOf(row: RawDocumentPartRow): number | null {
  return numericRaw(row.quantity);
}

function precisionPositive(status: string): boolean {
  return (
    status === "EXACT_MATCH" ||
    status === "MATCH_WITHIN_TOLERANCE" ||
    status === "MATCH_AFTER_ROUNDING"
  );
}

function assignmentKey(a: TableUnitAssignment): string {
  return FIELD_KEYS.map((k) => `${k}=${a[k] ?? "-"}`).join("|");
}

function cloneAssignment(a: TableUnitAssignment): TableUnitAssignment {
  return { ...a };
}

function linearToMm(value: number, unit: MeasurementUnit): number | null {
  const c = convertLengthToMm(value, unit);
  return c.ok ? c.value : null;
}

function areaToMm2(value: number, unit: MeasurementUnit): number | null {
  const c = convertAreaToMm2(value, unit);
  return c.ok ? c.value : null;
}

function massToKg(value: number, unit: MeasurementUnit): number | null {
  const c = convertMassToKg(value, unit);
  return c.ok ? c.value : null;
}

/**
 * Collect fixed units from reliable headers and unanimous explicit cell units.
 */
function collectConstraints(args: {
  profiles: ColumnUnitProfile[];
  rows: RawDocumentPartRow[];
  tableId: string;
  sheetName: string | null;
}): {
  fixed: TableUnitAssignment;
  domain: Record<AssignmentField, MeasurementUnit[]>;
  headerFixed: Set<AssignmentField>;
} {
  const fixed = emptyAssignment();
  const headerFixed = new Set<AssignmentField>();
  const present = new Set<AssignmentField>();

  for (const profile of args.profiles) {
    if (profile.tableId !== args.tableId) continue;
    if (profile.sheetName !== args.sheetName) continue;
    const field = (Object.entries(FIELD_TO_SEMANTIC).find(
      ([, sem]) => sem === profile.semanticField
    )?.[0] ?? null) as AssignmentField | null;
    if (field) present.add(field);
  }

  for (const row of args.rows) {
    if (row.source.tableId !== args.tableId) continue;
    for (const field of FIELD_KEYS) {
      if (numericRaw(row[field]) != null) present.add(field);
    }
  }

  const domain: Record<AssignmentField, MeasurementUnit[]> = {
    thickness: [],
    width: [],
    height: [],
    area: [],
    totalArea: [],
    unitWeight: [],
    totalWeight: [],
  };

  for (const field of present) {
    const kind =
      field === "area" || field === "totalArea"
        ? "AREA"
        : field === "unitWeight" || field === "totalWeight"
          ? "MASS"
          : "LINEAR";
    domain[field] = [...candidateUnitsForKind(kind)];
  }

  for (const profile of args.profiles) {
    if (profile.tableId !== args.tableId) continue;
    if (profile.sheetName !== args.sheetName) continue;
    const field = (Object.entries(FIELD_TO_SEMANTIC).find(
      ([, sem]) => sem === profile.semanticField
    )?.[0] ?? null) as AssignmentField | null;
    if (!field) continue;

    if (profile.statedHeaderUnit) {
      fixed[field] = profile.statedHeaderUnit;
      domain[field] = [profile.statedHeaderUnit];
      headerFixed.add(field);
    }
  }

  for (const field of FIELD_KEYS) {
    if (!present.has(field) || fixed[field]) continue;
    const explicit = new Set<MeasurementUnit>();
    let nonEmpty = 0;
    let withExplicit = 0;
    for (const row of args.rows) {
      if (row.source.tableId !== args.tableId) continue;
      if (numericRaw(row[field]) == null) continue;
      nonEmpty += 1;
      const u = explicitUnit(row[field]);
      if (u) {
        withExplicit += 1;
        explicit.add(u);
      }
    }
    // Only constrain the column when every non-empty cell carries the same explicit unit.
    // A single explicit cell must not force the whole column (per-cell override remains).
    if (explicit.size === 1 && withExplicit === nonEmpty && nonEmpty > 0) {
      const only = [...explicit][0]!;
      domain[field] = [only];
      fixed[field] = only;
    }
  }

  return { fixed, domain, headerFixed };
}

function* cartesianAssignments(
  domain: Record<AssignmentField, MeasurementUnit[]>,
  fixed: TableUnitAssignment
): Generator<TableUnitAssignment> {
  const active = FIELD_KEYS.filter((f) => domain[f].length > 0);
  const free = active.filter((f) => !fixed[f]);

  if (free.length === 0) {
    const a = emptyAssignment();
    for (const f of active) a[f] = fixed[f];
    yield a;
    return;
  }

  let total = 1;
  for (const f of free) total *= domain[f].length;
  const MAX = 3000;
  if (total > MAX) {
    yield* coherentPackAssignments(domain, fixed);
    return;
  }

  for (let n = 0; n < total; n += 1) {
    const a = emptyAssignment();
    for (const f of active) {
      if (fixed[f]) a[f] = fixed[f];
    }
    let rem = n;
    for (let i = free.length - 1; i >= 0; i -= 1) {
      const f = free[i]!;
      const opts = domain[f];
      const idx = rem % opts.length;
      rem = Math.floor(rem / opts.length);
      a[f] = opts[idx]!;
    }
    yield a;
  }
}

/** Reduced search: shared linear scale + area scale + mass unit. */
function* coherentPackAssignments(
  domain: Record<AssignmentField, MeasurementUnit[]>,
  fixed: TableUnitAssignment
): Generator<TableUnitAssignment> {
  const linearOpts = intersect(
    domain.width.length ? domain.width : ["MM", "CM", "M"],
    domain.height.length ? domain.height : ["MM", "CM", "M"],
    domain.thickness.length ? domain.thickness : ["MM", "CM", "M"]
  );
  const areaOpts = intersect(
    domain.area.length ? domain.area : ["MM2", "CM2", "M2"],
    domain.totalArea.length ? domain.totalArea : ["MM2", "CM2", "M2"]
  );
  const massOpts = intersect(
    domain.unitWeight.length ? domain.unitWeight : ["G", "KG", "TON"],
    domain.totalWeight.length ? domain.totalWeight : ["G", "KG", "TON"]
  );

  for (const lin of linearOpts) {
    for (const ar of areaOpts) {
      for (const mass of massOpts) {
        const a = emptyAssignment();
        if (domain.thickness.length) a.thickness = fixed.thickness ?? lin;
        if (domain.width.length) a.width = fixed.width ?? lin;
        if (domain.height.length) a.height = fixed.height ?? lin;
        if (domain.area.length) a.area = fixed.area ?? ar;
        if (domain.totalArea.length) a.totalArea = fixed.totalArea ?? ar;
        if (domain.unitWeight.length) a.unitWeight = fixed.unitWeight ?? mass;
        if (domain.totalWeight.length) a.totalWeight = fixed.totalWeight ?? mass;
        // Also allow width/height MM with area M2 (common plate layout)
        yield a;
      }
    }
  }
  // Extra: MM linear + M2 area + KG mass (most common CNC plate)
  if (
    (!fixed.width || fixed.width === "MM") &&
    (!fixed.area || fixed.area === "M2") &&
    (!fixed.unitWeight || fixed.unitWeight === "KG")
  ) {
    const a = emptyAssignment();
    if (domain.thickness.length) a.thickness = fixed.thickness ?? "MM";
    if (domain.width.length) a.width = fixed.width ?? "MM";
    if (domain.height.length) a.height = fixed.height ?? "MM";
    if (domain.area.length) a.area = fixed.area ?? "M2";
    if (domain.totalArea.length) a.totalArea = fixed.totalArea ?? "M2";
    if (domain.unitWeight.length) a.unitWeight = fixed.unitWeight ?? "KG";
    if (domain.totalWeight.length) a.totalWeight = fixed.totalWeight ?? "KG";
    yield a;
  }
}

function intersect(...lists: MeasurementUnit[][]): MeasurementUnit[] {
  if (lists.length === 0) return [];
  return lists[0]!.filter((u) => lists.every((l) => l.includes(u)));
}

type RowEval = {
  support: boolean;
  contradict: boolean;
  notComparable: boolean;
  groups: TableUnitEvidenceGroup[];
  evidence: string[];
};

function evaluateAssignmentOnRow(args: {
  assignment: TableUnitAssignment;
  row: RawDocumentPartRow;
  dxf: DxfUnitCorrelationRef | null;
}): RowEval {
  const { assignment, row, dxf } = args;
  const groups = new Set<TableUnitEvidenceGroup>();
  const evidence: string[] = [];
  let contradict = false;
  let support = false;
  let relationsTried = 0;
  let relationsComparable = 0;

  // Explicit cell contradiction
  for (const field of FIELD_KEYS) {
    const assigned = assignment[field];
    if (!assigned) continue;
    const ex = explicitUnit(row[field]);
    if (ex && ex !== assigned) {
      contradict = true;
      evidence.push(`explicitCellContradiction:${field}:${ex}≠${assigned}`);
    } else if (ex && ex === assigned) {
      groups.add("EXPLICIT_CELL");
      evidence.push(`explicitCellAgree:${field}:${ex}`);
      support = true;
    }
  }

  const wRaw = numericRaw(row.width);
  const hRaw = numericRaw(row.height);
  const aRaw = numericRaw(row.area);
  const taRaw = numericRaw(row.totalArea);
  const thRaw = numericRaw(row.thickness);
  const uwRaw = numericRaw(row.unitWeight);
  const twRaw = numericRaw(row.totalWeight);
  const qty = quantityOf(row);

  const wMm =
    wRaw != null && assignment.width
      ? linearToMm(wRaw, assignment.width)
      : null;
  const hMm =
    hRaw != null && assignment.height
      ? linearToMm(hRaw, assignment.height)
      : null;
  const aMm2 =
    aRaw != null && assignment.area ? areaToMm2(aRaw, assignment.area) : null;
  const taMm2 =
    taRaw != null && assignment.totalArea
      ? areaToMm2(taRaw, assignment.totalArea)
      : null;
  const thMm =
    thRaw != null && assignment.thickness
      ? linearToMm(thRaw, assignment.thickness)
      : null;
  const uwKg =
    uwRaw != null && assignment.unitWeight
      ? massToKg(uwRaw, assignment.unitWeight)
      : null;
  const twKg =
    twRaw != null && assignment.totalWeight
      ? massToKg(twRaw, assignment.totalWeight)
      : null;

  // Geometry: width × height ≈ area
  if (wRaw != null && hRaw != null && aRaw != null) {
    relationsTried += 1;
    if (wMm != null && hMm != null && aMm2 != null) {
      relationsComparable += 1;
      const expectedM2 = plateAreaMm2FromBoundingBox(wMm, hMm) / 1_000_000;
      const sourceM2 = aMm2 / 1_000_000;
      const cmp = compareWithPrecision({
        expectedValue: expectedM2,
        sourceValue: sourceM2,
        displayedDecimalPlaces: row.area?.displayedDecimalPlaces ?? null,
        absoluteTolerance: 0,
        relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        groups.add("ROW_GEOMETRY");
        evidence.push(`ROW_GEOMETRY:${cmp.status}`);
        support = true;
      } else if (cmp.status === "MISMATCH") {
        contradict = true;
        evidence.push("ROW_GEOMETRY:MISMATCH");
      }
    }
  }

  // Total area: area × qty ≈ totalArea
  if (aRaw != null && taRaw != null && qty != null && qty > 0) {
    relationsTried += 1;
    if (aMm2 != null && taMm2 != null) {
      relationsComparable += 1;
      const cmp = compareWithPrecision({
        expectedValue: aMm2 * qty,
        sourceValue: taMm2,
        displayedDecimalPlaces: row.totalArea?.displayedDecimalPlaces ?? null,
        absoluteTolerance: 0,
        relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        groups.add("ROW_TOTAL_AREA");
        evidence.push(`ROW_TOTAL_AREA:${cmp.status}`);
        support = true;
      } else if (cmp.status === "MISMATCH") {
        contradict = true;
        evidence.push("ROW_TOTAL_AREA:MISMATCH");
      }
    }
  }

  // Density weight: area × thickness × ρ ≈ unitWeight
  if (aRaw != null && thRaw != null && uwRaw != null) {
    relationsTried += 1;
    const density = densityForMaterial(row.material);
    if (density != null && aMm2 != null && thMm != null && uwKg != null) {
      relationsComparable += 1;
      const areaM2 = aMm2 / 1_000_000;
      const expectedKg = (areaM2 * thMm * density) / 1000;
      const cmp = compareWithPrecision({
        expectedValue: expectedKg,
        sourceValue: uwKg,
        displayedDecimalPlaces: row.unitWeight?.displayedDecimalPlaces ?? 1,
        absoluteTolerance: 0.05,
        relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        groups.add("ROW_DENSITY_WEIGHT");
        evidence.push(`ROW_DENSITY_WEIGHT:${cmp.status}`);
        support = true;
      } else if (cmp.status === "MISMATCH") {
        contradict = true;
        evidence.push("ROW_DENSITY_WEIGHT:MISMATCH");
      }
    }
  }

  // Total weight: unitWeight × qty ≈ totalWeight
  if (uwRaw != null && twRaw != null && qty != null && qty > 0) {
    relationsTried += 1;
    if (uwKg != null && twKg != null) {
      relationsComparable += 1;
      const cmp = compareWithPrecision({
        expectedValue: uwKg * qty,
        sourceValue: twKg,
        displayedDecimalPlaces: row.totalWeight?.displayedDecimalPlaces ?? 1,
        absoluteTolerance: 0.05,
        relativeTolerance: NORMALIZATION_TOLERANCES.weightRelativeRatio,
      });
      if (precisionPositive(cmp.status)) {
        groups.add("ROW_TOTAL_WEIGHT");
        evidence.push(`ROW_TOTAL_WEIGHT:${cmp.status}`);
        support = true;
      } else if (cmp.status === "MISMATCH") {
        contradict = true;
        evidence.push("ROW_TOTAL_WEIGHT:MISMATCH");
      }
    }
  }

  // DXF dimensions (related evidence group pair)
  if (dxf && (dxf.widthMm != null || dxf.heightMm != null) && wMm != null && hMm != null) {
    relationsTried += 1;
    relationsComparable += 1;
    const dw = dxf.widthMm;
    const dh = dxf.heightMm;
    const matchDirect =
      dw != null &&
      dh != null &&
      Math.abs(wMm - dw) <=
        Math.max(
          NORMALIZATION_TOLERANCES.dimensionAbsoluteMm,
          Math.max(wMm, dw) * NORMALIZATION_TOLERANCES.dimensionRelativeRatio
        ) &&
      Math.abs(hMm - dh) <=
        Math.max(
          NORMALIZATION_TOLERANCES.dimensionAbsoluteMm,
          Math.max(hMm, dh) * NORMALIZATION_TOLERANCES.dimensionRelativeRatio
        );
    const matchSwap =
      dw != null &&
      dh != null &&
      Math.abs(wMm - dh) <=
        Math.max(
          NORMALIZATION_TOLERANCES.dimensionAbsoluteMm,
          Math.max(wMm, dh) * NORMALIZATION_TOLERANCES.dimensionRelativeRatio
        ) &&
      Math.abs(hMm - dw) <=
        Math.max(
          NORMALIZATION_TOLERANCES.dimensionAbsoluteMm,
          Math.max(hMm, dw) * NORMALIZATION_TOLERANCES.dimensionRelativeRatio
        );
    if (matchDirect || matchSwap) {
      groups.add("DXF_DIMENSIONS");
      evidence.push(
        matchSwap ? "DXF_DIMENSIONS:orientationReversed" : "DXF_DIMENSIONS:match"
      );
      support = true;
    } else if (dw != null && dh != null) {
      // Soft: only contradict if magnitudes are wildly off (>10x)
      const ratio = Math.max(wMm, hMm) / Math.max(dw, dh, 1);
      if (ratio > 10 || ratio < 0.1) {
        contradict = true;
        evidence.push("DXF_DIMENSIONS:MISMATCH");
      }
    }
  }

  // DXF area — related to DXF_DIMENSIONS; count as separate group only if dims not already counted
  if (dxf?.plateAreaMm2 != null && aMm2 != null) {
    relationsTried += 1;
    relationsComparable += 1;
    const cmp = compareWithPrecision({
      expectedValue: dxf.plateAreaMm2 / 1_000_000,
      sourceValue: aMm2 / 1_000_000,
      displayedDecimalPlaces: row.area?.displayedDecimalPlaces ?? null,
      absoluteTolerance: 0,
      relativeTolerance: NORMALIZATION_TOLERANCES.areaRelativeRatio,
    });
    if (precisionPositive(cmp.status)) {
      if (!groups.has("DXF_DIMENSIONS")) {
        groups.add("DXF_AREA");
      } else {
        // Related evidence — record but don't double-count as independent group
        evidence.push(`DXF_AREA:related:${cmp.status}`);
      }
      evidence.push(`DXF_AREA:${cmp.status}`);
      support = true;
    }
  }

  const notComparable =
    relationsTried > 0 && relationsComparable === 0 && !support && !contradict;

  return {
    support,
    contradict,
    notComparable,
    groups: [...groups],
    evidence,
  };
}

function isScaleSymmetricPair(
  a: TableUnitAssignment,
  b: TableUnitAssignment
): boolean {
  // Same linear unit for W/H/T and matching squared area scale, different absolute scale
  const packs: Array<{
    lin: MeasurementUnit;
    area: MeasurementUnit;
  }> = [
    { lin: "MM", area: "MM2" },
    { lin: "CM", area: "CM2" },
    { lin: "M", area: "M2" },
  ];
  const packOf = (x: TableUnitAssignment) => {
    const lin = x.width ?? x.height ?? x.thickness;
    const area = x.area ?? x.totalArea;
    if (!lin || !area) return null;
    return packs.find((p) => p.lin === lin && p.area === area) ?? null;
  };
  const pa = packOf(a);
  const pb = packOf(b);
  if (!pa || !pb) return false;
  if (pa.lin === pb.lin) return false;
  // Mass must also scale or both null / same relative
  const massOk =
    (a.unitWeight == null && b.unitWeight == null) ||
    a.unitWeight === b.unitWeight;
  return massOk;
}

function hasAbsoluteAnchor(c: TableUnitInferenceCandidate): boolean {
  return (
    c.evidenceGroups.includes("DXF_DIMENSIONS") ||
    c.evidenceGroups.includes("DXF_AREA") ||
    c.evidenceGroups.includes("ROW_DENSITY_WEIGHT") ||
    c.evidenceGroups.includes("HEADER") ||
    c.evidenceGroups.includes("EXPLICIT_CELL")
  );
}

/**
 * Infer a joint unit assignment for one mapped table from PART rows only.
 */
export function inferTableUnitSystem(args: {
  tableId: string;
  sheetName: string | null;
  profiles: ColumnUnitProfile[];
  partRows: RawDocumentPartRow[];
  dxfByPartId: Map<string, DxfUnitCorrelationRef>;
}): TableUnitInferenceResult {
  const rows = args.partRows.filter(
    (r) =>
      r.source.tableId === args.tableId &&
      r.source.sheetName === args.sheetName &&
      r.rowRole === "PART"
  );

  const issues: StructuredNormalizationIssue[] = [];
  const evidence: string[] = [];

  if (rows.length === 0) {
    return {
      tableId: args.tableId,
      sheetName: args.sheetName,
      resolvedAssignment: null,
      status: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      candidates: [],
      evidence: ["noPartRows"],
      issues,
    };
  }

  const { fixed, domain, headerFixed } = collectConstraints({
    profiles: args.profiles,
    rows,
    tableId: args.tableId,
    sheetName: args.sheetName,
  });

  for (const f of headerFixed) {
    evidence.push(`HEADER:${f}=${fixed[f]}`);
  }

  const scored: TableUnitInferenceCandidate[] = [];
  const seen = new Set<string>();

  for (const assignment of cartesianAssignments(domain, fixed)) {
    const key = assignmentKey(assignment);
    if (seen.has(key)) continue;
    seen.add(key);

    let supportingRowCount = 0;
    let contradictingRowCount = 0;
    let notComparableRowCount = 0;
    const groupSet = new Set<TableUnitEvidenceGroup>();
    const candEvidence: string[] = [];

    if (headerFixed.size > 0) {
      groupSet.add("HEADER");
    }

    for (const row of rows) {
      const dxf =
        row.matchedDxfPartId != null
          ? args.dxfByPartId.get(row.matchedDxfPartId) ?? null
          : null;
      const ev = evaluateAssignmentOnRow({ assignment, row, dxf });
      for (const g of ev.groups) groupSet.add(g);
      candEvidence.push(...ev.evidence.map((e) => `${row.occurrenceId}:${e}`));
      if (ev.contradict) contradictingRowCount += 1;
      else if (ev.support) supportingRowCount += 1;
      else if (ev.notComparable) notComparableRowCount += 1;
    }

    // Independent evidence groups (DXF_AREA suppressed when DXF_DIMENSIONS present)
    const independentGroups = [...groupSet].filter((g) => g !== "DOMAIN_HINT");
    const groupScore = independentGroups.length * 0.12;
    const coverage =
      rows.length > 0 ? supportingRowCount / rows.length : 0;
    const contradictionPenalty = contradictingRowCount * 0.2;
    let score =
      0.25 +
      coverage * 0.45 +
      groupScore -
      contradictionPenalty +
      (supportingRowCount >= 2 ? 0.1 : 0);

    // Prefer absolute anchors
    if (
      independentGroups.includes("DXF_DIMENSIONS") ||
      independentGroups.includes("ROW_DENSITY_WEIGHT")
    ) {
      score += 0.12;
    }

    score = Math.max(0, Math.min(0.99, score));

    scored.push({
      assignment: cloneAssignment(assignment),
      score,
      supportingRowCount,
      contradictingRowCount,
      notComparableRowCount,
      evidence: candEvidence.slice(0, 40),
      evidenceGroups: independentGroups,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 12);

  if (top.length === 0) {
    return {
      tableId: args.tableId,
      sheetName: args.sheetName,
      resolvedAssignment: null,
      status: "INSUFFICIENT_EVIDENCE",
      confidence: 0,
      candidates: [],
      evidence,
      issues,
    };
  }

  const best = top[0]!;
  const second = top[1];

  // Scale-symmetric ambiguity without absolute anchors
  // (e.g. 10×10 with area 100 fits MM/MM2, CM/CM2 and M/M2 equally)
  const nearBest = top.filter(
    (c) =>
      Math.abs(c.score - best.score) <
      NORMALIZATION_TOLERANCES.minimumCandidateScoreSeparation
  );
  const scalePacksNear = nearBest.filter((c) => {
    const lin = c.assignment.width ?? c.assignment.height;
    const area = c.assignment.area ?? c.assignment.totalArea;
    return (
      (lin === "MM" && area === "MM2") ||
      (lin === "CM" && area === "CM2") ||
      (lin === "M" && area === "M2")
    );
  });
  const distinctScaleLins = new Set(
    scalePacksNear.map((c) => c.assignment.width ?? c.assignment.height)
  );
  if (
    distinctScaleLins.size >= 2 &&
    !hasAbsoluteAnchor(best) &&
    best.supportingRowCount > 0
  ) {
    evidence.push("scaleSymmetricAmbiguity");
    return {
      tableId: args.tableId,
      sheetName: args.sheetName,
      resolvedAssignment: null,
      status: "AMBIGUOUS",
      confidence: best.score,
      candidates: top,
      evidence,
      issues: [
        {
          code: "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS",
          severity: "WARNING",
          message:
            "Multiple scale-consistent unit systems; no absolute anchor",
        },
      ],
    };
  }

  if (
    second &&
    Math.abs(best.score - second.score) <
      NORMALIZATION_TOLERANCES.minimumCandidateScoreSeparation &&
    isScaleSymmetricPair(best.assignment, second.assignment) &&
    !hasAbsoluteAnchor(best)
  ) {
    evidence.push("scaleSymmetricAmbiguity");
    return {
      tableId: args.tableId,
      sheetName: args.sheetName,
      resolvedAssignment: null,
      status: "AMBIGUOUS",
      confidence: best.score,
      candidates: top,
      evidence,
      issues: [
        {
          code: "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS",
          severity: "WARNING",
          message:
            "Multiple scale-consistent unit systems; no absolute anchor",
        },
      ],
    };
  }

  const unique =
    best.score >=
      NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence &&
    (!second ||
      best.score - second.score >=
        NORMALIZATION_TOLERANCES.minimumCandidateScoreSeparation) &&
    best.supportingRowCount >= 1 &&
    best.contradictingRowCount < best.supportingRowCount &&
    (best.supportingRowCount >= 2 ||
      hasAbsoluteAnchor(best) ||
      best.evidenceGroups.includes("HEADER"));

  // Single weak row without anchors → insufficient
  if (
    rows.length >= 1 &&
    best.supportingRowCount <= 1 &&
    !hasAbsoluteAnchor(best) &&
    !best.evidenceGroups.includes("HEADER") &&
    best.evidenceGroups.filter((g) => g.startsWith("ROW_")).length < 2
  ) {
    evidence.push("insufficientIndependentEvidence");
    return {
      tableId: args.tableId,
      sheetName: args.sheetName,
      resolvedAssignment: null,
      status:
        best.supportingRowCount === 0 ? "AMBIGUOUS" : "INSUFFICIENT_EVIDENCE",
      confidence: best.score,
      candidates: top,
      evidence,
      issues:
        best.supportingRowCount === 0
          ? [
              {
                code: "DOCUMENT_GEOMETRY_UNIT_AMBIGUOUS",
                severity: "WARNING",
                message: "No deterministic unit relationships available",
              },
            ]
          : [],
    };
  }

  if (!unique) {
    // Partial: apply only fields that agree across top near-ties with anchors
    if (
      best.score >=
        NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence &&
      hasAbsoluteAnchor(best) &&
      best.supportingRowCount >= Math.max(1, Math.ceil(rows.length * 0.4))
    ) {
      // Still resolve when absolute anchor + good coverage even if second is close
      // unless scale-symmetric without separation
      if (
        !(
          second &&
          isScaleSymmetricPair(best.assignment, second.assignment) &&
          !hasAbsoluteAnchor(best)
        )
      ) {
        evidence.push(
          `resolved:support=${best.supportingRowCount}/${rows.length}`,
          `score=${best.score.toFixed(3)}`,
          ...best.evidenceGroups.map((g) => `group:${g}`)
        );
        return {
          tableId: args.tableId,
          sheetName: args.sheetName,
          resolvedAssignment: cloneAssignment(best.assignment),
          status: "RESOLVED",
          confidence: Math.min(0.95, best.score + 0.05),
          candidates: top,
          evidence,
          issues,
        };
      }
    }

    evidence.push(
      `ambiguous:best=${best.score.toFixed(3)}:second=${second?.score.toFixed(3) ?? "n/a"}`
    );
    return {
      tableId: args.tableId,
      sheetName: args.sheetName,
      resolvedAssignment: null,
      status: "AMBIGUOUS",
      confidence: best.score,
      candidates: top,
      evidence,
      issues,
    };
  }

  evidence.push(
    `resolved:support=${best.supportingRowCount}/${rows.length}`,
    `score=${best.score.toFixed(3)}`,
    ...best.evidenceGroups.map((g) => `group:${g}`)
  );

  return {
    tableId: args.tableId,
    sheetName: args.sheetName,
    resolvedAssignment: cloneAssignment(best.assignment),
    status: "RESOLVED",
    confidence: Math.min(0.95, Math.max(best.score, NORMALIZATION_TOLERANCES.minimumAutomaticResolutionConfidence + 0.05)),
    candidates: top,
    evidence,
    issues,
  };
}

/**
 * Apply a resolved table unit assignment onto column profiles.
 * Does not invent DOCUMENT_UNIT_LABEL_INCONSISTENT when statedHeaderUnit is null.
 */
export function applyTableUnitInferenceToProfiles(args: {
  profiles: ColumnUnitProfile[];
  inference: TableUnitInferenceResult;
}): void {
  const { profiles, inference } = args;
  if (!inference.resolvedAssignment || inference.status !== "RESOLVED") {
    return;
  }
  const a = inference.resolvedAssignment;
  const supportHint =
    inference.candidates[0] != null
      ? `supportingCoverage:${inference.candidates[0].supportingRowCount}`
      : null;

  const apply = (
    field: SemanticMeasurementField,
    unit: MeasurementUnit | null
  ) => {
    if (!unit) return;
    const profile = profiles.find(
      (p) =>
        p.tableId === inference.tableId &&
        p.sheetName === inference.sheetName &&
        p.semanticField === field
    );
    if (!profile) return;
    // Do not override stronger explicit AS_STATED that already matches
    if (
      profile.resolutionStatus === "AS_STATED" &&
      profile.statedHeaderUnit === unit &&
      profile.resolvedUnit === unit
    ) {
      profile.evidence.push(`tableUnitSystem:${unit}:agreesHeader`);
      profile.confidence = Math.max(profile.confidence, inference.confidence);
      return;
    }
    // Do not override contradictory explicit header with silent agreement skip —
    // if header differs, finalize path may add INCONSISTENT; table may still set.
    profile.resolvedUnit = unit;
    profile.resolutionStatus = "RESOLVED_BY_COLUMN_CONSISTENCY";
    profile.confidence = Math.max(profile.confidence, inference.confidence);
    profile.evidence.push(`tableUnitSystem:${unit}`);
    if (supportHint) profile.evidence.push(supportHint);
    for (const g of inference.evidence.filter((e) => e.startsWith("group:"))) {
      if (!profile.evidence.includes(g)) profile.evidence.push(g);
    }
  };

  apply("THICKNESS", a.thickness);
  apply("WIDTH", a.width);
  apply("HEIGHT", a.height);
  apply("AREA", a.area);
  apply("TOTAL_AREA", a.totalArea);
  apply("UNIT_WEIGHT", a.unitWeight);
  apply("TOTAL_WEIGHT", a.totalWeight);
}

export function inferAllTableUnitSystems(args: {
  profiles: ColumnUnitProfile[];
  partRows: RawDocumentPartRow[];
  dxfByPartId: Map<string, DxfUnitCorrelationRef>;
}): TableUnitInferenceResult[] {
  const tableKeys = new Map<string, { tableId: string; sheetName: string | null }>();
  for (const p of args.profiles) {
    tableKeys.set(`${p.sheetName ?? ""}::${p.tableId}`, {
      tableId: p.tableId,
      sheetName: p.sheetName,
    });
  }
  for (const r of args.partRows) {
    if (r.source.tableId) {
      tableKeys.set(`${r.source.sheetName ?? ""}::${r.source.tableId}`, {
        tableId: r.source.tableId,
        sheetName: r.source.sheetName,
      });
    }
  }

  const results: TableUnitInferenceResult[] = [];
  for (const { tableId, sheetName } of tableKeys.values()) {
    results.push(
      inferTableUnitSystem({
        tableId,
        sheetName,
        profiles: args.profiles,
        partRows: args.partRows,
        dxfByPartId: args.dxfByPartId,
      })
    );
  }
  return results;
}
