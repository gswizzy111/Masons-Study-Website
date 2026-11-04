"use client";

// Tiny synthesized sound effects (Web Audio, no files). Off unless the
// player turns sound on; create the player from a click so the browser
// allows audio.

export type SoundName = "hit" | "wrong" | "land" | "level" | "match" | "finish";

export type SoundPlayer = {
  play: (name: SoundName) => void;
  close: () => void;
};

type Note = { freq: number; to?: number; at: number; length: number; type: OscillatorType; gain: number };

const SOUNDS: Record<SoundName, Note[]> = {
  hit: [
    { freq: 520, to: 1040, at: 0, length: 0.09, type: "triangle", gain: 0.08 },
    { freq: 1560, at: 0.05, length: 0.08, type: "sine", gain: 0.04 },
  ],
  wrong: [{ freq: 220, to: 180, at: 0, length: 0.12, type: "square", gain: 0.025 }],
  land: [
    { freq: 140, to: 50, at: 0, length: 0.35, type: "sawtooth", gain: 0.06 },
    { freq: 90, to: 40, at: 0.02, length: 0.4, type: "sine", gain: 0.1 },
  ],
  level: [
    { freq: 523, at: 0, length: 0.12, type: "triangle", gain: 0.07 },
    { freq: 659, at: 0.1, length: 0.12, type: "triangle", gain: 0.07 },
    { freq: 784, at: 0.2, length: 0.2, type: "triangle", gain: 0.07 },
  ],
  match: [{ freq: 660, to: 880, at: 0, length: 0.1, type: "sine", gain: 0.07 }],
  finish: [
    { freq: 523, at: 0, length: 0.14, type: "sine", gain: 0.07 },
    { freq: 784, at: 0.12, length: 0.24, type: "sine", gain: 0.07 },
  ],
};

/** A sound player, or null when the browser has no Web Audio. */
export function createSoundPlayer(): SoundPlayer | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  return {
    play(name) {
      try {
        if (ctx.state === "suspended") void ctx.resume();
        const start = ctx.currentTime + 0.005;
        for (const note of SOUNDS[name]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t0 = start + note.at;
          const t1 = t0 + note.length;
          osc.type = note.type;
          osc.frequency.setValueAtTime(note.freq, t0);
          if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, t1);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, t1);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t1 + 0.02);
        }
      } catch {
        // Sound is a nicety; never let it break the game.
      }
    },
    close() {
      void ctx.close().catch(() => {});
    },
  };
}
