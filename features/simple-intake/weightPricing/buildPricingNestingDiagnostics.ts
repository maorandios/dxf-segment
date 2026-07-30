/**
 * Developer-only pricing nesting diagnostics.
 */

import type { PricingGroupNestingEstimate } from "./pricingGroupNestingTypes";
import type { PricingNestingDiagnostics } from "./pricingGroupNestingTypes";
import { pricingNestingEngineCounters } from "./runPricingGroupNestingEstimate";

export function buildPricingNestingDiagnostics(args: {
  pricingGroupCount: number;
  estimates: ReadonlyArray<PricingGroupNestingEstimate>;
  frozenRowsIncludedInNesting: number;
  nonMemberRowsIncludedInNesting: number;
}): PricingNestingDiagnostics {
  let nestingReadyGroupCount = 0;
  let nestingRunningGroupCount = 0;
  let nestingUnavailableGroupCount = 0;
  let nestingErrorGroupCount = 0;
  let groupsWithUnplacedParts = 0;
  let groupsWithSelectedSheetSummary = 0;

  for (const e of args.estimates) {
    if (e.status === "READY") nestingReadyGroupCount += 1;
    else if (e.status === "RUNNING") nestingRunningGroupCount += 1;
    else if (e.status === "ERROR") nestingErrorGroupCount += 1;
    else if (e.status === "UNAVAILABLE" || e.status === "IDLE") {
      nestingUnavailableGroupCount += 1;
    }
    if (e.unplacedPartCount > 0) groupsWithUnplacedParts += 1;
    if (e.selectedSheets.length > 0) groupsWithSelectedSheetSummary += 1;
  }

  return {
    pricingGroupCount: args.pricingGroupCount,
    nestingReadyGroupCount,
    nestingRunningGroupCount,
    nestingUnavailableGroupCount,
    nestingErrorGroupCount,
    groupsWithUnplacedParts,
    existingNestingEngineInvocationCount:
      pricingNestingEngineCounters.existingNestingEngineInvocationCount,
    newNestingAlgorithmInvocationCount:
      pricingNestingEngineCounters.newNestingAlgorithmInvocationCount,
    nestingRecalculationsTriggeredByPriceChanges:
      pricingNestingEngineCounters.nestingRecalculationsTriggeredByPriceChanges,
    nestingRecalculationsTriggeredByPhysicalChanges:
      pricingNestingEngineCounters.nestingRecalculationsTriggeredByPhysicalChanges,
    frozenRowsIncludedInNesting: args.frozenRowsIncludedInNesting,
    nonMemberRowsIncludedInNesting: args.nonMemberRowsIncludedInNesting,
    groupsWithSelectedSheetSummary,
    automaticPriceChangesFromNesting:
      pricingNestingEngineCounters.automaticPriceChangesFromNesting,
  };
}

export function assertPricingNestingInvariants(
  diagnostics: PricingNestingDiagnostics
): void {
  if (diagnostics.newNestingAlgorithmInvocationCount !== 0) {
    throw new Error(
      `pricingNesting invariant: newNestingAlgorithmInvocationCount=${diagnostics.newNestingAlgorithmInvocationCount}`
    );
  }
  if (diagnostics.nestingRecalculationsTriggeredByPriceChanges !== 0) {
    throw new Error(
      "pricingNesting invariant: price changes triggered nesting recalculation"
    );
  }
  if (diagnostics.frozenRowsIncludedInNesting !== 0) {
    throw new Error(
      `pricingNesting invariant: frozenRowsIncludedInNesting=${diagnostics.frozenRowsIncludedInNesting}`
    );
  }
  if (diagnostics.nonMemberRowsIncludedInNesting !== 0) {
    throw new Error(
      `pricingNesting invariant: nonMemberRowsIncludedInNesting=${diagnostics.nonMemberRowsIncludedInNesting}`
    );
  }
  if (diagnostics.automaticPriceChangesFromNesting !== 0) {
    throw new Error(
      "pricingNesting invariant: nesting changed prices automatically"
    );
  }
}
