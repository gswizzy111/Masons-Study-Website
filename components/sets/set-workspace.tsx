"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Sparkles } from "lucide-react";
import { useChat } from "@/components/chat/chat-context";
import { ChatPanel, type ChatGrounding } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const XL_QUERY = "(min-width: 1280px)";

/**
 * Study tabs: their main controls (card buttons, answer choices, the Meteor
 * answer bar) need the whole screen, so the set header is compact there and
 * the floating button never shows (the header button opens the tutor).
 */
export const STUDY_ROUTE = /\/sets\/[^/]+\/(flashcards|learn|test|games)(\/|$)/;

/** The Cards tab: every row ends in action buttons the floating button would cover. */
const CARDS_ROUTE = /\/sets\/[^/]+\/cards(\/|$)/;

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

/** Lets the header's Ask Claude button hand its element to the workspace. */
const HeaderButtonContext = createContext<((el: HTMLButtonElement | null) => void) | null>(null);

/** Focusable right now: still in the page, shown, and not disabled. */
function canFocus(el: HTMLElement | null | undefined): boolean {
  return Boolean(
    el &&
      el.isConnected &&
      el.getClientRects().length > 0 &&
      !el.hasAttribute("disabled") &&
      !el.closest("[inert]"),
  );
}

/**
 * The set's working area with the "Ask Claude" tutor. On wide screens
 * (1280px+) the open panel docks as a sticky right column under the site
 * header (Escape inside it closes it); below that it slides in as a sheet
 * over the page (full width on phones) with a backdrop, and Escape or the
 * backdrop closes it. Closing either one puts focus back on the button that
 * opened it, or on the header's Ask Claude button.
 *
 * A floating "Ask Claude" button shows on tablets and desktops once the
 * header button has scrolled out of view, except on the study tabs and the
 * Cards tab. Phones never get it: the header button is right under the
 * title, and the floating one would cover buttons and text.
 *
 * Only one ChatPanel is mounted at a time.
 */
