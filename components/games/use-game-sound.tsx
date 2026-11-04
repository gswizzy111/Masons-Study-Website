"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSoundPlayer, type SoundName, type SoundPlayer } from "@/components/games/sound";
import { cn } from "@/lib/utils";

/** Sound for a game: off by default, turned on by the player. */
export function useGameSound() {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  const playerRef = useRef<SoundPlayer | null>(null);

  useEffect(
    () => () => {
      playerRef.current?.close();
      playerRef.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    const next = !onRef.current;
    // Created from the click, so the browser lets it play.
    if (next && !playerRef.current) playerRef.current = createSoundPlayer();
    onRef.current = next;
    setOn(next);
  }, []);

  const play = useCallback((name: SoundName) => {
    if (onRef.current) playerRef.current?.play(name);
  }, []);

  return { on, toggle, play };
}

/** Icon button that turns game sound on and off. */
export function SoundToggle({
  on,
  onToggle,
  keepFocus = false,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  /** Leave focus where it is on click (e.g. in the answer box). */
  keepFocus?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={on}
      aria-label="Sound"
      title={on ? "Sound on" : "Sound off"}
      onMouseDown={keepFocus ? (e: MouseEvent) => e.preventDefault() : undefined}
      onClick={onToggle}
      className={cn("size-9", className)}
    >
      {on ? (
        <Volume2 strokeWidth={1.75} aria-hidden />
      ) : (
        <VolumeX strokeWidth={1.75} aria-hidden />
      )}
    </Button>
  );
}
