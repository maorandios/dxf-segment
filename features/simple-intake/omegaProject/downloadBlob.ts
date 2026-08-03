/**
 * Browser download helpers — object URL only, nothing written to any
 * browser storage mechanism.
 */

import {
  OMEGA_PROJECT_FILE_EXTENSION,
  OMEGA_PROJECT_MIME_TYPE,
} from "./types";

export function downloadBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

/**
 * Best-effort native "Save As" dialog. Never persists the file system
 * handle — each call is a one-shot write, exactly like a normal download.
 * Returns false (caller should fall back to `downloadBlobAsFile`) when the
 * API is unavailable or the user cancels.
 */
export async function trySaveWithFileSystemAccess(
  blob: Blob,
  filename: string
): Promise<boolean> {
  const w = typeof window !== "undefined" ? (window as SaveFilePickerWindow) : null;
  if (!w?.showSaveFilePicker) return false;

  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Segment Quotation Project",
          accept: {
            [OMEGA_PROJECT_MIME_TYPE]: [OMEGA_PROJECT_FILE_EXTENSION],
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (err) {
    // AbortError = user cancelled the picker — not a failure.
    if (err instanceof DOMException && err.name === "AbortError") {
      return false;
    }
    return false;
  }
}
