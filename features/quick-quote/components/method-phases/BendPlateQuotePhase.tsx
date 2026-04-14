"use client";

import type { MaterialType } from "@/types/materials";
import type { BendPlateQuoteItem, BendTemplateId } from "../../bend-plate/types";
import { BendPlateBuilder } from "../../bend-plate/BendPlateBuilder";

interface BendPlateQuotePhaseProps {
  materialType: MaterialType;
  quoteItems: BendPlateQuoteItem[];
  onAddItem: (item: BendPlateQuoteItem) => void;
  onUpdateItem: (item: BendPlateQuoteItem) => void;
  onRemoveItem: (id: string) => void;
  onResetAll: () => void;
  onBack: () => void;
  onComplete: () => void;
  initialTemplate?: BendTemplateId;
}

export function BendPlateQuotePhase({
  materialType,
  quoteItems,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onResetAll,
  onBack,
  onComplete,
  initialTemplate,
}: BendPlateQuotePhaseProps) {
  return (
    <BendPlateBuilder
      materialType={materialType}
      quoteItems={quoteItems}
      onAddItem={onAddItem}
      onUpdateItem={onUpdateItem}
      onRemoveItem={onRemoveItem}
      onResetAll={onResetAll}
      onBack={onBack}
      onComplete={onComplete}
      initialTemplate={initialTemplate}
    />
  );
}
