import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpenText,
  Check,
  CirclePlay,
  ClipboardCheck,
  Gamepad2,
  Layers,
  MessageSquareText,
} from "lucide-react";
import type { MasterySummary } from "@/lib/mastery";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { MasteryBar } from "@/components/ui/mastery-bar";
import { ProgressRing } from "@/components/ui/progress-ring";

/* Example content for the previews. Real biology, clearly labeled as an
   example on the page. */

const EXAMPLE_GUIDE = `### Regulating glycolysis

**Phosphofructokinase-1 (PFK-1)** catalyzes the committed step: fructose 6-phosphate to fructose 1,6-bisphosphate.

> **High-yield.** ATP and citrate inhibit PFK-1. AMP and fructose 2,6-bisphosphate activate it.

| Enzyme | Where | Regulation |
|---|---|---|
| Hexokinase | Most tissues | Inhibited by glucose 6-phosphate |
| Glucokinase | Liver, pancreatic β cells | Induced by insulin |
`;

const EXAMPLE_SET: MasterySummary = {
  total: 48,
  mastered: 20,
  learning: 19,
  familiar: 7,
  not_studied: 9,
  due: 6,
  percent: 42,
};

function summary(mastered: number, learning: number, notStudied: number): MasterySummary {
  const total = mastered + learning + notStudied;
  return {
    total,
    mastered,
    learning,
    familiar: 0,
    not_studied: notStudied,
    due: 0,
    percent: total ? Math.round((100 * mastered) / total) : 0,
  };
}

const EXAMPLE_TOPICS = [
  { title: "Glycolysis", summary: summary(9, 3, 0) },
  { title: "Pyruvate dehydrogenase complex", summary: summary(5, 4, 1) },
  { title: "TCA cycle", summary: summary(4, 7, 2) },
  { title: "Electron transport chain", summary: summary(2, 5, 4) },
  { title: "Gluconeogenesis", summary: summary(1, 3, 4) },
  { title: "Glycogen metabolism", summary: summary(0, 2, 6) },
  { title: "Pentose phosphate pathway", summary: summary(0, 0, 5) },
];

const container = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
      >
        Skip to content
      </a>

      <header className={cn(container, "flex h-16 items-center justify-between gap-4")}>
        <Brand href="/" />
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm" className="max-sm:hidden">
            <Link href="/signup">Create your account</Link>
          </Button>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Hero />
        <Features />
        <Profile />
        <Mastery />
        <Details />
        <Closing />
      </main>

      <footer className="border-t border-line">
        <div
          className={cn(
            container,
            "flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <Brand size="sm" />
          <p className="max-w-[62ch] text-sm leading-relaxed text-ink-2">
            Guides, cards and questions are written by Claude, an AI model from Anthropic. Check
            anything that matters against your course material.
          </p>
        </div>
      </footer>
    </div>
  );
}

