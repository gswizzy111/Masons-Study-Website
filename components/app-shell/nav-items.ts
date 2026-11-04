import { LayoutGrid, Plus, Settings, type LucideIcon } from "lucide-react";

export type ShellUser = {
  email?: string | null;
  displayName?: string | null;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutGrid,
    // Sets are opened from the dashboard, so it stays lit inside a set.
    match: (p) =>
      p === "/dashboard" || (p.startsWith("/sets/") && !p.startsWith("/sets/new")),
  },
  {
    href: "/sets/new",
    label: "New set",
    icon: Plus,
    match: (p) => p === "/sets/new" || p.startsWith("/sets/new/"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p === "/settings" || p.startsWith("/settings/"),
  },
];

export function displayNameOf(user: ShellUser): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const local = user.email?.split("@")[0]?.trim();
  return local || "Your account";
}

export function initialsOf(user: ShellUser): string {
  const name = user.displayName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
    return (first + last).toUpperCase() || "?";
  }
  return (user.email?.[0] ?? "?").toUpperCase();
}
