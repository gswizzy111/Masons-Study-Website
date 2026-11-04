// Prompts for the study-set pipeline: transcription, outline, guide sections
// with flashcards, and exam-style questions.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
//
// Caching: every call in one job sends the same `system` blocks (instructions
// + learning profile, then the material with cache_control), so only the
// short task in the user turn changes between calls.
import type { Topic } from "../types";

// ---------------------------------------------------------------------------
// Shared writing rules
// ---------------------------------------------------------------------------

const PLAIN_TEXT_RULES = `Text rules (the app renders GitHub-flavored Markdown, without math or raw HTML):
- Never use LaTeX or dollar-sign math. Write formulas in plain text with Unicode: ΔG°′, Km, Vmax, NAD⁺, CO₂, Ca²⁺, H₂O, →, ⇌, ≈, ≥.
- Never use em dashes. Use commas, colons, parentheses, or separate sentences.
- No emoji. No HTML tags.`;

// ---------------------------------------------------------------------------
// Transcription (photos of notes, scanned PDFs)
// ---------------------------------------------------------------------------

/** What the transcriber answers when there is nothing to read. */
export const NO_TEXT_SENTINEL = "NO_TEXT";

export const TRANSCRIBE_SYSTEM_PROMPT = `You transcribe a student's study material (photos of handwritten or printed notes, whiteboards, textbook pages, lecture slides, scanned handouts) into clean Markdown text, so it can be studied and searched. The subject is usually biology, biochemistry, chemistry, physiology or another premed science.

Rules:
- Transcribe faithfully and completely, in reading order. Keep the author's wording, abbreviations, numbers, units and emphasis. Do not summarize, explain, correct, or add anything.
- Keep the structure: headings as Markdown headings, bullet and numbered lists as lists, tables as Markdown tables, arrows and pathway steps as written (A → B → C).
- Chemistry and math in plain text with Unicode (CO₂, NAD⁺, Ca²⁺, ΔG, ⇌). No LaTeX.
- For each diagram, figure, graph, structure or drawing, add a short description on its own line in square brackets, like [Figure: Lineweaver-Burk plot; competitive inhibitor line has the same y-intercept and a steeper slope]. Name the labels, arrows and what the figure shows. Keep it to one to three sentences.
- Mark a word you can't read as [illegible]. Mark a guess as [unclear: best guess].
- For a multi-page document, start each page with "Page N:" on its own line.
- Skip page decorations that carry no content (logos, slide numbers, repeated headers and footers).
- Output only the transcription. No preamble or closing remarks.
- If there is no readable study content at all, reply with exactly ${NO_TEXT_SENTINEL}.`;

/** The user-turn instruction that goes with the image or PDF. */
export function transcribeInstruction(kind: "image" | "pdf", fileName: string): string {
  const what = kind === "pdf" ? "this scanned PDF" : "this image";
  return `Transcribe ${what} ("${fileName.replace(/"/g, "'")}") following the rules.`;
}

// ---------------------------------------------------------------------------
// Study guide: system prompt and material block
// ---------------------------------------------------------------------------

/**
 * Instructions for the outline and section calls. Identical across every call
 * in one build job so the cached prefix is reused.
 */
export function guideSystemPrompt(learningProfile: string): string {
  return `You are the author of this student's personal study guide and flashcards. You are an expert in biology, biochemistry, cell and molecular biology, genetics, physiology, and the other sciences on the road to medical school, and an outstanding teacher who knows exactly how these ideas are tested on course exams and on the MCAT.

<student>
${learningProfile}
</student>

The student's course material for this study set is in <materials> below. It is your source of truth.
- Course exams test what the instructor taught, in the instructor's words. Use the material's terms, definitions, abbreviations, numbers and emphasis. Anything the material repeats, bolds, boxes, or says "know this" about is high-yield.
- Cover everything the material says about each topic. Do not drop details that could be tested.
- You may add standard background, a clarifying example, a mnemonic, or a real clinical or experimental connection when it genuinely helps understanding. Mark every fact you add that is not in the material: either end the sentence with "(not in your material)", or put it in a blockquote that starts with **Beyond your material:**. Never invent specifics (numbers, names, dates, doses, study results) that you are not sure of.
- Never contradict the material. If the material looks wrong or out of date, teach what it says and add a short blockquote that starts with **Check this:** explaining the discrepancy.
- Write for this student, following the guidance in <student>.

${PLAIN_TEXT_RULES}`;
}

