"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  CircleUserRound,
  CreditCard,
  Layers,
  LogOut,
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
import { openAccountModal } from "@/features/accountModals";
import {
  getDisplayContactName,
  getSignedInUserEmail,
} from "@/features/accountModals/signedInUser";
import { signOut } from "@/features/auth";

export type UploadScreenUser = {
  fullName: string | null;
  email: string | null;
};

const menuItemClass =
  "cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[#13202B] focus:bg-[#F2F5F7] focus:text-[#13202B] data-[highlighted]:bg-[#F2F5F7]";

export function UserAccountMenu({ user }: { user: UploadScreenUser }) {
  const email = user.email?.trim() || getSignedInUserEmail();
  const displayName =
    user.fullName?.trim() || getDisplayContactName() || "משתמש";
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openModal(
    type: "COMPANY_SETTINGS" | "MATERIAL_SETTINGS" | "BILLING_USAGE"
  ): void {
    setMenuOpen(false);
    openAccountModal(type, triggerRef.current);
  }

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="flex max-w-[min(280px,70vw)] items-center gap-2.5 rounded-full border bg-white py-1.5 pe-2.5 ps-3 transition-colors duration-150 hover:bg-[#F5F8F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
          style={{ borderColor: "#D6DEE6" }}
          aria-label="תפריט משתמש"
          data-account-menu-trigger="true"
        >
          <CircleUserRound
            className="h-7 w-7 shrink-0 text-[#0F766E]"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 text-start">
            <span className="block truncate text-[13px] font-medium leading-tight text-[#13202B]">
              {displayName}
            </span>
            <span
              className="us-ltr block truncate text-[11px] leading-tight text-[#8B96A3]"
              dir="ltr"
            >
              {email}
            </span>
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
        data-account-menu-dropdown="true"
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
        <DropdownMenuItem
          className={menuItemClass}
          onSelect={(e) => {
            e.preventDefault();
            openModal("COMPANY_SETTINGS");
          }}
          data-account-menu-item="COMPANY_SETTINGS"
        >
          <Settings className="h-4 w-4 text-[#8B96A3]" aria-hidden />
          הגדרות
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClass}
          onSelect={(e) => {
            e.preventDefault();
            openModal("MATERIAL_SETTINGS");
          }}
          data-account-menu-item="MATERIAL_SETTINGS"
        >
          <Layers className="h-4 w-4 text-[#8B96A3]" aria-hidden />
          הגדרות חומרים
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClass}
          onSelect={(e) => {
            e.preventDefault();
            openModal("BILLING_USAGE");
          }}
          data-account-menu-item="BILLING_USAGE"
        >
          <CreditCard className="h-4 w-4 text-[#8B96A3]" aria-hidden />
          חיוב ושימוש
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-1 my-1 bg-[#E5E9EE]" />
        <DropdownMenuItem
          className={menuItemClass}
          onSelect={(e) => {
            e.preventDefault();
            setMenuOpen(false);
            void signOut();
          }}
          data-account-menu-item="LOGOUT"
        >
          <LogOut className="h-4 w-4 text-[#8B96A3]" aria-hidden />
          התנתק
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
