"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

/**
 * Password input with a show/hide button. Works as the single child of
 * `Field` (id, aria-describedby, aria-invalid and required reach the input).
 */
export function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label="Show password"
        aria-pressed={visible}
        aria-controls={props.id}
        className={cn(
          "absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-ink-3",
          "transition-colors duration-150 ease-out hover:text-ink",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {visible ? (
          <EyeOff className="size-[18px]" strokeWidth={1.75} aria-hidden />
        ) : (
          <Eye className="size-[18px]" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}
