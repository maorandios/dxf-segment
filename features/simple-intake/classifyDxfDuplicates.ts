/**
 * Canonical DXF duplicate classification for summary + matching.
 * Content equality uses exact file-byte hash only (not dimensions or filename similarity).
 */

import { normalizeDxfFileKey } from "./normalizeDxfFileKey";
import {
  buildSourceExactIdentifierSet,
  orderDuplicateMembersCanonicalFirst,
} from "./smartDxfAssignment";
import type { SimpleDxfPart } from "./types";

export type DxfDuplicateClassification =
  | "SAME_NAME_SAME_CONTENT"
  | "DIFFERENT_NAME_SAME_CONTENT"
  | "SAME_NAME_DIFFERENT_CONTENT";

export type DxfContentEqualityBasis =
  | "EXACT_FILE_BYTES"
  | "NORMALIZED_DRAWING_CONTENT";

export type DxfDuplicateGroupFile = {
  fileId: string;
  originalFileName: string;
  normalizedFileNameKey: string;
  contentFingerprint: string | null;
};

export type DxfDuplicateGroup = {
  groupId: string;
  classification: DxfDuplicateClassification;
  files: DxfDuplicateGroupFile[];
  /** files.length - 1 — canonical instance excluded from the duplicate count. */
  duplicateFileCount: number;
  equalityBasis: DxfContentEqualityBasis | null;
};

export type DxfDuplicateSummary = {
  totalPhysicalFiles: number;
  /** True duplicates only (excludes same-name content conflicts). */
  duplicateFileCount: number;
  sameNameSameContentCount: number;
  differentNameSameContentCount: number;
  sameNameDifferentContentConflictCount: number;
  duplicateGroupCount: number;
  conflictGroupCount: number;
};

export type DxfDuplicateDiagnostics = {
  physicalFileCount: number;
  exactByteDuplicateGroups: number;
  normalizedDrawingDuplicateGroups: number;
  sameNameSameContentGroups: number;
  differentNameSameContentGroups: number;
  sameNameDifferentContentGroups: number;
  sameNameSameContentDuplicateFiles: number;
  differentNameSameContentDuplicateFiles: number;
  totalDuplicateFiles: number;
  filenameConflictFiles: number;
  boundingBoxOnlyMatchesExcludedFromDuplicates: number;
  duplicateGroupSample: Array<{
    classification: DxfDuplicateClassification;
    fileNames: string[];
    equalityBasis: DxfContentEqualityBasis | null;
  }>;
};

export type ClassifiedDxfDuplicates = {
  groups: DxfDuplicateGroup[];
  summary: DxfDuplicateSummary;
  diagnostics: DxfDuplicateDiagnostics;
  /**
   * Repeated-upload instances only (`SAME_NAME_SAME_CONTENT` non-canonicals).
   * These may be excluded from exact matching. Never includes
   * `DIFFERENT_NAME_SAME_CONTENT` members.
   */
  repeatedUploadExcludedDxfIds: ReadonlySet<string>;
  /**
   * @deprecated Alias of `repeatedUploadExcludedDxfIds` — matching exclusion
   * for same-name repeated uploads only. Do not treat as “all content secondaries”.
   */
  secondaryDuplicateFileIds: ReadonlySet<string>;
  /** Canonical file id kept for each true same-name-same-content key. */
  canonicalFileIdsByContentKey: ReadonlyMap<string, string>;
  /** Informational different-name identical-content groups (not matching exclusions). */
  identicalContentInformationalGroups: ReadonlyArray<DxfDuplicateGroup>;
};

export type DuplicateMatchingDiagnostics = {
  totalRegistryEntries: number;
  sameNameSameContentGroups: number;
  differentNameSameContentGroups: number;
  sameNameDifferentContentGroups: number;
  repeatedUploadExcludedDxfCount: number;
  /** Must remain 0 — different-name same-content must stay matchable. */
  differentNameSameContentExcludedDxfCount: number;
  exactMatchesRecoveredFromIdenticalContentGroups: number;
  /** Must remain 0 — invariant: registry exact match ⇒ no NO_MATCHING_DXF. */
  rowsWithExactRegistryMatchButNoMatchingDxfIssue: number;
};

