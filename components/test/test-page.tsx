"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Tabs } from "radix-ui";
import { ClipboardList, Sparkles } from "lucide-react";
import type { SetStatus, Topic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/app-shell";
import type { LearnCardRow } from "@/components/learn/learn-data";
import type { AttemptRow, ExamQuestionRow, TestTab } from "@/components/test/test-data";
import { QuickTest } from "@/components/test/quick-test";
import { ExamPractice } from "@/components/test/exam-practice";

const TABS: Array<{ value: TestTab; label: string; icon: typeof ClipboardList }> = [
  { value: "cards", label: "Quick test", icon: ClipboardList },
  { value: "exam", label: "Exam practice", icon: Sparkles },
];

/** The Test tab: a quick test from the cards, or AI exam-style questions. */
export function TestPage({
  setId,
  setStatus,
  topics,
  cards,
  questions,
  attempts,
  initialTab,
  aiReady,
}: {
  setId: string;
  setStatus: SetStatus;
  topics: Topic[];
  cards: LearnCardRow[];
  questions: ExamQuestionRow[];
  attempts: AttemptRow[];
  initialTab: TestTab;
  aiReady: boolean;
}) {
  const pathname = usePathname();
  const [tab, setTab] = useState<TestTab>(initialTab);

  const changeTab = (value: string) => {
    const next: TestTab = value === "exam" ? "exam" : "cards";
    setTab(next);
    try {
      window.history.replaceState(null, "", next === "exam" ? `${pathname}?tab=exam` : pathname);
    } catch {
      // The address just won't remember the tab.
    }
  };

  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <Tabs.Root value={tab} onValueChange={changeTab}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink">
              Test yourself
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              {tab === "cards"
                ? "A practice test made from your cards. Results update what you've learned."
                : "Exam-style questions written by Claude from your material, with explanations."}
            </p>
          </div>
          <Tabs.List
            aria-label="Kind of test"
            className="inline-flex shrink-0 items-stretch gap-0.5 self-start rounded-md border border-line bg-surface-2 p-[3px] sm:self-auto"
          >
            {TABS.map(({ value, label, icon: Icon }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-sm px-3.5 text-sm font-medium whitespace-nowrap text-ink-2",
                  "transition-[background-color,color,box-shadow] duration-150 ease-out hover:text-ink",
                  "data-[state=active]:border data-[state=active]:border-line/80 data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs",
                  "focus-visible:outline-offset-0",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value="cards" className="mt-6 rounded-lg focus-visible:outline-offset-4 sm:mt-8" forceMount hidden={tab !== "cards"}>
          <QuickTest setId={setId} setStatus={setStatus} topics={topics} cards={cards} />
        </Tabs.Content>
        <Tabs.Content value="exam" className="mt-6 rounded-lg focus-visible:outline-offset-4 sm:mt-8" forceMount hidden={tab !== "exam"}>
          <ExamPractice
            setId={setId}
            topics={topics}
            initialQuestions={questions}
            initialAttempts={attempts.filter((a) => a.kind === "exam")}
            aiReady={aiReady}
            active={tab === "exam"}
          />
        </Tabs.Content>
      </Tabs.Root>
    </PageContainer>
  );
}
