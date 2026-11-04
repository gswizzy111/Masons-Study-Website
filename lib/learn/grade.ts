// Grading typed answers. Pure, no I/O. Used by Learn, tests and games.
// Relative imports only (lib/learn is bundled outside Next too).
//
// gradeAnswer(given, expected):
// - ignores case, accents, punctuation, extra spaces and a leading
//   "a", "an" or "the"; Greek letters match their names (α = alpha,
//   Δ = delta); "&" = "and"; spacing and hyphens don't matter
//   ("beta-oxidation" = "β oxidation" = "betaoxidation").
// - accepts any alternative inside the expected answer: parts split by "/",
//   ";" or " or ", and the text with or without a parenthetical
//   ("ATP synthase (Complex V)" accepts "ATP synthase" and "Complex V").
//   Splitting applies to short, term-like answers (10 words or fewer); a
//   long definition is only matched whole (with or without its asides).
// - for expected answers longer than 4 characters, a Levenshtein
//   similarity of 0.85+ counts as correct (typos) and 0.7+ as "close".
//   Swapped neighboring letters count as one typo.
//   Answers of 4 characters or fewer ("ATP", "Na+") must match exactly.

export type GradeResult = {
  /** Counts as right. */
  correct: boolean;
  /** Not right, but nearly (a typo or a near miss). Never true when correct. */
  close: boolean;
  /** Best similarity found, 0-1 (1 = exact after normalizing). */
  similarity: number;
};

export const CORRECT_SIMILARITY = 0.85;
export const CLOSE_SIMILARITY = 0.7;
/** Expected answers this short (after normalizing) must match exactly. */
const EXACT_ONLY_MAX_LENGTH = 4;
/** Split into alternatives only when the expected answer is this short. */
const MAX_WORDS_FOR_ALTERNATIVES = 10;
/** Levenshtein is quadratic; compare at most this many characters. */
const MAX_COMPARE_LENGTH = 1500;

const GREEK: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  ζ: "zeta",
  η: "eta",
  θ: "theta",
  ι: "iota",
  κ: "kappa",
  λ: "lambda",
  μ: "mu",
  ν: "nu",
  ξ: "xi",
  ο: "omicron",
  π: "pi",
  ρ: "rho",
  σ: "sigma",
  ς: "sigma",
  τ: "tau",
  υ: "upsilon",
  φ: "phi",
  χ: "chi",
  ψ: "psi",
  ω: "omega",
};
const GREEK_RE = /[α-ω]/g;

/**
 * Normalized form for comparing: lowercase ASCII words separated by single
 * spaces, without a leading article. "The β-Oxidation!" -> "beta oxidation".
 */
export function normalizeAnswer(text: string | null | undefined): string {
  if (!text) return "";
  let s = String(text).normalize("NFKD");
  // Greek first: NFKD leaves Greek letters alone but splits off their
  // accents, which the next step removes.
  s = s.replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(GREEK_RE, (ch) => ` ${GREEK[ch] ?? ch} `);
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/^(?:the|an|a)\s+(?=\S)/, "");
  return s;
}

/** Normalized and without spaces, so spacing and hyphens never matter. */
function compact(normalized: string): string {
  return normalized.replace(/ /g, "");
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const BRACKETED_RE = /\(([^()]*)\)|\[([^[\]]*)\]/g;

/** Splits on "/" when it separates whole alternatives ("glucose/fructose"). */
function splitSlash(text: string): string[] {
  if (!text.includes("/")) return [text];
  if (/\s\/\s/.test(text)) return text.split(/\s+\/\s+/);
  const parts = text.split("/");
  // "Na+/K+ ATPase" is one name, not "Na+" or "K+ ATPase".
  if (parts.some((p) => /\s/.test(p.trim()))) return [text];
  return parts;
}

/**
 * Every answer the expected text accepts, including itself.
 * "ATP synthase (Complex V)" -> ["ATP synthase (Complex V)", "ATP synthase", "Complex V"].
 */
export function answerAlternatives(expected: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };

  const full = String(expected ?? "").trim();
  if (!full) return out;
  add(full);
  const splitAllowed = wordCount(full) <= MAX_WORDS_FOR_ALTERNATIVES;

  const visit = (text: string, depth: number) => {
    add(text);
    if (depth > 3) return;

    // With and without the bracketed parts, and (for short answers) the parts alone.
    const groups = [...text.matchAll(BRACKETED_RE)];
    if (groups.length > 0) {
      const base = text.replace(BRACKETED_RE, " ").replace(/\s+/g, " ").trim();
      if (base && base !== text) visit(base, depth + 1);
      if (splitAllowed) {
        for (const g of groups) {
          const inner = (g[1] ?? g[2] ?? "").trim();
          if (inner) visit(inner, depth + 1);
        }
      }
    }

    if (!splitAllowed) return;
    for (const splitter of [
      (s: string) => s.split(/\s*;\s*/),
      (s: string) => s.split(/\s+or\s+/i),
      splitSlash,
    ]) {
      const parts = splitter(text).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        for (const p of parts) visit(p, depth + 1);
      }
    }
  };

  visit(full, 0);
  return out;
}

/**
 * Edit distance: Levenshtein, plus a swap of two neighboring letters
 * counted as one edit ("mitochondira"), the optimal string alignment
 * variant. Three rows, O(min(a, b)) memory.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length < b.length) [a, b] = [b, a];
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j += 1) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      let d = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      curr[j] = d;
    }
    [prev2, prev, curr] = [prev, curr, prev2];
  }
  return prev[n];
}

/** 1 - distance / longer length. 1 for identical strings. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  // Upper bound from the length difference alone: skip hopeless pairs.
  const bound = Math.min(a.length, b.length) / longer;
  if (bound < CLOSE_SIMILARITY) return bound;
  const x = a.slice(0, MAX_COMPARE_LENGTH);
  const y = b.slice(0, MAX_COMPARE_LENGTH);
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Grades a typed answer against the expected one. */
export function gradeAnswer(given: string, expected: string): GradeResult {
  const g = compact(normalizeAnswer(given));
  if (!g) return { correct: false, close: false, similarity: 0 };

  let best = 0;
  for (const alt of answerAlternatives(expected)) {
    const e = compact(normalizeAnswer(alt));
    if (!e) continue;
    if (g === e) return { correct: true, close: false, similarity: 1 };
    if (e.length > EXACT_ONLY_MAX_LENGTH) {
      best = Math.max(best, similarity(g, e));
    }
  }

  const correct = best >= CORRECT_SIMILARITY;
  return {
    correct,
    close: !correct && best >= CLOSE_SIMILARITY,
    similarity: Math.round(best * 1000) / 1000,
  };
}
