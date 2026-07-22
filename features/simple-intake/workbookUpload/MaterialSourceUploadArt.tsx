"use client";

/**
 * Soft agentic illustration for Excel + PDF material-source upload.
 * Borderless, no chrome — decorative only.
 */

export function MaterialSourceUploadArt({
  active = false,
}: {
  active?: boolean;
}) {
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
      {/* Soft cloud bars */}
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

      {/* Decorative sparkles */}
      <svg
        className="absolute"
        style={{ left: 12, top: 42, width: 18, height: 18 }}
        viewBox="0 0 12 12"
        fill="none"
      >
        <path
          d="M6 1v10M1 6h10"
          stroke="#f2b8b5"
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
          stroke="#c5cdd8"
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
          border: "1.5px solid #f2b8b5",
        }}
      />

      {/* PDF card (back-left) */}
      <div
        className="absolute"
        style={{
          left: 51,
          top: 42,
          width: 117,
          height: 147,
          transform: "rotate(-8deg)",
        }}
      >
        <DocumentCard
          accent="#e8a0a0"
          label="PDF"
          labelColor="#c45c5c"
          fold="#f6d5d5"
        />
      </div>

      {/* Excel card (front-right) */}
      <div
        className="absolute"
        style={{
          left: 162,
          top: 33,
          width: 117,
          height: 147,
          transform: "rotate(7deg)",
        }}
      >
        <DocumentCard
          accent="#8fc9a8"
          label="XLS"
          labelColor="#2f8f5b"
          fold="#d8efe3"
          grid
        />
      </div>
    </div>
  );
}

function DocumentCard({
  accent,
  label,
  labelColor,
  fold,
  grid = false,
}: {
  accent: string;
  label: string;
  labelColor: string;
  fold: string;
  grid?: boolean;
}) {
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
        className="absolute text-[15px] font-semibold tracking-wide"
        style={{
          top: 18,
          left: 15,
          color: labelColor,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {label}
      </span>
      {grid ? (
        <div
          className="absolute"
          style={{ left: 15, right: 15, top: 51, bottom: 18 }}
        >
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="mb-[7px] flex gap-[4px]"
              style={{ height: 12 }}
            >
              {[0, 1, 2].map((col) => (
                <span
                  key={col}
                  className="flex-1 rounded-[3px]"
                  style={{
                    background:
                      row === 0
                        ? "rgba(47, 143, 91, 0.22)"
                        : "rgba(16, 24, 40, 0.08)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="absolute flex flex-col gap-[9px]"
          style={{ left: 15, right: 21, top: 54 }}
        >
          <span
            className="rounded-full"
            style={{ height: 7, width: "70%", background: "rgba(16,24,40,0.1)" }}
          />
          <span
            className="rounded-full"
            style={{ height: 7, width: "88%", background: "rgba(16,24,40,0.08)" }}
          />
          <span
            className="rounded-full"
            style={{ height: 7, width: "62%", background: "rgba(16,24,40,0.08)" }}
          />
          <span
            className="mt-1.5 rounded-[4px]"
            style={{
              height: 33,
              width: "100%",
              background: "rgba(196, 92, 92, 0.08)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Single PDF or Excel document icon for the selected-file state. */
export function MaterialSourceFileIcon({
  sourceType,
  size = 96,
}: {
  sourceType: "EXCEL" | "PDF";
  size?: number;
}) {
  const isPdf = sourceType === "PDF";
  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: size, height: Math.round(size * 1.26) }}
      aria-hidden
    >
      <DocumentCard
        accent={isPdf ? "#e8a0a0" : "#8fc9a8"}
        label={isPdf ? "PDF" : "XLS"}
        labelColor={isPdf ? "#c45c5c" : "#2f8f5b"}
        fold={isPdf ? "#f6d5d5" : "#d8efe3"}
        grid={!isPdf}
      />
    </div>
  );
}
