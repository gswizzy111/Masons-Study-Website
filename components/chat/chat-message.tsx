"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy, RotateCcw } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import type { ChatItem } from "@/components/chat/chat-store";
import { cn } from "@/lib/utils";

/** Three soft dots. Static when the student prefers reduced motion. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-ink-3 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (permissions or an insecure page): nothing to do.
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={copy}
      className="h-7 gap-1.5 px-2 text-xs text-ink-2 hover:text-ink"
      aria-label={copied ? "Copied" : "Copy answer"}
    >
      {copied ? (
        <Check className="size-3.5" strokeWidth={1.75} aria-hidden />
      ) : (
        <Copy className="size-3.5" strokeWidth={1.75} aria-hidden />
      )}
      <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

type ChatMessageProps = {
  item: ChatItem;
  /** Waiting for the first words of this answer. */
  waiting?: boolean;
  onRetry?: (id: string) => void;
  retryDisabled?: boolean;
};

function ChatMessageImpl({ item, waiting = false, onRetry, retryDisabled }: ChatMessageProps) {
  if (item.role === "user") {
    return (
      <li className="flex flex-col items-end gap-1.5">
        <div
          className={cn(
            "max-w-[88%] rounded-lg rounded-br-xs bg-accent-soft px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-ink",
            "break-words whitespace-pre-wrap",
            item.state === "failed" && "opacity-80",
          )}
        >
          <span className="sr-only">You asked: </span>
          {item.content}
        </div>
        {item.state === "failed" ? (
          <div className="flex max-w-[88%] flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm text-danger">
            <span className="inline-flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>{item.error ?? "This question didn't get an answer."}</span>
            </span>
            {onRetry ? (
              <Button
                variant="link"
                size="sm"
                className="gap-1 text-sm"
                disabled={retryDisabled}
                onClick={() => onRetry(item.id)}
              >
                <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  const streaming = item.state === "streaming";
  const hasText = item.content.trim().length > 0;

  return (
    <li className="flex flex-col items-start gap-1">
      <span className="sr-only">Claude said: </span>
      {streaming && waiting && !hasText ? (
        <div className="flex items-center gap-2.5 py-1.5 text-sm text-ink-2">
          <TypingDots />
          <span>Thinking</span>
        </div>
      ) : (
        <div className="w-full min-w-0">
          <Markdown
            compact
            className={cn(item.state === "refused" && "text-ink-2 italic")}
          >
            {item.content}
          </Markdown>
          {streaming ? <TypingDots className="mt-2" /> : null}
        </div>
      )}
      {!streaming && hasText && item.state !== "refused" ? (
        <div className="-ml-2 flex items-center">
          <CopyButton text={item.content} />
        </div>
      ) : null}
    </li>
  );
}

/** One message. Memoized: only the streaming answer re-renders as text arrives. */
export const ChatMessage = memo(ChatMessageImpl);
