"use client";

export function QuoteSessionPrivacyNotice(props: {
  variant?: "details" | "files";
}) {
  const text =
    props.variant === "files"
      ? "הסשן אינו נשמר לאחר רענון או סגירת החלון."
      : "המידע נשמר רק בסשן הנוכחי בדפדפן ואינו נשמר כפרויקט בשרת.";

  return (
    <p
      role="note"
      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground"
    >
      {text}
    </p>
  );
}
