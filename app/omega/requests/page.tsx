"use client";

import { ChevronLeft } from "lucide-react";

const REQUESTS = [
  { title: "בקשה לדוגמה #1", status: "ממתין" },
  { title: "בקשה לדוגמה #2", status: "הושלם" },
  { title: "בקשה לדוגמה #3", status: "ממתין" },
];

export default function OmegaRequestsPlaceholderPage() {
  return (
    <div dir="rtl">
      <h2 className="mb-4 text-xl font-bold">בקשות</h2>

      <div className="mb-4 rounded-2xl bg-[var(--omega-surface)] p-4">
        <p className="opacity-70 text-sm">אין בקשות פעילות כרגע.</p>
      </div>

      <div className="rounded-2xl bg-[var(--omega-surface)] divide-y divide-white/5 overflow-hidden">
        {REQUESTS.map(({ title, status }) => (
          <button
            key={title}
            type="button"
            className="flex w-full items-center justify-between px-4 py-3.5 text-sm active:bg-white/5 transition-colors"
          >
            <span>{title}</span>
            <span className="flex items-center gap-2">
              <span className="opacity-50">{status}</span>
              <ChevronLeft className="size-4 opacity-40" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
