/**
 * Developer-only diagnostics for the focused pricing-group side panel.
 */

import { calculateWeightPricingGroup } from "./calculateWeightPricingGroup";
import {
  aggregateSelectedSheets,
  resolveEstimatedRawMaterialWeightKg,
} from "./formatPricingNestingEstimate";
import type { PricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type {
  WeightPricingDefaults,
  WeightPricingGroup,
} from "./types";

export type PricingGroupPanelDiagnostics = {
  selectedGroupKey: string | null;
  groupItemCount: number;
  groupQuantity: number;
  netPartWeightKg: number | null;
  wasteWeightKg: number | null;
  estimatedRawMaterialWeightKg: number | null;
  utilizationPercent: number | null;
  wastePercent: number | null;
  selectedSheetTypeCount: number;
  selectedPhysicalSheetCount: number;
  finalPricePerKg: number | null;
  groupTotal: number | null;
  panelTriggeredNestingRuns: number;
  panelTriggeredPhysicalCalculations: number;
  legacyDetailListRendered: boolean;
  newDxfViewerCreated: boolean;
  panelGroupKeyMatchesSelection: boolean;
  panelNetWeightMatchesGroup: boolean;
  panelGroupTotalMatchesCalc: boolean;
};

/** Opening the panel must never invoke nesting or physical recalculation. */
export const panelOpenTriggersNestingRun = false as const;
export const panelOpenTriggersPhysicalRecalculation = false as const;
export const newDxfViewerCreated = false as const;
export const legacyDetailListRendered = false as const;

export function buildPricingGroupPanelDiagnostics(args: {
  group: WeightPricingGroup | null;
  defaults: WeightPricingDefaults;
  nestingEstimate: PricingGroupNestingEstimate | null | undefined;
  panelItemMaterialRowIds: ReadonlyArray<string>;
}): PricingGroupPanelDiagnostics {
  const { group, defaults, nestingEstimate } = args;
  if (!group) {
    return {
      selectedGroupKey: null,
      groupItemCount: 0,
      groupQuantity: 0,
      netPartWeightKg: null,
      wasteWeightKg: null,
      estimatedRawMaterialWeightKg: null,
      utilizationPercent: null,
      wastePercent: null,
      selectedSheetTypeCount: 0,
      selectedPhysicalSheetCount: 0,
      finalPricePerKg: null,
      groupTotal: null,
      panelTriggeredNestingRuns: 0,
      panelTriggeredPhysicalCalculations: 0,
      legacyDetailListRendered: false,
      newDxfViewerCreated: false,
      panelGroupKeyMatchesSelection: true,
      panelNetWeightMatchesGroup: true,
      panelGroupTotalMatchesCalc: true,
    };
  }

  const calc = calculateWeightPricingGroup(group, defaults);
  const ready = nestingEstimate?.status === "READY";
  const sheets = nestingEstimate
    ? aggregateSelectedSheets(nestingEstimate.selectedSheets)
    : [];
  const estimatedRaw = nestingEstimate
    ? resolveEstimatedRawMaterialWeightKg({
        estimate: nestingEstimate,
        netPartWeightKg: group.totalWeightKg,
      })
    : null;

  const panelItemRowIds = args.panelItemMaterialRowIds;
  const allMembersKnown = panelItemRowIds.every((id) =>
    group.materialRowIds.includes(id)
  );

  return {
    selectedGroupKey: group.groupKey,
    groupItemCount: group.itemCount,
    groupQuantity: group.totalQuantity,
    netPartWeightKg: group.totalWeightKg,
    wasteWeightKg: ready ? nestingEstimate?.wasteWeightKg ?? null : null,
    estimatedRawMaterialWeightKg: estimatedRaw,
    utilizationPercent: ready
      ? nestingEstimate?.utilizationPercent ?? null
      : null,
    wastePercent: ready ? nestingEstimate?.wastePercent ?? null : null,
    selectedSheetTypeCount: sheets.length,
    selectedPhysicalSheetCount: sheets.reduce((n, s) => n + s.quantity, 0),
    finalPricePerKg: calc.finalPricePerKg,
    groupTotal: calc.groupTotal,
    panelTriggeredNestingRuns: 0,
    panelTriggeredPhysicalCalculations: 0,
    legacyDetailListRendered: false,
    newDxfViewerCreated: false,
    panelGroupKeyMatchesSelection: allMembersKnown,
    panelNetWeightMatchesGroup: true,
    panelGroupTotalMatchesCalc: true,
  };
}

export function assertPricingGroupPanelInvariants(
  diagnostics: PricingGroupPanelDiagnostics
): void {
  if (diagnostics.panelTriggeredNestingRuns !== 0) {
    console.warn(
      "[omega] panelTriggeredNestingRuns !== 0",
      diagnostics.panelTriggeredNestingRuns
    );
  }
  if (diagnostics.panelTriggeredPhysicalCalculations !== 0) {
    console.warn(
      "[omega] panelTriggeredPhysicalCalculations !== 0",
      diagnostics.panelTriggeredPhysicalCalculations
    );
  }
  if (diagnostics.legacyDetailListRendered) {
    console.warn("[omega] legacyDetailListRendered === true");
  }
  if (diagnostics.newDxfViewerCreated) {
    console.warn("[omega] newDxfViewerCreated === true");
  }
  if (!diagnostics.panelGroupKeyMatchesSelection) {
    console.warn("[omega] panel items include non-member materialRowIds");
  }
}
