import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "@/components/ui/input";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(controlClasses, "min-h-24 resize-y px-3 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}
