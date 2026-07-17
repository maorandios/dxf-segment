"use client";

import { Button } from "@/components/ui/button";

export function QuoteTableEmptyState(props: {
  kind:
    | "NO_ANALYSIS"
    | "NO_ROWS"
    | "NO_SEARCH"
    | "FILTER_EMPTY";
  onBackToFiles?: () => void;
}) {
  const copy = {
    NO_ANALYSIS: {
      title: "לא נמצאה טבלה להצגה",
      body: "יש לסיים ניתוח חומר לפני הצגת טבלת ההצעה.",
    },
    NO_ROWS: {
      title: "לא נמצאו שורות חלקים בקבצים שהועלו",
      body: "בדקו את קבצי המקור ונסו לנתח שוב.",
    },
    NO_SEARCH: {
      title: "לא נמצאו חלקים התואמים לחיפוש",
      body: "נסו מזהה חלק אחר או נקו את החיפוש.",
    },
    FILTER_EMPTY: {
      title: "אין שורות במצב זה",
      body: "בחרו מסנן אחר או הציגו את כל השורות.",
    },
  }[props.kind];

  return (
    <div className="rounded-[12px] border border-dashed border-white/15 px-4 py-10 text-center">
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
      {props.kind === "NO_ANALYSIS" && props.onBackToFiles && (
        <Button
          type="button"
          className="mt-4"
          variant="outline"
          onClick={props.onBackToFiles}
        >
          חזור להעלאת קבצים
        </Button>
      )}
    </div>
  );
}
