"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  Info,
  Lightbulb,
  ListChecks,
  ListOrdered,
  PlugZap,
  Sparkles,
  Target,
  Telescope,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useOptionalChat } from "@/components/chat/chat-context";
import { useChatStore, type ChatSnapshot, type ChatStore } from "@/components/chat/chat-store";
import { ChatMessage } from "@/components/chat/chat-message";
import { ChatComposer } from "@/components/chat/chat-composer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { WithTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SUGGESTIONS: Array<{ text: string; icon: typeof Telescope }> = [
  { text: "Give me the big picture of this unit", icon: Telescope },
  { text: "Quiz me with 5 questions", icon: ListChecks },
  { text: "Make a mnemonic for the hardest list here", icon: Lightbulb },
  { text: "What is most likely to be on the exam?", icon: Target },
  { text: "Explain the hardest topic step by step", icon: ListOrdered },
];

/** Distance from the bottom (px) that still counts as "at the latest message". */
const STICK_THRESHOLD = 56;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Notice({
  tone,
  icon,
  children,
  onDismiss,
}: {
  tone: "neutral" | "danger";
  icon: ReactNode;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-snug",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft text-danger"
          : "border-line bg-surface-2 text-ink-2",
      )}
    >
      <span className="mt-px shrink-0 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-1 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm opacity-80 transition-opacity duration-150 hover:opacity-100"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function Notices({ snapshot, store }: { snapshot: ChatSnapshot; store: ChatStore }) {
  const notices: ReactNode[] = [];
  if (snapshot.notConfigured) {
    notices.push(
      <Notice key="config" tone="neutral" icon={<PlugZap strokeWidth={1.75} aria-hidden />}>
        <strong className="font-semibold text-ink">Claude is not connected yet.</strong> Add
        ANTHROPIC_API_KEY to the site&apos;s settings to turn on the tutor. Your question is still in
        the box below.
      </Notice>,
    );
  }
  if (snapshot.error) {
    notices.push(
      <Notice
        key="error"
        tone="danger"
        icon={<TriangleAlert strokeWidth={1.75} aria-hidden />}
        onDismiss={store.dismissError}
      >
        {snapshot.error}
      </Notice>,
    );
  }
  if (snapshot.truncated) {
    notices.push(
      <Notice
        key="truncated"
        tone="neutral"
        icon={<Info strokeWidth={1.75} aria-hidden />}
        onDismiss={store.dismissTruncated}
      >
        Your material is long, so Claude is reading a shortened version of it. Answers may miss
        parts that were cut.
      </Notice>,
    );
  }
  if (snapshot.queued > 0) {
    notices.push(
      <Notice key="queued" tone="neutral" icon={<Info strokeWidth={1.75} aria-hidden />}>
        {snapshot.queued === 1
          ? "Your next question will be sent when this answer finishes."
          : `${snapshot.queued} more questions will be sent, one after another.`}
      </Notice>,
    );
  }
  if (notices.length === 0) return null;
  return <div className="flex shrink-0 flex-col gap-2 px-3 pt-1 pb-2.5 sm:px-4">{notices}</div>;
}