type PartInput = Pick<
  SimpleDxfPart,
  "id" | "filename" | "contentHash" | "fingerprint"
> &
  Partial<Pick<SimpleDxfPart, "widthMm" | "lengthMm">>;

function contentKeyOf(part: PartInput): string | null {
  const h = part.contentHash ?? part.fingerprint;
  return h && String(h).trim() ? String(h).trim() : null;
}

function toFile(part: PartInput): DxfDuplicateGroupFile {
  return {
    fileId: part.id,
    originalFileName: part.filename,
    normalizedFileNameKey: normalizeDxfFileKey(part.filename),
    contentFingerprint: contentKeyOf(part),
  };
}

/**
 * Classify uploaded DXFs into mutually exclusive duplicate / conflict groups.
 * Precedence:
 * 1. SAME_NAME_DIFFERENT_CONTENT
 * 2. SAME_NAME_SAME_CONTENT
 * 3. DIFFERENT_NAME_SAME_CONTENT
 *
 * For true content duplicates, canonical file preference:
 * exact source identifier match → non-copy filename → upload order.
 */
export function classifyDxfDuplicates(
  dxfParts: ReadonlyArray<PartInput>,
  opts?: {
    /** Material-source part IDs / DXF filenames for canonical preference. */
    sourceRows?: ReadonlyArray<{
      partId?: string | null;
      dxfFileName?: string | null;
    }>;
  }
): ClassifiedDxfDuplicates {
  const sourceIdentifiers = buildSourceExactIdentifierSet(opts?.sourceRows ?? []);
  const uploadOrderIndexById = new Map(
    dxfParts.map((p, i) => [p.id, i] as const)
  );

  const byName = new Map<string, PartInput[]>();
  const byContent = new Map<string, PartInput[]>();

  for (const part of dxfParts) {
    const nameKey = normalizeDxfFileKey(part.filename);
    if (nameKey) {
      const list = byName.get(nameKey) ?? [];
      list.push(part);
      byName.set(nameKey, list);
    }
    const ck = contentKeyOf(part);
    if (ck) {
      const list = byContent.get(ck) ?? [];
      list.push(part);
      byContent.set(ck, list);
    }
  }

  const claimed = new Set<string>();
  const groups: DxfDuplicateGroup[] = [];
  let groupSeq = 0;

  const canonicalizeMembers = (members: PartInput[]): PartInput[] =>
    orderDuplicateMembersCanonicalFirst(
      members,
      sourceIdentifiers,
      uploadOrderIndexById
    );

  const addGroup = (
    classification: DxfDuplicateClassification,
    members: PartInput[],
    equalityBasis: DxfContentEqualityBasis | null,
    duplicateFileCount: number
  ) => {
    if (members.length < 2 && classification !== "DIFFERENT_NAME_SAME_CONTENT") {
      if (members.length < 1) return;
    }
    if (members.length < 2) return;
    const ordered =
      classification === "SAME_NAME_DIFFERENT_CONTENT"
        ? members
        : canonicalizeMembers(members);
    const files = ordered.map(toFile);
    groups.push({
      groupId: `dxf-dup-${++groupSeq}`,
      classification,
      files,
      duplicateFileCount,
      equalityBasis,
    });
    for (const m of members) claimed.add(m.id);
  };

  // Pass 1 — same normalized filename
  for (const [, files] of byName) {
    if (files.length < 2) continue;
    const hashes = files.map(contentKeyOf);
    const known = hashes.filter((h): h is string => h != null);
    const unique = new Set(known);
    const allKnown = known.length === files.length;

    if (allKnown && unique.size === 1) {
      addGroup(
        "SAME_NAME_SAME_CONTENT",
        files,
        "EXACT_FILE_BYTES",
        files.length - 1
      );
    } else {
      addGroup("SAME_NAME_DIFFERENT_CONTENT", files, null, files.length - 1);
    }
  }

  // Pass 2 — same content, different names (unclaimed only)
  for (const [, files] of byContent) {
    if (files.length < 2) continue;
    const unclaimed = files.filter((f) => !claimed.has(f.id));
    if (unclaimed.length === 0) continue;

    const nameKeys = new Set(
      files.map((f) => normalizeDxfFileKey(f.filename)).filter(Boolean)
    );

    // Entire content cluster still free and spans multiple names
    if (unclaimed.length === files.length && nameKeys.size > 1) {
      addGroup(
        "DIFFERENT_NAME_SAME_CONTENT",
        files,
        "EXACT_FILE_BYTES",
        files.length - 1
      );
      continue;
    }

    // Some same-name copies already claimed; remaining alt-name files are
    // different-name content duplicates of the canonical claimed file.
    if (unclaimed.length >= 1 && unclaimed.length < files.length && nameKeys.size > 1) {
      const claimedMembers = files.filter((f) => claimed.has(f.id));
      const ordered = canonicalizeMembers([...claimedMembers, ...unclaimed]);
      const filesMapped = ordered.map(toFile);
      groups.push({
        groupId: `dxf-dup-${++groupSeq}`,
        classification: "DIFFERENT_NAME_SAME_CONTENT",
        files: filesMapped,
        duplicateFileCount: unclaimed.length,
        equalityBasis: "EXACT_FILE_BYTES",
      });
      for (const f of unclaimed) claimed.add(f.id);
    }
  }

  let sameNameSameContentCount = 0;
  let differentNameSameContentCount = 0;
  let sameNameDifferentContentConflictCount = 0;
  let duplicateGroupCount = 0;
  let conflictGroupCount = 0;
  let sameNameSameContentGroups = 0;
  let differentNameSameContentGroups = 0;
  let sameNameDifferentContentGroups = 0;

  const repeatedUploadExcludedDxfIds = new Set<string>();
  const canonicalFileIdsByContentKey = new Map<string, string>();
  const countedRepeated = new Set<string>();
  const identicalContentInformationalGroups: DxfDuplicateGroup[] = [];

  for (const g of groups) {
    if (g.classification === "SAME_NAME_DIFFERENT_CONTENT") {
      conflictGroupCount++;
      sameNameDifferentContentGroups++;
      sameNameDifferentContentConflictCount += g.duplicateFileCount;
      continue;
    }

    duplicateGroupCount++;
    if (g.classification === "SAME_NAME_SAME_CONTENT") {
      sameNameSameContentGroups++;
      sameNameSameContentCount += g.duplicateFileCount;
      // Only same-name repeated uploads may be excluded from matching.
      const canonical = g.files[0]!;
      const ck = canonical.contentFingerprint;
      if (ck && !canonicalFileIdsByContentKey.has(ck)) {
        canonicalFileIdsByContentKey.set(ck, canonical.fileId);
      }
      for (let i = 1; i < g.files.length; i++) {
        const id = g.files[i]!.fileId;
        if (countedRepeated.has(id)) continue;
        countedRepeated.add(id);
        repeatedUploadExcludedDxfIds.add(id);
      }
    } else {
      // DIFFERENT_NAME_SAME_CONTENT — informational only; all members stay matchable.
      differentNameSameContentGroups++;
      differentNameSameContentCount += g.duplicateFileCount;
      identicalContentInformationalGroups.push(g);
      const canonical = g.files[0]!;
      const ck = canonical.contentFingerprint;
      if (ck && !canonicalFileIdsByContentKey.has(ck)) {
        canonicalFileIdsByContentKey.set(ck, canonical.fileId);
      }
    }
  }

  const duplicateFileCount =
    sameNameSameContentCount + differentNameSameContentCount;

  const sample = groups.slice(0, 10).map((g) => ({
    classification: g.classification,
    fileNames: g.files.map((f) => f.originalFileName),
    equalityBasis: g.equalityBasis,
  }));

  const exactByteDuplicateGroups = groups.filter(
    (g) =>
      g.classification !== "SAME_NAME_DIFFERENT_CONTENT" &&
      g.equalityBasis === "EXACT_FILE_BYTES"
  ).length;

  return {
    groups,
    summary: {
      totalPhysicalFiles: dxfParts.length,
      duplicateFileCount,
      sameNameSameContentCount,
      differentNameSameContentCount,
      sameNameDifferentContentConflictCount,
      duplicateGroupCount,
      conflictGroupCount,
    },
    diagnostics: {
      physicalFileCount: dxfParts.length,
      exactByteDuplicateGroups,
      normalizedDrawingDuplicateGroups: 0,
      sameNameSameContentGroups,
      differentNameSameContentGroups,
      sameNameDifferentContentGroups,
      sameNameSameContentDuplicateFiles: sameNameSameContentCount,
      differentNameSameContentDuplicateFiles: differentNameSameContentCount,
      totalDuplicateFiles: duplicateFileCount,
      filenameConflictFiles: sameNameDifferentContentConflictCount,
      boundingBoxOnlyMatchesExcludedFromDuplicates: 0,
      duplicateGroupSample: sample,
    },
    repeatedUploadExcludedDxfIds,
    secondaryDuplicateFileIds: repeatedUploadExcludedDxfIds,
    canonicalFileIdsByContentKey,
    identicalContentInformationalGroups,
  };
}

