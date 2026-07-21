"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Status footer — dock (floating) or stripe (flush like the header). */
export function SystemStatusFooter({
  email,
  variant = "dock",
}: {
  email: string | null;
  hasWorkbook?: boolean;
  variant?: "dock" | "stripe";
}) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const content = (
    <>
      <div className="flex items-center justify-start gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            online && "us-online-pulse"
          )}
          style={{
            backgroundColor: online ? "var(--us-success)" : "var(--us-error)",
          }}
          aria-hidden
        />
        <span
          className="text-[13px] font-medium"
          style={{
            color: online ? "var(--us-text-secondary)" : "var(--us-error)",
          }}
        >
          {online ? "מחובר" : "אין חיבור"}
        </span>
      </div>

      <p
        className="hidden text-center text-[13px] sm:block"
        style={{ color: "var(--us-text-muted)" }}
      >
        {online
          ? "OMEGA מוכנה לעיבוד הקובץ הבא"
          : "בדוק את החיבור לרשת כדי להמשיך"}
      </p>

      <div className="flex justify-end">
        {email ? (
          <p
            className="truncate text-[12px]"
            style={{ color: "var(--us-text-muted)" }}
          >
            עובד עם:{" "}
            <span className="us-ltr inline-block" dir="ltr">
              {email}
            </span>
          </p>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--us-text-muted)" }}>
            סביבת עבודה פעילה
          </p>
        )}
      </div>
    </>
  );

  if (variant === "stripe") {
    return (
      <footer
        className="mt-auto w-full shrink-0 border-t"
        style={{
          backgroundColor: "var(--us-surface)",
          borderColor: "var(--us-border)",
        }}
      >
        <div
          className="mx-auto grid h-14 w-full items-center gap-3 px-6 sm:grid-cols-3 sm:h-16 sm:px-12"
          style={{ maxWidth: "min(1040px, calc(100vw - 48px))" }}
        >
          {content}
        </div>
      </footer>
    );
  }

  return (
    <footer className="shrink-0 px-6 pb-5 pt-1 sm:px-12 sm:pb-6">
      <div
        className="us-status-dock mx-auto grid h-[60px] items-center gap-3 px-5 sm:grid-cols-3 sm:px-6"
        style={{ width: "min(1180px, calc(100vw - 96px))" }}
      >
        {content}
      </div>
    </footer>
  );
}
