"use client";

import type { CSSProperties, ReactNode } from "react";

/** Canonical content width shared by gap-resolution and final quote-list screens. */
export const REVIEW_WORKSPACE_CONTENT_MAX_PX = 1200;

export const REVIEW_WORKSPACE_WIDTH_TOKEN = "REVIEW_WORKSPACE_CONTENT_MAX_PX:1200";

/**
 * Outer content shell — identical horizontal boundaries for gap and final screens.
 */
export function ReviewWorkspaceContainer({
  children,
  className,
  style,
  "data-testid": testId = "review-workspace-container",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-review-workspace-container="true"
      data-review-workspace-width-token={REVIEW_WORKSPACE_WIDTH_TOKEN}
      className={["mx-auto w-full", className].filter(Boolean).join(" ")}
      style={{
        maxWidth: REVIEW_WORKSPACE_CONTENT_MAX_PX,
        ...style,
      }}
      dir="rtl"
    >
      {children}
    </div>
  );
}
