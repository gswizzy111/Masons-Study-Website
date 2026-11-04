"use client";

import { useEffect, useState } from "react";

const SEP = "\u0000";

function headerHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--header-h");
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 64;
}

/**
 * The id of the section being read: the last section whose top has passed a
 * line a little below the sticky header. At the very bottom of the page the
 * last section wins, so a short final section still lights up.
 */
export function useScrollSpy(ids: readonly string[]): string | null {
  const key = ids.join(SEP);
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const list = key ? key.split(SEP) : [];
    if (list.length === 0) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const line = headerHeight() + Math.min(140, window.innerHeight * 0.22);
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = id;
        else break;
      }
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight > window.innerHeight + 4;
      if (scrollable && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        current = list[list.length - 1];
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key]);

  if (active !== null && ids.includes(active)) return active;
  return ids[0] ?? null;
}
