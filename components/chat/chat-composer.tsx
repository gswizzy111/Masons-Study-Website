"use client";

import { useId, useLayoutEffect, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAT_MESSAGE_MAX } from "@/components/chat/chat-protocol";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 192;
const COUNTER_FROM = CHAT_MESSAGE_MAX - 1000;

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  /** An answer is streaming: the button stops it instead of sending. */
  busy: boolean;
  /** Claude isn't connected: the box and the send button are off. */
  disabled?: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * The question box. Grows with its text up to about eight lines. Enter
 * sends, Shift+Enter adds a line, and while an answer streams the send
 * button becomes Stop.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled = false,
  textareaRef,
}: ChatComposerProps) {
  const inputId = useId();
  const hintId = useId();
  const counterId = useId();
  const length = value.length;
  const tooLong = length > CHAT_MESSAGE_MAX;
  const canSend = !busy && !disabled && value.trim().length > 0 && !tooLong;

  // Grow with the text (field-sizing isn't everywhere yet).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value, textareaRef]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <form
      onSubmit={submit}
      className="shrink-0 border-t border-line bg-surface px-3 pt-3 pb-3 sm:px-4"
      aria-label="Ask Claude"
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border border-line bg-surface p-1.5 pl-3 shadow-xs",
          disabled && "bg-surface-2 shadow-none",
          "transition-[border-color,box-shadow] duration-150 ease-out",
          "hover:border-line-strong",
          "focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-accent/35",
          tooLong && "border-danger focus-within:border-danger focus-within:outline-danger/35",
        )}
      >
        <label htmlFor={inputId} className="sr-only">
          Your question for Claude
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Claude is not connected yet" : "Ask about this set"}
          disabled={disabled}
          enterKeyHint="send"
          autoComplete="off"
          spellCheck
          aria-describedby={`${hintId}${length >= COUNTER_FROM ? ` ${counterId}` : ""}`}
          aria-invalid={tooLong || undefined}
          className={cn(
            "max-h-48 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-base leading-normal text-ink",
            "placeholder:text-ink-placeholder sm:text-[0.9375rem]",
            "focus-visible:outline-none disabled:cursor-not-allowed",
          )}
        />
        {/* Keyed so Stop and Send are separate elements: a click on Stop must
            not turn into a submit when the button swaps mid-click. */}
        {busy ? (
          <Button
            key="stop"
            type="button"
            variant="secondary"
            size="icon"
            onClick={onStop}
            aria-label="Stop the answer"
            className="size-9"
          >
            <Square className="size-3.5 fill-current" strokeWidth={1.75} aria-hidden />
          </Button>
        ) : (
          <Button
            key="send"
            type="submit"
            size="icon"
            disabled={!canSend}
            aria-label="Send question"
            className="size-9"
          >
            <ArrowUp className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </Button>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-xs text-ink-2">
        <p id={hintId} className={cn("max-sm:sr-only", disabled && "invisible")}>
          Enter to send, Shift+Enter for a new line
        </p>
        {length >= COUNTER_FROM ? (
          <p
            id={counterId}
            className={cn("ml-auto font-mono tabular-nums", tooLong && "text-danger")}
          >
            {length.toLocaleString("en-US")} / {CHAT_MESSAGE_MAX.toLocaleString("en-US")}
            {tooLong ? <span className="sr-only"> characters. Shorten your question to send it.</span> : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
