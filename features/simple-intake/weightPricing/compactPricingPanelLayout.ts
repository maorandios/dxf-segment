/**
 * Desktop no-scroll invariants for Compact Pricing Group Side Panel v2.
 * Layout heights are fixed upper bounds for the standard pricing viewport —
 * not measured at runtime in production UI.
 */

/** Standard desktop viewport used for the no-scroll regression. */
export const COMPACT_PRICING_PANEL_DESKTOP_VIEWPORT = {
  widthPx: 1440,
  heightPx: 900,
} as const;

/**
 * Available panel body height inside the pricing stage on the standard
 * desktop viewport (stage chrome + panel header/footer already reserved).
 */
export const COMPACT_PRICING_PANEL_AVAILABLE_BODY_HEIGHT_PX = 640;

/**
 * Upper-bound content height for the two compact sections + identity line.
 * Must stay below available body height so desktop needs no internal scroll.
 */
export const COMPACT_PRICING_PANEL_CONTENT_HEIGHT_BUDGET_PX = 520;

export const panelSectionCount = 2 as const;
export const panelItemTableRendered = false as const;
export const panelPricingSummarySectionRendered = false as const;
export const panelInternalScrollRequiredOnDesktop = false as const;
export const selectedRowHighlightUsesGroupKey = true as const;
export const panelOpenTriggersNestingRun = false as const;
export const panelOpenTriggersPricingCalculation = false as const;

export function compactPricingPanelInternalOverflowPx(
  contentHeightPx: number = COMPACT_PRICING_PANEL_CONTENT_HEIGHT_BUDGET_PX,
  availableBodyHeightPx: number = COMPACT_PRICING_PANEL_AVAILABLE_BODY_HEIGHT_PX
): number {
  return Math.max(0, contentHeightPx - availableBodyHeightPx);
}
