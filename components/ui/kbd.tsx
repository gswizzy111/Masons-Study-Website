import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A keyboard key, e.g. <Kbd>Space</Kbd>. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line border-b-2 bg-surface px-1.5",
        "font-mono text-[0.6875rem] font-medium leading-none text-ink-2",
        className,
      )}
      {...props}
    />
  );
}
