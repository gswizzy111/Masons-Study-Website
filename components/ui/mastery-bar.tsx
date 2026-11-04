import type { MasterySummary } from "@/lib/mastery";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "mastered", label: "Mastered", color: "bg-mastered" },
  { key: "learning", label: "Still learning", color: "bg-learning" },
  { key: "not_studied", label: "Not studied", color: "bg-not-studied" },
] as const;

type MasteryBarProps = {
  summary: MasterySummary;
  /** Show the legend under the bar. Default true. */
  showLegend?: boolean;
  /** Show counts in the legend. Default true. */
  showCounts?: boolean;
  size?: "sm" | "md" | "lg";
  /** Accessible name when the legend is hidden. Default "Mastery". */
  label?: string;
  className?: string;
};

const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } as const;

function describe(s: MasterySummary): string {
  if (s.total === 0) return "No cards yet";
  return `${s.mastered} of ${s.total} mastered, ${s.learning} still learning, ${s.not_studied} not studied`;
}

/**
 * Stacked bar of mastered / still learning / not studied, left to right, with
 * an optional legend. Colors are fixed: mastered = accent, still learning =
 * amber, not studied = gray.
 */
export function MasteryBar({
  summary,
  showLegend = true,
  showCounts = true,
  size = "md",
  label = "Mastery",
  className,
}: MasteryBarProps) {
  const total = summary.total;
  const parts = SEGMENTS.map((seg) => ({ ...seg, count: Math.max(0, summary[seg.key]) }));

  return (
    <div data-slot="mastery-bar" className={cn("flex flex-col gap-2.5", className)}>
      <div
        className={cn("flex w-full gap-[2px] overflow-hidden rounded-full bg-line/60", heights[size])}
        {...(showLegend
          ? { "aria-hidden": true }
          : { role: "img", "aria-label": `${label}: ${describe(summary)}` })}
      >
        {total > 0
          ? parts.map((p) =>
              p.count > 0 ? (
                <div
                  key={p.key}
                  className={cn("h-full min-w-1 first:rounded-l-full last:rounded-r-full", p.color)}
                  style={{ flexGrow: p.count, flexBasis: 0 }}
                />
              ) : null,
            )
          : null}
      </div>

      {showLegend ? (
        total > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            {parts.map((p) => (
              <li key={p.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-full", p.color)} />
                <span>
                  {p.label}
                  {showCounts ? (
                    <span className="ml-1 font-mono text-[0.8125rem] font-medium text-ink tabular-nums">
                      {p.count}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No cards yet</p>
        )
      ) : null}
    </div>
  );
}
