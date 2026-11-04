"use client";

import type { ComponentProps } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClasses } from "@/components/ui/input";

/**
 * Select (Radix), styled like the text inputs.
 *
 *   <Select value={v} onValueChange={setV}>
 *     <SelectTrigger id="course" aria-label="Course"><SelectValue placeholder="No course" /></SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="bio-201">BIO 201</SelectItem>
 *     </SelectContent>
 *   </Select>
 *
 * Inside <Field>, use the function child so the label points at the trigger:
 *   <Field label="Course">{(p) => <SelectTrigger {...p}><SelectValue /></SelectTrigger>}</Field>
 * (with the <Select> root wrapping the Field).
 */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        controlClasses,
        "flex h-10 items-center justify-between gap-2 px-3 text-left",
        "data-[placeholder]:text-ink-placeholder [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "relative z-50 overflow-hidden rounded-md border border-line bg-surface text-ink shadow-lg",
          "max-h-(--radix-select-content-available-height) min-w-32",
          "origin-(--radix-select-content-transform-origin)",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          position === "popper" && "w-full min-w-(--radix-select-trigger-width)",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center text-ink-2">
          <ChevronUp className="size-4" aria-hidden />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center text-ink-2">
          <ChevronDown className="size-4" aria-hidden />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-9 w-full cursor-default select-none items-center rounded-sm py-1.5 pr-8 pl-2.5 text-sm text-ink outline-none",
        "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2.5 inline-flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-accent" strokeWidth={2} aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2.5 py-1.5 text-xs font-medium text-ink-2", className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  );
}
