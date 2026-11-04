// Who may use Mason's Study.
//
// The Supabase project's logins are shared with another app (the Card Doc test
// copy in card-doc-test-temp), and sign-ups can't be turned off for just this
// app. So a valid session is not enough: when ALLOWED_EMAILS is set, only those
// addresses can sign in here, open the app, or spend Claude and YouTube
// credits. Unset (local development) means any account may use it.
//
// Relative-import safe: the Netlify background function bundles this file.

/** The allowed addresses, lowercased, or null when there is no restriction. */
export function allowedEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  const list = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? new Set(list) : null;
}

/** True when this email may use the app. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = allowedEmails();
  if (!allowed) return true;
  return Boolean(email) && allowed.has(String(email).trim().toLowerCase());
}

export const NOT_ALLOWED_MESSAGE = "This account doesn't have access to Mason's Study.";
