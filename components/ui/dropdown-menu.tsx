"use client";

import type { ComponentProps } from "react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { Check, ChevronRight, Dot } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuPortal = MenuPrimitive.Portal;
export const DropdownMenuSub = MenuPrimitive.Sub;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const panel = cn(
  "z-50 min-w-48 overflow-hidden rounded-md border border-line bg-surface p-1 text-ink shadow-lg",
  "max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto",
  "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
);

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(panel, "origin-(--radix-dropdown-menu-content-transform-origin)", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

const item = cn(
  "relative flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-ink outline-none",
  "transition-colors duration-100",
  "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-ink-2",
);

export function DropdownMenuItem({
  className,
  variant = "default",
  inset,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { variant?: "default" | "danger"; inset?: boolean }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        item,
        inset && "pl-8",
        variant === "danger" &&
          "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(item, "pl-8", className)}
      {...props}
    >
      <span className="absolute left-2.5 inline-flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Check className="size-4 text-accent" strokeWidth={2} aria-hidden />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(item, "pl-8", className)}
      {...props}
    >
      <span className="absolute left-2 inline-flex size-5 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Dot className="size-5 text-accent" strokeWidth={6} aria-hidden />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <MenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("px-2.5 py-2 text-xs font-medium text-ink-2", inset && "pl-8", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  );
}

export function DropdownMenuShortcut({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto font-mono text-[0.6875rem] tracking-wide text-ink-3", className)}
      {...props}
    />
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubTrigger>) {
  return (
    <MenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(item, "data-[state=open]:bg-surface-2", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" aria-hidden />
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        className={cn(panel, "origin-(--radix-dropdown-menu-content-transform-origin)", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}
