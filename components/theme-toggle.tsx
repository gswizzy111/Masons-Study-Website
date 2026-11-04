"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Theme handling.
 *
 * The choice ("light" | "dark" | "system") is stored in localStorage under
 * `theme`. ThemeScript (in <head> of app/layout.tsx) applies the `dark` class on
 * <html> before first paint; this module keeps it in sync afterwards
 * (system changes, other tabs, and React's dev remount, which clears
 * attributes it did not set).
 */

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const CHANGE_EVENT = "mstudy:theme-change";
const ORDER: ThemeChoice[] = ["light", "dark", "system"];

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

function apply(choice: ThemeChoice, { instant = false }: { instant?: boolean } = {}) {
  const dark = resolve(choice) === "dark";
  const root = document.documentElement;
  if (root.classList.contains("dark") === dark) return;
  // Switch every color at once instead of letting each element's color
  // transition run on its own schedule.
  let style: HTMLStyleElement | null = null;
  if (instant) {
    style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
  }
  root.classList.toggle("dark", dark);
  if (style) {
    const el = style;
    void window.getComputedStyle(document.body).color; // flush styles
    window.requestAnimationFrame(() => el.remove());
  }
}

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", callback);
  };
}

/** Choice snapshot. The server and the first client render agree on "system". */
const getServerChoice = (): ThemeChoice => "system";

/** Resolved snapshot ("light" | "dark"). The server assumes light. */
function getResolved(): "light" | "dark" {
  return resolve(readChoice());
}
const getServerResolved = (): "light" | "dark" => "light";

/** Set the theme from anywhere (settings pages, menus). */
export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked (private mode). The class still changes.
  }
  apply(choice, { instant: true });
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * `{ theme, resolvedTheme, setTheme }`. `theme` is the stored choice,
 * `resolvedTheme` is what is on screen.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readChoice, getServerChoice);
  const resolvedTheme = useSyncExternalStore(subscribe, getResolved, getServerResolved);
  return { theme, resolvedTheme, setTheme };
}

/**
 * Keeps the `dark` class right after hydration: follows the system while the
 * choice is "system", follows other tabs, and re-applies after React's dev
 * remount. Rendered once in the root layout. Renders nothing.
 */
// Runs while the HTML is parsed, before first paint: applies the saved theme
// (or the system one) so dark mode never flashes light.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

/**
 * The no-flash theme script for <head>. The server sends a normal inline
 * script. If React ever creates the element in the browser (Next re-renders
 * the root on some not-found responses in dev), it is marked as a data block:
 * a script created by React never runs anyway, and this keeps React from
 * logging "Encountered a script tag" errors. ThemeSync applies the theme then.
 */
export function ThemeScript() {
  return (
    <script
      suppressHydrationWarning
      type={typeof window === "undefined" ? undefined : "text/plain"}
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}

export function ThemeSync() {
  useLayoutEffect(() => {
    apply(readChoice());
    return subscribe(() => apply(readChoice(), { instant: true }));
  }, []);
  return null;
}

const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * Icon button that cycles light, dark, system. The label says the current
 * theme and what a press does.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = ICONS[theme];

  const onClick = useCallback(() => setTheme(next), [next]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Theme: ${LABELS[theme]}. Switch to ${LABELS[next].toLowerCase()}.`}
      title={`Theme: ${LABELS[theme]}`}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-md text-ink-2",
        "transition-[background-color,color,scale] duration-150 ease-out",
        "hover:bg-surface-2 hover:text-ink active:scale-[0.96]",
        className,
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
