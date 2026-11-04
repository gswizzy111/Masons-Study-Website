// Pure helpers for the study guide page. Safe on the server and the client.
import type { GuideSection, SetStatus, Topic } from "@/lib/types";

/** The guide_sections columns the guide page reads. */
export const GUIDE_SECTION_COLUMNS = "id, position, topic_id, title, content_md, status, updated_at";

export type GuideSectionRow = Pick<
  GuideSection,
  "id" | "position" | "topic_id" | "title" | "content_md" | "status" | "updated_at"
>;

/**
 * One section as the page shows it. `missing` means the set finished
 * building without writing this topic.
 */
export type GuideEntryStatus = GuideSection["status"] | "missing";

export type GuideEntry = {
  /** The topic id, also the section's DOM id. */
  id: string;
  /** 1-based position on the page. */
  number: number;
  title: string;
  summary: string | null;
  status: GuideEntryStatus;
  content: string;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_`#]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Drops a first heading that only repeats the section title (the page
 * already shows the title as the section heading).
 */
export function stripLeadingTitle(markdown: string, title: string): string {
  const source = markdown.replace(/^\s+/, "");
  const match = /^#{1,3}[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/.exec(source);
  if (!match) return source;
  return normalize(match[1]) === normalize(title) ? source.slice(match[0].length).replace(/^\s+/, "") : source;
}

/**
 * The sections in reading order: one per topic (in topic order), then any
 * section whose topic is no longer in the outline (by position).
 */
export function buildEntries(
  topics: readonly Topic[],
  sections: readonly GuideSectionRow[],
  setStatus: SetStatus,
): GuideEntry[] {
  const sorted = [...sections].sort((a, b) => a.position - b.position);
  const byTopic = new Map<string, GuideSectionRow>();
  for (const section of sorted) {
    if (!byTopic.has(section.topic_id)) byTopic.set(section.topic_id, section);
  }

  const entries: GuideEntry[] = [];
  const used = new Set<string>();

  for (const topic of topics) {
    if (!topic?.id || used.has(topic.id)) continue;
    used.add(topic.id);
    const section = byTopic.get(topic.id);
    entries.push(toEntry(topic.id, topic.title || section?.title || "Untitled topic", topic.summary, section, setStatus));
  }

  for (const section of sorted) {
    if (used.has(section.topic_id)) continue;
    used.add(section.topic_id);
    entries.push(toEntry(section.topic_id, section.title || "Untitled topic", null, section, setStatus));
  }

  return entries.map((entry, i) => ({ ...entry, number: i + 1 }));
}

function toEntry(
  id: string,
  title: string,
  summary: string | null | undefined,
  section: GuideSectionRow | undefined,
  setStatus: SetStatus,
): GuideEntry {
  let status: GuideEntryStatus;
  if (!section) {
    status = setStatus === "building" ? "pending" : "missing";
  } else if (section.status === "ready" && !section.content_md.trim()) {
    status = "missing";
  } else if ((section.status === "pending" || section.status === "writing") && setStatus !== "building") {
    // The build stopped before this section was finished.
    status = setStatus === "error" ? "error" : "missing";
  } else {
    status = section.status;
  }

  return {
    id,
    number: 0,
    title,
    summary: summary?.trim() ? summary.trim() : null,
    status,
    content: status === "ready" && section ? stripLeadingTitle(section.content_md, title) : "",
  };
}

/** Rough reading time in minutes for the ready sections (220 words a minute). */
export function readingMinutes(entries: readonly GuideEntry[]): number {
  let words = 0;
  for (const entry of entries) {
    if (entry.status !== "ready") continue;
    const matches = entry.content.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    words += matches ? matches.length : 0;
  }
  return words === 0 ? 0 : Math.max(1, Math.round(words / 220));
}

/** True while some section can still change. */
export function isGuideBuilding(status: SetStatus): boolean {
  return status === "building";
}
