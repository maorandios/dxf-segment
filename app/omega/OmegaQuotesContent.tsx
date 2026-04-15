"use client";

import { useRouter } from "next/navigation";
import { BlockTitle, List, ListItem, Button, Block, Badge } from "konsta/react";

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
      <BlockTitle large>הצעות מחיר</BlockTitle>

      <List strong inset>
        {DUMMY_QUOTES.map((row) => (
          <ListItem
            key={row.id}
            title={row.name}
            subtitle={formatDate(row.date)}
            after={
              <Badge
                colors={{
                  bg:
                    row.status === "הושלם"
                      ? "bg-green-500"
                      : "bg-gray-500",
                  text: "text-white",
                }}
              >
                {row.status}
              </Badge>
            }
            link
            chevronMaterial={false}
          />
        ))}
      </List>

      <Block className="pb-4">
        <Button large rounded onClick={() => router.push("/omega/new")}>
          יצירת הצעה חדשה
        </Button>
      </Block>
    </div>
  );
}
