"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Tooltips (Radix). Only for supplementary hints: never put essential
 * information only in a tooltip (touch screens can't hover).
 *
 *   <WithTooltip label="Star card"><Button size="icon" aria-label="Star card">...</Button></WithTooltip>
 */
export function TooltipProvider({
  delayDuration = 350,
  skipDelayDuration = 250,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

/** A tooltip root that brings its own provider, so it works anywhere. */
export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props} />
    </TooltipProvider>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-64 rounded-sm bg-ink px-2 py-1.5 text-xs font-medium leading-snug text-bg shadow-md",
          "origin-(--radix-tooltip-content-transform-origin)",
          "data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-fade-out",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Shorthand: wraps one focusable child with a tooltip. */
export function WithTooltip({
  label,
  side = "top",
  children,
}: {
  label: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
