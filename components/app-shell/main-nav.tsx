"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/app-shell/nav-items";

/** Primary nav in the header, 768px and up. */
export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                  "transition-colors duration-150 ease-out",
                  active
                    ? "bg-surface-2 text-ink"
                    : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
                )}
              >
                {item.href === "/sets/new" ? (
                  <Icon
                    className={cn("size-4", active ? "text-accent" : "text-ink-3")}
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : null}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
