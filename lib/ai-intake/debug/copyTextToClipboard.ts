export type CopyTextToClipboardDeps = {
  /** Override Clipboard API writeText (for tests). */
  writeText?: (text: string) => Promise<void>;
  /** Override fallback path (for tests). */
  fallback?: (text: string) => void;
};

/**
 * Copy full text to the clipboard. Prefer Clipboard API; fall back to textarea.
 * Never truncates the payload.
 */
export async function copyTextToClipboard(
  text: string,
  deps?: CopyTextToClipboardDeps
): Promise<void> {
  const writeText =
    deps?.writeText ??
    (typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
      ? (value: string) => navigator.clipboard.writeText(value)
      : null);

  if (writeText) {
    try {
      await writeText(text);
      return;
    } catch {
      // fall through to textarea fallback
    }
  }

  const fallback = deps?.fallback ?? fallbackCopyTextToClipboard;
  fallback(text);
}

/** Exposed for tests — textarea / execCommand path. */
export function fallbackCopyTextToClipboard(text: string): void {
  if (typeof document === "undefined") {
    throw new Error("Clipboard unavailable: no document");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  if (!ok) {
    throw new Error("Clipboard copy failed");
  }
}