function PrimaryActions({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <Button asChild size="lg">
        <Link href="/signup">Create your account</Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/login">Log in</Link>
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(container, "grid grid-cols-1 items-center gap-x-12 gap-y-14 pt-10 pb-20 lg:grid-cols-12 lg:pt-16 lg:pb-28")}
    >
      <div className="lg:col-span-6">
        <h1
          id="hero-title"
          className="font-display text-[2.5rem] leading-[1.06] font-semibold tracking-[-0.025em] text-ink sm:text-[3rem]"
        >
          Your lectures, rebuilt for how you learn.
        </h1>
        <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-ink-2">
          Upload the slides and notes for an exam. Get a study guide written your way,
          flashcards, and exam-style practice.
        </p>
        <PrimaryActions className="mt-9" />
      </div>

      <figure className="lg:col-span-6">
        <div className="relative lg:pl-12">
          <div className="rounded-lg border border-line bg-surface shadow-md motion-safe:animate-rise-in">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-6">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
                <BookOpenText className="size-4 text-accent" strokeWidth={1.75} aria-hidden />
                Study guide
              </span>
              <Badge variant="outline">Exam 2: Metabolism</Badge>
            </div>
            <div className="px-5 py-5 sm:px-6 sm:py-6">
              <Markdown compact className="[&_table]:min-w-[20rem]">
                {EXAMPLE_GUIDE}
              </Markdown>
            </div>
          </div>

          <div
            className={cn(
              "relative mt-4 rounded-lg border border-line bg-surface p-5 shadow-lg",
              "motion-safe:animate-rise-in motion-safe:[animation-delay:140ms]",
              "sm:max-w-[19.5rem] lg:-mt-5 lg:-ml-12",
            )}
          >
            <div className="flex items-center gap-4">
              <ProgressRing value={EXAMPLE_SET.percent} size={56} stroke={5} label="Mastered">
                <span className="font-mono text-[0.8125rem] font-semibold text-ink tabular-nums">
                  {EXAMPLE_SET.percent}%
                </span>
              </ProgressRing>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">Exam 2: Metabolism</p>
                <p className="text-sm text-ink-2">
                  {EXAMPLE_SET.due} cards due for review
                </p>
              </div>
            </div>
            <MasteryBar summary={EXAMPLE_SET} size="sm" className="mt-4" />
          </div>
        </div>
        <figcaption className="mt-4 text-sm text-ink-2">
          An example set. Yours is built from your own lectures and notes.
        </figcaption>
      </figure>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Feature({
  icon,
  title,
  children,
  className,
  visual,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  visual?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-lg border border-line p-6 sm:p-7",
        className,
      )}
    >
      <div>
        <span
          aria-hidden
          className="mb-4 inline-grid size-9 place-items-center rounded-md border border-line bg-surface text-accent [&_svg]:size-[18px]"
        >
          {icon}
        </span>
        <h3 className="font-display text-xl leading-snug font-semibold tracking-[-0.012em] text-ink">
          {title}
        </h3>
        <p className="mt-2 max-w-[48ch] text-[0.9375rem] leading-relaxed text-ink-2">{children}</p>
      </div>
      {visual ? <div className="mt-auto">{visual}</div> : null}
    </li>
  );
}

