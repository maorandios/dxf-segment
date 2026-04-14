"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { BendPlateQuotePhase } from "@/features/quick-quote/components/method-phases/BendPlateQuotePhase";
import type { BendPlateQuoteItem } from "@/features/quick-quote/bend-plate/types";

export function OmegaBendLSession() {
  const router = useRouter();
  const [items, setItems] = useState<BendPlateQuoteItem[]>([]);

  const onAddItem = useCallback((item: BendPlateQuoteItem) => {
    setItems((prev) => [...prev, item]);
  }, []);

  const onUpdateItem = useCallback((item: BendPlateQuoteItem) => {
    setItems((prev) => prev.map((x) => (x.id === item.id ? item : x)));
  }, []);

  const onRemoveItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const onResetAll = useCallback(() => {
    setItems([]);
  }, []);

  const onBack = useCallback(() => {
    router.push("/omega");
  }, [router]);

  const onComplete = useCallback(() => {
    router.push("/omega/quotes");
  }, [router]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 touch-manipulation flex-col overflow-hidden [-webkit-tap-highlight-color:transparent]">
      <BendPlateQuotePhase
        materialType="carbonSteel"
        quoteItems={items}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onRemoveItem={onRemoveItem}
        onResetAll={onResetAll}
        onBack={onBack}
        onComplete={onComplete}
        initialTemplate="l"
      />
    </div>
  );
}
