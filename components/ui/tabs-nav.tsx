"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type TabsNavItem = {
  href: string;
  label: string;
  /** A lucide icon element. */
  icon?: ReactNode;
  /**
   * Active only on an exact path match. Without it a tab is also active on
   * its sub-pages (/sets/1/games matches /sets/1/games/meteor). Set it on
   * the overview tab.
   */
  exact?: boolean;
  /** Small trailing content, e.g. a count badge. */
  badge?: ReactNode;
};

type TabsNavProps = {
  items: ReadonlyArray<TabsNavItem>;
  /** Accessible name of the nav landmark. */
  "aria-label": string;
  className?: string;
};

function isActive(pathname: string, item: TabsNavItem): boolean {
  const href = item.href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (item.exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Link-based tab bar. The current tab gets aria-current="page" and an accent
 * underline. Scrolls sideways on phones, with a fade on the side that has
 * more tabs.
 */
export function TabsNav({ items, className, ...aria }: TabsNavProps) {
  const pathname = usePathname() ?? "";
  const scrollerRef = useRef<HTMLDivElement>(null);
  const layoutId = `tabs-nav-${useId()}`;
  const reduce = useReducedMotion();

  // Pick the most specific active tab (longest href), so nested tabs don't
  // both light up.
  let activeHref: string | null = null;
  for (const item of items) {
    if (isActive(pathname, item) && (!activeHref || item.href.length > activeHref.length)) {
      activeHref = item.href;
    }
  }

  // Edge fades: set data attributes straight on the element (no re-render).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = el.scrollLeft > 2 ? "true" : "false";
      el.dataset.fadeEnd = el.scrollLeft < max - 2 ? "true" : "false";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // Keep the current tab in view on phones.
  useEffect(() => {
    const el = scrollerRef.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !active) return;
    const left = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [pathname, reduce]);

  return (
    <nav aria-label={aria["aria-label"]} className={cn("relative border-b border-line", className)}>
      <div
        ref={scrollerRef}
        data-fade-start="false"
        data-fade-end="false"
        className={cn(
          "scrollbar-none overflow-x-auto overscroll-x-contain",
          "[--fade:24px]",
          "data-[fade-end=true]:[mask-image:linear-gradient(to_right,black_calc(100%-var(--fade)),transparent)]",
          "data-[fade-start=true]:[mask-image:linear-gradient(to_right,transparent,black_var(--fade))]",
          "data-[fade-start=true]:data-[fade-end=true]:[mask-image:linear-gradient(to_right,transparent,black_var(--fade),black_calc(100%-var(--fade)),transparent)]",
        )}
      >
        <ul className="flex w-max min-w-full items-stretch gap-1">
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-t-sm px-3 text-sm font-medium",
                    "transition-colors duration-150 ease-out focus-visible:-outline-offset-2",
                    "[&_svg]:size-4 [&_svg]:shrink-0",
                    active ? "text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {item.icon ? (
                    <span aria-hidden className={cn(active ? "text-accent" : "text-ink-3")}>
                      {item.icon}
                    </span>
                  ) : null}
                  {item.label}
                  {item.badge}
                  {active ? (
                    <motion.span
                      layoutId={layoutId}
                      aria-hidden
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
                      transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
