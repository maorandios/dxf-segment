"use client";

import { useRouter } from "next/navigation";

type QuoteRow = {
  id: number;
  name: string;
  date: Date;
  status: "בתהליך" | "הושלם";
};

const DUMMY_QUOTES: QuoteRow[] = Array.from({ length: 25 }, (_, i) => {
  const day = 1 + (i % 27);
  const month = 1 + (i % 12);
  const year = 2025 + Math.floor(i / 40);
  return {
    id: i + 1,
    name:
      i % 4 === 0
        ? `הצעת מחיר — פרויקט ${i + 1}`
        : i % 4 === 1
          ? `ייצור ${20 + i} יחידות`
          : i % 4 === 2
            ? `חיתוך לייזר #${1000 + i}`
            : `פלטה מכופפת — ${i + 1}`,
    date: new Date(year, month - 1, day),
    status: i % 3 === 0 ? "הושלם" : "בתהליך",
  };
});

function formatDate(d: Date): string {
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function OmegaQuotesContent() {
  const router = useRouter();

  return (
    <div dir="rtl">
      <h2 className="mb-4 text-xl font-bold">הצעות מחיר</h2>

      <div className="rounded-2xl bg-[var(--omega-surface)] divide-y divide-white/5 overflow-hidden">
        {DUMMY_QUOTES.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between px-4 py-3 text-sm active:bg-white/5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{row.name}</p>
              <p className="text-xs opacity-50 mt-0.5">{formatDate(row.date)}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${
                row.status === "הושלם" ? "bg-green-500" : "bg-gray-500"
              }`}
            >
              {row.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 px-4 pb-4">
        <button
          type="button"
          onClick={() => router.push("/omega/new")}
          className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-white active:bg-primary/80 transition-colors"
        >
          יצירת הצעה חדשה
        </button>
      </div>
    </div>
  );
}
