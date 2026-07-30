"use client";

/**
 * Async nesting estimates per pricing group.
 * Invalidates only on physical-scope signature changes — never on price edits.
 * Uses existing Quick Quote rectPackEstimate via runPricingGroupNestingEstimate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { loadProcessedGeometryFromDxfFile } from "../results/SimpleDxfGeometryPreview";
import type { FinalQuoteListMembership } from "../finalQuoteListMembership";
import type { FinalIntakeRow } from "../results/types";
import type { SimpleDxfPart } from "../types";
import type { ProcessedGeometry } from "@/types";
import {
  buildPricingNestingInputSignature,
  defaultStockSheetConfigKey,
  selectNestingRowsForPricingGroup,
} from "./buildPricingGroupNestingInput";
import {
  emptyPricingGroupNestingEstimate,
  type PricingGroupNestingEstimate,
} from "./pricingGroupNestingTypes";
import {
  pricingNestingEngineCounters,
  runPricingGroupNestingEstimate,
} from "./runPricingGroupNestingEstimate";
import type { PricingGroupKey, WeightPricingGroup } from "./types";

type GeometryCache = Map<string, ProcessedGeometry | null>;

function resolveDxfFile(
  matchedDxfId: string,
  dxfParts: ReadonlyArray<SimpleDxfPart>,
  dxfFiles: ReadonlyArray<File>
): File | null {
  const part = dxfParts.find((p) => p.id === matchedDxfId);
  if (!part) return null;
  return (
    dxfFiles.find((f) => f.name === part.filename || f.name === part.partId) ??
    null
  );
}

export function usePricingGroupNestingEstimates(args: {
  groups: ReadonlyArray<WeightPricingGroup>;
  approvedRows: ReadonlyArray<FinalIntakeRow>;
  membership: FinalQuoteListMembership | null | undefined;
  dxfParts: ReadonlyArray<SimpleDxfPart>;
  dxfFiles: ReadonlyArray<File>;
}): {
  estimatesByKey: ReadonlyMap<PricingGroupKey, PricingGroupNestingEstimate>;
  frozenRowsIncludedInNesting: number;
  nonMemberRowsIncludedInNesting: number;
} {
  const [estimatesByKey, setEstimatesByKey] = useState<
    Map<PricingGroupKey, PricingGroupNestingEstimate>
  >(() => new Map());
  const geometryCacheRef = useRef<GeometryCache>(new Map());
  const resultCacheRef = useRef<Map<string, PricingGroupNestingEstimate>>(
    new Map()
  );
  const lastSignatureByGroupRef = useRef<Map<PricingGroupKey, string>>(
    new Map()
  );

  const scopePlan = useMemo(() => {
    let frozenRowsIncludedInNesting = 0;
    let nonMemberRowsIncludedInNesting = 0;
    const stockKey = defaultStockSheetConfigKey();
    const plans = args.groups.map((group) => {
      const selected = selectNestingRowsForPricingGroup({
        group,
        approvedRows: args.approvedRows,
        membership: args.membership,
        dxfParts: args.dxfParts,
      });
      frozenRowsIncludedInNesting += selected.frozenRowsIncludedInNesting;
      nonMemberRowsIncludedInNesting += selected.nonMemberRowsIncludedInNesting;
      const signature = buildPricingNestingInputSignature({
        groupKey: group.groupKey,
        rows: selected.rows,
        stockSheetConfigKey: stockKey,
      });
      const totalPartWeightKg = selected.rows.reduce(
        (s, r) => s + r.totalWeightKg,
        0
      );
      return {
        group,
        rows: selected.rows,
        preflightFailures: selected.preflightFailures,
        signature,
        totalPartWeightKg,
      };
    });
    return {
      plans,
      frozenRowsIncludedInNesting,
      nonMemberRowsIncludedInNesting,
      scopeKey: plans.map((p) => p.signature).join("||"),
    };
  }, [args.groups, args.approvedRows, args.membership, args.dxfParts]);

  useEffect(() => {
    let cancelled = false;
    const { plans } = scopePlan;

    async function run(): Promise<void> {
      const next = new Map<PricingGroupKey, PricingGroupNestingEstimate>();

      for (const plan of plans) {
        const cached = resultCacheRef.current.get(plan.signature);
        if (cached) {
          next.set(plan.group.groupKey, cached);
          lastSignatureByGroupRef.current.set(
            plan.group.groupKey,
            plan.signature
          );
          continue;
        }

        const prevSig = lastSignatureByGroupRef.current.get(
          plan.group.groupKey
        );
        if (prevSig != null && prevSig !== plan.signature) {
          pricingNestingEngineCounters.nestingRecalculationsTriggeredByPhysicalChanges += 1;
        }

        next.set(
          plan.group.groupKey,
          emptyPricingGroupNestingEstimate(plan.group.groupKey, "RUNNING")
        );
      }

      if (!cancelled) setEstimatesByKey(new Map(next));

      for (const plan of plans) {
        if (cancelled) return;
        if (resultCacheRef.current.has(plan.signature)) continue;

        const geometryByDxfId = new Map<
          string,
          ProcessedGeometry | null | undefined
        >();
        const dxfIds = [...new Set(plan.rows.map((r) => r.matchedDxfId))];
        for (const dxfId of dxfIds) {
          if (geometryCacheRef.current.has(dxfId)) {
            geometryByDxfId.set(dxfId, geometryCacheRef.current.get(dxfId));
            continue;
          }
          const file = resolveDxfFile(dxfId, args.dxfParts, args.dxfFiles);
          let geo: ProcessedGeometry | null = null;
          if (!file) {
            geometryCacheRef.current.set(dxfId, null);
            geometryByDxfId.set(dxfId, null);
            continue;
          }
          try {
            geo = await loadProcessedGeometryFromDxfFile(file);
          } catch {
            geo = null;
          }
          geometryCacheRef.current.set(dxfId, geo);
          geometryByDxfId.set(dxfId, geo);
        }

        const estimate = runPricingGroupNestingEstimate({
          groupKey: plan.group.groupKey,
          inputSignature: plan.signature,
          rows: plan.rows,
          geometryByDxfId,
          thicknessMm: plan.group.thicknessMm,
          material: plan.group.material,
          totalPartWeightKg: plan.totalPartWeightKg,
          preflightFailures: plan.preflightFailures,
        });

        if (
          process.env.NODE_ENV !== "production" &&
          estimate.status !== "READY"
        ) {
          console.warn(
            "[pricingNesting] unavailable",
            plan.group.groupKey,
            estimate.failureDetails
          );
        }

        resultCacheRef.current.set(plan.signature, estimate);
        lastSignatureByGroupRef.current.set(
          plan.group.groupKey,
          plan.signature
        );

        if (!cancelled) {
          setEstimatesByKey((prev) => {
            const m = new Map(prev);
            m.set(plan.group.groupKey, estimate);
            return m;
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- physical scopeKey only
  }, [scopePlan.scopeKey, args.dxfParts, args.dxfFiles]);

  return {
    estimatesByKey,
    frozenRowsIncludedInNesting: scopePlan.frozenRowsIncludedInNesting,
    nonMemberRowsIncludedInNesting: scopePlan.nonMemberRowsIncludedInNesting,
  };
}
