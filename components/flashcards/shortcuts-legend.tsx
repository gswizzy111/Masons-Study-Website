import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const SHORTCUTS: ReadonlyArray<{ keys: string[]; spoken: string; label: string }> = [
  { keys: ["Space"], spoken: "Space or Enter", label: "Flip" },
  { keys: ["←", "→"], spoken: "Left or right arrow", label: "Previous or next" },
  { keys: ["1"], spoken: "1", label: "Still learning" },
  { keys: ["2"], spoken: "2", label: "Got it" },
  { keys: ["S"], spoken: "S", label: "Star" },
];

/** Keyboard shortcuts for the deck (touch screens get the swipe tip instead). */
export function ShortcutsLegend({ className }: { className?: string }) {
  return (
    <div className={cn("text-sm text-ink-2", className)}>
      <h2 className="sr-only">Keyboard shortcuts</h2>
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pointer-coarse:hidden">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-flex items-center gap-1">
              {s.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
            <span className="sr-only">{s.spoken}: </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="hidden text-center pointer-coarse:block">
        Swipe left for still learning, right for got it, or use the buttons.
      </p>
    </div>
  );
}
