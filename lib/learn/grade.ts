// Grading typed answers. Pure, no I/O. Used by Learn, tests and games.
// Relative imports only (lib/learn is bundled outside Next too).
//
// gradeAnswer(given, expected, options):
// - ignores case, accents, punctuation, extra spaces and a leading "a",
//   "an" or "the"; Greek letters match their names (α = alpha, Δ = delta);
//   "&" = "and"; spacing and hyphens don't matter ("beta-oxidation" =
//   "β oxidation" = "betaoxidation"). A capital "A" that is a label is kept:
//   "A band", "A site", "A-DNA" never accept "band", "site", "DNA".
// - numbers keep their meaning: "7.4" is not "74", "-70 mV" is not "70 mV"
//   (a leading "+" is just positive), "1/4" is not "14", and Roman numerals
//   match digits ("Type II" = "type 2"). An ion charge may be left out ("Na"
//   for "Na+"), but a different one is wrong ("Cl+" for "Cl-").
// - accepts alternatives inside a short, term-like expected answer:
//   - "X or Y" when each side is one word ("glucose or fructose"), not
//     "Fight or flight response" or "All or none principle";
//   - "X/Y" when both sides are whole words ("glucose/fructose"), never a
//     fraction ("1/4"), a stage ("G2/M") or an ion pair ("Na+/K+-ATPase");
//   - parts split by ";";
//   - the text with or without a parenthetical, and the parenthetical alone
//     when it is a name ("ATP synthase (Complex V)" accepts "ATP synthase"
//     and "Complex V", but "Citrate (as a regulator)" never accepts
//     "as a regulator").
//   A definition (side "definition", or more than 10 words) is only matched
//   whole, with or without its bracketed asides.
// - forgives typos, token by token. Similarity 0.85+ counts as correct and
//   0.7+ as "close", but an edit never counts as a typo when it changes:
//   - a number, a Roman numeral, a label with a digit ("D3", "CD4"), an
//     abbreviation ("ATP", "cAMP"), a sign or charge, or "not"/"no";
//   - a word of 3 letters or fewer in a short answer;
//   - the start of a word (up to its first 4 letters: ab/ad, af/ef, de/re,
//     hypo/hyper) or a letter in its last 3 (-ose/-ase, -ite/-ate, -ol/-al;
//     only "i" for "y" is let through there).
//   Swapped neighboring letters count as one typo. Expected answers of 4
//   characters or fewer must match exactly.
// - options.others: the other cards' answers on the same side. A typed
//   answer that is exactly another card's answer, or fits another card at
//   least as well as this one, is wrong (and never "close").

export type GradeResult = {
  /** Counts as right. */
  correct: boolean;
  /** Not right, but nearly (a typo or a near miss). Never true when correct. */
  close: boolean;
  /** Best similarity found, 0-1 (1 = exact after normalizing). */
  similarity: number;
};

/** Which side of a card the answer is: a short term, or a whole definition. */
export type AnswerSide = "term" | "definition";

export type GradeOptions = {
  /** The other cards' answers on the same side (the card's own may be included). */
  others?: readonly string[];
  /** "definition" answers are matched whole. Default: decided by length. */
  side?: AnswerSide;
};

export const CORRECT_SIMILARITY = 0.85;
export const CLOSE_SIMILARITY = 0.7;
/** Expected answers this short (after normalizing) must match exactly. */
const EXACT_ONLY_MAX_LENGTH = 4;
/** Split into alternatives only when the expected answer is this short. */
const MAX_WORDS_FOR_ALTERNATIVES = 10;
/** Up to this many words, every word of 3 letters or fewer must be exact. */
const SHORT_ANSWER_WORDS = 6;
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
const GREEK_RE = /[α-ωΑ-Ω]/g;

/** Marks a token the normalizer made from a symbol ("-" -> minus). */
const MARK = "\uE000";
const ION_PLUS = "ionplus";
const ION_MINUS = "ionminus";
const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
};
const NEGATIONS = new Set(["not", "no", "non", "never", "without", "cannot", "nor", "neither", "none"]);

type Token = {
  /** Lowercase ASCII letters and digits. */
  text: string;
  /** No typo is ever forgiven inside this token. */
  strict: boolean;
};

/**
 * Turns symbols that carry meaning into words before punctuation is
 * dropped: signs, decimal points, fractions, ratios and ion charges.
 */