export function SetWorkspace({
  setId,
  setTitle,
  aiReady = true,
  grounding,
  children,
}: {
  setId: string;
  setTitle: string;
  /** Claude is configured on this site (aiConfigured()). */
  aiReady?: boolean;
  /** What the tutor can draw on, for its empty-state wording. */
  grounding?: ChatGrounding;
  children: ReactNode;
}) {
  const chat = useChat();
  const { takeOpener } = chat;
  const isXl = useIsXl();
  const pathname = usePathname() ?? "";
  const docked = chat.isOpen && isXl;
  const sheet = chat.isOpen && !isXl;

  const [headerButton, setHeaderButton] = useState<HTMLButtonElement | null>(null);
  const floatingRef = useRef<HTMLButtonElement | null>(null);
  const [headerInView, setHeaderInView] = useState(true);
  const floatingAllowed = !STUDY_ROUTE.test(pathname) && !CARDS_ROUTE.test(pathname);
  const showFloating = !chat.isOpen && floatingAllowed && !headerInView;

  // Show the floating button only once the header button is out of view
  // (under the sticky site header counts as out of view).
  useEffect(() => {
    if (!headerButton || typeof IntersectionObserver === "undefined") return;
    const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 64;
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderInView(entry?.isIntersecting ?? true),
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    );
    observer.observe(headerButton);
    return () => observer.disconnect();
  }, [headerButton]);

  /**
   * Focus goes back where the student was: the button that opened the
   * tutor, the floating button when that opened it (it re-renders after the
   * panel closes), or else the header button. The header button never
   * scrolls the page back to the top: the student may have read on while
   * the panel was open.
   */
  const restoreFocus = useCallback(() => {
    const opener = takeOpener();
    const floating = floatingRef.current;
    if (opener && canFocus(opener)) {
      opener.focus({ preventScroll: opener.dataset.askClaude === "header" });
    } else if (opener?.dataset.askClaude === "floating" && floating && canFocus(floating)) {
      floating.focus();
    } else if (headerButton && canFocus(headerButton)) {
      headerButton.focus({ preventScroll: true });
    }
  }, [takeOpener, headerButton]);

  // The docked panel unmounts on close and takes focus with it. (The sheet
  // restores focus in onCloseAutoFocus, after its exit animation.)
  const isOpenRef = useRef(chat.isOpen);
  const wasDockedRef = useRef(docked);
  useEffect(() => {
    const wasOpen = isOpenRef.current;
    const wasDocked = wasDockedRef.current;
    isOpenRef.current = chat.isOpen;
    wasDockedRef.current = docked;
    if (!wasOpen || chat.isOpen || !wasDocked) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      restoreFocus();
    } else {
      // Closed with the header toggle, which keeps focus: forget the opener.
      takeOpener();
    }
  }, [chat.isOpen, docked, restoreFocus, takeOpener]);

  function onDockedKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
    // Escape inside a dialog or menu opened from the panel (Clear chat) is
    // theirs to handle; it bubbles here through the React tree.
    const target = event.target;
    if (target instanceof Element && target.closest("[role=dialog], [role=alertdialog], [role=menu]")) return;
    if (!event.currentTarget.contains(target as Node)) return;
    event.preventDefault();
    chat.close();
  }

  const panelProps = { setId, setTitle, aiReady, grounding };

  return (
    <HeaderButtonContext.Provider value={setHeaderButton}>
      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col pb-20">{children}</div>

        {docked ? (
          <div
            data-print-hide
            onKeyDown={onDockedKeyDown}
            className={cn(
              "sticky top-[var(--header-h)] h-[calc(100dvh-var(--header-h))] w-[420px] shrink-0 self-start",
              "border-l border-line bg-surface motion-safe:animate-fade-in",
            )}
          >
            <ChatPanel {...panelProps} className="h-full" />
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
              // The sheet has no Radix trigger to return to, so put focus back
              // ourselves. If it closed because the window grew wide enough to
              // dock the panel, the panel is still open: leave focus to it.
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!isOpenRef.current) restoreFocus();
              }}
              className={cn(
                "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-lg outline-none",
                "sm:max-w-[420px] sm:border-l sm:border-line",
                "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
                "data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out",
              )}
            >
              <DialogPrimitive.Title className="sr-only">Ask Claude about {setTitle}</DialogPrimitive.Title>
              <ChatPanel {...panelProps} className="h-full min-h-0 flex-1" />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {showFloating ? (
          <div
            data-print-hide
            className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 max-sm:hidden sm:right-6 sm:bottom-6"
          >
            <WithTooltip label="Ask Claude" side="left">
              <button
                ref={floatingRef}
                type="button"
                onClick={chat.open}
                data-ask-claude="floating"
                aria-label="Ask Claude"
                className={cn(
                  "inline-flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface text-accent-strong shadow-lg",
                  "transition-[translate,background-color] duration-150 ease-out hover:bg-surface-2 active:translate-y-px",
                  "motion-safe:animate-pop-in",
                )}
              >
                <Sparkles className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
            </WithTooltip>
          </div>
        ) : null}
      </div>
    </HeaderButtonContext.Provider>
  );
}

/**
 * Header button that opens or closes the tutor panel. `compact` (the study
 * tabs) shows only the icon on phones; the accessible name stays.
 */
export function AskClaudeButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const chat = useChat();
  const register = useContext(HeaderButtonContext);
  const label = chat.isOpen ? "Hide Claude" : "Ask Claude";
  return (
    <Button
      ref={register ?? undefined}
      type="button"
      variant={chat.isOpen ? "secondary" : "outline"}
      onClick={chat.toggle}
      aria-expanded={chat.isOpen}
      data-ask-claude="header"
      className={cn(compact && "max-sm:size-10 max-sm:px-0", className)}
    >
      <Sparkles strokeWidth={1.75} aria-hidden />
      <span className={cn(compact && "max-sm:sr-only")}>{label}</span>
    </Button>
  );
}