function Features() {
  return (
    <section aria-labelledby="features-title" className="border-t border-line">
      <div className={cn(container, "py-20 lg:py-28")}>
        <h2
          id="features-title"
          className="max-w-[22ch] font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[2.5rem]"
        >
          One set, six ways to study it
        </h2>
        <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-ink-2">
          Each set is built from the files you upload, so every guide section, card and question
          comes from your course.
        </p>

        <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <Feature
            icon={<BookOpenText strokeWidth={1.75} />}
            title="A study guide in your style"
            className="bg-surface graph-paper md:col-span-2 lg:col-span-7 lg:row-span-2"
            visual={
              <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
                {EXAMPLE_TOPICS.map((t, i) => (
                  <li key={t.title} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-5 shrink-0 font-mono text-sm text-ink-3 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-ink">
                      {t.title}
                    </span>
                    <MasteryBar
                      summary={t.summary}
                      showLegend={false}
                      size="sm"
                      label={t.title}
                      className="w-14 shrink-0 sm:w-28"
                    />
                  </li>
                ))}
              </ol>
            }
          >
            One section per topic, in teaching order: key terms in bold, tables to compare and
            contrast, mechanisms step by step, mnemonics, and self-check questions at the end.
          </Feature>

          <Feature
            icon={<Layers strokeWidth={1.75} />}
            title="Flashcards and Learn mode"
            className="bg-accent-soft lg:col-span-5"
            visual={
              <div className="rounded-md border border-line bg-surface px-4 py-3.5 shadow-xs">
                <p className="font-display text-[1.0625rem] font-semibold text-ink">
                  Committed step of glycolysis
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
                  <Kbd>Space</Kbd> to flip
                </p>
              </div>
            }
          >
            Flip through cards, or let Learn quiz you with multiple choice, then written answers,
            until each card is mastered. Missed cards come back for review.
          </Feature>

          <Feature
            icon={<ClipboardCheck strokeWidth={1.75} />}
            title="Exam-style practice questions"
            className="bg-surface lg:col-span-5"
            visual={
              <div className="text-sm">
                <p className="leading-relaxed text-ink">
                  A sprinter’s muscle can’t regenerate NAD⁺ from pyruvate. Which enzyme is
                  missing?
                </p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {[
                    { label: "Pyruvate dehydrogenase", correct: false },
                    { label: "Lactate dehydrogenase", correct: true },
                    { label: "Pyruvate carboxylase", correct: false },
                  ].map((c, i) => (
                    <li
                      key={c.label}
                      className={cn(
                        "flex items-center gap-2.5 rounded-sm border px-3 py-2",
                        c.correct
                          ? "border-accent/40 bg-accent-soft text-ink"
                          : "border-line text-ink-2",
                      )}
                    >
                      <span className="font-mono text-xs text-ink-2">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{c.label}</span>
                      {c.correct ? (
                        <>
                          <Check className="size-4 text-accent" strokeWidth={2} aria-hidden />
                          <span className="sr-only">(correct answer)</span>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            }
          >
            Short clinical and experimental vignettes with one best answer, and an explanation for
            every choice.
          </Feature>

          <Feature
            icon={<MessageSquareText strokeWidth={1.75} />}
            title="A Claude tutor beside your notes"
            className="bg-surface-2 md:col-span-1 lg:col-span-5"
            visual={
              <div className="flex flex-col gap-2 text-sm leading-relaxed">
                <p className="max-w-[85%] self-end rounded-md rounded-br-xs bg-accent px-3.5 py-2 text-accent-ink">
                  Why does citrate slow glycolysis?
                </p>
                <p className="max-w-[92%] self-start rounded-md rounded-bl-xs border border-line bg-surface px-3.5 py-2 text-ink">
                  Citrate builds up when the TCA cycle already has plenty of fuel, so it tells
                  PFK-1 to slow down.
                </p>
              </div>
            }
          >
            Ask about anything in the set while you read. Answers draw on your material and your
            learning profile.
          </Feature>

          <Feature
            icon={<Gamepad2 strokeWidth={1.75} />}
            title="Two quick games"
            className="bg-learning-soft lg:col-span-4"
          >
            Meteor: type the answer before it lands. Match: pair terms with definitions against the
            clock. Both use your cards.
          </Feature>

          <Feature
            icon={<CirclePlay strokeWidth={1.75} />}
            title="Video picks per topic"
            className="bg-surface md:col-span-2 lg:col-span-3"
          >
            YouTube videos chosen for each topic, with a line on why each one is worth your time.
          </Feature>
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Chip({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <li
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-sm",
        selected
          ? "border-accent/35 bg-accent-soft font-medium text-accent-strong"
          : "border-line bg-surface text-ink-2",
      )}
    >
      {selected ? <Check className="size-3.5" strokeWidth={2.25} aria-hidden /> : null}
      {children}
      {selected ? <span className="sr-only">(selected)</span> : null}
    </li>
  );
}

function ProfileGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-6">
      <p className="w-28 shrink-0 pt-1.5 text-sm font-medium text-ink">{label}</p>
      <ul className="flex flex-wrap gap-2">{children}</ul>
    </div>
  );
}

function Profile() {
  return (
    <section aria-labelledby="profile-title" className="border-y border-line bg-surface">
      <div className={cn(container, "grid grid-cols-1 gap-12 py-20 lg:grid-cols-12 lg:items-center lg:py-28")}>
        <div className="lg:col-span-5">
          <h2
            id="profile-title"
            className="font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[2.5rem]"
          >
            Tell it how you learn, once
          </h2>
          <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-ink-2">
            Big picture or details first, concise or deep, analogies or mnemonics. Guides, tutor
            answers and questions all follow it. Change it any time.
          </p>
        </div>

        <figure className="lg:col-span-7">
          <div className="flex flex-col gap-5 rounded-lg border border-line bg-bg p-5 sm:p-7">
            <ProfileGroup label="Start with">
              <Chip selected>Big picture</Chip>
              <Chip>Details</Chip>
            </ProfileGroup>
            <ProfileGroup label="Depth">
              <Chip>Concise</Chip>
              <Chip selected>Balanced</Chip>
              <Chip>Deep</Chip>
            </ProfileGroup>
            <ProfileGroup label="Explain with">
              <Chip selected>Analogies</Chip>
              <Chip selected>Step by step</Chip>
              <Chip selected>Clinical connections</Chip>
              <Chip>Mnemonics</Chip>
              <Chip selected>Tables</Chip>
              <Chip>Examples</Chip>
            </ProfileGroup>
            <ProfileGroup label="Studying for">
              <Chip selected>Course exams</Chip>
              <Chip selected>MCAT</Chip>
              <Chip>USMLE</Chip>
            </ProfileGroup>
          </div>
          <figcaption className="mt-4 text-sm text-ink-2">
            An example learning profile. You set yours when you sign up.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const STATES = [
  {
    key: "mastered",
    label: "Mastered",
    color: "bg-mastered",
    weight: EXAMPLE_SET.mastered,
    body: "Right enough times in a row. It comes back on a schedule so it stays that way.",
  },
  {
    key: "learning",
    label: "Still learning",
    color: "bg-learning",
    weight: EXAMPLE_SET.learning,
    body: "Seen, but not reliable yet. Learn mode keeps asking until it is.",
  },
  {
    key: "not_studied",
    label: "Not studied",
    color: "bg-not-studied",
    weight: EXAMPLE_SET.not_studied,
    body: "Not seen yet.",
  },
] as const;

function Mastery() {
  const columns = STATES.map((s) => `${s.weight}fr`).join(" ");
  return (
    <section aria-labelledby="mastery-title">
      <div className={cn(container, "py-20 lg:py-28")}>
        <h2
          id="mastery-title"
          className="max-w-[24ch] font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[2.5rem]"
        >
          See what you know, and what’s due
        </h2>
        <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-ink-2">
          Every card is mastered, still learning or not studied, for the whole set and for each
          topic. Cards due for review are counted for you.
        </p>

        <div className="mt-12" style={{ ["--cols" as string]: columns }}>
          <div
            aria-hidden
            className="grid h-4 gap-[3px] overflow-hidden rounded-full sm:h-5"
            style={{ gridTemplateColumns: "var(--cols)" }}
          >
            {STATES.map((s) => (
              <div key={s.key} className={cn("h-full", s.color)} />
            ))}
          </div>
          <dl className="mt-6 grid gap-6 sm:grid-cols-[var(--cols)] sm:gap-[3px]">
            {STATES.map((s) => (
              <div key={s.key} className="sm:pr-6">
                <dt className="flex items-center gap-2 font-medium text-ink">
                  <span aria-hidden className={cn("size-2.5 rounded-full", s.color)} />
                  {s.label}
                </dt>
                <dd className="mt-1.5 max-w-[34ch] text-[0.9375rem] leading-relaxed text-ink-2">
                  {s.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const DETAILS = [
  {
    term: "What you can upload",
    body: "PDF lecture slides, Word and PowerPoint files, text and Markdown, and photos of handwritten notes. Or paste your notes in.",
  },
  {
    term: "Who can see it",
    body: "Only you. Every set, card and tutor chat is private to your account.",
  },
  {
    term: "Where Claude fits",
    body: "Claude writes the guide, cards and questions from your files and answers you in the tutor panel. If a set is too long to read in full, you’re told.",
  },
  {
    term: "Who it’s for",
    body: "A student with science exams now, and the MCAT and medical school ahead.",
  },
];

function Details() {
  return (
    <section aria-labelledby="details-title" className="border-t border-line">
      <div className={cn(container, "grid grid-cols-1 gap-10 py-20 lg:grid-cols-12 lg:py-24")}>
        <h2
          id="details-title"
          className="font-display text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.018em] text-ink lg:col-span-4"
        >
          Good to know
        </h2>
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
          {DETAILS.map((d) => (
            <div key={d.term}>
              <dt className="font-medium text-ink">{d.term}</dt>
              <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{d.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Closing() {
  return (
    <section aria-labelledby="closing-title" className="border-t border-line bg-surface">
      <div className={cn(container, "flex flex-col items-center py-20 text-center lg:py-28")}>
        <h2
          id="closing-title"
          className="max-w-[20ch] font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[2.75rem]"
        >
          Start with your next exam
        </h2>
        <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-ink-2">
          Make a set, add your slides, and start studying while the guide fills in.
        </p>
        <PrimaryActions className="mt-9 w-full justify-center sm:w-auto" />
      </div>
    </section>
  );
}
