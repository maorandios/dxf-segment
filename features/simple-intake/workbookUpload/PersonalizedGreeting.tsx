"use client";

export function PersonalizedGreeting({
  firstName,
}: {
  firstName: string | null;
}) {
  return (
    <div
      className="us-enter mx-auto flex w-full max-w-[720px] flex-col items-center text-center"
      style={{ textAlign: "center" }}
    >
      <p
        className="w-full text-center text-[12px] font-medium tracking-wide sm:text-[13px]"
        style={{ color: "var(--us-accent)", textAlign: "center" }}
      >
        {firstName ? `שלום, ${firstName}` : "שלום"}
      </p>
      <h1
        className="mt-2 w-full text-center text-[34px] font-semibold tracking-tight sm:text-[40px]"
        style={{ color: "var(--us-text)", textAlign: "center" }}
      >
        הפקת רשימת חומר
      </h1>
      <p
        className="mx-auto mt-2.5 w-full max-w-[560px] text-center text-[14px] leading-relaxed sm:text-[15px]"
        style={{ color: "var(--us-text-secondary)", textAlign: "center" }}
      >
        העלו את רשימת החומר שקיבלתם מהלקוח בפורמט{" "}
        <span className="us-ltr inline" dir="ltr">
          EXCEL
        </span>{" "}
        או{" "}
        <span className="us-ltr inline" dir="ltr">
          PDF
        </span>
      </p>
    </div>
  );
}
