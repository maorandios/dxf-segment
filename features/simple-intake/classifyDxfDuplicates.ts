/**
 * Canonical DXF duplicate classification for summary + matching.
 * Content equality uses exact file-byte hash only (not dimensions or filename similarity).
 */

import { normalizeDxfFileKey } from "./normalizeDxfFileKey";
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
  /** Secondary physical instances of true content duplicates — not for matching/extras. */
  secondaryDuplicateFileIds: ReadonlySet<string>;
  /** Canonical file id kept for each true-duplicate content key. */
  canonicalFileIdsByContentKey: ReadonlyMap<string, string>;
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
 */
export function classifyDxfDuplicates(
  dxfParts: ReadonlyArray<PartInput>
): ClassifiedDxfDuplicates {
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
    const files = members.map(toFile);
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
      const canonical = files.find((f) => claimed.has(f.id)) ?? files[0]!;
      const members = [canonical, ...unclaimed];
      const filesMapped = members.map(toFile);
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

  const secondaryDuplicateFileIds = new Set<string>();
  const canonicalFileIdsByContentKey = new Map<string, string>();
  // A file may appear in both SAME_NAME_SAME_CONTENT and a follow-up
  // DIFFERENT_NAME group as canonical — secondary ids only from true dups.
  const countedSecondary = new Set<string>();

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
    } else {
      differentNameSameContentGroups++;
      differentNameSameContentCount += g.duplicateFileCount;
    }

    const canonical = g.files[0]!;
    const ck = canonical.contentFingerprint;
    if (ck && !canonicalFileIdsByContentKey.has(ck)) {
      canonicalFileIdsByContentKey.set(ck, canonical.fileId);
    }
    for (let i = 1; i < g.files.length; i++) {
      const id = g.files[i]!.fileId;
      if (countedSecondary.has(id)) continue;
      countedSecondary.add(id);
      secondaryDuplicateFileIds.add(id);
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
    secondaryDuplicateFileIds,
    canonicalFileIdsByContentKey,
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
        "הקבצים מופיעים בשמות שונים, אך מכילים את אותו שרטוט.",
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