/** Hebrew badge for the DXF metric card (no technical jargon). */
export function buildDxfDuplicateCardBadge(
  summary: DxfDuplicateSummary
): string {
  const n = summary.duplicateFileCount;
  if (n === 0) return "לא נמצאו קבצים כפולים";

  const same = summary.sameNameSameContentCount;
  const diff = summary.differentNameSameContentCount;

  if (diff > 0 && same === 0) {
    return n === 1
      ? "קובץ כפול אחד זוהה לפי תוכן הקובץ"
      : `${formatHe(n)} קבצים כפולים זוהו לפי תוכן הקובץ`;
  }
  if (same > 0 && diff === 0) {
    return n === 1
      ? "קובץ כפול אחד זוהה לפי שם ותוכן"
      : `${formatHe(n)} קבצים כפולים זוהו לפי שם ותוכן`;
  }
  return `${formatHe(n)} קבצים כפולים זוהו · ${formatHe(diff)} לפי תוכן · ${formatHe(same)} לפי שם ותוכן`;
}

export function buildDxfDuplicateFindingCopy(summary: DxfDuplicateSummary): {
  title: string;
  description: string;
} | null {
  const n = summary.duplicateFileCount;
  if (n === 0) return null;
  const same = summary.sameNameSameContentCount;
  const diff = summary.differentNameSameContentCount;

  if (diff > 0 && same === 0) {
    return {
      title:
        n === 1
          ? "קובץ DXF אחד עם תוכן כפול"
          : `${formatHe(n)} קובצי DXF עם תוכן כפול`,
      description:
        "הקבצים מופיעים בשמות שונים אך מכילים תוכן זהה.",
    };
  }
  if (same > 0 && diff === 0) {
    return {
      title:
        n === 1
          ? "קובץ DXF הועלה יותר מפעם אחת"
          : `${formatHe(n)} קובצי DXF הועלו יותר מפעם אחת`,
      description: "אותו שם קובץ ואותו תוכן הופיעו במספר העלאות.",
    };
  }
  return {
    title: `${formatHe(n)} קובצי DXF כפולים`,
    description: `${formatHe(diff)} זוהו לפי תוכן הקובץ ו־${formatHe(same)} לפי שם ותוכן זהים.`,
  };
}

export function buildFilenameContentConflictFindingCopy(
  conflictDuplicateFiles: number
): { title: string; description: string } | null {
  if (conflictDuplicateFiles <= 0) return null;
  const n = conflictDuplicateFiles;
  return {
    title:
      n === 1
        ? "קובצי DXF בעלי אותו שם מכילים תוכן שונה"
        : `${formatHe(n)} קובצי DXF בעלי אותו שם מכילים תוכן שונה`,
    description: "יש לבדוק איזה קובץ הוא הגרסה המתאימה להמשך.",
  };
}

function formatHe(n: number): string {
  return n.toLocaleString("he-IL");
}
