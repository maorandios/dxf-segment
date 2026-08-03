/**
 * Shared marketing footer used on auth + quote setup.
 */

export function SegmentMarketingFooter({
  className = "shrink-0 px-2 text-center",
}: {
  className?: string;
}) {
  return (
    <footer
      className={className}
      style={{ animation: "us-fade-up 480ms ease-out 120ms both" }}
    >
      <p
        className="mx-auto max-w-2xl text-center text-[11px] leading-relaxed sm:text-[12px]"
        style={{ color: "var(--us-text-muted)", textAlign: "center" }}
      >
        סגמנט הינה מערכת יצירת הצעות מחיר לענף המתכת בישראל, המערכת מבוססת בינה
        מלאכותית ואלגוריתמים הנדסיים. באמצעותה ניתן להגיע להחלטות עסקיות
        במהירות ולהפיק הצעת מחיר בהתאם
      </p>
      <p
        className="mt-1.5 text-center text-[11px] font-bold sm:text-[12px]"
        style={{ color: "var(--us-text-muted)", textAlign: "center" }}
      >
        כל הזכויות שמורות לסגמנט © 2026
      </p>
    </footer>
  );
}
