"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/theme-toggle";

/**
 * Sonner's <Toaster />, themed with the design tokens and following the
 * site theme (not just the system one). Use `toast()` from "sonner".
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      closeButton
      gap={10}
      offset={20}
      mobileOffset={16}
      containerAriaLabel="Notifications"
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-border": "var(--line)",
          "--normal-text": "var(--ink)",
          "--success-bg": "var(--surface)",
          "--success-border": "var(--line)",
          "--success-text": "var(--ink)",
          "--error-bg": "var(--danger-soft)",
          "--error-border": "color-mix(in oklab, var(--danger) 30%, transparent)",
          "--error-text": "var(--danger)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans! shadow-lg! gap-3!",
          title: "text-[0.9375rem]! font-medium!",
          description: "text-ink-2! text-sm!",
          actionButton: "bg-accent! text-accent-ink! rounded-sm! font-medium!",
          cancelButton: "bg-surface-2! text-ink! rounded-sm!",
          closeButton: "bg-surface! text-ink-2! border-line! hover:text-ink!",
          success: "[&_[data-icon]]:text-accent!",
          error: "[&_[data-icon]]:text-danger!",
          warning: "[&_[data-icon]]:text-learning!",
          info: "[&_[data-icon]]:text-ink-2!",
        },
      }}
    />
  );
}
