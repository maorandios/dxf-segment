/**
 * SHA-256 helper for the portable project format.
 * Uses Web Crypto only (`crypto.subtle`) so this module is safe to bundle
 * into the browser — never import `node:crypto` (webpack cannot resolve it).
 */

function hexFromBytes(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  // Copy into a fresh ArrayBuffer so SharedArrayBuffer / detached views
  // cannot break crypto.subtle.digest typing.
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export async function sha256Hex(
  data: ArrayBuffer | Uint8Array
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error(
      "SHA256_UNAVAILABLE: Web Crypto crypto.subtle.digest is required"
    );
  }
  const digest = await subtle.digest("SHA-256", toArrayBuffer(data));
  return hexFromBytes(new Uint8Array(digest));
}
