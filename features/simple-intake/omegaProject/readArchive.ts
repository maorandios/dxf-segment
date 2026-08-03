/**
 * Read a .omega ZIP archive into an in-memory map of path -> bytes,
 * enforcing the same path/size budgets used when building archives.
 */

import JSZip from "jszip";
import {
  assertArchiveBudgets,
  assertSafeArchivePath,
  assertSafeEntryByteLength,
} from "./archiveSecurity";

export type ReadOmegaArchiveResult = {
  /** Normalized archive path -> raw bytes. */
  files: Map<string, Uint8Array>;
  entryCount: number;
  uncompressedBytes: number;
};

const ARCHIVE_ERROR_PREFIX = "לא ניתן לפתוח את קובץ ההצעה";

export async function readOmegaProjectArchive(
  input: File | Blob | ArrayBuffer | Uint8Array
): Promise<ReadOmegaArchiveResult> {
  let zip: JSZip;
  try {
    const data =
      typeof Blob !== "undefined" && input instanceof Blob
        ? await input.arrayBuffer()
        : input;
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    throw new Error(
      `${ARCHIVE_ERROR_PREFIX} — הקובץ אינו ארכיון ZIP תקין / not a valid zip archive: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const files = new Map<string, Uint8Array>();
  let entryCount = 0;
  let uncompressedBytes = 0;

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const path = assertSafeArchivePath(entry.name);
    entryCount += 1;
    // Guard entryCount before pulling bytes for every file — cheap check first.
    assertArchiveBudgets(entryCount, uncompressedBytes);

    const bytes: Uint8Array = await entry.async("uint8array");
    assertSafeEntryByteLength(bytes.byteLength);
    uncompressedBytes += bytes.byteLength;
    assertArchiveBudgets(entryCount, uncompressedBytes);

    files.set(path, bytes);
  }

  return { files, entryCount, uncompressedBytes };
}

export function readJsonEntry(
  files: Map<string, Uint8Array>,
  path: string
): unknown {
  const bytes = files.get(path);
  if (!bytes) return undefined;
  const text = new TextDecoder("utf-8").decode(bytes);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${ARCHIVE_ERROR_PREFIX} — הקובץ ${path} אינו JSON תקין / invalid JSON in ${path}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
