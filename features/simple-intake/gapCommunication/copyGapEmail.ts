/**
 * Copy gap email subject+body (edited content) to clipboard.
 */

import {
  copyTextToClipboard,
  type CopyTextToClipboardDeps,
} from "@/lib/ai-intake/debug/copyTextToClipboard";
import {
  formatGapEmailClipboardHtml,
  formatGapEmailClipboardPayload,
} from "./buildGapEmail";

export type CopyGapEmailResult =
  | { ok: true }
  | { ok: false; message: string };

export async function copyGapEmailToClipboard(args: {
  subject: string;
  body: string;
  bodyHtml?: string;
  deps?: CopyTextToClipboardDeps & {
    write?: (data: ClipboardItem[]) => Promise<void>;
  };
}): Promise<CopyGapEmailResult> {
  const plain = formatGapEmailClipboardPayload(args.subject, args.body);
  const html = formatGapEmailClipboardHtml(
    args.subject,
    args.body,
    args.bodyHtml
  );

  try {
    const write =
      args.deps?.write ??
      (typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof ClipboardItem !== "undefined" &&
      typeof navigator.clipboard.write === "function"
        ? (items: ClipboardItem[]) => navigator.clipboard.write(items)
        : null);

    if (write) {
      try {
        await write([
          new ClipboardItem({
            "text/plain": new Blob([plain], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        return { ok: true };
      } catch {
        // fall through to plain text
      }
    }

    await copyTextToClipboard(plain, args.deps);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "ההעתקה נכשלה. נסו שוב או העתיקו ידנית מהשדות.",
    };
  }
}
