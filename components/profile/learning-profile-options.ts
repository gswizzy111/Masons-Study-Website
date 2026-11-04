// Choices for the learning profile questionnaire, and a normalizer that
// turns anything (a form post, a jsonb column) into a clean LearningProfile.
// Pure: used by Client Components and Server Actions.
import type { LearningProfile } from "@/lib/types";
import { NOTES_MAX } from "@/components/profile/form-state";

export type Level = NonNullable<LearningProfile["level"]>;
export type Goal = NonNullable<LearningProfile["goals"]>[number];
export type Approach = NonNullable<LearningProfile["approach"]>;
export type Depth = NonNullable<LearningProfile["depth"]>;
export type ExplainWith = NonNullable<LearningProfile["explain_with"]>[number];
export type Practice = NonNullable<LearningProfile["practice"]>[number];

export type ProfileOption<T extends string> = {
  value: T;
  label: string;
  /** One line under the label: what it means, or an example. */
  description?: string;
};

export const LEVEL_OPTIONS: ReadonlyArray<ProfileOption<Level>> = [
  { value: "undergrad", label: "Undergraduate", description: "Taking science courses now" },
  { value: "premed", label: "Premed undergraduate", description: "On the path to medical school" },
  { value: "med", label: "Medical student", description: "Already in medical school" },
  { value: "other", label: "Something else", description: "Grad school, a gap year, another path" },
];

export const GOAL_OPTIONS: ReadonlyArray<ProfileOption<Goal>> = [
  { value: "course_exams", label: "Course exams" },
  { value: "mcat", label: "The MCAT" },
  { value: "usmle", label: "USMLE boards" },
  { value: "understanding", label: "Deep understanding" },
];

export const APPROACH_OPTIONS: ReadonlyArray<ProfileOption<Approach>> = [
  {
    value: "big_picture_first",
    label: "Big picture first",
    description: "What it is and why it matters, then the details.",
  },
  {
    value: "details_first",
    label: "Details first",
    description: "Specific facts and examples, then how they fit together.",
  },
];

export const DEPTH_OPTIONS: ReadonlyArray<ProfileOption<Depth>> = [
  { value: "concise", label: "Concise", description: "Key points, no filler." },
  {
    value: "balanced",
    label: "Balanced",
    description: "The why behind each fact, focused on what’s tested.",
  },
  { value: "deep", label: "Deep", description: "Full mechanisms and how topics connect." },
];

export const EXPLAIN_OPTIONS: ReadonlyArray<ProfileOption<ExplainWith>> = [
  {
    value: "step_by_step",
    label: "Step by step",
    description: "Glycolysis as numbered steps: what goes in, what comes out.",
  },
  {
    value: "analogies",
    label: "Analogies",
    description: "ATP synthase as a water wheel turned by flowing protons.",
  },
  {
    value: "clinical",
    label: "Clinical connections",
    description: "Why ACE inhibitors lower blood pressure.",
  },
  {
    value: "tables",
    label: "Tables",
    description: "Mitosis and meiosis side by side, row by row.",
  },
  {
    value: "mnemonics",
    label: "Mnemonics",
    description: "PMAT for the phases of mitosis.",
  },
  {
    value: "examples",
    label: "Worked examples",
    description: "A Hardy-Weinberg problem solved with real numbers.",
  },
  {
    value: "visual_descriptions",
    label: "Diagrams in words",
    description: "A walk through the nephron, from glomerulus to collecting duct.",
  },
];

export const PRACTICE_OPTIONS: ReadonlyArray<ProfileOption<Practice>> = [
  {
    value: "recall",
    label: "Recall",
    description: "Which enzyme catalyzes the committed step of glycolysis?",
  },
  {
    value: "application",
    label: "Application",
    description: "Predict what happens to ATP output when complex IV is blocked.",
  },
  {
    value: "vignettes",
    label: "Vignettes",
    description: "A short patient case or experiment, then a question about it.",
  },
  {
    value: "compare_contrast",
    label: "Compare and contrast",
    description: "How do competitive and noncompetitive inhibitors change Km and Vmax?",
  },
];

function pickOne<T extends string>(value: unknown, options: ReadonlyArray<ProfileOption<T>>): T | undefined {
  return options.find((o) => o.value === value)?.value;
}

function pickMany<T extends string>(value: unknown, options: ReadonlyArray<ProfileOption<T>>): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  // Keep option order, drop unknown values and duplicates.
  const picked = options.filter((o) => value.includes(o.value)).map((o) => o.value);
  return picked.length ? picked : undefined;
}

/**
 * A clean LearningProfile from untrusted input: unknown keys and values are
 * dropped, lists are de-duplicated, notes are trimmed and capped. Empty
 * fields are left out.
 */
export function normalizeLearningProfile(raw: unknown): LearningProfile {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: LearningProfile = {};

  const level = pickOne(src.level, LEVEL_OPTIONS);
  if (level) out.level = level;
  const goals = pickMany(src.goals, GOAL_OPTIONS);
  if (goals) out.goals = goals;
  const approach = pickOne(src.approach, APPROACH_OPTIONS);
  if (approach) out.approach = approach;
  const depth = pickOne(src.depth, DEPTH_OPTIONS);
  if (depth) out.depth = depth;
  const explain = pickMany(src.explain_with, EXPLAIN_OPTIONS);
  if (explain) out.explain_with = explain;
  const practice = pickMany(src.practice, PRACTICE_OPTIONS);
  if (practice) out.practice = practice;
  if (typeof src.notes === "string") {
    const notes = src.notes.trim().slice(0, NOTES_MAX);
    if (notes) out.notes = notes;
  }
  return out;
}
