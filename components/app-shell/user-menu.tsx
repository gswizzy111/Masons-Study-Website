"use client";

import Link from "next/link";
import { ChevronDown, LayoutGrid, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayNameOf, initialsOf, type ShellUser } from "@/components/app-shell/nav-items";

export function Avatar({ user, className }: { user: ShellUser; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent-soft",
        "text-[0.8125rem] font-semibold tracking-wide text-accent-strong",
        className,
      )}
    >
      {initialsOf(user)}
    </span>
  );
}

/** Account dropdown: who is signed in, settings, sign out. */
export function UserMenu({ user, className }: { user: ShellUser; className?: string }) {
  const name = displayNameOf(user);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group inline-flex h-10 items-center gap-1.5 rounded-full py-1 pr-2 pl-1",
          "transition-colors duration-150 ease-out hover:bg-surface-2 data-[state=open]:bg-surface-2",
          className,
        )}
        aria-label={`Account menu for ${name}`}
      >
        <Avatar user={user} />
        <ChevronDown
          className="size-4 text-ink-3 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180"
          strokeWidth={1.75}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <Avatar user={user} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {user.email ? <p className="truncate text-xs text-ink-2">{user.email}</p> : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutGrid strokeWidth={1.75} aria-hidden />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings strokeWidth={1.75} aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form method="post" action="/auth/signout">
          {/* Keep the menu open on select so the form is still in the page
              when the browser submits it. */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <button type="submit" className="w-full">
              <LogOut strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
