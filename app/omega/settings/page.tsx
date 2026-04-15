"use client";

import { ChevronLeft } from "lucide-react";

const ITEMS = ["הגדרות חשבון", "התראות", "שפה", "אודות"];

export default function OmegaSettingsPlaceholderPage() {
  return (
    <div dir="rtl">
      <h2 className="mb-4 text-xl font-bold">הגדרות</h2>

      <div className="rounded-2xl bg-[var(--omega-surface)] divide-y divide-white/5 overflow-hidden">
        {ITEMS.map((title) => (
          <button
            key={title}
            type="button"
            className="flex w-full items-center justify-between px-4 py-3.5 text-sm active:bg-white/5 transition-colors"
          >
            <span>{title}</span>
            <ChevronLeft className="size-4 opacity-40" />
          </button>
        ))}
      </div>
    </div>
  );
}
