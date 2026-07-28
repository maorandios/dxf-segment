"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Lottie from "lottie-react";
import type { ActivityStepModel } from "./deriveWorkflowPresentation";

const LOTTIE_SRC = "/lottie/document-upload.json";

type PhaseLine = {
  key: string;
  label: string;
  detail: string | null;
};

function PhaseCopy({
  label,
  detail,
  className,
}: {
  label: string;
  detail: string | null;
  className?: string;
}) {
  return (
    <div
      className={["w-full", className].filter(Boolean).join(" ")}
      style={{ textAlign: "center" }}
    >
      <p
        className="mx-auto text-[18px] font-medium leading-snug sm:text-[20px]"
        style={{ color: "var(--ow-text)", textAlign: "center" }}
      >
        {label}
      </p>
      {detail ? (
        <p
          className="mx-auto mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ow-text-muted)", textAlign: "center" }}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/** Tube / flip-board roll: rotates on X like text rolling around a cylinder. */
function RollingPhaseText({
  label,
  detail,
  phaseKey,
}: {
  label: string;
  detail: string | null;
  phaseKey: string;
}) {
  const [display, setDisplay] = useState<PhaseLine>({
    key: phaseKey,
    label,
    detail,
  });
  const [outgoing, setOutgoing] = useState<PhaseLine | null>(null);

  if (phaseKey !== display.key) {
    setOutgoing(display);
    setDisplay({ key: phaseKey, label, detail });
  } else if (display.label !== label || display.detail !== detail) {
    setDisplay({ key: phaseKey, label, detail });
  }

  useEffect(() => {
    if (!outgoing) return;
    const clearId = window.setTimeout(() => setOutgoing(null), 520);
    return () => window.clearTimeout(clearId);
  }, [outgoing]);

  return (
    <div
      className="ow-phase-tube relative mx-auto h-[3.75rem] w-full max-w-md"
      aria-live="polite"
      style={{ perspective: "900px", textAlign: "center" }}
    >
      {outgoing ? (
        <div
          key={`out-${outgoing.key}`}
          className="ow-phase-tube-out absolute inset-0 flex items-center justify-center px-2"
          style={{ textAlign: "center" }}
        >
          <PhaseCopy label={outgoing.label} detail={outgoing.detail} />
        </div>
      ) : null}
      <div
        key={`in-${display.key}`}
        className={[
          "absolute inset-0 flex items-center justify-center px-2",
          outgoing ? "ow-phase-tube-in" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ textAlign: "center" }}
      >
        <PhaseCopy label={display.label} detail={display.detail} />
      </div>
    </div>
  );
}

function stripLottieWhiteSolids(raw: unknown): object {
  const data = structuredClone(raw) as {
    assets?: Array<{ layers?: unknown[] }>;
    layers?: unknown[];
  };

  const strip = (layers: unknown[] | undefined): unknown[] | undefined => {
    if (!Array.isArray(layers)) return layers;
    return layers
      .filter((layer) => {
        const l = layer as { ty?: number; nm?: string; sc?: string };
        if (l.ty !== 1) return true;
        const name = (l.nm ?? "").toLowerCase();
        const sc = (l.sc ?? "").toLowerCase();
        return !(
          name.includes("white solid") ||
          sc === "#ffffff" ||
          sc === "#fff"
        );
      })
      .map((layer) => {
        const l = layer as { layers?: unknown[] };
        if (l.layers) l.layers = strip(l.layers) as unknown[];
        return layer;
      });
  };

  if (data.assets) {
    for (const asset of data.assets) {
      if (asset.layers) asset.layers = strip(asset.layers);
    }
  }
  if (data.layers) data.layers = strip(data.layers);
  return data as object;
}

function DocumentUploadLottie() {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(LOTTIE_SRC)
      .then((r) => {
        if (!r.ok) throw new Error(`Lottie fetch failed: ${r.status}`);
        return r.json();
      })
      .then((json: unknown) => {
        if (!cancelled) setData(stripLottieWhiteSolids(json));
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div
        className="mx-auto h-[336px] w-[448px] max-w-[min(448px,92vw)] sm:h-[368px] sm:w-[492px] sm:max-w-[min(492px,92vw)]"
        aria-hidden
      />
    );
  }

  return (
    <div
      className="mx-auto h-[336px] w-[448px] max-w-[min(448px,92vw)] overflow-hidden bg-transparent sm:h-[368px] sm:w-[492px] sm:max-w-[min(492px,92vw)]"
      style={{ background: "transparent" }}
    >
      <Lottie
        animationData={data}
        loop
        autoplay
        style={{
          width: "118%",
          height: "118%",
          margin: "-9%",
          background: "transparent",
        }}
      />
    </div>
  );
}

/**
 * Keeps the bar moving toward 99% so long AI waits never look frozen.
 * Step progress is a floor; time eases the rest. Never shows 100% here.
 */
function useMotionProgress(stepProgress: number): number {
  const floorPct = Math.min(92, Math.max(6, Math.round(stepProgress * 100)));
  const [pct, setPct] = useState(floorPct);
  const startRef = useRef(Date.now());
  const pctRef = useRef(pct);
  pctRef.current = pct;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsedSec = (Date.now() - startRef.current) / 1000;
      // Asymptotic crawl → 99% (~never arrives in practice during a run)
      const timeTarget = 99 * (1 - Math.exp(-elapsedSec / 32));
      const target = Math.min(99, Math.max(floorPct, timeTarget));
      const current = pctRef.current;
      const delta = target - current;
      const next =
        delta <= 0
          ? current
          : Math.min(99, current + Math.max(0.04, delta * 0.045));
      if (next - current >= 0.04) {
        setPct(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floorPct]);

  return Math.min(99, Math.max(floorPct, Math.round(pct)));
}

/**
 * Centered analyzing view: Lottie, tube-rolling phase text, one progress bar.
 */
export function AnalyzingLoadingPanel({
  title,
  steps,
}: {
  title: string;
  steps: ActivityStepModel[];
}) {
  void title;
  const active =
    steps.find((s) => s.status === "ACTIVE") ??
    steps.find((s) => s.status === "PENDING") ??
    steps[steps.length - 1] ??
    null;

  const completed = steps.filter((s) => s.status === "COMPLETED").length;
  const stepProgress = useMemo(() => {
    if (steps.length === 0) return 0.08;
    const activeBonus = steps.some((s) => s.status === "ACTIVE") ? 0.45 : 0;
    return Math.min(0.9, (completed + activeBonus) / steps.length);
  }, [steps, completed]);

  const progressPct = useMotionProgress(stepProgress);

  const phaseKey = active?.id ?? "idle";
  const phaseLabel = active?.label ?? "מעבדים…";
  const phaseDetail = active?.detail ?? null;

  return (
    <div
      className="ow-stage-enter flex min-h-0 w-full flex-1 flex-col"
      role="status"
      aria-live="polite"
      aria-busy
      style={{ textAlign: "center" }}
    >
      {/* Centered, then nudged slightly up in the main area */}
      <div
        className="m-auto flex w-full max-w-lg -translate-y-10 flex-col items-center px-4 sm:-translate-y-12"
        style={{ textAlign: "center" }}
      >
        <DocumentUploadLottie />

        <div className="mt-3 w-full" style={{ textAlign: "center" }}>
          <RollingPhaseText
            phaseKey={phaseKey}
            label={phaseLabel}
            detail={phaseDetail}
          />
        </div>

        <div className="mt-5 w-full max-w-xs">
          <div
            className="h-[4px] w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "rgba(16, 24, 40, 0.08)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="התקדמות כוללת"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                backgroundColor: "var(--ow-accent, #0f766e)",
                transition: "width 180ms linear",
              }}
            />
          </div>
          <p
            className="mt-2 text-[13px] font-medium tabular-nums"
            style={{ color: "var(--ow-text-muted)", textAlign: "center" }}
          >
            {progressPct}%
          </p>
        </div>
      </div>
    </div>
  );
}
