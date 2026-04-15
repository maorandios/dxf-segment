"use client";

import { Layers, Shapes } from "lucide-react";
import { BlockTitle, Card } from "konsta/react";

const CARDS: {
  title: string;
  description: string;
  icon: typeof Layers;
  iconBg: string;
  iconColor: string;
}[] = [
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
      <BlockTitle large>בחירת סוג חלק</BlockTitle>

      <div className="space-y-4 px-4">
        {CARDS.map(({ title, description, icon: Icon, iconBg, iconColor }) => (
          <Card key={title} raised>
            <div className="flex items-start gap-4">
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${iconBg} ${iconColor}`}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-lg font-semibold">{title}</p>
                <p className="text-sm leading-relaxed opacity-70">
                  {description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
