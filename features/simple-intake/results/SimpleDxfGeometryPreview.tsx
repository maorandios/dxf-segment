"use client";

/**
 * Lightweight SVG preview of DXF outer contour + holes.
 */

import { useEffect, useMemo, useState } from "react";
import { parseDxfFile } from "@/lib/parsers/dxfParser";
import type { ProcessedGeometry } from "@/types";
import { cn } from "@/lib/utils";
import {
  getGeometryByFilename,
  trackParseInvocation,
} from "../omegaProject/geometryRuntimeCache";

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("READ_FAILED"));
    reader.readAsText(file);
  });
}

/**
 * Prefer geometry restored from a .omega project cache.
 * Only parse the DXF file on a cache miss (and never count that as a "load"
 * parse when the cache already had the answer).
 */
export async function loadProcessedGeometryFromDxfFile(
  file: File
): Promise<ProcessedGeometry | null> {
  const cached = getGeometryByFilename(file.name);
  if (cached !== undefined) {
    return cached;
  }
  try {
    trackParseInvocation("parse");
    const content = await readFileText(file);
    const parsed = parseDxfFile(
      content,
      `preview_${file.name}`,
      file.name,
      "simple",
      "simple"
    );
    const geo = parsed.geometry.processedGeometry;
    if (!geo?.outer || geo.outer.length < 3) return null;
    if (geo.status === "error") return null;
    return geo;
  } catch {
    return null;
  }
}

function ringToPath(ring: ReadonlyArray<[number, number]>): string {
  if (ring.length === 0) return "";
  const [x0, y0] = ring[0]!;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = ring[i]!;
    d += ` L ${x} ${y}`;
  }
  return `${d} Z`;
}

export function SimpleDxfGeometryPreview({
  geometry,
  widthMm,
  lengthMm,
  className,
  label = "תצוגת גאומטריית DXF",
}: {
  geometry: ProcessedGeometry | null;
  /** Fallback bounding-box preview when full geometry is unavailable. */
  widthMm?: number | null;
  lengthMm?: number | null;
  className?: string;
  label?: string;
}) {
  const view = useMemo(() => {
    if (geometry?.outer && geometry.outer.length >= 3) {
      const bb = geometry.boundingBox;
      const pad = Math.max(bb.width, bb.height) * 0.08 || 1;
      return {
        minX: bb.minX - pad,
        minY: bb.minY - pad,
        width: bb.width + pad * 2,
        height: bb.height + pad * 2,
        outer: geometry.outer,
        holes: geometry.holes ?? [],
      };
    }
    if (
      widthMm != null &&
      lengthMm != null &&
      Number.isFinite(widthMm) &&
      Number.isFinite(lengthMm) &&
      widthMm > 0 &&
      lengthMm > 0
    ) {
      const pad = Math.max(widthMm, lengthMm) * 0.08;
      return {
        minX: -pad,
        minY: -pad,
        width: widthMm + pad * 2,
        height: lengthMm + pad * 2,
        outer: [
          [0, 0],
          [widthMm, 0],
          [widthMm, lengthMm],
          [0, lengthMm],
        ] as [number, number][],
        holes: [] as [number, number][][],
      };
    }
    return null;
  }, [geometry, widthMm, lengthMm]);

  if (!view) {
    return (
      <div
        className={cn(
          "flex h-44 w-full items-center justify-center rounded-[14px] border border-dashed text-[12px]",
          className
        )}
        style={{
          borderColor: "var(--ow-border)",
          backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
          color: "var(--ow-text-muted)",
        }}
        aria-label="אין תצוגת DXF"
      >
        אין גאומטריה להצגה
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-44 w-full items-center justify-center rounded-[14px] border p-3",
        className
      )}
      style={{
        borderColor: "var(--ow-border)",
        backgroundColor: "var(--ow-surface-muted, #F2F4F7)",
      }}
      aria-label={label}
    >
      <svg
        viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
        className="h-full w-full max-w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        {/* CAD Y-up → SVG Y-down */}
        <g
          transform={`translate(0 ${view.minY * 2 + view.height}) scale(1 -1)`}
        >
          <path
            d={ringToPath(view.outer)}
            fill="color-mix(in srgb, var(--ow-accent) 18%, white)"
            stroke="var(--ow-accent, #0f766e)"
            strokeWidth={Math.max(view.width, view.height) * 0.008}
          />
          {view.holes.map((hole, i) => (
            <path
              key={i}
              d={ringToPath(hole)}
              fill="var(--ow-surface, #ffffff)"
              stroke="var(--ow-text-secondary, #475467)"
              strokeWidth={Math.max(view.width, view.height) * 0.006}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Loads DXF geometry for preview; falls back to bounding box while loading/unavailable. */
export function SimpleDxfGeometryPreviewLoader({
  file,
  widthMm,
  lengthMm,
  className,
}: {
  file: File | null;
  widthMm?: number | null;
  lengthMm?: number | null;
  className?: string;
}) {
  const [geometry, setGeometry] = useState<ProcessedGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!file) return;
    void loadProcessedGeometryFromDxfFile(file).then((geo) => {
      if (!cancelled) setGeometry(geo);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <SimpleDxfGeometryPreview
      geometry={geometry}
      widthMm={widthMm}
      lengthMm={lengthMm}
      className={className}
    />
  );
}