/** Escapes text for use inside an XML-style attribute. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/[\r\n]+/g, " ");
}

/**
 * The material block (goes last in `system`, with cache_control). `text` is
 * loadSetContext().text: materials wrapped in <material name="..."> tags.
 */
export function materialsBlock(input: {
  setTitle: string;
  description?: string | null;
  text: string;
  truncated: boolean;
}): string {
  const about = input.description?.trim() ? `\n<set_description>\n${input.description.trim()}\n</set_description>` : "";
  const cut = input.truncated
    ? "\nNote: the material was too long to include in full, so some items were cut short where marked. Work from what is here and do not guess at the missing parts."
    : "";
  return `<study_set title="${attr(input.setTitle)}">${about}
<materials>
${input.text}
</materials>
</study_set>${cut}`;
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export const MIN_TOPICS = 3;
export const MAX_TOPICS = 12;

export function outlinePrompt(input: { existingTopics: Topic[] }): string {
  const existing = input.existingTopics.length
    ? `

This set already has topics, and the student has flashcards tagged with their ids:
${input.existingTopics.map((t) => `- ${t.id}: ${t.title}`).join("\n")}
When one of your topics covers the same content as an existing topic, reuse that topic's id (you may improve the title). Give new topics ids that are not in this list, continuing the numbering.`
    : `

Number the ids in order: t1, t2, t3, and so on.`;

  return `Plan the study guide for this study set.

Split all of the material into ${MIN_TOPICS} to ${MAX_TOPICS} topics, in teaching order (usually the order of the material: the order a good instructor would teach it, with foundations before the ideas that build on them). Each topic is one coherent chunk a student can study in one sitting, roughly 10 to 30 minutes. Use fewer topics for short material and more for long material. Cover every testable part of the material, and give no topic to course logistics (syllabus, due dates, grading).

For each topic:
- id: a short id of the form t followed by a number.
- title: 2 to 6 words in sentence case, named the way the course names it (for example "Glycolysis" or "Regulation of the cell cycle").
- summary: one or two sentences, in the course's terms, that say what the topic covers and its key ideas.${existing}`;
}

// ---------------------------------------------------------------------------
// One guide section + flashcards
// ---------------------------------------------------------------------------

export const MIN_CARDS = 8;
export const MAX_CARDS = 25;

export function sectionPrompt(input: {
  topic: Topic;
  index: number;
  topics: Topic[];
  /** Terms already on cards in this set (lowercase or not), to avoid repeats. */
  existingTerms: string[];
}): string {
  const { topic, index, topics } = input;
  const plan = topics
    .map((t, i) => `${i + 1}. ${t.title}${t.id === topic.id ? " (this one)" : ""}: ${t.summary}`)
    .join("\n");
  const terms = input.existingTerms.length
    ? `

The set already has flashcards for these terms. Don't make cards that repeat them:
${input.existingTerms.join("; ")}`
    : "";

  return `Write the study guide section and flashcards for topic ${index + 1} of ${topics.length}: "${topic.title}".

Topic summary: ${topic.summary}

The full plan, so you don't re-teach other topics (mention them by name when they connect):
${plan}

Part 1, content_md: the study guide section for this topic, in GitHub-flavored Markdown.
- Don't start with the topic title; the page already shows it. Open with a short orientation (two or three sentences) in the order the student prefers: big picture first or details first.
- Organize with ### subheadings (#### for a level below). Bold each key term the first time it appears.
- Explain mechanisms, pathways and processes as numbered steps: what happens, where, which enzyme or structure does it, inputs and outputs, how it is regulated, and why it matters.
- Use a comparison table whenever two or more things are compared or easily confused (columns such as feature, A, B). Keep cells short.
- Add a mnemonic for any list or sequence worth memorizing, if a good one exists.
- Call out the most testable facts in blockquotes that start with **High-yield:**.
- Where a real and well-established one exists, add a blockquote that starts with **Clinical connection:** or **Experimental connection:** (for example a disease, drug, mutation, or classic experiment that shows the concept). Skip it when there isn't a genuine one.
- Include a "### Common mix-ups" subsection with the confusions students typically make on this topic and how to tell the ideas apart.
- End with a "### Check yourself" subsection: 3 to 5 numbered questions that make the student apply the ideas (not just recall a word), followed by "#### Answers" with a short numbered answer for each.
- Make it as long as the material for this topic needs and no longer. No filler, no generic study advice.

Part 2, cards: ${MIN_CARDS} to ${MAX_CARDS} flashcards for this topic (more when the topic has more to learn). Together they should cover every key term, structure, enzyme, process, regulation point, and classic exam distinction in this topic.
- term (the front): short. A term, structure, enzyme, process, or a question such as "Rate-limiting enzyme of glycolysis?". At most about 12 words. It must not give away the answer.
- definition (the back): precise and self-contained, so it makes sense with no other context. One to three sentences, about 40 words at most, including the detail that tells it apart from similar ideas.
- hint: a short cue that helps recall without giving the answer away (a related idea, the first letter, the mnemonic), or an empty string when none helps.
- One idea per card. No duplicate cards. Only test what this topic's material supports.${terms}`;
}

// ---------------------------------------------------------------------------
// Exam-style questions
// ---------------------------------------------------------------------------

export function examSystemPrompt(learningProfile: string): string {
  return `You write practice exam questions for one student. You are an expert item writer for biology and premed science exams, including university course exams and the MCAT, and an expert in biology, biochemistry, physiology and related sciences.

<student>
${learningProfile}
</student>

The student's course material is in <materials> below. Every fact a question tests must be supported by this material. You may invent the scenario around it (a patient, an experiment, a data set), but not the science being tested.

Write exam-style items:
- Most questions test application and reasoning, not recall of a word: short clinical or experimental vignettes (two to five sentences), data or results described in words or as a small Markdown table, "predict what happens if" questions (a mutation, inhibitor, knockout, or change in conditions), and compare-and-contrast.
- 4 or 5 answer choices with exactly one best answer. Distractors are plausible: common misconceptions, a true fact that doesn't answer the question, the right idea in the wrong place or direction. Keep choices parallel in length and form. Never use "all of the above" or "none of the above", and avoid giveaway words such as "always" and "never".
- Choices are plain text: no letters or numbers in front of them.
- answer_index is the 0-based position of the correct choice. Spread correct answers across positions.
- explanation: first why the correct answer is right (the reasoning, step by step when needed), then why each other choice is wrong. Refer to choices by their content, never by letter or position. Light Markdown is fine.
- difficulty: "easy" is one step (understand or recall and apply directly), "medium" applies a concept to a new situation, "hard" takes several steps or combines ideas.
- Stems and explanations may use light Markdown (bold, a small table). Keep stems self-contained.

${PLAIN_TEXT_RULES}`;
}

export type DifficultyPlan = { easy: number; medium: number; hard: number };

export function examBatchPrompt(input: {
  count: number;
  topics: Topic[];
  plan: DifficultyPlan;
  batchIndex: number;
  batchCount: number;
  avoidStems: string[];
}): string {
  const { count, topics, plan } = input;
  const mix = (["easy", "medium", "hard"] as const)
    .filter((d) => plan[d] > 0)
    .map((d) => `${plan[d]} ${d}`)
    .join(", ");
  const avoid = input.avoidStems.length
    ? `

These questions already exist. Don't repeat them or test the same fact the same way:
${input.avoidStems.map((s) => `- ${s}`).join("\n")}`
    : "";
  const batch =
    input.batchCount > 1
      ? ` This is batch ${input.batchIndex + 1} of ${input.batchCount}, written at the same time as the others, so focus on these topics and vary the angle.`
      : "";

  return `Write ${count} new exam-style multiple-choice question${count === 1 ? "" : "s"}.${batch}

Topics to draw from (use these ids for topic_id):
${topics.map((t) => `- ${t.id}: ${t.title}. ${t.summary}`).join("\n")}

Difficulty mix: ${mix}.
Spread the questions across the topics and across different ideas within them. Each question tests a different fact or skill.${avoid}`;
}
