import { Layers, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";

const CARDS: {
  title: string;
  description: string;
  icon: typeof Layers;
  iconClass: string;
}[] = [
  {
    title: "פלטה שטוחה",
    description: "הגדרת פלטה לפי אורך, רוחב, עובי וכמות",
    icon: Layers,
    iconClass:
      "bg-violet-500/[0.13] text-violet-700 [html:not(.light)_&]:text-violet-300",
  },
  {
    title: "פלטה מכופפת",
    description: "יצירת פלטה מכופפת לפי תבנית וצפייה מקדימה",
    icon: Shapes,
    iconClass:
      "bg-orange-500/[0.13] text-orange-700 [html:not(.light)_&]:text-orange-300",
  },
];

export default function OmegaNewPartPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        בחירת סוג חלק
      </h2>

      <ul className="flex flex-col gap-5">
        {CARDS.map(({ title, description, icon: Icon, iconClass }) => (
          <li key={title}>
            <div
              className={cn(
                "omega-app-surface-card flex min-h-[7.75rem] w-full flex-col items-start justify-center gap-3 rounded-3xl p-6 text-start",
                "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0"
              )}
            >
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-2xl",
                  iconClass
                )}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="text-lg font-semibold text-foreground">{title}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
