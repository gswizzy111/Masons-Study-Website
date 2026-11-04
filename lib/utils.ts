import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names; later Tailwind classes win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Short relative time: "just now", "5 minutes ago", "yesterday", "in 3 days".
 * Beyond about a month it shows the date ("Mar 4", or "Mar 4, 2025" in
 * another year). Returns "" for an invalid date.
 */
export function formatRelative(
  date: string | number | Date,
  now: Date = new Date(),
): string {
  const d = toDate(date);
  const time = d.getTime();
  if (Number.isNaN(time)) return "";

  const diff = time - now.getTime();
  const abs = Math.abs(diff);

  if (abs < 45_000) return "just now";
  if (abs < HOUR) return relativeFormatter.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return relativeFormatter.format(Math.round(diff / HOUR), "hour");

  // Whole calendar days, so "yesterday" means the previous date, not 24 hours.
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / DAY);
  if (Math.abs(days) < 7) return relativeFormatter.format(days, "day");
  if (Math.abs(days) < 30) return relativeFormatter.format(Math.round(days / 7), "week");

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Whole days from today (local time) until a YYYY-MM-DD date. 0 means today,
 * 1 tomorrow, negative when the date has passed. A full ISO timestamp is read
 * by its date part. Returns NaN for an unreadable date.
 */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr?.trim() ?? "");
  if (!match) return Number.NaN;
  const [, y, m, d] = match;
  const target = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(target.getTime())) return Number.NaN;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Round, because a daylight-saving change makes a "day" 23 or 25 hours long.
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

/**
 * A storage-safe version of a file name: ASCII letters, digits, ".", "-" and
 * "_" only, at most 100 characters, extension kept and lowercased.
 * "Lecture 3 (Glycolysis).PDF" -> "Lecture-3-Glycolysis.pdf".
 */
export function slugifyFileName(name: string): string {
  const ascii = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  const lastDot = ascii.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < ascii.length - 1;
  const rawBase = hasExt ? ascii.slice(0, lastDot) : ascii;
  const rawExt = hasExt ? ascii.slice(lastDot + 1) : "";

  const ext = rawExt
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);

  const base =
    rawBase
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "file";

  const maxBase = 100 - (ext ? ext.length + 1 : 0);
  const trimmedBase = base.slice(0, maxBase).replace(/[-.]+$/g, "") || "file";
  return ext ? `${trimmedBase}.${ext}` : trimmedBase;
}

/**
 * "1 card", "3 cards", "2 studies". Pass `plural` for irregular words
 * (pluralize(n, "quiz", "quizzes")).
 */
export function pluralize(n: number, word: string, plural?: string): string {
  const count = Number.isFinite(n) ? n : 0;
  const label = count === 1 ? word : (plural ?? pluralForm(word));
  return `${count.toLocaleString("en-US")} ${label}`;
}

function pluralForm(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}
