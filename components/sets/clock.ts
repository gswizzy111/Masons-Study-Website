// Tiny shared clocks for text that changes with time ("Exam in 3 days",
// "2 minutes ago", a job's elapsed time). Read them with
// useSyncExternalStore so render stays pure and every subscriber shares one
// timer.

export type Clock = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
};

function createClock(intervalMs: number): Clock {
  let now = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  const tick = () => {
    now = Date.now();
    for (const listener of listeners) listener();
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      if (timer === undefined) {
        // React re-reads the snapshot after subscribing, so the first
        // subscriber sees this fresh time right away.
        now = Date.now();
        timer = setInterval(tick, intervalMs);
      }
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot() {
      if (now === 0) now = Date.now();
      return now;
    },
  };
}

/** Ticks once a second. For elapsed timers. */
export const secondClock = createClock(1_000);

/** Ticks once a minute. For relative dates and countdowns. */
export const minuteClock = createClock(60_000);

/** Server snapshot: no time on the server, callers fall back to server text. */
export function noTime(): null {
  return null;
}
