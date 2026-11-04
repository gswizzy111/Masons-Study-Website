// POST /api/chat { setId, message }
// Streams the tutor's answer as plain text (see components/chat/chat-protocol.ts
// for the format). Saves the question first and the answer when it ends,
// including a partial answer when the student stops it. Keeps each turn
// under the 60 s function limit: Claude is cut off at ~50 s.
import { after } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { isAllowedEmail, NOT_ALLOWED_MESSAGE } from "@/lib/access";
import {
  AiNotConfiguredError,
  REFUSAL_MESSAGE,
  friendlyAiError,
  getAnthropic,
} from "@/lib/ai/client";
import {
  TUTOR_CONTEXT_MAX_CHARS,
  TUTOR_HISTORY_LIMIT,
  TUTOR_QUESTION_MAX_CHARS,
  buildTutorMessages,
  buildTutorSystem,
  streamTutorReply,
  type TutorTurn,
} from "@/lib/ai/chat";
import { loadSetContext, type SetContext } from "@/lib/ai/set-context";
import { takeQuota } from "@/lib/usage-limits";
import {
  CHAT_CONTROL,
  CONTEXT_TRUNCATED_HEADER,
  CUT_NOTES,
  STOPPED_NOTE,
  formatChatControl,
} from "@/components/chat/chat-protocol";
import type { LearningProfile } from "@/lib/types";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Claude gets until this many ms after the request started. */
const CLAUDE_DEADLINE_MS = 50_000;
/** chat_messages.content allows up to 60000 characters. */
const MAX_SAVED_CHARS = 60_000;

const NO_STORE = { "cache-control": "no-store" };

function fail(status: number, error: string, message: string, retryAfterSeconds?: number) {
  const headers: Record<string, string> = { ...NO_STORE };
  if (retryAfterSeconds) headers["retry-after"] = String(Math.ceil(retryAfterSeconds));
  return Response.json({ error, message }, { status, headers });
}

