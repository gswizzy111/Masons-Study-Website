// Turns the student's learning profile into prompt guidance for the system
// prompt. Relative imports only (bundled by the Netlify function too).
import type { LearningProfile } from "../types";

const LEVEL: Record<NonNullable<LearningProfile["level"]>, string> = {
  undergrad: "an undergraduate biology student",
  premed: "a premed undergraduate biology student",
  med: "a medical student",
  other: "a science student",
};

const GOALS: Record<NonNullable<LearningProfile["goals"]>[number], string> = {
  course_exams: "course exams",
  mcat: "the MCAT",
  usmle: "USMLE boards",
  understanding: "deep, lasting understanding",
};

const EXPLAIN: Record<NonNullable<LearningProfile["explain_with"]>[number], string> = {
  analogies: "analogies to everyday things",
  step_by_step: "step-by-step walkthroughs of mechanisms and processes",
  clinical: "clinical connections (how this shows up in patients and disease)",
  mnemonics: "mnemonics for lists and sequences",
  tables: "tables for compare-and-contrast",
  examples: "concrete worked examples",
  visual_descriptions: "clear verbal descriptions of diagrams and structures",
};

const PRACTICE: Record<NonNullable<LearningProfile["practice"]>[number], string> = {
  recall: "straight recall of facts and definitions",
  application: "application questions that use the idea in a new situation",
  vignettes: "short clinical or experimental vignettes",
  compare_contrast: "compare-and-contrast questions",
};

const DEPTH: Record<NonNullable<LearningProfile["depth"]>, string> = {
  concise:
    "Keep explanations concise: lead with the key point, cut filler, and expand only where a concept is commonly confused.",
  balanced:
    "Use balanced depth: explain the why behind each fact, but stay focused on what is likely to be tested.",
  deep: "Go deep: explain mechanisms fully, connect ideas across topics, and include the reasoning an expert would use.",
};

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function uniq<T>(items: readonly T[] | undefined): T[] {
  return Array.from(new Set(items ?? []));
}

/**
 * 4-10 lines of guidance about how this student learns. Empty fields get
 * sensible defaults: an undergrad biology student heading to medical school
 * who wants balanced depth.
 */
export function describeLearningProfile(p: LearningProfile | null | undefined): string {
  const profile: LearningProfile = p ?? {};
  const lines: string[] = [];

  const who = LEVEL[profile.level ?? "undergrad"] ?? LEVEL.undergrad;
  const headingToMed = profile.level !== "med" ? " who plans to start medical school soon" : "";
  lines.push(`The student is ${who}${headingToMed}.`);

  const goals = uniq(profile.goals)
    .map((g) => GOALS[g])
    .filter(Boolean);
  lines.push(
    goals.length
      ? `They are studying for ${list(goals)}.`
      : "They are studying for science course exams now, with the MCAT and medical school ahead.",
  );

  lines.push(
    profile.approach === "details_first"
      ? "They learn best by building up from specific details and examples to the big picture."
      : "They learn best with the big picture first (what this is and why it matters), then the details.",
  );

  lines.push(DEPTH[profile.depth ?? "balanced"] ?? DEPTH.balanced);

  const explain = uniq(profile.explain_with)
    .map((e) => EXPLAIN[e])
    .filter(Boolean);
  lines.push(
    explain.length
      ? `Explanations that work for them: ${list(explain)}.`
      : "Use clear step-by-step explanations, a concrete example where it helps, and tables when comparing things.",
  );

  const practice = uniq(profile.practice)
    .map((x) => PRACTICE[x])
    .filter(Boolean);
  lines.push(
    practice.length
      ? `Preferred practice: ${list(practice)}.`
      : "For practice, mix recall with application questions in the style of science exams.",
  );

  if (profile.goals?.includes("mcat") || profile.goals?.includes("usmle")) {
    lines.push("Point out high-yield facts and the ways standardized exams like to test them.");
  }

  const notes = profile.notes?.replace(/\s+/g, " ").trim();
  if (notes) {
    lines.push(`In their own words: "${notes.slice(0, 600)}"`);
  }

  return lines.join("\n");
}