function EmptyChat({
  setTitle,
  onPick,
  disabled,
}: {
  setTitle: string;
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 px-1 pt-2 pb-4">
      <div className="flex flex-col gap-2">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <Sparkles className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h3 className="font-display text-xl leading-snug font-semibold tracking-[-0.01em] text-ink">
          Ask anything about {setTitle ? <span className="break-words">{setTitle}</span> : "this set"}
        </h3>
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          Claude has your material and study guide for this set, and explains things the way your
          learning profile says. Start with one of these or type your own question.
        </p>
      </div>
      <ul className="flex flex-col gap-2" aria-label="Suggested questions">
        {SUGGESTIONS.map(({ text, icon: Icon }) => (
          <li key={text}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(text)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-left text-[0.9375rem] text-ink",
                "transition-[background-color,border-color,translate] duration-150 ease-out",
                "hover:border-line-strong hover:bg-surface-2 active:translate-y-px",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <Icon
                className="size-4 shrink-0 text-ink-2 transition-colors duration-150 group-hover:text-accent-strong"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-5 py-2" aria-hidden>
      <Skeleton className="ml-auto h-10 w-3/5 rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-10/12" />
        <Skeleton className="h-3.5 w-7/12" />
      </div>
      <Skeleton className="ml-auto h-10 w-2/5 rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-9/12" />
      </div>
    </div>
  );
}

function ClearChatDialog({
  open,
  onOpenChange,
  store,
  onCleared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: ChatStore;
  onCleared: () => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleared = useRef(false);

  async function clear() {
    setClearing(true);
    setError(null);
    try {
      await store.clear();
      cleared.current = true;
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clear the chat. Try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        size="sm"
        title="Clear this chat?"
        description="This deletes every message in this set's chat with Claude. Your material, guide and cards stay as they are."
        onCloseAutoFocus={(event) => {
          if (cleared.current) {
            cleared.current = false;
            event.preventDefault();
            onCleared();
          }
        }}
      >
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="danger" loading={clearing} onClick={clear}>
            Clear chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "Ask Claude" tutor for one study set. Fills its container (give it a
 * height), so the set workspace can dock it as a column or show it as a
 * full-screen sheet on phones. The conversation lives in a per-set store, so
 * closing and reopening the panel keeps it, including an answer in progress.
 */
export function ChatPanel(props: { setId: string; setTitle: string; className?: string }) {
  const { setId, setTitle, className } = props;
  const chat = useOptionalChat();
  const { store, snapshot } = useChatStore(setId);
  const titleId = useId();

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Saved messages, once per set per tab.
  useEffect(() => {
    void store.loadHistory();
  }, [store]);

  // A question asked from elsewhere ("Ask Claude about this section"):
  // take it once and send it.
  const pendingQuestion = chat?.pendingQuestion ?? null;
  const takePendingQuestion = chat?.takePendingQuestion;
  useEffect(() => {
    if (!takePendingQuestion) return;
    const question = takePendingQuestion();
    if (question) store.send(question);
  }, [pendingQuestion, takePendingQuestion, store]);

  // Put the cursor in the box on open, except on touch screens (where it
  // would pop the keyboard over the conversation).
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  }, []);

  // Follow new text while the student is at the bottom. Content growth
  // doesn't fire scroll events, so watch sizes instead.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    scroller.scrollTop = scroller.scrollHeight;
    lastTopRef.current = scroller.scrollTop;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) {
        scroller.scrollTop = scroller.scrollHeight;
        lastTopRef.current = scroller.scrollTop;
      } else {
        const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        setShowJump(distance > STICK_THRESHOLD);
      }
    });
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Each send jumps back to the latest message.
  useEffect(() => {
    if (snapshot.sendCount > 0) scrollToBottom();
  }, [snapshot.sendCount, scrollToBottom]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= STICK_THRESHOLD) {
      stickRef.current = true;
      setShowJump(false);
    } else if (el.scrollTop < lastTopRef.current - 1) {
      // Scrolled up by the student: stop following.
      stickRef.current = false;
      setShowJump(true);
    }
    lastTopRef.current = el.scrollTop;
  }

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || snapshot.busy) return;
      store.send(text);
      store.setDraft("");
    },
    [store, snapshot.busy],
  );

  const pick = useCallback(
    (text: string) => {
      store.send(text);
      textareaRef.current?.focus({ preventScroll: true });
    },
    [store],
  );

  const { items, history, busy, waiting } = snapshot;
  const lastItem = items[items.length - 1];
  const showEmpty = history !== "loading" && items.length === 0;
  const liveText = busy ? (waiting ? "Claude is writing an answer." : "") : snapshot.announcement;

  return (
    <aside
      aria-labelledby={titleId}
      data-set-id={setId}
      className={cn("relative flex h-full min-h-0 w-full flex-col bg-surface text-ink", className)}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-line py-2.5 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-[0.9375rem] leading-tight font-semibold text-ink"
          >
            <Sparkles className="size-4 shrink-0 text-accent-strong" strokeWidth={1.75} aria-hidden />
            Claude tutor
          </h2>
          {setTitle ? (
            <p className="mt-0.5 truncate text-sm text-ink-2" title={setTitle}>
              {setTitle}
            </p>
          ) : null}
        </div>
        <WithTooltip label={busy ? "Wait for the answer to finish" : "Clear chat"} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear chat"
            aria-disabled={busy || items.length === 0 || undefined}
            onClick={() => {
              if (busy || items.length === 0) return;
              setConfirmClear(true);
            }}
            className="size-9 aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed"
          >
            <Trash2 className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </Button>
        </WithTooltip>
        {chat ? (
          <WithTooltip label="Close" side="bottom">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close the tutor"
              onClick={chat.close}
              className="size-9"
            >
              <X className="size-5" strokeWidth={1.75} aria-hidden />
            </Button>
          </WithTooltip>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto overscroll-contain px-4 sm:px-5"
        >
          <div ref={contentRef} className="py-4">
            {history === "loading" && items.length === 0 ? <HistorySkeleton /> : null}

            {history === "error" ? (
              <div className="mb-4">
                <Notice tone="neutral" icon={<Info strokeWidth={1.75} aria-hidden />}>
                  Couldn&apos;t load earlier messages.{" "}
                  <Button
                    variant="link"
                    size="sm"
                    className="text-sm"
                    onClick={() => void store.loadHistory(true)}
                  >
                    Try again
                  </Button>
                </Notice>
              </div>
            ) : null}

            {showEmpty ? <EmptyChat setTitle={setTitle} onPick={pick} disabled={busy} /> : null}

            {items.length > 0 ? (
              <ol className="flex flex-col gap-5" aria-label="Conversation">
                {items.map((item) => (
                  <ChatMessage
                    key={item.id}
                    item={item}
                    waiting={item === lastItem && waiting}
                    onRetry={store.retry}
                    retryDisabled={busy}
                  />
                ))}
              </ol>
            ) : null}
          </div>
        </div>

        {showJump && items.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className={cn(
                "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-md",
                "transition-[background-color,translate] duration-150 ease-out hover:bg-surface-2 active:translate-y-px",
                "motion-safe:animate-pop-in",
              )}
            >
              <ArrowDown className="size-4" strokeWidth={1.75} aria-hidden />
              Jump to latest
            </button>
          </div>
        ) : null}
      </div>

      <Notices snapshot={snapshot} store={store} />

      <ChatComposer
        value={snapshot.draft}
        onChange={store.setDraft}
        onSend={send}
        onStop={store.stop}
        busy={busy}
        textareaRef={textareaRef}
      />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveText}
      </div>

      <ClearChatDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        store={store}
        onCleared={() => textareaRef.current?.focus({ preventScroll: true })}
      />
    </aside>
  );
}
