// Chat state for one study set, kept outside React so a conversation (and an
// answer that is still streaming) survives the panel closing, reopening, or
// moving between the docked column and the phone sheet. Browser only.
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_MESSAGE_MAX,
  CONTEXT_TRUNCATED_HEADER,
  STOPPED_NOTE,
  splitChatStream,
} from "@/components/chat/chat-protocol";

export type ChatItemState =
  /** Loaded from history or finished normally. */
  | "done"
  /** The answer being written right now. */
  | "streaming"
  /** The student stopped this answer. */
  | "stopped"
  /** Claude declined; content is the friendly line. */
  | "refused"
  /** A question that didn't get an answer (see `error`). */
  | "failed";

export type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  state: ChatItemState;
  /** Why a question failed, shown under it with "Try again". */
  error?: string;
};

export type ChatSnapshot = {
  items: ChatItem[];
  history: "idle" | "loading" | "ready" | "error";
  /** An answer is on its way. */
  busy: boolean;
  /** Waiting for the first words of the answer. */
  waiting: boolean;
  /** Claude has no API key on the server. */
  notConfigured: boolean;
  /** The set's material was cut to fit, and the student hasn't dismissed it. */
  truncated: boolean;
  /** A problem with the last answer that isn't tied to one question. */
  error: string | null;
  /** The composer's text (kept here so it survives the panel closing). */
  draft: string;
  /** Questions asked from elsewhere while an answer was streaming. */
  queued: number;
  /** Polite screen-reader announcement for the latest finished answer. */
  announcement: string;
  /** Bumps on every send, so the list can jump to the bottom. */
  sendCount: number;
};

const INITIAL: ChatSnapshot = {
  items: [],
  history: "idle",
  busy: false,
  waiting: false,
  notConfigured: false,
  truncated: false,
  error: null,
  draft: "",
  queued: 0,
  announcement: "",
  sendCount: 0,
};

const HISTORY_LIMIT = 200;
const FLUSH_MS = 40;
/** Longest answer read out in full by the live region. */
const ANNOUNCE_MAX = 1500;

