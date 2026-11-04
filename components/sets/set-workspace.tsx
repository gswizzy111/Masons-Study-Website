"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Sparkles } from "lucide-react";
import { useChat } from "@/components/chat/chat-context";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const XL_QUERY = "(min-width: 1280px)";

/**
 * Tabs whose main controls sit near the bottom of a phone screen (card
 * buttons, answer choices, the Meteor answer bar). On phones the floating
 * button would cover them, so it hides there; the header button still opens
 * the tutor.
 */
const BOTTOM_CONTROLS = /\/sets\/[^/]+\/(flashcards|learn|test|games)(\/|$)/;

function subscribeXl(onChange: () => void): () => void {
  const mql = window.matchMedia(XL_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True at 1280px and wider. False on the server and during hydration. */
function useIsXl(): boolean {
  return useSyncExternalStore(
    subscribeXl,
    () => window.matchMedia(XL_QUERY).matches,
    () => false,
  );
}

/**
 * The set's working area with the "Ask Claude" tutor. On wide screens
 * (1280px+) the open panel docks as a sticky right column under the site
 * header; below that it slides in as a sheet over the page (full width on
 * phones) with a backdrop, and Escape or the backdrop closes it. A floating
 * "Ask Claude" button shows while the panel is closed.
 *
 * Only one ChatPanel is mounted at a time.
 */
export function SetWorkspace({
  setId,
  setTitle,
  children,
}: {
  setId: string;
  setTitle: string;
  children: ReactNode;
}) {
  const chat = useChat();
  const isXl = useIsXl();
  const pathname = usePathname();
  const hideFloatingOnPhones = BOTTOM_CONTROLS.test(pathname ?? "");
  const docked = chat.isOpen && isXl;
  const sheet = chat.isOpen && !isXl;

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col pb-20">{children}</div>

      {docked ? (
        <div
          data-print-hide
          className={cn(
            "sticky top-[var(--header-h)] h-[calc(100dvh-var(--header-h))] w-[420px] shrink-0 self-start",
            "border-l border-line bg-surface motion-safe:animate-fade-in",
          )}
        >
          <ChatPanel setId={setId} setTitle={setTitle} className="h-full" />
        </div>
      ) : null}

      <DialogPrimitive.Root
        open={sheet}
        onOpenChange={(open) => {
          if (!open) chat.close();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-print-hide
            className={cn(
              "fixed inset-0 z-50 bg-[rgb(10_12_14/0.45)] dark:bg-[rgb(0_0_0/0.6)]",
              "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
            )}
          />
          <DialogPrimitive.Content
            data-print-hide
            aria-describedby={undefined}
            // Focus the sheet itself, not its first button: on touch screens
            // the panel leaves the text box alone (no keyboard pop-up), and
            // Radix would otherwise focus "Clear chat" and show its tooltip.
            onOpenAutoFocus={(event) => {
              const content = event.currentTarget;
              if (content instanceof HTMLElement && content.contains(document.activeElement)) return;
              event.preventDefault();
              if (content instanceof HTMLElement) content.focus({ preventScroll: true });
            }}
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-lg outline-none",
              "sm:max-w-[420px] sm:border-l sm:border-line",
              "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
              "data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Ask Claude about {setTitle}</DialogPrimitive.Title>
            <ChatPanel setId={setId} setTitle={setTitle} className="h-full min-h-0 flex-1" />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {!chat.isOpen ? (
        <button
          type="button"
          onClick={chat.open}
          data-print-hide
          className={cn(
            "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 sm:right-6 sm:bottom-6",
            hideFloatingOnPhones && "max-sm:hidden",
            "inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-surface pr-5 pl-4 text-[0.9375rem] font-medium text-ink shadow-lg",
            "transition-[translate,background-color] duration-150 ease-out hover:bg-surface-2 active:translate-y-px",
            "motion-safe:animate-pop-in",
          )}
        >
          <Sparkles className="size-[18px] text-accent-strong" strokeWidth={1.75} aria-hidden />
          Ask Claude
        </button>
      ) : null}
    </div>
  );
}

/** Header button that opens or closes the tutor panel. */
export function AskClaudeButton({ className }: { className?: string }) {
  const chat = useChat();
  return (
    <Button
      type="button"
      variant={chat.isOpen ? "secondary" : "outline"}
      onClick={chat.toggle}
      aria-expanded={chat.isOpen}
      className={className}
    >
      <Sparkles strokeWidth={1.75} aria-hidden />
      {chat.isOpen ? "Hide Claude" : "Ask Claude"}
    </Button>
  );
}
