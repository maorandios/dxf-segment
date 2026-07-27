"use client";

/**
 * Soft agentic illustration for DXF geometry upload.
 * Borderless decorative art — mirrors MaterialSourceUploadArt language.
 */

export function DxfUploadArt({ active = false }: { active?: boolean }) {
  return (
    <div
      className="relative mx-auto select-none"
      style={{
        width: 330,
        height: 225,
        opacity: active ? 1 : 0.96,
        transform: active ? "scale(1.02)" : "scale(1)",
        transition: "transform 180ms ease, opacity 180ms ease",
      }}
      aria-hidden
    >
      <span
        className="absolute rounded-full"
        style={{
          left: 42,
          top: 63,
          width: 246,
          height: 21,
          background: "#e8ecf1",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          left: 27,
          top: 93,
          width: 276,
          height: 24,
          background: "#eef1f5",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          left: 60,
          top: 126,
          width: 210,
          height: 18,
          background: "#e6eaef",
        }}
      />

      <svg
        className="absolute"
        style={{ left: 12, top: 42, width: 18, height: 18 }}
        viewBox="0 0 12 12"
        fill="none"
      >
        <path
          d="M6 1v10M1 6h10"
          stroke="#9ec5f0"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="absolute"
        style={{ right: 21, top: 33, width: 15, height: 15 }}
        viewBox="0 0 12 12"
        fill="none"
      >
        <path
          d="M6 1v10M1 6h10"
          stroke="#7eb8a8"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute rounded-full"
        style={{
          left: 33,
          top: 162,
          width: 10,
          height: 10,
          border: "1.5px solid #9ec5f0",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          right: 36,
          top: 168,
          width: 9,
          height: 9,
          border: "1.5px solid #7eb8a8",
        }}
      />

      {/* Back card — blueprint plate */}
      <div
        className="absolute"
        style={{
          left: 48,
          top: 40,
          width: 122,
          height: 150,
          transform: "rotate(-8deg)",
        }}
      >
        <DxfDocumentCard variant="blueprint" />
      </div>

      {/* Front card — DXF part */}
      <div
        className="absolute"
        style={{
          left: 158,
          top: 30,
          width: 122,
          height: 150,
          transform: "rotate(7deg)",
        }}
      >
        <DxfDocumentCard variant="part" />
      </div>
    </div>
  );
}

function DxfDocumentCard({ variant }: { variant: "blueprint" | "part" }) {
  const isPart = variant === "part";
  const accent = isPart ? "#7eb8a8" : "#9ec5f0";
  const labelColor = isPart ? "#0f766e" : "#3b82a8";
  const fold = isPart ? "#d5efe8" : "#d9eaf8";

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[14px]"
      style={{
        background: "#ffffff",
        border: `2px solid ${accent}`,
        boxShadow: "0 12px 32px -14px rgba(16, 24, 40, 0.2)",
      }}
    >
      <span
        className="absolute"
        style={{
          top: 0,
          right: 0,
          width: 27,
          height: 27,
          background: fold,
          clipPath: "polygon(0 0, 100% 100%, 0 100%)",
          transform: "scaleX(-1)",
        }}
      />
      <span
        className="absolute text-[14px] font-semibold tracking-wide"
        style={{
          top: 16,
          left: 14,
          color: labelColor,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        DXF
      </span>

      {isPart ? (
        <svg
          className="absolute"
          style={{ left: 18, right: 18, top: 52, width: 86, height: 78 }}
          viewBox="0 0 86 78"
          fill="none"
        >
          <path
            d="M12 58 L28 18 L58 18 L74 58 Z"
            stroke={accent}
            strokeWidth="2"
            strokeLinejoin="round"
            fill="rgba(15, 118, 110, 0.06)"
          />
          <circle cx="28" cy="18" r="3" fill={labelColor} />
          <circle cx="58" cy="18" r="3" fill={labelColor} />
          <circle cx="12" cy="58" r="3" fill={labelColor} />
          <circle cx="74" cy="58" r="3" fill={labelColor} />
          <path
            d="M28 18 L28 58 M58 18 L58 58"
            stroke="rgba(15, 118, 110, 0.25)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </svg>
      ) : (
        <svg
          className="absolute"
          style={{ left: 16, right: 16, top: 50, width: 90, height: 80 }}
          viewBox="0 0 90 80"
          fill="none"
        >
          <rect
            x="10"
            y="12"
            width="70"
            height="52"
            rx="4"
            stroke={accent}
            strokeWidth="1.75"
            fill="rgba(59, 130, 168, 0.05)"
          />
          <path
            d="M22 48 L38 28 L54 40 L68 24"
            stroke={labelColor}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="22" cy="48" r="2.5" fill={labelColor} />
          <circle cx="38" cy="28" r="2.5" fill={labelColor} />
          <circle cx="54" cy="40" r="2.5" fill={labelColor} />
          <circle cx="68" cy="24" r="2.5" fill={labelColor} />
        </svg>
      )}
    </div>
  );
}

/** Compact DXF glyph for file tiles. */
export function DxfFileGlyph({ size = 40 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[10px]"
      style={{
        width: size,
        height: size,
        background: "#ffffff",
        border: "1.5px solid #7eb8a8",
        boxShadow: "0 4px 12px -6px rgba(16, 24, 40, 0.18)",
      }}
      aria-hidden
    >
      <span
        className="absolute text-[9px] font-semibold tracking-wide"
        style={{ top: 5, left: 5, color: "#0f766e" }}
      >
        DXF
      </span>
      <svg
        className="absolute"
        style={{ left: 6, bottom: 5, width: size - 12, height: size * 0.42 }}
        viewBox="0 0 28 14"
        fill="none"
      >
        <path
          d="M2 12 L8 2 L20 2 L26 12 Z"
          stroke="#0f766e"
          strokeWidth="1.4"
          strokeLinejoin="round"
          fill="rgba(15, 118, 110, 0.08)"
        />
      </svg>
    </div>
  );
}
