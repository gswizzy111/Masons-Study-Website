import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CardProps = ComponentProps<"div"> & {
  /** "raised" (default) sits on the page; "sunken" is a quiet inset panel. */
  variant?: "raised" | "flat" | "sunken";
  /** Hover feedback for cards that are links or buttons. */
  interactive?: boolean;
};

export function Card({ className, variant = "raised", interactive, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "relative flex flex-col rounded-lg text-ink",
        variant === "raised" && "border border-line bg-surface shadow-md",
        variant === "flat" && "border border-line bg-surface",
        variant === "sunken" && "border border-line/70 bg-surface-2",
        interactive &&
          "transition-[border-color,box-shadow,translate] duration-200 ease-out hover:border-line-strong hover:shadow-lg has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-5 pt-5 pb-4 sm:px-6 sm:pt-6", className)}
      {...props}
    />
  );
}

type HeadingTag = "h2" | "h3" | "h4" | "div";

export function CardTitle({
  className,
  as: Tag = "h3",
  ...props
}: ComponentProps<"h3"> & { as?: HeadingTag }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn(
        "font-display text-lg font-semibold leading-snug tracking-[-0.01em] text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-ink-2", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
