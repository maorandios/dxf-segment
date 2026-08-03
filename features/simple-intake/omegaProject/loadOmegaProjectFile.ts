/**
 * Load and validate a .omega file selected by the user. Never touches any
 * browser storage. Throws on any validation/hash failure — the caller must
 * not hydrate the session unless this resolves successfully.
 */

import { getOmegaProjectFileDiagnostics, patchDiagnostics } from "./diagnostics";
import { migrateOmegaProject } from "./migrate";
import { parseManifestV1 } from "./schemas";
import { readJsonEntry, readOmegaProjectArchive } from "./readArchive";
import { setGeometryEntries } from "./geometryRuntimeCache";
import { sha256Hex } from "./sha256";
import {
  OMEGA_PROJECT_FILE_EXTENSION,
  OMEGA_PROJECT_LEGACY_FILE_EXTENSION,
  OMEGA_PROJECT_PATHS,
  type LoadOmegaProjectResult,
  type OmegaProjectLoadWarning,
  type SerializedDxfGeometryEntry,
} from "./types";

const ERR_PREFIX_HE = "לא ניתן לפתוח את קובץ ההצעה";

function hasKnownProjectExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(OMEGA_PROJECT_FILE_EXTENSION) ||
    lower.endsWith(OMEGA_PROJECT_LEGACY_FILE_EXTENSION)
  );
}

export async function loadOmegaProjectFile(
  file: File
): Promise<LoadOmegaProjectResult> {
  const startedAt = Date.now();
  try {
    const warnings: OmegaProjectLoadWarning[] = [];

    if (!hasKnownProjectExtension(file.name)) {
      warnings.push({
        code: "EXTENSION_MISMATCH",
        message: `הקובץ אינו בעל סיומת ${OMEGA_PROJECT_FILE_EXTENSION} — נבדק לפי תוכן. / file does not have a ${OMEGA_PROJECT_FILE_EXTENSION} extension — validated by content instead.`,
      });
    }

    const { files } = await readOmegaProjectArchive(file);

    const manifestRaw = readJsonEntry(files, OMEGA_PROJECT_PATHS.MANIFEST);
    if (manifestRaw === undefined) {
      throw new Error(
        `${ERR_PREFIX_HE} — קובץ המניפסט חסר בארכיון. / manifest.json missing from archive.`
      );
    }
    const manifest = parseManifestV1(manifestRaw);

    const stateRaw = readJsonEntry(files, OMEGA_PROJECT_PATHS.STATE);
    if (stateRaw === undefined) {
      throw new Error(
        `${ERR_PREFIX_HE} — קובץ מצב ההצעה חסר בארכיון. / project/state.json missing from archive.`
      );
    }
    const snapshot = migrateOmegaProject(stateRaw);

    // ── Hash validation for every required file entry ────────────────────
    let hashMismatchCount = 0;
    for (const entry of manifest.fileEntries) {
      const bytes = files.get(entry.archivePath);
      if (!bytes) {
        if (entry.required) {
          throw new Error(
            `${ERR_PREFIX_HE} — קובץ נדרש חסר בארכיון: ${entry.archivePath}. / required file missing: ${entry.archivePath}.`
          );
        }
        warnings.push({
          code: "MISSING_OPTIONAL_ASSET",
          message: `קובץ אופציונלי חסר: ${entry.archivePath}`,
          assetId: entry.assetId,
        });
        continue;
      }
      if (entry.sha256) {
        const actual = await sha256Hex(bytes);
        if (actual !== entry.sha256) {
          hashMismatchCount += 1;
          if (entry.required) {
            throw new Error(
              `${ERR_PREFIX_HE} — קובץ פגום (אי-התאמת גיבוב): ${entry.archivePath}. / checksum mismatch (file corrupted): ${entry.archivePath}.`
            );
          }
          warnings.push({
            code: "HASH_MISMATCH",
            message: `אי-התאמת גיבוב בקובץ לא חובה: ${entry.archivePath}`,
            assetId: entry.assetId,
          });
        }
      }
    }

    // ── Binary assets (source workbook / DXF files) ───────────────────────
    const binaryAssets = new Map<
      string,
      { bytes: Uint8Array; mimeType: string; originalFilename: string | null }
    >();
    for (const entry of manifest.fileEntries) {
      if (entry.kind !== "SOURCE_MATERIAL" && entry.kind !== "SOURCE_DXF") {
        continue;
      }
      const bytes = files.get(entry.archivePath);
      if (!bytes) continue;
      binaryAssets.set(entry.assetId, {
        bytes,
        mimeType: entry.mimeType,
        originalFilename: entry.originalFilename,
      });
    }

    // ── Derived DXF geometries (best-effort; missing/invalid is non-fatal) ──
    let geometries: SerializedDxfGeometryEntry[] = [];
    try {
      const geoRaw = readJsonEntry(
        files,
        "derived/dxf-geometries.json"
      ) as { geometries?: SerializedDxfGeometryEntry[] } | undefined;
      if (geoRaw && Array.isArray(geoRaw.geometries)) {
        geometries = geoRaw.geometries;
        setGeometryEntries(geometries);
      }
    } catch {
      warnings.push({
        code: "GEOMETRY_REPARSE_FAILED",
        message:
          "לא ניתן לקרוא את קובץ הגאומטריות השמור — ניתן לפרסר מחדש מהקבצים המקוריים.",
      });
    }

    patchDiagnostics({
      loadCount: getOmegaProjectFileDiagnostics().loadCount + 1,
      lastLoadAt: new Date().toISOString(),
      lastLoadDurationMs: Date.now() - startedAt,
      lastLoadEntryCount: manifest.fileEntries.length,
      lastLoadWarnings: warnings,
      lastLoadError: null,
      hashMismatchCountLastLoad: hashMismatchCount,
    });

    return { manifest, snapshot, binaryAssets, geometries, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchDiagnostics({
      lastLoadError: message,
      lastLoadDurationMs: Date.now() - startedAt,
    });
    throw err instanceof Error ? err : new Error(message);
  }
}