function spellSymbols(raw: string): string {
  let s = String(raw ?? "").normalize("NFKD");
  // Accents go; Greek letters stay (NFKD only splits off their accents).
  s = s.replace(/[\u0300-\u036f]/g, "");
  s = s.replace(GREEK_RE, (ch) => ` ${GREEK[ch.toLowerCase()] ?? ch} `);
  s = s.replace(/&/g, " and ");
  s = s.replace(/[\u2212\u2012]/g, "-");
  // "+/-" and "±".
  s = s.replace(/\+\s*\/\s*-|±/g, ` ${MARK}plusminus `);
  // Thousands separators: "1,000" = "1000".
  s = s.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  // Signs in front of a number: "-70" is minus 70; "+30" is just 30.
  s = s.replace(/(^|[\s([{=~<>≈,;:/])[-\u2013](?=\.?\d)/g, `$1 ${MARK}minus `);
  s = s.replace(/(^|[\s([{=~<>≈,;:/])\+(?=\.?\d)/g, "$1 ");
  // Decimal points: "7.4" is not "74"; ".5" = "0.5".
  s = s.replace(/(\d)\.(?=\d)/g, `$1 ${MARK}point `);
  s = s.replace(/(^|[^\w.\uE000])\.(?=\d)/g, `$1 0 ${MARK}point `);
  // Fractions and ratios: "1/4" is not "14", "3:1" is not "31".
  s = s.replace(/(\d)\s*[/\u2044\u2215]\s*(?=\d)/g, `$1 ${MARK}over `);
  s = s.replace(/(\d)\s*:\s*(?=\d)/g, `$1 ${MARK}to `);
  // Ion charges: "Na+", "Ca2+", "NH4+"; "Cl-", "HCO3-" (capitalized symbols only).
  s = s.replace(/([A-Za-z]\d?)\+(?=$|[\s/,;:.)\]-]|\+)/g, `$1 ${MARK}${ION_PLUS} `);
  s = s.replace(/\b([A-Z][A-Za-z]{0,4}\d?)-(?=$|[\s/,;:.)\]])/g, `$1 ${MARK}${ION_MINUS} `);
  return s;
}

/** Abbreviations and symbols keep their exact spelling: ATP, mRNA, cAMP, pH (not a word in capitals). */
function looksLikeAbbreviation(raw: string): boolean {
  if (raw.length < 2 || raw.length > 7) return false;
  return /[A-Z][^A-Z]*[A-Z]/.test(raw) || /[a-z][A-Z]/.test(raw);
}

/** Every token of the text, before any leading article is removed. */
function tokenize(text: string | null | undefined): Token[] {
  if (!text) return [];
  const out: Token[] = [];
  for (const raw of spellSymbols(text).split(/[^A-Za-z0-9\uE000]+/)) {
    if (!raw) continue;
    if (raw.startsWith(MARK)) {
      const word = raw.slice(MARK.length).toLowerCase();
      if (word) out.push({ text: word, strict: true });
      continue;
    }
    const lower = raw.replace(/\uE000/g, "").toLowerCase();
    if (!lower) continue;
    const roman = ROMAN[lower];
    if (roman) {
      out.push({ text: roman, strict: true });
      continue;
    }
    out.push({
      text: lower,
      strict: /\d/.test(lower) || NEGATIONS.has(lower) || looksLikeAbbreviation(raw),
    });
  }
  return out;
}

/**
 * A capital "A" that names something rather than being an article:
 * "A band", "A site", "A-DNA", "A and B antigens".
 */
function startsWithLabelA(text: string): boolean {
  return /^\s*A(?:-\S|\s+\S+\s*(?:[([].*)?$|\s*(?:,|\/|\band\b|\bor\b)\s*[B-Z]\b)/.test(text);
}

/** Drops one leading article ("a" too, unless `keepA`), when more follows. */
function dropArticle(tokens: Token[], keepA: boolean): Token[] {
  if (tokens.length < 2) return tokens;
  const first = tokens[0].text;
  if (first === "the" || first === "an" || (first === "a" && !keepA)) return tokens.slice(1);
  return tokens;
}

/** The answer's tokens as compared: article handled, short words exact in short answers. */
function expectedTokens(text: string, keepArticle = false): Token[] {
  const all = tokenize(text);
  const tokens = keepArticle ? all : dropArticle(all, startsWithLabelA(text));
  const short = tokens.length <= SHORT_ANSWER_WORDS;
  return tokens.map((t) => (short && t.text.length <= 3 && !t.strict ? { ...t, strict: true } : t));
}

/**
 * Normalized form for comparing: lowercase ASCII words separated by single
 * spaces, without a leading article (a label "A" is kept).
 * "The β-Oxidation!" -> "beta oxidation"; "-70 mV" -> "minus 70 mv";
 * "A band" -> "a band".
 */
export function normalizeAnswer(text: string | null | undefined): string {
  if (!text) return "";
  return dropArticle(tokenize(text), startsWithLabelA(String(text)))
    .map((t) => t.text)
    .join(" ");
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const BRACKETED_RE = /\(([^()]*)\)|\[([^[\]]*)\]/g;
const LETTER_RE = /[A-Za-z\u0370-\u03ff]/;

/** At least 3 letters or digits, at least one a letter, and no dangling sign. */
function isWholePart(part: string): boolean {
  const p = part.trim();
  return (p.match(/[A-Za-z0-9\u0370-\u03ff]/g)?.length ?? 0) >= 3 && LETTER_RE.test(p) && !/[+-]$/.test(p);
}

/** "glucose/fructose" -> both; "1/4", "G2/M", "Na+/K+-ATPase", "CD4/CD8" stay whole. */
function splitSlash(text: string): string[] {
  if (!text.includes("/")) return [text];
  if (/\s\/\s/.test(text)) {
    const parts = text.split(/\s+\/\s+/);
    return parts.every(isWholePart) ? parts : [text];
  }
  const parts = text.split("/");
  const word = /^[A-Za-z\u0370-\u03ff][A-Za-z\u0370-\u03ff'-]*[A-Za-z\u0370-\u03ff]$/;
  return parts.every((p) => word.test(p.trim()) && p.trim().length >= 3) ? parts : [text];
}

/** Words that make "X or Y" a set phrase ("all or none", "more or less"). */
const PHRASE_WORDS = new Set([
  "all",
  "none",
  "nothing",
  "more",
  "less",
  "sooner",
  "later",
  "either",
  "neither",
  "one",
  "both",
  "now",
  "never",
  "rest",
  "do",
  "die",
]);

/**
 * Only "X or Y" with one word on each side and nothing else: "glucose or
 * fructose". "Fight or flight response", "All or none principle" and
 * rhyming pairs ("fight or flight") stay whole.
 */
function splitOr(text: string): string[] {
  const m = /^\s*(\S+)\s+or\s+(\S+)\s*$/i.exec(text);
  if (!m) return [text];
  const [a, b] = [m[1], m[2]];
  if (!isWholePart(a) || !isWholePart(b)) return [text];
  const na = normalizeAnswer(a);
  const nb = normalizeAnswer(b);
  if (PHRASE_WORDS.has(na) || PHRASE_WORDS.has(nb)) return [text];
  if (similarity(na.replace(/ /g, ""), nb.replace(/ /g, "")) >= 0.75) return [text];
  return [a, b];
}

/** "AMP; adenosine monophosphate" -> both, when every part is a real answer. */
function splitSemicolon(text: string): string[] {
  const parts = text.split(/\s*;\s*/).filter((p) => p.trim());
  return parts.length > 1 && parts.every(isWholePart) ? parts : [text];
}

const ASIDE_START =
  /^(?:as|in|for|from|with|without|via|by|of|on|at|to|e\.?\s?g\.?|i\.?\s?e\.?|eg|ie|aka|also|see|or|and|the|a|an|not|only|mainly|mostly|usually|especially|often|sometimes|called|known)\b/i;

/** A parenthetical that names the thing ("Complex V", "PFK-1"), not an aside ("as a regulator"). */
function parentheticalIsName(inner: string): boolean {
  const t = inner.trim();
  if (!t || wordCount(t) > 4 || ASIDE_START.test(t)) return false;
  return /[A-Z0-9\u0370-\u03ff]/.test(t);
}

/**
 * Every answer the expected text accepts, including itself.
 * "ATP synthase (Complex V)" -> ["ATP synthase (Complex V)", "ATP synthase", "Complex V"].
 * A definition (side "definition") gives only itself and itself without its asides.
 */
export function answerAlternatives(expected: string, side?: AnswerSide): string[] {
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
  const splitAllowed = side !== "definition" && wordCount(full) <= MAX_WORDS_FOR_ALTERNATIVES;

  const visit = (text: string, depth: number) => {
    add(text);
    if (depth > 3) return;

    // With and without the bracketed parts, and (for short answers) a part that is a name.
    const groups = [...text.matchAll(BRACKETED_RE)];
    if (groups.length > 0) {
      const base = text.replace(BRACKETED_RE, " ").replace(/\s+/g, " ").trim();
      if (base && base !== text) visit(base, depth + 1);
      if (splitAllowed) {
        for (const g of groups) {
          const inner = (g[1] ?? g[2] ?? "").trim();
          if (parentheticalIsName(inner)) visit(inner, depth + 1);
        }
      }
    }

    if (!splitAllowed) return;
    for (const splitter of [splitSemicolon, splitOr, splitSlash]) {
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

// ---------------------------------------------------------------------------
// Token-aware typo tolerance
// ---------------------------------------------------------------------------

/** Tokens joined without spaces (a "_" keeps "2 3" apart from "23"), with each letter's place. */
type Compact = {
  s: string;
  /** Per character: no edit allowed here. */
  strict: boolean[];
  /** Per character: index of its token (-1 for a "_" between numbers). */
  tok: number[];
  /** Per character: position inside its token. */
  pos: number[];
  /** Per token: length, protected start, strict. */
  tokens: Array<{ len: number; prefix: number; strict: boolean }>;
};

const isDigitCode = (c: number) => c >= 48 && c <= 57;
/** "i" and "y", either way round. */
const isIY = (a: number, b: number) => (a === 105 && b === 121) || (a === 121 && b === 105);

/** Letters at the start of a word where an edit can flip its meaning (ab/ad, hypo/hyper). */
function protectedPrefix(len: number): number {
  if (len >= 7) return 4;
  return Math.max(0, len - 3);
}

function compactOf(tokens: readonly Token[]): Compact {
  let s = "";
  const strict: boolean[] = [];
  const tok: number[] = [];
  const pos: number[] = [];
  const meta: Compact["tokens"] = [];
  tokens.forEach((t, ti) => {
    if (s && isDigitCode(s.charCodeAt(s.length - 1)) && isDigitCode(t.text.charCodeAt(0))) {
      s += "_";
      strict.push(true);
      tok.push(-1);
      pos.push(0);
    }
    meta.push({ len: t.text.length, prefix: t.strict ? t.text.length : protectedPrefix(t.text.length), strict: t.strict });
    for (let k = 0; k < t.text.length; k += 1) {
      s += t.text[k];
      strict.push(t.strict);
      tok.push(ti);
      pos.push(k);
    }
  });
  return { s, strict, tok, pos, tokens: meta };
}

function negations(tokens: readonly Token[]): number {
  return tokens.reduce((n, t) => n + (NEGATIONS.has(t.text) ? 1 : 0), 0);
}

/**
 * Similarity where only harmless edits count as typos: an edit the rules
 * above forbid makes the pair score 0. Rows walk the given text, columns
 * the expected one.
 */
function typoSimilarity(g: Compact, e: Compact): number {
  const m = Math.min(g.s.length, MAX_COMPARE_LENGTH);
  const n = Math.min(e.s.length, MAX_COMPARE_LENGTH);
  const longer = Math.max(m, n);
  if (longer === 0) return 1;
  if (Math.min(m, n) / longer < CORRECT_SIMILARITY) return 0;

  const gs = g.s;
  const es = e.s;
  const BAN = Number.POSITIVE_INFINITY;

  const subCost = (j: number, gc: number): number => {
    if (e.strict[j] || isDigitCode(gc)) return BAN;
    const t = e.tokens[e.tok[j]];
    const p = e.pos[j];
    if (p < t.prefix) return BAN;
    // The ending decides the word (-ose/-ase, -ite/-ate, -ol/-al), but "i"
    // for "y" there is only a misspelling ("glycolysys").
    if (t.len >= 5 && p >= t.len - 3 && !isIY(gc, es.charCodeAt(j))) return BAN;
    return 1;
  };
  const delCost = (j: number): number => {
    if (e.strict[j]) return BAN;
    return e.pos[j] < e.tokens[e.tok[j]].prefix ? BAN : 1;
  };
  // An extra letter typed before e[j] (j === n: after the last one).
  const insCost = (j: number, gc: number): number => {
    if (isDigitCode(gc) || gc === 95 /* _ */) return BAN;
    const left = j > 0 ? e.tok[j - 1] : -2;
    const right = j < n ? e.tok[j] : -2;
    if (left >= 0 && left === right) {
      const t = e.tokens[left];
      return t.strict || e.pos[j] < t.prefix ? BAN : 1;
    }
    // Between two words: the end of the left one, or the start of the right one.
    if (left >= 0 && !e.tokens[left].strict) return 1;
    if (right >= 0 && !e.tokens[right].strict && e.tokens[right].prefix === 0) return 1;
    return BAN;
  };
  const swapCost = (j: number): number => (e.strict[j] || e.strict[j + 1] ? BAN : 1);

  let prev2 = new Float64Array(n + 1);
  let prev = new Float64Array(n + 1);
  let curr = new Float64Array(n + 1);
  prev[0] = 0;
  for (let j = 1; j <= n; j += 1) prev[j] = prev[j - 1] + delCost(j - 1);
  for (let i = 1; i <= m; i += 1) {
    const gc = gs.charCodeAt(i - 1);
    curr[0] = prev[0] + insCost(0, gc);
    for (let j = 1; j <= n; j += 1) {
      const ec = es.charCodeAt(j - 1);
      let d = prev[j - 1] + (gc === ec ? 0 : subCost(j - 1, gc));
      d = Math.min(d, curr[j - 1] + delCost(j - 1), prev[j] + insCost(j, gc));
      if (i > 1 && j > 1 && gc === es.charCodeAt(j - 2) && gs.charCodeAt(i - 2) === ec && gc !== ec) {
        d = Math.min(d, prev2[j - 2] + swapCost(j - 2));
      }
      curr[j] = d;
    }
    [prev2, prev, curr] = [prev, curr, prev2];
  }
  const cost = prev[n];
  return Number.isFinite(cost) ? Math.max(0, 1 - cost / longer) : 0;
}

/** One expected alternative, ready to compare with a typed answer. */
type Comparison = {
  /** Compact strings, equal when the answer is exactly right. */
  given: Compact;
  expected: Compact;
  /** Typo tolerance applies (long enough, same negations). */
  typosAllowed: boolean;
};

/**
 * `keepArticles`: compare with any leading article left on both sides, so a
 * typo in the article itself ("teh enzyme that...") is just a typo.
 */
function compare(givenRaw: readonly Token[], alt: string, keepArticles = false): Comparison | null {
  let expected = expectedTokens(alt, keepArticles);
  if (expected.length === 0) return null;
  // A label "A" must be typed; any other leading article is optional.
  const given = keepArticles ? [...givenRaw] : dropArticle([...givenRaw], startsWithLabelA(alt));
  const givenHasCharge = given.some((t) => t.text === ION_PLUS || t.text === ION_MINUS);
  if (!givenHasCharge) {
    const bare = expected.filter((t) => t.text !== ION_PLUS && t.text !== ION_MINUS);
    if (bare.length > 0) expected = bare;
  }
  const e = compactOf(expected);
  if (!e.s) return null;
  return {
    given: compactOf(given),
    expected: e,
    typosAllowed: e.s.length > EXACT_ONLY_MAX_LENGTH && negations(given) === negations(expected),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Grades a typed answer against the expected one. */
export function gradeAnswer(given: string, expected: string, options: GradeOptions = {}): GradeResult {
  const givenTokens = tokenize(given);
  if (givenTokens.length === 0) return { correct: false, close: false, similarity: 0 };

  const ownKeys = new Set<string>();
  let best = 0; // plain similarity, for "close"
  let bestTypo = 0; // similarity counting only harmless typos, for "correct"
  for (const alt of answerAlternatives(expected, options.side)) {
    const c = compare(givenTokens, alt);
    if (!c) continue;
    ownKeys.add(c.expected.s);
    if (c.given.s === c.expected.s) return { correct: true, close: false, similarity: 1 };
    best = Math.max(best, similarity(c.given.s, c.expected.s));
    if (c.typosAllowed) bestTypo = Math.max(bestTypo, typoSimilarity(c.given, c.expected));
    // "teh enzyme" for "The enzyme": the article is part of the typed text too.
    const withArticles = c.typosAllowed && bestTypo < CORRECT_SIMILARITY ? compare(givenTokens, alt, true) : null;
    if (withArticles?.typosAllowed) bestTypo = Math.max(bestTypo, typoSimilarity(withArticles.given, withArticles.expected));
  }

  const correct = bestTypo >= CORRECT_SIMILARITY;
  let close = !correct && best >= CLOSE_SIMILARITY;

  // Another card's answer: exactly it, or at least as near as this card's, is a mix-up, not a typo.
  if ((correct || close) && options.others?.length) {
    for (const other of options.others) {
      for (const alt of answerAlternatives(other, options.side)) {
        const c = compare(givenTokens, alt);
        if (!c || ownKeys.has(c.expected.s)) continue;
        if (c.given.s === c.expected.s) {
          return { correct: false, close: false, similarity: round3(best) };
        }
        if (correct && c.typosAllowed && typoSimilarity(c.given, c.expected) >= bestTypo) {
          return { correct: false, close: false, similarity: round3(best) };
        }
        if (close && similarity(c.given.s, c.expected.s) > best) close = false;
      }
    }
  }

  return { correct, close, similarity: round3(correct ? bestTypo : best) };
}
