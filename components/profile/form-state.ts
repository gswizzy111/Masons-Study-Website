// Shared form state and validation for the auth, onboarding and settings
// forms. Pure: used by Client Components and by Server Actions.

/** What a form's Server Action returns to `useActionState`. */
export type FormState<F extends string = string> = {
  status: "idle" | "error" | "success";
  /** Form-level message (error or confirmation). */
  message?: string;
  /** Machine-readable reason, when the UI needs to act on it. */
  code?: string;
  /** Inline errors, keyed by field name. */
  fieldErrors?: Partial<Record<F, string>>;
  /** Submitted values to put back in the form (never passwords). */
  values?: Partial<Record<F, string>>;
  /** Set on every completed submit, so effects can react to each one. */
  at?: number;
};

export const IDLE: FormState = { status: "idle" };

export const PASSWORD_MIN = 8;
/** Supabase rejects passwords over 72 bytes (bcrypt). */
export const PASSWORD_MAX = 72;
export const NAME_MAX = 80;
export const NOTES_MAX = 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function validateEmail(email: string): string | undefined {
  const v = email.trim();
  if (!v) return "Enter your email.";
  if (!EMAIL_RE.test(v)) return "Enter an email like name@example.com.";
  return undefined;
}

export function validatePassword(password: string, label = "password"): string | undefined {
  if (!password) return `Enter a ${label}.`;
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `Use ${PASSWORD_MAX} characters or fewer.`;
  }
  return undefined;
}

export function validateDisplayName(name: string): string | undefined {
  const v = name.trim();
  if (!v) return "Enter your name.";
  if (v.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters or fewer.`;
  return undefined;
}

/** Drops undefined entries; returns null when there are no errors. */
export function collectErrors<F extends string>(
  errors: Partial<Record<F, string | undefined>>,
): Partial<Record<F, string>> | null {
  const out: Partial<Record<F, string>> = {};
  let any = false;
  for (const key of Object.keys(errors) as F[]) {
    const value = errors[key];
    if (value) {
      out[key] = value;
      any = true;
    }
  }
  return any ? out : null;
}
