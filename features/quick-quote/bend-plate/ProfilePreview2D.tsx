"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDecimal, formatInteger } from "@/lib/formatNumbers";
import { cn } from "@/lib/utils";
import type { Point2 } from "./geometry";
import { boundsOfPolyline } from "./geometry";

function formatDimMm(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? formatInteger(Math.round(r)) : formatDecimal(r, 1);
}

/** Numeric part only for angle markup (degree sign drawn separately for even type). */
function formatAngleDegMain(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? formatInteger(Math.round(r)) : formatDecimal(r, 1);
}

/** Circular arc from p + r*u1 to p + r*u2 along the shorter great-circle path (internal angle). */
function arcPathBetweenRays(
  p: Point2,
  u1: Point2,
  u2: Point2,
  r: number
): string | null {
  const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const theta = Math.acos(dot);
  if (theta < 1e-5) return null;
  const sinT = Math.sin(theta);
  if (sinT < 1e-6) {
    const sx = p.x + u1.x * r;
    const sy = p.y + u1.y * r;
    const ex = p.x + u2.x * r;
    const ey = p.y + u2.y * r;
    return `M ${sx} ${sy} L ${ex} ${ey}`;
  }
  const nSeg = Math.max(10, Math.ceil((theta / (2 * Math.PI)) * 48));
  const parts: string[] = [];
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg;
    const wx =
      (Math.sin((1 - t) * theta) / sinT) * u1.x + (Math.sin(t * theta) / sinT) * u2.x;
    const wy =
      (Math.sin((1 - t) * theta) / sinT) * u1.y + (Math.sin(t * theta) / sinT) * u2.y;
    const px = p.x + r * wx;
    const py = p.y + r * wy;
    parts.push(`${i === 0 ? "M" : "L"} ${px.toFixed(3)} ${py.toFixed(3)}`);
  }
  return parts.join(" ");
}

/** Slate dimension strokes — same family as plate builder feature dims (`#64748b`). */
const DIM_STROKE = "#94a3b8";
const DIM_STROKE_MUTED = "#64748b";
/** Profile polyline + vertex markers (matches `<path stroke="…">`). */
const PROFILE_STROKE = "hsl(142 70% 45%)";
/**
 * With `vectorEffect="non-scaling-stroke"`, keep this near 1–1.5 so the profile
 * stays a thin hairline at any zoom — do not scale with viewBox (large values
 * look comically thick on screen when the diagram is wide).
 */
const PROFILE_PATH_STROKE_WIDTH = 1.15;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Optional per-vertex arc hairline (px) from shorter leg so the arc matches the corner scale. */
function angleArcStrokePx(
  legMinUser: number,
  meetScale: number,
  fallbackArcStrokePx: number
): number {
  const legPx = legMinUser * meetScale;
  return clamp(Math.min(legPx * 0.045, fallbackArcStrokePx * 1.15), 0.62, 1.28);
}

/**
 * Sizes annotations from how large the viewBox actually renders (meet scale), so labels and
 * dim graphics stay ~constant *relative to the shape* and bounded in px (readable, never huge).
 */
function annotationStylesForView(
  viewPxW: number,
  viewPxH: number,
  vbW: number,
  vbH: number
) {
  const vw = Math.max(viewPxW, 1);
  const vh = Math.max(viewPxH, 1);
  const bw = Math.max(vbW, 1);
  const bh = Math.max(vbH, 1);
  const scale = Math.min(vw / bw, vh / bh);
  const geomLongPx = Math.max(bw, bh) * scale;

  const labelPx = clamp(geomLongPx * 0.0225, 10.5, 12.75);
  const labelFontUser = labelPx / scale;
  const segmentLabelFontUser = labelFontUser * 1.25 * 1.25;

  const dimStrokePx = clamp(geomLongPx * 0.002, 0.72, 1.12);
  const extStrokePx = dimStrokePx * 0.92;
  const dashLenPx = clamp(geomLongPx * 0.011, 3.2, 5.8);
  const dashGapPx = clamp(geomLongPx * 0.0085, 2.4, 4.5);
  const arcStrokePx = clamp(dimStrokePx * 1.05, 0.78, 1.18);
  const nodePx = clamp(geomLongPx * 0.0068, 2.1, 3.6);
  const nodeRadiusUser = nodePx / scale;

  return {
    meetScale: scale,
    segmentLabelFontUser,
    dimStrokePx,
    extStrokePx,
    dashArray: `${dashLenPx}px ${dashGapPx}px`,
    arcStrokePx,
    nodeRadiusUser,
  };
}

export interface BendProfileSegmentDim {
  label: string;
  lengthMm: number;
}

