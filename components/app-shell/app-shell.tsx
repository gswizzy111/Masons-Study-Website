import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { MainNav } from "@/components/app-shell/main-nav";
import { MobileMenu } from "@/components/app-shell/mobile-menu";
import { UserMenu } from "@/components/app-shell/user-menu";
import type { ShellUser } from "@/components/app-shell/nav-items";

export function SkipLink({ href = "#main" }: { href?: string }) {
  return (
    <a
      href={href}
      className={[
        "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]",
        "focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2.5",
        "focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg",
      ].join(" ")}
    >
      Skip to content
    </a>
  );
}

/**
 * The signed-in frame: sticky header (brand, main nav, theme toggle, account
 * menu; a menu panel under 768px) and <main id="main">. Pages own their
 * width and padding (see PageContainer).
 */
export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header
        data-print-hide
        className="sticky top-0 z-40 border-b border-line bg-bg"
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-8 lg:px-8">
          <Brand href="/dashboard" />
          <MainNav className="hidden md:block" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className="hidden md:inline-flex" />
            <UserMenu user={user} className="hidden md:inline-flex" />
            <MobileMenu user={user} className="md:hidden" />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {children}
      </main>
    </div>
  );
}
