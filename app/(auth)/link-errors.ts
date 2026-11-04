// Messages for `?error=` codes that /auth/callback and /auth/confirm add when
// an email link can't be used.

export type LinkErrorCode = "link" | "reset_link";

const MESSAGES: Record<LinkErrorCode, string> = {
  link: "That link didn’t work. It may have expired, been used already, or been opened in a different browser. If you were confirming your email, try logging in.",
  reset_link:
    "That reset link didn’t work. It may have expired, been used already, or been opened in a different browser. Ask for a new one below.",
};

export function linkErrorMessage(code: string | undefined): string | null {
  if (code === "link" || code === "reset_link") return MESSAGES[code];
  return null;
}
