import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[background-color,color,border-color,box-shadow,translate,opacity] duration-150 ease-out",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-ink shadow-xs hover:bg-accent-hover",
        secondary:
          "bg-surface-2 text-ink hover:bg-[color-mix(in_oklab,var(--surface-2),var(--ink)_6%)]",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        outline:
          "border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-surface-2",
        danger: "bg-danger text-danger-ink shadow-xs hover:bg-[color-mix(in_oklab,var(--danger),var(--ink)_14%)]",
        link: "text-accent-strong underline-offset-4 decoration-1 hover:underline",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-sm",
        md: "h-10 rounded-md px-4 text-[0.9375rem]",
        lg: "h-12 rounded-md px-6 text-base",
        icon: "size-10 rounded-md [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    compoundVariants: [
      { variant: "link", class: "h-auto rounded-xs px-0 py-0.5" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next <Link>) with button styles. */
    asChild?: boolean;
    /** Shows a spinner, disables the button and sets aria-busy. */
    loading?: boolean;
  };

/**
 * Button. Variants: primary, secondary, ghost, outline, danger, link.
 * Sizes: sm, md, lg, icon (icon buttons need an aria-label).
 *
 *   <Button>Save</Button>
 *   <Button asChild variant="outline"><Link href="/sets/new">New set</Link></Button>
 *   <Button loading={pending}>Build set</Button>
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === "lg" ? "md" : "sm"} /> : null}
      {children}
    </button>
  );
}
