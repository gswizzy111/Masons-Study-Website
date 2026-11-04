"use client";

import type { ComponentProps, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal dialog (Radix). Centered card from 640px up, a bottom sheet on
 * phones.
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogTrigger asChild><Button>Rename</Button></DialogTrigger>
 *     <DialogContent title="Rename set" description="Shown on your dashboard.">
 *       ...
 *       <DialogFooter>
 *         <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
 *         <Button type="submit">Save</Button>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[rgb(10_12_14/0.45)] dark:bg-[rgb(0_0_0/0.6)]",
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    />
  );
}

const widths = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** Rendered as the dialog's accessible title. If you leave it out, render a <DialogTitle> yourself. */
  title?: ReactNode;
  /** Rendered as the accessible description. */
  description?: ReactNode;
  /** Hide the corner close button (Escape still closes). */
  hideClose?: boolean;
  size?: keyof typeof widths;
};

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose = false,
  size = "md",
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border border-line bg-surface text-ink shadow-lg outline-none",
          // Phones: bottom sheet.
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg border-b-0 pb-[env(safe-area-inset-bottom)]",
          "max-sm:data-[state=open]:animate-sheet-in max-sm:data-[state=closed]:animate-sheet-out",
          // 640px and up: centered card.
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:max-h-[min(85dvh,52rem)] sm:rounded-lg sm:border-b sm:pb-0",
          "sm:data-[state=open]:animate-dialog-in sm:data-[state=closed]:animate-dialog-out",
          widths[size],
          className,
        )}
        {...props}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5 sm:p-6">
          {title || description ? (
            <DialogHeader className={cn(!hideClose && "pr-10")}>
              {title ? <DialogTitle>{title}</DialogTitle> : null}
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
          ) : null}
          {children}
        </div>
        {!hideClose ? (
          <DialogPrimitive.Close
            className={cn(
              "absolute top-3.5 right-3.5 inline-flex size-9 items-center justify-center rounded-md text-ink-2",
              "transition-colors duration-150 hover:bg-surface-2 hover:text-ink",
            )}
            aria-label="Close"
          >
            <X className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("mb-5 flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-display text-xl font-semibold leading-snug tracking-[-0.012em] text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-relaxed text-ink-2", className)}
      {...props}
    />
  );
}

/** Action row. Stacks full width on phones (primary on top), right-aligned from 640px. */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
        "max-sm:[&>*]:w-full",
        className,
      )}
      {...props}
    />
  );
}
