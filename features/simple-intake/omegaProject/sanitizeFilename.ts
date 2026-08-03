/**
 * Filename sanitization for the downloaded .segment file and for archive
 * paths under sources/dxf/ and sources/material-list/.
 */

import { OMEGA_PROJECT_FILE_EXTENSION } from "./types";

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Sanitize an arbitrary label for use as a filesystem-safe path segment. */
export function sanitizePathSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(UNSAFE_FILENAME_CHARS, "_")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
  return cleaned || "file";
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Builds `SEGMENT-{id}-{YYYY-MM-DD}.segment`. */
export function buildOmegaProjectFilename(idLabel: string): string {
  const safeId = sanitizePathSegment(idLabel).replace(/\s+/g, "-");
  return `SEGMENT-${safeId}-${todayIsoDate()}${OMEGA_PROJECT_FILE_EXTENSION}`;
}

/** Sanitize an original uploaded filename for storage under sources/. */
export function sanitizeSourceFilename(originalFilename: string): string {
  const base = sanitizePathSegment(originalFilename);
  return base.replace(/^\/+/, "");
}
