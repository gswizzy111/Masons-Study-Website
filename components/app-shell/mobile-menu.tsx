"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/brand";
import { Segmented } from "@/components/ui/segmented";
import { useTheme, type ThemeChoice } from "@/components/theme-toggle";
import { Avatar } from "@/components/app-shell/user-menu";
import { NAV_ITEMS, displayNameOf, type ShellUser } from "@/components/app-shell/nav-items";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
  { value: "system", label: "System", icon: <Monitor aria-hidden /> },
] as const;

/** Menu button and slide-in panel, under 768px. */
export function MobileMenu({ user, className }: { user: ShellUser; className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const { theme, setTheme } = useTheme();
  const name = displayNameOf(user);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-md text-ink",
          "transition-colors duration-150 hover:bg-surface-2",
          className,
        )}
        aria-label="Open menu"
      >
        <Menu className="size-5" strokeWidth={1.75} aria-hidden />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-[rgb(10_12_14/0.45)] dark:bg-[rgb(0_0_0/0.6)]",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(22rem,88vw)] flex-col border-l border-line bg-surface shadow-lg outline-none",
            "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>

          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <Brand size="sm" />
            <DialogPrimitive.Close
              className="inline-flex size-10 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Close menu"
            >
              <X className="size-5" strokeWidth={1.75} aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-4">
            <div className="flex items-center gap-3 px-2 pb-4">
              <Avatar user={user} className="size-10 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-medium text-ink">{name}</p>
                {user.email ? <p className="truncate text-sm text-ink-2">{user.email}</p> : null}
              </div>
            </div>

            <nav aria-label="Main">
              <ul className="flex flex-col gap-0.5">
                {NAV_ITEMS.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-12 items-center gap-3 rounded-md px-3 text-base font-medium",
                          "transition-colors duration-150",
                          active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <Icon
                          className={cn("size-5", active ? "text-accent" : "text-ink-3")}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="mt-6 border-t border-line px-2 pt-5">
              <p id="mobile-theme-label" className="mb-2 text-sm font-medium text-ink">
                Theme
              </p>
              <Segmented<ThemeChoice>
                aria-labelledby="mobile-theme-label"
                value={theme}
                onValueChange={setTheme}
                options={THEME_OPTIONS}
                fullWidth
              />
            </div>
          </div>

          <div className="border-t border-line p-4">
            <form method="post" action="/auth/signout">
              <button
                type="submit"
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface text-[0.9375rem] font-medium text-ink",
                  "transition-colors duration-150 hover:bg-surface-2",
                )}
              >
                <LogOut className="size-4 text-ink-2" strokeWidth={1.75} aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
