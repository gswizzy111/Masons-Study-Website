import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  error: {
    box: "border-danger/30 bg-danger-soft text-danger",
    icon: CircleAlert,
  },
  success: {
    box: "border-accent/25 bg-accent-soft text-accent-strong",
    icon: CircleCheck,
  },
  info: {
    box: "border-line bg-surface-2 text-ink-2",
    icon: Info,
  },
} as const;

/**
 * A form-level message. Errors use role="alert" so they are read out as
 * soon as they appear; other tones are polite status messages.
 */
export function FormAlert({
  tone = "error",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm leading-snug",
        t.box,
        className,
      )}
    >
      <Icon className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && "text-ink-2")}>{children}</div> : null}
      </div>
    </div>
  );
}
