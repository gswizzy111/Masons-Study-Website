import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  [
    "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2",
    "text-xs font-medium leading-none tracking-[0.005em]",
    "[&_svg]:size-3.5 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-ink-2",
        accent: "bg-accent-soft text-accent-strong",
        learning: "bg-learning-soft text-learning-strong",
        danger: "bg-danger-soft text-danger",
        outline: "border border-line bg-transparent text-ink-2",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

/** Small label. Variants: neutral, accent, learning, danger, outline. */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