interface ProfilePreview2DProps {
  pts: Point2[];
  /** Per straight edge: parameter name (A, B, …) and length — same order as polyline segments. */
  segments?: BendProfileSegmentDim[];
  /** Signed path turn (°) after each segment — same order as interior bend vertices (CCW +). */
  bendAnglesDeg?: number[];
  className?: string;
  /** Stretch to parent height (e.g. split-pane editor). */
  fill?: boolean;
}

export function ProfilePreview2D({
  pts,
  segments,
  bendAnglesDeg,
  className,
  fill,
}: ProfilePreview2DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewPx, setViewPx] = useState({ w: 320, h: 240 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (entry?: ResizeObserverEntry) => {
      const cr = entry?.contentRect ?? el.getBoundingClientRect();
      setViewPx({ w: cr.width, h: cr.height });
    };
    apply();
    const ro = new ResizeObserver((entries) => apply(entries[0]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svg = useMemo(() => {
    if (pts.length < 2) {
      return {
        pathD: "",
        vb: "0 0 100 100",
        vbW: 100,
        vbH: 100,
        strokeW: PROFILE_PATH_STROKE_WIDTH,
        ptsLocal: [] as Point2[],
        dimLayers: null as null | {
          extenders: { x1: number; y1: number; x2: number; y2: number }[];
          dimLines: { x1: number; y1: number; x2: number; y2: number }[];
          labels: { x: number; y: number; text: string; angle: number }[];
        },
        angleMarkup: null as null | {
          arcs: { path: string; legMin: number }[];
          labels: { x: number; y: number; legMin: number; degMain: string }[];
        },
      };
    }

    const b = boundsOfPolyline(pts);
    const w0 = Math.max(b.maxX - b.minX, 1);
    const h0 = Math.max(b.maxY - b.minY, 1);
    const span0 = Math.max(w0, h0, 1);

    /** Local SVG coords: x right, y down (world Y flipped). */
    const ptsLocal = pts.map((p) => ({
      x: p.x - b.minX,
      y: b.maxY - p.y,
    }));

    let cx = 0;
    let cy = 0;
    for (const p of ptsLocal) {
      cx += p.x;
      cy += p.y;
    }
    cx /= ptsLocal.length;
    cy /= ptsLocal.length;

    const nSeg = ptsLocal.length - 1;
    const showDims =
      segments &&
      segments.length === nSeg &&
      nSeg > 0;

    const showAngleDims =
      bendAnglesDeg &&
      pts.length >= 3 &&
      bendAnglesDeg.length === pts.length - 2;

    const arcData: { p: Point2; u1: Point2; u2: Point2; r: number; legMin: number }[] = [];
    const angleLabelsRaw: { x: number; y: number; legMin: number; degMain: string }[] = [];

    const extenders: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const dimLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const labels: { x: number; y: number; text: string; angle: number }[] = [];

    const offset = Math.max(span0 * 0.09, 5);
    const textGap = Math.max(span0 * 0.055, 3.5);

    if (showDims) {
      for (let i = 0; i < nSeg; i++) {
        const p0 = ptsLocal[i];
        const p1 = ptsLocal[i + 1];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const ux = dx / len;
        const uy = dy / len;
        let nx = -uy;
        let ny = ux;
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        if (nx * (midX - cx) + ny * (midY - cy) < 0) {
          nx = -nx;
          ny = -ny;
        }

        const p0o = { x: p0.x + nx * offset, y: p0.y + ny * offset };
        const p1o = { x: p1.x + nx * offset, y: p1.y + ny * offset };

        extenders.push(
          { x1: p0.x, y1: p0.y, x2: p0o.x, y2: p0o.y },
          { x1: p1.x, y1: p1.y, x2: p1o.x, y2: p1o.y }
        );
        dimLines.push({
          x1: p0o.x,
          y1: p0o.y,
          x2: p1o.x,
          y2: p1o.y,
        });

        const seg = segments![i];
        const text = `${seg.label} · ${formatDimMm(seg.lengthMm)} mm`;
        const tx = midX + nx * (offset + textGap);
        const ty = midY + ny * (offset + textGap);
        let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;
        labels.push({ x: tx, y: ty, text, angle: angleDeg });
      }
    }

    if (showAngleDims) {
      for (let k = 0; k < bendAnglesDeg!.length; k++) {
        const i = k + 1;
        const pIn = ptsLocal[i - 1];
        const p = ptsLocal[i];
        const pOut = ptsLocal[i + 1];
        const vin = { x: p.x - pIn.x, y: p.y - pIn.y };
        const vout = { x: pOut.x - p.x, y: pOut.y - p.y };
        const lenIn = Math.hypot(vin.x, vin.y);
        const lenOut = Math.hypot(vout.x, vout.y);
        if (lenIn < 1e-9 || lenOut < 1e-9) continue;

        const u1: Point2 = { x: -vin.x / lenIn, y: -vin.y / lenIn };
        const u2: Point2 = { x: vout.x / lenOut, y: vout.y / lenOut };

        const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
        const thetaGeom = Math.acos(dot);
        if (thetaGeom < 1e-4) continue;

        let bx = u1.x + u2.x;
        let by = u1.y + u2.y;
        const bl = Math.hypot(bx, by);
        if (bl < 1e-9) continue;
        bx /= bl;
        by /= bl;

        const legMin = Math.min(lenIn, lenOut);
        /** Arc radius ÷2 vs previous (0.42/0.34 caps) — smaller tick between the two segments. */
        const rArcMax = legMin * 0.21;
        const rArcLocal = clamp(legMin * 0.17, 1.25, rArcMax);
        const angleTextGapLocal = Math.min(
          Math.max(rArcLocal * 0.52, 1.2),
          legMin * 0.2
        );

        arcData.push({ p, u1, u2, r: rArcLocal, legMin });
        const tx = p.x + bx * (rArcLocal + angleTextGapLocal);
        const ty = p.y + by * (rArcLocal + angleTextGapLocal);
        angleLabelsRaw.push({
          x: tx,
          y: ty,
          legMin,
          degMain: formatAngleDegMain(bendAnglesDeg![k]),
        });
      }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const expand = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const p of ptsLocal) {
      expand(p.x, p.y);
    }
    for (const e of extenders) {
      expand(e.x1, e.y1);
      expand(e.x2, e.y2);
    }
    for (const d of dimLines) {
      expand(d.x1, d.y1);
      expand(d.x2, d.y2);
    }
    /** User-space bbox pad for labels (text is drawn in px; pad tracks mm span). */
    const labelBoxUnit = Math.max(span0 * 0.04, 6);
    const segLabelBox = 1.25 * 1.25;
    for (const lb of labels) {
      const hw = lb.text.length * labelBoxUnit * 0.32 * segLabelBox;
      const hh = labelBoxUnit * 0.72 * segLabelBox;
      expand(lb.x - hw, lb.y - hh);
      expand(lb.x + hw, lb.y + hh);
    }

    for (const d of arcData) {
      expand(d.p.x + d.u1.x * d.r, d.p.y + d.u1.y * d.r);
      expand(d.p.x + d.u2.x * d.r, d.p.y + d.u2.y * d.r);
      const midU = { x: d.u1.x + d.u2.x, y: d.u1.y + d.u2.y };
      const ml = Math.hypot(midU.x, midU.y);
      if (ml > 1e-9) {
        const mx = midU.x / ml;
        const my = midU.y / ml;
        expand(d.p.x + mx * d.r * 0.55, d.p.y + my * d.r * 0.55);
      }
    }
    for (const lb of angleLabelsRaw) {
      const approxChars = lb.degMain.length + 1;
      const hw = approxChars * labelBoxUnit * 0.32 * segLabelBox;
      const hh = labelBoxUnit * 0.72 * segLabelBox;
      expand(lb.x - hw, lb.y - hh);
      expand(lb.x + hw, lb.y + hh);
    }

    const pad = Math.max(span0 * 0.04, 2);
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const shiftX = -minX;
    const shiftY = -minY;
    const vbW = Math.max(maxX - minX, 1);
    const vbH = Math.max(maxY - minY, 1);

    const shift = (p: Point2) => ({ x: p.x + shiftX, y: p.y + shiftY });

    const pathD = ptsLocal
      .map((p, i) => {
        const q = shift(p);
        return `${i === 0 ? "M" : "L"} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
      })
      .join(" ");

    const shiftedPts = ptsLocal.map((p) => shift(p));
    const strokeW = PROFILE_PATH_STROKE_WIDTH;

    const dimLayers =
      showDims && extenders.length > 0
        ? {
            extenders: extenders.map((e) => ({
              x1: e.x1 + shiftX,
              y1: e.y1 + shiftY,
              x2: e.x2 + shiftX,
              y2: e.y2 + shiftY,
            })),
            dimLines: dimLines.map((e) => ({
              x1: e.x1 + shiftX,
              y1: e.y1 + shiftY,
              x2: e.x2 + shiftX,
              y2: e.y2 + shiftY,
            })),
            labels: labels.map((lb) => ({
              x: lb.x + shiftX,
              y: lb.y + shiftY,
              text: lb.text,
              angle: lb.angle,
            })),
          }
        : null;

    const angleMarkup =
      arcData.length > 0
        ? {
            arcs: arcData
              .map((d) => {
                const path = arcPathBetweenRays(shift(d.p), d.u1, d.u2, d.r);
                return path ? { path, legMin: d.legMin } : null;
              })
              .filter((x): x is { path: string; legMin: number } => x !== null),
            labels: angleLabelsRaw.map((lb) => ({
              x: lb.x + shiftX,
              y: lb.y + shiftY,
              legMin: lb.legMin,
              degMain: lb.degMain,
            })),
          }
        : null;

    return {
      pathD,
      vb: `0 0 ${vbW.toFixed(2)} ${vbH.toFixed(2)}`,
      vbW,
      vbH,
      strokeW,
      ptsLocal: shiftedPts,
      dimLayers,
      angleMarkup,
    };
  }, [pts, segments, bendAnglesDeg]);

  const ann = annotationStylesForView(viewPx.w, viewPx.h, svg.vbW, svg.vbH);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "flex items-center justify-center overflow-hidden",
        fill
          ? "h-full min-h-0 w-full rounded-lg bg-[#0f1419]"
          : "rounded-lg bg-[#0f1419] aspect-[4/3]",
        className
      )}
    >
      <svg
        viewBox={svg.vb}
        className={
          fill
            ? "h-full w-full min-h-0 max-h-full max-w-full"
            : "max-h-[280px] w-full max-w-full"
        }
        style={{
          fontFamily:
            'var(--font-google-sans), "Google Sans", sans-serif',
          /* Do not inherit body letter-spacing (-2%) — it crams CAD dimension strings. */
          letterSpacing: 0,
        }}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Side profile preview"
      >
        {svg.dimLayers ? (
          <g aria-hidden>
            {(() => {
              const dl = svg.dimLayers;
              return (
                <>
                  {dl.extenders.map((e, i) => (
                    <line
                      key={`ext-${i}`}
                      x1={e.x1}
                      y1={e.y1}
                      x2={e.x2}
                      y2={e.y2}
                      stroke={DIM_STROKE_MUTED}
                      strokeWidth={`${ann.extStrokePx}px`}
                      strokeDasharray={ann.dashArray}
                      vectorEffect="non-scaling-stroke"
                      opacity={0.92}
                    />
                  ))}
                  {dl.dimLines.map((e, i) => (
                    <line
                      key={`dim-${i}`}
                      x1={e.x1}
                      y1={e.y1}
                      x2={e.x2}
                      y2={e.y2}
                      stroke={DIM_STROKE}
                      strokeWidth={`${ann.dimStrokePx}px`}
                      strokeDasharray={ann.dashArray}
                      vectorEffect="non-scaling-stroke"
                      opacity={0.98}
                    />
                  ))}
                  {dl.labels.map((lb, i) => (
                    <text
                      key={`lbl-${i}`}
                      x={lb.x}
                      y={lb.y}
                      fill={DIM_STROKE}
                      fontSize={ann.segmentLabelFontUser}
                      fontWeight={600}
                      letterSpacing="0.06em"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${lb.angle}, ${lb.x}, ${lb.y})`}
                    >
                      {lb.text}
                    </text>
                  ))}
                </>
              );
            })()}
          </g>
        ) : null}
        {svg.pathD ? (
          <path
            d={svg.pathD}
            fill="none"
            stroke={PROFILE_STROKE}
            strokeWidth={svg.strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {svg.angleMarkup ? (
          <g aria-hidden>
            {svg.angleMarkup.arcs.map((a, i) => (
              <path
                key={`ang-arc-${i}`}
                d={a.path}
                fill="none"
                stroke={DIM_STROKE}
                strokeWidth={`${angleArcStrokePx(a.legMin, ann.meetScale, ann.arcStrokePx)}px`}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.95}
              />
            ))}
          </g>
        ) : null}
        {svg.ptsLocal.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={ann.nodeRadiusUser}
            fill={PROFILE_STROKE}
          />
        ))}
        {svg.angleMarkup ? (
          <g aria-hidden>
            {svg.angleMarkup.labels.map((lb, i) => (
              <text
                key={`ang-lbl-${i}`}
                x={lb.x}
                y={lb.y}
                fill={DIM_STROKE}
                fontSize={ann.segmentLabelFontUser}
                fontWeight={600}
                letterSpacing="0.06em"
                style={{ fontVariantNumeric: "tabular-nums" }}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                <tspan fontWeight={700}>{lb.degMain}</tspan>
                <tspan fontWeight={600} fontSize="0.9em">
                  °
                </tspan>
              </text>
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
