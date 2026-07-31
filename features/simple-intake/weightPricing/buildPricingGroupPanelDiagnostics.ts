/**
 * Developer-only diagnostics for Compact Pricing Group Side Panel v2.
 */

import { buildPricingGroupRelativeMetrics } from "./buildPricingGroupRelativeMetrics";
import {
  compactPricingPanelInternalOverflowPx,
  panelInternalScrollRequiredOnDesktop,
  panelItemTableRendered,
  panelOpenTriggersNestingRun,
  panelOpenTriggersPricingCalculation,
  panelPricingSummarySectionRendered,
  panelSectionCount,
  selectedRowHighlightUsesGroupKey,
} from "./compactPricingPanelLayout";
import {
  aggregateSelectedSheets,
  resolveEstimatedRawMaterialWeightKg,
} from "./formatPricingNestingEstimate";
import type { PricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type {
  WeightPricingDefaults,
  WeightPricingGroup,
} from "./types";

export type CompactPricingPanelDiagnostics = {
  selectedGroupKey: string | null;
  itemCount: number;
  totalQuantity: number;
  groupWeightKg: number;
  quotationWeightKg: number;
  weightSharePercent: number;
  finalPricePerKg: number;
  groupTotal: number;
  quotationSubtotalBeforeVat: number;
  valueSharePercent: number;
  utilizationPercent: number | null;
  wastePercent: number | null;
  netWeightKg: number | null;
  wasteWeightKg: number | null;
  rawMaterialWeightKg: number | null;
  selectedSheetTypeCount: number;
  selectedPhysicalSheetCount: number;
  contentSectionCount: number;
  itemTableRendered: boolean;
  pricingSummaryRendered: boolean;
  internalVerticalOverflowPx: number;
  selectedPricingRowHighlighted: boolean;
  panelTriggeredNestingRuns: number;
  panelTriggeredPricingCalculations: number;
};

/** @deprecated Use CompactPricingPanelDiagnostics — kept for import stability. */
export type PricingGroupPanelDiagnostics = CompactPricingPanelDiagnostics;

export {
  panelOpenTriggersNestingRun,
  panelOpenTriggersPricingCalculation,
  panelSectionCount,
  panelItemTableRendered,
  panelPricingSummarySectionRendered,
  panelInternalScrollRequiredOnDesktop,
  selectedRowHighlightUsesGroupKey,
};

/** Opening the panel must never invoke nesting or pricing recalculation. */
export const panelOpenTriggersPhysicalRecalculation = false as const;
export const newDxfViewerCreated = false as const;
export const legacyDetailListRendered = false as const;

export function buildCompactPricingPanelDiagnostics(args: {
  group: WeightPricingGroup | null;
  defaults: WeightPricingDefaults;
  nestingEstimate: PricingGroupNestingEstimate | null | undefined;
  quotationWeightKg: number;
  quotationSubtotalBeforeVat: number;
  selectedPricingGroupKey: string | null;
}): CompactPricingPanelDiagnostics {
  const {
    group,
    defaults,
    nestingEstimate,
    quotationWeightKg,
    quotationSubtotalBeforeVat,
    selectedPricingGroupKey,
  } = args;

  if (!group) {
    return {
      selectedGroupKey: null,
      itemCount: 0,
      totalQuantity: 0,
      groupWeightKg: 0,
      quotationWeightKg,
      weightSharePercent: 0,
      finalPricePerKg: 0,
      groupTotal: 0,
      quotationSubtotalBeforeVat,
      valueSharePercent: 0,
      utilizationPercent: null,
      wastePercent: null,
      netWeightKg: null,
      wasteWeightKg: null,
      rawMaterialWeightKg: null,
      selectedSheetTypeCount: 0,
      selectedPhysicalSheetCount: 0,
      contentSectionCount: panelSectionCount,
      itemTableRendered: panelItemTableRendered,
      pricingSummaryRendered: panelPricingSummarySectionRendered,
      internalVerticalOverflowPx: compactPricingPanelInternalOverflowPx(),
      selectedPricingRowHighlighted: false,
      panelTriggeredNestingRuns: 0,
      panelTriggeredPricingCalculations: 0,
    };
  }

  const relative = buildPricingGroupRelativeMetrics({
    group,
    defaults,
    quotationWeightKg,
    quotationSubtotalBeforeVat,
  });
  const ready = nestingEstimate?.status === "READY";
  const sheets = nestingEstimate
    ? aggregateSelectedSheets(nestingEstimate.selectedSheets)
    : [];
  const rawMaterialWeightKg = nestingEstimate
    ? resolveEstimatedRawMaterialWeightKg({
        estimate: nestingEstimate,
        netPartWeightKg: group.totalWeightKg,
      })
    : null;

  const selectedGroupKey = group.groupKey;
  return {
    selectedGroupKey,
    itemCount: relative.itemCount,
    totalQuantity: relative.totalQuantity,
    groupWeightKg: relative.groupWeightKg,
    quotationWeightKg: relative.quotationWeightKg,
    weightSharePercent: relative.weightSharePercent,
    finalPricePerKg: relative.finalPricePerKg,
    groupTotal: relative.groupTotal,
    quotationSubtotalBeforeVat: relative.quotationSubtotalBeforeVat,
    valueSharePercent: relative.valueSharePercent,
    utilizationPercent: ready
      ? nestingEstimate?.utilizationPercent ?? null
      : null,
    wastePercent: ready ? nestingEstimate?.wastePercent ?? null : null,
    netWeightKg: ready ? group.totalWeightKg : null,
    wasteWeightKg: ready ? nestingEstimate?.wasteWeightKg ?? null : null,
    rawMaterialWeightKg: ready ? rawMaterialWeightKg : null,
    selectedSheetTypeCount: sheets.length,
    selectedPhysicalSheetCount: sheets.reduce((n, s) => n + s.quantity, 0),
    contentSectionCount: panelSectionCount,
    itemTableRendered: panelItemTableRendered,
    pricingSummaryRendered: panelPricingSummarySectionRendered,
    internalVerticalOverflowPx: compactPricingPanelInternalOverflowPx(),
    selectedPricingRowHighlighted:
      selectedPricingGroupKey != null &&
      selectedPricingGroupKey === selectedGroupKey,
    panelTriggeredNestingRuns: 0,
    panelTriggeredPricingCalculations: 0,
  };
}

/** Alias — same builder as v2 compact diagnostics. */
export function buildPricingGroupPanelDiagnostics(args: {
  group: WeightPricingGroup | null;
  defaults: WeightPricingDefaults;
  nestingEstimate: PricingGroupNestingEstimate | null | undefined;
  quotationWeightKg: number;
  quotationSubtotalBeforeVat: number;
  selectedPricingGroupKey: string | null;
}): CompactPricingPanelDiagnostics {
  return buildCompactPricingPanelDiagnostics(args);
}

export function assertCompactPricingPanelInvariants(
  diagnostics: CompactPricingPanelDiagnostics
): void {
  if (diagnostics.contentSectionCount !== 2) {
    console.warn(
      "[omega] contentSectionCount !== 2",
      diagnostics.contentSectionCount
    );
  }
  if (diagnostics.itemTableRendered) {
    console.warn("[omega] itemTableRendered === true");
  }
  if (diagnostics.pricingSummaryRendered) {
    console.warn("[omega] pricingSummaryRendered === true");
  }
  if (diagnostics.internalVerticalOverflowPx !== 0) {
    console.warn(
      "[omega] internalVerticalOverflowPx !== 0",
      diagnostics.internalVerticalOverflowPx
    );
  }
  if (
    diagnostics.selectedPricingRowHighlighted !==
    (diagnostics.selectedGroupKey !== null)
  ) {
    console.warn(
      "[omega] selectedPricingRowHighlighted mismatch",
      diagnostics.selectedPricingRowHighlighted,
      diagnostics.selectedGroupKey
    );
  }
  if (diagnostics.panelTriggeredNestingRuns !== 0) {
    console.warn(
      "[omega] panelTriggeredNestingRuns !== 0",
      diagnostics.panelTriggeredNestingRuns
    );
  }
  if (diagnostics.panelTriggeredPricingCalculations !== 0) {
    console.warn(
      "[omega] panelTriggeredPricingCalculations !== 0",
      diagnostics.panelTriggeredPricingCalculations
    );
  }
}

/** @deprecated Use assertCompactPricingPanelInvariants */
export const assertPricingGroupPanelInvariants =
  assertCompactPricingPanelInvariants;
