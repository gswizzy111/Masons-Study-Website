// Pure text helpers for dates shown on the dashboard and in a set.
// Safe on the server and the client.
import { daysUntil, formatRelative } from "@/lib/utils";

/**
 * "Exam in 12 days", "Exam tomorrow", "Exam today", "Exam was yesterday",
 * "Exam was 3 days ago". Empty string when there is no readable date.
 */
export function examCountdownText(examDate: string | null | undefined, now: Date = new Date()): string {
  if (!examDate) return "";
  const days = daysUntil(examDate, now);
  if (Number.isNaN(days)) return "";
  if (days === 0) return "Exam today";
  if (days === 1) return "Exam tomorrow";
  if (days > 1) return `Exam in ${days.toLocaleString("en-US")} days`;
  if (days === -1) return "Exam was yesterday";
  return `Exam was ${Math.abs(days).toLocaleString("en-US")} days ago`;
}

/** "Studied 2 days ago", or "Not studied yet". */
export function lastStudiedText(lastStudiedAt: string | null | undefined, now: Date = new Date()): string {
  if (!lastStudiedAt) return "Not studied yet";
  const rel = formatRelative(lastStudiedAt, now);
  return rel ? `Studied ${rel}` : "Not studied yet";
}

/** A plain relative time ("5 minutes ago"), or "" for an unreadable date. */
export function relativeText(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  return formatRelative(value, now);
}

/** "Mon, Nov 16" (or "Nov 16, 2027" in another year). Reads YYYY-MM-DD without time zones. */
export function formatExamDate(examDate: string | null | undefined, now: Date = new Date()): string {
  if (!examDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(examDate);
  if (!match) return "";
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  const sameYear = Number(y) === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...(sameYear ? { weekday: "short" } : { year: "numeric" }),
    month: "short",
    day: "numeric",
  });
}

export type ExamUrgency = "none" | "past" | "soon" | "near" | "later";

/** How close an exam is: today to 3 days "soon", up to 14 "near". */
export function examUrgency(examDate: string | null | undefined, now: Date = new Date()): ExamUrgency {
  if (!examDate) return "none";
  const days = daysUntil(examDate, now);
  if (Number.isNaN(days)) return "none";
  if (days < 0) return "past";
  if (days <= 3) return "soon";
  if (days <= 14) return "near";
  return "later";
}

export type LiveTextKind = "exam" | "last-studied" | "relative";

export function liveText(kind: LiveTextKind, value: string | null, now: Date): string {
  switch (kind) {
    case "exam":
      return examCountdownText(value, now);
    case "last-studied":
      return lastStudiedText(value, now);
    case "relative":
      return relativeText(value, now);
  }
}
