import { omegaShellWidthClass } from "../omegaShellTokens";
import { OmegaSideMenu } from "./OmegaSideMenu";
import { cn } from "@/lib/utils";

export function OmegaShell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="omega-app min-h-svh w-full text-foreground">
      <div
        className={cn(
          "relative mx-auto flex min-h-svh flex-col",
          omegaShellWidthClass
        )}
      >
        <header
          className={cn(
            "omega-app-surface-header sticky top-0 z-40 flex shrink-0 items-center justify-between gap-3",
            "rounded-b-[1.75rem] px-4 py-3.5 pt-[max(0.85rem,env(safe-area-inset-top,0px))] sm:px-6 md:px-8"
          )}
        >
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Omega
          </h1>
          <OmegaSideMenu />
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-6 sm:px-6 md:px-8 lg:px-10">
          <div className="flex min-h-0 flex-1 flex-col text-start">{children}</div>
        </main>
      </div>
    </div>
  );
}
