"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { useChat } from "@/components/chat/chat-context";
import { cn } from "@/lib/utils";

/** Longest selection sent as-is; longer ones are cut with an ellipsis. */
const MAX_CHARS = 1500;
const EDGE = 12;

type Anchor = {
  text: string;
  x: number;
  y: number;
  placement: "above" | "below";
};

function headerHeight(): number {
  const px = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h"));
  return Number.isFinite(px) ? px : 64;
}

function clip(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS).replace(/\s+\S*$/, "")}...`;
}

/** The selected text and where to show the button, or null. */
function readSelection(root: HTMLElement | null, coarse: boolean): Anchor | null {
  if (!root) return null;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  // Only text from the guide itself, not from its buttons.
  const inGuideText = (node: Node) => {
    const el = node instanceof Element ? node : node.parentElement;
    return !!el?.closest("[data-guide-body], [data-guide-heading]");
  };
  if (!inGuideText(range.startContainer) && !inGuideText(range.endContainer)) return null;

  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const top = headerHeight() + 52;
  // Touch screens show their own menu above a selection, so go below it.
  const below = coarse || rect.top < top;
  const y = below ? rect.bottom + 10 : rect.top - 10;
  if (y < headerHeight() || y > window.innerHeight - EDGE) return null;

  const x = Math.min(Math.max(rect.left + rect.width / 2, 72), window.innerWidth - 72);
  return { text: clip(text), x, y, placement: below ? "below" : "above" };
}

/**
 * A small floating "Ask Claude" button over text selected in the guide.
 * Pressing it asks the tutor to explain the selection. Keyboard users get
 * the same thing from each section's "Ask Claude about this section".
 */
export function SelectionAsk({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const { ask } = useChat();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const pointerDown = useRef(false);
  // True while the button itself is being pressed: a tap can clear the
  // selection before the click lands, and the button must stay until then.
  const pressing = useRef(false);

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (pointerDown.current) return;
        const next = readSelection(containerRef.current, coarse);
        setAnchor((prev) => {
          if (!next) return null;
          if (prev && prev.text === next.text && prev.x === next.x && prev.y === next.y) return prev;
          return next;
        });
      });
    };

    const onSelectionChange = () => {
      if (pressing.current) return;
      clearTimeout(timer);
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        setAnchor(null);
        return;
      }
      // Wait for the selection to settle (dragging handles, shift+arrows).
      timer = setTimeout(update, coarse ? 250 : 120);
    };
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-selection-ask]")) {
        clearTimeout(releaseTimer);
        pressing.current = true;
        return;
      }
      pointerDown.current = true;
      setAnchor(null);
    };
    const onPointerUp = () => {
      if (pressing.current) {
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => {
          pressing.current = false;
        }, 500);
        return;
      }
      if (!pointerDown.current) return;
      pointerDown.current = false;
      update();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnchor(null);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(releaseTimer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [containerRef]);

  if (!anchor) return null;

  return createPortal(
    <div
      data-selection-ask
      data-print-hide
      className={cn(
        "fixed z-30 -translate-x-1/2",
        anchor.placement === "above" ? "-translate-y-full" : "",
      )}
      style={{ left: anchor.x, top: anchor.y }}
    >
      <button
        type="button"
        // Keep the selection: a mouse press on the button must not clear it.
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          pressing.current = false;
          ask(`Explain this from my study guide: "${anchor.text}"`);
          document.getSelection()?.removeAllRanges();
          setAnchor(null);
        }}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full bg-ink pr-3.5 pl-3 text-sm font-medium text-bg shadow-lg",
          "transition-[background-color,translate] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--ink),var(--bg)_14%)] active:translate-y-px",
          anchor.placement === "above" ? "origin-bottom" : "origin-top",
          "motion-safe:animate-pop-in",
        )}
      >
        <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
        Ask Claude
      </button>
    </div>,
    document.body,
  );
}
