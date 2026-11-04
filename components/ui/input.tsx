import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shared look for text controls (input, textarea, select trigger). */
export const controlClasses = cn(
  "w-full min-w-0 rounded-md border border-line bg-surface text-ink shadow-xs",
  // 16px on phones so iOS does not zoom the page on focus.
  "text-base sm:text-[0.9375rem]",
  "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
  "placeholder:text-ink-placeholder",
  "hover:border-line-strong",
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/35",
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/35",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70",
);

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        "h-10 px-3",
        "file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className,
      )}
      {...props}
    />
  );
}
