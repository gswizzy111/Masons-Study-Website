// Plain-language messages for Supabase Auth errors. Pure.
import type { AuthError } from "@supabase/supabase-js";

export const GENERIC_AUTH_ERROR = "Something went wrong on our side. Try again in a moment.";
export const RATE_LIMIT_ERROR = "Too many tries in a short time. Wait a minute, then try again.";

/** A friendly message for an auth error, or the fallback. */
export function authErrorMessage(error: AuthError | null | undefined, fallback = GENERIC_AUTH_ERROR): string {
  if (!error) return fallback;
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don’t match. Check them and try again.";
    case "email_not_confirmed":
      return "Confirm your email first. Open the link we sent you, then log in.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Log in instead.";
    case "weak_password":
      return "Choose a stronger password: longer, and harder to guess.";
    case "same_password":
      return "Your new password has to be different from the current one.";
    case "email_address_invalid":
      return "That email address can’t be used. Try another one.";
    case "signup_disabled":
      return "New accounts are turned off right now.";
    case "user_banned":
      return "This account can’t sign in right now.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return RATE_LIMIT_ERROR;
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return "For security, log out and log back in, then change your password.";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "Your session ended. Log in again to continue.";
    default:
      break;
  }
  if (error.status === 429) return RATE_LIMIT_ERROR;
  return fallback;
}
