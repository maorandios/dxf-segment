/**
 * SHA-256 content hash for exact DXF duplicate detection.
 * Browser-safe: uses Web Crypto only (no node:crypto — that breaks webpack client bundles).
 */

export async function calculateFileSha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  return sha256Hex(bytes);
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);

  const subtle =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    globalThis.crypto.subtle
      ? globalThis.crypto.subtle
      : null;

  if (!subtle) {
    throw new Error("SHA256_UNAVAILABLE: crypto.subtle is required");
  }

  // Copy into a plain ArrayBuffer — avoids SharedArrayBuffer typing issues
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const digest = await subtle.digest("SHA-256", ab);
  return hexFromBytes(new Uint8Array(digest));
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
