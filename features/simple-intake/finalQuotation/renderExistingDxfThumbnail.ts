/**
 * Shared DXF thumbnail helper for final quotation screen + exports.
 * Uses already-resolved dimensions — does not parse DXF or recalculate geometry.
 */

export type ExistingDxfGeometryReference = {
  /** Stable DXF / part identity for cache keys. */
  geometryId: string;
  widthMm: number;
  lengthMm: number;
  available: boolean;
};

export type DxfThumbnailOutput = {
  svgMarkup?: string;
  pngDataUrl?: string;
  width: number;
  height: number;
};

const thumbnailCache = new Map<string, DxfThumbnailOutput>();

function cacheKey(
  geometry: ExistingDxfGeometryReference,
  options: { width: number; height: number; padding: number }
): string {
  return [
    geometry.geometryId,
    geometry.widthMm,
    geometry.lengthMm,
    options.width,
    options.height,
    options.padding,
  ].join("|");
}

/** Bounding-box SVG matching SimpleDxfThumbnail (no DXF parse). */
export function buildBoundingBoxSvgMarkup(
  widthMm: number,
  lengthMm: number,
  options: { width: number; height: number; padding: number }
): string {
  const w = Math.max(1, widthMm);
  const l = Math.max(1, lengthMm);
  const pad = options.padding;
  const vw = w * (1 + 2 * pad);
  const vl = l * (1 + 2 * pad);
  const strokeW = Math.max(w, l) * 0.01;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="${-w * pad} ${-l * pad} ${vw} ${vl}" preserveAspectRatio="xMidYMid meet"><rect x="0" y="0" width="${w}" height="${l}" fill="#f2f4f7" stroke="#0f766e" stroke-width="${strokeW}" rx="${strokeW}"/></svg>`;
}

/**
 * Render a compact thumbnail from already-known dimensions.
 * Does not parse DXF files.
 */
export async function renderExistingDxfThumbnail(
  geometry: ExistingDxfGeometryReference,
  options: {
    width: number;
    height: number;
    padding: number;
  }
): Promise<DxfThumbnailOutput> {
  const key = cacheKey(geometry, options);
  const cached = thumbnailCache.get(key);
  if (cached) return cached;

  if (
    !geometry.available ||
    !(geometry.widthMm > 0) ||
    !(geometry.lengthMm > 0)
  ) {
    const empty: DxfThumbnailOutput = {
      width: options.width,
      height: options.height,
    };
    thumbnailCache.set(key, empty);
    return empty;
  }

  const svgMarkup = buildBoundingBoxSvgMarkup(
    geometry.widthMm,
    geometry.lengthMm,
    options
  );

  let pngDataUrl: string | undefined;
  if (typeof document !== "undefined") {
    try {
      pngDataUrl = await svgMarkupToPngDataUrl(
        svgMarkup,
        options.width,
        options.height
      );
    } catch {
      pngDataUrl = undefined;
    }
  }

  const out: DxfThumbnailOutput = {
    svgMarkup,
    pngDataUrl,
    width: options.width,
    height: options.height,
  };
  thumbnailCache.set(key, out);
  return out;
}

async function svgMarkupToPngDataUrl(
  svgMarkup: string,
  width: number,
  height: number
): Promise<string | undefined> {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg image load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function clearDxfThumbnailCacheForTests(): void {
  thumbnailCache.clear();
}
