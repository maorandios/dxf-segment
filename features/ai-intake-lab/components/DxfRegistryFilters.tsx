"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { DxfRegistryFilter } from "@/lib/ai-intake/types";

const FILTERS: DxfRegistryFilter[] = [
  "all",
  "valid",
  "identityProblems",
  "revisionDuplicate",
  "geometryIssues",
];

interface DxfRegistryFiltersProps {
  value: DxfRegistryFilter;
  onChange: (filter: DxfRegistryFilter) => void;
  counts: Record<DxfRegistryFilter, number>;
}

export function DxfRegistryFilters({
  value,
  onChange,
  counts,
}: DxfRegistryFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("aiIntake.registry.filtersAria")}>
      {FILTERS.map((filter) => {
        const active = value === filter;
        return (
          <Button
            key={filter}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn("rounded-md", !active && "text-muted-foreground")}
            onClick={() => onChange(filter)}
            aria-selected={active}
            role="tab"
          >
            {t(`aiIntake.registry.filter.${filter}`)}
            <span className="ms-1.5 tabular-nums opacity-80">
              ({counts[filter]})
            </span>
          </Button>
        );
      })}
    </div>
  );
}