function parseBody(raw: unknown): { setId: string; message: string } | string {
  if (!raw || typeof raw !== "object") return "Send a JSON body with setId and message.";
  const b = raw as Record<string, unknown>;
  if (typeof b.setId !== "string" || !UUID_RE.test(b.setId)) return "A valid setId is required.";
  if (typeof b.message !== "string") return "Type a question first.";
  const message = b.message.trim();
  if (!message) return "Type a question first.";
  if (message.length > TUTOR_QUESTION_MAX_CHARS) {
    return `Questions can be up to ${TUTOR_QUESTION_MAX_CHARS.toLocaleString("en-US")} characters.`;
  }
  return { setId: b.setId, message };
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "bad_request", "Send a JSON body with setId and message.");
  }
  const parsed = parseBody(raw);
  if (typeof parsed === "string") return fail(400, "bad_request", parsed);
  const { setId, message } = parsed;

  const user = await getUser();
  if (!user) return fail(401, "unauthorized", "Your session ended. Log in again to keep chatting.");
  if (!isAllowedEmail(user.email)) return fail(403, "forbidden", NOT_ALLOWED_MESSAGE);
  const supabase = await createClient();

  // Everything below is read with the user's client, so RLS limits it to
  // their own rows. The set check runs alongside the heavier loads.
  const [setResult, profileResult, historyResult, contextResult] = await Promise.all([
    supabase.from("study_sets").select("id").eq("id", setId).maybeSingle(),
    supabase.from("profiles").select("learning_profile").eq("id", user.id).maybeSingle(),
    supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("set_id", setId)
      .order("created_at", { ascending: false })
      .limit(TUTOR_HISTORY_LIMIT),
    settle(loadSetContext(supabase, setId, { includeGuide: true, maxChars: TUTOR_CONTEXT_MAX_CHARS })),
  ]);

  if (setResult.error) {
    console.error("[chat] set lookup failed", setResult.error.message);
    return fail(500, "server_error", "Couldn't load this study set. Try again.");
  }
  if (!setResult.data) return fail(404, "not_found", "This study set doesn't exist or isn't yours.");
  if (historyResult.error) {
    console.error("[chat] history load failed", historyResult.error.message);
    return fail(500, "server_error", "Couldn't load the chat history. Try again.");
  }
  if (!contextResult.ok) {
    console.error("[chat] context load failed", contextResult.error);
    return fail(500, "server_error", "Couldn't load this set's material. Try again.");
  }
  const context: SetContext = contextResult.value;
  const profile = (profileResult.data?.learning_profile ?? null) as LearningProfile | null;

  let anthropic: ReturnType<typeof getAnthropic>;
  try {
    anthropic = getAnthropic();
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
    }
    throw error;
  }

  if (request.signal.aborted) return new Response(null, { status: 499 });

  // Per-user limit on tutor turns (each one sends the set's material).
  const quota = await takeQuota(supabase, "chat");
  if (!quota.ok) {
    const code = quota.status === 429 ? "rate_limited" : "unavailable";
    return fail(quota.status, code, quota.message, quota.retryAfterSeconds);
  }

  const history: TutorTurn[] = (historyResult.data ?? [])
    .slice()
    .reverse()
    .map((row) => ({ role: row.role as TutorTurn["role"], content: String(row.content ?? "") }));

  const { data: inserted, error: insertError } = await supabase
    .from("chat_messages")
    .insert({ set_id: setId, role: "user", content: message })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error("[chat] saving the question failed", insertError?.message);
    return fail(500, "server_error", "Couldn't save your question. Try again.");
  }
  const questionId = inserted.id as string;

  // One controller for every way the answer can end early: the student
  // pressed Stop or left (request aborted / stream cancelled) or time ran out.
  const abort = new AbortController();
  let timedOut = false;
  const onClientAbort = () => abort.abort();
  request.signal.addEventListener("abort", onClientAbort);
  const deadline = setTimeout(
    () => {
      timedOut = true;
      abort.abort();
    },
    Math.max(1_000, CLAUDE_DEADLINE_MS - (Date.now() - startedAt)),
  );

  const claude = streamTutorReply({
    client: anthropic,
    system: buildTutorSystem(profile, context),
    messages: buildTutorMessages(history, message),
    signal: abort.signal,
  });

  // Keep the function alive until the answer is saved, even after the
  // student disconnects.
  let markFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    markFinished = resolve;
  });
  after(() => finished);

  async function saveAnswer(content: string) {
    const { error } = await supabase
      .from("chat_messages")
      .insert({ set_id: setId, role: "assistant", content: content.slice(0, MAX_SAVED_CHARS) });
    if (error) console.error("[chat] saving the answer failed", error.message);
  }

  async function dropQuestion() {
    // No answer to keep: remove the question so a retry doesn't duplicate it.
    const { error } = await supabase.from("chat_messages").delete().eq("id", questionId);
    if (error) console.error("[chat] removing the unanswered question failed", error.message);
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (chunk: string) => {
        if (!open || !chunk) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };

      let text = "";
      let stopReason: string | null = null;
      let failure: unknown = null;

      try {
        // Iterating attaches the listener synchronously, so no event is missed.
        for await (const event of claude) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const delta = event.delta.text.replaceAll(CHAT_CONTROL, "");
            text += delta;
            send(delta);
          } else if (event.type === "message_delta") {
            stopReason = event.delta.stop_reason ?? stopReason;
          }
        }
      } catch (error) {
        failure = error;
      } finally {
        clearTimeout(deadline);
        request.signal.removeEventListener("abort", onClientAbort);
      }

      try {
        // Only an interrupted stream counts as stopped or timed out; a
        // disconnect after the last event still saves the whole answer.
        const interrupted = failure !== null && abort.signal.aborted;
        const stoppedByStudent = interrupted && !timedOut;

        if (stopReason === "refusal") {
          // Claude and its fallback declined. Drop any partial text. The
          // exchange is saved so the student sees it, but buildTutorMessages
          // never sends a declined exchange to Claude again.
          send(formatChatControl("refusal", REFUSAL_MESSAGE));
          await saveAnswer(REFUSAL_MESSAGE);
        } else if (stoppedByStudent) {
          if (text.trim()) await saveAnswer(text + STOPPED_NOTE);
          else await dropQuestion();
        } else if (interrupted && timedOut) {
          if (text.trim()) {
            send(CUT_NOTES.timeout);
            await saveAnswer(text + CUT_NOTES.timeout);
          } else {
            send(formatChatControl("error", "Claude took too long to answer. Try again."));
            await dropQuestion();
          }
        } else if (failure) {
          console.error(
            "[chat] Claude stream failed:",
            failure instanceof Error ? `${failure.name}: ${failure.message}` : failure,
          );
          if (text.trim()) {
            send(CUT_NOTES.error);
            send(formatChatControl("error", friendlyAiError(failure)));
            await saveAnswer(text + CUT_NOTES.error);
          } else {
            send(formatChatControl("error", friendlyAiError(failure)));
            await dropQuestion();
          }
        } else if (!text.trim()) {
          send(formatChatControl("error", "Claude didn't write an answer. Try asking again."));
          await dropQuestion();
        } else if (stopReason === "max_tokens") {
          send(CUT_NOTES.max_tokens);
          await saveAnswer(text + CUT_NOTES.max_tokens);
        } else {
          await saveAnswer(text);
        }
      } catch (error) {
        console.error("[chat] finishing the answer failed", error);
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed or cancelled by the student.
          }
        }
        markFinished();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
    "x-content-type-options": "nosniff",
  };
  if (context.truncated) headers[CONTEXT_TRUNCATED_HEADER.toLowerCase()] = "1";

  return new Response(body, { headers });
}
