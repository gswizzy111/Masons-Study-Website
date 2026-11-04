"use client";

// Shared state for the "Ask Claude" tutor panel of one study set.
// Anything inside a set (guide, flashcards, Learn) can call `ask(text)`: it
// opens the panel and queues the question; ChatPanel takes it with
// `takePendingQuestion()` and sends it.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ChatContextValue = {
  /** The study set this chat belongs to. */
  setId: string;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Open the panel and queue `text` for the panel to send. */
  ask: (text: string) => void;
  /** The queued question, if any (re-renders when it changes). */
  pendingQuestion: string | null;
  /** Returns the queued question and clears it, so it is sent exactly once. */
  takePendingQuestion: () => string | null;
  /**
   * The element that had focus when the panel last opened (the button that
   * opened it), handed out once so closing the panel can put focus back.
   * Null when nothing was focused (e.g. Safari doesn't focus clicked buttons).
   */
  takeOpener: () => HTMLElement | null;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ setId, children }: { setId: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  // The ref makes takePendingQuestion() hand a question out only once, even
  // if effects run twice (Strict Mode) before the state update lands.
  const pendingRef = useRef<{ setId: string; question: string } | null>(null);
  // Mirrors isOpen for the callbacks below, and remembers who opened the panel.
  const isOpenRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);

  // A different set: drop anything queued for the previous one.
  const [currentSetId, setCurrentSetId] = useState(setId);
  if (currentSetId !== setId) {
    setCurrentSetId(setId);
    setPendingQuestion(null);
  }

  // Called from event handlers before the panel opens, while focus is still
  // on the button that was used.
  const setOpen = useCallback((next: boolean) => {
    if (next && !isOpenRef.current) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    isOpenRef.current = next;
    setIsOpen(next);
  }, []);

  const open = useCallback(() => setOpen(true), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen(!isOpenRef.current), [setOpen]);

  const takeOpener = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    return opener;
  }, []);

  const ask = useCallback((text: string) => {
    const question = text.trim();
    setOpen(true);
    if (!question) return;
    pendingRef.current = { setId, question };
    setPendingQuestion(question);
  }, [setId, setOpen]);

  const takePendingQuestion = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return null;
    setPendingQuestion(null);
    // Never send a question that was asked in another set.
    return pending.setId === setId ? pending.question : null;
  }, [setId]);

  const value = useMemo<ChatContextValue>(
    () => ({ setId, isOpen, open, close, toggle, ask, pendingQuestion, takePendingQuestion, takeOpener }),
    [setId, isOpen, open, close, toggle, ask, pendingQuestion, takePendingQuestion, takeOpener],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** The chat state. Throws outside a ChatProvider. */
export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error("useChat() must be used inside <ChatProvider>.");
  }
  return value;
}

/** The chat state, or null outside a ChatProvider (for optional "Ask Claude" buttons). */
export function useOptionalChat(): ChatContextValue | null {
  return useContext(ChatContext);
}
