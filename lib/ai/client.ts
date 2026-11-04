// Shared Claude client and helpers. See docs/ARCHITECTURE.md section 7.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
//
// Every request goes through `client.beta.messages` with
//   betas: [FALLBACK_BETA], fallbacks: "default"
// so a policy decline (biology can trip the bio classifier) is retried on a
// fallback model inside the same call. Always check `isRefusal(message)`
// before reading content.
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "../env";

/** The model for every call. `ANTHROPIC_MODEL`, or `claude-opus-5-5`. */
export const MODEL: string = serverEnv().anthropicModel;

/** Beta header that enables `fallbacks: "default"` (server-side refusal fallback). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Shown when ANTHROPIC_API_KEY is missing. */
export const AI_NOT_CONFIGURED_MESSAGE =
  "Claude is not connected yet. Add ANTHROPIC_API_KEY to turn on AI features.";

/** Shown when Claude (and its fallback) declined a request. */
export const REFUSAL_MESSAGE = "Claude couldn't answer this one. Try rephrasing.";

/** Thrown by getAnthropic() when no API key is configured. */
export class AiNotConfiguredError extends Error {
  constructor(message: string = AI_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Thrown when a response ends with stop_reason "refusal". */
export class AiRefusalError extends Error {
  /** Policy category from stop_details ("bio", "cyber", ...), or null. */
  readonly category: string | null;

  constructor(message: string = REFUSAL_MESSAGE, category: string | null = null) {
    super(message);
    this.name = "AiRefusalError";
    this.category = category;
  }
}

let client: Anthropic | null = null;
let clientKey: string | null = null;

/**
 * The shared Anthropic client. Throws AiNotConfiguredError without
 * ANTHROPIC_API_KEY. ANTHROPIC_BASE_URL is honored by the SDK.
 */
export function getAnthropic(): Anthropic {
  const apiKey = serverEnv().anthropicApiKey;
  if (!apiKey) throw new AiNotConfiguredError();
  if (!client || clientKey !== apiKey) {
    // Pass the key explicitly so the SDK never falls back to other
    // credential sources (profiles on disk) on a server.
    client = new Anthropic({ apiKey, maxRetries: 2 });
    clientKey = apiKey;
  }
  return client;
}

type MessageLike = {
  stop_reason?: string | null;
  stop_details?: { category?: string | null } | null;
  content?: ReadonlyArray<{ type: string }> | null;
};

/** True when the response was declined (check before reading content). */
export function isRefusal(message: MessageLike | null | undefined): boolean {
  return message?.stop_reason === "refusal";
}

/** The refusal category ("bio", "cyber", ...) or null. */
export function refusalCategory(message: MessageLike | null | undefined): string | null {
  return message?.stop_details?.category ?? null;
}

/** Throws AiRefusalError when the response was declined. */
export function assertNotRefused(message: MessageLike | null | undefined): void {
  if (isRefusal(message)) throw new AiRefusalError(REFUSAL_MESSAGE, refusalCategory(message));
}

/**
 * All text blocks of a response joined in order. After a mid-stream fallback
 * the partial text and the fallback model's continuation join into one answer.
 * Returns "" for a refusal; check `isRefusal` first to tell the two apart.
 */
export function textOf(message: MessageLike | null | undefined): string {
  if (!message || isRefusal(message)) return "";
  let out = "";
  for (const block of message.content ?? []) {
    const text = (block as { type: string; text?: unknown }).text;
    if (block.type === "text" && typeof text === "string") out += text;
  }
  return out;
}

/**
 * A short, friendly message for any error from a Claude call, safe to show
 * to the student (never includes keys or raw API bodies).
 */
export function friendlyAiError(error: unknown): string {
  if (error instanceof AiNotConfiguredError) return error.message;
  if (error instanceof AiRefusalError) return error.message;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "Claude rejected the API key. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude is busy right now. Try again in a minute.";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "Claude took too long to answer. Try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Claude. Check the connection and try again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "Claude couldn't process that request. Try a shorter question or less material.";
  }
  if (error instanceof Anthropic.APIError && typeof error.status === "number" && error.status >= 500) {
    return "Claude is having trouble right now. Try again in a minute.";
  }
  return "Something went wrong talking to Claude. Try again.";
}
