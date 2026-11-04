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
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ setId, children }: { setId: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  // The ref makes takePendingQuestion() hand a question out only once, even
  // if effects run twice (Strict Mode) before the state update lands.
  const pendingRef = useRef<{ setId: string; question: string } | null>(null);

  // A different set: drop anything queued for the previous one.
  const [currentSetId, setCurrentSetId] = useState(setId);
  if (currentSetId !== setId) {
    setCurrentSetId(setId);
    setPendingQuestion(null);
  }

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const ask = useCallback((text: string) => {
    const question = text.trim();
    setIsOpen(true);
    if (!question) return;
    pendingRef.current = { setId, question };
    setPendingQuestion(question);
  }, [setId]);

  const takePendingQuestion = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return null;
    setPendingQuestion(null);
    // Never send a question that was asked in another set.
    return pending.setId === setId ? pending.question : null;
  }, [setId]);

  const value = useMemo<ChatContextValue>(
    () => ({ setId, isOpen, open, close, toggle, ask, pendingQuestion, takePendingQuestion }),
    [setId, isOpen, open, close, toggle, ask, pendingQuestion, takePendingQuestion],
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