let localCounter = 0;
function localId(prefix: string): string {
  localCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localCounter}`;
}

/** Rough markdown-to-speech: enough for a screen-reader announcement. */
function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*\|?[-:\s|]+\|[-:\s|]*$/gm, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusMessage(status: number): string {
  if (status === 401) return "Your session ended. Log in again to keep chatting.";
  if (status === 404) return "This study set doesn't exist or isn't yours.";
  if (status === 413 || status === 400) return "That question couldn't be sent. Try a shorter one.";
  if (status === 429) return "Too many questions at once. Wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again.";
  return "Something went wrong. Try again.";
}

const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
const LOST_MESSAGE = "The connection dropped before the answer finished.";

export class ChatStore {
  readonly setId: string;
  private snapshot: ChatSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private historyPromise: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private stopRequested = false;
  private queue: string[] = [];
  private truncatedDismissed = false;

  constructor(setId: string) {
    this.setId = setId;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ChatSnapshot => this.snapshot;

  private set(patch: Partial<ChatSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private patchItem(id: string, patch: Partial<ChatItem>) {
    this.set({
      items: this.snapshot.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  private removeItems(ids: string[]) {
    this.set({ items: this.snapshot.items.filter((item) => !ids.includes(item.id)) });
  }

  /** Loads saved messages once (again after an error when `force`). */
  loadHistory(force = false): Promise<void> {
    if (this.historyPromise && (!force || this.snapshot.history === "loading")) {
      return this.historyPromise;
    }
    if (this.snapshot.history === "ready" && !force) return Promise.resolve();
    // A reload mid-answer would duplicate the question being answered.
    if (this.snapshot.busy && this.snapshot.history === "ready") return Promise.resolve();
    this.set({ history: "loading" });
    const run = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("set_id", this.setId)
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT);
        if (error) throw error;
        const loaded: ChatItem[] = (data ?? [])
          .slice()
          .reverse()
          .map((row) => ({
            id: String(row.id),
            role: row.role === "assistant" ? "assistant" : "user",
            content: String(row.content ?? ""),
            state: "done" as const,
          }));
        // Saved messages come back from the server; keep only local
        // questions that never reached it, so they can still be retried.
        const local = this.snapshot.items.filter((m) => m.state === "failed");
        this.set({ items: [...loaded, ...local], history: "ready" });
      } catch {
        this.historyPromise = null;
        this.set({ history: "error" });
      }
    };
    this.historyPromise = run();
    return this.historyPromise;
  }

  setDraft = (draft: string) => {
    this.set({ draft });
  };

  dismissError = () => {
    this.set({ error: null });
  };

  dismissTruncated = () => {
    this.truncatedDismissed = true;
    this.set({ truncated: false });
  };

  /** Sends a question, or queues it while another answer is streaming. */
  send = (text: string) => {
    const question = text.trim().slice(0, CHAT_MESSAGE_MAX);
    if (!question) return;
    if (this.snapshot.busy) {
      this.queue.push(question);
      this.set({ queued: this.queue.length });
      return;
    }
    void this.run(question);
  };

  /** Removes a failed question and asks it again. */
  retry = (itemId: string) => {
    const item = this.snapshot.items.find((m) => m.id === itemId);
    if (!item || item.state !== "failed" || this.snapshot.busy) return;
    this.removeItems([itemId]);
    this.send(item.content);
  };

  stop = () => {
    if (!this.controller) return;
    this.stopRequested = true;
    this.queue = [];
    this.set({ queued: 0 });
    this.controller.abort();
  };

  /** Deletes every message of this set's chat. Throws on failure. */
  clear = async () => {
    if (this.snapshot.busy) throw new Error("Wait for the answer to finish first.");
    const supabase = createClient();
    const { error } = await supabase.from("chat_messages").delete().eq("set_id", this.setId);
    if (error) throw new Error("Couldn't clear the chat. Try again.");
    this.set({ items: [], error: null, announcement: "Chat cleared." });
  };

  private async run(question: string) {
    const userId = localId("user");
    const answerId = localId("answer");
    const controller = new AbortController();
    this.controller = controller;
    this.stopRequested = false;

    this.set({
      busy: true,
      waiting: true,
      error: null,
      sendCount: this.snapshot.sendCount + 1,
      announcement: "",
    });

    // Never show a question before the history it follows.
    if (this.snapshot.history !== "ready") {
      await this.loadHistory().catch(() => undefined);
    }

    this.set({
      items: [
        ...this.snapshot.items,
        { id: userId, role: "user", content: question, state: "done" },
        { id: answerId, role: "assistant", content: "", state: "streaming" },
      ],
    });

    const restoreDraft = () => {
      if (!this.snapshot.draft.trim()) this.set({ draft: question });
    };

    const failQuestion = (message: string) => {
      this.removeItems([answerId]);
      this.patchItem(userId, { state: "failed", error: message });
      this.set({ announcement: message });
    };

    let raw = "";
    let lostConnection = false;

    try {
      let response: Response;
      try {
        if (this.stopRequested) throw new DOMException("Stopped", "AbortError");
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ setId: this.setId, message: question }),
          signal: controller.signal,
        });
      } catch {
        if (this.stopRequested) {
          this.removeItems([userId, answerId]);
          restoreDraft();
        } else {
          failQuestion(OFFLINE_MESSAGE);
        }
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        if (response.status === 503 && body?.error === "not_configured") {
          this.removeItems([userId, answerId]);
          restoreDraft();
          this.set({ notConfigured: true });
          return;
        }
        failQuestion(body?.message || statusMessage(response.status));
        return;
      }

      this.set({ notConfigured: false });
      if (response.headers.get(CONTEXT_TRUNCATED_HEADER) === "1" && !this.truncatedDismissed) {
        this.set({ truncated: true });
      }

      if (!response.body) {
        failQuestion("Your browser couldn't read the answer. Try again.");
        return;
      }

      // Read the stream, painting at most every FLUSH_MS.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        timer = null;
        const { text } = splitChatStream(raw);
        this.patchItem(answerId, { content: text });
        if (text && this.snapshot.waiting) this.set({ waiting: false });
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          if (!timer) timer = setTimeout(flush, FLUSH_MS);
        }
        raw += decoder.decode();
      } catch {
        if (!this.stopRequested) lostConnection = true;
      } finally {
        if (timer) clearTimeout(timer);
      }

      const { text, control } = splitChatStream(raw);

      if (this.stopRequested) {
        if (text.trim()) {
          this.patchItem(answerId, { content: text + STOPPED_NOTE, state: "stopped" });
          this.set({ announcement: "Answer stopped." });
        } else {
          // Nothing was written: the server drops the question too.
          this.removeItems([userId, answerId]);
          restoreDraft();
        }
        return;
      }

      if (control?.kind === "refusal") {
        this.patchItem(answerId, { content: control.message, state: "refused" });
        this.set({ announcement: control.message });
        return;
      }

      if (!text.trim()) {
        failQuestion(control?.message || (lostConnection ? LOST_MESSAGE : "Claude didn't answer. Try again."));
        return;
      }

      this.patchItem(answerId, { content: text, state: "done" });
      if (control?.kind === "error") {
        this.set({ error: control.message });
      } else if (lostConnection) {
        this.set({ error: `${LOST_MESSAGE} Ask again to get the rest.` });
      }
      const spoken = plainText(text);
      this.set({
        announcement: `Claude answered: ${
          spoken.length > ANNOUNCE_MAX ? `${spoken.slice(0, ANNOUNCE_MAX)}. The rest is in the conversation.` : spoken
        }`,
      });
    } finally {
      if (this.controller === controller) this.controller = null;
      this.stopRequested = false;
      this.set({ busy: false, waiting: false });
      const next = this.queue.shift();
      this.set({ queued: this.queue.length });
      if (next) this.send(next);
    }
  }
}

const stores = new Map<string, ChatStore>();

/** The chat store for a set (one per set per tab). */
export function getChatStore(setId: string): ChatStore {
  let store = stores.get(setId);
  if (!store) {
    store = new ChatStore(setId);
    stores.set(setId, store);
  }
  return store;
}

const serverSnapshot = (): ChatSnapshot => INITIAL;

/** Subscribes a component to a set's chat. */
export function useChatStore(setId: string): { store: ChatStore; snapshot: ChatSnapshot } {
  const store = getChatStore(setId);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  return { store, snapshot };
}
