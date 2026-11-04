// Seeded random numbers. Pure, no I/O. Relative imports only.
//
// Learn and the test pages shuffle while rendering their first state, which
// runs on the server and again in the browser. Starting both from the same
// seed (made on the server) gives the same order, so hydration matches.
import type { Rng } from "./engine";

/** mulberry32: small, fast, good enough for shuffling. */
export function seededRng(seed: number): Rng {
  let a = Math.floor(seed) >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh 32-bit seed. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
