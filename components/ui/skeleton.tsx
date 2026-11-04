import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Placeholder block shaped like the content it stands in for. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn("rounded-md bg-surface-2 motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
