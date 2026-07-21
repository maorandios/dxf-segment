"use client";

import Link from "next/link";
import {
  ChevronDown,
  CreditCard,
  Layers,
  Mail,
  Settings,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type UploadScreenUser = {
  fullName: string | null;
  email: string | null;
};

const DEMO_EMAIL = "Maor.andios@gmail.com";

const menuItemClass =
  "cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[#13202B] focus:bg-[#F2F5F7] focus:text-[#13202B] data-[highlighted]:bg-[#F2F5F7]";

export function UserAccountMenu({ user }: { user: UploadScreenUser }) {
  const email = user.email?.trim() || DEMO_EMAIL;
  const displayName = user.fullName?.trim() || "משתמש";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex max-w-[min(280px,70vw)] items-center gap-2 rounded-full border bg-white py-2 pe-2.5 ps-3.5 transition-colors duration-150 hover:bg-[#F5F8F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
          style={{ borderColor: "#D6DEE6" }}
          aria-label="תפריט משתמש"
        >
          <span
            className="us-ltr min-w-0 truncate text-[13px] font-medium text-[#13202B]"
            dir="ltr"
          >
            {email}
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-[#8B96A3]"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="min-w-[15rem] rounded-xl border border-[#E5E9EE] bg-white p-1.5 text-[#13202B] shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#E5E9EE",
          color: "#13202B",
        }}
      >
        <div className="space-y-1.5 px-2.5 py-2">
          <div className="flex items-center gap-2.5">
            <User className="h-4 w-4 shrink-0 text-[#8B96A3]" aria-hidden />
            <p className="min-w-0 truncate text-[13px] font-medium text-[#13202B]">
              {displayName}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 shrink-0 text-[#8B96A3]" aria-hidden />
            <p
              className="us-ltr min-w-0 flex-1 truncate text-end text-[12px] text-[#8B96A3]"
              dir="ltr"
            >
              {email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator className="mx-1 my-1 bg-[#E5E9EE]" />
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/settings/account">
            <Settings className="h-4 w-4 text-[#8B96A3]" aria-hidden />
            הגדרות
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/settings/materials">
            <Layers className="h-4 w-4 text-[#8B96A3]" aria-hidden />
            הגדרת חומרים
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClass}>
          <Link href="/settings/bill-and-usage">
            <CreditCard className="h-4 w-4 text-[#8B96A3]" aria-hidden />
            חיוב ושימוש
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
