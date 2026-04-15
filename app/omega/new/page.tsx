"use client";

import { Layers, Shapes } from "lucide-react";

const CARDS = [
  {
    title: "פלטה שטוחה",
    description: "הגדרת פלטה לפי אורך, רוחב, עובי וכמות",
    icon: Layers,
    iconBg: "bg-violet-500/[0.13]",
    iconColor: "text-violet-400",
  },
  {
    title: "פלטה מכופפת",
    description: "יצירת פלטה מכופפת לפי תבנית וצפייה מקדימה",
    icon: Shapes,
    iconBg: "bg-orange-500/[0.13]",
    iconColor: "text-orange-400",
  },
];

export default function OmegaNewPartPage() {
  return (
    <div dir="rtl">
      <h2 className="mb-4 text-xl font-bold">בחירת סוג חלק</h2>

      <div className="space-y-3">
        {CARDS.map(({ title, description, icon: Icon, iconBg, iconColor }) => (
          <div key={title} className="rounded-2xl bg-[var(--omega-surface)] p-4 shadow-sm">
            <div className="flex items-start gap-4">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${iconBg} ${iconColor}`}>
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-lg font-semibold">{title}</p>
                <p className="text-sm leading-relaxed opacity-70">{description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
